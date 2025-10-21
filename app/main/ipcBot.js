import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import keytar from 'keytar';
import { Telegraf } from 'telegraf';
import { bootstrap as bootstrapGlobalAgent } from 'global-agent';
import { createBriefSurvey, summarizeAnswers, buildExecutionPlan } from '../services/tg-bot/survey.js';
import { createEntityStore } from '../core/storage/entityStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
void __dirname;
const { ipcMain } = electron;
let entityStore;

function getEntityStore() {
  if (!entityStore) {
    entityStore = createEntityStore();
  }

  return entityStore;
}

const KEYTAR_SERVICE = 'AgentFlow Desktop';
const KEYTAR_ACCOUNT = 'telegram.bot.token';
const LOG_FILE_NAME = 'telegram-bot.jsonl';
const CONFIG_FILE_NAME = 'telegram.json';
const NETWORK_CONFIG_FILE_NAME = 'network.json';
const TELEGRAM_TOKEN_ENV = 'TELEGRAM_BOT_TOKEN';
const BOT_HANDLER_TIMEOUT = 30_000;
const BOT_LAUNCH_TIMEOUT_MS = 10_000;
const USERNAME_RESOLVE_TIMEOUT_MS = 8_000;

const BOT_STATUS = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  ERROR: 'error'
};

const BOT_STATUS_CHANNEL = 'bot:status:changed';

const TELEGRAM_CHANNELS = [
  'bot:start',
  'bot:stop',
  'bot:status',
  'bot:setToken',
  'bot:tailLog',
  'bot:getProxy',
  'bot:setProxy'
];
const LEGACY_TELEGRAM_CHANNELS = [
  'AgentFlow:bot:start',
  'AgentFlow:bot:stop',
  'AgentFlow:bot:status',
  'AgentFlow:bot:setToken',
  'AgentFlow:bot:tailLog',
  'AgentFlow:bot:getProxy',
  'AgentFlow:bot:setProxy'
];
const BRIEF_CHANNELS = ['AgentFlow:briefs:latest', 'AgentFlow:briefs:plan'];
const CONTACT_CHANNELS = [
  'AgentFlow:telegram:contacts:list',
  'AgentFlow:telegram:contacts:save',
  'AgentFlow:telegram:sendInvite'
];
const ALL_CHANNELS = [
  ...new Set([...TELEGRAM_CHANNELS, ...LEGACY_TELEGRAM_CHANNELS, ...BRIEF_CHANNELS, ...CONTACT_CHANNELS])
];

const SENSITIVE_KEYS = new Set(['token', 'apikey', 'api_key', 'secret', 'password', 'authorization']);

const state = {
  status: BOT_STATUS.STOPPED,
  lastError: null,
  updatedAt: null,
  tokenStored: false,
  tokenSource: null,
  startedAt: null,
  lastActivityAt: null,
  username: null
};

let mainWindowRef = null;
let depsRef = null;
let loggerRef = createLoggerFacade(console);
let logFilePath = null;
let configFilePath = null;
let networkConfigPath = null;
let keytarUnavailable = false;
let handlersRegistered = false;
let botInstance = null;
let botLaunchPromise = null;
let launchingBot = null;
let launchAbortReason = null;
let proxyBootstrapped = false;
let networkConfig = {
  httpsProxy: '',
  httpProxy: ''
};
const sessions = new Map();
const SURVEY_MIN_LENGTH = 5;
const LOG_TAIL_LIMIT_MAX = 200;

function createLoggerFacade(candidate) {
  const fallback = console;

  return {
    info(...args) {
      if (candidate?.info) {
        return candidate.info(...args);
      }

      return fallback.info(...args);
    },
    warn(...args) {
      if (candidate?.warn) {
        return candidate.warn(...args);
      }

      return fallback.warn(...args);
    },
    error(...args) {
      if (candidate?.error) {
        return candidate.error(...args);
      }

      return fallback.error(...args);
    },
    capture(...args) {
      if (candidate?.capture) {
        return candidate.capture(...args);
      }

      return fallback.error(...args);
    }
  };
}

function normalizeDeps(deps) {
  if (!deps || typeof deps !== 'object') {
    throw new Error('deps argument is required');
  }

  const {
    appDataDir,
    getDb,
    logger,
    enqueueRendererEvent,
    getMainWindow,
    ...rest
  } = deps;

  if (!appDataDir) {
    throw new Error('deps.appDataDir is required');
  }

  if (typeof getDb !== 'function') {
    throw new Error('deps.getDb must be a function');
  }

  return {
    appDataDir,
    getDb,
    logger: createLoggerFacade(logger),
    enqueueRendererEvent: typeof enqueueRendererEvent === 'function' ? enqueueRendererEvent : null,
    getMainWindow: typeof getMainWindow === 'function' ? getMainWindow : () => mainWindowRef,
    ...rest
  };
}

function getLogger() {
  return loggerRef;
}

function respond(ok, payload = {}) {
  return {
    ok,
    ...payload
  };
}

async function ensureLogDirectory() {
  if (!logFilePath) {
    return;
  }

  const directory = path.dirname(logFilePath);
  await fs.mkdir(directory, { recursive: true });
}

function maskToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const trimmed = token.trim();

  if (trimmed.length <= 4) {
    return '****';
  }

  return `****${trimmed.slice(-4)}`;
}

function sanitizeLogData(value) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogData(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => {
        if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
          if (typeof val === 'string') {
            return [key, maskToken(val)];
          }

          return [key, '[redacted]'];
        }

        return [key, sanitizeLogData(val)];
      })
    );
  }

  return value;
}

async function log(event, data = {}, level = 'info') {
  if (!logFilePath) {
    return;
  }

  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    data: sanitizeLogData(data)
  };

  try {
    await ensureLogDirectory();
    await fs.appendFile(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    console.error('[telegram] Failed to append log entry', error);
  }
}

async function writeTokenFile(token) {
  if (!configFilePath) {
    throw new Error('Telegram configuration path is not configured');
  }

  const directory = path.dirname(configFilePath);
  await fs.mkdir(directory, { recursive: true });

  const payload = {
    token
  };

  await fs.writeFile(configFilePath, JSON.stringify(payload), 'utf8');
}

async function persistToken(token) {
  const trimmed = typeof token === 'string' ? token.trim() : '';

  if (!trimmed) {
    throw new Error('Telegram bot token is required');
  }

  if (!keytarUnavailable) {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, trimmed);
      return 'keytar';
    } catch (error) {
      keytarUnavailable = true;
      getLogger().warn('[telegram] Failed to persist token in keytar, falling back to file storage', {
        message: error?.message
      });
    }
  }

  await writeTokenFile(trimmed);
  return 'file';
}

async function readTokenFromFile() {
  if (!configFilePath) {
    return null;
  }

  try {
    const raw = await fs.readFile(configFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === 'string' && parsed.token.trim() ? parsed.token.trim() : null;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      getLogger().warn('[telegram] Failed to read token from config file', { message: error?.message });
    }

    return null;
  }
}

async function detectStoredToken() {
  if (typeof process.env[TELEGRAM_TOKEN_ENV] === 'string' && process.env[TELEGRAM_TOKEN_ENV].trim()) {
    return { stored: true, source: 'env' };
  }

  if (!keytarUnavailable) {
    try {
      const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);

      if (stored && stored.trim()) {
        return { stored: true, source: 'keytar' };
      }
    } catch (error) {
      keytarUnavailable = true;
      getLogger().warn('[telegram] Failed to read token from keytar', { message: error?.message });
    }
  }

  const fileToken = await readTokenFromFile();
  return { stored: Boolean(fileToken), source: fileToken ? 'file' : null };
}

async function getToken({ allowMissing = false } = {}) {
  const envToken = process.env[TELEGRAM_TOKEN_ENV];
  if (typeof envToken === 'string' && envToken.trim()) {
    return { token: envToken.trim(), source: 'env' };
  }

  if (!keytarUnavailable) {
    try {
      const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      if (stored && stored.trim()) {
        return { token: stored.trim(), source: 'keytar' };
      }
    } catch (error) {
      keytarUnavailable = true;
      getLogger().warn('[telegram] Failed to read token from keytar', { message: error?.message });
    }
  }

  const fileToken = await readTokenFromFile();
  if (fileToken) {
    return { token: fileToken, source: 'file' };
  }

  if (allowMissing) {
    return { token: null, source: null };
  }

  throw new Error('Telegram bot token is not set');
}

function maskProxy(value) {
  if (!value) {
    return null;
  }

  const stringValue = String(value);
  if (stringValue.length <= 4) {
    return '****';
  }

  return `${stringValue.slice(0, 4)}****${stringValue.slice(-2)}`;
}

function setGlobalAgentProxy() {
  if (global.GLOBAL_AGENT) {
    global.GLOBAL_AGENT.HTTPS_PROXY = process.env.HTTPS_PROXY || undefined;
    global.GLOBAL_AGENT.HTTP_PROXY = process.env.HTTP_PROXY || undefined;
  }
}

function applyNetworkConfig(config = {}) {
  const httpsProxy = typeof config?.httpsProxy === 'string' ? config.httpsProxy.trim() : '';
  const httpProxy = typeof config?.httpProxy === 'string' ? config.httpProxy.trim() : '';

  networkConfig = {
    httpsProxy,
    httpProxy
  };

  if (httpsProxy) {
    process.env.HTTPS_PROXY = httpsProxy;
  } else {
    delete process.env.HTTPS_PROXY;
  }

  if (httpProxy) {
    process.env.HTTP_PROXY = httpProxy;
  } else {
    delete process.env.HTTP_PROXY;
  }

  setGlobalAgentProxy();
}

async function loadNetworkConfig() {
  if (!networkConfigPath) {
    return { ...networkConfig };
  }

  try {
    const raw = await fs.readFile(networkConfigPath, 'utf8');
    const parsed = JSON.parse(raw);
    applyNetworkConfig({
      httpsProxy: parsed?.httpsProxy || '',
      httpProxy: parsed?.httpProxy || ''
    });
    await log('network.config.loaded', {
      httpsProxy: maskProxy(networkConfig.httpsProxy),
      httpProxy: maskProxy(networkConfig.httpProxy)
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await log('network.config.read_error', { error: error.message }, 'error');
    }

    applyNetworkConfig({ httpsProxy: '', httpProxy: '' });
  }

  return { ...networkConfig };
}

async function saveNetworkConfig() {
  if (!networkConfigPath) {
    throw new Error('Network configuration path is not configured');
  }

  await fs.mkdir(path.dirname(networkConfigPath), { recursive: true });
  await fs.writeFile(networkConfigPath, JSON.stringify(networkConfig, null, 2), 'utf8');
}

function getStatus() {
  const deeplinkBase = state.username ? `https://t.me/${state.username}` : null;

  return {
    status: state.status,
    running: state.status === BOT_STATUS.RUNNING,
    lastError: state.lastError,
    updatedAt: state.updatedAt,
    tokenStored: state.tokenStored,
    tokenSource: state.tokenSource,
    startedAt: state.startedAt,
    lastActivityAt: state.lastActivityAt,
    username: state.username,
    deeplinkBase
  };
}

function setState(partial) {
  Object.assign(state, partial, { updatedAt: new Date().toISOString() });
}

function emitStatusSnapshot(snapshot, reason) {
  if (!snapshot || typeof snapshot !== 'object') {
    return;
  }

  const payload = reason ? { ...snapshot, reason } : snapshot;
  emitToRenderer(BOT_STATUS_CHANNEL, payload);
}

function updateBotState(partial, options = {}) {
  const { broadcast = true, reason = null } = options;
  const previous = { ...state };

  setState(partial);

  const changed = Object.keys(partial).some((key) => previous[key] !== state[key]);
  const snapshot = getStatus();

  if (broadcast && changed) {
    emitStatusSnapshot(snapshot, reason);
  }

  return snapshot;
}

function withStatusPayload(payload = {}, snapshot = getStatus()) {
  return {
    ...payload,
    status: snapshot,
    state: snapshot
  };
}

function getDbConnection(options) {
  if (!depsRef || typeof depsRef.getDb !== 'function') {
    throw new Error('Database access is not configured');
  }

  return depsRef.getDb(options);
}

function ensureDepsConfigured() {
  if (!depsRef?.appDataDir) {
    throw new Error('Telegram IPC dependencies are not initialized');
  }
}

function sanitizeChatId(chatId) {
  const raw = String(chatId ?? '').trim();

  if (!raw) {
    return 'chat';
  }

  if (/^-?\d+$/.test(raw)) {
    return raw;
  }

  const normalized = raw
    .normalize('NFKD')
    .replace(/[^\w@.:-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return 'chat';
  }

  return normalized;
}

function sanitizeProjectId(projectId) {
  return String(projectId ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_') || 'project';
}

function resolveBriefsDirectory() {
  ensureDepsConfigured();
  return path.join(depsRef.appDataDir, 'briefs');
}

function resolveMetaFilePath(chatId) {
  return path.join(resolveBriefsDirectory(), `meta-${sanitizeChatId(chatId)}.json`);
}

function resolveBriefFilePath(chatId) {
  return path.join(resolveBriefsDirectory(), `brief-${sanitizeChatId(chatId)}.json`);
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function ensureSurveyDefinition(session) {
  if (!Array.isArray(session.survey) || session.survey.length === 0) {
    session.survey = createBriefSurvey();
  }

  if (session.survey.length < SURVEY_MIN_LENGTH) {
    getLogger().warn('[telegram] Survey definition shorter than expected', {
      length: session.survey.length
    });
  }
}

function extractProjectId(text) {
  if (!text) {
    return null;
  }

  const match = text.match(/project=([^\s]+)/i);
  return match ? match[1].trim() : null;
}

function resolveProjectIdFromContext(ctx) {
  let projectId = extractProjectId(ctx?.message?.text);
  const payload = ctx?.startPayload;

  if (!projectId && payload) {
    const normalized = String(payload).trim();
    projectId = extractProjectId(`project=${normalized}`) || normalized || null;
  }

  return projectId ? projectId.trim() : null;
}

function getSession(chatId) {
  return sessions.get(chatId);
}

function formatQuestionPrompt(question, index, total) {
  const header = `Вопрос ${index + 1}/${total}`;
  if (question.hint) {
    return `${header}:\n${question.question}\n\nПодсказка: ${question.hint}`;
  }

  return `${header}:\n${question.question}`;
}

async function persistSessionMeta(session, ctx) {
  try {
    const metaPath = resolveMetaFilePath(session.chatId);
    const payload = {
      chatId: session.chatId,
      projectId: session.projectId,
      createdAt: session.createdAt,
      updatedAt: new Date().toISOString(),
      stepIndex: session.stepIndex,
      answersCount: Object.keys(session.answers ?? {}).length,
      completedAt: session.completedAt ?? null,
      briefPath: session.briefPath ?? null,
      user: ctx?.from
        ? {
            id: ctx.from.id ?? null,
            username: ctx.from.username ?? null,
            firstName: ctx.from.first_name ?? null,
            lastName: ctx.from.last_name ?? null,
            languageCode: ctx.from.language_code ?? null
          }
        : null,
      chat: ctx?.chat
        ? {
            id: ctx.chat.id ?? null,
            type: ctx.chat.type ?? null,
            title: ctx.chat.title ?? null
          }
        : null
    };

    await writeJsonFile(metaPath, payload);
    session.metaPath = metaPath;
  } catch (error) {
    await log('session.meta.error', { error: error.message, chatId: session.chatId }, 'error');
  }
}

function initializeSession(chatId, projectId, ctx) {
  const now = new Date().toISOString();
  const existing = sessions.get(chatId);
  if (existing) {
    const projectChanged = existing.projectId !== projectId;
    existing.projectId = projectId;
    if (projectChanged) {
      existing.answers = {};
      existing.stepIndex = 0;
    }
    if (!existing.createdAt) {
      existing.createdAt = now;
    }
    ensureSurveyDefinition(existing);
    return existing;
  }

  const session = {
    chatId,
    projectId,
    createdAt: now,
    survey: createBriefSurvey(),
    stepIndex: 0,
    answers: {},
    lastQuestionSentAt: null
  };

  ensureSurveyDefinition(session);
  sessions.set(chatId, session);
  return session;
}

async function sendNextSurveyQuestion(session, ctx) {
  ensureSurveyDefinition(session);

  if (session.stepIndex >= session.survey.length) {
    await ctx.reply('Все вопросы уже пройдены. Используйте /finish, чтобы завершить опрос.');
    return;
  }

  const question = session.survey[session.stepIndex];
  const prompt = formatQuestionPrompt(question, session.stepIndex, session.survey.length);
  session.lastQuestionSentAt = new Date().toISOString();
  await ctx.reply(prompt);
  await log('survey.question.sent', {
    chatId: session.chatId,
    projectId: session.projectId,
    questionKey: question.key,
    index: session.stepIndex
  });
}

async function recordSurveyAnswer(session, answer, ctx) {
  ensureSurveyDefinition(session);
  if (session.stepIndex >= session.survey.length) {
    await ctx.reply('Все вопросы уже заполнены. Используйте /finish, чтобы сохранить ответы.');
    return;
  }

  if (!session.lastQuestionSentAt) {
    await ctx.reply('Сначала отправьте /setup, чтобы получить вопросы брифа.');
    return;
  }

  const question = session.survey[session.stepIndex];
  session.answers[question.key] = answer;
  session.stepIndex += 1;
  touchActivity('survey.answer');

  await log('survey.answer.recorded', {
    chatId: session.chatId,
    projectId: session.projectId,
    questionKey: question.key
  });

  updateProjectBriefState(session.projectId, {
    briefStatus: 'collecting',
    briefProgress: computeSurveyProgress(session),
    needsAttention: computeNeedsAttention(session)
  });

  if (session.stepIndex < session.survey.length) {
    await sendNextSurveyQuestion(session, ctx);
  } else {
    await ctx.reply('Отлично! Все ответы заполнены. Используйте /finish, чтобы завершить опрос.');
    await log('survey.completed.pending_finish', {
      chatId: session.chatId,
      projectId: session.projectId
    });
  }
}

async function upsertBriefRecord({ id, projectId, summary, details, createdAt }) {
  const db = getDbConnection();
  const payload = {
    id,
    projectId,
    summary,
    details: JSON.stringify(details),
    createdAt,
    updatedAt: new Date().toISOString()
  };

  try {
    db.prepare(
      `INSERT INTO Briefs (id, projectId, summary, details, createdAt, updatedAt)
       VALUES (@id, @projectId, @summary, @details, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         projectId = excluded.projectId,
         summary = excluded.summary,
         details = excluded.details,
         updatedAt = excluded.updatedAt`
    ).run(payload);
  } finally {
    db.close();
  }
}

function emitBriefUpdate(projectId, briefId) {
  emitToRenderer('brief:updated', { projectId, briefId });
  log('brief.renderer.emitted', { projectId, briefId }).catch(() => {});
}

function emitBriefError(projectId, data = {}) {
  emitToRenderer('brief:error', { projectId, ...data, error: true });
  log('brief.renderer.error', { projectId, ...data }, 'error').catch(() => {});
}

function emitBriefStatusChange(project) {
  if (!project) {
    return;
  }

  const payload = {
    projectId: project.id,
    status: project.briefStatus,
    progress: project.briefProgress,
    briefVersion: project.briefVersion,
    needsAttention: project.needsAttention,
    tgLastInvitation: project.tgLastInvitation,
    tgContactStatus: project.tgContactStatus
  };

  emitToRenderer('brief:statusChanged', payload);
}

function computeSurveyProgress(session) {
  if (!session?.survey?.length) {
    return 0;
  }

  const answered = Math.min(Math.max(session.stepIndex || 0, 0), session.survey.length);
  const progress = answered / session.survey.length;

  if (!Number.isFinite(progress)) {
    return 0;
  }

  if (progress < 0) {
    return 0;
  }

  if (progress > 1) {
    return 1;
  }

  return progress;
}

function computeNeedsAttention(session) {
  if (!session?.survey?.length) {
    return {};
  }

  const missingDetails = session.survey
    .map((question, index) => {
      const value = session.answers?.[question.key];
      const unanswered = typeof value !== 'string' || value.trim().length === 0;

      if (!unanswered) {
        return null;
      }

      return {
        key: question.key,
        question: question.question || null,
        hint: question.hint || null,
        order: index + 1,
        section: question.section || question.sectionId || null
      };
    })
    .filter(Boolean);

  if (missingDetails.length === 0) {
    return {};
  }

  return {
    missingFields: missingDetails.map((item) => item.key),
    pendingCount: missingDetails.length,
    message: 'brief_incomplete',
    details: missingDetails,
    summary:
      missingDetails
        .map((item) => item.question || item.key)
        .filter(Boolean)
        .join('; ') || null,
    updatedAt: new Date().toISOString()
  };
}

function updateProjectBriefState(projectId, updates = {}) {
  if (!projectId) {
    return null;
  }

  try {
    const store = getEntityStore();
    const saved = store.saveProject({ id: projectId, ...updates });
    emitBriefStatusChange(saved);
    return saved;
  } catch (error) {
    log('project.brief.update_error', { projectId, error: error.message }, 'error').catch(() => {});
    getLogger().warn('Failed to update project brief state', {
      projectId,
      message: error?.message
    });
    return null;
  }
}

async function persistBriefArtifacts(session, briefId, summary, details) {
  const completedAt = details.completedAt;
  const briefFilePath = resolveBriefFilePath(session.chatId);
  const filePayload = {
    id: briefId,
    projectId: session.projectId,
    chatId: session.chatId,
    summary,
    answers: session.answers,
    completedAt,
    source: 'telegram'
  };

  await writeJsonFile(briefFilePath, filePayload);
  session.briefPath = briefFilePath;
}

async function finalizeBriefSession(session, ctx) {
  if (!session.projectId) {
    throw new Error('projectId_not_set');
  }

  ensureSurveyDefinition(session);
  if (session.stepIndex < session.survey.length) {
    throw new Error('survey_incomplete');
  }

  const completedAt = new Date().toISOString();
  const summary = summarizeAnswers(session.answers);
  const briefId = `brief_${sanitizeProjectId(session.projectId)}_${Date.now()}`;
  const sanitizedChatId = sanitizeChatId(session.chatId);
  const details = {
    projectId: session.projectId,
    chatId: session.chatId,
    sanitizedChatId,
    answers: session.answers,
    summary,
    completedAt,
    source: 'telegram'
  };

  try {
    await persistBriefArtifacts(session, briefId, summary, details);
    session.completedAt = completedAt;
    session.stepIndex = session.survey.length;
    await upsertBriefRecord({
      id: briefId,
      projectId: session.projectId,
      chatId: sanitizedChatId,
      summary,
      details,
      createdAt: completedAt
    });
  } catch (error) {
    await log(
      'brief.finish.persist_error',
      {
        chatId: session.chatId,
        projectId: session.projectId,
        error: error.message
      },
      'error'
    );
    getLogger().error('Failed to persist Telegram brief', {
      message: error?.message,
      projectId: session.projectId,
      chatId: session.chatId
    });
    emitBriefError(session.projectId, {
      chatId: session.chatId,
      message: error.message
    });
    throw error;
  }

  const needsAttention = computeNeedsAttention(session);
  updateProjectBriefState(session.projectId, {
    briefStatus: 'review',
    briefProgress: 1,
    briefVersion: briefId,
    needsAttention,
    tgContactStatus: 'completed'
  });

  emitBriefUpdate(session.projectId, briefId);
  await persistSessionMeta(session, ctx);
  await log('brief.finish.success', {
    chatId: session.chatId,
    projectId: session.projectId,
    briefId
  });

  sessions.delete(session.chatId);

  await ctx.reply(
    `Бриф сохранён ✅\nID: ${briefId}\nМы уведомили AgentFlow Desktop о новом брифе. Спасибо!`
  );
}

function ensureChatContext(ctx) {
  const chatId = ctx?.chat?.id;
  if (chatId === undefined || chatId === null) {
    throw new Error('chat_unavailable');
  }

  return chatId;
}

async function readLogTail(limit = 20) {
  if (!logFilePath) {
    return [];
  }

  const normalizedLimit =
    Number.isFinite(limit) && !Number.isNaN(limit)
      ? Math.max(1, Math.min(Math.floor(limit), LOG_TAIL_LIMIT_MAX))
      : 20;

  try {
    const raw = await fs.readFile(logFilePath, 'utf8');
    if (!raw) {
      return [];
    }

    const lines = raw
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.length > 0);

    const tail = lines.slice(-normalizedLimit);

    return tail.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { ts: null, level: 'raw', event: 'raw', data: line };
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function handleStartCommand(ctx) {
  touchActivity('command.start');
  const chatId = ensureChatContext(ctx);
  const projectId = resolveProjectIdFromContext(ctx);

  if (!projectId) {
    await ctx.reply('Укажите проект: /start project=PROJECT_ID');
    await log('command.start.missing_project', { chatId });
    return;
  }

  const session = initializeSession(chatId, projectId, ctx);
  session.answers = {};
  session.stepIndex = 0;
  session.completedAt = null;
  session.briefPath = null;
  ensureSurveyDefinition(session);
  updateProjectBriefState(projectId, {
    briefStatus: 'collecting',
    briefProgress: computeSurveyProgress(session),
    needsAttention: computeNeedsAttention(session),
    tgContactStatus: 'collecting'
  });
  await persistSessionMeta(session, ctx);
  await log('command.start.accepted', {
    chatId,
    projectId,
    userId: ctx?.from?.id ?? null
  });

  await ctx.reply(
    `Проект ${projectId} привязан к чату. Используйте /setup, чтобы начать опрос и собрать бриф.`
  );
}

async function handleSetupCommand(ctx) {
  touchActivity('command.setup');
  const chatId = ensureChatContext(ctx);
  const session = getSession(chatId);

  if (!session) {
    await ctx.reply('Сначала привяжите проект: /start project=PROJECT_ID');
    await log('command.setup.no_session', { chatId });
    return;
  }

  if (!session.projectId) {
    await ctx.reply('Проект не привязан. Используйте /start project=PROJECT_ID.');
    await log('command.setup.no_project', { chatId });
    return;
  }

  ensureSurveyDefinition(session);
  await log('command.setup.accepted', {
    chatId,
    projectId: session.projectId
  });
  await persistSessionMeta(session, ctx);
  await ctx.reply('Начинаем бриф. Ответьте на вопросы, чтобы сформировать проектный профиль.');
  await sendNextSurveyQuestion(session, ctx);
}

async function handleFinishCommand(ctx) {
  touchActivity('command.finish');
  const chatId = ensureChatContext(ctx);
  const session = getSession(chatId);

  if (!session) {
    await ctx.reply('Нет активного опроса. Используйте /start project=PROJECT_ID для запуска.');
    await log('command.finish.no_session', { chatId });
    return;
  }

  try {
    await finalizeBriefSession(session, ctx);
  } catch (error) {
    if (error.message === 'survey_incomplete') {
      await ctx.reply('Ещё остались вопросы. Продолжите отвечать и повторите /finish позже.');
      return;
    }

    if (error.message === 'projectId_not_set') {
      await ctx.reply('Проект не указан. Перезапустите с /start project=PROJECT_ID.');
      return;
    }

    await log('brief.finish.error', { chatId, error: error.message }, 'error');
    await ctx.reply('Не удалось завершить бриф. Попробуйте ещё раз позднее.');
  }
}

async function handleTextMessage(ctx) {
  const chatId = ctx?.chat?.id;
  const text = ctx?.message?.text;

  if (!chatId || !text || text.startsWith('/')) {
    return;
  }

  const session = getSession(chatId);
  if (!session) {
    return;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    await ctx.reply('Ответ не должен быть пустым. Попробуйте ещё раз.');
    return;
  }

  await recordSurveyAnswer(session, trimmed, ctx);
  await persistSessionMeta(session, ctx);
}

async function fetchLatestBrief(projectId) {
  if (!projectId) {
    throw new Error('projectId is required');
  }

  const db = getDbConnection({ readonly: true });

  try {
    const statement = db.prepare(
      `SELECT id, projectId, summary, details, createdAt, updatedAt
         FROM Briefs
        WHERE projectId = ?
        ORDER BY datetime(createdAt) DESC
        LIMIT 1`
    );

    const row = statement.get(projectId);

    if (!row) {
      return null;
    }

    let details = row.details;

    if (typeof details === 'string' && details.length) {
      try {
        details = JSON.parse(details);
      } catch (error) {
        details = {};
        getLogger().warn('[telegram] Failed to parse brief details JSON', {
          message: error?.message,
          projectId
        });
      }
    }

    return {
      id: row.id,
      projectId: row.projectId,
      summary: row.summary,
      details: details && typeof details === 'object' ? details : {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  } finally {
    db.close();
  }
}

async function computeBriefPlan(projectId) {
  const brief = await fetchLatestBrief(projectId);

  if (!brief) {
    throw new Error('brief_not_found');
  }

  const plan = buildExecutionPlan(brief.details || {});

  return {
    brief,
    plan
  };
}

function touchActivity(event = 'activity') {
  const timestamp = new Date().toISOString();
  const reason =
    typeof event === 'string' && event.length ? `activity:${event}` : 'activity';
  updateBotState({ lastActivityAt: timestamp }, { reason });
  log('bot.activity', { event, timestamp }).catch(() => {});
}

function registerBotHandlers(bot) {
  bot.start(async (ctx) => {
    await handleStartCommand(ctx);
  });

  bot.command('start', async (ctx) => {
    await handleStartCommand(ctx);
  });

  bot.command('setup', async (ctx) => {
    await handleSetupCommand(ctx);
  });

  bot.command('finish', async (ctx) => {
    await handleFinishCommand(ctx);
  });

  bot.on('text', async (ctx) => {
    await handleTextMessage(ctx);
  });
}

function ensureProxyBootstrap() {
  const httpsProxy = process.env.HTTPS_PROXY || networkConfig.httpsProxy;
  const httpProxy = process.env.HTTP_PROXY || networkConfig.httpProxy;

  if (!httpsProxy && !httpProxy) {
    return;
  }

  if (!proxyBootstrapped) {
    bootstrapGlobalAgent();
    proxyBootstrapped = true;
  }

  setGlobalAgentProxy();

  log('bot.proxy.bootstrap', {
    httpsProxy: maskProxy(httpsProxy),
    httpProxy: maskProxy(httpProxy)
  }).catch(() => {});
}

function mapBotLaunchError(error) {
  const rawMessage = String(error?.message ?? '');
  const messageLower = rawMessage.toLowerCase();
  const code = error?.code ?? error?.statusCode ?? null;

  if (rawMessage === 'bot_token_missing') {
    return { code: 'token_missing', message: 'settings.telegram.errorTokenRequired' };
  }

  if (messageLower.includes('401') || messageLower.includes('unauthorized') || code === 401) {
    return { code: 'auth', message: 'settings.telegram.errorAuth' };
  }

  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    messageLower.includes('timeout') ||
    messageLower.includes('getaddrinfo') ||
    messageLower.includes('network') ||
    messageLower.includes('failed to fetch')
  ) {
    return { code: 'proxy', message: 'settings.telegram.errorProxy' };
  }

  if (!rawMessage) {
    return { code: 'unknown', message: 'settings.telegram.errorUnknown' };
  }

  return { code: 'unknown', message: rawMessage };
}

async function resolveBotUsername(bot, timeoutMs = USERNAME_RESOLVE_TIMEOUT_MS) {
  if (!bot?.telegram || typeof bot.telegram.getMe !== 'function') {
    return { username: null, timedOut: false };
  }

  const timeoutToken = Symbol('username-timeout');

  const result = await Promise.race([
    bot.telegram
      .getMe()
      .then((info) => info?.username ?? null)
      .catch(() => null),
    new Promise((resolve) => {
      setTimeout(() => resolve(timeoutToken), timeoutMs);
    })
  ]);

  if (result === timeoutToken) {
    return { username: null, timedOut: true };
  }

  return { username: result, timedOut: false };
}

async function launchBot(bot, timeoutMs = BOT_LAUNCH_TIMEOUT_MS) {
  if (!bot || typeof bot.launch !== 'function') {
    return { timedOut: false };
  }

  const timeoutToken = Symbol('launch-timeout');
  const launchPromise = bot.launch();

  const result = await Promise.race([
    launchPromise.then(() => ({ timedOut: false, launchPromise })),
    new Promise((resolve) => {
      setTimeout(() => resolve(timeoutToken), timeoutMs);
    })
  ]);

  if (result === timeoutToken) {
    return { timedOut: true, launchPromise };
  }

  return result;
}

async function ensureBot() {
  if (botInstance) {
    return botInstance;
  }

  if (botLaunchPromise) {
    return botLaunchPromise;
  }

  const { token, source } = await getToken();

  if (!token) {
    throw new Error('settings.telegram.errorTokenRequired');
  }

  updateBotState({ tokenStored: true, tokenSource: source, lastError: null }, { reason: 'token:resolved' });
  await log('bot.ensure', { source, maskedToken: maskToken(token) });

  ensureProxyBootstrap();
  launchAbortReason = null;

  const bot = new Telegraf(token, { handlerTimeout: BOT_HANDLER_TIMEOUT });
  launchingBot = bot;

  bot.catch((error, ctx) => {
    const chatId = ctx?.chat?.id ?? null;
    log('bot.error', { error: error.message, chatId }, 'error').catch(() => {});
    getLogger().error('Telegram bot runtime error', {
      message: error?.message,
      chatId
    });
  });

  registerBotHandlers(bot);

  updateBotState({ status: BOT_STATUS.STARTING, lastError: null }, { reason: 'start:launching' });
  await log('bot.launch.attempt', { source });

  botLaunchPromise = (async () => {
    try {
      const launchOutcome = await launchBot(bot);
      if (launchOutcome.timedOut) {
        await log('bot.launch.timeout', { timeoutMs: BOT_LAUNCH_TIMEOUT_MS });
        launchOutcome.launchPromise
          ?.then(() => {
            log('bot.launch.timeout.resolved', { timeoutMs: BOT_LAUNCH_TIMEOUT_MS }).catch(() => {});
          })
          ?.catch((error) => {
            log('bot.launch.timeout.error', { error: error.message }, 'error').catch(() => {});
          });
      }
      const { username, timedOut } = await resolveBotUsername(bot);
      botInstance = bot;
      const startedAt = new Date().toISOString();
      const runningSnapshot = updateBotState(
        {
          status: BOT_STATUS.RUNNING,
          startedAt,
          lastActivityAt: startedAt,
          lastError: null,
          username
        },
        { reason: 'start:running' }
      );
      if (timedOut) {
        await log('bot.launch.username_timeout', { timeoutMs: USERNAME_RESOLVE_TIMEOUT_MS });
      }
      await log('bot.launch.success', {
        username: runningSnapshot.username,
        source
      });
      await log('ipc.bot.start.success', {
        status: runningSnapshot.status,
        username: runningSnapshot.username
      });
      return bot;
    } catch (error) {
      const abortReason = launchAbortReason;
      launchAbortReason = null;
      if (abortReason) {
        await log('bot.launch.aborted', { reason: abortReason, error: error.message || null });
        return null;
      }

      const friendly = mapBotLaunchError(error);
      await log(
        'bot.launch.error',
        {
          error: error.message,
          source,
          friendly: friendly.message,
          code: friendly.code
        },
        'error'
      );
      getLogger().error('Failed to launch Telegram bot', {
        message: error?.message,
        code: friendly.code
      });
      updateBotState(
        {
          status: BOT_STATUS.ERROR,
          lastError: friendly.message,
          username: null
        },
        { reason: 'start:error' }
      );
      try {
        bot.stop('launch-failed');
      } catch (stopError) {
        getLogger().warn('Failed to stop bot after launch error', { message: stopError?.message });
      }
      throw new Error(friendly.message);
    } finally {
      launchingBot = null;
      botLaunchPromise = null;
    }
  })();

  return botLaunchPromise;
}

async function abortLaunchingBot(reason = 'abort-start') {
  if (!launchingBot) {
    return false;
  }

  launchAbortReason = reason;
  const pendingBot = launchingBot;
  launchingBot = null;
  botLaunchPromise = null;

  try {
    await Promise.resolve(pendingBot.stop(reason));
  } catch (error) {
    getLogger().warn('Failed to stop bot during launch', { message: error?.message });
  }

  updateBotState(
    {
      status: BOT_STATUS.STOPPED,
      lastError: null,
      startedAt: null,
      lastActivityAt: null,
      username: null
    },
    { reason: 'stop:aborted-launch' }
  );

  await log('bot.stop.aborted_launch', { reason });
  return true;
}

async function shutdownBot(reason = 'manual stop') {
  if (!botInstance && launchingBot) {
    return abortLaunchingBot(reason);
  }

  if (!botInstance) {
    updateBotState(
      {
        status: BOT_STATUS.STOPPED,
        lastError: null,
        startedAt: null,
        lastActivityAt: null,
        username: null
      },
      { reason: 'stop:idle' }
    );
    return false;
  }

  const bot = botInstance;
  botInstance = null;

  try {
    await Promise.resolve(bot.stop(reason));
    updateBotState(
      {
        status: BOT_STATUS.STOPPED,
        lastError: null,
        startedAt: null,
        lastActivityAt: null,
        username: null
      },
      { reason: 'stop:completed' }
    );
    await log('bot.stop.invoked', { reason });
    return true;
  } catch (error) {
    updateBotState(
      {
        status: BOT_STATUS.ERROR,
        lastError: error.message
      },
      { reason: 'stop:error' }
    );
    await log('bot.stop.error', { error: error.message, reason }, 'error');
    throw error;
  }
}

const handleStart = async () => {
  await log('ipc.bot.start.intent', { status: state.status });

  let tokenCheck;
  try {
    tokenCheck = await getToken({ allowMissing: true });
  } catch (error) {
    const message = error?.message || 'settings.telegram.errorUnknown';
    updateBotState({ status: BOT_STATUS.ERROR, lastError: message }, { reason: 'start:token-error' });
    await log('ipc.bot.start.error', { error: message, code: 'token_lookup' }, 'error');
    getLogger().error('Failed to resolve Telegram bot token', { message: error?.message });
    return respond(false, withStatusPayload({ error: message }));
  }

  if (!tokenCheck?.token) {
    const message = 'settings.telegram.errorTokenRequired';
    updateBotState({ status: BOT_STATUS.ERROR, lastError: message }, { reason: 'start:missing-token' });
    await log('ipc.bot.start.error', { error: 'token-missing', friendly: message, code: 'token_missing' }, 'error');
    return respond(false, withStatusPayload({ error: message }));
  }

  ensureBot().catch(async (error) => {
    const friendly = mapBotLaunchError(error);
    await log(
      'ipc.bot.start.error',
      { error: error.message, friendly: friendly.message, code: friendly.code },
      'error'
    );
    getLogger().error('Failed to start Telegram bot', {
      message: error?.message,
      code: friendly.code
    });
    return null;
  });

  const snapshot = getStatus();
  await log('ipc.bot.start.enqueued', {
    status: snapshot.status,
    username: snapshot.username
  });
  return respond(true, withStatusPayload({}, snapshot));
};

const handleStop = async () => {
  await log('ipc.bot.stop.intent', { status: state.status });
  try {
    const stopped = await shutdownBot('ipc-stop');
    const snapshot = getStatus();
    if (stopped) {
      await log('ipc.bot.stop.success', { reason: 'ipc-stop' });
    } else {
      await log('ipc.bot.stop.skip', { reason: 'not-running' });
    }
    return respond(true, withStatusPayload({}, snapshot));
  } catch (error) {
    await log('ipc.bot.stop.error', { error: error.message }, 'error');
    getLogger().error('Failed to stop Telegram bot', { message: error?.message });
    return respond(false, withStatusPayload({ error: error.message }));
  }
};

const handleStatus = async () => respond(true, withStatusPayload());

const handleSetToken = async (_event, token) => {
  await log('ipc.bot.token.intent', { hasToken: Boolean(token) });
  try {
    const storage = await persistToken(token);
    updateBotState(
      { tokenStored: true, tokenSource: storage, lastError: null },
      { reason: 'token:set' }
    );
    await log('bot.token.set', { storage, token: maskToken(token) });
    if (state.status === BOT_STATUS.RUNNING) {
      await shutdownBot('token-updated');
    }
    return respond(true, withStatusPayload({ storage }));
  } catch (error) {
    const snapshot = updateBotState({ lastError: error.message }, { reason: 'token:error' });
    await log('bot.token.error', { error: error.message }, 'error');
    getLogger().error('Failed to persist Telegram bot token', { message: error?.message });
    return respond(false, withStatusPayload({ error: error.message }, snapshot));
  }
};

const handleBriefLatest = async (_event, projectId) => {
  try {
    const brief = await fetchLatestBrief(projectId);
    return respond(true, { brief });
  } catch (error) {
    await log('brief.latest.error', { projectId, error: error.message }, 'error');
    getLogger().error('Failed to fetch latest brief', { message: error?.message, projectId });
    return respond(false, { error: error.message });
  }
};

const handleBriefPlan = async (_event, projectId) => {
  try {
    const result = await computeBriefPlan(projectId);
    return respond(true, result);
  } catch (error) {
    await log('brief.plan.error', { projectId, error: error.message }, 'error');
    getLogger().error('Failed to generate brief plan', { message: error?.message, projectId });
    return respond(false, { error: error.message });
  }
};

const handleTailLog = async (_event, options = {}) => {
  const limit = Number.isFinite(options?.limit) ? options.limit : 20;

  try {
    const lines = await readLogTail(limit);
    return respond(true, { lines });
  } catch (error) {
    await log('bot.tail.error', { error: error.message }, 'error');
    getLogger().error('Failed to read Telegram log tail', { message: error?.message });
    return respond(false, { error: error.message });
  }
};

const handleGetProxy = async () => {
  return respond(true, { config: { ...networkConfig } });
};

const handleSetProxy = async (_event, payload = {}) => {
  try {
    const httpsProxy =
      typeof payload?.httpsProxy === 'string' ? payload.httpsProxy.trim() : '';
    const httpProxy = typeof payload?.httpProxy === 'string' ? payload.httpProxy.trim() : '';

    applyNetworkConfig({ httpsProxy, httpProxy });
    await saveNetworkConfig();
    ensureProxyBootstrap();
    await log('network.config.updated', {
      httpsProxy: maskProxy(networkConfig.httpsProxy),
      httpProxy: maskProxy(networkConfig.httpProxy)
    });

    return respond(true, { config: { ...networkConfig } });
  } catch (error) {
    await log('network.config.error', { error: error.message }, 'error');
    return respond(false, { error: error.message });
  }
};

function formatContact(contact) {
  if (!contact) {
    return null;
  }

  return {
    id: contact.id,
    chatId: contact.chatId,
    label: contact.label,
    status: contact.status,
    lastContactAt: contact.lastContactAt,
    projectId: contact.projectId,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt
  };
}

async function sendProjectInvite(_projectId, _chatId, _options = {}) {
  const projectId = sanitizeProjectId(_projectId);
  const chatIdRaw = _chatId ?? '';
  const options = _options || {};

  if (!projectId) {
    const error = new Error('projectId is required');
    error.code = 'PROJECT_ID_REQUIRED';
    throw error;
  }

  if (!chatIdRaw) {
    const error = new Error('chatId is required');
    error.code = 'CHAT_ID_REQUIRED';
    throw error;
  }

  ensureDepsConfigured();

  const store = getEntityStore();
  const project = store.getProjectById(projectId);

  if (!project) {
    const error = new Error(`Project ${projectId} not found`);
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }

  const bot = await ensureBot();

  if (!bot || !bot.telegram) {
    const error = new Error('Telegram bot is not running');
    error.code = 'BOT_NOT_RUNNING';
    throw error;
  }

  const baseCandidates = [];
  const statusSnapshot = getStatus();

  if (typeof options.linkBase === 'string' && options.linkBase.trim()) {
    baseCandidates.push(options.linkBase.trim());
  }

  if (typeof project.tgLinkBase === 'string' && project.tgLinkBase.trim()) {
    baseCandidates.push(project.tgLinkBase.trim());
  }

  if (typeof statusSnapshot.deeplinkBase === 'string' && statusSnapshot.deeplinkBase.trim()) {
    baseCandidates.push(statusSnapshot.deeplinkBase.trim());
  }

  const resolvedBase = baseCandidates.find((candidate) => candidate.length > 0) || null;

  if (!resolvedBase) {
    const error = new Error('Telegram deeplink is not available');
    error.code = 'DEEPLINK_UNAVAILABLE';
    throw error;
  }

  const startPayload = options.startPayload || `project_${projectId}`;

  let inviteLink;

  try {
    const baseUrl = resolvedBase.startsWith('http') ? resolvedBase : `https://t.me/${resolvedBase.replace(/^@/, '')}`;
    const url = new URL(baseUrl);
    url.searchParams.set('start', startPayload);
    inviteLink = url.toString();
  } catch {
    const separator = resolvedBase.includes('?') ? '&' : '?';
    inviteLink = `${resolvedBase}${separator}start=${encodeURIComponent(startPayload)}`;
  }

  const projectName = project.name || project.id || 'project';
  const command = `/start project=${projectId}`;
  const message =
    options.message ||
    `Здравствуйте! Чтобы заполнить бриф для проекта "${projectName}", перейдите по ссылке ${inviteLink} и отправьте команду ${command}.`;

  const numericChatId = Number(chatIdRaw);
  const targetChatId = Number.isFinite(numericChatId) && !Number.isNaN(numericChatId) ? numericChatId : chatIdRaw;

  try {
    await bot.telegram.sendMessage(targetChatId, message);
  } catch (error) {
    await log(
      'telegram.invite.send_error',
      {
        projectId,
        chatId: sanitizeChatId(chatIdRaw),
        rawChatId: chatIdRaw,
        error: error.message
      },
      'error'
    );
    const fallbackMessage = 'Failed to send Telegram invite';
    const friendlyMessage = typeof error?.message === 'string' && error.message ? error.message : fallbackMessage;
    const friendly = new Error(friendlyMessage);
    friendly.code = 'TELEGRAM_SEND_FAILED';

    if (typeof error?.message === 'string' && /chat not found/i.test(error.message)) {
      friendly.message =
        'Telegram could not find the specified chat. Make sure the bot is not blocked and that the contact has started a conversation with it or provide a numeric chat ID.';
    }

    throw friendly;
  }

  const now = new Date().toISOString();
  const sanitizedChatId = sanitizeChatId(chatIdRaw);

  store.saveTelegramContact({
    chatId: chatIdRaw,
    projectId,
    status: 'invited',
    lastContactAt: now
  });

  updateProjectBriefState(projectId, {
    tgLastInvitation: now,
    tgContactStatus: 'invited'
  });

  await log('telegram.invite.sent', {
    projectId,
    chatId: sanitizedChatId,
    rawChatId: chatIdRaw,
    link: inviteLink
  });

  return {
    projectId,
    chatId: sanitizedChatId,
    rawChatId: chatIdRaw,
    sentAt: now,
    link: inviteLink,
    message
  };
}

const handleContactsList = async (_event, payload = {}) => {
  try {
    const filter = {};

    if (payload?.projectId) {
      filter.projectId = payload.projectId;
    }

    const store = getEntityStore();
    const contacts = store.listTelegramContacts(filter);
    return respond(true, { contacts: contacts.map((contact) => formatContact(contact)) });
  } catch (error) {
    await log('telegram.contacts.list.error', { error: error.message }, 'error');
    return respond(false, { error: error.message });
  }
};

const handleContactSave = async (_event, payload = {}) => {
  try {
    const store = getEntityStore();
    const contactPayload = payload?.contact ?? payload;
    const saved = store.saveTelegramContact(contactPayload);
    await log('telegram.contacts.save', {
      contactId: saved.id,
      projectId: saved.projectId,
      chatId: saved.chatId
    });
    return respond(true, { contact: formatContact(saved) });
  } catch (error) {
    await log('telegram.contacts.save.error', { error: error.message }, 'error');
    return respond(false, { error: error.message });
  }
};

const handleSendInvite = async (_event, payload = {}) => {
  try {
    const projectId = sanitizeProjectId(payload?.projectId);
    const chatIdRaw = payload?.chatId ?? '';
    const chatId = typeof chatIdRaw === 'string' ? chatIdRaw.trim() : chatIdRaw;

    if (!projectId) {
      throw new Error('projectId is required');
    }

    if (!chatId) {
      throw new Error('chatId is required');
    }

    const result = await sendProjectInvite(projectId, chatId, payload || {});
    return respond(true, result || {});
  } catch (error) {
    await log('telegram.invite.error', { error: error.message, payload }, 'error');
    return respond(false, { error: error.message, code: error.code || null });
  }
};

function removeHandlers() {
  ALL_CHANNELS.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
}

function registerHandlers() {
  ipcMain.handle('bot:start', handleStart);
  ipcMain.handle('bot:stop', handleStop);
  ipcMain.handle('bot:status', handleStatus);
  ipcMain.handle('bot:setToken', handleSetToken);
  ipcMain.handle('bot:tailLog', handleTailLog);
  ipcMain.handle('bot:getProxy', handleGetProxy);
  ipcMain.handle('bot:setProxy', handleSetProxy);

  ipcMain.handle('AgentFlow:bot:start', handleStart);
  ipcMain.handle('AgentFlow:bot:stop', handleStop);
  ipcMain.handle('AgentFlow:bot:status', handleStatus);
  ipcMain.handle('AgentFlow:bot:setToken', handleSetToken);
  ipcMain.handle('AgentFlow:bot:tailLog', handleTailLog);
  ipcMain.handle('AgentFlow:bot:getProxy', handleGetProxy);
  ipcMain.handle('AgentFlow:bot:setProxy', handleSetProxy);

  ipcMain.handle('AgentFlow:briefs:latest', handleBriefLatest);
  ipcMain.handle('AgentFlow:briefs:plan', handleBriefPlan);
  ipcMain.handle('AgentFlow:telegram:contacts:list', handleContactsList);
  ipcMain.handle('AgentFlow:telegram:contacts:save', handleContactSave);
  ipcMain.handle('AgentFlow:telegram:sendInvite', handleSendInvite);
}

function attachWindowLifecycle(window) {
  if (!window || typeof window.once !== 'function') {
    return;
  }

  window.once('closed', () => {
    if (mainWindowRef === window) {
      mainWindowRef = null;
    }
  });
}

function emitToRenderer(channel, payload) {
  if (typeof depsRef?.enqueueRendererEvent === 'function') {
    depsRef.enqueueRendererEvent(channel, payload);
    return;
  }

  const window = depsRef?.getMainWindow?.() ?? mainWindowRef;

  if (!window || window.isDestroyed()) {
    return;
  }

  try {
    window.webContents.send(channel, payload);
  } catch (error) {
    getLogger().warn('Failed to emit event to renderer', { channel, message: error?.message });
  }
}

async function ensureInitialState() {
  const stored = await detectStoredToken();
  state.tokenStored = stored.stored;
  state.tokenSource = stored.source;

  if (!state.updatedAt) {
    state.updatedAt = new Date().toISOString();
  }

  if (!handlersRegistered) {
    handlersRegistered = true;
  }
}

export async function registerTelegramIpcHandlers(mainWindow, deps = {}) {
  if (!mainWindow) {
    throw new Error('mainWindow is required');
  }

  mainWindowRef = mainWindow;
  depsRef = normalizeDeps(deps);
  loggerRef = depsRef.logger;

  logFilePath = path.join(depsRef.appDataDir, 'logs', LOG_FILE_NAME);
  configFilePath = path.join(depsRef.appDataDir, 'config', CONFIG_FILE_NAME);
  networkConfigPath = path.join(depsRef.appDataDir, 'config', NETWORK_CONFIG_FILE_NAME);

  await loadNetworkConfig();
  ensureProxyBootstrap();

  attachWindowLifecycle(mainWindow);
  removeHandlers();
  registerHandlers();

  await ensureInitialState();
  emitStatusSnapshot(getStatus(), 'initial');
  await log('ipc.handlers.registered', { channels: TELEGRAM_CHANNELS });
  loggerRef.info('ipcBot: handlers registered');

  return { ok: true };
}

export const __test__ = {
  getStatus,
  getLogPath: () => logFilePath,
  getConfigPath: () => configFilePath,
  hasHandlers: () => handlersRegistered,
  emitToRenderer,
  getToken,
  ensureBot,
  shutdownBot,
  tailLog: readLogTail,
  selfTest: async () => {
    const { token, source } = await getToken({ allowMissing: true });
    if (!token) {
      throw new Error('telegram_token_missing');
    }
    return `selfTest ok (source:${source})`;
  }
};
