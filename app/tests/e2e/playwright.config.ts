import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: __dirname,
  timeout: 45_000,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '../../dist/playwright-report', open: 'never' }]],
  use: {
    // Скриншоты/видео можно включить при падениях:
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  },
  // На Windows GUI-тесты стабильнее в headed в dev-режиме
  workers: 1
});
