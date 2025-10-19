const { contextBridge, ipcRenderer } = require('electron');
let registerE2EBridge = () => false;
try {
  ({ registerE2EBridge } = require('./e2e-bridge.js'));
} catch (error) {
  registerE2EBridge = (contextBridge, env = process.env) => {
    if (!contextBridge || typeof contextBridge.exposeInMainWorld !== 'function') {
      return false;
    }

    const normalizedEnv = env || {};
    const nodeEnv = (normalizedEnv.NODE_ENV || '').toLowerCase();
    const e2eFlag = String(normalizedEnv.E2E || '0');

    if (nodeEnv !== 'test' && e2eFlag !== '1') {
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
  listPipelines: () => ipcRenderer.invoke('AgentFlow:pipeline:list'),
  upsertPipeline: (pipelineDefinition) =>
    ipcRenderer.invoke('AgentFlow:pipeline:upsert', pipelineDefinition),
  deletePipeline: (pipelineId) => ipcRenderer.invoke('AgentFlow:pipeline:delete', pipelineId),
  getTelegramStatus: () => ipcRenderer.invoke('bot:status'),
  setTelegramToken: (token) => ipcRenderer.invoke('bot:setToken', token),
  startTelegramBot: () => ipcRenderer.invoke('bot:start'),
  stopTelegramBot: () => ipcRenderer.invoke('bot:stop'),
  tailTelegramLog: (limit) => ipcRenderer.invoke('bot:tailLog', { limit }),
  getTelegramProxyConfig: () => ipcRenderer.invoke('bot:getProxy'),
  setTelegramProxyConfig: (config) => ipcRenderer.invoke('bot:setProxy', config),
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
