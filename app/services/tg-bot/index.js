import fsp from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import keytar from 'keytar';
import { openDatabase as openBetterSqliteDatabase } from '../../db/sqlite.js';
import { createBriefSurvey, summarizeAnswers, buildExecutionPlan } from './survey.js';
import {
  resolveDataPath,
  assertAllowedPath,
  sanitizeFileName,
  redactSensitive
} from '../../core/utils/security.js';

const SERVICE_NAME = 'AgentFlowDesktop';
const TOKEN_ACCOUNT = 'telegram.bot.token';
const DEFAULT_RESTART_BASE_DELAY = 5_000;
const DEFAULT_RESTART_BACKOFF_MULTIPLIER = 3;
const DEFAULT_RESTART_MAX_DELAY = 180_000;
const DEFAULT_MAX_RESTART_ATTEMPTS = 5;
const DEFAULT_SESSION_INACTIVITY_MS = 30 * 60 * 1_000;
const DEFAULT_SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1_000;

const BOT_STATES = {
  STOPPED: 'STOPPED',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  STOPPING: 'STOPPING',
  RESTARTING: 'RESTARTING',
  FAILED: 'FAILED'
};

async function ensureTelegrafModule() {
  try {
    const mod = await import('telegraf');
    const TelegrafClass = mod.Telegraf ?? mod.default;

    if (!TelegrafClass) {
      throw new Error('telegraf module does not export Telegraf class');
    }

    return {
      Telegraf: TelegrafClass
    };
  } catch (error) {
    throw new Error(
      `Failed to load telegraf. Install the dependency with "npm install telegraf". Details: ${error.message}`
    );
  }
}

function ensureDirectory(directoryPath, options) {
  const safePath = assertAllowedPath(directoryPath, options);
  return fsp.mkdir(safePath, { recursive: true });
}

async function appendJsonLine(filePath, payload, options) {
  const safePath = assertAllowedPath(filePath, options);
  const entry = {
    timestamp: new Date().toISOString(),
    ...redactSensitive(payload)
  };

  return fsp.appendFile(safePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
}

async function readJsonFileIfExists(filePath, options) {
  const safePath = assertAllowedPath(filePath, options);

  try {
    const raw = await fsp.readFile(safePath, { encoding: 'utf8' });
    return { data: JSON.parse(raw), error: null };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { data: null, error: null };
    }

    if (error instanceof SyntaxError) {
      return { data: null, error };
    }

    throw error;
  }
}

async function writeJsonFile(filePath, payload, options) {
  const safePath = assertAllowedPath(filePath, options);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await fsp.writeFile(safePath, serialized, { encoding: 'utf8' });
}

async function deleteFileIfExists(filePath, options) {
  const safePath = assertAllowedPath(filePath, options);

  try {
    await fsp.unlink(safePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function openDatabase(dbPath) {
  const safePath = assertAllowedPath(dbPath);
  const db = openBetterSqliteDatabase(safePath);
  db.pragma('journal_mode = WAL');
  return db;
}

function upsertBrief(dbPath, record) {
  const db = openDatabase(dbPath);

  try {
    const statement = db.prepare(
      `INSERT INTO Briefs (id, projectId, summary, details, createdAt, updatedAt)
       VALUES (@id, @projectId, @summary, @details, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         projectId = excluded.projectId,
         summary = excluded.summary,
         details = excluded.details,
         updatedAt = excluded.updatedAt`
    );

    statement.run(record);
  } finally {
    db.close();
  }
}

function selectLatestBrief(dbPath, projectId) {
  const db = openDatabase(dbPath);

  try {
    const row = db
      .prepare(
        `SELECT id, projectId, summary, details, createdAt, updatedAt
         FROM Briefs
         WHERE projectId = ?
         ORDER BY datetime(createdAt) DESC
         LIMIT 1`
      )
      .get(projectId);

    if (!row) {
      return null;
    }

    let parsedDetails = {};

    if (row.details) {
      try {
        parsedDetails = JSON.parse(row.details);
      } catch (parseError) {
        parsedDetails = {};
      }
    }

    return {
      ...row,
      details: parsedDetails
    };
  } finally {
    db.close();
  }
}

export class TelegramBotService extends EventEmitter {
  constructor({
    dataDirectory,
    dbPath,
    logPath,
    restartBaseDelay = DEFAULT_RESTART_BASE_DELAY,
    restartBackoffMultiplier = DEFAULT_RESTART_BACKOFF_MULTIPLIER,
    restartMaxDelay = DEFAULT_RESTART_MAX_DELAY,
    maxRestartAttempts = DEFAULT_MAX_RESTART_ATTEMPTS,
    sessionInactivityMs = DEFAULT_SESSION_INACTIVITY_MS,
    sessionCleanupIntervalMs = DEFAULT_SESSION_CLEANUP_INTERVAL_MS
  } = {}) {
    super();
    const defaultDataDir = resolveDataPath();
    const allowedRoots = [defaultDataDir];

    const resolvedDataDir = dataDirectory
      ? assertAllowedPath(path.resolve(dataDirectory), { allowedRoots })
      : defaultDataDir;

    this.allowedRoots = allowedRoots;
    this.dataDirectory = resolvedDataDir;
    this.dbPath = dbPath
      ? assertAllowedPath(path.resolve(dbPath), { allowedRoots })
      : assertAllowedPath(path.join(resolvedDataDir, 'app.db'), { allowedRoots });
    this.logPath = logPath
      ? assertAllowedPath(path.resolve(logPath), { allowedRoots })
      : assertAllowedPath(path.join(resolvedDataDir, 'logs', 'telegram-bot.jsonl'), { allowedRoots });
    this.briefsDirectory = assertAllowedPath(path.join(resolvedDataDir, 'briefs'), { allowedRoots });
    this.botMetadataPath = assertAllowedPath(path.join(resolvedDataDir, 'telegram-bot.json'), {
      allowedRoots
    });
    this.restartBaseDelay = restartBaseDelay;
    this.restartBackoffMultiplier = restartBackoffMultiplier;
    this.restartMaxDelay = restartMaxDelay;
    this.maxRestartAttempts = maxRestartAttempts;
    this.sessionInactivityMs = sessionInactivityMs;
    this.sessionCleanupIntervalMs = sessionCleanupIntervalMs;
    this.sessions = new Map();
    this.state = BOT_STATES.STOPPED;
    this.restartAttempts = 0;
    this.startedAt = null;
    this.lastError = null;
    this.lastActivityAt = null;
    this.restartTimer = null;
    this.sessionCleanupTimer = null;
    this.nextRestartAt = null;
    this.bot = null;
    this.botUsername = null;
    this.tokenCache = null;
  }

  async init() {
    await ensureDirectory(this.dataDirectory, { allowedRoots: this.allowedRoots });
    await ensureDirectory(path.dirname(this.logPath), { allowedRoots: this.allowedRoots });
    await ensureDirectory(this.briefsDirectory, { allowedRoots: this.allowedRoots });
    const { data: cachedMetadata, error: metadataError } = await readJsonFileIfExists(
      this.botMetadataPath,
      { allowedRoots: this.allowedRoots }
    );

    if (metadataError) {
      await this.log('warn', 'Failed to parse cached Telegram metadata', {
        error: metadataError.message
      });
    }

    if (cachedMetadata?.username && typeof cachedMetadata.username === 'string') {
      this.botUsername = cachedMetadata.username;
    }
    this.tokenCache = await keytar.getPassword(SERVICE_NAME, TOKEN_ACCOUNT);

    if (this.tokenCache) {
      try {
        const { Telegraf } = await ensureTelegrafModule();
        const validationBot = new Telegraf(this.tokenCache);
        const info = await validationBot.telegram.getMe();

        if (typeof validationBot.stop === 'function') {
          await validationBot.stop('init-username-lookup');
        }

        this.botUsername = info?.username ?? null;
        await this.syncBotMetadata();
      } catch (error) {
        await this.log('warn', 'Failed to resolve bot username during init', {
          error: error.message
        });
      }
    }

    return this.getStatus();
  }

  async log(level, message, meta = {}) {
    await appendJsonLine(
      this.logPath,
      {
        service: 'telegram-bot',
        level,
        message,
        ...meta
      },
      { allowedRoots: this.allowedRoots }
    );
  }

  async transitionState(nextState, meta = {}) {
    if (this.state === nextState) {
      return;
    }

    const previousState = this.state;
    this.state = nextState;
    await this.log('info', 'Bot state changed', {
      previousState,
      nextState,
      ...meta
    });
  }

  isOperational() {
    return this.state === BOT_STATES.RUNNING;
  }

  computeRestartDelay() {
    const attempt = Math.max(this.restartAttempts, 1);
    const delay =
      this.restartBaseDelay * this.restartBackoffMultiplier ** (attempt - 1);
    return Math.min(delay, this.restartMaxDelay);
  }

  recordRestartFailure(meta = {}) {
    this.restartAttempts += 1;

    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.nextRestartAt = null;
      this.cancelScheduledRestart();
      this.transitionState(BOT_STATES.FAILED, {
        ...meta,
        restartAttempts: this.restartAttempts,
        maxRestartAttempts: this.maxRestartAttempts
      }).catch(() => {});
      this.log('error', 'Maximum restart attempts reached', {
        ...meta,
        restartAttempts: this.restartAttempts,
        maxRestartAttempts: this.maxRestartAttempts
      }).catch(() => {});
      return false;
    }

    return true;
  }

  scheduleRestart(reason) {
    if (this.restartTimer || this.restartAttempts >= this.maxRestartAttempts) {
      return;
    }

    const delay = this.computeRestartDelay();
    this.nextRestartAt = new Date(Date.now() + delay);
    const attemptNumber = Math.max(this.restartAttempts, 1);

    this.transitionState(BOT_STATES.RESTARTING, {
      reason,
      restartAttempts: this.restartAttempts,
      nextRestartAt: this.nextRestartAt.toISOString(),
      delay
    }).catch(() => {});

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;

      try {
        await this.start({ autoRestart: true });
        this.nextRestartAt = null;
        await this.log('info', 'Bot restarted automatically', {
          reason,
          restartAttempts: this.restartAttempts,
          attemptNumber
        });
      } catch (error) {
        this.lastError = error.message;
        const canRetry = this.recordRestartFailure({
          reason: 'auto-restart-failed',
          error: error.message
        });

        await this.log('error', 'Automatic restart attempt failed', {
          reason,
          restartAttempts: this.restartAttempts,
          attemptNumber,
          error: error.message
        });

        if (canRetry) {
          this.scheduleRestart('retry-after-error');
        }
      }
    }, delay);
  }

  cancelScheduledRestart() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.nextRestartAt = null;
  }

  startSessionCleanup() {
    if (this.sessionCleanupTimer) {
      return;
    }

    this.sessionCleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions().catch(async (error) => {
        await this.log('error', 'Failed to cleanup inactive sessions', {
          error: error.message
        });
      });
    }, this.sessionCleanupIntervalMs);
  }

  stopSessionCleanup() {
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      this.sessionCleanupTimer = null;
    }
  }

  async cleanupInactiveSessions() {
    if (!this.sessions.size) {
      return;
    }

    const now = Date.now();

    for (const [chatId, session] of this.sessions.entries()) {
      const lastActivity = session.lastActivityAt?.getTime();

      if (!lastActivity) {
        continue;
      }

      if (now - lastActivity < this.sessionInactivityMs) {
        continue;
      }

      this.sessions.delete(chatId);
      await this.log('warn', 'Session removed due to inactivity', {
        chatId,
        projectId: session.projectId,
        lastActivityAt: session.lastActivityAt.toISOString(),
        reason: 'inactive-timeout'
      });

      if (this.bot) {
        try {
          await this.bot.telegram.sendMessage(
            chatId,
            'The current survey session expired due to inactivity. Start again with /setup if you still need to continue.'
          );
        } catch (error) {
          await this.log('warn', 'Failed to send inactivity notification', {
            chatId,
            error: error.message
          });
        }
      }
    }
  }

  async setToken(token) {
    const trimmed = token?.trim() ?? '';

    if (trimmed.length > 0) {
      const { Telegraf } = await ensureTelegrafModule();

      let botInfo;

      try {
        const validationBot = new Telegraf(trimmed);
        botInfo = await validationBot.telegram.getMe();

        if (typeof validationBot.stop === 'function') {
          await validationBot.stop('token-validation');
        }
      try {
        const validationBot = new Telegraf(trimmed);
        await validationBot.telegram.getMe();
      } catch (error) {
        await this.log('warn', 'Token validation failed', {
          error: error.message
        });
        throw new Error('Telegram token could not be validated. Please check the value and try again.');
      }

      await keytar.setPassword(SERVICE_NAME, TOKEN_ACCOUNT, trimmed);
      this.tokenCache = trimmed;
      this.botUsername = botInfo?.username ?? this.botUsername;
      await this.syncBotMetadata();
      await this.log('info', 'Telegram token updated via UI');

      const shouldRestart =
        this.state !== BOT_STATES.STOPPED && this.state !== BOT_STATES.FAILED;

      if (this.state === BOT_STATES.FAILED) {
        await this.start();
      } else if (shouldRestart) {
        await this.restart('token-updated');
      }

      return this.getStatus();
    }

    await keytar.deletePassword(SERVICE_NAME, TOKEN_ACCOUNT);
    this.tokenCache = null;
    this.botUsername = null;
    await this.syncBotMetadata();
    await this.log('warn', 'Telegram token removed via UI');

    if (this.state !== BOT_STATES.STOPPED) {
      await this.stop('token-cleared');
    }

    return this.getStatus();
  }

  async restart(reason = 'manual-restart') {
    await this.stop(reason);
    return this.start();
  }

  async start({ autoRestart = false } = {}) {
    if (this.state === BOT_STATES.STARTING || this.state === BOT_STATES.RUNNING) {
      return this.getStatus();
    }

    this.cancelScheduledRestart();

    const token = this.tokenCache || (await keytar.getPassword(SERVICE_NAME, TOKEN_ACCOUNT));

    if (!token) {
      throw new Error('Telegram token is not configured. Provide it in the settings.');
    }

    if (!autoRestart) {
      this.restartAttempts = 0;
    }

    }

    if (!autoRestart) {
      this.restartAttempts = 0;
    }

    await this.transitionState(BOT_STATES.STARTING, { autoRestart });

    try {
      const { Telegraf } = await ensureTelegrafModule();

      const bot = new Telegraf(token, { handlerTimeout: 90_000 });
      this.registerHandlers(bot);

      bot.catch(async (error, ctx) => {
        await this.log('error', 'Error in Telegram handler', {
          error: error?.message,
          stack: error?.stack,
          chatId: ctx?.chat?.id
        });

        this.lastError = error.message;

        await this.stop('handler-error');

        const canRetry = this.recordRestartFailure({
          reason: 'handler-error',
          error: error.message
        });


      const bot = new Telegraf(token, { handlerTimeout: 90_000 });
      this.registerHandlers(bot);

      bot.catch(async (error, ctx) => {
        await this.log('error', 'Error in Telegram handler', {
          error: error?.message,
          stack: error?.stack,
          chatId: ctx?.chat?.id
        });

        this.lastError = error.message;

        await this.stop('handler-error');

        const canRetry = this.recordRestartFailure({
          reason: 'handler-error',
          error: error.message
        });

        if (canRetry) {
          this.scheduleRestart('handler-error');
        }
      });

      await bot.launch({ dropPendingUpdates: true });
      const info = await bot.telegram.getMe();

      this.bot = bot;
      this.startedAt = new Date();
      this.lastError = null;
      this.botUsername = info?.username ?? null;
      await this.syncBotMetadata();
      this.startSessionCleanup();

      await this.transitionState(BOT_STATES.RUNNING, {
        autoRestart,
        username: this.botUsername,
        startedAt: this.startedAt.toISOString()
      });

      await this.log('info', 'Telegram bot started', {
        autoRestart,
        username: this.botUsername,
        startedAt: this.startedAt.toISOString()
      });

      return this.getStatus();
    } catch (error) {
      this.bot = null;
      await this.transitionState(BOT_STATES.FAILED, {
        autoRestart,
        error: error.message
      });
      this.lastError = error.message;
      if (!autoRestart) {
        throw error;
      }
      throw error;
    }
  }

  async stop(reason = 'manual-stop') {
    this.cancelScheduledRestart();
    this.stopSessionCleanup();

    if (!this.bot) {
      await this.transitionState(BOT_STATES.STOPPED, { reason });
      return this.getStatus();
    }

    await this.transitionState(BOT_STATES.STOPPING, { reason });

    try {
      await this.bot.stop(reason);
    } catch (error) {
      await this.log('warn', 'Error while stopping Telegram bot', {
        reason,
        error: error.message
      });
    }

    this.bot = null;
    await this.transitionState(BOT_STATES.STOPPED, { reason });
    await this.log('info', 'Telegram bot stopped', { reason });

    return this.getStatus();
  }

  registerHandlers(bot) {
    bot.start(async (ctx) => {
      this.lastActivityAt = new Date();
      const chatId = ctx.chat.id;
      const text = ctx.message?.text ?? '';
      const [, payload] = text.split(' ');
      const projectId = payload?.startsWith('project=') ? payload.slice('project='.length) : null;

      if (!projectId) {
        await ctx.reply(
          'Hello! Please provide the project in the following format: /start project=PRJ_123. After that, run /setup to begin the survey.'
        );
        return;
      }

      this.sessions.set(chatId, {
        chatId,
        projectId,
        answers: {},
        stepIndex: 0,
        active: false,
        lastActivityAt: new Date()
      });

      await this.log('info', '/start command received', { chatId, projectId });
      await ctx.reply(
        `Project ${projectId} linked. Run /setup to launch the brief survey.`
      );
    });

    bot.command('setup', async (ctx) => {
      this.lastActivityAt = new Date();
      const chatId = ctx.chat.id;
      const session = this.sessions.get(chatId);

      if (!session) {
        await ctx.reply('Run /start project=ID first to bind this chat to a project.');
        return;
      }

      session.lastActivityAt = new Date();

      if (!session.active) {
        session.active = true;
        session.stepIndex = 0;
        session.survey = createBriefSurvey();
        session.lastActivityAt = new Date();
        await ctx.reply('Starting the brief. Answer each question with a single message. Use /finish to wrap up early.');
      }

      await this.askNextQuestion(ctx, session);
    });

    bot.command('finish', async (ctx) => {
      this.lastActivityAt = new Date();
      const chatId = ctx.chat.id;
      const session = this.sessions.get(chatId);

      if (session) {
        session.lastActivityAt = new Date();
      }

      await this.completeSession(ctx.chat.id, { ctx, reason: 'manual-finish' });
    });

    bot.on('text', async (ctx) => {
      this.lastActivityAt = new Date();
      const chatId = ctx.chat.id;
      const session = this.sessions.get(chatId);

      if (!session || !session.active) {
        return;
      }

      session.lastActivityAt = new Date();

      if (!session.survey || session.stepIndex >= session.survey.length) {
        await ctx.reply('The survey is already complete. Use /finish to save the results.');
        return;
      }

      const question = session.survey[session.stepIndex];
      const answer = ctx.message.text ?? '';
      const validation = this.validateAnswer(question, answer);

      if (!validation.valid) {
        await ctx.reply(validation.message);
        return;
      }

      session.answers[question.key] = validation.value;
      session.stepIndex += 1;

      await this.log('info', 'Brief question answered', {
        chatId,
        projectId: session.projectId,
        key: question.key
      });

      if (session.stepIndex >= session.survey.length) {
        await ctx.reply('Thanks! All questions have been answered. Saving your brief now.');
        await this.completeSession(chatId, { ctx, reason: 'auto-finish' });
      } else {
        await this.askNextQuestion(ctx, session);
      }
    });
  }

  async askNextQuestion(ctx, session) {
    if (!session.survey || session.stepIndex >= session.survey.length) {
      await this.completeSession(session.chatId, { ctx, reason: 'auto-finish' });
      return;
    }

    const question = session.survey[session.stepIndex];
    const text = question.hint ? `${question.question}\n${question.hint}` : question.question;
    session.lastActivityAt = new Date();
    await ctx.reply(text);
  }

  validateAnswer(question, text) {
    const trimmed = text.trim();

    if (!trimmed) {
      return {
        valid: false,
        message: 'Please provide a response so we can continue.'
      };
    }

    if (question.expectedType === 'number' && Number.isNaN(Number(trimmed))) {
      return {
        valid: false,
        message: 'Please enter a valid number for this question.'
      };
    }

    if (question.expectedType === 'boolean') {
      const normalized = trimmed.toLowerCase();

      if (!['yes', 'no', 'true', 'false'].includes(normalized)) {
        return {
          valid: false,
          message: 'Please answer with yes or no.'
        };
      }
    }

    if (question.options && Array.isArray(question.options)) {
      const normalizedOptions = question.options.map((option) => option.toLowerCase());
      if (!normalizedOptions.includes(trimmed.toLowerCase())) {
        return {
          valid: false,
          message: `Please select one of the available options: ${question.options.join(', ')}.`
        };
      }
    }

    return { valid: true, value: trimmed };
  }

  async completeSession(chatId, { ctx = null, reason = 'auto-finish' } = {}) {
    const session = this.sessions.get(chatId);

    if (!session) {
      if (ctx) {
        await ctx.reply('There is no active brief. Run /start to create a new one.');
      }
      return null;
    }

    const answers = session.answers;
    const summary = summarizeAnswers(answers);
    const completedAt = new Date();
    const briefId = `brief_${completedAt.getTime()}_${chatId}`;
    const detailsPayload = {
      ...answers,
      projectId: session.projectId,
      source: 'telegram',
      completedAt: completedAt.toISOString()
    };
    const record = {
      id: briefId,
      projectId: session.projectId,
      summary,
      details: JSON.stringify(detailsPayload),
      createdAt: completedAt.toISOString(),
      updatedAt: completedAt.toISOString()
    };

    await upsertBrief(this.dbPath, record);

    const safeChatId = sanitizeFileName(String(chatId), 'chat');
    const filePath = assertAllowedPath(path.join(this.briefsDirectory, `brief-${safeChatId}.json`), {
      allowedRoots: this.allowedRoots
    });
    const filePayload = {
      id: briefId,
      projectId: session.projectId,
      summary,
      answers: detailsPayload,
      savedAt: completedAt.toISOString()
    };

    await fsp.writeFile(filePath, JSON.stringify(filePayload, null, 2), 'utf8');

    await this.log('info', 'Brief saved', {
      chatId,
      projectId: session.projectId,
      briefId,
      reason
    });

    this.emit('brief:updated', { projectId: session.projectId, briefId });

    this.sessions.delete(chatId);

    if (ctx) {
      await ctx.reply(`Brief saved! ID: ${briefId}. You can review it in AgentFlow Desktop.`);
    }

    return {
      id: briefId,
      projectId: session.projectId,
      summary,
      answers,
      completedAt: completedAt.toISOString()
    };
  }

  async latestBrief(projectId) {
    if (!projectId) {
      throw new Error('projectId is required');
    }

    const brief = selectLatestBrief(this.dbPath, projectId);

    if (!brief) {
      return null;
    }

    return {
      ...brief,
      details: brief.details
    };
  }

  async generatePlan(projectId) {
    const brief = await this.latestBrief(projectId);

    if (!brief) {
      throw new Error('brief_not_found');
    }

    const plan = buildExecutionPlan(brief.details);

    return {
      brief,
      plan
    };
  }

  getStatus() {
    return {
      state: this.state,
      running: this.isOperational(),
      startedAt: this.startedAt ? this.startedAt.toISOString() : null,
      lastError: this.lastError,
      lastActivityAt: this.lastActivityAt ? this.lastActivityAt.toISOString() : null,
      tokenStored: Boolean(this.tokenCache),
      username: this.botUsername,
      deeplinkBase: this.botUsername ? `https://t.me/${this.botUsername}` : null,
      restartAttempts: this.restartAttempts,
      maxRestartAttempts: this.maxRestartAttempts,
      nextRestartAt: this.nextRestartAt ? this.nextRestartAt.toISOString() : null
    };
  }

  async syncBotMetadata() {
    try {
      if (this.botUsername) {
        await writeJsonFile(
          this.botMetadataPath,
          {
            username: this.botUsername,
            updatedAt: new Date().toISOString()
          },
          { allowedRoots: this.allowedRoots }
        );
      } else {
        await deleteFileIfExists(this.botMetadataPath, { allowedRoots: this.allowedRoots });
      }
    } catch (error) {
      await this.log('warn', 'Failed to sync Telegram metadata', {
        error: error.message
      });
    }
  }
}

export function createTelegramBotService(options = {}) {
  const service = new TelegramBotService(options);
  return service;
}
