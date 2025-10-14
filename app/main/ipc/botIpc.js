import { BrowserWindow } from 'electron';
import {
  getBotStatus,
  setBotToken,
  startBot,
  stopBot,
  onBriefUpdated
} from '../../services/tg-bot/index.js';

export function registerBotIpcHandlers(ipcMain) {
  if (!ipcMain) {
    throw new Error('ipcMain is required to register bot handlers');
  }

  ipcMain.handle('AgentFlow:bot:status', async () => {
    return getBotStatus();
  });

  ipcMain.handle('AgentFlow:bot:setToken', async (_event, token) => {
    await setBotToken(token);

    return getBotStatus();
  });

  ipcMain.handle('AgentFlow:bot:start', async () => {
    return startBot();
  });

  ipcMain.handle('AgentFlow:bot:stop', async () => {
    return stopBot();
  });

  const unsubscribe = onBriefUpdated((payload) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('AgentFlow:brief:updated', payload);
      }
    });
  });

  return () => {
    unsubscribe();
    ipcMain.removeHandler('AgentFlow:bot:status');
    ipcMain.removeHandler('AgentFlow:bot:setToken');
    ipcMain.removeHandler('AgentFlow:bot:start');
    ipcMain.removeHandler('AgentFlow:bot:stop');
  };
}
