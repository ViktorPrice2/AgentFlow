import { describe, expect, it, vi } from 'vitest';
import { execute as runWriterAgent } from '../core/agents/WriterAgent/index.js';

describe('WriterAgent templating', () => {
  it('merges inputs from payload, config and overrides when rendering outputs', async () => {
    const config = {
      id: 'WriterAgent',
      params: {
        outputs: ['caption', 'cta'],
        tone: 'спокойный',
        summaryTemplate: 'Итог: {{generated.caption}} | CTA: {{generated.cta}}'
      },
      templates: {
        caption: 'Заголовок "{{topic}}" — тон {{tone}}',
        cta: {
          template: 'Призыв: {{callToAction}} для {{audience}}'
        },
        summary: ''
      }
    };

    const payload = {
      topic: 'Запуск продукта',
      callToAction: 'Купить сейчас',
      audience: 'маркетологи',
      override: {
        params: { tone: 'дружелюбный' },
        templates: {
          cta: {
            template: 'CTA: {{callToAction}} — {{tone}}'
          }
        }
      }
    };

    const ctx = {
      runId: 'unit-run',
      getAgentConfig: vi.fn().mockImplementation((agentName) => {
        return agentName === 'WriterAgent' ? config : null;
      }),
      log: vi.fn()
    };

    const result = await runWriterAgent(payload, ctx);

    const captionExpected = 'Заголовок "Запуск продукта" — тон дружелюбный';
    const ctaExpected = 'CTA: Купить сейчас — дружелюбный';
    const summaryExpected = `Итог: ${captionExpected} | CTA: ${ctaExpected}`;

    expect(result.writer).toBeDefined();
    expect(result.writer.outputs.caption).toBe(captionExpected);
    expect(result.writer.outputs.cta).toBe(ctaExpected);
    expect(result.writer.agentId).toBe('WriterAgent');
    expect(result.summary).toBe(summaryExpected);
    expect(result.writer.producedAt).toBeTypeOf('string');
    expect(ctx.log).toHaveBeenCalledWith(
      'agent:writer:completed',
      expect.objectContaining({
        runId: 'unit-run',
        outputs: ['caption', 'cta']
      })
    );
  });
});
