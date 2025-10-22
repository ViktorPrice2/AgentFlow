import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runPipeline, runDemoPipeline } from './orchestrator.js';
import { createEntityStore } from './storage/entityStore.js';
import { listPresets, loadPreset, diffPreset } from './presets/loader.js';
import { applyPresetToProject } from './presets/applyPreset.js';
import { resolveDataPath, assertAllowedPath } from './utils/security.js';
import { saveProviderSecret, clearProviderSecret } from './providers/secretsStore.js';

const agentConfigs = new Map();
let entityStore;

function getEntityStore() {
  if (!entityStore) {
    entityStore = createEntityStore();
  }

  return entityStore;
}

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
    id: 'BriefMaster',
    name: 'BriefMaster',
    type: 'analysis',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Analyze presets and briefs to recommend updates.',
    params: {
      maxSuggestions: 5,
      llm: true
    },
    templates: {
      summary:
        'BriefMaster предложил {{suggestions.length || 0}} рекомендаций для {{project.name || project.id}}.'
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

function resolveRunProjectId(pipelineDefinition, inputPayload) {
  return (
    pipelineDefinition?.projectId ||
    pipelineDefinition?.payload?.projectId ||
    inputPayload?.project?.id ||
    inputPayload?.projectId ||
    null
  );
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

  const store = getEntityStore();
  const stored = store.buildAgentConfigMap();

  stored.forEach((value, key) => {
    agentConfigs.set(key, value);
  });

  ensureDefaultAgentConfigs();
}

function formatAgentRecord(agent) {
  if (!agent) {
    return null;
  }

  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    description: agent.description ?? '',
    projectId: agent.projectId,
    source: agent.source || (agent.projectId ? 'project' : 'custom'),
    originPresetVersion: agent.originPresetVersion || null,
    version: agent.version,
    payload: agent.payload,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt
  };
}

function formatPipelineRecord(pipeline) {
  if (!pipeline) {
    return null;
  }

  const agentNames = new Set();
  (pipeline.nodes || []).forEach((node) => {
    if (node?.agentName) {
      agentNames.add(node.agentName);
    }
  });

  const payload = pipeline.payload || {};

  return {
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    projectId: pipeline.projectId,
    nodes: pipeline.nodes,
    edges: pipeline.edges,
    override: pipeline.override,
    metadata: payload.metadata || pipeline.metadata || null,
    project: payload.project || pipeline.project || null,
    source: pipeline.source || 'custom',
    originPresetVersion: pipeline.originPresetVersion || null,
    presetId: payload.presetId || null,
    presetPipelineId: payload.presetPipelineId || null,
    version: pipeline.version,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt,
    agents: Array.from(agentNames)
  };
}

function formatProjectRecord(project) {
  if (!project) {
    return null;
  }

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    industry: project.industry,
    channels: project.channels || [],
    presetId: project.presetId,
    presetVersion: project.presetVersion,
    presetDraft: project.presetDraft || {},
    briefStatus: project.briefStatus,
    briefProgress: project.briefProgress,
    briefVersion: project.briefVersion,
    needsAttention: project.needsAttention || {},
    tgLinkBase: project.tgLinkBase,
    tgLastInvitation: project.tgLastInvitation,
    tgContactStatus: project.tgContactStatus,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function formatReportRecord(report) {
  if (!report) {
    return null;
  }

  return {
    id: report.id,
    projectId: report.projectId,
    pipelineId: report.pipelineId,
    status: report.status,
    title: report.title,
    summary: report.summary,
    content: report.content,
    artifacts: report.artifacts || [],
    createdAt: report.createdAt,
    updatedAt: report.updatedAt
  };
}

function selectFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function extractNodeSummaries(result) {
  if (!Array.isArray(result?.nodes)) {
    return [];
  }

  return result.nodes
    .map((node) => {
      if (typeof node?.outputSummary === 'string') {
        const summary = node.outputSummary.trim();
        if (summary) {
          return { id: node.id || 'node', summary };
        }
      }

      return null;
    })
    .filter(Boolean);
}

function collectArtifactsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const candidateArrays = [];

  if (Array.isArray(payload._artifacts)) {
    candidateArrays.push(payload._artifacts);
  }

  if (Array.isArray(payload.artifacts)) {
    candidateArrays.push(payload.artifacts);
  }

  if (Array.isArray(payload.report?.artifacts)) {
    candidateArrays.push(payload.report.artifacts);
  }

  const artifacts = [];
  const seenStrings = new Set();
  const seenObjects = new Set();

  candidateArrays
    .flat()
    .forEach((artifact) => {
      if (typeof artifact === 'string') {
        if (!seenStrings.has(artifact)) {
          seenStrings.add(artifact);
          artifacts.push(artifact);
        }

        return;
      }

      if (artifact && typeof artifact === 'object') {
        const clone = { ...artifact };
        const key = JSON.stringify(clone);

        if (!seenObjects.has(key)) {
          seenObjects.add(key);
          artifacts.push(clone);
        }
      }
    });

  return artifacts;
}

async function writeReportFiles({
  reportId,
  projectId,
  pipelineId,
  title,
  summary,
  content,
  payload
}) {
  const safeProjectId = projectId || 'unassigned';
  const reportsRoot = resolveDataPath('reports');
  const projectDir = resolveDataPath('reports', safeProjectId);
  await fs.mkdir(projectDir, { recursive: true });

  const dataRoot = resolveDataPath();
  const markdownFile = path.join(projectDir, `${reportId}.md`);
  const jsonFile = path.join(projectDir, `${reportId}.json`);
  assertAllowedPath(markdownFile, { allowedRoots: [reportsRoot] });
  assertAllowedPath(jsonFile, { allowedRoots: [reportsRoot] });

  const lines = [];
  if (title) {
    lines.push(`# ${title}`);
  }
  if (summary) {
    lines.push(summary);
  }
  if (content) {
    lines.push('', content);
  }

  const markdownBody = lines.join('\n\n').trim();
  await fs.writeFile(markdownFile, `${markdownBody}\n`, 'utf8');

  const jsonPayload = {
    id: reportId,
    projectId: safeProjectId,
    pipelineId: pipelineId || null,
    title: title || null,
    summary: summary || null,
    content: content || null,
    payload: payload || null,
    generatedAt: new Date().toISOString()
  };
  await fs.writeFile(jsonFile, `${JSON.stringify(jsonPayload, null, 2)}\n`, 'utf8');

  const relativeMarkdown = path.relative(dataRoot, markdownFile).split(path.sep).join('/');
  const relativeJson = path.relative(dataRoot, jsonFile).split(path.sep).join('/');

  return {
    markdown: relativeMarkdown,
    json: relativeJson
  };
}

function buildReportContent(payload, result) {
  const sections = [];

  if (result?.status && result.status !== 'completed') {
    const failureSection = [];
    failureSection.push(`Status: ${result.status}`);

    const failedNode = Array.isArray(result?.nodes)
      ? result.nodes.find((node) => node?.status === 'error')
      : null;

    if (failedNode?.error) {
      failureSection.push(`Error: ${failedNode.error}`);
    }

    sections.push(failureSection.join('\n'));
  }

  if (payload?.writer?.outputs && typeof payload.writer.outputs === 'object') {
    const entries = Object.entries(payload.writer.outputs).filter(
      ([, value]) => typeof value === 'string' && value.trim().length > 0
    );

    if (entries.length > 0) {
      const lines = entries.map(([key, value]) => `- ${key}: ${value.trim()}`);
      sections.push(['Writer outputs:', ...lines].join('\n'));
    }
  }

  if (payload?.guard && typeof payload.guard === 'object') {
    const guardLines = [];

    if (typeof payload.guard.pass === 'boolean') {
      guardLines.push(`Verdict: ${payload.guard.pass ? 'pass' : 'fail'}`);
    }

    if (Array.isArray(payload.guard.results) && payload.guard.results.length > 0) {
      const failed = payload.guard.results.filter((entry) => entry && entry.pass === false);

      if (failed.length > 0) {
        guardLines.push('Failed rules:');
        failed.forEach((entry) => {
          const ruleId = entry.id || 'rule';
          const reasons = Array.isArray(entry.reasons) && entry.reasons.length > 0
            ? entry.reasons.join('; ')
            : 'No reason provided';
          guardLines.push(`  - ${ruleId}: ${reasons}`);
        });
      }
    }

    if (
      Array.isArray(payload.guard.llm?.suggestions) &&
      payload.guard.llm.suggestions.length > 0
    ) {
      guardLines.push('Suggestions:');
      payload.guard.llm.suggestions.forEach((suggestion) => {
        if (typeof suggestion === 'string' && suggestion.trim()) {
          guardLines.push(`  - ${suggestion.trim()}`);
        }
      });
    }

    if (guardLines.length > 0) {
      sections.push(['Guard review:', ...guardLines].join('\n'));
    }
  }

  const nodeSummaries = extractNodeSummaries(result);
  if (nodeSummaries.length > 0) {
    const lines = nodeSummaries.map((entry) => `- ${entry.id}: ${entry.summary}`);
    sections.push(['Node summaries:', ...lines].join('\n'));
  }

  if (payload?.uploader && typeof payload.uploader === 'object') {
    const uploaderLines = [];

    if (typeof payload.uploader.status === 'string' && payload.uploader.status) {
      uploaderLines.push(`Status: ${payload.uploader.status}`);
    }

    if (Array.isArray(payload.uploader.uploaded) && payload.uploader.uploaded.length > 0) {
      uploaderLines.push('Uploaded artifacts:');
      payload.uploader.uploaded.forEach((entry) => {
        if (!entry) {
          return;
        }

        if (typeof entry === 'string') {
          uploaderLines.push(`  - ${entry}`);
          return;
        }

        if (typeof entry === 'object') {
          const label = entry.path || entry.name || entry.id || JSON.stringify(entry);
          uploaderLines.push(`  - ${label}`);
        }
      });
    }

    if (typeof payload.uploader.summary === 'string' && payload.uploader.summary.trim()) {
      uploaderLines.push(`Summary: ${payload.uploader.summary.trim()}`);
    }

    if (uploaderLines.length > 0) {
      sections.push(['Uploader:', ...uploaderLines].join('\n'));
    }
  }

  const content = sections.join('\n\n').trim();

  return content.length > 0 ? content : null;
}

function buildReportTitle({ payload, pipelineDefinition, runId }) {
  const pipelineName = pipelineDefinition?.name;
  const metadataTitle = pipelineDefinition?.metadata?.title;

  return (
    selectFirstString(
      payload?.report?.title,
      payload?.summaryTitle,
      payload?.writer?.outputs?.title,
      payload?.writer?.outputs?.headline,
      metadataTitle,
      pipelineName
    ) || (pipelineName ? `${pipelineName} run` : null) || (runId ? `Run ${runId}` : null) || 'Pipeline run'
  );
}

function buildReportSummary(payload, result, fallbackMessage) {
  const nodeSummaries = extractNodeSummaries(result).map((entry) => entry.summary);

  return (
    selectFirstString(
      payload?.report?.summary,
      payload?.summary,
      payload?.writer?.summary,
      payload?.guard?.summary,
      payload?.uploader?.summary,
      ...nodeSummaries,
      fallbackMessage
    ) || null
  );
}

async function persistPipelineReport({
  store,
  result,
  pipelineDefinition,
  projectId,
  pipelineId
}) {
  if (!store || !projectId || !result) {
    return null;
  }

  const payload = result.payload || {};
  const failedNode = Array.isArray(result?.nodes)
    ? result.nodes.find((node) => node?.status === 'error')
    : null;

  const summary = buildReportSummary(payload, result, failedNode?.error || null);
  const title = buildReportTitle({ payload, pipelineDefinition, runId: result.runId });
  const content = buildReportContent(payload, result);
  const artifacts = collectArtifactsFromPayload(payload);
  const reportId = result.runId || randomUUID();
  let fileArtifacts = [];

  try {
    const fileInfo = await writeReportFiles({
      reportId,
      projectId,
      pipelineId,
      title,
      summary,
      content,
      payload: result
    });
    fileArtifacts = [fileInfo.markdown, fileInfo.json].filter(Boolean);
  } catch (error) {
    console.error('Failed to persist report files', error);
  }

  return store.saveReport({
    id: reportId,
    projectId,
    pipelineId,
    status: result.status || 'completed',
    title,
    summary,
    content,
    artifacts: [...artifacts, ...fileArtifacts]
  });
}

async function persistPipelineFailureReport({
  store,
  projectId,
  pipelineId,
  pipelineDefinition,
  runId,
  error
}) {
  if (!store || !projectId) {
    return null;
  }

  const summary = selectFirstString(error?.message, error?.code, 'Pipeline run failed');
  const title = (
    selectFirstString(
      pipelineDefinition?.metadata?.reportTitle,
      pipelineDefinition?.name
    ) || (pipelineId ? `${pipelineId} run` : null) || (runId ? `Run ${runId}` : null) || 'Pipeline run'
  );

  const contentLines = [
    `Pipeline execution failed for run ${runId || 'unknown'}.`,
    summary ? `Reason: ${summary}` : null
  ].filter(Boolean);

  const reportId = runId || randomUUID();
  let fileArtifacts = [];

  try {
    const fileInfo = await writeReportFiles({
      reportId,
      projectId,
      pipelineId,
      title,
      summary,
      content: contentLines.length > 0 ? contentLines.join('\n\n') : '',
      payload: { error: error?.message || summary }
    });
    fileArtifacts = [fileInfo.markdown, fileInfo.json].filter(Boolean);
  } catch (fileError) {
    console.error('Failed to persist failure report files', fileError);
  }

  return store.saveReport({
    id: reportId,
    projectId,
    pipelineId,
    status: 'error',
    title,
    summary,
    content: contentLines.length > 0 ? contentLines.join('\n\n') : null,
    artifacts: fileArtifacts
  });
}

function storeAgentConfig(agent) {
  const store = getEntityStore();
  const stored = store.saveAgent(agent);
  const cloned = cloneConfig(stored.payload);
  agentConfigs.set(stored.id, cloned);

  return stored;
}

function computePipelineAgentUsage(pipelines = []) {
  const usageMap = new Map();

  const appendUsage = (agentId, pipeline, node, position) => {
    if (!agentId) {
      return;
    }

    const normalizedId = String(agentId);
    const entry = usageMap.get(normalizedId) || [];

    entry.push({
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      projectId: pipeline.projectId || null,
      nodeId: node.id || `${pipeline.id}:node:${position}`,
      nodeKind: node.kind || 'task',
      position
    });

    usageMap.set(normalizedId, entry);
  };

  pipelines.forEach((pipeline) => {
    const nodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];

    nodes.forEach((node, index) => {
      const agentName = node?.agentName || node?.agentId || node?.id;
      appendUsage(agentName, pipeline, node, index);
    });
  });

  return usageMap;
}

function mapAgentRecordToResponse(agentRecord, usageMap) {
  const usage = usageMap.get(agentRecord.id) || [];

  return {
    id: agentRecord.id,
    name: agentRecord.name,
    type: agentRecord.type ?? 'custom',
    version: `v${agentRecord.version}`,
    versionNumber: agentRecord.version,
    description: agentRecord.description ?? '',
    source: agentRecord.source || (agentRecord.projectId ? `project:${agentRecord.projectId}` : 'local'),
    originPresetVersion: agentRecord.originPresetVersion || null,
    projectId: agentRecord.projectId,
    createdAt: agentRecord.createdAt,
    updatedAt: agentRecord.updatedAt,
    usage,
    payload: agentRecord.payload
  };
}

function mapPluginAgentToResponse(pluginAgent, usageMap) {
  const usage = usageMap.get(pluginAgent.id) || [];

  return {
    id: pluginAgent.id,
    name: pluginAgent.name,
    type: 'plugin',
    version: pluginAgent.version,
    versionNumber: null,
    description: pluginAgent.description ?? '',
    source: 'plugin',
    usage
  };
}

function buildAgentList(pluginRegistry) {
  const store = getEntityStore();
  const pipelines = store.listPipelines();
  const usageMap = computePipelineAgentUsage(pipelines);
  const staticAgents = pluginRegistry.listAgents().map((pluginAgent) =>
    mapPluginAgentToResponse(pluginAgent, usageMap)
  );

  const configuredAgents = store
    .listAgentRecords()
    .map((agentRecord) => mapAgentRecordToResponse(agentRecord, usageMap));

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

  ipcMain.handle('AgentFlow:presets:list', async () => {
    try {
      const presets = await listPresets();
      return { ok: true, presets };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:presets:get', async (_event, presetId) => {
    if (!presetId) {
      return { ok: false, error: 'presetId is required' };
    }

    try {
      const entry = await loadPreset(presetId);

      return {
        ok: true,
        preset: {
          id: entry.id,
          version: entry.version,
          checksum: entry.checksum,
          meta: entry.preset.meta,
          survey: entry.preset.survey,
          agents: entry.preset.agents,
          pipelines: entry.preset.pipelines,
          postProcessing: entry.preset.postProcessing || null,
          llmAssist: entry.preset.llmAssist || null
        }
      };
    } catch (error) {
      return { ok: false, error: error.message, code: error.code || null };
    }
  });

  ipcMain.handle('AgentFlow:presets:diff', async (_event, params = {}) => {
    const { presetId, projectPresetVersion } = params;

    if (!presetId) {
      return { ok: false, error: 'presetId is required' };
    }

    try {
      const diff = await diffPreset(presetId, projectPresetVersion || null);
      return { ok: true, diff };
    } catch (error) {
      return { ok: false, error: error.message, code: error.code || null };
    }
  });

  ipcMain.handle('AgentFlow:projects:list', async (_event, filter = {}) => {
    try {
      const store = getEntityStore();
      let projects = store.listProjects();

      if (filter.presetId) {
        projects = projects.filter((project) => project.presetId === filter.presetId);
      }

      if (filter.status) {
        projects = projects.filter((project) => project.status === filter.status);
      }

      return { ok: true, projects: projects.map((project) => formatProjectRecord(project)) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:projects:get', async (_event, projectId) => {
    if (!projectId) {
      return { ok: false, error: 'projectId is required' };
    }

    try {
      const store = getEntityStore();
      const project = store.getProjectById(projectId);
      return { ok: true, project: formatProjectRecord(project) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:projects:upsert', async (_event, payload = {}) => {
    try {
      const store = getEntityStore();
      const projectPayload = payload.project ?? payload;
      const stored = store.saveProject(projectPayload);
      return { ok: true, project: formatProjectRecord(stored) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:projects:applyPreset', async (_event, params = {}) => {
    const { projectId, presetId } = params;

    if (!projectId || !presetId) {
      return { ok: false, error: 'projectId and presetId are required' };
    }

    try {
      const store = getEntityStore();
      const result = await applyPresetToProject({ projectId, presetId, entityStore: store });
      refreshStoredAgentConfigs();

      return {
        ok: true,
        project: formatProjectRecord(result.project),
        agents: result.agents.map((agent) => formatAgentRecord(agent)),
        pipelines: result.pipelines.map((pipeline) => formatPipelineRecord(pipeline)),
        preset: {
          id: result.preset.id,
          version: result.preset.version,
          checksum: result.preset.checksum,
          meta: result.preset.preset.meta,
          survey: result.preset.preset.survey
        }
      };
    } catch (error) {
      return { ok: false, error: error.message, code: error.code || null };
    }
  });

  ipcMain.handle('AgentFlow:reports:list', async (_event, filter = {}) => {
    try {
      const listFilter = {};

      if (filter.projectId) {
        listFilter.projectId = filter.projectId;
      }

      if (filter.status) {
        listFilter.status = filter.status;
      }

      const store = getEntityStore();
      const reports = store.listReports(listFilter);
      return { ok: true, reports: reports.map((report) => formatReportRecord(report)) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:reports:get', async (_event, reportId) => {
    if (!reportId) {
      return { ok: false, error: 'reportId is required' };
    }

    try {
      const store = getEntityStore();
      const report = store.getReportById(reportId);
      return { ok: true, report: formatReportRecord(report) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:agents:list', async () => {
    return buildAgentList(pluginRegistry);
  });

  ipcMain.handle('AgentFlow:agents:upsert', async (_event, agentConfig) => {
    const stored = storeAgentConfig(agentConfig);
    const store = getEntityStore();
    const pipelines = store.listPipelines();
    const usageMap = computePipelineAgentUsage(pipelines);
    const agent = mapAgentRecordToResponse(stored, usageMap);

    return {
      ok: true,
      agent
    };
  });

  ipcMain.handle('AgentFlow:agents:delete', async (_event, agentId) => {
    if (!agentId) {
      return { ok: false, error: 'Agent id is required' };
    }

    try {
      const store = getEntityStore();
      store.deleteAgent(agentId);
      agentConfigs.delete(agentId);
      ensureDefaultAgentConfigs();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:providers:status', async () => {
    return providerManager.getProviderStatus();
  });

  ipcMain.handle('AgentFlow:providers:diagnostic', async (_event, command = {}) => {
    try {
      const result = providerManager.applyDiagnosticCommand(command);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:providers:secrets:save', async (_event, payload = {}) => {
    const ref = payload.ref || payload.apiKeyRef;
    const value = payload.value || payload.key;

    if (!ref) {
      return { ok: false, error: 'apiKeyRef is required' };
    }

    try {
      const { value: storedValue, updatedAt, descriptor } = await saveProviderSecret(ref, value);
      providerManager.setSecretOverride(ref, storedValue, { updatedAt });
      return { ok: true, secret: descriptor };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:providers:secrets:clear', async (_event, payload) => {
    const ref = typeof payload === 'string' ? payload : payload?.ref || payload?.apiKeyRef;

    if (!ref) {
      return { ok: false, error: 'apiKeyRef is required' };
    }

    try {
      const { descriptor } = await clearProviderSecret(ref);
      providerManager.setSecretOverride(ref, null);
      return { ok: true, secret: descriptor };
    } catch (error) {
      return { ok: false, error: error.message };
    }
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
    const store = getEntityStore();
    const startedAt = new Date().toISOString();
    const generatedRunId = randomUUID();
    const pipelineId = pipelineDefinition?.id || null;
    const projectId = resolveRunProjectId(pipelineDefinition, inputPayload);
    const inputSnapshot = {
      pipeline: pipelineDefinition || null,
      payload: inputPayload || null
    };

    try {
      const result = await runPipeline(pipelineDefinition, inputPayload, {
        pluginRegistry,
        agentConfigs,
        providerManager,
        runId: generatedRunId,
        projectUpdater: async (projectId, updates) => {
          if (!projectId) {
            return null;
          }

          const saved = store.saveProject({ id: projectId, ...updates });
          return formatProjectRecord(saved);
        }
      });

      const finishedAt = new Date().toISOString();
      let runRecord = null;
      let reportRecord = null;

      if (projectId) {
        try {
          runRecord = store.saveRun({
            id: result.runId || generatedRunId,
            projectId,
            pipelineId,
            status: result.status || null,
            input: inputSnapshot,
            output: result,
            createdAt: startedAt,
            startedAt,
            finishedAt
          });
        } catch (persistError) {
          console.error('Failed to persist pipeline run', persistError);
        }

        try {
          const storedReport = await persistPipelineReport({
            store,
            result,
            pipelineDefinition,
            projectId,
            pipelineId
          });

          if (storedReport) {
            reportRecord = storedReport;
          }
        } catch (reportError) {
          console.error('Failed to persist pipeline report', reportError);
        }
      }

      return {
        ok: true,
        result,
        run: runRecord,
        report: reportRecord ? formatReportRecord(reportRecord) : null
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();

      if (projectId) {
        try {
          store.saveRun({
            id: generatedRunId,
            projectId,
            pipelineId,
            status: 'error',
            input: inputSnapshot,
            output: { error: error.message },
            createdAt: startedAt,
            startedAt,
          finishedAt
        });
      } catch (persistError) {
        console.error('Failed to record failed pipeline run', persistError);
      }

        try {
          await persistPipelineFailureReport({
            store,
            projectId,
            pipelineId,
            pipelineDefinition,
            runId: generatedRunId,
            error
          });
        } catch (persistError) {
          console.error('Failed to record failed pipeline report', persistError);
        }
      }

      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:runs:list', async (_event, filter = {}) => {
    try {
      const store = getEntityStore();
      const runs = store.listRuns(filter);
      return { ok: true, runs };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:pipeline:upsert', async (_event, pipelineDefinition) => {
    const store = getEntityStore();
    const stored = store.savePipeline(pipelineDefinition);
    return {
      ok: true,
      pipeline: formatPipelineRecord(stored)
    };
  });

  ipcMain.handle('AgentFlow:pipeline:list', async () => {
    const store = getEntityStore();
    return store.listPipelines().map((pipeline) => formatPipelineRecord(pipeline));
  });

  ipcMain.handle('AgentFlow:pipeline:delete', async (_event, pipelineId) => {
    if (!pipelineId) {
      return { ok: false, error: 'Pipeline id is required' };
    }

    try {
      const store = getEntityStore();
      store.deletePipeline(pipelineId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:history:list', async (_event, params = {}) => {
    try {
      const { entityType, entityId } = params;
      const store = getEntityStore();
      const history = store.listHistory(entityType, entityId);
      return { ok: true, history };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:diff:entity', async (_event, params = {}) => {
    try {
      const { entityType, idA, idB } = params;
      const store = getEntityStore();
      const diff = store.diffEntityVersions({ entityType, idA, idB });
      return { ok: true, diff };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}
