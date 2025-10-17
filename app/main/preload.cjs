const { contextBridge, ipcRenderer } = require('electron');

const ERROR_EVENT_CHANNEL = 'AgentFlow:error-bus:event';
const ERROR_REPORT_CHANNEL = 'AgentFlow:error-bus:report';

contextBridge.exposeInMainWorld('AgentAPI', {
  version: () => 'Phase 3 stub',
  listAgents: () => ipcRenderer.invoke('AgentFlow:agents:list'),
  upsertAgent: (agent) => ipcRenderer.invoke('AgentFlow:agents:upsert', agent),
  listProviderStatus: () => ipcRenderer.invoke('AgentFlow:providers:status'),
  runPipelineSimple: (input) => ipcRenderer.invoke('AgentFlow:pipeline:runSimple', input),
  runPipeline: (pipelineDefinition, payload) =>
    ipcRenderer.invoke('AgentFlow:pipeline:run', pipelineDefinition, payload),
  listPipelines: () => ipcRenderer.invoke('AgentFlow:pipeline:list'),
  upsertPipeline: (pipelineDefinition) =>
    ipcRenderer.invoke('AgentFlow:pipeline:upsert', pipelineDefinition),
  getTelegramStatus: () => ipcRenderer.invoke('AgentFlow:bot:status'),
  setTelegramToken: (token) => ipcRenderer.invoke('AgentFlow:bot:setToken', token),
  startTelegramBot: () => ipcRenderer.invoke('AgentFlow:bot:start'),
  stopTelegramBot: () => ipcRenderer.invoke('AgentFlow:bot:stop'),
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

    const channel = 'brief:updated';
    const listener = (_event, payload) => {
      handler(payload);
    };

    ipcRenderer.on(channel, listener);

    return () => {
      ipcRenderer.removeListener(channel, listener);
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
