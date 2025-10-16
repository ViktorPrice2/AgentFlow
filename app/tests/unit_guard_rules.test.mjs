import { describe, expect, it, vi } from 'vitest';
import { execute as runGuardAgent } from '../core/agents/StyleGuard/index.js';

const baseConfig = {
  id: 'StyleGuard',
  params: {
    rules: [
      {
        id: 'no-spam',
        path: 'writer.outputs.caption',
        disallow: ['spam'],
        reasonTemplate: 'Запрещено слово "{{matchedToken}}"'
      },
      {
        id: 'must-cta',
        path: 'writer.outputs.caption',
        mustInclude: ['купите'],
        reasonTemplate: 'Нет обязательного слова "{{missingToken}}"'
      },
      {
        id: 'status-ok',
        path: 'writer.outputs.status',
        equals: 'ok',
        reasonTemplate: 'Ожидался статус {{expected}}'
      }
    ],
    passTemplate: 'Проверка пройдена',
    failTemplate: 'Найдены ошибки'
  },
  templates: {
    pass: 'Проверка пройдена',
    fail: 'Найдены ошибки'
  }
};

function createCtx(config = baseConfig) {
  return {
    runId: 'guard-run',
    getAgentConfig: vi.fn().mockReturnValue(config),
    log: vi.fn()
  };
}

describe('StyleGuard rules evaluation', () => {
  it('collects violations for disallow, mustInclude and equals checks', async () => {
    const payload = {
      writer: {
        outputs: {
          caption: 'Это сообщение включает spam и не содержит CTA',
          status: 'draft'
        }
      }
    };

    const ctx = createCtx();
    const result = await runGuardAgent(payload, ctx);

    expect(result.guard.pass).toBe(false);
    expect(result.summary).toBe('Найдены ошибки');

    const spamRule = result.guard.results.find((rule) => rule.id === 'no-spam');
    const ctaRule = result.guard.results.find((rule) => rule.id === 'must-cta');
    const statusRule = result.guard.results.find((rule) => rule.id === 'status-ok');

    expect(spamRule.pass).toBe(false);
    expect(spamRule.reasons[0]).toContain('spam');
    expect(ctaRule.pass).toBe(false);
    expect(ctaRule.reasons[0]).toContain('купите');
    expect(statusRule.pass).toBe(false);
    expect(statusRule.reasons[0]).toContain('ok');

    expect(ctx.log).toHaveBeenCalledWith(
      'agent:styleGuard:completed',
      expect.objectContaining({
        runId: 'guard-run',
        passed: false,
        failed: ['no-spam', 'must-cta', 'status-ok']
      })
    );
  });

  it('passes when all rules succeed and uses pass summary', async () => {
    const payload = {
      writer: {
        outputs: {
          caption: 'Пожалуйста купите наш новый продукт',
          status: 'ok'
        }
      }
    };

    const ctx = createCtx();
    const result = await runGuardAgent(payload, ctx);

    expect(result.guard.pass).toBe(true);
    expect(result.summary).toBe('Проверка пройдена');
    expect(result.guard.results.every((rule) => rule.pass)).toBe(true);
  });
});
