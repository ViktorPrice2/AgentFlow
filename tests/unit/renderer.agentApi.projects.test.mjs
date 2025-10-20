import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const clearWindowGlobal = () => {
  if (typeof window !== 'undefined') {
    delete globalThis.window;
  }
};

describe('renderer agentApi project helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    clearWindowGlobal();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearWindowGlobal();
  });

  it('delegates to window.AgentAPI when available', async () => {
    const listProjectsMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        projects: [
          {
            id: 'server-project',
            name: 'Server Project',
            updatedAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      });
    const getProjectMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        project: { id: 'server-project', name: 'Server Project', updatedAt: '2024-01-01T00:00:00.000Z' }
      });
    const upsertProjectMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        project: { id: 'server-project', name: 'Updated Project', updatedAt: '2024-01-02T00:00:00.000Z' }
      });

    globalThis.window = {
      AgentAPI: {
        listProjects: listProjectsMock,
        getProject: getProjectMock,
        upsertProject: upsertProjectMock
      }
    };

    const { listProjects, getProject, upsertProject } = await import('../../app/renderer/src/api/agentApi.js');

    const projects = await listProjects({ status: 'active' });
    expect(listProjectsMock).toHaveBeenCalledWith({ status: 'active' });
    expect(projects).toEqual([
      { id: 'server-project', name: 'Server Project', updatedAt: '2024-01-01T00:00:00.000Z' }
    ]);

    const project = await getProject('server-project');
    expect(getProjectMock).toHaveBeenCalledWith('server-project');
    expect(project).toEqual({ id: 'server-project', name: 'Server Project', updatedAt: '2024-01-01T00:00:00.000Z' });

    const response = await upsertProject({ id: 'server-project', name: 'Updated Project' });
    expect(upsertProjectMock).toHaveBeenCalledWith({ id: 'server-project', name: 'Updated Project' });
    expect(response).toEqual({
      ok: true,
      project: { id: 'server-project', name: 'Updated Project', updatedAt: '2024-01-02T00:00:00.000Z' }
    });
  });

  it('provides offline fallbacks when window.AgentAPI is unavailable', async () => {
    const { listProjects, upsertProject, getProject } = await import('../../app/renderer/src/api/agentApi.js');

    const initialProjects = await listProjects();
    expect(initialProjects).toEqual([]);

    const saveResponse = await upsertProject({ name: 'Offline Project', industry: 'Tech' });
    expect(saveResponse.ok).toBe(true);
    const savedProject = saveResponse.project;
    expect(savedProject).toMatchObject({ name: 'Offline Project', industry: 'Tech' });
    expect(savedProject.id).toBeTruthy();
    expect(savedProject.createdAt).toBeTruthy();
    expect(savedProject.updatedAt).toBeTruthy();

    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ id: savedProject.id, name: 'Offline Project' });
    expect(projects[0]).not.toBe(savedProject);

    const fetched = await getProject(savedProject.id);
    expect(fetched).toMatchObject({ id: savedProject.id, name: 'Offline Project' });

    const missing = await getProject('missing-project');
    expect(missing).toBeNull();
  });
});
