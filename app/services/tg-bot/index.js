import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { getDatabaseFilePath } from '../../db/migrate.js';
import { generateSurvey } from './survey.js';
import keytar from 'keytar';

const DATA_DIR = path.join(process.cwd(), 'data');
const BRIEFS_DIR = path.join(DATA_DIR, 'briefs');
const LOG_FILE = path.join(DATA_DIR, 'logs', 'telegram-bot.jsonl');

const _KEYTAR_SERVICE = 'agentflow';
const _KEYTAR_ACCOUNT = 'telegram-bot';

function now() { return new Date().toISOString(); }
async function ensureDirs() {
  await fs.mkdir(BRIEFS_DIR, { recursive: true });
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
}
async function appendLog(entry) {
  const line = JSON.stringify({ ts: now(), ...entry }) + '\n';
  await fs.appendFile(LOG_FILE, line, 'utf8');
}

function openDb() {
  const dbFile = getDatabaseFilePath();
  return new Database(dbFile);
}

// Minimal mock bot to avoid startup crash when 'telegraf' is missing.
class MockBot {
  constructor(token) {
    this.token = token;
    this._commands = new Map();
    this._messageHandler = null;
    this._catch = () => {};
  }
  command(name, fn) { this._commands.set(name, fn); }
  on(evt, fn) { if (evt === 'message') this._messageHandler = fn; }
  catch(fn) { this._catch = fn; }
  async launch() {
    await appendLog({ event: 'bot_launch_mock', data: { tokenPresent: !!this.token } });
    return;
  }
  async stop() {
    await appendLog({ event: 'bot_stop_mock' });
    return;
  }
  // helper to simulate incoming message (not used in MVP)
  async _simulateMessage(cmdText, from = { username: 'mock' }) {
    const ctx = { message: { text: cmdText }, from, reply: async (t) => {} };
    const m = cmdText.split(' ')[0].replace('/', '');
    if (this._commands.has(m)) {
      try { await this._commands.get(m)(ctx); } catch (e) { this._catch(e); }
    } else if (this._messageHandler) {
      try { await this._messageHandler(ctx); } catch (e) { this._catch(e); }
    }
  }
}

export function createTgBotManager({ notify } = {}) {
  let bot = null;
  let tokenStored = null;
  let restarting = false;

  async function _upsertBriefToDb(brief) {
    const db = openDb();
    try {
      const sql = `
        INSERT INTO Briefs (id, projectId, title, content, status, source, metadata, createdAt, updatedAt)
        VALUES (@id,@projectId,@title,@content,@status,@source,@metadata,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          content=excluded.content,
          title=excluded.title,
          status=excluded.status,
          metadata=excluded.metadata,
          updatedAt=CURRENT_TIMESTAMP;
      `;
      db.prepare(sql).run({
        id: brief.id,
        projectId: brief.projectId,
        title: brief.title || '',
        content: typeof brief.content === 'object' ? JSON.stringify(brief.content) : (brief.content || ''),
        status: brief.status || 'draft',
        source: brief.source || 'telegram',
        metadata: brief.metadata ? JSON.stringify(brief.metadata) : null
      });
    } finally {
      db.close();
    }
  }

  async function saveBriefFile(brief) {
    await ensureDirs();
    const filePath = path.join(BRIEFS_DIR, `${brief.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(brief, null, 2), 'utf8');
    return filePath;
  }

  async function _handleStartCommand(ctx) {
    const text = ctx.message.text || '';
    const m = text.match(/project=([A-Za-z0-9\-_]+)/i);
    const projectId = m ? m[1] : null;
    const briefId = randomUUID();
    const survey = generateSurvey(projectId, { user: ctx.from });
    const brief = {
      id: briefId,
      projectId: projectId || null,
      title: `Бриф от @${ctx.from.username || ctx.from.first_name || 'telegram'}`,
      content: survey, // store structured survey
      status: 'new',
      source: 'telegram',
      metadata: { from: ctx.from, via: '/start' },
      createdAt: new Date().toISOString()
    };
    try {
      const filePath = await saveBriefFile(brief);
      await _upsertBriefToDb(brief);
      await appendLog({ event: 'brief_created', data: { briefId, projectId, filePath } });
      if (ctx.reply) await ctx.reply('Бриф принят. Спасибо!');
      if (notify) notify('brief:updated', { projectId: brief.projectId, briefId: brief.id });
    } catch (err) {
      await appendLog({ event: 'error', data: { message: String(err) } });
      if (ctx.reply) await ctx.reply('Ошибка при сохранении брифа.');
    }
  }

  async function _handleSetup(ctx) {
    if (ctx.reply) await ctx.reply('Настройка бота: отправьте /start project=<id> чтобы привязать проект.');
  }

  async function _handleFinish(ctx) {
    if (ctx.reply) await ctx.reply('Финиш. Спасибо!');
  }

  function _attachHandlers(instance) {
    instance.command('start', (ctx) => _handleStartCommand(ctx));
    instance.command('setup', (ctx) => _handleSetup(ctx));
    instance.command('finish', (ctx) => _handleFinish(ctx));
    instance.on('message', (ctx) => {
      if ((ctx.message.text||'').startsWith('/')) return;
      if (ctx.reply) ctx.reply('Отправьте /start project=<id> чтобы создать бриф.');
    });
  }

  async function _loadTelegraf() {
    try {
      const mod = await import('telegraf');
      // telegraf exports Telegraf class
      return mod.Telegraf || mod.default || null;
    } catch (e) {
      // package not installed or failed import
      await appendLog({ event: 'telegraf_import_failed', data: { message: String(e) } });
      return null;
    }
  }

  async function start(token) {
    if (!token) throw new Error('token-required');
    tokenStored = token;
    if (bot) return { running: true };

    // try to load real Telegraf dynamically
    const TelegrafClass = await _loadTelegraf();
    try {
      if (TelegrafClass) {
        bot = new TelegrafClass(token);
        _attachHandlers(bot);
        await bot.launch({ polling: true });
        await appendLog({ event: 'bot_started', data: { mode: 'telegraf' } });
        bot.catch(async (err) => {
          await appendLog({ event: 'bot_error', data: { message: String(err) } });
          if (!restarting) {
            restarting = true;
            setTimeout(async () => { restarting = false; try { await restart(); } catch (e) {} }, 5000);
          }
        });
        return { running: true, mode: 'telegraf' };
      } else {
        // fallback to mock bot
        bot = new MockBot(token);
        _attachHandlers(bot);
        await bot.launch();
        await appendLog({ event: 'bot_started', data: { mode: 'mock' } });
        return { running: true, mode: 'mock' };
      }
    } catch (err) {
      await appendLog({ event: 'start_failed', data: { message: String(err) } });
      throw err;
    }
  }

  async function stop() {
    if (!bot) return { running: false };
    try {
      await bot.stop();
    } catch (e) { /* ignore */ }
    bot = null;
    await appendLog({ event: 'bot_stopped' });
    return { running: false };
  }

  async function restart() {
    await stop();
    if (!tokenStored) throw new Error('no-token');
    return start(tokenStored);
  }

  function status() {
    return { running: !!bot, mode: bot instanceof MockBot ? 'mock' : 'real' };
  }

  return {
    start, stop, status, restart
  };
}

// create a singleton manager for convenience (no notify by default)
let _botManager = createTgBotManager({ notify: null });

export function setNotify(fn) {
  // replace manager with one that calls notify when events occur
  _botManager = createTgBotManager({ notify: typeof fn === 'function' ? fn : null });
  return true;
}

export function onBriefUpdated(cb) {
  if (typeof cb !== 'function') return false;
  // replace notify with a forwarder that only calls the provided callback for brief:updated
  setNotify((event, payload) => {
    try {
      if (event === 'brief:updated') {
        cb(payload);
      }
    } catch (e) {
      // swallow subscriber errors to avoid crashing main
    }
  });
  return true;
}

export async function startBot(token) {
  return _botManager.start(token);
}

export async function stopBot() {
  return _botManager.stop();
}

export function getBotStatus() {
  return _botManager.status();
}

export async function restartBot() {
  return _botManager.restart();
}

/* Store token securely via keytar */
export async function setBotToken(token) {
  if (!token) throw new Error('token-empty');
  await keytar.setPassword(_KEYTAR_SERVICE, _KEYTAR_ACCOUNT, token);
  return { ok: true };
}

/* Return stored token (may be null) */
export async function getStoredBotToken() {
  const t = await keytar.getPassword(_KEYTAR_SERVICE, _KEYTAR_ACCOUNT);
  return t;
}
