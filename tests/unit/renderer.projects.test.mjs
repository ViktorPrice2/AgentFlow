import { describe, expect, it, vi, afterEach } from 'vitest';

function resetEnvironment() {
  vi.resetModules();
  vi.unstubAllGlobals();
}

describe('renderer agentApi project fallbacks', () => {
  afterEach(() => {
    resetEnvironment();
  });

  it('normalizes comma separated channels when IPC is unavailable', async () => {
    vi.stubGlobal('window', undefined);

    const { upsertProject, listProjects, getProject } = await import('../../app/renderer/src/api/agentApi.js');

    const response = await upsertProject({
      name: 'Offline project',
      channels: 'Telegram, Email ,  Ads '
    });

    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        project: expect.objectContaining({
          channels: ['Telegram', 'Email', 'Ads']
        })
      })
    );

    const projects = await listProjects();
    expect(projects[0].channels).toEqual(['Telegram', 'Email', 'Ads']);

    const project = await getProject(response.project.id);
    expect(project.channels).toEqual(['Telegram', 'Email', 'Ads']);
  });

  it('preserves array channel input for fallback upsert', async () => {
    vi.stubGlobal('window', undefined);

    const { upsertProject, getProject } = await import('../../app/renderer/src/api/agentApi.js');

    const result = await upsertProject({
      id: 'array-project',
      name: 'Array project',
      channels: ['tg', 'vk', '']
    });

    expect(result.project.channels).toEqual(['tg', 'vk']);

    const project = await getProject('array-project');
    expect(project.channels).toEqual(['tg', 'vk']);
  });
});
