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
