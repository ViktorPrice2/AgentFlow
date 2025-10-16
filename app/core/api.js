import { runPipeline, runDemoPipeline } from './orchestrator.js';
import { createEntityStore } from './storage/entityStore.js';

const agentConfigs = new Map();
const entityStore = createEntityStore();

const defaultAgentConfigs = [
  {
    id: 'WriterAgent',
    name: 'WriterAgent',
    type: 'writer',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Template-driven writer',
    engine: {
      provider: 'mock',
      model: 'template'
    },
    params: {
      outputs: ['title', 'caption', 'description'],
      summaryTemplate: 'Generated draft for {{project.name}} about {{topic}}'
    },
    templates: {
      title: '{{project.name}} — {{topic}}',
      caption: '{{tone}} {{message}}',
      description: '{{outline}}',
      summary: 'Prepared placeholders for {{project.name}}'
    }
  },
  {
    id: 'UploaderAgent',
    name: 'UploaderAgent',
    type: 'uploader',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Simulated uploader',
    params: {
      defaultStatus: 'simulation',
      destinations: [
        {
          id: 'primary',
          pathTemplate: 'uploads/{{destination.id}}.txt',
          templateKey: 'primaryDocument'
        }
      ]
    },
    templates: {
      primaryDocument:
        'Project: {{project.name}}\nTopic: {{topic}}\nTitle: {{writer.outputs.title}}\nCaption: {{writer.outputs.caption}}',
      status: 'Artifacts generated: {{uploaded.length}}',
      summary: 'Artifacts generated: {{uploaded.length}}'
    }
  },
  {
    id: 'StyleGuard',
    name: 'StyleGuard',
    type: 'guard',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Rule-based guard',
    params: {
      rules: [
        {
          id: 'no-medical',
          path: 'writer.outputs.caption',
          disallow: ['medicine', 'pill'],
          reasonKey: 'disallow'
        }
      ],
      failTemplate: 'Style issues detected'
    },
    templates: {
      disallow: 'Disallowed word: {{matchedToken}}',
      pass: 'Style requirements satisfied',
      fail: 'Style requirements not satisfied'
    }
  },
  {
    id: 'HumanGate',
    name: 'HumanGate',
    type: 'human',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Approval gate',
    params: {
      autoApprove: true,
      statusTemplate: 'Status: {{autoApprove}}'
    },
    templates: {
      approved: 'Approved automatically',
      pending: 'Waiting for human approval',
      status: 'Status: {{autoApprove}}'
    }
  }
];

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function ensureDefaultAgentConfigs() {
  defaultAgentConfigs.forEach((config) => {
    if (!agentConfigs.has(config.id)) {
      agentConfigs.set(config.id, cloneConfig(config));
    }
  });
}

function refreshStoredAgentConfigs() {
  agentConfigs.clear();

  const stored = entityStore.buildAgentConfigMap();

  stored.forEach((value, key) => {
    agentConfigs.set(key, value);
  });

  ensureDefaultAgentConfigs();
}

refreshStoredAgentConfigs();

function storeAgentConfig(agent) {
  const stored = entityStore.saveAgent(agent);
  const cloned = cloneConfig(stored.payload);
  agentConfigs.set(stored.id, cloned);

  return stored;
}

function buildAgentList(pluginRegistry) {
  const staticAgents = pluginRegistry.listAgents();
  const configuredAgents = entityStore.listAgentRecords().map((agent) => ({
    id: agent.id,
    name: agent.name,
    type: agent.type ?? 'custom',
    version: `v${agent.version}`,
    description: agent.description ?? '',
    source: agent.projectId ? `project:${agent.projectId}` : 'local'
  }));

  return {
    plugins: staticAgents,
    configs: configuredAgents
  };
}

export function getAgentConfigSnapshot() {
  refreshStoredAgentConfigs();

  return Array.from(agentConfigs.values()).map((agent) => cloneConfig(agent));
}

export function registerIpcHandlers({ ipcMain, pluginRegistry, providerManager }) {
  if (!ipcMain) {
    throw new Error('ipcMain instance is required');
  }

  if (!pluginRegistry) {
    throw new Error('pluginRegistry instance is required');
  }

  if (!providerManager) {
    throw new Error('providerManager instance is required');
  }

  refreshStoredAgentConfigs();

  ipcMain.handle('AgentFlow:agents:list', async () => {
    return buildAgentList(pluginRegistry);
  });

  ipcMain.handle('AgentFlow:agents:upsert', async (_event, agentConfig) => {
    const stored = storeAgentConfig(agentConfig);

    return {
      ok: true,
      agent: {
        id: stored.id,
        name: stored.name,
        type: stored.type,
        version: `v${stored.version}`,
        description: stored.description,
        source: stored.projectId ? `project:${stored.projectId}` : 'local'
      }
    };
  });

  ipcMain.handle('AgentFlow:providers:status', async () => {
    return providerManager.getProviderStatus();
  });

  ipcMain.handle('AgentFlow:pipeline:runSimple', async (_event, input) => {
    const result = await runDemoPipeline(pluginRegistry, input, {
      providerManager,
      agentConfigs
    });

    return {
      ok: true,
      result
    };
  });

  ipcMain.handle('AgentFlow:pipeline:run', async (_event, pipelineDefinition, inputPayload) => {
    const result = await runPipeline(pipelineDefinition, inputPayload, {
      pluginRegistry,
      agentConfigs,
      providerManager
    });

    return {
      ok: true,
      result
    };
  });

  ipcMain.handle('AgentFlow:pipeline:upsert', async (_event, pipelineDefinition) => {
    const stored = entityStore.savePipeline(pipelineDefinition);

    return {
      ok: true,
      pipeline: {
        id: stored.id,
        name: stored.name,
        description: stored.description,
        projectId: stored.projectId,
        nodes: stored.nodes,
        edges: stored.edges,
        override: stored.override,
        version: stored.version,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt
      }
    };
  });

  ipcMain.handle('AgentFlow:pipeline:list', async () => {
    return entityStore.listPipelines().map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      projectId: pipeline.projectId,
      nodes: pipeline.nodes,
      edges: pipeline.edges,
      override: pipeline.override,
      version: pipeline.version,
      createdAt: pipeline.createdAt,
      updatedAt: pipeline.updatedAt
    }));
  });

  ipcMain.handle('AgentFlow:history:list', async (_event, params = {}) => {
    try {
      const { entityType, entityId } = params;
      const history = entityStore.listHistory(entityType, entityId);
      return { ok: true, history };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:diff:entity', async (_event, params = {}) => {
    try {
      const { entityType, idA, idB } = params;
      const diff = entityStore.diffEntityVersions({ entityType, idA, idB });
      return { ok: true, diff };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}
