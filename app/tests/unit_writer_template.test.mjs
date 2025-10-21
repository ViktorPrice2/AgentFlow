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

  it('enriches template context with project industry and channels', async () => {
    const config = {
      id: 'WriterAgent',
      params: {
        outputs: ['brief'],
        summaryTemplate: ''
      },
      templates: {
        brief:
          'Industry: {{project.industry}} | Channels: {{project.channelSummary}} | Primary: {{projectChannelSummary}}'
      }
    };

    const payload = {
      topic: 'Promo blast',
      project: {
        id: 'project-1',
        name: 'Alpha Launch',
        industry: 'Retail'
      },
      channels: ['Telegram ', { id: 'instagram', name: 'Instagram' }]
    };

    const ctx = {
      runId: 'unit-run',
      project: {
        id: 'project-1',
        name: 'Alpha Launch',
        industry: 'SaaS',
        channels: ['Email', 'LinkedIn']
      },
      getAgentConfig: vi.fn().mockImplementation((agentName) => {
        return agentName === 'WriterAgent' ? config : null;
      }),
      log: vi.fn()
    };

    const result = await runWriterAgent(payload, ctx);

    expect(result.writer.outputs.brief).toBe(
      'Industry: Retail | Channels: Email, LinkedIn, Telegram, instagram | Primary: Email, LinkedIn, Telegram, instagram'
    );
    expect(ctx.log).toHaveBeenCalledWith(
      'agent:writer:completed',
      expect.objectContaining({
        runId: 'unit-run',
        outputs: ['brief']
      })
    );
  });
});
