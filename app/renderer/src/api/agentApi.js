import { computeJsonDiff } from '../../shared/jsonDiff.js';

const agentApi = typeof window !== 'undefined' ? window.AgentAPI : undefined;
const hasWindowAPI = Boolean(agentApi);

const fallbackDelay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const fallbackAgents = {
  plugins: [
    {
      id: 'WriterAgent',
      name: 'WriterAgent',
      version: '0.1.0',
      description: 'Шаблонный генератор контента'
    },
    {
      id: 'UploaderAgent',
      name: 'UploaderAgent',
      version: '0.1.0',
      description: 'Сохранение артефактов в файловую систему'
    }
  ],
  configs: []
};

const fallbackProviderStatus = [
  { id: 'openai', type: 'llm', hasKey: false, apiKeyRef: 'OPENAI_API_KEY', models: ['gpt-4o-mini'] },
  { id: 'gemini', type: 'llm', hasKey: false, apiKeyRef: 'GOOGLE_API_KEY', models: ['gemini-2.0-flash'] },
  { id: 'stability', type: 'image', hasKey: false, apiKeyRef: 'STABILITY_API_KEY', models: ['sd3.5'] }
];

const fallbackBotStatus = {
  running: false,
  startedAt: null,
  username: null,
  restarts: 0,
  lastError: null,
  tokenStored: false,
  deeplinkBase: null
};

export async function listAgents() {
  if (hasWindowAPI && typeof agentApi.listAgents === 'function') {
    return agentApi.listAgents();
  }

  await fallbackDelay();
  return fallbackAgents;
}

export async function listProviderStatus() {
  if (hasWindowAPI && typeof agentApi.listProviderStatus === 'function') {
    return agentApi.listProviderStatus();
  }

  await fallbackDelay();
  return fallbackProviderStatus;
}

export async function listPipelines() {
  if (hasWindowAPI && typeof agentApi.listPipelines === 'function') {
    return agentApi.listPipelines();
  }

  await fallbackDelay();
  return [];
}

export async function upsertPipeline(pipeline) {
  if (hasWindowAPI && typeof agentApi.upsertPipeline === 'function') {
    return agentApi.upsertPipeline(pipeline);
  }

  await fallbackDelay();
  return { ok: true, pipeline };
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

export function isAgentApiAvailable() {
  return hasWindowAPI;
}

export async function listProjects() {
  if (hasWindowAPI && typeof agentApi.listProjects === 'function') {
    return agentApi.listProjects();
  }

  await fallbackDelay();
  return [];
}

export async function upsertProject(project) {
  if (hasWindowAPI && typeof agentApi.upsertProject === 'function') {
    return agentApi.upsertProject(project);
  }

  await fallbackDelay();
  return project;
}

export async function listBriefs(projectId) {
  if (hasWindowAPI && typeof agentApi.listBriefs === 'function') {
    return agentApi.listBriefs(projectId);
  }

  await fallbackDelay();
  return [];
}

export async function upsertBrief(brief) {
  if (hasWindowAPI && typeof agentApi.upsertBrief === 'function') {
    return agentApi.upsertBrief(brief);
  }

  await fallbackDelay();
  return {
    ...brief,
    id: brief.id || `brief-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function generateBriefPlan(payload) {
  if (hasWindowAPI && typeof agentApi.generateBriefPlan === 'function') {
    return agentApi.generateBriefPlan(payload);
  }

  await fallbackDelay();
  return 'План появится после подключения IPC.';
}

export async function getBotStatus() {
  if (hasWindowAPI && typeof agentApi.botStatus === 'function') {
    return agentApi.botStatus();
  }

  await fallbackDelay();
  return fallbackBotStatus;
}

export async function listAgentHistory(agentId, limit = 20) {
  if (!agentId) {
    return [];
  }

  if (hasWindowAPI && typeof agentApi.listAgentHistory === 'function') {
    return agentApi.listAgentHistory(agentId, limit);
  }

  await fallbackDelay();
  return [];
}

export async function listPipelineHistory(pipelineId, limit = 20) {
  if (!pipelineId) {
    return [];
  }

  if (hasWindowAPI && typeof agentApi.listPipelineHistory === 'function') {
    return agentApi.listPipelineHistory(pipelineId, limit);
  }

  await fallbackDelay();
  return [];
}

function fallbackResolvePointer(pointer) {
  if (!pointer) {
    return null;
  }

  if (typeof pointer === 'object') {
    if (pointer.draft) {
      return pointer.draft;
    }

    if (pointer.payload) {
      return pointer.payload;
    }
  }

  return null;
}

export async function diffEntity(payload) {
  if (hasWindowAPI && typeof agentApi.diffEntity === 'function') {
    return agentApi.diffEntity(payload);
  }

  await fallbackDelay();
  const left = fallbackResolvePointer(payload?.idA);
  const right = fallbackResolvePointer(payload?.idB);

  return {
    type: payload?.type ?? null,
    left,
    right,
    diff: computeJsonDiff(left, right)
  };
}

export async function setBotToken(token) {
  if (hasWindowAPI && typeof agentApi.botSetToken === 'function') {
    return agentApi.botSetToken(token);
  }

  await fallbackDelay();
  return fallbackBotStatus;
}

export async function startBot() {
  if (hasWindowAPI && typeof agentApi.botStart === 'function') {
    return agentApi.botStart();
  }

  await fallbackDelay();
  return fallbackBotStatus;
}

export async function stopBot() {
  if (hasWindowAPI && typeof agentApi.botStop === 'function') {
    return agentApi.botStop();
  }

  await fallbackDelay();
  return fallbackBotStatus;
}

export function onBriefUpdated(handler) {
  if (hasWindowAPI && typeof agentApi.onBriefUpdated === 'function') {
    return agentApi.onBriefUpdated(handler);
  }

  return () => {};
}
