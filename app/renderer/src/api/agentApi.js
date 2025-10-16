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
  tokenStored: false,
  username: null,
  lastError: 'Бот доступен только в настольном приложении',
  startedAt: null,
  lastActivityAt: null,
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

export async function fetchEntityHistory(entityType, entityId) {
  if (
    hasWindowAPI &&
    typeof agentApi.listEntityHistory === 'function'
  ) {
    const response = await agentApi.listEntityHistory(entityType, entityId);

    if (response?.ok) {
      return response.history ?? [];
    }

    throw new Error(response?.error || 'Не удалось получить историю версий');
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

    throw new Error(response?.error || 'Не удалось вычислить различия версий');
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

function unwrapStatusResponse(response) {
  if (response?.ok) {
    return response.status ?? fallbackBotStatus;
  }

  throw new Error(response?.error || 'Не удалось получить ответ от Telegram-бота');
}

export async function getTelegramStatus() {
  if (hasWindowAPI && typeof agentApi.getTelegramStatus === 'function') {
    const response = await agentApi.getTelegramStatus();
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  return fallbackBotStatus;
}

export async function setTelegramToken(token) {
  if (hasWindowAPI && typeof agentApi.setTelegramToken === 'function') {
    const response = await agentApi.setTelegramToken(token);
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  return fallbackBotStatus;
}

export async function startTelegramBot() {
  if (hasWindowAPI && typeof agentApi.startTelegramBot === 'function') {
    const response = await agentApi.startTelegramBot();
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  throw new Error('Запуск Telegram-бота доступен только в приложении');
}

export async function stopTelegramBot() {
  if (hasWindowAPI && typeof agentApi.stopTelegramBot === 'function') {
    const response = await agentApi.stopTelegramBot();
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  return fallbackBotStatus;
}

export async function fetchLatestBrief(projectId) {
  if (hasWindowAPI && typeof agentApi.fetchLatestBrief === 'function') {
    const response = await agentApi.fetchLatestBrief(projectId);

    if (response?.ok) {
      return response.brief ?? null;
    }

    throw new Error(response?.error || 'Не удалось получить бриф');
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

    throw new Error(response?.error || 'Не удалось сформировать план кампании');
  }

  await fallbackDelay();
  return { plan: '', brief: null };
}
