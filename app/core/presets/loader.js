import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveConfigPath, assertAllowedPath } from '../utils/security.js';
import { parseIndustryPreset } from './industryPresetSchema.js';

const PRESET_DIRECTORY = resolveConfigPath('industries');
const presetCache = new Map();

function buildChecksum(raw) {
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function normalizeId(candidate) {
  return candidate?.toString().trim();
}

async function ensurePresetDirectory() {
  await fs.mkdir(PRESET_DIRECTORY, { recursive: true });
  assertAllowedPath(PRESET_DIRECTORY);
  return PRESET_DIRECTORY;
}

function makeCacheKey(filePath) {
  return path.normalize(filePath);
}

async function readPresetEntry(filePath) {
  const key = makeCacheKey(filePath);
  const stat = await fs.stat(filePath);
  const cached = presetCache.get(key);

  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }

  const raw = await fs.readFile(filePath, 'utf8');
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const parseError = new Error(`Failed to parse preset JSON: ${filePath}`);
    parseError.code = 'PRESET_INVALID_JSON';
    parseError.cause = error;
    throw parseError;
  }

  const preset = parseIndustryPreset(parsed);
  const presetId = normalizeId(preset?.meta?.id) || path.basename(filePath, '.json');

  if (!preset?.meta?.id) {
    // Ensure meta.id exists so consumers have consistent ids.
    preset.meta.id = presetId;
  }

  const checksum = buildChecksum(raw);
  const entry = {
    id: presetId,
    version: preset.version,
    checksum,
    filePath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    preset
  };

  presetCache.set(key, entry);
  return entry;
}

async function listPresetFiles() {
  const directory = await ensurePresetDirectory();
  const entries = await fs.readdir(directory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name));
}

export async function listPresets() {
  const files = await listPresetFiles();
  const presets = [];

  for (const filePath of files) {
    try {
      const entry = await readPresetEntry(filePath);
      const { preset } = entry;
      presets.push({
        id: entry.id,
        version: entry.version,
        checksum: entry.checksum,
        industry: preset.meta?.industry ?? null,
        name: preset.meta?.name ?? entry.id,
        description: preset.meta?.description ?? null,
        updatedAt: preset.meta?.updatedAt ?? null,
        tags: preset.meta?.tags ?? null
      });
    } catch (error) {
      presets.push({
        id: path.basename(filePath, '.json'),
        version: null,
        checksum: null,
        industry: null,
        name: path.basename(filePath, '.json'),
        description: error?.message ?? 'Invalid preset definition',
        error: true
      });
    }
  }

  presets.sort((a, b) => {
    const nameA = a.name?.toLowerCase() ?? '';
    const nameB = b.name?.toLowerCase() ?? '';
    return nameA.localeCompare(nameB, 'en');
  });

  return presets;
}

export async function loadPreset(presetId) {
  if (!presetId) {
    throw new Error('Preset id is required');
  }

  const sanitizedId = normalizeId(presetId);
  const filePath = resolveConfigPath('industries', `${sanitizedId}.json`);

  try {
    await fs.access(filePath);
  } catch {
    const error = new Error(`Preset not found: ${sanitizedId}`);
    error.code = 'PRESET_NOT_FOUND';
    throw error;
  }

  return readPresetEntry(filePath);
}

export async function diffPreset(presetId, projectPresetVersion) {
  const entry = await loadPreset(presetId);
  const latestVersion = entry.version;
  const projectVersion = projectPresetVersion ?? null;
  const hasUpdate = projectVersion ? projectVersion !== latestVersion : true;

  const diff = {
    presetId: entry.id,
    latestVersion,
    projectVersion,
    hasUpdate,
    checksum: entry.checksum,
    meta: entry.preset.meta
  };

  if (hasUpdate && Array.isArray(entry.preset.meta?.versionNotes)) {
    diff.notes = entry.preset.meta.versionNotes;
  }

  return diff;
}

export function clearPresetCache() {
  presetCache.clear();
}

