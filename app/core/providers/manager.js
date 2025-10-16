import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'providers.json');
const DEFAULT_TIMEOUT = 30_000;
const PROVIDER_LOG_PATH = path.join(process.cwd(), 'data', 'logs', 'provider-manager.jsonl');

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
    this.defaultPolicies = this.buildPolicies(config.limits || {});
    this.rateLimiterState = new Map();
    this.breakerState = new Map();
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

    const providerType = engine.provider?.type ?? 'llm';
    const execute = () => {
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
    };

    return this.runWithPolicies(engine.providerId, providerType, execute, {
      operation: 'llm',
      agentName,
      model: engine.model
    });
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
      const error = new Error(`OpenAI request failed: ${response.status} ${errorText}`);
      error.status = response.status;
      throw error;
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
      const error = new Error(`Gemini request failed: ${response.status} ${errorText}`);
      error.status = response.status;
      throw error;
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
      const error = new Error(`Ollama request failed: ${response.status} ${errorText}`);
      error.status = response.status;
      throw error;
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

    const providerType = engine.provider?.type ?? 'image';

    return this.runWithPolicies(
      engine.providerId,
      providerType,
      async () => ({
        mode: 'live',
        providerId: engine.providerId,
        model: engine.model,
        images: params.images || []
      }),
      {
        operation: 'image',
        agentName,
        model: engine.model
      }
    );
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

    const providerType = engine.provider?.type ?? 'video';

    return this.runWithPolicies(
      engine.providerId,
      providerType,
      async () => ({
        mode: 'live',
        providerId: engine.providerId,
        model: engine.model,
        videos: params.videos || []
      }),
      {
        operation: 'video',
        agentName,
        model: engine.model
      }
    );
  }

  buildPolicies(rawLimits) {
    const rateLimit = rawLimits.rateLimit || {};
    const retry = rawLimits.retry || {};
    const breaker = rawLimits.breaker || {};

    return {
      rateLimit: {
        rps: Math.max(0, rateLimit.rps ?? 3),
        burst: Math.max(1, rateLimit.burst ?? rateLimit.rps ?? 3)
      },
      retry: {
        maxRetries: Math.max(0, Math.min(retry.maxRetries ?? 3, 3)),
        baseDelayMs: Math.max(50, retry.baseDelayMs ?? 300),
        maxDelayMs: Math.max(retry.baseDelayMs ?? 300, retry.maxDelayMs ?? 6_000)
      },
      breaker: {
        threshold: Math.max(1, breaker.threshold ?? 5),
        intervalMs: Math.max(1_000, breaker.intervalMs ?? 60_000),
        cooldownMs: Math.max(5_000, breaker.cooldownMs ?? 120_000)
      }
    };
  }

  getPolicies(providerId) {
    const provider = this.getProvider(providerId);
    const overrides = provider?.limits || {};

    return this.buildPolicies({
      rateLimit: {
        ...this.defaultPolicies.rateLimit,
        ...(overrides.rateLimit || {})
      },
      retry: {
        ...this.defaultPolicies.retry,
        ...(overrides.retry || {})
      },
      breaker: {
        ...this.defaultPolicies.breaker,
        ...(overrides.breaker || {})
      }
    });
  }

  ensureRateLimiterState(providerId, policies) {
    let state = this.rateLimiterState.get(providerId);

    if (!state) {
      const capacity = Math.max(1, policies.rateLimit.burst ?? policies.rateLimit.rps ?? 1);
      const refillRate = Math.max(0, policies.rateLimit.rps ?? 0);

      state = {
        capacity,
        refillRate,
        tokens: capacity,
        lastRefill: Date.now()
      };

      this.rateLimiterState.set(providerId, state);
    }

    return state;
  }

  refillTokens(state) {
    const now = Date.now();
    const elapsedSeconds = (now - state.lastRefill) / 1000;

    if (elapsedSeconds > 0 && state.refillRate > 0) {
      state.tokens = Math.min(state.capacity, state.tokens + elapsedSeconds * state.refillRate);
      state.lastRefill = now;
    } else if (elapsedSeconds > 0) {
      state.lastRefill = now;
    }
  }

  async acquireToken(providerId, policies, meta = {}) {
    const state = this.ensureRateLimiterState(providerId, policies);

    while (true) {
      this.refillTokens(state);

      if (state.tokens >= 1) {
        state.tokens -= 1;
        return;
      }

      const deficit = 1 - state.tokens;
      const waitMs = Math.ceil((deficit / Math.max(state.refillRate, 0.0001)) * 1000);

      await this.logEvent({
        level: 'info',
        event: 'rate.wait',
        providerId,
        waitMs,
        ...meta
      });

      await sleep(waitMs);
    }
  }

  ensureBreakerState(providerId) {
    let state = this.breakerState.get(providerId);

    if (!state) {
      state = {
        failures: [],
        openUntil: 0
      };

      this.breakerState.set(providerId, state);
    }

    return state;
  }

  pruneFailures(state, intervalMs) {
    const cutoff = Date.now() - intervalMs;
    state.failures = state.failures.filter((ts) => ts >= cutoff);
  }

  async recordFailure(providerId, type, error, policies, meta, attempt) {
    const state = this.ensureBreakerState(providerId);

    this.pruneFailures(state, policies.breaker.intervalMs);
    state.failures.push(Date.now());

    await this.logEvent({
      level: 'error',
      event: 'call.failure',
      providerId,
      type,
      attempt,
      message: error.message,
      status: error.status,
      failures: state.failures.length,
      ...meta
    });

    if (state.failures.length >= policies.breaker.threshold) {
      state.openUntil = Date.now() + policies.breaker.cooldownMs;

      await this.logEvent({
        level: 'error',
        event: 'breaker.open',
        providerId,
        type,
        openUntil: new Date(state.openUntil).toISOString(),
        failures: state.failures.length,
        ...meta
      });

      return true;
    }

    return false;
  }

  async recordSuccess(providerId, type, meta) {
    const state = this.ensureBreakerState(providerId);
    const hadFailures = state.failures.length > 0 || state.openUntil > 0;

    state.failures = [];
    state.openUntil = 0;

    if (hadFailures) {
      await this.logEvent({
        level: 'info',
        event: 'breaker.close',
        providerId,
        type,
        ...meta
      });
    }
  }

  isRetryable(error) {
    if (!error || typeof error !== 'object') {
      return true;
    }

    if (error.status === undefined) {
      return true;
    }

    if (error.status >= 500) {
      return true;
    }

    return [408, 409, 425, 429, 499].includes(error.status);
  }

  computeBackoffDelay(attempt, policies) {
    const base = policies.retry.baseDelayMs;
    const max = policies.retry.maxDelayMs;

    return Math.min(max, Math.round(base * 2 ** (attempt - 1)));
  }

  async runWithPolicies(providerId, type, operation, meta = {}) {
    const policies = this.getPolicies(providerId);
    const breakerState = this.ensureBreakerState(providerId);
    const now = Date.now();

    if (breakerState.openUntil && now < breakerState.openUntil) {
      await this.logEvent({
        level: 'warn',
        event: 'breaker.blocked',
        providerId,
        type,
        openUntil: new Date(breakerState.openUntil).toISOString(),
        ...meta
      });

      const error = new Error(`Circuit breaker open for provider ${providerId}`);
      error.code = 'PROVIDER_BREAKER_OPEN';
      throw error;
    }

    if (breakerState.openUntil && now >= breakerState.openUntil) {
      breakerState.openUntil = 0;
      breakerState.failures = [];

      await this.logEvent({
        level: 'info',
        event: 'breaker.half-open',
        providerId,
        type,
        ...meta
      });
    }

    const maxRetries = Math.min(policies.retry.maxRetries ?? 0, 3);
    const maxAttempts = 1 + Math.max(0, maxRetries);
    let attempt = 0;
    let lastError = null;

    while (attempt < maxAttempts) {
      attempt += 1;

      await this.acquireToken(providerId, policies, { type, ...meta, attempt });

      try {
        const result = await operation();

        await this.logEvent({
          level: 'info',
          event: 'call.success',
          providerId,
          type,
          attempt,
          ...meta
        });

        await this.recordSuccess(providerId, type, meta);

        return result;
      } catch (error) {
        lastError = error;

        const breakerOpened = await this.recordFailure(providerId, type, error, policies, meta, attempt);

        if (breakerOpened) {
          const breakerError = new Error(`Circuit breaker opened for provider ${providerId}`);
          breakerError.code = 'PROVIDER_BREAKER_OPEN';
          breakerError.cause = error;
          throw breakerError;
        }

        const shouldRetry = attempt < maxAttempts && this.isRetryable(error);

        if (!shouldRetry) {
          throw error;
        }

        const delay = this.computeBackoffDelay(attempt, policies);

        await this.logEvent({
          level: 'warn',
          event: 'retry.schedule',
          providerId,
          type,
          attempt: attempt + 1,
          delayMs: delay,
          message: error.message,
          status: error.status,
          ...meta
        });

        await sleep(delay);
      }
    }

    await this.logEvent({
      level: 'error',
      event: 'retry.exhausted',
      providerId,
      type,
      attempts: maxAttempts,
      message: lastError?.message,
      status: lastError?.status,
      ...meta
    });

    if (lastError) {
      throw lastError;
    }

    const error = new Error(`Exhausted retries for provider ${providerId}`);
    error.code = 'PROVIDER_RETRIES_EXHAUSTED';
    throw error;
  }

  async logEvent(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...event
    };

    try {
      await fs.mkdir(path.dirname(PROVIDER_LOG_PATH), { recursive: true });
      await fs.appendFile(PROVIDER_LOG_PATH, `${JSON.stringify(entry)}\n`);
    } catch (error) {
      // Ignore logging errors to avoid side effects in provider flows.
    }
  }
}

export async function createProviderManager() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw);

  return new ProviderManager(config);
}
