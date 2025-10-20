const agentApi = typeof window !== 'undefined' ? window.AgentAPI : undefined;
const hasWindowAPI = Boolean(agentApi);

const fallbackDelay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const fallbackAgents = {
  plugins: [
    {
      id: 'WriterAgent',
      name: 'WriterAgent',
      type: 'plugin',
      version: 'v0.1.0',
      versionNumber: null,
      description: 'Mock writer agent (fallback)',
      source: 'plugin',
      usage: []
    },
    {
      id: 'UploaderAgent',
      name: 'UploaderAgent',
      type: 'plugin',
      version: 'v0.1.0',
      versionNumber: null,
      description: 'Mock uploader agent (fallback)',
      source: 'plugin',
      usage: []
    }
  ],
  configs: []
};

const fallbackProjects = [];
const fallbackPipelines = [];

const fallbackProviderStatus = [
  { id: 'openai', type: 'llm', hasKey: false, apiKeyRef: 'OPENAI_API_KEY', models: ['gpt-4o-mini'] },
  { id: 'gemini', type: 'llm', hasKey: false, apiKeyRef: 'GOOGLE_API_KEY', models: ['gemini-2.0-flash'] },
  { id: 'stability', type: 'image', hasKey: false, apiKeyRef: 'STABILITY_API_KEY', models: ['sd3.5'] }
];

const fallbackBotStatus = {
  status: 'stopped',
  running: false,
  tokenStored: false,
  tokenSource: null,
  username: null,
  lastError: null,
  startedAt: null,
  lastActivityAt: null,
  updatedAt: null,
  deeplinkBase: null
};

const fallbackBotState = { ...fallbackBotStatus };
const fallbackBotLog = [];
const fallbackSchedulerStatus = {
  running: false,
  startedAt: null,
  lastRunAt: null,
  jobs: 0
};

const fallbackProxyConfig = {
  httpsProxy: '',
  httpProxy: ''
};

const sortByUpdatedAtDesc = (list) =>
  list
    .slice()
    .sort((a, b) => {
      const timeA = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

const recomputeFallbackUsage = () => {
  const usageMap = new Map();

  fallbackPipelines.forEach((pipeline) => {
    const nodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];

    nodes.forEach((node, index) => {
      const agentId = node?.agentName || node?.agentId || node?.id;

      if (!agentId) {
        return;
      }

      const normalized = String(agentId);
      const entry = usageMap.get(normalized) || [];

      entry.push({
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        projectId: pipeline.projectId || null,
        nodeId: node.id || `${pipeline.id}:node:${index}`,
        nodeKind: node.kind || 'task',
        position: index
      });

      usageMap.set(normalized, entry);
    });
  });

  const applyUsage = (list) => {
    list.forEach((agent) => {
      const usage = usageMap.get(agent.id) || [];
      agent.usage = usage.map((item) => ({ ...item }));
    });
  };

  applyUsage(fallbackAgents.plugins);
  applyUsage(fallbackAgents.configs);
};

const setFallbackBotStatus = (patch = {}) => {
  Object.assign(fallbackBotState, patch);
  fallbackBotState.updatedAt = new Date().toISOString();
  return normalizeBotStatus(fallbackBotState);
};

export async function listAgents() {
  if (hasWindowAPI && typeof agentApi.listAgents === 'function') {
    return agentApi.listAgents();
  }

  await fallbackDelay();
  return JSON.parse(JSON.stringify(fallbackAgents));
}

export async function listProjects(filter) {
  if (hasWindowAPI && typeof agentApi.listProjects === 'function') {
    const response = await agentApi.listProjects(filter ?? {});

    if (Array.isArray(response)) {
      return response;
    }

    if (response?.ok === false) {
      throw new Error(response?.error || 'Failed to load projects');
    }

    return Array.isArray(response?.projects) ? response.projects : [];
  }

  await fallbackDelay();
  return sortByUpdatedAtDesc(fallbackProjects).map((project) => JSON.parse(JSON.stringify(project)));
}

export async function getProject(projectId) {
  if (hasWindowAPI && typeof agentApi.getProject === 'function') {
    const response = await agentApi.getProject(projectId);

    if (response?.ok === false) {
      throw new Error(response?.error || 'Failed to load project');
    }

    return response?.project ?? null;
  }

  await fallbackDelay();

  if (!projectId) {
    return null;
  }

  const project = fallbackProjects.find((item) => item.id === projectId);
  return project ? JSON.parse(JSON.stringify(project)) : null;
}

export async function upsertProject(project) {
  if (hasWindowAPI && typeof agentApi.upsertProject === 'function') {
    return agentApi.upsertProject(project);
  }

  await fallbackDelay();

  const now = new Date().toISOString();
  const input = project || {};
  const id = input.id || `project-${Date.now()}`;
  const existingIndex = fallbackProjects.findIndex((item) => item.id === id);
  const previous = existingIndex >= 0 ? fallbackProjects[existingIndex] : null;
  const createdAt = previous?.createdAt || now;

  const record = {
    ...previous,
    ...input,
    id,
    name: typeof input.name === 'string' ? input.name.trim() : previous?.name || id,
    industry: typeof input.industry === 'string' ? input.industry.trim() : previous?.industry || '',
    description:
      typeof input.description === 'string' ? input.description.trim() : previous?.description || '',
    channels: typeof input.channels === 'string' ? input.channels.trim() : previous?.channels || '',
    deeplink: typeof input.deeplink === 'string' ? input.deeplink.trim() : previous?.deeplink || '',
    createdAt,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    fallbackProjects[existingIndex] = record;
  } else {
    fallbackProjects.push(record);
  }

  fallbackProjects.sort((a, b) => {
    const timeA = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return timeB - timeA;
  });

  return {
    ok: true,
    project: JSON.parse(JSON.stringify(record))
  };
}

export async function upsertAgent(agentConfig) {
  if (hasWindowAPI && typeof agentApi.upsertAgent === 'function') {
    return agentApi.upsertAgent(agentConfig);
  }

  await fallbackDelay();

  const now = new Date().toISOString();
  const input = agentConfig || {};
  const id = input.id || input.name || `agent-${Date.now()}`;
  const payload = { ...input, id };
  const name = payload.name || id;
  const type = payload.type || 'custom';

  const existingIndex = fallbackAgents.configs.findIndex((item) => item.id === id);
  const previous = existingIndex >= 0 ? fallbackAgents.configs[existingIndex] : null;
  const versionNumber = (previous?.versionNumber || 0) + 1;
  const createdAt = previous?.createdAt || now;

  const record = {
    id,
    name,
    type,
    version: `v${versionNumber}`,
    versionNumber,
    description: payload.description || previous?.description || '',
    source: payload.projectId ? `project:${payload.projectId}` : 'local',
    projectId: payload.projectId || null,
    createdAt,
    updatedAt: now,
    usage: previous?.usage ? [...previous.usage] : [],
    payload
  };

  if (existingIndex >= 0) {
    fallbackAgents.configs[existingIndex] = record;
  } else {
    fallbackAgents.configs.push(record);
  }

  recomputeFallbackUsage();

  return {
    ok: true,
    agent: JSON.parse(JSON.stringify(record))
  };
}

export async function listProviderStatus() {
  if (hasWindowAPI && typeof agentApi.listProviderStatus === 'function') {
    return agentApi.listProviderStatus();
  }

  await fallbackDelay();
  return fallbackProviderStatus;
}

export async function deleteAgent(agentId) {
  if (hasWindowAPI && typeof agentApi.deleteAgent === 'function') {
    return agentApi.deleteAgent(agentId);
  }

  await fallbackDelay();

  if (!agentId) {
    return { ok: false, error: 'Agent id is required' };
  }

  const index = fallbackAgents.configs.findIndex((item) => item.id === agentId);

  if (index >= 0) {
    fallbackAgents.configs.splice(index, 1);
  }

  recomputeFallbackUsage();

  return { ok: true };
}

export async function listPipelines() {
  if (hasWindowAPI && typeof agentApi.listPipelines === 'function') {
    return agentApi.listPipelines();
  }

  await fallbackDelay();
  return JSON.parse(JSON.stringify(fallbackPipelines));
}

export async function fetchEntityHistory(entityType, entityId) {
  if (
    hasWindowAPI &&
    typeof agentApi.listEntityHistory === 'function'
  ) {
    const response = await agentApi.listEntityHistory(entityType, entityId);

    if (response?.ok) {
      return response.history ?? [];
    }

    throw new Error(response?.error || 'Failed to load version history');
  }

  await fallbackDelay();
  return [];
}

export async function diffEntityVersions(entityType, idA, idB) {
  if (hasWindowAPI && typeof agentApi.diffEntityVersions === 'function') {
    const response = await agentApi.diffEntityVersions(entityType, idA, idB);

    if (response?.ok) {
      return response.diff;
    }

    throw new Error(response?.error || 'Failed to compute version diff');
  }

  await fallbackDelay();
  return {
    entityType,
    entityId: null,
    base: null,
    compare: null,
    changes: []
  };
}

export async function upsertPipeline(pipeline) {
  if (hasWindowAPI && typeof agentApi.upsertPipeline === 'function') {
    return agentApi.upsertPipeline(pipeline);
  }

  await fallbackDelay();

  const now = new Date().toISOString();
  const input = pipeline || {};
  const id = input.id || `pipeline-${Date.now()}`;
  const existingIndex = fallbackPipelines.findIndex((item) => item.id === id);
  const previous = existingIndex >= 0 ? fallbackPipelines[existingIndex] : null;
  const createdAt = previous?.createdAt || now;
  const version = (previous?.version || 0) + 1;
  const nodes = Array.isArray(input.nodes)
    ? input.nodes.map((node, index) => ({ ...node, id: node.id || `${id}-node-${index}` }))
    : [];
  const edges = Array.isArray(input.edges)
    ? input.edges.map((edge) => ({ ...edge }))
    : [];
  const agents = Array.from(new Set(nodes.map((node) => node?.agentName).filter(Boolean)));

  const record = {
    id,
    name: input.name || id,
    description: input.description || '',
    projectId: input.projectId || null,
    nodes,
    edges,
    override: input.override ?? null,
    version,
    createdAt,
    updatedAt: now,
    agents
  };

  if (existingIndex >= 0) {
    fallbackPipelines[existingIndex] = record;
  } else {
    fallbackPipelines.push(record);
  }

  recomputeFallbackUsage();

  return {
    ok: true,
    pipeline: JSON.parse(JSON.stringify(record))
  };
}

export async function deletePipeline(pipelineId) {
  if (hasWindowAPI && typeof agentApi.deletePipeline === 'function') {
    return agentApi.deletePipeline(pipelineId);
  }

  await fallbackDelay();

  if (!pipelineId) {
    return { ok: false, error: 'Pipeline id is required' };
  }

  const index = fallbackPipelines.findIndex((item) => item.id === pipelineId);

  if (index >= 0) {
    fallbackPipelines.splice(index, 1);
  }

  recomputeFallbackUsage();

  return { ok: true };
}

export async function runPipelineSimple(input) {
  if (hasWindowAPI && typeof agentApi.runPipelineSimple === 'function') {
    return agentApi.runPipelineSimple(input);
  }

  await fallbackDelay();
  return {
    ok: true,
    result: {
      status: 'mock',
      payload: input,
      nodes: []
    }
  };
}

export async function runPipeline(pipeline, payload) {
  if (hasWindowAPI && typeof agentApi.runPipeline === 'function') {
    return agentApi.runPipeline(pipeline, payload);
  }

  await fallbackDelay();
  return {
    ok: true,
    result: {
      status: 'mock',
      pipeline,
      payload,
      nodes: []
    }
  };
}

export async function listSchedules(projectId) {
  if (hasWindowAPI && typeof agentApi.listSchedules === 'function') {
    const response = await agentApi.listSchedules(projectId);

    if (response?.ok) {
      return response.schedules ?? [];
    }

    throw new Error(response?.error || 'Failed to load schedules');
  }

  await fallbackDelay();
  return [];
}

export async function upsertSchedule(schedule) {
  if (hasWindowAPI && typeof agentApi.upsertSchedule === 'function') {
    const response = await agentApi.upsertSchedule(schedule);

    if (response?.ok) {
      return response.schedule;
    }

    throw new Error(response?.error || 'Failed to save schedule');
  }

  await fallbackDelay();
  return { ...schedule, id: schedule?.id || 'offline-schedule' };
}

export async function deleteSchedule(scheduleId) {
  if (hasWindowAPI && typeof agentApi.deleteSchedule === 'function') {
    const response = await agentApi.deleteSchedule(scheduleId);

    if (response?.ok) {
      return true;
    }

    throw new Error(response?.error || 'Failed to delete schedule');
  }

  await fallbackDelay();
  return true;
}

export async function toggleSchedule(scheduleId, enabled) {
  if (hasWindowAPI && typeof agentApi.toggleSchedule === 'function') {
    const response = await agentApi.toggleSchedule(scheduleId, enabled);

    if (response?.ok) {
      return response.schedule;
    }

    throw new Error(response?.error || 'Failed to update schedule');
  }

  await fallbackDelay();
  return { id: scheduleId, enabled };
}

export async function runScheduleNow(scheduleId) {
  if (hasWindowAPI && typeof agentApi.runScheduleNow === 'function') {
    const response = await agentApi.runScheduleNow(scheduleId);

    if (response?.ok) {
      return true;
    }

    throw new Error(response?.error || 'Failed to trigger schedule');
  }

  await fallbackDelay();
  return true;
}

export async function getSchedulerStatus() {
  if (hasWindowAPI && typeof agentApi.getSchedulerStatus === 'function') {
    const response = await agentApi.getSchedulerStatus();

    if (response?.ok) {
      return response.status ?? fallbackSchedulerStatus;
    }

    throw new Error(response?.error || 'Failed to load scheduler status');
  }

  await fallbackDelay();
  return fallbackSchedulerStatus;
}

export function isAgentApiAvailable() {
  return hasWindowAPI;
}

export function normalizeBotStatus(status) {
  const merged = { ...fallbackBotStatus, ...(status || {}) };

  if (merged.status) {
    merged.status = String(merged.status).toLowerCase();
  }

  if (!merged.status) {
    merged.status = merged.running ? 'running' : merged.lastError ? 'error' : 'stopped';
  }

  if (!merged.deeplinkBase && merged.username) {
    merged.deeplinkBase = `https://t.me/${merged.username}`;
  }

  if (merged.status === 'running') {
    merged.running = true;
  } else if (merged.status === 'starting') {
    merged.running = false;
  } else if (merged.status === 'error') {
    merged.running = false;
  } else if (merged.status === 'stopped') {
    merged.running = false;
  }

  return merged;
}

function unwrapStatusResponse(response) {
  if (response?.ok) {
    const snapshot = response.state ?? response.status ?? null;
    return normalizeBotStatus(snapshot);
  }

  const message = response?.error || 'settings.telegram.errorUnknown';
  throw new Error(message);
}

export async function getTelegramStatus() {
  if (hasWindowAPI && typeof agentApi.getTelegramStatus === 'function') {
    const response = await agentApi.getTelegramStatus();

    if (response?.ok) {
      return normalizeBotStatus(response.status);
    }

    throw new Error(response?.error || 'Failed to load Telegram status');
  }

  await fallbackDelay();
  return normalizeBotStatus(fallbackBotState);
}

export async function setTelegramToken(token) {
  if (hasWindowAPI && typeof agentApi.setTelegramToken === 'function') {
    const response = await agentApi.setTelegramToken(token);
    return unwrapStatusResponse(response);
  }

  const trimmed = typeof token === 'string' ? token.trim() : '';
  const stored = trimmed.length > 0;
  const status = stored ? 'stopped' : 'stopped';

  await fallbackDelay();
  return setFallbackBotStatus({
    tokenStored: stored,
    tokenSource: stored ? 'fallback' : null,
    status,
    running: false,
    lastError: null
  });
}

export async function startTelegramBot() {
  if (hasWindowAPI && typeof agentApi.startTelegramBot === 'function') {
    const response = await agentApi.startTelegramBot();
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  return setFallbackBotStatus({
    status: 'running',
    running: true,
    lastError: null,
    startedAt: new Date().toISOString()
  });
}

export async function stopTelegramBot() {
  if (hasWindowAPI && typeof agentApi.stopTelegramBot === 'function') {
    const response = await agentApi.stopTelegramBot();
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  return setFallbackBotStatus({
    status: 'stopped',
    running: false
  });
}

export async function tailTelegramLog(limit = 20) {
  if (hasWindowAPI && typeof agentApi.tailTelegramLog === 'function') {
    const response = await agentApi.tailTelegramLog(limit);

    if (response?.ok) {
      return Array.isArray(response.lines) ? response.lines : [];
    }

    throw new Error(response?.error || 'Failed to load Telegram bot log');
  }

  await fallbackDelay();
  return fallbackBotLog.slice(-Math.max(1, limit));
}

export function subscribeToTelegramStatus(handler) {
  if (hasWindowAPI && typeof agentApi.onTelegramStatusChanged === 'function') {
    return agentApi.onTelegramStatusChanged(handler);
  }

  return () => {};
}

export async function getTelegramProxyConfig() {
  if (hasWindowAPI && typeof agentApi.getTelegramProxyConfig === "function") {
    const response = await agentApi.getTelegramProxyConfig();

    if (response?.ok) {
      return response.config ?? { ...fallbackProxyConfig };
    }

    throw new Error(response?.error || 'Failed to load Telegram proxy settings');
  }

  await fallbackDelay();
  return { ...fallbackProxyConfig };
}

export async function setTelegramProxyConfig(config) {
  if (hasWindowAPI && typeof agentApi.setTelegramProxyConfig === "function") {
    const response = await agentApi.setTelegramProxyConfig(config);

    if (response?.ok) {
      return response.config ?? { ...fallbackProxyConfig };
    }

    throw new Error(response?.error || 'Failed to update Telegram proxy settings');
  }

  const httpsProxy = typeof config?.httpsProxy === "string" ? config.httpsProxy.trim() : "";
  const httpProxy = typeof config?.httpProxy === "string" ? config.httpProxy.trim() : "";

  fallbackProxyConfig.httpsProxy = httpsProxy;
  fallbackProxyConfig.httpProxy = httpProxy;

  await fallbackDelay();
  return { ...fallbackProxyConfig };
}

export async function fetchLatestBrief(projectId) {
  if (hasWindowAPI && typeof agentApi.fetchLatestBrief === 'function') {
    const response = await agentApi.fetchLatestBrief(projectId);

    if (response?.ok) {
      return response.brief ?? null;
    }

    throw new Error(response?.error || 'Failed to load latest brief');
  }

  await fallbackDelay();
  return null;
}

export async function generateBriefPlan(projectId) {
  if (hasWindowAPI && typeof agentApi.generateBriefPlan === 'function') {
    const response = await agentApi.generateBriefPlan(projectId);

    if (response?.ok) {
      return response;
    }

    throw new Error(response?.error || 'Failed to generate campaign plan');
  }

  await fallbackDelay();
  return { plan: '', brief: null };
}

export function subscribeToBriefUpdates(handler) {
  if (hasWindowAPI && typeof agentApi.onBriefUpdated === 'function') {
    return agentApi.onBriefUpdated(handler);
  }

  return () => {};
}

export async function runProviderDiagnostic(command) {
  if (hasWindowAPI && typeof agentApi.runProviderDiagnostic === 'function') {
    const response = await agentApi.runProviderDiagnostic(command);

    if (response?.ok) {
      return response.result;
    }

    throw new Error(response?.error || 'Failed to run provider diagnostic command');
  }

  await fallbackDelay();
  return { ok: false };
}



