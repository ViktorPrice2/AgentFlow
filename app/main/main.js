import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createPluginRegistry } from '../core/pluginLoader.js';
import { registerIpcHandlers } from '../core/api.js';
import { createProviderManager } from '../core/providers/manager.js';
import { runMigrations } from '../db/migrate.js';
import { registerBotIpc } from './ipc/botIpc.js';
import { registerDataIpcHandlers } from './ipc/dataIpc.js';
import { stopBot } from '../services/tg-bot/index.js';
import createScheduler from '../core/scheduler.js';

const isDevelopment = process.env.NODE_ENV === 'development';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let pluginRegistry;
let providerManager;
const rendererDistPath = path.join(__dirname, '../renderer/dist/index.html');
const cleanupHandlers = [];

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

app.whenReady().then(async () => {
  await runMigrations();
  await bootstrapCore();
  const mainWindow = await createMainWindow();

  // register bot IPC and pass mainWindow for notifications
  registerBotIpc(mainWindow);

  // Initialize provider manager
  const providersConfigPath = path.join(process.cwd(), 'app', 'config', 'providers.json');
  global.providerManager = createProviderManager(providersConfigPath);

  // Initialize scheduler and start
  try {
    global.scheduler = createScheduler();
    await global.scheduler.start();
    console.info('[main] scheduler started');
  } catch (e) {
    console.warn('[main] scheduler failed to start', e);
  }

  // register core ipc handlers
  registerIpcHandlers();

  const dataCleanup = registerDataIpcHandlers(ipcMain);
  if (typeof dataCleanup === 'function') {
    cleanupHandlers.push(dataCleanup);
  }

  const botCleanup = registerBotIpcHandlers(ipcMain);
  if (typeof botCleanup === 'function') {
    cleanupHandlers.push(botCleanup);
  }

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

app.on('before-quit', () => {
  stopBot({ silent: true }).catch((error) => {
    console.error('Failed to stop Telegram bot on quit:', error);
  });

  while (cleanupHandlers.length > 0) {
    const cleanup = cleanupHandlers.pop();
    try {
      cleanup();
    } catch (error) {
      console.error('Error during IPC cleanup:', error);
    }
  }
});
