import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'providers.jsonl');

function nowTs() {
  return new Date().toISOString();
}
async function ensureLogs() {
  await fs.mkdir(LOGS_DIR, { recursive: true });
}
async function appendLog(entry) {
  await ensureLogs();
  const line = JSON.stringify({ ts: nowTs(), ...entry }) + '\n';
  await fs.appendFile(LOG_FILE, line, 'utf8');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeGetEnv(ref) {
  if (!ref) return null;
  return process.env[ref] || null;
}

/* Token bucket helper */
class TokenBucket {
  constructor({ capacity = 5, refillPerSec = 5 } = {}) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    const add = elapsed * this.refillPerSec;
    this.tokens = Math.min(this.capacity, this.tokens + add);
    this.lastRefill = now;
  }
  async removeToken() {
    // wait until at least one token available
    while (true) {
      this._refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // sleep small fraction
      await sleep(100);
    }
  }
}

/* ProviderManager */
export function createProviderManager(
  configPath = path.join(process.cwd(), 'app', 'config', 'providers.json')
) {
  let config = { providers: [] };
  const providers = new Map();
  const states = new Map(); // providerId -> { bucket, failures:[], openUntil }

  async function loadConfig() {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(raw);
    } catch (e) {
      // default empty config
      config = { providers: [] };
    }
    for (const p of config.providers || []) {
      const id = p.id;
      providers.set(id, p);
      const rl = p.rateLimit || {};
      const bucket = new TokenBucket({
        capacity: rl.capacity ?? 5,
        refillPerSec: rl.refillPerSec ?? (rl.rps ?? 5)
      });
      states.set(id, { bucket, failures: [], openUntil: 0 });
    }
    await appendLog({ event: 'providers_loaded', data: { count: (config.providers || []).length } });
  }

  function getProvider(id) {
    return providers.get(id);
  }

  function now() {
    return Date.now();
  }

  function recordFailure(id) {
    const s = states.get(id);
    if (!s) return;
    const ts = now();
    s.failures.push(ts);
    // keep only last windowSec seconds
    const windowSec = (getProvider(id)?.circuitBreaker?.windowSec) ?? 60;
    const cutoff = ts - windowSec * 1000;
    s.failures = s.failures.filter((t) => t >= cutoff);
    const threshold = (getProvider(id)?.circuitBreaker?.threshold) ?? 5;
    if (s.failures.length >= threshold) {
      const cooldownSec = (getProvider(id)?.circuitBreaker?.cooldownSec) ?? 30;
      s.openUntil = ts + cooldownSec * 1000;
      appendLog({ event: 'circuit_open', data: { provider: id, threshold, cooldownSec } }).catch(() => {});
    }
  }

  function recordSuccess(id) {
    const s = states.get(id);
    if (!s) return;
    s.failures = [];
    s.openUntil = 0;
  }

  function isOpen(id) {
    const s = states.get(id);
    if (!s) return false;
    return s.openUntil && s.openUntil > now();
  }

  async function call(providerId, payload = {}, opts = {}) {
    const provider = getProvider(providerId);
    if (!provider) throw new Error(`provider-not-found:${providerId}`);

    const state = states.get(providerId);
    if (!state) throw new Error('provider-state-missing');

    // circuit check
    if (isOpen(providerId)) {
      await appendLog({ event: 'call_rejected_circuit_open', data: { provider: providerId } });
      throw new Error('circuit-open');
    }

    // check key presence
    const apiKeyRef = provider.apiKeyRef;
    const apiKey = safeGetEnv(apiKeyRef);
    const useMock = !apiKey && provider.allowMock !== false;

    // acquire token
    await state.bucket.removeToken();

    // attempt with retries/backoff
    const maxAttempts = (provider.retry && provider.retry.maxAttempts) ?? (opts.maxAttempts ?? 3);
    let attempt = 0;
    let lastErr = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        await appendLog({ event: 'call_attempt', data: { provider: providerId, attempt, mock: useMock } });
        // dispatch by type, for MVP return mock if no key or provider has mock handler
        if (useMock) {
          // return lightweight mock payload
          const res = { mock: true, provider: providerId, type: provider.type || 'unknown', payload: {} };
          recordSuccess(providerId);
          await appendLog({ event: 'call_mock_result', data: { provider: providerId } });
          return res;
        }

        // real call handlers (thin wrappers)
        let result;
        if (provider.type === 'llm') {
          // do not include apiKey in logs
          result = await callLLM(provider, payload, apiKey);
        } else if (provider.type === 'image') {
          result = await callImage(provider, payload, apiKey);
        } else if (provider.type === 'video') {
          result = await callVideo(provider, payload, apiKey);
        } else {
          // unknown provider type → fallback to mock
          result = { mock: true, provider: providerId };
        }

        recordSuccess(providerId);
        await appendLog({ event: 'call_success', data: { provider: providerId, attempt } });
        return result;
      } catch (err) {
        lastErr = err;
        await appendLog({ event: 'call_error', data: { provider: providerId, attempt, message: String(err) } });
        recordFailure(providerId);
        if (attempt >= maxAttempts) break;
        const backoff = 200 * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
    // exhausted
    await appendLog({ event: 'call_failed', data: { provider: providerId, attempts: attempt } });
    throw lastErr || new Error('call-failed');
  }

  // thin LLM/Image/Video handlers (MVP)
  async function callLLM(provider, payload, apiKey) {
    // Minimal: for known "ollama" provider allow local HTTP; others are placeholders.
    if (provider.id === 'ollama' && provider.baseUrl) {
      // call local ollama (example POST) — consumer should extend per API
      const url = `${provider.baseUrl}/api/generate`;
      const body = { model: provider.models?.[0], prompt: payload.prompt || '' };
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!resp.ok) throw new Error(`ollama-fail:${resp.status}`);
      return resp.json();
    }
    // For OpenAI/Gemini etc — placeholder which should be implemented with proper SDKs.
    return { text: `LLM response from ${provider.id} (placeholder)`, provider: provider.id };
  }

  async function callImage(provider, payload, apiKey) {
    // placeholder: return mock url or base64 info
    return { image: `placeholder://${provider.id}/${Date.now()}` };
  }

  async function callVideo(provider, payload, apiKey) {
    return { video: `placeholder://${provider.id}/${Date.now()}` };
  }

  function getStatus() {
    const out = {};
    for (const [id, p] of providers.entries()) {
      const s = states.get(id);
      out[id] = {
        config: { id: p.id, type: p.type },
        openUntil: s?.openUntil || 0,
        failures: (s?.failures || []).length,
        tokens: Math.floor(s?.bucket?.tokens ?? 0)
      };
    }
    return out;
  }

  function resetCircuit(id) {
    const s = states.get(id);
    if (s) {
      s.failures = [];
      s.openUntil = 0;
      appendLog({ event: 'circuit_reset', data: { provider: id } }).catch(() => {});
    }
  }

  // initialize
  loadConfig().catch((e) => {
    appendLog({ event: 'providers_load_error', data: { message: String(e) } }).catch(() => {});
  });

  return { call, getStatus, resetCircuit, _internal: { providers, states, config } };
}

export default createProviderManager;
