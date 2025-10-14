import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import keytar from 'keytar';
import { Telegraf } from 'telegraf';
import { buildSurvey, buildPlan, buildBriefContent } from './survey.js';
import { listBriefsByProject, upsertBrief } from '../../db/repositories/briefsRepository.js';
import { getProject } from '../../db/repositories/projectsRepository.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const BRIEFS_DIR = path.join(DATA_DIR, 'briefs');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'telegram-bot.jsonl');

const KEYTAR_SERVICE = 'AgentFlow Desktop';
const KEYTAR_ACCOUNT = 'telegram-bot-token';

const emitter = new EventEmitter();

let bot;
let currentToken;
let statusCache = {
  running: false,
  startedAt: null,
  username: null,
  restarts: 0,
  lastError: null
};
let restartTimer;
const sessions = new Map();

async function ensureDirectories() {
  await fs.mkdir(BRIEFS_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
}

async function appendLog(entry) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: entry.level ?? 'info',
    event: entry.event,
    data: entry.data ?? {}
  });

  await fs.appendFile(LOG_FILE, `${line}\n`);
}

function sanitizeSegment(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60);
}

function buildBriefFilePath(projectId, briefId) {
  const projectSegment = sanitizeSegment(projectId);
  const briefSegment = sanitizeSegment(briefId);

  return path.join(BRIEFS_DIR, `${projectSegment}-${briefSegment}.json`);
}

function buildSession(chatId, project, survey) {
  return {
    id: randomUUID(),
    chatId,
    project,
    answers: {},
    questions: survey,
    index: 0
  };
}

function getCurrentQuestion(session) {
  return session.questions[session.index] ?? null;
}

async function writeBriefFile(briefId, payload) {
  await fs.mkdir(BRIEFS_DIR, { recursive: true });
  const filePath = buildBriefFilePath(payload.projectId, briefId);
  await fs.writeFile(filePath, JSON.stringify({ id: briefId, ...payload }, null, 2));

  return filePath;
}

async function saveBriefFromSession(session, userContext) {
  const briefContent = buildBriefContent(session.answers);
  const plan = buildPlan(session.answers, session.project);
  const payload = {
    projectId: session.project.id,
    title: `Бриф ${new Date().toLocaleString('ru-RU')}`,
    content: { ...briefContent, plan },
    status: 'draft',
    source: 'telegram',
    metadata: {
      chatId: session.chatId,
      user: userContext,
      plan
    }
  };

  const saved = await upsertBrief(payload);
  await writeBriefFile(saved.id, {
    ...payload,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt
  });

  emitter.emit('brief:updated', { projectId: saved.projectId, briefId: saved.id });
  await appendLog({
    event: 'brief_saved',
    data: { projectId: saved.projectId, briefId: saved.id, chatId: session.chatId }
  });

  return { saved, plan };
}

function scheduleRestart(reason) {
  if (restartTimer) {
    return;
  }

  restartTimer = setTimeout(async () => {
    restartTimer = null;
    await appendLog({ event: 'bot_restart', data: { reason } });
    statusCache.restarts += 1;

    try {
      await stopBot({ silent: true });
      await startBot({ restart: true });
    } catch (error) {
      statusCache.lastError = error.message;
      await appendLog({
        level: 'error',
        event: 'bot_restart_failed',
        data: { message: error.message }
      });
    }
  }, 5000);
}

async function handleSessionAnswer(ctx) {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const text = ctx.message?.text?.trim();
  if (!text || text.startsWith('/')) {
    return;
  }

  const session = sessions.get(chatId);
  if (!session) {
    await ctx.reply('Команда /start project=<id> запускает опрос для выбранного проекта.');
    return;
  }

  const question = getCurrentQuestion(session);
  if (!question) {
    await ctx.reply('Ответы сохранены. Используйте /finish для завершения.');
    return;
  }

  session.answers[question.field] = text;
  session.index += 1;

  const nextQuestion = getCurrentQuestion(session);

  if (nextQuestion) {
    await sendQuestion(ctx, session, nextQuestion);
  } else {
    await ctx.reply('Спасибо! Все вопросы пройдены. Введите /finish для сохранения брифа.');
  }
}

async function sendQuestion(ctx, session, question) {
  const total = session.questions.length;
  const position = session.index + 1;
  let message = `Вопрос ${position} из ${total}:\n${question.prompt}`;

  if (question.previous) {
    message += `\nПредыдущее значение: ${question.previous}`;
  }

  if (question.hint) {
    message += `\nПодсказка: ${question.hint}`;
  }

  await ctx.reply(message);
}

function parseProjectIdFromPayload(payload) {
  if (!payload) {
    return null;
  }

  const decoded = decodeURIComponent(payload);

  if (decoded.startsWith('project=')) {
    return decoded.slice('project='.length);
  }

  const match = decoded.match(/project=([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function handleStartCommand(ctx) {
  const payload = ctx.startPayload || ctx.message?.text?.split(' ').slice(1).join(' ') || '';
  const projectId = parseProjectIdFromPayload(payload);

  if (!projectId) {
    await ctx.reply('Укажите проект: /start project=<id>. ID можно скопировать в приложении.');
    return;
  }

  const project = await getProject(projectId);

  if (!project) {
    await ctx.reply(`Проект с ID «${projectId}» не найден. Проверьте, что он сохранён.`);
    return;
  }

  const briefHistory = await listBriefsByProject(projectId);
  const lastBrief = briefHistory[0] ?? null;
  const survey = buildSurvey(project, lastBrief);
  const chatId = ctx.chat?.id;

  if (!chatId) {
    await ctx.reply('Не удалось определить чат. Попробуйте ещё раз.');
    return;
  }

  const session = buildSession(chatId, project, survey);
  sessions.set(chatId, session);

  await ctx.reply(
    `Запускаем сбор брифа по проекту «${project.name}». Ответьте на вопросы, затем используйте /finish.`
  );

  const question = getCurrentQuestion(session);
  if (question) {
    await sendQuestion(ctx, session, question);
  }
}

async function handleSetupCommand(ctx) {
  const chatId = ctx.chat?.id;
  const session = chatId ? sessions.get(chatId) : null;

  if (!session) {
    await ctx.reply('Начните с команды /start project=<id>, чтобы выбрать проект.');
    return;
  }

  const question = getCurrentQuestion(session);
  if (question) {
    await ctx.reply('Продолжаем опрос. Отвечайте на вопросы, затем введите /finish.');
    await sendQuestion(ctx, session, question);
  } else {
    await ctx.reply('Все вопросы пройдены. Введите /finish для сохранения брифа.');
  }
}

async function handleFinishCommand(ctx) {
  const chatId = ctx.chat?.id;
  const session = chatId ? sessions.get(chatId) : null;

  if (!session) {
    await ctx.reply('Нет активного опроса. Используйте /start project=<id>.');
    return;
  }

  sessions.delete(chatId);

  const { saved, plan } = await saveBriefFromSession(session, {
    id: ctx.from?.id,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name
  });

  await ctx.reply(
    `Бриф сохранён ✅\nID: ${saved.id}\nПроект: ${session.project.name}\n\nПлан:\n${plan}`
  );
}

function attachHandlers(instance) {
  instance.start(handleStartCommand);
  instance.command('setup', handleSetupCommand);
  instance.command('finish', handleFinishCommand);
  instance.on('text', handleSessionAnswer);
  instance.catch(async (error, ctx) => {
    statusCache.lastError = error.message;
    await appendLog({
      level: 'error',
      event: 'bot_handler_error',
      data: { message: error.message, chatId: ctx?.chat?.id }
    });
    scheduleRestart('handler_error');
  });
}

async function getStoredToken() {
  const token = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  return token || null;
}

export async function setBotToken(token) {
  if (!token) {
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    currentToken = undefined;
    await appendLog({ event: 'bot_token_removed' });
    return;
  }

  await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token.trim());
  currentToken = token.trim();
  await appendLog({ event: 'bot_token_updated' });
}

export async function getBotStatus() {
  const storedToken = await getStoredToken();

  return {
    running: statusCache.running,
    startedAt: statusCache.startedAt,
    username: statusCache.username,
    restarts: statusCache.restarts,
    lastError: statusCache.lastError,
    tokenStored: Boolean(storedToken),
    deeplinkBase: statusCache.username ? `https://t.me/${statusCache.username}?start=project=` : null
  };
}

export function onBriefUpdated(listener) {
  emitter.on('brief:updated', listener);

  return () => emitter.off('brief:updated', listener);
}

export async function startBot({ restart = false } = {}) {
  if (statusCache.running) {
    return getBotStatus();
  }

  await ensureDirectories();

  const token = currentToken || (await getStoredToken());
  if (!token) {
    throw new Error('TELEGRAM_TOKEN_MISSING');
  }

  const instance = new Telegraf(token, { handlerTimeout: 30000 });
  attachHandlers(instance);

  try {
    await instance.launch();

    const me = await instance.telegram.getMe();
    bot = instance;
    currentToken = token;
    statusCache = {
      ...statusCache,
      running: true,
      startedAt: new Date().toISOString(),
      username: me.username || null,
      lastError: null
    };

    if (!restart) {
      await appendLog({
        event: 'bot_started',
        data: { username: statusCache.username }
      });
    }
  } catch (error) {
    await appendLog({
      level: 'error',
      event: 'bot_start_failed',
      data: { message: error.message }
    });
    statusCache.lastError = error.message;
    throw error;
  }

  return getBotStatus();
}

export async function stopBot({ silent = false } = {}) {
  if (!bot) {
    statusCache.running = false;
    return getBotStatus();
  }

  try {
    await bot.stop('manual stop');
  } catch (error) {
    statusCache.lastError = error.message;
    await appendLog({
      level: 'error',
      event: 'bot_stop_failed',
      data: { message: error.message }
    });
  }

  bot = undefined;
  sessions.clear();
  statusCache.running = false;

  if (!silent) {
    await appendLog({ event: 'bot_stopped' });
  }

  return getBotStatus();
}
