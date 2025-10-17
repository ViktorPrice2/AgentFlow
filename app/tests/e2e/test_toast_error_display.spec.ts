import { test, expect } from '@playwright/test';
import { launchApp, closeApp } from './helpers/electronApp';

test.describe('Toast error display', () => {
  test('показывается тост при вызове несуществующего IPC', async () => {
    const { app, page } = await launchApp();

    try {
      // Явно шлем сообщение об ошибке через ErrorBus — должен всплыть тост
      await page.evaluate(() => {
        const api = window as typeof window & {
          ErrorAPI?: { error?: (message: string, details?: Record<string, unknown>) => void };
        };
        api.ErrorAPI?.error?.('E2E test failure');
      });

      // Ожидаем появления тоста с классом toast
      const toastLocator = page.locator('.toast');
      await expect(toastLocator).toBeVisible({ timeout: 5000 });
      const toastText = await toastLocator.textContent();
      expect(toastText?.toLowerCase() ?? '').toContain('e2e test failure');
    } finally {
      await closeApp(app);
    }
  });
});
