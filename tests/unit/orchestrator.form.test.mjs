import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

import { createPluginRegistry } from '../../app/core/pluginLoader.js';
import { runPipeline } from '../../app/core/orchestrator.js';

describe('pipeline execution with form nodes', () => {
  let pluginRegistry;

  beforeAll(async () => {
    pluginRegistry = await createPluginRegistry({ baseDir: path.join(process.cwd(), '__missing__agents__') });
  });

  it('runs pipelines that begin with a form collector node', async () => {
    const pipeline = {
      id: 'pipeline-form',
      name: 'Form → Writer',
      nodes: [
        { id: 'collect-brief', type: 'form', agentName: 'FormCollector' },
        { id: 'writer-agent', type: 'agent', agentName: 'WriterStub' }
      ],
      edges: [
        { id: 'edge-1', from: 'collect-brief', to: 'writer-agent', source: 'collect-brief', target: 'writer-agent' }
      ]
    };

    const inputPayload = { project: { id: 'project-1' } };

    const result = await runPipeline(pipeline, inputPayload, { pluginRegistry });

    expect(result.status).toBe('completed');
    expect(result.payload.form).toBeTruthy();
    expect(result.payload.form.status).toBe('submitted');
    expect(result.payload.writer).toBeTruthy();
  });
});
