import { describe, expect, it, vi } from 'vitest';
import { execute as runStyleGuard } from '../../app/core/agents/StyleGuard/index.js';

const baseConfig = {
  id: 'StyleGuard',
  params: {
    rules: [
      {
        id: 'banned-words',
        path: 'content',
        disallow: ['forbidden', 'blocked'],
        reasonTemplate: 'Contains banned token: {{matchedToken}}'
      },
      {
        id: 'length-cap',
        path: 'content',
        maxLength: 20,
        reasonTemplate: 'Content too long: {{length}} > {{maxLength}}'
      }
    ],
    passTemplate: 'All good',
    failTemplate: 'Review issues'
  },
  templates: {
    pass: 'Pass',
    fail: 'Fail'
  }
};

function createCtx(config = baseConfig) {
  return {
    runId: 'styleguard-test',
    getAgentConfig: vi.fn().mockImplementation((agentName) => {
      return agentName === 'StyleGuard' ? config : null;
    }),
    log: vi.fn()
  };
}

describe('StyleGuard rules', () => {
  it('fails when content includes banned vocabulary', async () => {
    const payload = { content: 'This message is totally forbidden here.' };
    const ctx = createCtx();

    const result = await runStyleGuard(payload, ctx);
    const ruleResult = result.guard.results.find((entry) => entry.id === 'banned-words');

    expect(result.guard.pass).toBe(false);
    expect(ruleResult).toBeDefined();
    expect(ruleResult.pass).toBe(false);
    expect(ruleResult.reasons[0]).toContain('forbidden');
  });

  it('fails when content exceeds configured length', async () => {
    const payload = { content: 'This sentence is definitely longer than twenty characters.' };
    const ctx = createCtx();

    const result = await runStyleGuard(payload, ctx);
    const lengthRule = result.guard.results.find((entry) => entry.id === 'length-cap');

    expect(result.guard.pass).toBe(false);
    expect(lengthRule).toBeDefined();
    expect(lengthRule.pass).toBe(false);
    expect(lengthRule.reasons[0]).toContain('Content too long');
  });

  it('passes when content is clean and within limits', async () => {
    const payload = { content: 'Friendly update' };
    const ctx = createCtx();

    const result = await runStyleGuard(payload, ctx);

    expect(result.guard.pass).toBe(true);
    result.guard.results.forEach((entry) => {
      expect(entry.pass).toBe(true);
    });
  });

  it('fails when required keywords are missing', async () => {
    const config = {
      ...baseConfig,
      params: {
        ...baseConfig.params,
        rules: [
          {
            id: 'must-include',
            path: 'content',
            mustInclude: ['agentflow'],
            reasonTemplate: 'Missing token: {{missingToken}}'
          }
        ]
      }
    };

    const payload = { content: 'generic message' };
    const ctx = createCtx(config);
    const result = await runStyleGuard(payload, ctx);

    expect(result.guard.pass).toBe(false);
    expect(result.guard.results[0].reasons[0]).toContain('agentflow');
  });

  it('fails when content is shorter than minimum requirement', async () => {
    const config = {
      ...baseConfig,
      params: {
        ...baseConfig.params,
        rules: [
          {
            id: 'min-length',
            path: 'content',
            minLength: 10,
            reasonTemplate: 'Too short: {{length}} < {{minLength}}'
          }
        ]
      }
    };

    const payload = { content: 'short' };
    const ctx = createCtx(config);
    const result = await runStyleGuard(payload, ctx);

    expect(result.guard.pass).toBe(false);
    expect(result.guard.results[0].reasons[0]).toContain('Too short');
  });

  it('passes when equality guard matches expected value', async () => {
    const config = {
      ...baseConfig,
      params: {
        ...baseConfig.params,
        rules: [
          {
            id: 'equals',
            path: 'meta.status',
            equals: 'ready'
          }
        ]
      }
    };

    const payload = { content: 'All good', meta: { status: 'ready' } };
    const ctx = createCtx(config);
    const result = await runStyleGuard(payload, ctx);

    expect(result.guard.pass).toBe(true);
    expect(result.guard.results[0].pass).toBe(true);
  });
});
