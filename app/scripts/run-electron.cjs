#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

function resolveElectronBinary() {
  try {
    // `require('electron')` returns the executable path when run outside of Electron.
    return require('electron');
  } catch (error) {
    console.error('Unable to resolve local Electron binary.', error);
    process.exit(1);
  }
}

function createEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  if (!env.NODE_ENV) {
    env.NODE_ENV = 'development';
  }

  if (!env.ELECTRON_RENDERER_URL) {
    env.ELECTRON_RENDERER_URL = 'http://localhost:5173';
  }

  return env;
}

function run() {
  const electronBinary = resolveElectronBinary();
  const env = createEnv();

  const child = spawn(electronBinary, ['.'], {
    env,
    stdio: 'inherit',
    windowsHide: false
  });

  child.on('exit', (code, signal) => {
    if (code === null) {
      console.error(`Electron exited with signal ${signal ?? 'unknown'}`);
      process.exit(1);
    }

    process.exit(code);
  });

  child.on('error', (error) => {
    console.error('Failed to launch Electron process.', error);
    process.exit(1);
  });
}

run();
