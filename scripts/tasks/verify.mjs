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

  if (!lines.length) {
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
        status: 'fail',
        reason: 'Нет валидной записи в журнале scheduler.jsonl'
      };
    }

    const ts = Date.parse(latestEntry.ts);
    if (Number.isNaN(ts)) {
      return {
        status: 'fail',
        reason: 'Некорректная временная метка последнего запуска'
      };
    }

    const deltaMs = Date.now() - ts;
    const withinThreeMinutes = deltaMs <= 3 * 60 * 1000;

    return withinThreeMinutes
      ? {
          status: 'ok',
          reason: `Последний запуск ${Math.round(deltaMs / 1000)} секунд назад`
        }
      : {
          status: 'fail',
          reason: 'Планировщик не запускался в течение последних 3 минут'
        };
  } catch (error) {
    return {
      status: 'fail',
      reason: `Не удалось прочитать журнал планировщика: ${error.message}`
    };
  }
}

async function verifyI18n() {
  try {
    const datasets = await Promise.all(
      I18N_FILES.map(async (file) => {
        const raw = await fs.readFile(file, 'utf8');
        const data = JSON.parse(raw);
        return { file, data };
      })
    );

    const emptyFiles = datasets.filter(({ data }) => !data || Object.keys(data).length === 0);

    if (emptyFiles.length > 0) {
      return {
        status: 'fail',
        reason: `Найдены пустые словари: ${emptyFiles
          .map(({ file }) => path.basename(file))
          .join(', ')}`
      };
    }

    return {
      status: 'ok',
      reason: `Словари загружены (${datasets.map(({ file }) => path.basename(file)).join(', ')})`
    };
  } catch (error) {
    return {
      status: 'fail',
      reason: `Ошибка чтения словарей i18n: ${error.message}`
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
    // .env может отсутствовать — не критично
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
      reason: `Не удалось импортировать ipcBot.js: ${error.message}`
    };
  }

  const hasHandler = typeof moduleNamespace.registerTelegramIpcHandlers === 'function';

  if (!hasHandler) {
    return {
      status: 'fail',
      reason: 'Не найден export registerTelegramIpcHandlers в ipcBot.js'
    };
  }

  const envTokens = await readEnvTokens();

  if (!envTokens.token || !envTokens.chatId) {
    return {
      status: 'pending',
      reason: 'Telegram токены отсутствуют (ожидаются ключи TG_TOKEN и TG_CHAT_ID)'
    };
  }

  return {
    status: 'ok',
    reason: 'Telegram IPC зарегистрирован, токены заданы'
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
    formatLine('Scheduler: cron */1 * * * * запускается', scheduler.status, scheduler.reason),
    formatLine('Telegram: IPC и токены', telegram.status, telegram.reason),
    formatLine('i18n: RU/EN словари загружены', i18n.status, i18n.reason)
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

  const failures = Object.entries(summary).filter(
    ([, result]) => result.status === 'fail'
  );

  if (failures.length > 0) {
    console.error(
      '[verify] Обнаружены проблемы:',
      failures.map(([key, result]) => `${key}: ${result.reason}`).join('; ')
    );
  } else {
    console.log('[verify] Проверка выполнена', summary);
  }
}

main().catch((error) => {
  console.error('[verify] Непредвиденная ошибка:', error);
  process.exitCode = 1;
});
