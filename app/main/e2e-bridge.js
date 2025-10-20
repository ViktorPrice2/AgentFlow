"use strict";

const E2E_BRIDGE_CHANNEL = "af:e2e:bridge";
const E2E_STORAGE_KEY = "af:e2e:mode";

function shouldExposeE2EBridge(env = process.env) {
  if (!env) {
    return false;
  }

  if ((env.NODE_ENV || "").toLowerCase() === "test") {
    return true;
  }

  return String(env.E2E || "0") === "1";
}

function markRendererAsE2E(targetWindow) {
  if (!targetWindow) {
    return;
  }

  try {
    if (targetWindow.sessionStorage) {
      targetWindow.sessionStorage.setItem(E2E_STORAGE_KEY, "1");
    }
  } catch (error) {
    // Ignore storage access issues (disabled storage, etc.)
  }
}

function registerE2EBridge(contextBridge, env = process.env) {
  if (!contextBridge || typeof contextBridge.exposeInMainWorld !== "function") {
    return false;
  }

  if (!shouldExposeE2EBridge(env)) {
    return false;
  }

  markRendererAsE2E(globalThis);

  contextBridge.exposeInMainWorld("e2e", {
    setLang(lang) {
      if (!lang) {
        return;
      }

      markRendererAsE2E(globalThis);
      globalThis.postMessage(
        {
          bridge: E2E_BRIDGE_CHANNEL,
          type: "SET_LANG",
          lang
        },
        "*"
      );
    }
  });

  return true;
}

module.exports = {
  shouldExposeE2EBridge,
  registerE2EBridge,
  E2E_BRIDGE_CHANNEL,
  E2E_STORAGE_KEY
};
