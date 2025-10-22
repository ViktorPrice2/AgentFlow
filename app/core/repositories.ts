import { randomUUID } from 'node:crypto';
import type DatabaseConstructor from 'better-sqlite3';
import type {
  ArtifactRecord,
  LogLevel,
  LogRecord,
  RunRecord,
  RunStatus,
  TaskPlan,
  TaskRecord,
  TaskStatus
} from './types.js';

const toDate = (value: string | null | undefined): Date | undefined => {
  if (!value) return undefined;
  return new Date(value);
};

export class TaskRepository {
  constructor(private readonly db: DatabaseConstructor.Database) {}

  create(plan: TaskPlan): TaskRecord {
    const id = randomUUID();
    const now = new Date();
    const stmt = this.db.prepare(
      'INSERT INTO tasks (id, plan, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)' 
    );
    stmt.run(id, JSON.stringify(plan), 'pending', now.toISOString(), now.toISOString());
    return { id, plan, status: 'pending', createdAt: now, updatedAt: now };
  }

  updateStatus(id: string, status: TaskStatus): void {
    const stmt = this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), id);
  }

  findById(id: string): TaskRecord | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      plan: JSON.parse(row.plan) as TaskPlan,
      status: row.status as TaskStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

export class RunRepository {
  constructor(private readonly db: DatabaseConstructor.Database) {}

  create(taskId: string, nodeId: string, agentName: string): RunRecord {
    const id = randomUUID();
    const now = new Date();
    const stmt = this.db.prepare(
      `INSERT INTO runs (id, task_id, node_id, agent_name, status, started_at, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(id, taskId, nodeId, agentName, 'pending', now.toISOString(), 0);
    return {
      id,
      taskId,
      nodeId,
      agentName,
      status: 'pending',
      error: null,
      startedAt: now,
      endedAt: null,
      attempts: 0
    };
  }

  update(runId: string, status: RunStatus, error?: string | null, attempts?: number): void {
    const stmt = this.db.prepare(
      'UPDATE runs SET status = ?, error = ?, attempts = COALESCE(?, attempts), ended_at = ? WHERE id = ?'
    );
    stmt.run(status, error ?? null, attempts ?? null, new Date().toISOString(), runId);
  }

  markRunning(runId: string, attempts: number): void {
    const stmt = this.db.prepare(
      'UPDATE runs SET status = ?, attempts = ?, started_at = ?, ended_at = NULL WHERE id = ?'
    );
    stmt.run('running', attempts, new Date().toISOString(), runId);
  }

  findByTask(taskId: string): RunRecord[] {
    const stmt = this.db.prepare('SELECT * FROM runs WHERE task_id = ?');
    const rows = stmt.all(taskId);
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      nodeId: row.node_id,
      agentName: row.agent_name,
      status: row.status as RunStatus,
      error: row.error,
      startedAt: new Date(row.started_at),
      endedAt: toDate(row.ended_at) ?? null,
      attempts: row.attempts
    }));
  }
}

export class ArtifactRepository {
  constructor(private readonly db: DatabaseConstructor.Database) {}

  create(record: Omit<ArtifactRecord, 'id'>): ArtifactRecord {
    const id = randomUUID();
    const stmt = this.db.prepare(
      'INSERT INTO artifacts (id, run_id, type, path, metadata) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(id, record.runId, record.type, record.path, JSON.stringify(record.metadata ?? {}));
    return { ...record, id };
  }

  findByRun(runId: string): ArtifactRecord[] {
    const stmt = this.db.prepare('SELECT * FROM artifacts WHERE run_id = ?');
    const rows = stmt.all(runId);
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      type: row.type,
      path: row.path,
      metadata: JSON.parse(row.metadata ?? '{}')
    }));
  }
}

export class LogRepository {
  constructor(private readonly db: DatabaseConstructor.Database) {}

  create(runId: string, type: LogLevel, message: string): LogRecord {
    const id = randomUUID();
    const now = new Date();
    const stmt = this.db.prepare(
      'INSERT INTO logs (id, run_id, type, message, timestamp) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(id, runId, type, message, now.toISOString());
    return { id, runId, type, message, timestamp: now };
  }

  findByRun(runId: string): LogRecord[] {
    const stmt = this.db.prepare('SELECT * FROM logs WHERE run_id = ? ORDER BY timestamp ASC');
    const rows = stmt.all(runId);
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      type: row.type,
      message: row.message,
      timestamp: new Date(row.timestamp)
    }));
  }
}
