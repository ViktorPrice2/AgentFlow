import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { Telegraf } from 'telegraf';
import { getDatabasePath } from '../../db/migrate.js';
import { buildSurvey, mapAnswersToBrief, summarizeAnswers } from './survey.js';

const RESTART_DELAY_MS = 10_000;

function trimText(text, limit = 120) {
  if (!text) {
    return '';
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 1).trim()}…`;
}

export function createTelegramBotService(options = {}) {
  const { onBriefSaved } = options;
  const dbPath = getDatabasePath();
  const dataDir = path.dirname(dbPath);
  const logsPath = path.join(dataDir, 'logs', 'telegram-bot.jsonl');
  const briefsDir = path.join(dataDir, 'briefs');

  let botInstance = null;
  let restartTimer = null;
  const sessions = new Map();

  const state = {
    status: 'idle',
    startedAt: null,
    username: null,
    botId: null,
    lastError: null
  };

  async function ensureDirs() {
    await fs.mkdir(path.dirname(logsPath), { recursive: true });
    await fs.mkdir(briefsDir, { recursive: true });
  }

  async function writeLog(level, event, data = {}) {
    try {
      await ensureDirs();
      const line = `${JSON.stringify({ ts: new Date().toISOString(), level, event, data })}\n`;
      await fs.appendFile(logsPath, line, 'utf8');
    } catch (error) {
      console.error('[telegram-bot] Failed to write log', error);
    }
  }

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function scheduleRestart(token) {
    clearRestartTimer();

    restartTimer = setTimeout(() => {
      restartTimer = null;
      start(token).catch((error) => {
        state.lastError = error?.message || 'Restart failed';
      });
    }, RESTART_DELAY_MS);

    return new Date(Date.now() + RESTART_DELAY_MS).toISOString();
  }

  function parseProjectId(ctx) {
    const payload = ctx.startPayload || ctx.message?.text?.split(' ')[1] || '';
    const match = payload.match(/project=([\w-]+)/i);
    return match ? match[1] : null;
  }

  function ensureSession(chatId) {
    if (!sessions.has(chatId)) {
      sessions.set(chatId, {
        chatId,
        projectId: null,
        answers: {},
        active: false,
        stepIndex: 0,
        flow: null,
        flowVersion: null,
        briefId: null,
        lastSavedAt: null,
        createdAt: null
      });
    }

    return sessions.get(chatId);
  }

  async function upsertBriefRecord({ briefId, projectId, title, summary, payload }) {
    const db = new Database(dbPath);
    try {
      const sql = `
        INSERT INTO Briefs (id, projectId, title, summary, payload, createdAt, updatedAt)
        VALUES (@id, @projectId, @title, @summary, @payload, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          projectId = excluded.projectId,
          title = excluded.title,
          summary = excluded.summary,
          payload = excluded.payload,
          updatedAt = datetime('now');
      `;

      db.prepare(sql).run({
        id: briefId,
        projectId,
        title,
        summary,
        payload: JSON.stringify(payload)
      });
    } finally {
      db.close();
    }
  }

  async function persistBrief(session, meta = {}) {
    if (!session.projectId) {
      return null;
    }

    const answers = { ...session.answers };
    const briefId = session.briefId || crypto.randomUUID();
    const normalized = mapAnswersToBrief(answers);
    const summary = summarizeAnswers(answers);
    const filePayload = {
      briefId,
      projectId: session.projectId,
      chatId: session.chatId,
      answers: normalized,
      rawAnswers: answers,
      flowVersion: session.flowVersion,
      createdAt: session.createdAt,
      savedAt: new Date().toISOString(),
      meta
    };

    await ensureDirs();

    const fileName = `${session.projectId}-${briefId}.json`;
    const filePath = path.join(briefsDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(filePayload, null, 2), 'utf8');

    await upsertBriefRecord({
      briefId,
      projectId: session.projectId,
      title: normalized.goals ? trimText(normalized.goals, 80) : `Бриф из Telegram ${briefId.slice(0, 6)}`,
      summary: summary || 'Бриф из Telegram',
      payload: {
        source: 'telegram',
        filePath,
        answers: normalized,
        raw: answers,
        meta
      }
    });

    session.briefId = briefId;
    session.lastSavedAt = new Date().toISOString();

    await writeLog('info', 'brief.saved', {
      projectId: session.projectId,
      briefId,
      filePath
    });

    const result = {
      briefId,
      projectId: session.projectId,
      filePath,
      answers: normalized,
      summary,
      meta
    };

    if (typeof onBriefSaved === 'function') {
      onBriefSaved(result);
    }

    return result;
  }

  function registerHandlers(bot, token) {
    bot.start(async (ctx) => {
      const chatId = ctx.chat.id;
      const session = ensureSession(chatId);
      const projectId = parseProjectId(ctx) || session.projectId;

      if (!projectId) {
        await ctx.reply('Укажите проект: /start project=<id>.');
        return;
      }

      session.projectId = projectId;
      session.createdAt = session.createdAt || new Date().toISOString();

      await writeLog('info', 'command.start', { chatId, projectId });

      await ctx.reply(
        'Готов к работе. Используйте /setup для запуска опроса и /finish для сохранения брифа.'
      );
    });

    bot.command('setup', async (ctx) => {
      const chatId = ctx.chat.id;
      const session = ensureSession(chatId);

      if (!session.projectId) {
        await ctx.reply('Сначала выполните /start project=<id>.');
        return;
      }

      const survey = buildSurvey({
        projectId: session.projectId,
        previousAnswers: session.answers,
        emphasis: ctx.message?.text?.includes('launch') ? 'launch' : undefined
      });

      session.flow = survey.steps;
      session.flowVersion = survey.version;
      session.stepIndex = 0;
      session.active = true;

      await writeLog('info', 'command.setup', {
        chatId,
        projectId: session.projectId,
        steps: survey.steps.length
      });

      if (survey.steps.length === 0) {
        await ctx.reply('Все ответы уже заполнены. При необходимости обновите /finish.');
        return;
      }

      const [firstStep] = survey.steps;
      await ctx.reply(firstStep.prompt + (firstStep.hint ? `\n${firstStep.hint}` : ''));
    });

    bot.command('finish', async (ctx) => {
      const chatId = ctx.chat.id;
      const session = ensureSession(chatId);

      if (!session.projectId) {
        await ctx.reply('Нет привязки к проекту. Укажите /start project=<id>.');
        return;
      }

      if (Object.keys(session.answers).length === 0) {
        await ctx.reply('Опрос пуст. Используйте /setup, чтобы заполнить бриф.');
        return;
      }

      const saved = await persistBrief(session, { tokenHash: crypto.createHash('sha1').update(token).digest('hex') });
      session.active = false;

      await ctx.reply('Бриф сохранён. Спасибо!');

      if (saved) {
        await ctx.reply(`Резюме: ${trimText(saved.summary, 160)}`);
      }
    });

    bot.on('text', async (ctx) => {
      const chatId = ctx.chat.id;
      const message = ctx.message?.text?.trim();
      const session = ensureSession(chatId);

      if (!session.active || !session.flow) {
        return;
      }

      const currentStep = session.flow[session.stepIndex];

      if (!currentStep) {
        session.active = false;
        return;
      }

      if (message && !message.startsWith('/')) {
        session.answers[currentStep.id] = message;
        session.stepIndex += 1;

        await writeLog('info', 'survey.answer', {
          chatId,
          projectId: session.projectId,
          field: currentStep.id
        });

        const nextStep = session.flow[session.stepIndex];

        if (nextStep) {
          await ctx.reply(nextStep.prompt + (nextStep.hint ? `\n${nextStep.hint}` : ''));
        } else {
          session.active = false;
          await ctx.reply('Ответы собраны. Отправьте /finish для сохранения.');
        }
      }
    });

    bot.catch(async (error, ctx) => {
      await writeLog('error', 'bot.catch', {
        message: error?.message,
        chatId: ctx?.chat?.id
      });
      state.status = 'error';
      state.lastError = error?.message || 'Unknown error';
      const restartAt = scheduleRestart(token);
      await writeLog('warn', 'bot.restart.scheduled', { restartAt });
    });
  }

  async function start(token) {
    if (!token) {
      throw new Error('Telegram token is required');
    }

    clearRestartTimer();

    if (botInstance) {
      await stop();
    }

    await ensureDirs();

    const bot = new Telegraf(token, { handlerTimeout: 60_000 });
    registerHandlers(bot, token);

    try {
      await bot.launch();
      const info = await bot.telegram.getMe();
      state.username = info.username || null;
      state.botId = info.id;
      state.startedAt = new Date().toISOString();
      state.status = 'running';
      state.lastError = null;
      botInstance = bot;
      await writeLog('info', 'bot.started', { username: state.username, botId: state.botId });
    } catch (error) {
      state.status = 'error';
      state.lastError = error?.message || 'Launch failed';
      await writeLog('error', 'bot.start.failed', { message: state.lastError });
      throw error;
    }

    return getStatus();
  }

  async function stop() {
    clearRestartTimer();

    if (botInstance) {
      try {
        await botInstance.stop('manual stop');
        await writeLog('info', 'bot.stopped');
      } catch (error) {
        await writeLog('error', 'bot.stop.failed', { message: error?.message });
      }
    }

    botInstance = null;
    state.status = 'idle';
    state.startedAt = null;
    return getStatus();
  }

  function getStatus() {
    return {
      status: state.status,
      startedAt: state.startedAt,
      username: state.username,
      botId: state.botId,
      lastError: state.lastError,
      sessions: sessions.size,
      restartPlanned: Boolean(restartTimer)
    };
  }

  return {
    start,
    stop,
    getStatus,
    persistBrief
  };
}
