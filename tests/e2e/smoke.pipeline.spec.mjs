import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../../app');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const DIST_DIR = path.join(APP_ROOT, 'renderer', 'dist');
const LOG_FILE = path.join(APP_ROOT, 'data', 'logs', 'app-start.jsonl');
const SCHEDULER_LOG = path.join(APP_ROOT, 'data', 'logs', 'scheduler.jsonl');

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

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Лог запуска Electron не появился за ${timeoutMs} мс`);
}

async function appendSchedulerLogEntry() {
  const entry = {
    ts: new Date().toISOString(),
    event: 'scheduler:tick',
    data: { source: 'e2e' }
  };

  await fs.mkdir(path.dirname(SCHEDULER_LOG), { recursive: true });
  await fs.appendFile(SCHEDULER_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
}

function getContentType(filePath) {
  const ext = path.extname(filePath);
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function startStaticServer() {
  await fs.access(path.join(DIST_DIR, 'index.html'));

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = new URL(req.url, 'http://localhost').pathname;
        const relativePath = urlPath === '/' ? '/index.html' : urlPath;
        const targetPath = path.join(DIST_DIR, relativePath);

        const normalized = path.normalize(targetPath);
        if (!normalized.startsWith(DIST_DIR)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        const data = await fs.readFile(normalized);
        res.statusCode = 200;
        res.setHeader('Content-Type', getContentType(normalized));
        res.end(data);
      } catch (error) {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}`
      });
    });
  });
}

test.describe('Electron smoke', () => {
  test('приложение стартует и пишет лог запуска', async () => {
    await resetStartupLog();

    const rendererEntry = path.join(APP_ROOT, 'renderer', 'dist', 'index.html');

    const electronProcess = spawn(process.execPath, [path.join(APP_ROOT, 'scripts', 'run-electron.cjs')], {
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

  test('переключение языка и smoke Scheduler', async ({ page }) => {
    const { server, url } = await startStaticServer();

    try {
      await page.goto(url);
      await page.waitForSelector('[data-testid="app-root"]');

      await page.evaluate(() => {
        if (window.e2e?.setLang) {
          window.e2e.setLang('ru');
        } else {
          window.postMessage({ __e2e__: true, type: 'SET_LANG', lang: 'ru' }, '*');
        }
      });

      await page.waitForTimeout(200);
      await expect(page.getByText('Проекты').first()).toBeVisible();

      await appendSchedulerLogEntry();

      const verifyScript = path.join(REPO_ROOT, 'scripts', 'tasks', 'verify.mjs');
      const verifyResult = spawnSync('node', [verifyScript], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          TG_TOKEN: process.env.TG_TOKEN || 'dummy-token',
          TG_CHAT_ID: process.env.TG_CHAT_ID || 'dummy-chat'
        },
        stdio: 'inherit'
      });

      expect(verifyResult.status).toBe(0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
