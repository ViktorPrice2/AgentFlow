"use strict";

function shouldExposeE2EBridge(env = process.env) {
  if (!env) {
    return false;
  }

  if ((env.NODE_ENV || '').toLowerCase() === 'test') {
    return true;
  }

  return String(env.E2E || '0') === '1';
}

function registerE2EBridge(contextBridge, env = process.env) {
  if (!contextBridge || typeof contextBridge.exposeInMainWorld !== 'function') {
    return false;
  }

  if (!shouldExposeE2EBridge(env)) {
    return false;
  }

  contextBridge.exposeInMainWorld('e2e', {
    setLang(lang) {
      if (!lang) {
        return;
      }
      window.postMessage({ __e2e__: true, type: 'SET_LANG', lang }, '*');
    }
  });

  return true;
}

module.exports = {
  shouldExposeE2EBridge,
  registerE2EBridge
};
