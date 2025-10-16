import path from 'node:path';

export const DATA_ROOT = path.join(process.cwd(), 'data');
export const CONFIG_ROOT = path.join(process.cwd(), 'config');

const DEFAULT_ALLOWED_ROOTS = [DATA_ROOT, CONFIG_ROOT];
const SENSITIVE_KEYS = new Set(['token', 'apikey', 'api_key', 'secret', 'password', 'key']);

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  if (!relative || relative === '') {
    return true;
  }

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function assertAllowedPath(targetPath, { allowedRoots = DEFAULT_ALLOWED_ROOTS } = {}) {
  const resolved = path.resolve(targetPath);

  if (!allowedRoots.some((root) => isWithinRoot(root, resolved))) {
    throw new Error(`Write operation outside allowed directories is blocked: ${resolved}`);
  }

  return resolved;
}

export function resolveDataPath(...segments) {
  const target = path.join(DATA_ROOT, ...segments.filter((segment) => segment !== undefined));
  return assertAllowedPath(target, { allowedRoots: [DATA_ROOT] });
}

export function resolveConfigPath(...segments) {
  const target = path.join(CONFIG_ROOT, ...segments.filter((segment) => segment !== undefined));
  return assertAllowedPath(target, { allowedRoots: [CONFIG_ROOT] });
}

export function sanitizeArtifactPath(input) {
  const sanitizedSegments = String(input ?? '')
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => {
      const cleaned = segment.replace(/[^a-zA-Z0-9_-]/g, '_');
      return cleaned.length > 0 ? cleaned : '_';
    });

  if (sanitizedSegments.length === 0) {
    sanitizedSegments.push('artifact');
  }

  return sanitizedSegments.join('/');
}

export function sanitizeFileName(input, fallback = 'file') {
  const name = String(input ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return name.length > 0 ? name : fallback;
}

export function redactSensitive(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey)) {
          return [key, '[redacted]'];
        }

        return [key, redactSensitive(val)];
      })
    );
  }

  return value;
}
