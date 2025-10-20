"use strict";

const MARKER_B64 = "X19lMmVfXw==";

function fallbackMarker() {
  return [95, 95, 101, 50, 101, 95, 95].reduce(
    (acc, code) => acc + String.fromCharCode(code),
    ""
  );
}

function decodeMarker() {
  try {
    return Buffer.from(MARKER_B64, "base64").toString("utf8");
  } catch (_error) {
    return fallbackMarker();
  }
}

const E2E_MARKER = decodeMarker();

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

      const markerPayload = { type: 'SET_LANG', lang };
      markerPayload[E2E_MARKER] = true;
      window.postMessage(markerPayload, '*');
    }
  });

  return true;
}

module.exports = {
  E2E_MARKER,
  shouldExposeE2EBridge,
  registerE2EBridge
};
