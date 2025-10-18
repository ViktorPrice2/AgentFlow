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

export async function listSchedules(projectId) {
  if (hasWindowAPI && typeof agentApi.listSchedules === 'function') {
    const response = await agentApi.listSchedules(projectId);

    if (response?.ok) {
      return response.schedules ?? [];
    }

    throw new Error(response?.error || 'Не удалось получить расписания');
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

    throw new Error(response?.error || 'Не удалось сохранить расписание');
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

    throw new Error(response?.error || 'Не удалось удалить расписание');
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

    throw new Error(response?.error || 'Не удалось обновить расписание');
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

    throw new Error(response?.error || 'Не удалось запустить расписание');
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

    throw new Error(response?.error || 'Не удалось получить статус планировщика');
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
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  return normalizeBotStatus();
}

export async function setTelegramToken(token) {
  if (hasWindowAPI && typeof agentApi.setTelegramToken === 'function') {
    const response = await agentApi.setTelegramToken(token);
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  throw new Error('settings.telegram.errorUnavailable');
}

export async function startTelegramBot() {
  if (hasWindowAPI && typeof agentApi.startTelegramBot === 'function') {
    const response = await agentApi.startTelegramBot();
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  throw new Error('settings.telegram.errorUnavailable');
}

export async function stopTelegramBot() {
  if (hasWindowAPI && typeof agentApi.stopTelegramBot === 'function') {
    const response = await agentApi.stopTelegramBot();
    return unwrapStatusResponse(response);
  }

  await fallbackDelay();
  return normalizeBotStatus();
}

export function subscribeToTelegramStatus(handler) {
  if (hasWindowAPI && typeof agentApi.onTelegramStatusChanged === 'function') {
    return agentApi.onTelegramStatusChanged(handler);
  }

  return () => {};
}

export async function tailTelegramLog(limit = 20) {
  if (hasWindowAPI && typeof agentApi.tailTelegramLog === 'function') {
    const response = await agentApi.tailTelegramLog(limit);

    if (response?.ok) {
      const lines = Array.isArray(response.lines) ? response.lines : [];
      return lines;
    }

    throw new Error(response?.error || 'Не удалось получить содержимое лога Telegram-бота');
  }

  await fallbackDelay();
  return [];
}

export async function getTelegramProxyConfig() {
  if (hasWindowAPI && typeof agentApi.getTelegramProxyConfig === "function") {
    const response = await agentApi.getTelegramProxyConfig();

    if (response?.ok) {
      return response.config ?? { ...fallbackProxyConfig };
    }

    throw new Error(response?.error || "�� ������� �������� ��������� ������ Telegram");
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

    throw new Error(response?.error || "�� ������� ��������� ��������� ������ Telegram");
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

    throw new Error(
      response?.error || 'Не удалось выполнить диагностическую команду провайдеров'
    );
  }

  await fallbackDelay();
  return { ok: false };
}

