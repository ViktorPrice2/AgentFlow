#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const betterSqliteDir = path.join(appRoot, 'node_modules', 'better-sqlite3');
const electronBin = path.join(
  appRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron'
);

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

const runBinary = (binary, args = [], options = {}) => {
  const binName = process.platform === 'win32' ? `${binary}.cmd` : binary;
  const binPath = path.join(appRoot, 'node_modules', '.bin', binName);

  const { cwd = appRoot, ...spawnOptions } = options;

  const result = spawnSync(binPath, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...spawnOptions
  });

  if (result.error && result.error.code === 'ENOENT') {
    console.warn('[native] Не найден бинарь %s, пропускаю.', binPath);
    return false;
  }

  return result.status === 0;
};

const runNpm = (args, options = {}) => {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const { cwd = appRoot, ...spawnOptions } = options;

  const result = spawnSync(npmBin, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...spawnOptions
  });

  return result.status === 0;
};

const ensureNativeDeps = async () => {
  const electronPkg = await readJson(path.join(appRoot, 'node_modules', 'electron', 'package.json'));
  const betterSqlitePkg = await readJson(path.join(betterSqliteDir, 'package.json'));

  if (!electronPkg || !betterSqlitePkg) {
    console.warn('[native] Зависимости не установлены. Пропускаю проверку нативных модулей.');
    return;
  }

  console.info(
    '[native] Проверяю совместимость better-sqlite3 %s с Electron %s…',
    betterSqlitePkg.version,
    electronPkg.version
  );

  const checkResult = spawnSync(electronBin, ['-e', "require('better-sqlite3')"], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    encoding: 'utf8'
  });

  if (checkResult.status === 0) {
    console.info('[native] Библиотека уже собрана под Electron.');
    return;
  }

  if (checkResult.stderr?.trim()) {
    console.warn('[native] Проверка вывела сообщение:\n%s', checkResult.stderr.trim());
  }

  console.warn('[native] Проверка не прошла (код %s). Запускаю пересборку…', checkResult.status ?? 'unknown');

  await fs.rm(path.join(betterSqliteDir, 'build'), { recursive: true, force: true });

  const builderOk = runBinary('electron-builder', ['install-app-deps']);

  if (!builderOk) {
    console.warn('[native] electron-builder install-app-deps завершился с ошибкой, пробую prebuild-install для better-sqlite3…');

    const moduleDir = betterSqliteDir;
    const prebuildArgs = [
      '--runtime=electron',
      `--target=${electronPkg.version}`,
      '--tag-prefix=electron-v',
      '--force'
    ];

    const prebuildOk = runBinary('prebuild-install', prebuildArgs, { cwd: moduleDir });

    if (!prebuildOk) {
      console.warn('[native] prebuild-install не помог, пробую node-gyp-build…');

      const nodeGypOk = runBinary('node-gyp-build', [], { cwd: moduleDir });

      if (!nodeGypOk) {
        console.warn('[native] node-gyp-build недоступен, пробую npm rebuild для better-sqlite3…');

        const npmArgs = [
          'rebuild',
          'better-sqlite3',
          `--runtime=electron`,
          `--target=${electronPkg.version}`,
          '--dist-url=https://electronjs.org/headers',
          '--update-binary'
        ];

        const npmOk = runNpm(npmArgs, { cwd: moduleDir });

        if (!npmOk) {
          console.warn('[native] Не удалось пересобрать нативные зависимости автоматически. Выполните "npm run ensure:native" вручную с доступом в интернет.');
          return;
        }
      }
    }
  }

  const verifyResult = spawnSync(electronBin, ['-e', "require('better-sqlite3')"], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    encoding: 'utf8'
  });

  if (verifyResult.status === 0) {
    console.info('[native] Нативные зависимости готовы.');
  } else {
    if (verifyResult.stderr?.trim()) {
      console.warn('[native] Повторная проверка вывела сообщение:\n%s', verifyResult.stderr.trim());
    }
    console.warn('[native] После пересборки проверка всё ещё падает (код %s). Проверьте логи выше.', verifyResult.status ?? 'unknown');
  }
};

ensureNativeDeps().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
