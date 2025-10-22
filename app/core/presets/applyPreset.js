import { createEntityStore } from '../storage/entityStore.js';
import { loadPreset } from './loader.js';

function composeScopedId(projectId, entityId, prefix) {
  const normalizedEntity = String(entityId ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  const trimmedProject = String(projectId ?? '').trim();

  if (!trimmedProject) {
    throw new Error('Project id is required to compose scoped identifier');
  }

  const baseId = `${trimmedProject}::${normalizedEntity || 'entity'}`;

  if (!prefix) {
    return baseId;
  }

  return `${prefix}:${baseId}`;
}

function normalizeAgentDefinition(agent, { projectId, presetId, presetVersion }) {
  const moduleId = agent.id || agent.name || 'agent';
  const scopedId = composeScopedId(projectId, moduleId);

  return {
    id: scopedId,
    projectId,
    name: agent.name || moduleId,
    type: agent.type || 'agent',
    description: agent.description || null,
    source: 'preset',
    originPresetVersion: presetVersion,
    presetId,
    presetAgentId: moduleId,
    moduleId,
    instructions: agent.instructions || null,
    params: agent.params || null,
    templates: agent.templates || null,
    engine: agent.engine || agent.config?.engine || null,
    config: agent.config || null,
    tags: Array.isArray(agent.tags) ? agent.tags : [],
    metadata: agent.metadata || {},
    entrypoint: agent.entrypoint || null,
    origin: {
      presetId,
      presetVersion,
      moduleId
    }
  };
}

function normalizePipelineDefinition(pipeline, { project, presetId, presetVersion }, agentKeyMap) {
  const scopedId = composeScopedId(project.id, pipeline.id || pipeline.name || 'pipeline');
  const nodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];
  const edges = Array.isArray(pipeline.edges) ? pipeline.edges : [];

  const normalizedNodes = nodes.map((node) => {
    const kind = node.kind || node.type || 'task';
    const agentName =
      node.agentName ||
      node.agentId ||
      node.agent ||
      (kind === 'form' ? 'FormCollector' : null);
    const moduleId = agentName || null;
    const scopedAgentId = moduleId ? agentKeyMap.get(moduleId) || composeScopedId(project.id, moduleId) : null;

    return {
      ...node,
      kind,
      type: kind,
      id: node.id || composeScopedId(project.id, moduleId || pipeline.id, 'node'),
      agentName: moduleId,
      agentConfigId: scopedAgentId,
      projectId: project.id
    };
  });

  const normalizedEdges = edges.map((edge, index) => {
    const from = edge.from || edge.source || null;
    const to = edge.to || edge.target || null;

    return {
      id: edge.id || `${scopedId}:edge:${index}`,
      from,
      to,
      condition: edge.condition || null,
      metadata: edge.metadata || {}
    };
  });

  return {
    id: scopedId,
    projectId: project.id,
    name: pipeline.name || pipeline.id || scopedId,
    description: pipeline.description || null,
    source: 'preset',
    originPresetVersion: presetVersion,
    presetId,
    presetPipelineId: pipeline.id || pipeline.name || scopedId,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    project: {
      id: project.id,
      name: project.name,
      industry: project.industry || null,
      channels: project.channels || []
    },
    metadata: pipeline.metadata || {},
    override: pipeline.override || null,
    origin: {
      presetId,
      presetVersion,
      pipelineId: pipeline.id || pipeline.name || scopedId
    }
  };
}

export async function applyPresetToProject({ projectId, presetId, entityStore: injectedStore } = {}) {
  if (!projectId) {
    throw new Error('projectId is required to apply preset');
  }

  if (!presetId) {
    throw new Error('presetId is required to apply preset');
  }

  const entityStore = injectedStore || createEntityStore();
  const project = entityStore.getProjectById(projectId);

  if (!project) {
    const error = new Error(`Project not found: ${projectId}`);
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }

  let presetEntry;

  try {
    presetEntry = await loadPreset(presetId);
  } catch (error) {
    const wrapped = new Error(`Failed to load preset "${presetId}": ${error.message}`);
    wrapped.code = error.code || 'PRESET_LOAD_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }

  const { preset } = presetEntry;
  const presetVersion = preset?.version || '0.0.0';

  const updatedProject = entityStore.saveProject({
    id: project.id,
    presetId,
    presetVersion,
    briefVersion: presetVersion,
    industry: project.industry || preset.meta?.industry || null,
    presetDraft: {},
    channels: project.channels || []
  });

  const existingPresetAgents = entityStore.listAgentRecords({
    projectId: project.id,
    source: 'preset'
  });
  existingPresetAgents.forEach((agent) => {
    entityStore.deleteAgent(agent.id);
  });

  const existingPresetPipelines = entityStore.listPipelines({
    projectId: project.id,
    source: 'preset'
  });
  existingPresetPipelines.forEach((pipeline) => {
    entityStore.deletePipeline(pipeline.id);
  });

  const appliedAgents = [];
  const agentKeyMap = new Map();

  if (Array.isArray(preset?.agents)) {
    for (const agent of preset.agents) {
      const normalized = normalizeAgentDefinition(agent, {
        projectId: project.id,
        presetId,
        presetVersion
      });
      const stored = entityStore.saveAgent(normalized);
      appliedAgents.push(stored);
      agentKeyMap.set(normalized.moduleId, stored.id);
    }
  }

  const appliedPipelines = [];

  if (Array.isArray(preset?.pipelines)) {
    for (const pipeline of preset.pipelines) {
      const normalized = normalizePipelineDefinition(
        pipeline,
        {
          project: updatedProject,
          presetId,
          presetVersion
        },
        agentKeyMap
      );

      const stored = entityStore.savePipeline(normalized);
      appliedPipelines.push(stored);
    }
  }

  return {
    project: updatedProject,
    preset: presetEntry,
    agents: appliedAgents,
    pipelines: appliedPipelines
  };
}

