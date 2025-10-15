const { contextBridge, ipcRenderer } = require('electron');

const onBriefUpdated = (callback) => {
  if (typeof callback !== 'function') {
    return () => {};
  }

  const handler = (_event, payload) => {
    callback(payload);
  };

  ipcRenderer.on('AgentFlow:brief:updated', handler);

  return () => {
    ipcRenderer.removeListener('AgentFlow:brief:updated', handler);
  };
};

contextBridge.exposeInMainWorld('AgentAPI', {
  version: () => '1.0.0',
  listAgents: () => ipcRenderer.invoke('AgentFlow:agents:list'),
  upsertAgent: (agent) => ipcRenderer.invoke('AgentFlow:agents:upsert', agent),
  listProviderStatus: () => ipcRenderer.invoke('AgentFlow:providers:status'),
  runPipelineSimple: (input) => ipcRenderer.invoke('AgentFlow:pipeline:runSimple', input),
  runPipeline: (pipelineDefinition, payload) =>
    ipcRenderer.invoke('AgentFlow:pipeline:run', pipelineDefinition, payload),
  listPipelines: () => ipcRenderer.invoke('AgentFlow:pipeline:list'),
  upsertPipeline: (pipelineDefinition) =>
    ipcRenderer.invoke('AgentFlow:pipeline:upsert', pipelineDefinition),
  telegram: {
    status: () => ipcRenderer.invoke('AgentFlow:bot:status'),
    start: () => ipcRenderer.invoke('AgentFlow:bot:start'),
    stop: () => ipcRenderer.invoke('AgentFlow:bot:stop'),
    setToken: (token) => ipcRenderer.invoke('AgentFlow:bot:setToken', token),
    onBriefUpdated
  },
  briefs: {
    getLatest: (projectId) => ipcRenderer.invoke('AgentFlow:briefs:getLatest', projectId)
  }
});
