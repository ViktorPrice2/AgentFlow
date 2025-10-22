import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ProviderConfig, ProviderManagerApi, ProviderRequest, ProviderResponse } from './types.js';

interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}

interface ProviderManagerOptions {
  rateLimitPerMinute?: number;
}

export class ProviderManager implements ProviderManagerApi {
  private readonly providers: ProviderConfig[];
  private readonly buckets = new Map<string, TokenBucketState>();
  private readonly options: { rateLimitPerMinute: number };

  constructor(providerConfigPath?: string, options: ProviderManagerOptions = {}) {
    const resolved = providerConfigPath ?? path.resolve('app/config/providers.json');
    const raw = fs.readFileSync(resolved, 'utf-8');
    const providers = JSON.parse(raw) as ProviderConfig[];
    this.providers = providers
      .filter((provider) => provider.enabled !== false)
      .sort((a, b) => a.priority - b.priority);
    this.options = {
      rateLimitPerMinute: options.rateLimitPerMinute ?? 60
    };
  }

  getMode(): 'real' | 'mock' {
    const hasKeys = this.providers.some((provider) => provider.apiKey && !provider.mock);
    return hasKeys ? 'real' : 'mock';
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    for (const provider of this.providers) {
      if (!this.consume(provider.id)) {
        await sleep(100);
      }

      try {
        if (this.getMode() === 'mock' || provider.mock) {
          return this.mockResponse(provider, request);
        }

        if (!provider.apiKey) {
          throw new Error(`Provider ${provider.name} missing API key`);
        }

        return await this.callProvider(provider, request);
      } catch (error) {
        if (provider === this.providers[this.providers.length - 1]) {
          throw error;
        }
      }
    }

    throw new Error('No providers available');
  }

  private consume(providerId: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(providerId) ?? {
      tokens: this.options.rateLimitPerMinute,
      lastRefill: now
    };
    if (now - bucket.lastRefill > 60000) {
      bucket.tokens = this.options.rateLimitPerMinute;
      bucket.lastRefill = now;
    }
    if (bucket.tokens <= 0) {
      this.buckets.set(providerId, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(providerId, bucket);
    return true;
  }

  private mockResponse(provider: ProviderConfig, request: ProviderRequest): ProviderResponse {
    if (request.type === 'text') {
      return {
        content: `Mock ${provider.name} response for ${request.model}: ${request.prompt ?? 'N/A'}`,
        metadata: { provider: provider.id, mode: 'mock' }
      };
    }

    if (request.type === 'image') {
      return {
        url: `/mock/${randomUUID()}.png`,
        metadata: { provider: provider.id, description: request.prompt }
      };
    }

    return {
      url: `/mock/${randomUUID()}.mp4`,
      metadata: { provider: provider.id, frames: request.payload?.frames ?? 0 }
    };
  }

  private async callProvider(provider: ProviderConfig, request: ProviderRequest): Promise<ProviderResponse> {
    if (request.type === 'text') {
      return {
        content: `Real response from ${provider.name} using model ${request.model}: ${request.prompt}`,
        metadata: { provider: provider.id }
      };
    }

    if (request.type === 'image') {
      return {
        url: `/real/${provider.id}/${randomUUID()}.png`,
        metadata: { provider: provider.id, prompt: request.prompt }
      };
    }

    return {
      url: `/real/${provider.id}/${randomUUID()}.mp4`,
      metadata: { provider: provider.id, prompt: request.prompt }
    };
  }
}
