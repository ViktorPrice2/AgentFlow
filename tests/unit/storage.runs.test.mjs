import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

class MemoryDatabase {
  constructor() {
    this.records = new Map();
  }

  pragma() {}

  close() {}

  prepare(query) {
    const normalized = query.replace(/\s+/g, ' ').trim();

    if (/^SELECT id, createdAt FROM Runs WHERE id = \?/i.test(normalized)) {
      return {
        get: (id) => {
          const record = this.records.get(id);
          if (!record) {
            return undefined;
          }

          return { id: record.id, createdAt: record.createdAt };
        }
      };
    }

    if (
      /^SELECT id, projectId, pipelineId, status, input, output, createdAt, startedAt, finishedAt FROM Runs WHERE id = \?/i.test(
        normalized
      )
    ) {
      return {
        get: (id) => {
          const record = this.records.get(id);
          if (!record) {
            return undefined;
          }

          return { ...record };
        }
      };
    }

    if (/^SELECT id, projectId, pipelineId, status, input, output, createdAt, startedAt, finishedAt FROM Runs/i.test(normalized)) {
      const hasProjectFilter = /projectId = \?/i.test(normalized);
      const hasPipelineFilter = /pipelineId = \?/i.test(normalized);
      const hasLimit = /LIMIT \?/i.test(normalized);

      return {
        all: (...params) => {
          let index = 0;
          let filtered = Array.from(this.records.values());

          if (hasProjectFilter) {
            const projectId = params[index++];
            filtered = filtered.filter((record) => record.projectId === projectId);
          }

          if (hasPipelineFilter) {
            const pipelineId = params[index++];
            filtered = filtered.filter((record) => record.pipelineId === pipelineId);
          }

          const limit = hasLimit ? params[index++] : null;

          const sorted = filtered
            .slice()
            .sort((a, b) => {
              const dateA = a.finishedAt || a.startedAt || a.createdAt || '';
              const dateB = b.finishedAt || b.startedAt || b.createdAt || '';
              return dateB.localeCompare(dateA);
            })
            .map((record) => ({ ...record }));

          if (limit && Number.isInteger(limit) && limit > 0) {
            return sorted.slice(0, limit);
          }

          return sorted;
        }
      };
    }

    if (/^INSERT INTO Runs/i.test(normalized)) {
      return {
        run: (id, projectId, pipelineId, status, input, output, createdAt, startedAt, finishedAt) => {
          this.records.set(id, {
            id,
            projectId,
            pipelineId,
            status,
            input,
            output,
            createdAt,
            startedAt,
            finishedAt
          });

          return { changes: 1 };
        }
      };
    }

    if (/^UPDATE Runs SET/i.test(normalized)) {
      return {
        run: (projectId, pipelineId, status, input, output, createdAt, startedAt, finishedAt, id) => {
          const existing = this.records.get(id);

          if (!existing) {
            return { changes: 0 };
          }

          this.records.set(id, {
            id,
            projectId,
            pipelineId,
            status,
            input,
            output,
            createdAt,
            startedAt,
            finishedAt
          });

          return { changes: 1 };
        }
      };
    }

    throw new Error(`Unsupported query: ${query}`);
  }
}

const databases = new Map();

vi.mock('../../app/db/sqlite.js', () => ({
  openDatabase(targetPath = 'memory') {
    const key = targetPath || 'memory';
    if (!databases.has(key)) {
      databases.set(key, new MemoryDatabase());
    }

    return databases.get(key);
  }
}));

let createEntityStore;

beforeAll(async () => {
  ({ createEntityStore } = await import('../../app/core/storage/entityStore.js'));
});

describe('entity store run persistence', () => {
  let store;
  const dbPath = 'test-runs';

  beforeEach(() => {
    databases.clear();
    store = createEntityStore({ dbPath });
  });

  it('saves and retrieves run records', () => {
    const startedAt = new Date().toISOString();
    const finishedAt = new Date(Date.now() + 1000).toISOString();

    const saved = store.saveRun({
      projectId: 'project-1',
      pipelineId: 'pipeline-1',
      status: 'completed',
      input: { foo: 'bar' },
      output: { status: 'completed', payload: { _artifacts: ['artifact.txt'] } },
      createdAt: startedAt,
      startedAt,
      finishedAt
    });

    expect(saved).toBeTruthy();
    expect(saved.projectId).toBe('project-1');
    expect(saved.pipelineId).toBe('pipeline-1');
    expect(saved.status).toBe('completed');
    expect(saved.input).toEqual({ foo: 'bar' });
    expect(saved.output).toMatchObject({ status: 'completed' });
    expect(saved.createdAt).toBe(startedAt);
    expect(saved.finishedAt).toBe(finishedAt);

    const fetched = store.getRunById(saved.id);
    expect(fetched).toEqual(saved);

    const listed = store.listRuns();
    expect(listed.length).toBeGreaterThanOrEqual(1);
    expect(listed[0]).toEqual(saved);
  });

  it('updates existing run by id', () => {
    const initial = store.saveRun({
      id: 'run-123',
      projectId: 'project-2',
      pipelineId: 'pipeline-9',
      status: 'running',
      input: { step: 1 },
      output: { status: 'running' },
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString()
    });

    expect(initial.status).toBe('running');

    const updated = store.saveRun({
      id: initial.id,
      projectId: 'project-2',
      pipelineId: 'pipeline-9',
      status: 'failed',
      input: { step: 2 },
      output: { error: 'boom' },
      createdAt: initial.createdAt,
      startedAt: initial.startedAt,
      finishedAt: new Date().toISOString()
    });

    expect(updated.id).toBe(initial.id);
    expect(updated.status).toBe('failed');
    expect(updated.output).toEqual({ error: 'boom' });

    const fetched = store.getRunById(initial.id);
    expect(fetched.status).toBe('failed');
    expect(fetched.output).toEqual({ error: 'boom' });
  });

  it('lists runs with filters and limits', () => {
    const now = Date.now();
    const runA = store.saveRun({
      id: 'run-A',
      projectId: 'project-x',
      pipelineId: 'pipe-a',
      status: 'completed',
      input: { step: 'a' },
      output: { status: 'completed' },
      createdAt: new Date(now - 2000).toISOString(),
      startedAt: new Date(now - 2000).toISOString(),
      finishedAt: new Date(now - 1500).toISOString()
    });

    const runB = store.saveRun({
      id: 'run-B',
      projectId: 'project-y',
      pipelineId: 'pipe-b',
      status: 'completed',
      input: { step: 'b' },
      output: { status: 'completed' },
      createdAt: new Date(now - 1000).toISOString(),
      startedAt: new Date(now - 1000).toISOString(),
      finishedAt: new Date(now - 500).toISOString()
    });

    const limited = store.listRuns({ limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0].id).toBe(runB.id);

    const filtered = store.listRuns({ projectId: 'project-x' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual(runA);
  });

  it('throws when saving a run without project id', () => {
    expect(() => {
      store.saveRun({ status: 'failed' });
    }).toThrow('Run must include a projectId');
  });
});
