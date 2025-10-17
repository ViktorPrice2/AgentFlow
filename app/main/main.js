import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createPluginRegistry } from '../core/pluginLoader.js';
import { registerIpcHandlers } from '../core/api.js';
import { createProviderManager } from '../core/providers/manager.js';
import { registerTelegramIpcHandlers } from './ipcBot.js';
import { createScheduler, registerSchedulerIpcHandlers } from '../core/scheduler.js';
import { errorBus, logRendererError, registerProcessErrorHandlers } from '../core/errors.js';
import { ensureMigrations } from './db/migrate.js';

const isDevelopment = process.env.NODE_ENV === 'development';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let pluginRegistry;
let providerManager;
let scheduler;
const rendererDistPath = path.join(__dirname, '../renderer/dist/index.html');
let mainWindowInstance;
const rendererEventQueue = [];
const RENDERER_EVENT_QUEUE_LIMIT = 100;

const queueRendererEvent = (event) => {
  if (rendererEventQueue.length >= RENDERER_EVENT_QUEUE_LIMIT) {
    rendererEventQueue.shift();
  }

  rendererEventQueue.push(event);
};

const getActiveWindows = () =>
  BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());

const getReadyWindows = () =>
  getActiveWindows().filter((window) => {
    const contents = window.webContents;
    return contents && !contents.isDestroyed() && !contents.isLoadingMainFrame();
  });

const flushRendererEvents = () => {
  if (!rendererEventQueue.length) {
    return;
  }

  const targets = getReadyWindows();

  if (!targets.length) {
    return;
  }

  const failed = [];

  while (rendererEventQueue.length) {
    const event = rendererEventQueue.shift();
    let deferred = false;

    targets.forEach((window) => {
      try {
        window.webContents.send(event.channel, event.payload);
      } catch (error) {
        console.error(`Failed to deliver renderer event "${event.channel}"`, error);
        deferred = true;
      }
    });

    if (deferred) {
      failed.push(event);
    }
  }

  failed.forEach((event) => queueRendererEvent(event));
};

const enqueueRendererEvent = (channel, payload) => {
  const targets = getReadyWindows();

  if (!targets.length) {
    queueRendererEvent({ channel, payload });
    return;
  }

  let deferred = false;

  targets.forEach((window) => {
    try {
      window.webContents.send(channel, payload);
    } catch (error) {
      console.error(`Failed to deliver renderer event "${channel}"`, error);
      deferred = true;
    }
  });

  if (deferred) {
    queueRendererEvent({ channel, payload });
  }
};

const trackRendererWindow = (window) => {
  if (!window || window.isDestroyed()) {
    return;
  }

  const handleFlush = () => {
    flushRendererEvents();
  };

  window.webContents.on('did-finish-load', handleFlush);
  window.once('ready-to-show', handleFlush);
  window.on('show', handleFlush);
  window.on('closed', () => {
    if (mainWindowInstance === window) {
      mainWindowInstance = null;
    }
  });
};

dotenv.config({ path: path.join(process.cwd(), '.env') });

registerProcessErrorHandlers({ source: 'main' });

const broadcastError = (entry) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('AgentFlow:error-bus:event', entry);
    }
  });
};

errorBus.on(broadcastError);

ipcMain.on('AgentFlow:error-bus:report', (_event, payload) => {
  logRendererError(payload);
});

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
      const message = 'Renderer dev server not reachable, falling back to dist build.';
      console.warn(message, error);
      errorBus.warn(message, { error: error?.message, stack: error?.stack });
    }
  }

  try {
    await fs.access(rendererDistPath);
    await window.loadFile(rendererDistPath);
  } catch (error) {
    errorBus.error('Failed to load renderer assets', { message: error?.message, stack: error?.stack });
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

  mainWindowInstance = window;
  trackRendererWindow(window);

  await loadRenderer(window);
  flushRendererEvents();

  return window;
};

const bootstrapCore = async () => {
  if (!pluginRegistry) {
    try {
      pluginRegistry = await createPluginRegistry();
    } catch (error) {
      errorBus.error('Failed to create plugin registry', { message: error?.message, stack: error?.stack });
      throw error;
    }
  }

  if (!providerManager) {
    try {
      providerManager = await createProviderManager();
    } catch (error) {
      errorBus.error('Failed to create provider manager', { message: error?.message, stack: error?.stack });
      throw error;
    }
  }

  registerIpcHandlers({ ipcMain, pluginRegistry, providerManager });

  if (!scheduler) {
    try {
      scheduler = createScheduler({ pluginRegistry, providerManager });
      await scheduler.start();
    } catch (error) {
      errorBus.error('Failed to start scheduler service', { message: error?.message, stack: error?.stack });
      throw error;
    }
  }

  registerSchedulerIpcHandlers(ipcMain, scheduler);

  try {
    await registerTelegramIpcHandlers(ipcMain, {
      onBriefUpdate: (payload) => {
        enqueueRendererEvent('brief:updated', payload);
      }
    });
  } catch (error) {
    const message = 'Failed to register Telegram IPC handlers';
    console.error(`${message}:`, error);
    errorBus.error(message, { message: error?.message, stack: error?.stack });
  }
};

app.on('browser-window-created', (_event, window) => {
  trackRendererWindow(window);
});

app.whenReady().then(async () => {
  try {
    await ensureMigrations();
  } catch (error) {
    errorBus.error('Failed to ensure database migrations', {
      message: error?.message,
      stack: error?.stack
    });
    throw error;
  }

  await bootstrapCore();

  try {
    await createMainWindow();
  } catch (error) {
    errorBus.error('Failed to create main window', { message: error?.message, stack: error?.stack });
    throw error;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow().catch((error) => {
        const message = 'Failed to create renderer window on activate';
        console.error(`${message}:`, error);
        errorBus.error(message, { message: error?.message, stack: error?.stack });
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
  if (scheduler) {
    try {
      await scheduler.stop();
    } catch (error) {
      const message = 'Failed to stop scheduler gracefully';
      console.error(`${message}:`, error);
      errorBus.error(message, { message: error?.message, stack: error?.stack });
    }
  }
});
