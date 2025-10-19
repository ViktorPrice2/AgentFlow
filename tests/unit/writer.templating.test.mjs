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
  }
};

function createCtx(config = baseConfig) {
  return {
    runId: 'writer-test',
    getAgentConfig: vi.fn().mockImplementation((agentName) => {
      return agentName === 'WriterAgent' ? config : null;
    }),
    log: vi.fn(),
    invokeLLM: vi.fn()
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
    expect(ctx.log).toHaveBeenCalledWith(
      'agent:writer:completed',
      expect.objectContaining({ runId: 'writer-test', outputs: ['brief'] })
    );
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

  it('does not rely on external LLM integrations', async () => {
    const payload = {
      brand: 'AgentFlow',
      topic: 'Automation launch'
    };

    const ctx = createCtx();
    await runWriterAgent(payload, ctx);

    expect(ctx.invokeLLM).not.toHaveBeenCalled();
  });
});
