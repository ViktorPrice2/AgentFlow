import { randomUUID } from 'node:crypto';
import { getDb } from '../client.js';
import { computeJsonDiff } from '../../shared/jsonDiff.js';
import { resolveNextVersion } from '../../shared/semver.js';

const UPSERT_AGENT = `
  INSERT INTO Agents (id, projectId, name, type, version, source, config, createdAt, updatedAt)
  VALUES (@id, @projectId, @name, @type, @version, @source, @config, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    projectId = excluded.projectId,
    name = excluded.name,
    type = excluded.type,
    version = excluded.version,
    source = excluded.source,
    config = excluded.config,
    updatedAt = excluded.updatedAt
`;

const LIST_AGENTS = `
  SELECT id, projectId, name, type, version, source, config, createdAt, updatedAt
  FROM Agents
  ORDER BY updatedAt DESC
`;

const GET_AGENT = `
  SELECT id, projectId, name, type, version, source, config, createdAt, updatedAt
  FROM Agents
  WHERE id = ?
`;

const INSERT_HISTORY = `
  INSERT INTO AgentHistory (id, agentId, projectId, version, payload, diff, createdAt)
  VALUES (@id, @agentId, @projectId, @version, @payload, @diff, @createdAt)
`;

const LIST_HISTORY = `
  SELECT id, agentId, projectId, version, payload, diff, createdAt
  FROM AgentHistory
  WHERE agentId = ?
  ORDER BY createdAt DESC
  LIMIT ?
`;

const GET_HISTORY = `
  SELECT id, agentId, projectId, version, payload, diff, createdAt
  FROM AgentHistory
  WHERE id = ?
`;

function normalizeAgentRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    type: row.type,
    version: row.version,
    source: row.source ?? 'manual',
    config: parseJson(row.config) ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function normalizeHistoryRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    agentId: row.agentId,
    projectId: row.projectId,
    version: row.version,
    payload: parseJson(row.payload) ?? {},
    diff: parseJson(row.diff) ?? { equal: true, changes: [], summary: { added: 0, removed: 0, changed: 0 } },
    createdAt: row.createdAt
  };
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializePayload(agent) {
  return JSON.stringify({
    id: agent.id,
    projectId: agent.projectId,
    name: agent.name,
    type: agent.type,
    version: agent.version,
    source: agent.source,
    config: agent.config,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt
  });
}

function toComparableAgent(agent) {
  if (!agent) {
    return null;
  }

  return {
    id: agent.id,
    projectId: agent.projectId,
    name: agent.name,
    type: agent.type,
    version: agent.version,
    source: agent.source,
    config: agent.config
  };
}

export async function listAgentConfigs(limit = 100) {
  const db = await getDb();
  const rows = db.prepare(LIST_AGENTS).all();

  return rows.slice(0, limit).map(normalizeAgentRow);
}

export async function getAgentConfig(agentId) {
  const db = await getDb();
  const row = db.prepare(GET_AGENT).get(agentId);

  return normalizeAgentRow(row);
}

export async function upsertAgentConfig(agent) {
  if (!agent?.projectId) {
    throw new Error('PROJECT_ID_REQUIRED');
  }

  const db = await getDb();
  const existing = agent.id ? await getAgentConfig(agent.id) : null;
  const now = new Date().toISOString();
  const id = agent.id || randomUUID();
  const nextVersion = resolveNextVersion(agent.version, existing?.version);

  const payload = {
    id,
    projectId: agent.projectId,
    name: agent.name || id,
    type: agent.type || 'custom',
    version: nextVersion,
    source: agent.source || 'manual',
    config: JSON.stringify(agent.config ?? {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  db.prepare(UPSERT_AGENT).run(payload);

  const saved = await getAgentConfig(id);
  await recordAgentHistory(db, saved, existing);

  return saved;
}

async function recordAgentHistory(db, currentAgent, previousAgent) {
  if (!currentAgent) {
    return;
  }

  const historyPayload = {
    id: randomUUID(),
    agentId: currentAgent.id,
    projectId: currentAgent.projectId,
    version: currentAgent.version,
    payload: serializePayload(currentAgent),
    diff: JSON.stringify(computeJsonDiff(toComparableAgent(previousAgent), toComparableAgent(currentAgent))),
    createdAt: new Date().toISOString()
  };

  db.prepare(INSERT_HISTORY).run(historyPayload);
}

export async function listAgentHistory(agentId, limit = 20) {
  const db = await getDb();
  const rows = db.prepare(LIST_HISTORY).all(agentId, limit);

  return rows.map(normalizeHistoryRow);
}

export async function getAgentHistoryById(historyId) {
  const db = await getDb();
  const row = db.prepare(GET_HISTORY).get(historyId);

  return normalizeHistoryRow(row);
}
