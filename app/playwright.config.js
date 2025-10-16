import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: path.join(process.cwd(), 'tests'),
  testMatch: /e2e_.*\.test\.mjs$/,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    headless: true
  },
  timeout: 60_000
});
