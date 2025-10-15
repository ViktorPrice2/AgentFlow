#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const stateFile = path.join(appRoot, '.native-deps-state.json');

// Resolve package.json safely
const readJson = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const ensureNativeDeps = async () => {
  const electronPkg = await readJson(path.join(appRoot, 'node_modules', 'electron', 'package.json'));
  const betterSqlitePkg = await readJson(path.join(appRoot, 'node_modules', 'better-sqlite3', 'package.json'));

  if (!electronPkg || !betterSqlitePkg) {
    console.warn('[native] Зависимости не установлены. Пропускаю проверку нативных модулей.');
    return;
  }

  const targetState = {
    electronVersion: electronPkg.version,
    betterSqliteVersion: betterSqlitePkg.version,
    platform: process.platform,
    arch: process.arch
  };

  const previousState = await readJson(stateFile);

  if (previousState &&
      previousState.electronVersion === targetState.electronVersion &&
      previousState.betterSqliteVersion === targetState.betterSqliteVersion &&
      previousState.platform === targetState.platform &&
      previousState.arch === targetState.arch) {
    return;
  }

  console.info('[native] Пересборка нативных модулей под Electron %s…', targetState.electronVersion);

  const binName = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
  const binPath = path.join(appRoot, 'node_modules', '.bin', binName);

  const result = spawnSync(binPath, ['install-app-deps'], {
    cwd: appRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    console.warn('[native] Не удалось пересобрать нативные зависимости автоматически. Выполните "npm run ensure:native" вручную с доступом в интернет.');
    return;
  }

  await fs.writeFile(stateFile, JSON.stringify(targetState, null, 2));
  console.info('[native] Нативные зависимости готовы.');
};

ensureNativeDeps().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
