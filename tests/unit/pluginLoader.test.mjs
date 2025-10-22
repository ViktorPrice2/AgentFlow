import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { createPluginRegistry } from '../../app/core/pluginLoader.js';

describe('plugin registry bootstrapping', () => {
  it('loads built-in stubs even when the agents directory is missing', async () => {
    const registry = await createPluginRegistry({ baseDir: path.join(process.cwd(), '__missing__agents__') });
    const formAgent = registry.getAgent('FormCollector');

    expect(formAgent).toBeTruthy();
    expect(typeof formAgent.execute).toBe('function');

    const payload = { brief: { id: 'brief-1' }, form: { status: 'draft' } };
    const result = await formAgent.execute(payload);

    expect(result.brief).toEqual(payload.brief);
    expect(result.form.status).toBe('draft');
    expect(typeof result.form.submittedAt).toBe('string');
  });

  it('exposes default stub agents for pipelines', async () => {
    const registry = await createPluginRegistry();
    const writerStub = registry.getAgent('WriterStub');

    expect(writerStub).toBeTruthy();
    expect(typeof writerStub.execute).toBe('function');
  });
});
