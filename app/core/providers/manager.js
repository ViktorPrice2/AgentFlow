import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'providers.json');
const DEFAULT_TIMEOUT = 30_000;

const MOCK_TEXT = (providerId, model, prompt) =>
  `[MOCK:${providerId}:${model}] ${prompt?.slice(0, 200) ?? 'Нет входных данных'}`;

const MOCK_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAI0lEQVQoU2NkYGD4z0AEYBxVSFUBCzUCJgYkgtiGSgDRIVQBAO5BCZ9gX2jhAAAAABJRU5ErkJggg==';

const MOCK_VIDEO_URL = 'https://example.com/mock-video-placeholder.mp4';

function buildHeaders(apiKey, extra = {}) {
  return {
    Authorization: apiKey ? `Bearer ${apiKey}` : undefined,
    'Content-Type': 'application/json',
    ...extra
  };
}

function scrubUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

class ProviderManager {
  constructor(config) {
    this.providers = config.providers || [];
    this.defaults = config.defaults || {};
    this.providerMap = new Map(this.providers.map((provider) => [provider.id, provider]));
    this.statusCache = null;
    this.envLoaded = false;
  }

  ensureEnvLoaded() {
    if (this.envLoaded) {
      return;
    }

    dotenv.config({ path: path.join(process.cwd(), '.env') });
    this.envLoaded = true;
  }

  getProvider(providerId) {
    return this.providerMap.get(providerId) || null;
  }

  getProviderStatus() {
    this.ensureEnvLoaded();

    if (!this.statusCache) {
      this.statusCache = this.providers.map((provider) => {
        const apiKey = provider.apiKeyRef ? process.env[provider.apiKeyRef] : null;

        return {
          id: provider.id,
          type: provider.type,
          hasKey: Boolean(apiKey),
          apiKeyRef: provider.apiKeyRef || null,
          models: provider.models || []
        };
      });
    }

    return this.statusCache;
  }

  getDefaultForType(type) {
    if (!type) {
      return null;
    }

    return this.defaults?.[type] || null;
  }

  selectCandidates({ override, agentConfig, requiredType }) {
    const candidates = [];

    if (override?.engine) {
      candidates.push(override.engine);
    }

    if (agentConfig?.engine) {
      candidates.push(agentConfig.engine);
      if (Array.isArray(agentConfig.engine.fallback)) {
        candidates.push(...agentConfig.engine.fallback);
      }
    }

    const defaultCandidate = this.getDefaultForType(requiredType);

    if (defaultCandidate) {
      candidates.push(defaultCandidate);
    }

    return candidates;
  }

  resolveEngine({ agentName, agentConfig, override, requiredType = 'llm' }) {
    this.ensureEnvLoaded();

    const candidates = this.selectCandidates({ override, agentConfig, requiredType });
    let mockReason = null;
    let mockCandidate = null;

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      const providerId = candidate.provider;
      const provider = this.getProvider(providerId);

      if (!provider) {
        continue;
      }

      if (requiredType && provider.type !== requiredType) {
        continue;
      }

      const model =
        candidate.model ||
        (Array.isArray(candidate.models) && candidate.models.length > 0
          ? candidate.models[0]
          : provider.models?.[0]);

      const apiKey = provider.apiKeyRef ? process.env[provider.apiKeyRef] : undefined;
      const hasKey = Boolean(apiKey) || !provider.apiKeyRef;

      if (hasKey) {
        return {
          providerId,
          provider,
          model,
          mode: 'live',
          apiKey,
          baseUrl: candidate.baseUrl || provider.baseUrl || '',
          temperature: candidate.temperature,
          maxTokens: candidate.maxTokens
        };
      }

      if (!mockCandidate) {
        mockCandidate = { provider, model };
        mockReason = `missing-api-key:${provider.apiKeyRef}`;
      }
    }

    if (mockCandidate) {
      return {
        providerId: mockCandidate.provider.id,
        provider: mockCandidate.provider,
        model: mockCandidate.model,
        mode: 'mock',
        reason: mockReason
      };
    }

    return {
      providerId: 'mock',
      provider: {
        id: 'mock',
        type: requiredType,
        models: []
      },
      model: 'mock',
      mode: 'mock',
      reason: 'no-provider-available'
    };
  }

  createExecutionContext(ctx) {
    return {
      listStatus: () => this.getProviderStatus(),
      resolveEngine: (agentName, override = {}, requiredType = 'llm') => {
        const agentConfig = ctx.getAgentConfig ? ctx.getAgentConfig(agentName) : null;

        return this.resolveEngine({ agentName, agentConfig, override, requiredType });
      },
      callLLM: (agentName, params = {}) =>
        this.callLLM({
          agentName,
          params,
          ctx
        }),
      callImage: (agentName, params = {}) =>
        this.callImage({
          agentName,
          params,
          ctx
        }),
      callVideo: (agentName, params = {}) =>
        this.callVideo({
          agentName,
          params,
          ctx
        })
    };
  }

  async callLLM({ agentName, params, ctx }) {
    const agentConfig = ctx.getAgentConfig ? ctx.getAgentConfig(agentName) : null;
    const engine = this.resolveEngine({
      agentName,
      agentConfig,
      override: params.override,
      requiredType: 'llm'
    });

    if (engine.mode === 'mock') {
      const prompt =
        params.prompt ||
        (Array.isArray(params.messages)
          ? params.messages.map((item) => item.content || '').join(' ')
          : '');
      const content = MOCK_TEXT(engine.providerId, engine.model, prompt);

      await ctx.log?.('provider:mock', {
        agentName,
        providerId: engine.providerId,
        type: 'llm',
        reason: engine.reason
      });

      return {
        mode: 'mock',
        content,
        providerId: engine.providerId,
        model: engine.model
      };
    }

    switch (engine.providerId) {
      case 'openai':
        return this.callOpenAI(engine, params);
      case 'gemini':
        return this.callGemini(engine, params);
      case 'ollama':
        return this.callOllama(engine, params);
      default:
        return {
          mode: 'mock',
          content: MOCK_TEXT(engine.providerId, engine.model, params.prompt),
          providerId: engine.providerId,
          model: engine.model,
          reason: 'unsupported-provider'
        };
    }
  }

  async callOpenAI(engine, params) {
    const { apiKey, baseUrl } = engine;
    const endpoint = `${baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
    const body = scrubUndefined({
      model: engine.model,
      temperature: params.temperature ?? engine.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? engine.maxTokens,
      messages: params.messages ?? [{ role: 'user', content: params.prompt || '' }]
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: scrubUndefined(buildHeaders(apiKey)),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    return {
      mode: 'live',
      providerId: engine.providerId,
      model: engine.model,
      content: data.choices?.[0]?.message?.content ?? '',
      raw: data
    };
  }

  async callGemini(engine, params) {
    const { apiKey, baseUrl } = engine;
    const endpoint = `${baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${engine.model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          parts: [
            {
              text: params.prompt ?? (params.messages || []).map((msg) => msg.content).join('\n')
            }
          ]
        }
      ]
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content =
      data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n') || '';

    return {
      mode: 'live',
      providerId: engine.providerId,
      model: engine.model,
      content,
      raw: data
    };
  }

  async callOllama(engine, params) {
    const endpoint = `${engine.baseUrl || 'http://localhost:11434'}/api/generate`;
    const body = scrubUndefined({
      model: engine.model,
      prompt: params.prompt,
      stream: false,
      options: {
        temperature: params.temperature ?? engine.temperature
      }
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    return {
      mode: 'live',
      providerId: engine.providerId,
      model: engine.model,
      content: data.response || '',
      raw: data
    };
  }

  async callImage({ agentName, params, ctx }) {
    const agentConfig = ctx.getAgentConfig ? ctx.getAgentConfig(agentName) : null;
    const engine = this.resolveEngine({
      agentName,
      agentConfig,
      override: params.override,
      requiredType: 'image'
    });

    if (engine.mode === 'mock') {
      await ctx.log?.('provider:mock', {
        agentName,
        providerId: engine.providerId,
        type: 'image',
        reason: engine.reason
      });

      return {
        mode: 'mock',
        images: [
          {
            id: crypto.randomUUID(),
            dataUri: MOCK_IMAGE_DATA_URI
          }
        ]
      };
    }

    // Placeholder implementation for image providers.
    return {
      mode: 'live',
      providerId: engine.providerId,
      model: engine.model,
      images: params.images || []
    };
  }

  async callVideo({ agentName, params, ctx }) {
    const agentConfig = ctx.getAgentConfig ? ctx.getAgentConfig(agentName) : null;
    const engine = this.resolveEngine({
      agentName,
      agentConfig,
      override: params.override,
      requiredType: 'video'
    });

    if (engine.mode === 'mock') {
      await ctx.log?.('provider:mock', {
        agentName,
        providerId: engine.providerId,
        type: 'video',
        reason: engine.reason
      });

      return {
        mode: 'mock',
        videos: [
          {
            id: crypto.randomUUID(),
            url: MOCK_VIDEO_URL
          }
        ]
      };
    }

    // Placeholder implementation for video providers.
    return {
      mode: 'live',
      providerId: engine.providerId,
      model: engine.model,
      videos: params.videos || []
    };
  }
}

export async function createProviderManager() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw);

  return new ProviderManager(config);
}
