import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase as openBetterSqliteDatabase } from '../../db/sqlite.js';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'app.db');

function openDatabase(dbPath = DEFAULT_DB_PATH) {
  const db = openBetterSqliteDatabase(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

function safeParse(json, fallback = {}) {
  if (!json) {
    return fallback;
  }

  try {
    return JSON.parse(json);
  } catch (error) {
    return fallback;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildAgentRecord(row) {
  const payload = safeParse(row.config, {});
  const name = row.name || payload.name || row.id;
  const type = row.type || payload.type || null;
  const version = Number.isInteger(row.version) ? row.version : payload.version || 1;
  const description = payload.description || '';

  const normalizedPayload = {
    ...payload,
    id: row.id,
    name,
    type,
    version
  };

  return {
    id: row.id,
    projectId: row.projectId || payload.projectId || null,
    name,
    type,
    version,
    description,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    payload: normalizedPayload
  };
}

function buildPipelineRecord(row) {
  const payload = safeParse(row.definition, {});
  const name = row.name || payload.name || row.id;
  const version = Number.isInteger(row.version) ? row.version : payload.version || 1;
  const description = payload.description || '';

  const normalizedPayload = {
    ...payload,
    id: row.id,
    name,
    projectId: row.projectId || payload.projectId || null,
    version
  };

  if (!Array.isArray(normalizedPayload.nodes)) {
    normalizedPayload.nodes = [];
  }

  if (!Array.isArray(normalizedPayload.edges)) {
    normalizedPayload.edges = [];
  }

  return {
    id: row.id,
    projectId: row.projectId || payload.projectId || null,
    name,
    description,
    version,
    nodes: normalizedPayload.nodes,
    edges: normalizedPayload.edges,
    override: normalizedPayload.override || null,
    createdAt: row.createdAt || payload.createdAt || null,
    updatedAt: row.updatedAt || payload.updatedAt || null,
    payload: normalizedPayload
  };
}

function buildScheduleRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.projectId || null,
    pipelineId: row.pipelineId || null,
    cron: row.cron,
    enabled: row.enabled === 1,
    nextRun: row.nextRun || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  };
}

function stringifyPayload(payload) {
  return JSON.stringify(payload);
}

function computeJsonDiff(baseValue, targetValue) {
  const changes = [];

  function walk(baseNode, targetNode, path = '') {
    if (Object.is(baseNode, targetNode)) {
      return;
    }

    const baseIsArray = Array.isArray(baseNode);
    const targetIsArray = Array.isArray(targetNode);

    if (baseIsArray && targetIsArray) {
      const maxLength = Math.max(baseNode.length, targetNode.length);

      for (let index = 0; index < maxLength; index += 1) {
        const nextPath = `${path}[${index}]`;

        if (index >= baseNode.length) {
          changes.push({
            path: nextPath,
            type: 'added',
            value: targetNode[index]
          });
          continue;
        }

        if (index >= targetNode.length) {
          changes.push({
            path: nextPath,
            type: 'removed',
            value: baseNode[index]
          });
          continue;
        }

        walk(baseNode[index], targetNode[index], nextPath);
      }

      return;
    }

    if (isPlainObject(baseNode) && isPlainObject(targetNode)) {
      const keys = new Set([...Object.keys(baseNode), ...Object.keys(targetNode)]);

      keys.forEach((key) => {
        const nextPath = path ? `${path}.${key}` : key;

        if (!(key in targetNode)) {
          changes.push({
            path: nextPath,
            type: 'removed',
            value: baseNode[key]
          });
          return;
        }

        if (!(key in baseNode)) {
          changes.push({
            path: nextPath,
            type: 'added',
            value: targetNode[key]
          });
          return;
        }

        walk(baseNode[key], targetNode[key], nextPath);
      });

      return;
    }

    changes.push({
      path,
      type: 'changed',
      before: baseNode,
      after: targetNode
    });
  }

  walk(baseValue, targetValue, '');

  return changes;
}

function createHistorySummary(entityType, payload) {
  if (entityType === 'agent') {
    const name = payload.name || payload.id;
    const type = payload.type || 'custom';
    return `${name} (${type})`;
  }

  if (entityType === 'pipeline') {
    const name = payload.name || payload.id;
    return `${name}`;
  }

  return payload.id || '';
}

export function createEntityStore(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB_PATH;

  function listAgentRecords() {
    const db = openDatabase(dbPath);

    try {
      const rows = db
        .prepare(
          `SELECT id, projectId, name, type, config, version, createdAt, updatedAt
           FROM Agents
           ORDER BY datetime(COALESCE(updatedAt, createdAt)) DESC`
        )
        .all();

      return rows.map((row) => buildAgentRecord(row));
    } finally {
      db.close();
    }
  }

  function getAgentById(id) {
    if (!id) {
      throw new Error('Agent id is required');
    }

    const db = openDatabase(dbPath);

    try {
      const row = db
        .prepare(
          `SELECT id, projectId, name, type, config, version, createdAt, updatedAt
             FROM Agents
            WHERE id = ?`
        )
        .get(id);

      return row ? buildAgentRecord(row) : null;
    } finally {
      db.close();
    }
  }

  function saveAgent(agent) {
    if (!agent || (!agent.id && !agent.name)) {
      throw new Error('Agent config must include id or name');
    }

    const id = agent.id || agent.name;
    const now = new Date().toISOString();
    const db = openDatabase(dbPath);

    try {
      const existing = db
        .prepare('SELECT id, projectId, version, createdAt FROM Agents WHERE id = ?')
        .get(id);

      const projectId = agent.projectId ?? existing?.projectId ?? null;
      const name = agent.name || id;
      const type = agent.type || null;
      const previousVersion = existing?.version || 0;
      const nextVersion = previousVersion + 1;
      const createdAt = existing?.createdAt || now;
      const payload = {
        ...agent,
        id,
        name,
        type,
        projectId,
        version: nextVersion
      };
      const serializedConfig = stringifyPayload(payload);

      if (existing) {
        db.prepare(
          `UPDATE Agents
             SET projectId = ?, name = ?, type = ?, config = ?, version = ?, updatedAt = ?
           WHERE id = ?`
        ).run(projectId, name, type, serializedConfig, nextVersion, now, id);
      } else {
        db.prepare(
          `INSERT INTO Agents (id, projectId, name, type, config, version, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, projectId, name, type, serializedConfig, nextVersion, createdAt, now);
      }

      db.prepare(
        `INSERT INTO EntityHistory (entityType, entityId, version, payload, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      ).run('agent', id, nextVersion, serializedConfig, now);

      return buildAgentRecord({
        id,
        projectId,
        name,
        type,
        config: serializedConfig,
        version: nextVersion,
        createdAt,
        updatedAt: now
      });
    } finally {
      db.close();
    }
  }

  function deleteAgent(id) {
    if (!id) {
      throw new Error('Agent id is required');
    }

    const db = openDatabase(dbPath);

    try {
      db.prepare('DELETE FROM Agents WHERE id = ?').run(id);
    } finally {
      db.close();
    }
  }

  function listPipelines() {
    const db = openDatabase(dbPath);

    try {
      const rows = db
        .prepare(
          `SELECT id, projectId, name, definition, version, createdAt, updatedAt
           FROM Pipelines
           ORDER BY datetime(COALESCE(updatedAt, createdAt)) DESC`
        )
        .all();

      return rows.map((row) => buildPipelineRecord(row));
    } finally {
      db.close();
    }
  }

  function getPipelineById(id) {
    if (!id) {
      throw new Error('Pipeline id is required');
    }

    const db = openDatabase(dbPath);

    try {
      const row = db
        .prepare(
          `SELECT id, projectId, name, definition, version, createdAt, updatedAt
             FROM Pipelines
            WHERE id = ?`
        )
        .get(id);

      return row ? buildPipelineRecord(row) : null;
    } finally {
      db.close();
    }
  }

  function savePipeline(pipeline) {
    if (!pipeline || (!pipeline.id && !pipeline.name)) {
      throw new Error('Pipeline definition must include id or name');
    }

    const id = pipeline.id || pipeline.name;
    const now = new Date().toISOString();
    const db = openDatabase(dbPath);

    try {
      const existing = db
        .prepare('SELECT id, projectId, version, createdAt FROM Pipelines WHERE id = ?')
        .get(id);

      const projectId = pipeline.projectId ?? existing?.projectId ?? null;
      const name = pipeline.name || id;
      const previousVersion = existing?.version || 0;
      const nextVersion = previousVersion + 1;
      const createdAt = existing?.createdAt || now;
      const payload = {
        ...pipeline,
        id,
        name,
        projectId,
        version: nextVersion
      };
      const serializedDefinition = stringifyPayload(payload);

      if (existing) {
        db.prepare(
          `UPDATE Pipelines
             SET projectId = ?, name = ?, definition = ?, version = ?, updatedAt = ?
           WHERE id = ?`
        ).run(projectId, name, serializedDefinition, nextVersion, now, id);
      } else {
        db.prepare(
          `INSERT INTO Pipelines (id, projectId, name, definition, version, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, projectId, name, serializedDefinition, nextVersion, createdAt, now);
      }

      db.prepare(
        `INSERT INTO EntityHistory (entityType, entityId, version, payload, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      ).run('pipeline', id, nextVersion, serializedDefinition, now);

      return buildPipelineRecord({
        id,
        projectId,
        name,
        definition: serializedDefinition,
        version: nextVersion,
        createdAt,
        updatedAt: now
      });
    } finally {
      db.close();
    }
  }

  function deletePipeline(id) {
    if (!id) {
      throw new Error('Pipeline id is required');
    }

    const db = openDatabase(dbPath);

    try {
      db.prepare('DELETE FROM Pipelines WHERE id = ?').run(id);
    } finally {
      db.close();
    }
  }

  function listHistory(entityType, entityId) {
    if (!entityType || !entityId) {
      throw new Error('entityType and entityId are required');
    }

    const db = openDatabase(dbPath);

    try {
      const rows = db
        .prepare(
          `SELECT id, version, payload, createdAt
           FROM EntityHistory
           WHERE entityType = ? AND entityId = ?
           ORDER BY version DESC`
        )
        .all(entityType, entityId);

      return rows.map((row) => {
        const payload = safeParse(row.payload, {});

        return {
          id: row.id,
          version: row.version,
          createdAt: row.createdAt,
          summary: createHistorySummary(entityType, payload)
        };
      });
    } finally {
      db.close();
    }
  }

  function getHistoryRecord(id) {
    const db = openDatabase(dbPath);

    try {
      return db
        .prepare('SELECT id, entityType, entityId, version, payload, createdAt FROM EntityHistory WHERE id = ?')
        .get(id);
    } finally {
      db.close();
    }
  }

  function diffEntityVersions({ entityType, idA, idB }) {
    if (!entityType || !idA || !idB) {
      throw new Error('entityType, idA and idB are required');
    }

    const newer = getHistoryRecord(idA);
    const older = getHistoryRecord(idB);

    if (!newer || !older) {
      throw new Error('Не удалось найти выбранные версии');
    }

    if (newer.entityType !== entityType || older.entityType !== entityType) {
      throw new Error('Тип сущности не совпадает с версиями');
    }

    if (newer.entityId !== older.entityId) {
      throw new Error('Версии принадлежат разным сущностям');
    }

    const basePayload = safeParse(older.payload, {});
    const targetPayload = safeParse(newer.payload, {});
    const changes = computeJsonDiff(basePayload, targetPayload);

    return {
      entityType,
      entityId: newer.entityId,
      base: {
        id: older.id,
        version: older.version,
        createdAt: older.createdAt
      },
      compare: {
        id: newer.id,
        version: newer.version,
        createdAt: newer.createdAt
      },
      changes
    };
  }

  function buildAgentConfigMap() {
    const records = listAgentRecords();
    const map = new Map();

    records.forEach((record) => {
      map.set(record.id, record.payload);
    });

    return map;
  }

  function listSchedules(filter = {}) {
    const db = openDatabase(dbPath);

    try {
      let query =
        `SELECT id, projectId, pipelineId, cron, enabled, nextRun, createdAt, updatedAt
           FROM Schedules`;
      const params = [];

      if (filter.projectId) {
        query += ' WHERE projectId = ?';
        params.push(filter.projectId);
      }

      query += ' ORDER BY datetime(COALESCE(updatedAt, createdAt)) DESC';

      const rows = db.prepare(query).all(...params);

      return rows.map((row) => buildScheduleRecord(row));
    } finally {
      db.close();
    }
  }

  function getScheduleById(id) {
    if (!id) {
      throw new Error('Schedule id is required');
    }

    const db = openDatabase(dbPath);

    try {
      const row = db
        .prepare(
          `SELECT id, projectId, pipelineId, cron, enabled, nextRun, createdAt, updatedAt
             FROM Schedules
            WHERE id = ?`
        )
        .get(id);

      return buildScheduleRecord(row);
    } finally {
      db.close();
    }
  }

  function saveSchedule(schedule) {
    if (!schedule?.cron) {
      throw new Error('Schedule must include a cron expression');
    }

    if (!schedule?.pipelineId) {
      throw new Error('Schedule must reference a pipeline');
    }

    const db = openDatabase(dbPath);
    const now = new Date().toISOString();

    try {
      const existing = schedule.id
        ? db.prepare('SELECT id FROM Schedules WHERE id = ?').get(schedule.id)
        : null;

      const id = existing?.id || schedule.id || randomUUID();
      const projectId = schedule.projectId || null;
      const cronExpression = schedule.cron.trim();
      const enabled = schedule.enabled === false ? 0 : 1;
      const nextRun = schedule.nextRun || null;

      if (existing) {
        db.prepare(
          `UPDATE Schedules
              SET projectId = ?, pipelineId = ?, cron = ?, enabled = ?, nextRun = ?, updatedAt = ?
            WHERE id = ?`
        ).run(projectId, schedule.pipelineId, cronExpression, enabled, nextRun, now, id);
      } else {
        db.prepare(
          `INSERT INTO Schedules (id, projectId, pipelineId, cron, enabled, nextRun, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, projectId, schedule.pipelineId, cronExpression, enabled, nextRun, now, now);
      }

      return getScheduleById(id);
    } finally {
      db.close();
    }
  }

  function deleteSchedule(id) {
    if (!id) {
      throw new Error('Schedule id is required');
    }

    const db = openDatabase(dbPath);

    try {
      db.prepare('DELETE FROM Schedules WHERE id = ?').run(id);
    } finally {
      db.close();
    }
  }

  function setScheduleEnabled(id, enabled) {
    if (!id) {
      throw new Error('Schedule id is required');
    }

    const db = openDatabase(dbPath);
    const now = new Date().toISOString();

    try {
      db.prepare('UPDATE Schedules SET enabled = ?, updatedAt = ? WHERE id = ?').run(
        enabled ? 1 : 0,
        now,
        id
      );
    } finally {
      db.close();
    }
  }

  function updateScheduleNextRun(id, nextRun) {
    if (!id) {
      throw new Error('Schedule id is required');
    }

    const db = openDatabase(dbPath);
    const now = new Date().toISOString();

    try {
      db.prepare('UPDATE Schedules SET nextRun = ?, updatedAt = ? WHERE id = ?').run(
        nextRun,
        now,
        id
      );
    } finally {
      db.close();
    }
  }

  return {
    listAgentRecords,
    getAgentById,
    saveAgent,
    deleteAgent,
    listPipelines,
    getPipelineById,
    savePipeline,
    deletePipeline,
    listHistory,
    diffEntityVersions,
    buildAgentConfigMap,
    listSchedules,
    getScheduleById,
    saveSchedule,
    deleteSchedule,
    setScheduleEnabled,
    updateScheduleNextRun
  };
}
