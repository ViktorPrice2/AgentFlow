import type { AgentModule } from '../../core/types.js';

const imageAgent: AgentModule = {
  async execute(payload, ctx) {
    const description = String(payload.description ?? 'Marketing visual');
    const dependencies = payload.dependencies as Record<string, { text?: string }> | undefined;
    const dependencyText = dependencies
      ? Object.values(dependencies).find((entry) => typeof entry?.text === 'string')?.text
      : undefined;
    const fullPrompt = dependencyText ? `${description}. Base on: ${dependencyText}` : description;

    ctx.logger.info('Generating image', { description: fullPrompt });

    const response = await ctx.providerManager.invoke({
      model: 'stable-diffusion-xl',
      type: 'image',
      prompt: fullPrompt,
      payload: { size: '1024x1024' }
    });

    const binary =
      response.binary ?? Buffer.from(`Mock image content for ${fullPrompt}`, 'utf-8');
    const artifact = await ctx.storage.saveArtifact(
      ctx.run.id,
      'image',
      binary,
      'png',
      response.metadata ?? {}
    );

    ctx.logger.info('Image generated', { path: artifact.path });
    return { imagePath: artifact.path, metadata: artifact.metadata };
  }
};

export default imageAgent;
