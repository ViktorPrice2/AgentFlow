import fsp from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import keytar from 'keytar';
import Database from 'better-sqlite3';
import { createBriefSurvey, summarizeAnswers, buildExecutionPlan } from './survey.js';
import {
  resolveDataPath,
  assertAllowedPath,
  sanitizeFileName,
  redactSensitive
} from '../../core/utils/security.js';

const SERVICE_NAME = 'AgentFlowDesktop';
const TOKEN_ACCOUNT = 'telegram.bot.token';
const DEFAULT_RESTART_DELAY = 10_000;

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
      `Не удалось загрузить telegraf. Установите зависимость командой "npm install telegraf". Детали: ${error.message}`
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

function openDatabase(dbPath) {
  const safePath = assertAllowedPath(dbPath);
  const db = new Database(safePath);
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
  constructor({ dataDirectory, dbPath, logPath, restartDelay = DEFAULT_RESTART_DELAY } = {}) {
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
    this.restartDelay = restartDelay;
    this.sessions = new Map();
    this.running = false;
    this.startedAt = null;
    this.lastError = null;
    this.lastActivityAt = null;
    this.restartTimer = null;
    this.bot = null;
    this.botUsername = null;
    this.tokenCache = null;
  }

  async init() {
    await ensureDirectory(this.dataDirectory, { allowedRoots: this.allowedRoots });
    await ensureDirectory(path.dirname(this.logPath), { allowedRoots: this.allowedRoots });
    await ensureDirectory(this.briefsDirectory, { allowedRoots: this.allowedRoots });
    this.tokenCache = await keytar.getPassword(SERVICE_NAME, TOKEN_ACCOUNT);

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

  scheduleRestart(reason) {
    if (this.restartTimer) {
      return;
    }

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;

      try {
        await this.start();
        await this.log('info', 'Бот перезапущен автоматически', { reason });
      } catch (error) {
        this.lastError = error.message;
        await this.log('error', 'Сбой при авто-перезапуске бота', {
          reason,
          error: error.message
        });
        this.scheduleRestart('retry-after-error');
      }
    }, this.restartDelay);
  }

  cancelScheduledRestart() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  async setToken(token) {
    const trimmed = token?.trim() ?? '';

    if (trimmed.length > 0) {
      await keytar.setPassword(SERVICE_NAME, TOKEN_ACCOUNT, trimmed);
      this.tokenCache = trimmed;
      await this.log('info', 'Токен Telegram обновлён через UI');

      if (this.running) {
        await this.restart('token-updated');
      }

      return this.getStatus();
    }

    await keytar.deletePassword(SERVICE_NAME, TOKEN_ACCOUNT);
    this.tokenCache = null;
    await this.log('warn', 'Токен Telegram очищен через UI');

    if (this.running) {
      await this.stop('token-cleared');
    }

    return this.getStatus();
  }

  async restart(reason = 'manual-restart') {
    await this.stop(reason);
    return this.start();
  }

  async start() {
    if (this.running) {
      return this.getStatus();
    }

    this.cancelScheduledRestart();

    const token = this.tokenCache || (await keytar.getPassword(SERVICE_NAME, TOKEN_ACCOUNT));

    if (!token) {
      throw new Error('Токен Telegram не задан. Укажите его в настройках.');
    }

    const { Telegraf } = await ensureTelegrafModule();

    const bot = new Telegraf(token, { handlerTimeout: 90_000 });
    this.registerHandlers(bot);

    bot.catch(async (error, ctx) => {
      await this.log('error', 'Ошибка в обработчике Telegram', {
        error: error?.message,
        stack: error?.stack,
        chatId: ctx?.chat?.id
      });
      this.lastError = error.message;
      this.running = false;
      this.scheduleRestart('handler-error');
    });

    await bot.launch({ dropPendingUpdates: true });
    const info = await bot.telegram.getMe();

    this.bot = bot;
    this.running = true;
    this.startedAt = new Date();
    this.lastError = null;
    this.botUsername = info?.username ?? null;

    await this.log('info', 'Telegram-бот запущен', {
      username: this.botUsername,
      startedAt: this.startedAt.toISOString()
    });

    return this.getStatus();
  }

  async stop(reason = 'manual-stop') {
    this.cancelScheduledRestart();

    if (!this.bot) {
      this.running = false;
      return this.getStatus();
    }

    await this.bot.stop(reason);
    this.bot = null;
    this.running = false;
    await this.log('info', 'Telegram-бот остановлен', { reason });

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
          'Привет! Укажите проект вот так: /start project=PRJ_123. После этого используйте /setup для запуска опроса.'
        );
        return;
      }

      this.sessions.set(chatId, {
        chatId,
        projectId,
        answers: {},
        stepIndex: 0,
        active: false
      });

      await this.log('info', 'Получена команда /start', { chatId, projectId });
      await ctx.reply(
        `Готово! Проект ${projectId} закреплён. Запустите опрос командой /setup, чтобы собрать бриф.`
      );
    });

    bot.command('setup', async (ctx) => {
      this.lastActivityAt = new Date();
      const chatId = ctx.chat.id;
      const session = this.sessions.get(chatId);

      if (!session) {
        await ctx.reply('Сначала выполните /start project=ID, чтобы привязать чат к проекту.');
        return;
      }

      if (!session.active) {
        session.active = true;
        session.stepIndex = 0;
        session.survey = createBriefSurvey();
        await ctx.reply('Начинаем бриф. Отвечайте на вопросы одним сообщением. Чтобы остановить — команда /finish.');
      }

      await this.askNextQuestion(ctx, session);
    });

    bot.command('finish', async (ctx) => {
      this.lastActivityAt = new Date();
      await this.completeSession(ctx.chat.id, { ctx, reason: 'manual-finish' });
    });

    bot.on('text', async (ctx) => {
      this.lastActivityAt = new Date();
      const chatId = ctx.chat.id;
      const session = this.sessions.get(chatId);

      if (!session || !session.active) {
        return;
      }

      if (!session.survey || session.stepIndex >= session.survey.length) {
        await ctx.reply('Опрос завершён. Используйте /finish для сохранения результатов.');
        return;
      }

      const question = session.survey[session.stepIndex];
      session.answers[question.key] = ctx.message.text.trim();
      session.stepIndex += 1;

      await this.log('info', 'Ответ на вопрос брифа получен', {
        chatId,
        projectId: session.projectId,
        key: question.key
      });

      if (session.stepIndex >= session.survey.length) {
        await ctx.reply('Спасибо! Все ответы получены. Для завершения выполните /finish.');
      } else {
        await this.askNextQuestion(ctx, session);
      }
    });
  }

  async askNextQuestion(ctx, session) {
    if (!session.survey || session.stepIndex >= session.survey.length) {
      return;
    }

    const question = session.survey[session.stepIndex];
    const text = question.hint ? `${question.question}\n${question.hint}` : question.question;
    await ctx.reply(text);
  }

  async completeSession(chatId, { ctx = null, reason = 'auto-finish' } = {}) {
    const session = this.sessions.get(chatId);

    if (!session) {
      if (ctx) {
        await ctx.reply('Нет активного брифа. Запустите /start, чтобы создать новый.');
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

    await this.log('info', 'Бриф сохранён', {
      chatId,
      projectId: session.projectId,
      briefId,
      reason
    });

    this.emit('brief:updated', { projectId: session.projectId, briefId });

    this.sessions.delete(chatId);

    if (ctx) {
      await ctx.reply(`Бриф сохранён! ID: ${briefId}. Посмотрите его в AgentFlow Desktop.`);
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
      running: this.running,
      startedAt: this.startedAt ? this.startedAt.toISOString() : null,
      lastError: this.lastError,
      lastActivityAt: this.lastActivityAt ? this.lastActivityAt.toISOString() : null,
      tokenStored: Boolean(this.tokenCache),
      username: this.botUsername,
      deeplinkBase: this.botUsername ? `https://t.me/${this.botUsername}` : null
    };
  }
}

export function createTelegramBotService(options = {}) {
  const service = new TelegramBotService(options);
  return service;
}
