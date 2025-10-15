const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

export function isValidSemver(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return SEMVER_REGEX.test(value.trim());
}

export function normalizeSemver(value, fallback = '0.1.0') {
  if (isValidSemver(value)) {
    return value.trim();
  }

  if (isValidSemver(fallback)) {
    return fallback;
  }

  return '0.1.0';
}

export function bumpPatch(version) {
  const normalized = normalizeSemver(version);
  const match = SEMVER_REGEX.exec(normalized);

  if (!match) {
    return '0.1.0';
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10) + 1;

  return `${major}.${minor}.${patch}`;
}

export function resolveNextVersion(requested, previous) {
  if (isValidSemver(requested)) {
    return requested.trim();
  }

  if (previous) {
    return bumpPatch(previous);
  }

  return '0.1.0';
}
