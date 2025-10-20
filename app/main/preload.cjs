const { contextBridge, ipcRenderer } = require('electron');

let registerE2EBridge = () => false;
let e2eBridgeChannel = 'af:e2e:bridge';
let e2eStorageKey = 'af:e2e:mode';

try {
  const bridgeModule = require('./e2e-bridge.js');
  registerE2EBridge = bridgeModule.registerE2EBridge || registerE2EBridge;
  e2eBridgeChannel = bridgeModule.E2E_BRIDGE_CHANNEL || e2eBridgeChannel;
  e2eStorageKey = bridgeModule.E2E_STORAGE_KEY || e2eStorageKey;
} catch (error) {
  const shouldExpose = (env = process.env) => {
    if (!env) {
      return false;
    }

    if ((env.NODE_ENV || '').toLowerCase() === 'test') {
      return true;
    }

    return String(env.E2E || '0') === '1';
  };

  const markRendererAsE2E = () => {
    try {
      const target = globalThis;
      if (target?.sessionStorage) {
        target.sessionStorage.setItem(e2eStorageKey, '1');
      }
    } catch (storageError) {
      // Ignore storage access issues (disabled storage, etc.)
    }
  };

  registerE2EBridge = (contextBridge, env = process.env) => {
    if (!contextBridge || typeof contextBridge.exposeInMainWorld !== 'function') {
      return false;
    }

    if (!shouldExpose(env)) {
      return false;
    }

    markRendererAsE2E();

    contextBridge.exposeInMainWorld('e2e', {
      setLang(lang) {
        if (!lang) {
          return;
        }

        markRendererAsE2E();
        globalThis.postMessage(
          {
            bridge: e2eBridgeChannel,
            type: 'SET_LANG',
            lang
          },
          '*'
        );
      }
    });

    return true;
  };
}

const ERROR_EVENT_CHANNEL = 'AgentFlow:error-bus:event';
const ERROR_REPORT_CHANNEL = 'AgentFlow:error-bus:report';

contextBridge.exposeInMainWorld('AgentAPI', {
  version: () => 'Phase 3 stub',
  listAgents: () => ipcRenderer.invoke('AgentFlow:agents:list'),
  upsertAgent: (agent) => ipcRenderer.invoke('AgentFlow:agents:upsert', agent),
  deleteAgent: (agentId) => ipcRenderer.invoke('AgentFlow:agents:delete', agentId),
  listProviderStatus: () => ipcRenderer.invoke('AgentFlow:providers:status'),
  runPipelineSimple: (input) => ipcRenderer.invoke('AgentFlow:pipeline:runSimple', input),
  runPipeline: (pipelineDefinition, payload) =>
    ipcRenderer.invoke('AgentFlow:pipeline:run', pipelineDefinition, payload),
  listRuns: (filter) => ipcRenderer.invoke('AgentFlow:runs:list', filter ?? {}),
  listPipelines: () => ipcRenderer.invoke('AgentFlow:pipeline:list'),
  upsertPipeline: (pipelineDefinition) =>
    ipcRenderer.invoke('AgentFlow:pipeline:upsert', pipelineDefinition),
  deletePipeline: (pipelineId) => ipcRenderer.invoke('AgentFlow:pipeline:delete', pipelineId),
  listProjects: (filter) => ipcRenderer.invoke('AgentFlow:projects:list', filter ?? {}),
  getProject: (projectId) => ipcRenderer.invoke('AgentFlow:projects:get', projectId),
  upsertProject: (project) => ipcRenderer.invoke('AgentFlow:projects:upsert', { project }),
  applyProjectPreset: (params) => ipcRenderer.invoke('AgentFlow:projects:applyPreset', params),
  listPresets: () => ipcRenderer.invoke('AgentFlow:presets:list'),
  getPreset: (presetId) => ipcRenderer.invoke('AgentFlow:presets:get', presetId),
  diffPreset: (presetId, projectPresetVersion) =>
    ipcRenderer.invoke('AgentFlow:presets:diff', { presetId, projectPresetVersion }),
  listReports: (filter) => ipcRenderer.invoke('AgentFlow:reports:list', filter ?? {}),
  getReport: (reportId) => ipcRenderer.invoke('AgentFlow:reports:get', reportId),
  getTelegramStatus: () => ipcRenderer.invoke('bot:status'),
  setTelegramToken: (token) => ipcRenderer.invoke('bot:setToken', token),
  startTelegramBot: () => ipcRenderer.invoke('bot:start'),
  stopTelegramBot: () => ipcRenderer.invoke('bot:stop'),
  tailTelegramLog: (limit) => ipcRenderer.invoke('bot:tailLog', { limit }),
  getTelegramProxyConfig: () => ipcRenderer.invoke('bot:getProxy'),
  setTelegramProxyConfig: (config) => ipcRenderer.invoke('bot:setProxy', config),
  listTelegramContacts: (projectId) =>
    ipcRenderer.invoke('AgentFlow:telegram:contacts:list', { projectId }),
  saveTelegramContact: (contact) =>
    ipcRenderer.invoke('AgentFlow:telegram:contacts:save', { contact }),
  sendTelegramInvite: (projectId, chatId) =>
    ipcRenderer.invoke('AgentFlow:telegram:sendInvite', { projectId, chatId }),
  onTelegramStatusChanged(handler) {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const channel = 'bot:status:changed';
    const listener = (_event, payload) => {
      handler(payload);
    };

    ipcRenderer.on(channel, listener);

    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  fetchLatestBrief: (projectId) => ipcRenderer.invoke('AgentFlow:briefs:latest', projectId),
  generateBriefPlan: (projectId) => ipcRenderer.invoke('AgentFlow:briefs:plan', projectId),
  listEntityHistory: (entityType, entityId) =>
    ipcRenderer.invoke('AgentFlow:history:list', { entityType, entityId }),
  diffEntityVersions: (entityType, idA, idB) =>
    ipcRenderer.invoke('AgentFlow:diff:entity', { entityType, idA, idB }),
  listSchedules: (projectId) =>
    ipcRenderer.invoke('AgentFlow:schedules:list', { projectId }),
  upsertSchedule: (schedule) => ipcRenderer.invoke('AgentFlow:schedules:upsert', schedule),
  deleteSchedule: (scheduleId) => ipcRenderer.invoke('AgentFlow:schedules:delete', scheduleId),
  toggleSchedule: (scheduleId, enabled) =>
    ipcRenderer.invoke('AgentFlow:schedules:toggle', { id: scheduleId, enabled }),
  runScheduleNow: (scheduleId) => ipcRenderer.invoke('AgentFlow:schedules:runNow', scheduleId),
  getSchedulerStatus: () => ipcRenderer.invoke('AgentFlow:schedules:status'),
  runProviderDiagnostic: (command) => ipcRenderer.invoke('AgentFlow:providers:diagnostic', command),
  onBriefUpdated(handler) {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const updateChannel = 'brief:updated';
    const errorChannel = 'brief:error';

    const updateListener = (_event, payload) => {
      handler(payload);
    };

    const errorListener = (_event, payload) => {
      handler({ ...(payload || {}), error: true });
    };

    ipcRenderer.on(updateChannel, updateListener);
    ipcRenderer.on(errorChannel, errorListener);

    return () => {
      ipcRenderer.removeListener(updateChannel, updateListener);
      ipcRenderer.removeListener(errorChannel, errorListener);
    };
  }
});

contextBridge.exposeInMainWorld('ErrorAPI', {
  subscribe(handler) {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => {
      handler(payload);
    };

    ipcRenderer.on(ERROR_EVENT_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(ERROR_EVENT_CHANNEL, listener);
    };
  },
  report(payload = {}) {
    ipcRenderer.send(ERROR_REPORT_CHANNEL, payload);
  },
  info(message, details) {
    ipcRenderer.send(ERROR_REPORT_CHANNEL, { level: 'info', message, details });
  },
  warn(message, details) {
    ipcRenderer.send(ERROR_REPORT_CHANNEL, { level: 'warn', message, details });
  },
  error(message, details) {
    ipcRenderer.send(ERROR_REPORT_CHANNEL, { level: 'error', message, details });
  }
});

try {
  registerE2EBridge(contextBridge, process.env);
} catch (error) {
  // noop: preload may execute outside Electron (unit tests, etc.)
}
