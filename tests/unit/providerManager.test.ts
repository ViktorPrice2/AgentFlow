import { describe, expect, it } from 'vitest';
import { ProviderManager } from '../../app/core/providerManager.js';

describe('ProviderManager', () => {
  it('returns mock mode when providers lack keys', async () => {
    const manager = new ProviderManager();
    expect(manager.getMode()).toBe('mock');
    const response = await manager.invoke({ model: 'gpt-4o-mini', type: 'text', prompt: 'Hello' });
    expect(response.content).toContain('Mock');
  });
});
