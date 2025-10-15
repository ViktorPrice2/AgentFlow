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
  listProjects: () => ipcRenderer.invoke('AgentFlow:projects:list'),
  upsertProject: (project) => ipcRenderer.invoke('AgentFlow:projects:upsert', project),
  getProject: (projectId) => ipcRenderer.invoke('AgentFlow:projects:get', projectId),
  listBriefs: (projectId) => ipcRenderer.invoke('AgentFlow:briefs:list', projectId),
  getBrief: (briefId) => ipcRenderer.invoke('AgentFlow:briefs:get', briefId),
  upsertBrief: (brief) => ipcRenderer.invoke('AgentFlow:briefs:upsert', brief),
  generateBriefPlan: (payload) => ipcRenderer.invoke('AgentFlow:briefs:plan', payload),
  listAgentHistory: (agentId, limit) => ipcRenderer.invoke('AgentFlow:agents:history', { agentId, limit }),
  listPipelineHistory: (pipelineId, limit) =>
    ipcRenderer.invoke('AgentFlow:pipeline:history', { pipelineId, limit }),
  diffEntity: (payload) => ipcRenderer.invoke('AgentFlow:diff:entity', payload),
  botStatus: () => ipcRenderer.invoke('AgentFlow:bot:status'),
  botSetToken: (token) => ipcRenderer.invoke('AgentFlow:bot:setToken', token),
  botStart: () => ipcRenderer.invoke('AgentFlow:bot:start'),
  botStop: () => ipcRenderer.invoke('AgentFlow:bot:stop'),
  onBriefUpdated: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const channel = 'AgentFlow:brief:updated';
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
  }
});
