import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../../app');
const LOG_FILE = path.join(APP_ROOT, 'data', 'logs', 'app-start.jsonl');
const requireFromApp = createRequire(path.join(APP_ROOT, 'package.json'));
const { test, expect } = requireFromApp('@playwright/test');

async function resetStartupLog() {
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.rm(LOG_FILE, { force: true });
}

async function waitForLogCreation(timeoutMs = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const contents = await fs.readFile(LOG_FILE, 'utf8');
      const lines = contents
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length > 0) {
        return JSON.parse(lines[lines.length - 1]);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Лог запуска Electron не появился за ${timeoutMs} мс`);
}

test.describe('Electron smoke', () => {
  test('приложение стартует и пишет лог запуска', async () => {
    const rendererEntry = path.join(APP_ROOT, 'renderer', 'dist', 'index.html');
    try {
      await fs.access(rendererEntry);
    } catch {
      throw new Error(
        'prod-сборка UI отсутствует. Запустите "npm run build:renderer" перед e2e-тестами.'
      );
    }

    await resetStartupLog();

    const launcherScript = path.join(APP_ROOT, 'scripts', 'run-electron.cjs');
    const electronProcess = spawn(process.execPath, [launcherScript], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_RENDERER_URL: `file://${rendererEntry.replace(/\\/g, '/')}`
      },
      stdio: 'ignore',
      detached: false,
      windowsHide: true
    });

    let logEntry;
    try {
      logEntry = await waitForLogCreation();
    } finally {
      if (electronProcess.exitCode === null) {
        electronProcess.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (electronProcess.exitCode === null) {
          electronProcess.kill('SIGKILL');
        }
      }
    }

    expect(logEntry).toBeTruthy();
    expect(logEntry.event).toBe('app:start');
    expect(typeof logEntry.ts).toBe('string');
    expect(logEntry.data).toMatchObject({
      version: expect.any(String)
    });
  });

  test.skip('переключение языка и smoke Scheduler', () => {
    // TODO: после добавления e2e-адаптеров для UI снять skip и реализовать сценарий.
  });
});
