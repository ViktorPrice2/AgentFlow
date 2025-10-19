import { describe, expect, it, vi } from 'vitest';
import { execute as runWriterAgent } from '../../app/core/agents/WriterAgent/index.js';

const baseConfig = {
  id: 'WriterAgent',
  params: {
    outputs: ['brief'],
    brand: 'DefaultBrand',
    topic: 'DefaultTopic',
    tone: 'Friendly',
    callToAction: 'Click here',
    summaryTemplate: 'Summary: {{generated.brief}}'
  },
  templates: {
    brief: 'Brand: {{brand}} | Topic: {{topic}} | Tone: {{tone}} | CTA: {{callToAction}}',
    summary: ''
  },
  engine: {
    provider: 'mock',
    model: 'template'
  }
};

function createCtx(config = baseConfig, overrides = {}) {
  return {
    runId: 'writer-test',
    getAgentConfig: vi.fn().mockImplementation((agentName) => {
      return agentName === 'WriterAgent' ? config : null;
    }),
    log: vi.fn(),
    ...overrides
  };
}

describe('WriterAgent templating', () => {
  it('renders brand, topic, tone and CTA into outputs', async () => {
    const payload = {
      brand: 'AgentFlow',
      topic: 'Automation launch',
      tone: 'Bold',
      callToAction: 'Join now'
    };

    const ctx = createCtx();
    const result = await runWriterAgent(payload, ctx);
    const output = result.writer.outputs.brief;

    expect(output).toContain('AgentFlow');
    expect(output).toContain('Automation launch');
    expect(output).toContain('Bold');
    expect(output).toContain('Join now');
    const lastLogCall = ctx.log.mock.calls.at(-1);
    expect(lastLogCall?.[0]).toBe('agent:writer:completed');
    expect(lastLogCall?.[1]).toMatchObject({
      runId: 'writer-test',
      outputs: ['brief'],
      mode: 'template'
    });
  });

  it('falls back to config defaults when topic or brand are missing', async () => {
    const payload = {
      tone: 'Calm',
      callToAction: 'Learn more'
    };

    const ctx = createCtx();
    const result = await runWriterAgent(payload, ctx);
    const output = result.writer.outputs.brief;

    expect(output).toContain('DefaultBrand');
    expect(output).toContain('DefaultTopic');
    expect(output).toContain('Calm');
    expect(output).toContain('Learn more');
  });

  it('ignores LLM when provider manager is not available', async () => {
    const payload = {
      brand: 'AgentFlow',
      topic: 'Automation launch'
    };

    const ctx = createCtx();
    await runWriterAgent(payload, ctx);

    expect(ctx.log.mock.calls.find(([event]) => event === 'agent:writer:llm:used')).toBeUndefined();
  });

  it('uses LLM outputs when provider manager succeeds', async () => {
    const payload = {
      brand: 'AgentFlow',
      topic: 'Launch',
      tone: 'Bold',
      callToAction: 'Buy now'
    };

    const engineConfig = {
      ...baseConfig,
      engine: {
        provider: 'openai',
        model: 'gpt-4o-mini'
      }
    };

    const callLLM = vi.fn().mockResolvedValue({
      mode: 'live',
      providerId: 'openai',
      model: 'gpt-4o-mini',
      content: JSON.stringify({
        brief: 'LLM generated brief',
        summary: 'LLM summary'
      })
    });

    const ctx = createCtx(engineConfig, {
      providers: {
        callLLM
      }
    });

    const result = await runWriterAgent(payload, ctx);

    expect(callLLM).toHaveBeenCalledWith(
      'WriterAgent',
      expect.objectContaining({
        messages: expect.any(Array)
      })
    );

    expect(result.writer.outputs.brief).toBe('LLM generated brief');
    expect(result.summary).toBe('LLM summary');
    expect(result.writer.mode).toBe('llm');
    expect(result.writer.llm).toMatchObject({
      providerId: 'openai',
      model: 'gpt-4o-mini'
    });

    expect(ctx.log.mock.calls.find(([event]) => event === 'agent:writer:llm:used')).toBeDefined();
    const lastLogCall = ctx.log.mock.calls.at(-1);
    expect(lastLogCall?.[0]).toBe('agent:writer:completed');
    expect(lastLogCall?.[1]).toMatchObject({
      mode: 'llm',
      provider: 'openai'
    });
  });
});
