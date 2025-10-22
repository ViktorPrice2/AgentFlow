import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

class MemoryDatabase {
  constructor() {
    this.briefs = new Map();
    this.metrics = new Map();
  }

  pragma() {}

  close() {}

  prepare(query) {
    const normalized = query.replace(/\s+/g, ' ').trim();
    const upper = normalized.toUpperCase();

    if (upper.startsWith('SELECT ID, PROJECTID, SUMMARY, DETAILS, CREATEDAT, UPDATEDAT FROM BRIEFS WHERE ID = ?')) {
      return {
        get: (id) => {
          const record = this.briefs.get(id);
          return record ? { ...record } : undefined;
        }
      };
    }

    if (upper.startsWith('SELECT ID, PROJECTID, SUMMARY, DETAILS, CREATEDAT, UPDATEDAT FROM BRIEFS')) {
      const hasProjectFilter = upper.includes('WHERE PROJECTID = ?');
      const hasLimit = upper.includes('LIMIT ?') || upper.includes('LIMIT 1');

      if (upper.includes('LIMIT 1') && !upper.includes('LIMIT ?')) {
        return {
          get: (...params) => {
            const result = this.prepare(normalized.replace('LIMIT 1', 'LIMIT ?')).all(...params, 1);
            return result[0];
          }
        };
      }

      return {
        all: (...params) => {
          let filtered = Array.from(this.briefs.values());
          let index = 0;

          if (hasProjectFilter) {
            const projectId = params[index++];
            filtered = filtered.filter((brief) => brief.projectId === projectId);
          }

          let limit = null;

          if (hasLimit) {
            limit = params[index++] ?? null;
          }

          const sorted = filtered
            .slice()
            .sort((a, b) => {
              const aTime = (a.updatedAt || a.createdAt || '').toString();
              const bTime = (b.updatedAt || b.createdAt || '').toString();
              return bTime.localeCompare(aTime);
            })
            .map((record) => ({ ...record }));

          if (limit && Number.isInteger(limit) && limit > 0) {
            return sorted.slice(0, limit);
          }

          return sorted;
        }
      };
    }

    if (upper.startsWith('SELECT ID, PROJECTID, NAME, VALUE, UNIT, CAPTUREDAT FROM METRICS WHERE ID = ?')) {
      return {
        get: (id) => {
          const record = this.metrics.get(id);
          return record ? { ...record } : undefined;
        }
      };
    }

    if (upper.startsWith('SELECT ID, PROJECTID, NAME, VALUE, UNIT, CAPTUREDAT FROM METRICS')) {
      const hasProjectFilter = upper.includes('WHERE PROJECTID = ?');
      const hasNameFilter = upper.includes('NAME = ?');
      const hasLimit = upper.includes('LIMIT ?');

      return {
        all: (...params) => {
          let filtered = Array.from(this.metrics.values());
          let index = 0;

          if (hasProjectFilter) {
            const projectId = params[index++];
            filtered = filtered.filter((metric) => metric.projectId === projectId);
          }

          if (hasNameFilter) {
            const name = params[index++];
            filtered = filtered.filter((metric) => metric.name === name);
          }

          let limit = null;

          if (hasLimit) {
            limit = params[index++];
          }

          const sorted = filtered
            .slice()
            .sort((a, b) => {
              const aTime = (a.capturedAt || '').toString();
              const bTime = (b.capturedAt || '').toString();
              return bTime.localeCompare(aTime);
            })
            .map((record) => ({ ...record }));

          if (limit && Number.isInteger(limit) && limit > 0) {
            return sorted.slice(0, limit);
          }

          return sorted;
        }
      };
    }

    if (upper.startsWith('INSERT INTO BRIEFS')) {
      return {
        run: (id, projectId, summary, details, createdAt, updatedAt) => {
          this.briefs.set(id, { id, projectId, summary, details, createdAt, updatedAt });
          return { changes: 1 };
        }
      };
    }

    if (upper.startsWith('UPDATE BRIEFS')) {
      return {
        run: (projectId, summary, details, updatedAt, id) => {
          const existing = this.briefs.get(id);
          if (!existing) {
            return { changes: 0 };
          }

          this.briefs.set(id, { ...existing, projectId, summary, details, updatedAt });
          return { changes: 1 };
        }
      };
    }

    if (upper.startsWith('DELETE FROM BRIEFS')) {
      return {
        run: (id) => {
          this.briefs.delete(id);
          return { changes: 1 };
        }
      };
    }

    if (upper.startsWith('SELECT ID, PROJECTID, NAME, VALUE, UNIT, CAPTUREDAT FROM METRICS WHERE ID = ?')) {
      return {
        get: (id) => {
          const record = this.metrics.get(id);
          return record ? { ...record } : undefined;
        }
      };
    }

    if (upper.startsWith('INSERT INTO METRICS')) {
      return {
        run: (id, projectId, name, value, unit, capturedAt) => {
          this.metrics.set(id, { id, projectId, name, value, unit, capturedAt });
          return { changes: 1 };
        }
      };
    }

    if (upper.startsWith('UPDATE METRICS')) {
      return {
        run: (projectId, name, value, unit, capturedAt, id) => {
          const existing = this.metrics.get(id);
          if (!existing) {
            return { changes: 0 };
          }

          this.metrics.set(id, { ...existing, projectId, name, value, unit, capturedAt });
          return { changes: 1 };
        }
      };
    }

    if (upper.startsWith('DELETE FROM METRICS')) {
      return {
        run: (id) => {
          this.metrics.delete(id);
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

describe('entity store briefs and metrics', () => {
  let store;
  const dbPath = 'test-briefs-metrics';

  beforeEach(() => {
    databases.clear();
    store = createEntityStore({ dbPath });
  });

  it('saves and retrieves briefs', () => {
    const createdAt = new Date().toISOString();
    const saved = store.saveBrief({
      projectId: 'project-brief',
      summary: 'Initial brief',
      details: { answers: { name: 'AgentFlow' } },
      createdAt
    });

    expect(saved.projectId).toBe('project-brief');
    expect(saved.summary).toBe('Initial brief');
    expect(saved.details).toEqual({ answers: { name: 'AgentFlow' } });

    const fetched = store.getBriefById(saved.id);
    expect(fetched).toEqual(saved);

    const latest = store.getLatestBrief('project-brief');
    expect(latest.id).toBe(saved.id);

    const listed = store.listBriefs({ projectId: 'project-brief' });
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(saved.id);

    store.deleteBrief(saved.id);
    expect(store.listBriefs({ projectId: 'project-brief' })).toHaveLength(0);
  });

  it('saves and retrieves metrics', () => {
    const capturedAt = new Date().toISOString();
    const saved = store.saveMetric({
      projectId: 'project-metric',
      name: 'leads',
      value: 12.5,
      unit: 'count',
      capturedAt
    });

    expect(saved.projectId).toBe('project-metric');
    expect(saved.value).toBeCloseTo(12.5);
    expect(saved.unit).toBe('count');

    const fetched = store.getMetricById(saved.id);
    expect(fetched).toEqual(saved);

    const listed = store.listMetrics({ projectId: 'project-metric' });
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe('leads');

    store.deleteMetric(saved.id);
    expect(store.listMetrics({ projectId: 'project-metric' })).toHaveLength(0);
  });
});
