import path from 'node:path';
import { createTelegramBotService } from '../services/tg-bot/index.js';

let telegramBotService;

async function ensureService() {
  if (!telegramBotService) {
    telegramBotService = createTelegramBotService({
      dataDirectory: path.join(__dirname, '../data'),
      dbPath: path.join(__dirname, '../data/app.db'),
      logPath: path.join(__dirname, '../data/logs/telegram-bot.jsonl')
    });
    await telegramBotService.init();
  }

  return telegramBotService;
}

function respond(ok, payload = {}) {
  return {
    ok,
    ...payload
  };
}

export async function registerTelegramIpcHandlers(ipcMain) {
  const service = await ensureService();

  ipcMain.handle('AgentFlow:bot:status', async () => {
    return respond(true, { status: service.getStatus() });
  });

  ipcMain.handle('AgentFlow:bot:setToken', async (_event, token) => {
    try {
      const status = await service.setToken(token);
      return respond(true, { status });
    } catch (error) {
      await service.log('error', 'Не удалось сохранить токен Telegram', { error: error.message });
      return respond(false, { error: error.message });
    }
  });

  ipcMain.handle('AgentFlow:bot:start', async () => {
    try {
      const status = await service.start();
      return respond(true, { status });
    } catch (error) {
      await service.log('error', 'Не удалось запустить Telegram-бота', { error: error.message });
      return respond(false, { error: error.message });
    }
  });

  ipcMain.handle('AgentFlow:bot:stop', async () => {
    try {
      const status = await service.stop('ipc-stop');
      return respond(true, { status });
    } catch (error) {
      await service.log('error', 'Не удалось остановить Telegram-бота', { error: error.message });
      return respond(false, { error: error.message });
    }
  });

  ipcMain.handle('AgentFlow:briefs:latest', async (_event, projectId) => {
    try {
      const brief = await service.latestBrief(projectId);
      return respond(true, { brief });
    } catch (error) {
      await service.log('error', 'Не удалось получить бриф', {
        error: error.message,
        projectId
      });
      return respond(false, { error: error.message });
    }
  });

  ipcMain.handle('AgentFlow:briefs:plan', async (_event, projectId) => {
    try {
      const result = await service.generatePlan(projectId);
      return respond(true, result);
    } catch (error) {
      await service.log('error', 'Не удалось сформировать план кампании', {
        error: error.message,
        projectId
      });
      return respond(false, { error: error.message });
    }
  });
}

export async function getTelegramBotStatus() {
  const service = await ensureService();
  return service.getStatus();
}
