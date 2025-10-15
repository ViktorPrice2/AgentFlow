import { runPipeline, runDemoPipeline } from './orchestrator.js';
import {
  listAgentConfigs as listStoredAgentConfigs,
  upsertAgentConfig as persistAgentConfig,
  listAgentHistory,
  getAgentHistoryById,
  getAgentConfig as getStoredAgentConfig
} from '../db/repositories/agentsRepository.js';
import {
  listPipelines as listStoredPipelines,
  upsertPipeline as persistPipeline,
  listPipelineHistory,
  getPipelineHistoryById,
  getPipeline as getStoredPipeline
} from '../db/repositories/pipelinesRepository.js';
import { computeJsonDiff } from '../shared/jsonDiff.js';

const agentConfigs = new Map();

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

ensureDefaultAgentConfigs();

function storeAgentConfig(agent) {
  const id = agent.id || agent.name;

  if (!id) {
    throw new Error('Agent config must include id or name');
  }

  const cloned = cloneConfig({ ...agent, id });
  agentConfigs.set(id, cloned);

  return agentConfigs.get(id);
}

function mapAgentForDiff(agent) {
  if (!agent) {
    return null;
  }

  return {
    id: agent.id,
    projectId: agent.projectId,
    name: agent.name,
    type: agent.type ?? 'custom',
    version: agent.version ?? '0.0.1',
    source: agent.source ?? 'manual',
    config: agent.config ?? {}
  };
}

function mapPipelineForDiff(pipeline) {
  if (!pipeline) {
    return null;
  }

  return {
    id: pipeline.id,
    projectId: pipeline.projectId ?? null,
    name: pipeline.name,
    version: pipeline.version ?? '0.0.1',
    description: pipeline.description ?? '',
    nodes: Array.isArray(pipeline.nodes) ? pipeline.nodes : [],
    edges: Array.isArray(pipeline.edges) ? pipeline.edges : [],
    override: pipeline.override ?? null
  };
}

async function buildAgentList(pluginRegistry) {
  const staticAgents = pluginRegistry.listAgents();
  const storedAgents = await listStoredAgentConfigs();

  storedAgents.forEach((agent) => {
    const config = mapAgentForDiff(agent);
    if (config) {
      storeAgentConfig({
        ...config.config,
        id: config.id,
        name: config.name,
        type: config.type,
        version: config.version,
        source: config.source,
        description: agent.config?.description ?? agent.name
      });
    }
  });

  const configuredAgents = storedAgents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    type: agent.type ?? 'custom',
    version: agent.version ?? '0.0.1',
    description: agent.config?.description ?? '',
    source: agent.source ?? 'manual'
  }));

  return {
    plugins: staticAgents,
    configs: configuredAgents
  };
}

export function getAgentConfigSnapshot() {
  ensureDefaultAgentConfigs();

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

  ensureDefaultAgentConfigs();

  ipcMain.handle('AgentFlow:agents:list', async () => {
    return buildAgentList(pluginRegistry);
  });

  ipcMain.handle('AgentFlow:agents:upsert', async (_event, agentConfig) => {
    const stored = storeAgentConfig(agentConfig);
    const persisted = await persistAgentConfig(agentConfig);

    if (persisted?.config) {
      storeAgentConfig({
        ...persisted.config,
        id: persisted.id,
        name: persisted.name,
        type: persisted.type,
        version: persisted.version,
        source: persisted.source,
        description: persisted.config?.description ?? persisted.name
      });
    }

    return {
      ok: true,
      agent: stored
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
    const saved = await persistPipeline(pipelineDefinition);

    return {
      ok: true,
      pipeline: saved
    };
  });

  ipcMain.handle('AgentFlow:pipeline:list', async () => {
    return listStoredPipelines();
  });

  ipcMain.handle('AgentFlow:agents:history', async (_event, { agentId, limit = 20 }) => {
    if (!agentId) {
      return [];
    }

    return listAgentHistory(agentId, limit);
  });

  ipcMain.handle('AgentFlow:pipeline:history', async (_event, { pipelineId, limit = 20 }) => {
    if (!pipelineId) {
      return [];
    }

    return listPipelineHistory(pipelineId, limit);
  });

  ipcMain.handle('AgentFlow:diff:entity', async (_event, payload) => {
    const { type, idA, idB } = payload ?? {};

    if (!type) {
      throw new Error('ENTITY_TYPE_REQUIRED');
    }

    const left = await resolveEntityPointer(type, idA);
    const right = await resolveEntityPointer(type, idB);

    return {
      type,
      left,
      right,
      diff: computeJsonDiff(left, right)
    };
  });
}

async function resolveEntityPointer(type, pointer) {
  if (!pointer) {
    return null;
  }

  if (typeof pointer === 'string') {
    return resolveHistorySnapshot(type, pointer);
  }

  if (pointer.historyId) {
    return resolveHistorySnapshot(type, pointer.historyId);
  }

  if (pointer.entityId) {
    const entity = type === 'agent' ? await getStoredAgentConfig(pointer.entityId) : await getStoredPipeline(pointer.entityId);
    return type === 'agent' ? mapAgentForDiff(entity) : mapPipelineForDiff(entity);
  }

  if (pointer.draft) {
    return type === 'agent' ? mapAgentForDiff(pointer.draft) : mapPipelineForDiff(pointer.draft);
  }

  if (pointer.payload) {
    return type === 'agent' ? mapAgentForDiff(pointer.payload) : mapPipelineForDiff(pointer.payload);
  }

  return null;
}

async function resolveHistorySnapshot(type, historyId) {
  if (!historyId) {
    return null;
  }

  if (type === 'agent') {
    const entry = await getAgentHistoryById(historyId);
    return entry ? mapAgentForDiff(entry.payload) : null;
  }

  if (type === 'pipeline') {
    const entry = await getPipelineHistoryById(historyId);
    return entry ? mapPipelineForDiff(entry.payload) : null;
  }

  return null;
}
