import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import keytar from 'keytar';
import Database from 'better-sqlite3';
import { createPluginRegistry } from '../core/pluginLoader.js';
import { registerIpcHandlers } from '../core/api.js';
import { createProviderManager } from '../core/providers/manager.js';
import { runMigrations, getDatabasePath } from '../db/migrate.js';
import { createTelegramBotService } from '../services/tg-bot/index.js';

const isDevelopment = process.env.NODE_ENV === 'development';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let pluginRegistry;
let providerManager;
let telegramService;
const KEYTAR_SERVICE = 'AgentFlowDesktop';
const KEYTAR_ACCOUNT = 'telegramBotToken';
const rendererDistPath = path.join(__dirname, '../renderer/dist/index.html');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const resolveRendererPath = () => {
  if (isDevelopment) {
    return process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
  }

  return rendererDistPath;
};

const loadRenderer = async (window) => {
  const target = resolveRendererPath();

  if (isDevelopment && target.startsWith('http')) {
    try {
      await window.loadURL(target);
      window.webContents.openDevTools({ mode: 'detach' });
      return;
    } catch (error) {
      console.warn('Renderer dev server not reachable, falling back to dist build.', error);
    }
  }

  try {
    await fs.access(rendererDistPath);
    await window.loadFile(rendererDistPath);
  } catch (error) {
    const fallbackHtml = `
      <!doctype html>
      <html lang="ru">
        <head>
          <meta charset="UTF-8" />
          <title>AgentFlow Desktop</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #111827; color: #f9fafb; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
            .panel { max-width: 560px; padding: 32px; background: rgba(15, 23, 42, 0.85); border-radius: 16px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45); }
            h1 { margin-top: 0; font-size: 28px; }
            ol { margin: 16px 0 0; padding-left: 20px; line-height: 1.6; }
            code { background: rgba(148, 163, 184, 0.2); padding: 2px 6px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="panel">
            <h1>Renderer недоступен</h1>
            <p>Запустите UI перед Electron или соберите Vite-проект:</p>
            <ol>
              <li>В терминале: <code>npm install</code></li>
              <li>Затем: <code>npm run dev</code></li>
              <li>Если нужен оффлайн режим: <code>npm run build:ui</code></li>
            </ol>
          </div>
        </body>
      </html>
    `;

    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`);
  }
};

const createMainWindow = async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'AgentFlow Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await loadRenderer(window);

  return window;
};

const bootstrapCore = async () => {
  if (!pluginRegistry) {
    pluginRegistry = await createPluginRegistry();
  }

  if (!providerManager) {
    providerManager = await createProviderManager();
  }

  registerIpcHandlers({ ipcMain, pluginRegistry, providerManager });
};

const ensureTelegramService = () => {
  if (!telegramService) {
    telegramService = createTelegramBotService({
      onBriefSaved: (payload) => {
        BrowserWindow.getAllWindows().forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send('AgentFlow:brief:updated', payload);
          }
        });
      }
    });
  }

  return telegramService;
};

const getStoredToken = async () => {
  try {
    return await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch (error) {
    console.error('Failed to read Telegram token from keytar', error);
    throw error;
  }
};

const setStoredToken = async (token) => {
  if (!token) {
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    return;
  }

  await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token);
};

const getLatestBrief = (projectId) => {
  if (!projectId) {
    return null;
  }

  const db = new Database(getDatabasePath());
  try {
    const row = db
      .prepare(
        `SELECT id, projectId, title, summary, payload, updatedAt FROM Briefs WHERE projectId = ? ORDER BY updatedAt DESC LIMIT 1`
      )
      .get(projectId);

    if (!row) {
      return null;
    }

    let parsedPayload = null;

    try {
      parsedPayload = row.payload ? JSON.parse(row.payload) : null;
    } catch (error) {
      console.warn('Failed to parse brief payload', error);
    }

    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      summary: row.summary,
      payload: parsedPayload,
      updatedAt: row.updatedAt
    };
  } finally {
    db.close();
  }
};

const registerTelegramIpc = () => {
  ipcMain.handle('AgentFlow:bot:status', async () => {
    const service = ensureTelegramService();
    const status = service.getStatus();
    const token = await getStoredToken();

    return {
      ok: true,
      status,
      hasToken: Boolean(token)
    };
  });

  ipcMain.handle('AgentFlow:bot:setToken', async (_event, token) => {
    await setStoredToken(token);
    return { ok: true };
  });

  ipcMain.handle('AgentFlow:bot:start', async () => {
    const token = await getStoredToken();

    if (!token) {
      throw new Error('Не задан токен Telegram. Укажите его в настройках.');
    }

    const service = ensureTelegramService();
    const status = await service.start(token);
    return { ok: true, status };
  });

  ipcMain.handle('AgentFlow:bot:stop', async () => {
    if (!telegramService) {
      return { ok: true, status: { status: 'idle' } };
    }

    const status = await telegramService.stop();
    return { ok: true, status };
  });

  ipcMain.handle('AgentFlow:briefs:getLatest', async (_event, projectId) => {
    const brief = getLatestBrief(projectId);
    return { ok: true, brief };
  });
};

app.whenReady().then(async () => {
  await runMigrations();
  await bootstrapCore();
  registerTelegramIpc();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow().catch((error) => {
        console.error('Failed to create renderer window on activate:', error);
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (telegramService) {
    try {
      await telegramService.stop();
    } catch (error) {
      console.error('Failed to stop Telegram bot on quit', error);
    }
  }
});
