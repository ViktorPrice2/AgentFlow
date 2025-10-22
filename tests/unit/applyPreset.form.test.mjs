import { describe, it, expect, vi } from 'vitest';

import { applyPresetToProject } from '../../app/core/presets/applyPreset.js';

describe('applyPresetToProject form node normalization', () => {
  it('assigns the FormCollector agent to form nodes in preset pipelines', async () => {
    const savedPipelines = [];
    const storeMock = {
      getProjectById: vi.fn(() => ({ id: 'project-1', name: 'Demo project', channels: [], industry: null })),
      saveProject: vi.fn((project) => ({ ...project })),
      listAgentRecords: vi.fn(() => []),
      deleteAgent: vi.fn(),
      listPipelines: vi.fn(() => []),
      deletePipeline: vi.fn(),
      saveAgent: vi.fn((agent) => ({ ...agent })),
      savePipeline: vi.fn((pipeline) => {
        savedPipelines.push(pipeline);
        return { ...pipeline };
      })
    };

    await applyPresetToProject({
      projectId: 'project-1',
      presetId: 'generic',
      entityStore: storeMock
    });

    expect(savedPipelines.length).toBeGreaterThan(0);

    const pipeline = savedPipelines[0];
    const formNode = pipeline.nodes.find((node) => node.kind === 'form');

    expect(formNode).toBeTruthy();
    expect(formNode.agentName).toBe('FormCollector');
    expect(formNode.type).toBe('form');
  });
});
