import { describe, it, expect, vi } from 'vitest';

const { shouldExposeE2EBridge, registerE2EBridge } = await import('../../app/main/e2e-bridge.js');

describe('e2e bridge helpers', () => {
  it('checks exposure conditions', () => {
    expect(shouldExposeE2EBridge({ NODE_ENV: 'test' })).toBe(true);
    expect(shouldExposeE2EBridge({ NODE_ENV: 'TEST' })).toBe(true);
    expect(shouldExposeE2EBridge({ E2E: '1' })).toBe(true);
    expect(shouldExposeE2EBridge({ E2E: 1 })).toBe(true);
    expect(shouldExposeE2EBridge({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldExposeE2EBridge({})).toBe(false);
  });

  it('registers bridge only when allowed', () => {
    const expose = vi.fn();

    expect(registerE2EBridge({ exposeInMainWorld: expose }, { NODE_ENV: 'test' })).toBe(true);
    expect(expose).toHaveBeenCalledWith('e2e', expect.objectContaining({ setLang: expect.any(Function) }));

    expose.mockClear();
    expect(registerE2EBridge({ exposeInMainWorld: expose }, { NODE_ENV: 'production' })).toBe(false);
    expect(expose).not.toHaveBeenCalled();
  });

  it('is resilient to missing contextBridge', () => {
    expect(registerE2EBridge(null, { NODE_ENV: 'test' })).toBe(false);
    expect(registerE2EBridge({}, { NODE_ENV: 'test' })).toBe(false);
  });
});
