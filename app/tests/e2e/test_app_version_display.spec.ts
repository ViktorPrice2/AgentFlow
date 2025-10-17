import { test, expect } from '@playwright/test';
import { launchApp, closeApp } from './helpers/electronApp';
import pkg from '../../package.json' assert { type: 'json' };

test.describe('App version display', () => {
  test('версия из UI совпадает с package.json', async () => {
    const { app, page } = await launchApp();

    try {
      const expectedVersion = pkg.version;
      const message = `AgentFlow Desktop v${expectedVersion}`;

      // Отдаем версию в ErrorBus, чтобы она попала в UI (тост + лог-панель)
      await page.evaluate((text) => {
        const api = window as typeof window & {
          ErrorAPI?: { info?: (message: string, details?: Record<string, unknown>) => void };
        };
        api.ErrorAPI?.info?.(text);
      }, message);

      // Открываем панель логов
      const toggleButton = page.locator('button.header-button').first();
      const pressedState = await toggleButton.getAttribute('aria-pressed');
      if (pressedState !== 'true') {
        await toggleButton.click();
        await expect(toggleButton).toHaveAttribute('aria-pressed', 'true');
      }

      const logMessage = page.locator('.logs-panel .logs-panel__message').first();
      await expect(logMessage).toHaveText(new RegExp(`v${expectedVersion.replace(/\./g, '\\.')}`, 'i'), {
        timeout: 10_000
      });
    } finally {
      await closeApp(app);
    }
  });
});
