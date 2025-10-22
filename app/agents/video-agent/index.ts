import type { AgentModule } from '../../core/types.js';

const videoAgent: AgentModule = {
  async execute(payload, ctx) {
    const dependencies = payload.dependencies as Record<string, Record<string, unknown>> | undefined;
    const script = dependencies
      ? Object.values(dependencies).find((entry) => typeof entry?.text === 'string')?.text
      : undefined;
    const images = dependencies
      ? Object.values(dependencies)
          .map((entry) => entry?.imagePath)
          .filter((value): value is string => typeof value === 'string')
      : [];

    const storyboard = {
      script: script ?? 'No script provided',
      images,
      soundtrack: payload.soundtrack ?? 'uplifting'
    };

    const artifactBuffer = Buffer.from(JSON.stringify(storyboard, null, 2), 'utf-8');
    const artifact = await ctx.storage.saveArtifact(
      ctx.run.id,
      'video',
      artifactBuffer,
      'mp4',
      { simulated: true, frames: images.length }
    );

    ctx.logger.info('Video artifact created', { path: artifact.path });
    return { videoPath: artifact.path, storyboard };
  }
};

export default videoAgent;
