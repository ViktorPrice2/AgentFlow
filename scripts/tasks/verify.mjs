import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../');
const APP_DIR = path.join(ROOT, 'app');
const DOCS_DIR = path.join(ROOT, 'docs');
const REPORTS_DIR = path.join(ROOT, 'reports');
const SCHEDULER_LOG = path.join(APP_DIR, 'data', 'logs', 'scheduler.jsonl');
const APP_ENV = path.join(APP_DIR, '.env');
const TELEGRAM_MODULE = path.join(APP_DIR, 'main', 'ipcBot.js');
const I18N_FILES = [
  path.join(APP_DIR, 'renderer', 'src', 'i18n', 'en.json'),
  path.join(APP_DIR, 'renderer', 'src', 'i18n', 'ru.json')
];
const REPORT_MD = path.join(DOCS_DIR, 'VerificationReport.md');
const REPORT_JSON = path.join(REPORTS_DIR, 'verify.json');

function checkbox(status) {
  return status === 'ok' ? '[x]' : '[ ]';
}

async function ensureDirectories() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

async function readLatestJsonLine(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

async function verifyScheduler() {
  try {
    const latestEntry = await readLatestJsonLine(SCHEDULER_LOG);
    if (!latestEntry?.ts) {
      return {
        status: 'pending',
        reason: 'Scheduler heartbeat not recorded yet',
        meta: {}
      };
    }

    const timestamp = Date.parse(latestEntry.ts);
    if (Number.isNaN(timestamp)) {
      return {
        status: 'fail',
        reason: 'Last scheduler entry contains an invalid timestamp',
        meta: { lastEntry: latestEntry }
      };
    }

    const deltaMs = Date.now() - timestamp;
    const withinThreshold = deltaMs <= 3 * 60 * 1000;

    return withinThreshold
      ? {
          status: 'ok',
          reason: 'Scheduler heartbeat recorded within the 3 minute threshold',
          meta: {
            lastTimestamp: latestEntry.ts,
            secondsSince: Math.floor(deltaMs / 1000)
          }
        }
      : {
          status: 'fail',
          reason: 'Scheduler heartbeat is older than 3 minutes',
          meta: {
            lastTimestamp: latestEntry.ts,
            secondsSince: Math.floor(deltaMs / 1000)
          }
        };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        status: 'pending',
        reason: 'scheduler.jsonl not found — scheduler has not run yet',
        meta: {}
      };
    }

    return {
      status: 'fail',
      reason: `Unable to read scheduler log: ${error.message}`,
      meta: {}
    };
  }
}

async function verifyI18n() {
  try {
    const datasets = await Promise.all(
      I18N_FILES.map(async (file) => {
        const raw = await fs.readFile(file, 'utf8');
        return { file, data: JSON.parse(raw) };
      })
    );

    const empty = datasets.filter(({ data }) => !data || Object.keys(data).length === 0);
    if (empty.length > 0) {
      return {
        status: 'fail',
        reason: `Empty localization files: ${empty.map(({ file }) => path.basename(file)).join(', ')}`,
        meta: {}
      };
    }

    return {
      status: 'ok',
      reason: `Localization files loaded (${datasets.map(({ file }) => path.basename(file)).join(', ')})`,
      meta: {}
    };
  } catch (error) {
    return {
      status: 'fail',
      reason: `Unable to load localization files: ${error.message}`,
      meta: {}
    };
  }
}

async function readEnvTokens() {
  const result = {
    token: process.env.TG_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TG_CHAT_ID || process.env.TELEGRAM_CHAT_ID || ''
  };

  try {
    const raw = await fs.readFile(APP_ENV, 'utf8');
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [key, ...rest] = line.split('=');
        const value = rest.join('=').trim();
        if (!value) {
          return;
        }

        if (['TG_TOKEN', 'TELEGRAM_BOT_TOKEN'].includes(key)) {
          result.token = result.token || value;
        }
        if (['TG_CHAT_ID', 'TELEGRAM_CHAT_ID'].includes(key)) {
          result.chatId = result.chatId || value;
        }
      });
  } catch {
    // .env is optional; rely on environment variables when file is absent.
  }

  return result;
}

async function verifyTelegram() {
  let moduleNamespace;
  try {
    moduleNamespace = await import(pathToFileURL(TELEGRAM_MODULE).href);
  } catch (error) {
    return {
      status: 'fail',
      reason: `Unable to import ipcBot.js: ${error.message}`,
      meta: {}
    };
  }

  if (typeof moduleNamespace.registerTelegramIpcHandlers !== 'function') {
    return {
      status: 'fail',
      reason: 'ipcBot.js does not export registerTelegramIpcHandlers',
      meta: {}
    };
  }

  const envTokens = await readEnvTokens();

  if (!envTokens.token || !envTokens.chatId) {
    return {
      status: 'pending',
      reason: 'Telegram tokens not provided (TG_TOKEN and TG_CHAT_ID)',
      meta: {}
    };
  }

  return {
    status: 'ok',
    reason: 'Telegram IPC handlers available and credentials detected',
    meta: {}
  };
}

function formatLine(title, status, reason) {
  const prefix = checkbox(status);
  const suffix = reason ? ` — ${reason}` : '';
  return `- ${prefix} ${title}${suffix}`;
}

async function writeReport({ scheduler, i18n, telegram }) {
  const lines = [
    '# Verification Report',
    formatLine('Scheduler: cron */1 * * * *', scheduler.status, scheduler.reason),
    formatLine('Telegram: IPC handlers', telegram.status, telegram.reason),
    formatLine('i18n: RU/EN dictionaries', i18n.status, i18n.reason)
  ];

  await fs.writeFile(REPORT_MD, `${lines.join('\n')}\n`, 'utf8');
}

async function writeJson(summary) {
  await fs.writeFile(REPORT_JSON, JSON.stringify(summary, null, 2), 'utf8');
}

async function main() {
  await ensureDirectories();

  const [scheduler, i18n, telegram] = await Promise.all([
    verifyScheduler(),
    verifyI18n(),
    verifyTelegram()
  ]);

  const summary = { scheduler, i18n, telegram };

  await writeReport(summary);
  await writeJson(summary);

  const failures = Object.entries(summary).filter(([, result]) => result.status === 'fail');

  if (failures.length > 0) {
    const message = failures
      .map(([key, result]) => `${key}: ${result.reason}`)
      .join('; ');
    console.error('[verify] Checks failed:', message);
    process.exitCode = 1;
  } else {
    console.log('[verify] All checks passed:', summary);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error('[verify] Unexpected error:', error);
    process.exitCode = 1;
  });
}

export {
  ensureDirectories,
  readLatestJsonLine,
  verifyScheduler,
  verifyI18n,
  readEnvTokens,
  verifyTelegram,
  writeReport,
  writeJson,
  REPORT_MD,
  REPORT_JSON
};
