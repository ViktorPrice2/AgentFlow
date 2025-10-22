import { describe, expect, it } from 'vitest';
import { buildDefaultPlan } from '../../app/core/planBuilder.js';

describe('planBuilder', () => {
  it('creates nodes for requested content', () => {
    const plan = buildDefaultPlan('Test campaign', {
      requestedContent: ['text', 'image', 'video'],
      tone: 'friendly'
    });

    const types = plan.nodes.map((node) => node.type);
    expect(types).toContain('writer');
    expect(types).toContain('image');
    expect(types).toContain('video');
    expect(types).toContain('uploader');
  });

  it('adds dependencies between nodes', () => {
    const plan = buildDefaultPlan('Dependencies', { requestedContent: ['text', 'image'], tone: 'neutral' });
    const guardNode = plan.nodes.find((node) => node.type === 'guard');
    expect(guardNode?.dependsOn?.length).toBeGreaterThan(0);
  });
});
