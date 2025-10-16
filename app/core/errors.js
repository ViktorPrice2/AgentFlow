import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const LOG_PATH = path.join(process.cwd(), 'data', 'logs', 'app-errors.jsonl');
const emitter = new EventEmitter();
let logDirEnsured = false;
let processHandlersRegistered = false;

async function ensureLogDir() {
  if (logDirEnsured) {
    return;
  }

  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  logDirEnsured = true;
}

function safeSerialize(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause ? safeSerialize(value.cause, seen) : undefined
    };
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return value.toString();
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => safeSerialize(item, seen));
  }

  if (typeof value === 'object') {
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, safeSerialize(item, seen)])
        .filter(([, item]) => item !== undefined)
    );
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return String(value);
  }
}

function emitEntry(entry) {
  emitter.emit('event', entry);
}

async function persistEntry(entry) {
  try {
    await ensureLogDir();
    await fs.appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to write error log entry', error);
  }
}

function buildEntry(level, message, details) {
  const normalizedDetails = details !== undefined ? safeSerialize(details) : undefined;

  return {
    level,
    message,
    details: normalizedDetails,
    timestamp: new Date().toISOString()
  };
}

function log(level, message, details) {
  const entry = buildEntry(level, message, details);
  emitEntry(entry);
  persistEntry(entry).catch(() => {});
  return entry;
}

export const errorBus = {
  info(message, details) {
    return log('info', message, details);
  },
  warn(message, details) {
    return log('warn', message, details);
  },
  error(message, details) {
    return log('error', message, details);
  },
  capture(error, context = {}) {
    if (!error) {
      return log('error', 'Unknown error', context);
    }

    const payload = {
      ...context,
      name: error.name,
      message: error.message,
      stack: error.stack
    };

    return log('error', error.message || 'Captured error', payload);
  },
  on(listener) {
    emitter.on('event', listener);
    return () => emitter.off('event', listener);
  },
  off(listener) {
    emitter.off('event', listener);
  }
};

export function registerProcessErrorHandlers({ source = 'main' } = {}) {
  if (processHandlersRegistered) {
    return;
  }

  processHandlersRegistered = true;

  process.on('uncaughtException', (error) => {
    errorBus.capture(error, { source, type: 'uncaughtException' });
  });

  process.on('unhandledRejection', (reason) => {
    if (reason instanceof Error) {
      errorBus.capture(reason, { source, type: 'unhandledRejection' });
      return;
    }

    errorBus.error('Unhandled promise rejection', {
      source,
      type: 'unhandledRejection',
      reason: safeSerialize(reason)
    });
  });
}

export function logRendererError(payload = {}) {
  const { message = 'Renderer error', level = 'error', ...details } = payload;
  return log(level, message, { source: 'renderer', ...details });
}

export function getErrorLogPath() {
  return LOG_PATH;
}
