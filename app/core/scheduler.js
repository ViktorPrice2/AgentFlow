import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getDatabaseFilePath } from '../db/migrate.js';
import { loadAgents } from './pluginLoader.js';
import { runPipeline } from './orchestrator.js';
import { randomUUID } from 'node:crypto';

let cron = null;
try {
  // optional dependency
  // eslint-disable-next-line node/no-extraneous-import
  cron = await import('node-cron').then((m) => m.default || m);
} catch {
  cron = null;
}

function openDb() {
  const dbFile = getDatabaseFilePath();
  return new Database(dbFile);
}

function parseJsonSafe(txt) {
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

export function createScheduler() {
  const jobs = new Map(); // id -> {task, meta}
  let running = false;

  async function loadSchedules() {
    const db = openDb();
    try {
      const rows = db.prepare('SELECT * FROM Schedules WHERE enabled = 1').all();
      return rows.map((r) => ({
        ...r,
        cron: r.cron,
        pipelineId: r.pipelineId,
        projectId: r.projectId,
        metadata: parseJsonSafe(r.metadata)
      }));
    } finally {
      db.close();
    }
  }

  async function scheduleJob(sch) {
    if (!cron) {
      console.warn('[scheduler] node-cron not available, skipping schedule', sch.id);
      return;
    }
    if (jobs.has(sch.id)) {
      // cancel existing
      const existing = jobs.get(sch.id);
      existing.task.stop && existing.task.stop();
      jobs.delete(sch.id);
    }
    const task = cron.schedule(sch.cron, async () => {
      try {
        console.info(`[scheduler] running schedule ${sch.id} pipeline ${sch.pipelineId}`);
        await runScheduledPipeline(sch.pipelineId, sch.projectId, sch.id);
      } catch (e) {
        console.error('[scheduler] pipeline run error', e);
      }
    }, { scheduled: true });
    jobs.set(sch.id, { task, meta: sch });
  }

  async function runScheduledPipeline(pipelineId, projectId, scheduleId) {
    // load pipeline definition from DB
    const db = openDb();
    try {
      const row = db.prepare('SELECT definition FROM Pipelines WHERE id = ?').get(pipelineId);
      if (!row) {
        console.warn(`[scheduler] pipeline ${pipelineId} not found`);
        return;
      }
      const definition = parseJsonSafe(row.definition) || {};
      // attach executors
      const agents = await loadAgents();
      const agentMap = new Map(agents.map((a) => [a.manifest.name || a.id, a.execute]));
      const nodes = (definition.nodes || []).map((n) => {
        const exec = agentMap.get(n.agentName) || agentMap.get(n.agent) || null;
        return { ...n, _execute: exec };
      });
      const prepared = { ...definition, nodes };
      // run
      const res = await runPipeline(prepared, { projectId }, { runId: `sched_${scheduleId}_${Date.now()}` });
      // update nextRun (best-effort): compute next scheduled run via cron-parser if available
      try {
        const cronParser = await import('cron-parser').then((m) => m.default || m);
        const interval = cronParser.parseExpression(prepared.cron || sch.cron || '*/5 * * * *');
        const next = interval.next().toString();
        const updb = openDb();
        try {
          updb.prepare('UPDATE Schedules SET nextRun = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(next, scheduleId);
        } finally { updb.close(); }
      } catch {
        // ignore if parser missing
      }
      return res;
    } finally {
      db.close();
    }
  }

  async function start() {
    if (running) return;
    running = true;
    const list = await loadSchedules();
    for (const s of list) {
      await scheduleJob(s);
    }
    console.info('[scheduler] started, jobs:', jobs.size);
  }

  async function stop() {
    if (!running) return;
    for (const [id, j] of jobs) {
      try { j.task && j.task.stop && j.task.stop(); } catch {}
    }
    jobs.clear();
    running = false;
    console.info('[scheduler] stopped');
  }

  async function reload() {
    await stop();
    await start();
  }

  // management helpers using DB
  async function listSchedules() {
    const db = openDb();
    try {
      return db.prepare('SELECT * FROM Schedules ORDER BY createdAt DESC').all().map((r) => ({ ...r, metadata: parseJsonSafe(r.metadata) }));
    } finally { db.close(); }
  }

  async function addSchedule({ projectId, pipelineId, cron: cronExpr, enabled = 1, metadata = null }) {
    const id = randomUUID();
    const db = openDb();
    try {
      db.prepare('INSERT INTO Schedules (id, projectId, pipelineId, cron, enabled, metadata, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        .run(id, projectId, pipelineId, cronExpr, enabled ? 1 : 0, metadata ? JSON.stringify(metadata) : null);
    } finally { db.close(); }
    await reload();
    return id;
  }

  async function removeSchedule(id) {
    const db = openDb();
    try { db.prepare('DELETE FROM Schedules WHERE id = ?').run(id); } finally { db.close(); }
    await reload();
    return true;
  }

  async function toggleSchedule(id, enabled) {
    const db = openDb();
    try { db.prepare('UPDATE Schedules SET enabled = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(enabled ? 1 : 0, id); } finally { db.close(); }
    await reload();
    return true;
  }

  return { start, stop, reload, listSchedules, addSchedule, removeSchedule, toggleSchedule, _jobs: jobs, isRunning: () => running };
}

export default createScheduler;
