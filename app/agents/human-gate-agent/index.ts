import type { AgentModule } from '../../core/types.js';

const humanGateAgent: AgentModule = {
  async execute(payload, ctx) {
    const failedNode = payload.failedNode as { agent: string } | undefined;
    const partial = payload.partial as Record<string, unknown> | undefined;
    ctx.logger.warn('Human gate triggered', { failedNode });

    const notes =
      ctx.mode === 'mock'
        ? 'Mock human approval applied.'
        : 'Awaiting real human interaction (simulated).';

    return {
      ...partial,
      humanFeedback: {
        notes,
        approved: true,
        timestamp: new Date().toISOString()
      }
    };
  }
};

export default humanGateAgent;
