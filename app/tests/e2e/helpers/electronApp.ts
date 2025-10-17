import { _electron as electron, ElectronApplication, Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  // Стартуем Electron с текущим main-скриптом ('.')
  const app = await electron.launch({
    args: ['.'], // точка: main процесс из корня app/
    env: {
      NODE_ENV: 'development',
      ELECTRON_DISABLE_SANDBOX: '1',
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_DEBUG: '1',
      VITE_DEV_SERVER_URL: 'http://localhost:5173'
    }
  });

  // Ждем первое окно
  const page = await app.firstWindow();

  // Гарантируем, что UI прогрузился (шапка/меню видны)
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.app-container', { timeout: 15_000 });

  // Помним, где полезные логи
  const appData = process.env.APPDATA || '';
  const logHint = path.join(appData, 'AgentFlow', 'data', 'logs');
  if (fs.existsSync(logHint)) {
    console.log('[e2e] Logs dir:', logHint);
  }

  return { app, page };
}

export async function closeApp(app: ElectronApplication) {
  try {
    await app.close();
  } catch {
    // ignore
  }
}
