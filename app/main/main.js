import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPluginRegistry } from '../core/pluginLoader.js';
import { registerIpcHandlers } from '../core/api.js';

const isDevelopment = process.env.NODE_ENV === 'development';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let pluginRegistry;

const resolveRendererPath = () => {
  if (isDevelopment) {
    return process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
  }

  return path.join(__dirname, '../renderer/dist/index.html');
};

const createMainWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'AgentFlow Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const target = resolveRendererPath();

  if (isDevelopment && target.startsWith('http')) {
    window.loadURL(target);
    window.webContents.openDevTools({ mode: 'detach' });
  } else if (target.endsWith('.html')) {
    window.loadFile(target);
  }

  return window;
};

const bootstrapCore = async () => {
  if (!pluginRegistry) {
    pluginRegistry = await createPluginRegistry();
    registerIpcHandlers({ ipcMain, pluginRegistry });
  }
};

app.whenReady().then(async () => {
  await bootstrapCore();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
