import { describe, it, expect, vi, beforeEach } from 'vitest';

const runPipelineMock = vi.fn();
const runDemoPipelineMock = vi.fn();
const createEntityStoreMock = vi.fn();
let storeMock;

vi.mock('../../app/core/orchestrator.js', () => ({
  runPipeline: runPipelineMock,
  runDemoPipeline: runDemoPipelineMock
}));

vi.mock('../../app/core/storage/entityStore.js', () => ({
  createEntityStore: createEntityStoreMock
}));

describe('AgentFlow pipeline run IPC handlers', () => {
  let ipcHandlers;
  let pluginRegistry;
  let providerManager;

  beforeEach(async () => {
    vi.resetModules();
    runPipelineMock.mockReset();
    runDemoPipelineMock.mockReset();
    createEntityStoreMock.mockReset();

    storeMock = {
      buildAgentConfigMap: vi.fn(() => new Map()),
      listAgentRecords: vi.fn(() => []),
      saveRun: vi.fn((run) => ({ ...run })),
      listRuns: vi.fn(() => [])
    };

    createEntityStoreMock.mockReturnValue(storeMock);

    pluginRegistry = { listAgents: vi.fn(() => []) };
    providerManager = {
      getProviderStatus: vi.fn(() => []),
      applyDiagnosticCommand: vi.fn(() => ({}))
    };

    const { registerIpcHandlers } = await import('../../app/core/api.js');

    ipcHandlers = new Map();
    const ipcMain = {
      handle(channel, handler) {
        ipcHandlers.set(channel, handler);
      }
    };

    registerIpcHandlers({ ipcMain, pluginRegistry, providerManager });
  });

  it('persists successful pipeline runs', async () => {
    const handler = ipcHandlers.get('AgentFlow:pipeline:run');
    const pipelineDefinition = { id: 'pipe-1', projectId: 'proj-1', name: 'Pipeline' };
    const inputPayload = { project: { id: 'proj-1', name: 'Project' } };
    const result = {
      runId: 'run-1',
      status: 'completed',
      payload: { _artifacts: [] },
      nodes: []
    };

    runPipelineMock.mockResolvedValue(result);
    const savedRecord = { id: 'run-1', projectId: 'proj-1', status: 'completed' };
    storeMock.saveRun.mockReturnValueOnce(savedRecord);

    const response = await handler({}, pipelineDefinition, inputPayload);

    expect(runPipelineMock).toHaveBeenCalledWith(
      pipelineDefinition,
      inputPayload,
      expect.objectContaining({ runId: expect.any(String) })
    );
    expect(storeMock.saveRun).toHaveBeenCalledTimes(1);
    expect(storeMock.saveRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run-1',
        projectId: 'proj-1',
        pipelineId: 'pipe-1',
        status: 'completed',
        input: expect.any(Object),
        output: result
      })
    );
    expect(response).toEqual({ ok: true, result, run: savedRecord });
  });

  it('records failed pipeline runs when execution throws', async () => {
    const handler = ipcHandlers.get('AgentFlow:pipeline:run');
    const pipelineDefinition = { id: 'pipe-2', projectId: 'proj-2', name: 'Broken' };
    const inputPayload = { project: { id: 'proj-2' } };
    const error = new Error('boom');

    runPipelineMock.mockRejectedValue(error);

    const response = await handler({}, pipelineDefinition, inputPayload);

    expect(response).toEqual({ ok: false, error: 'boom' });
    expect(storeMock.saveRun).toHaveBeenCalledTimes(1);
    const saved = storeMock.saveRun.mock.calls[0][0];
    expect(saved.projectId).toBe('proj-2');
    expect(saved.pipelineId).toBe('pipe-2');
    expect(saved.status).toBe('error');
    expect(saved.output).toEqual({ error: 'boom' });
  });

  it('lists runs through IPC handler', async () => {
    const handler = ipcHandlers.get('AgentFlow:runs:list');
    const runList = [{ id: 'run-7', projectId: 'proj-7' }];
    storeMock.listRuns.mockReturnValue(runList);

    const response = await handler({}, { projectId: 'proj-7' });

    expect(storeMock.listRuns).toHaveBeenCalledWith({ projectId: 'proj-7' });
    expect(response).toEqual({ ok: true, runs: runList });
  });
});
