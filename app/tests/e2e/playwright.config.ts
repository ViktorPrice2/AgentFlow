import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: __dirname,
  timeout: 45_000,
  retries: 0,
  reporter: [
    ['list'],
    ['junit', { outputFile: '../../reports/e2e/smoke.xml' }],
    ['html', { outputFolder: '../../reports/e2e/html', open: 'never' }]
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  },
  workers: 1
});
