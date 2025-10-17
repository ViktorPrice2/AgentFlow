import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const MODULE_VERSION_MISMATCH = /NODE_MODULE_VERSION\s+(\d+)/i;
const PROJECT_ROOT = path.resolve(process.cwd());

let cachedDatabaseModule;

const isModuleVersionError = (error) => {
  if (!error) {
    return false;
  }

  const message = String(error.message ?? '');
  return MODULE_VERSION_MISMATCH.test(message);
};

const clearModuleCache = () => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('better-sqlite3') || key.includes('better_sqlite3.node') || key.endsWith('bindings.js')) {
      delete require.cache[key];
    }
  }
};

const getRuntime = () => (process.versions?.electron ? 'electron' : 'node');

const runCommand = (command, args, { label }) => {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true
  });

  if (result.status !== 0) {
    const reason = result.error?.message ?? `exit code ${result.status}`;
    throw new Error(`${label} failed: ${reason}`);
  }
};

const rebuildBinding = () => {
  const runtime = getRuntime();
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (!isDevelopment) {
    throw new Error(
      `better-sqlite3 native binary is incompatible with current runtime (${runtime}), and auto-rebuild is disabled outside development.`
    );
  }

  if (runtime === 'electron') {
    const electronVersion = process.versions.electron;
    console.warn(
      `[sqlite] better-sqlite3 ABI mismatch for Electron detected. Rebuilding for Electron ${electronVersion}...`
    );

    const args = [
      'electron-rebuild',
      '--module-dir',
      '.',
      '--only',
      'better-sqlite3',
      '--force',
      '--arch',
      process.arch
    ];

    if (electronVersion) {
      args.push('--version', electronVersion);
    }

    runCommand('npx', args, {
      label: 'electron-rebuild'
    });
  } else {
    console.warn('[sqlite] better-sqlite3 ABI mismatch for Node.js detected. Rebuilding for Node runtime...');
    runCommand('npm', ['rebuild', 'better-sqlite3', '--build-from-source'], { label: 'npm rebuild better-sqlite3' });
  }
};

const requireDatabaseModule = () => {
  try {
    return require('better-sqlite3');
  } catch (error) {
    if (!isModuleVersionError(error)) {
      throw error;
    }

    clearModuleCache();
    rebuildBinding();
    clearModuleCache();
    return require('better-sqlite3');
  }
};

export const getDatabaseConstructor = () => {
  if (!cachedDatabaseModule) {
    cachedDatabaseModule = requireDatabaseModule();
  }

  return cachedDatabaseModule;
};

export const createDatabaseInstance = (targetPath, options) => {
  try {
    const Database = getDatabaseConstructor();
    return new Database(targetPath, options);
  } catch (error) {
    if (!isModuleVersionError(error)) {
      throw error;
    }

    cachedDatabaseModule = undefined;
    clearModuleCache();
    rebuildBinding();
    clearModuleCache();

    const Database = getDatabaseConstructor();
    return new Database(targetPath, options);
  }
};

export const openDatabase = (targetPath, options) => createDatabaseInstance(targetPath, options);
