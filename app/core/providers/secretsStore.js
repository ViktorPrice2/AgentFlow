import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveDataPath, assertAllowedPath } from '../utils/security.js';

const FILE_PATH = resolveDataPath('config', 'provider-secrets.json');
const FILE_DIR = path.dirname(FILE_PATH);
const FILE_VERSION = 1;

function maskSecret(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length <= 4) {
    return '****';
  }

  return `****${trimmed.slice(-4)}`;
}

async function readSecretsFile() {
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return { version: FILE_VERSION, secrets: {} };
    }

    const secrets = parsed.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {};

    return {
      version: parsed.version || FILE_VERSION,
      secrets,
      updatedAt: parsed.updatedAt || null
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: FILE_VERSION, secrets: {}, updatedAt: null };
    }

    throw error;
  }
}

async function writeSecretsFile(payload) {
  const content = {
    version: FILE_VERSION,
    updatedAt: new Date().toISOString(),
    secrets: payload.secrets || {}
  };

  await fs.mkdir(FILE_DIR, { recursive: true });
  assertAllowedPath(FILE_PATH);
  await fs.writeFile(FILE_PATH, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  return content;
}

function normalizeSecretEntry(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed ? { value: trimmed, updatedAt: null } : null;
  }

  if (typeof entry.value === 'string' && entry.value.trim()) {
    return {
      value: entry.value.trim(),
      updatedAt: entry.updatedAt ? String(entry.updatedAt) : null
    };
  }

  return null;
}

function toDescriptor(ref, entry) {
  if (!entry) {
    return {
      ref,
      stored: false,
      maskedKey: null,
      updatedAt: null
    };
  }

  return {
    ref,
    stored: true,
    maskedKey: maskSecret(entry.value),
    updatedAt: entry.updatedAt || null
  };
}

export async function loadProviderSecretEntries() {
  const file = await readSecretsFile();
  const result = new Map();

  Object.entries(file.secrets || {}).forEach(([ref, entry]) => {
    const normalized = normalizeSecretEntry(entry);
    if (normalized) {
      result.set(ref, normalized);
    }
  });

  return result;
}

export async function listProviderSecretDescriptors() {
  const entries = await loadProviderSecretEntries();
  return Array.from(entries.entries()).map(([ref, entry]) => toDescriptor(ref, entry));
}

export async function saveProviderSecret(ref, value) {
  if (!ref || typeof ref !== 'string') {
    throw new Error('apiKeyRef is required');
  }

  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    throw new Error('value is required');
  }

  const file = await readSecretsFile();
  const updatedAt = new Date().toISOString();

  file.secrets[ref] = {
    value: trimmed,
    updatedAt
  };

  await writeSecretsFile(file);

  return {
    value: trimmed,
    updatedAt,
    descriptor: toDescriptor(ref, { value: trimmed, updatedAt })
  };
}

export async function clearProviderSecret(ref) {
  if (!ref || typeof ref !== 'string') {
    throw new Error('apiKeyRef is required');
  }

  const file = await readSecretsFile();

  if (Object.prototype.hasOwnProperty.call(file.secrets, ref)) {
    delete file.secrets[ref];
    await writeSecretsFile(file);
  }

  return {
    value: null,
    updatedAt: null,
    descriptor: toDescriptor(ref, null)
  };
}

export { maskSecret };
