import { runPipeline, runDemoPipeline } from './orchestrator.js';

const agentConfigs = new Map();
const pipelines = new Map();

function storeAgentConfig(agent) {
  const id = agent.id || agent.name;

  if (!id) {
    throw new Error('Agent config must include id or name');
  }

  agentConfigs.set(id, { ...agent, id });

  return agentConfigs.get(id);
}

function buildAgentList(pluginRegistry) {
  const staticAgents = pluginRegistry.listAgents();
  const configuredAgents = Array.from(agentConfigs.values()).map((agent) => ({
    id: agent.id,
    name: agent.name,
    type: agent.type ?? 'custom',
    version: agent.version ?? '0.0.1',
    description: agent.description ?? '',
    source: agent.source ?? 'manual'
  }));

  return {
    plugins: staticAgents,
    configs: configuredAgents
  };
}

export function registerIpcHandlers({ ipcMain, pluginRegistry }) {
  if (!ipcMain) {
    throw new Error('ipcMain instance is required');
  }

  if (!pluginRegistry) {
    throw new Error('pluginRegistry instance is required');
  }

  ipcMain.handle('AgentFlow:agents:list', async () => {
    return buildAgentList(pluginRegistry);
  });

  ipcMain.handle('AgentFlow:agents:upsert', async (_event, agentConfig) => {
    const stored = storeAgentConfig(agentConfig);

    return {
      ok: true,
      agent: stored
    };
  });

  ipcMain.handle('AgentFlow:pipeline:runSimple', async (_event, input) => {
    const result = await runDemoPipeline(pluginRegistry, input);

    return {
      ok: true,
      result
    };
  });

  ipcMain.handle('AgentFlow:pipeline:run', async (_event, pipelineDefinition, inputPayload) => {
    const result = await runPipeline(pipelineDefinition, inputPayload, {
      pluginRegistry,
      agentConfigs
    });

    return {
      ok: true,
      result
    };
  });

  ipcMain.handle('AgentFlow:pipeline:upsert', async (_event, pipelineDefinition) => {
    const id = pipelineDefinition.id || pipelineDefinition.name || `pipeline-${pipelines.size + 1}`;
    const stored = {
      ...pipelineDefinition,
      id
    };

    pipelines.set(id, stored);

    return {
      ok: true,
      pipeline: stored
    };
  });

  ipcMain.handle('AgentFlow:pipeline:list', async () => {
    return Array.from(pipelines.values());
  });
}
