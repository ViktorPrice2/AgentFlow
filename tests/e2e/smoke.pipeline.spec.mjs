import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../../app');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const DIST_DIR = path.join(APP_ROOT, 'renderer', 'dist');
const LOG_FILE = path.join(APP_ROOT, 'data', 'logs', 'app-start.jsonl');
const SCHEDULER_LOG = path.join(APP_ROOT, 'data', 'logs', 'scheduler.jsonl');

const E2E_STORAGE_KEY = 'af:e2e:mode';
const E2E_BRIDGE_CHANNEL = 'af:e2e:bridge';

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

  throw new Error(`Startup log from Electron did not appear within ${timeoutMs} ms`);
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

test.beforeEach(async ({ page }) => {
  if (!page || process.env.E2E !== '1') {
    return;
  }

  await page.addInitScript(
    (storageKey) => {
      try {
        window.sessionStorage.setItem(storageKey, '1');
      } catch (error) {
        // Storage might be disabled; ignore in that case.
      }
    },
    E2E_STORAGE_KEY
  );
});

test.describe('Electron smoke', () => {
  test('app starts and writes startup log', async () => {
    await resetStartupLog();

    const electronProcess = spawn(process.execPath, [path.join(APP_ROOT, 'scripts', 'run-electron.cjs')], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1'
      },
      stdio: 'inherit'
    });

    let logEntry;
    try {
      logEntry = await waitForLogCreation();
    } finally {
      electronProcess.kill('SIGINT');
      await new Promise((resolve) => electronProcess.once('exit', resolve));
    }

    expect(logEntry.event).toBe('app:start');
    expect(typeof logEntry.ts).toBe('string');
    expect(logEntry.data).toMatchObject({
      version: expect.any(String)
    });
  });

  test('supports language switch and scheduler smoke verify', async ({ page }) => {
    const { server, url } = await startStaticServer();

    try {
      await page.goto(url);
      await page.waitForSelector('[data-testid="app-root"]');

      await page.evaluate((bridgeChannel) => {
        const message = { bridge: bridgeChannel, type: 'SET_LANG', lang: 'ru' };

        if (window.e2e?.setLang) {
          window.e2e.setLang('ru');
        } else {
          window.postMessage(message, '*');
        }
      }, E2E_BRIDGE_CHANNEL);

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

  test('creates and removes fallback agents and pipelines', async ({ page }) => {
    const { server, url } = await startStaticServer();

    try {
      await page.goto(url);
      await page.waitForSelector('[data-testid="app-root"]');

      await page.evaluate((bridgeChannel) => {
        const message = { bridge: bridgeChannel, type: 'SET_LANG', lang: 'en' };

        if (window.e2e?.setLang) {
          window.e2e.setLang('en');
        } else {
          window.postMessage(message, '*');
        }
      }, E2E_BRIDGE_CHANNEL);
      await page.waitForTimeout(200);

      // Project creation unlocks dependent forms
      await expect(page.getByLabel('Name').first()).toBeVisible();
      await page.getByLabel('Name').first().fill('QA Project');
      await page.getByRole('button', { name: 'Save', exact: true }).first().click();
      await expect(page.locator('.toast')).toContainText('Project saved');
      await expect(
        page.getByRole('heading', { level: 4, name: 'QA Project' })
      ).toBeVisible();

      // Manage agent JSON config via fallback API
      await page.getByRole('button', { name: 'Agents' }).click();
      await page.waitForSelector('.agent-editor');

      const agentPayload = JSON.stringify(
        {
          id: 'QA-Agent',
          name: 'QA Agent',
          type: 'test',
          instructions: 'Playwright agent fixture',
          params: { mode: 'playwright' }
        },
        null,
        2
      );

      const agentForm = page.locator('.agent-editor .form');
      await agentForm.getByLabel('Agent payload (JSON)').fill(agentPayload);
      await agentForm.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.locator('.toast')).toContainText('Agent QA Agent saved');

      const agentRow = page.locator('tbody tr').filter({ hasText: 'QA Agent' });
      await expect(agentRow).toHaveCount(1);

      await page.once('dialog', (dialog) => dialog.accept());
      await agentRow.getByRole('button', { name: 'Delete' }).click();
      await expect(page.locator('.toast')).toContainText('Agent QA Agent removed');
      await expect(agentRow).toHaveCount(0);

      // Create and delete a pipeline using fallback storage
      await page.getByRole('button', { name: 'Pipelines' }).click();
      await page.waitForSelector('.pipeline-steps');

      const pipelineForm = page.locator('form').filter({
        has: page.locator('.pipeline-steps')
      });

      await pipelineForm.getByLabel('Identifier').fill('qa-pipeline');
      await pipelineForm.getByLabel('Name').fill('QA Pipeline');
      await pipelineForm
        .getByLabel('Description')
        .fill('Playwright generated pipeline');

      await pipelineForm.getByRole('button', { name: 'Save pipeline' }).click();
      await expect(page.locator('.toast')).toContainText(
        'Pipeline "QA Pipeline" saved'
      );

      const pipelineCard = page
        .locator('.pipeline-card')
        .filter({ hasText: 'QA Pipeline' });
      await expect(pipelineCard).toHaveCount(1);

      await page.once('dialog', (dialog) => dialog.accept());
      await pipelineCard.getByRole('button', { name: 'Delete' }).click();
      await expect(page.locator('.toast')).toContainText(
        'Pipeline "QA Pipeline" removed'
      );
      await expect(pipelineCard).toHaveCount(0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

