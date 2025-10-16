const { contextBridge, ipcRenderer } = require('electron');

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
  getSchedulerStatus: () => ipcRenderer.invoke('AgentFlow:schedules:status')
    ipcRenderer.invoke('AgentFlow:diff:entity', { entityType, idA, idB })

  generateBriefPlan: (projectId) => ipcRenderer.invoke('AgentFlow:briefs:plan', projectId)

});
