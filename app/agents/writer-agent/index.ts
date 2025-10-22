import type { AgentModule } from '../../core/types.js';

const writerAgent: AgentModule = {
  async execute(payload, ctx) {
    const topic = String(payload.topic ?? '');
    const tone = String(payload.tone ?? 'neutral');
    const format = String(payload.format ?? 'article');

    ctx.logger.info('Generating text', { topic, tone, format });

    const response = await ctx.providerManager.invoke({
      model: 'gpt-4o-mini',
      type: 'text',
      prompt: `Create a ${format} about ${topic} in a ${tone} tone.`
    });

    const text = response.content ?? (ctx.mode === 'mock' ? `Mock content for ${topic}` : '');

    ctx.logger.info('Text generation complete');
    return { text, meta: response.metadata ?? {} };
  }
};

export default writerAgent;
