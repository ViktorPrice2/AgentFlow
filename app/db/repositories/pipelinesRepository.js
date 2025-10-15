import { randomUUID } from 'node:crypto';
import { getDb } from '../client.js';
import { computeJsonDiff } from '../../shared/jsonDiff.js';
import { resolveNextVersion } from '../../shared/semver.js';

const UPSERT_PIPELINE = `
  INSERT INTO Pipelines (id, projectId, name, version, definition, createdAt, updatedAt)
  VALUES (@id, @projectId, @name, @version, @definition, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    projectId = excluded.projectId,
    name = excluded.name,
    version = excluded.version,
    definition = excluded.definition,
    updatedAt = excluded.updatedAt
`;

const LIST_PIPELINES = `
  SELECT id, projectId, name, version, definition, createdAt, updatedAt
  FROM Pipelines
  ORDER BY updatedAt DESC
`;

const GET_PIPELINE = `
  SELECT id, projectId, name, version, definition, createdAt, updatedAt
  FROM Pipelines
  WHERE id = ?
`;

const INSERT_HISTORY = `
  INSERT INTO PipelineHistory (id, pipelineId, projectId, version, payload, diff, createdAt)
  VALUES (@id, @pipelineId, @projectId, @version, @payload, @diff, @createdAt)
`;

const LIST_HISTORY = `
  SELECT id, pipelineId, projectId, version, payload, diff, createdAt
  FROM PipelineHistory
  WHERE pipelineId = ?
  ORDER BY createdAt DESC
  LIMIT ?
`;

const GET_HISTORY = `
  SELECT id, pipelineId, projectId, version, payload, diff, createdAt
  FROM PipelineHistory
  WHERE id = ?
`;

function parseDefinition(value) {
  if (!value) {
    return {
      description: '',
      nodes: [],
      edges: [],
      override: null
    };
  }

  try {
    const parsed = JSON.parse(value);

    return {
      description: parsed.description ?? '',
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      override: parsed.override ?? null
    };
  } catch {
    return {
      description: '',
      nodes: [],
      edges: [],
      override: null
    };
  }
}

function normalizePipelineRow(row) {
  if (!row) {
    return null;
  }

  const definition = parseDefinition(row.definition);

  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    version: row.version,
    description: definition.description,
    nodes: definition.nodes,
    edges: definition.edges,
    override: definition.override,
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
    pipelineId: row.pipelineId,
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

function serializePayload(pipeline) {
  return JSON.stringify({
    id: pipeline.id,
    projectId: pipeline.projectId,
    name: pipeline.name,
    version: pipeline.version,
    description: pipeline.description,
    nodes: pipeline.nodes,
    edges: pipeline.edges,
    override: pipeline.override,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt
  });
}

function serializeDefinition(pipeline) {
  return JSON.stringify({
    description: pipeline.description ?? '',
    nodes: pipeline.nodes ?? [],
    edges: pipeline.edges ?? [],
    override: pipeline.override ?? null
  });
}

function toComparablePipeline(pipeline) {
  if (!pipeline) {
    return null;
  }

  return {
    id: pipeline.id,
    projectId: pipeline.projectId,
    name: pipeline.name,
    version: pipeline.version,
    description: pipeline.description,
    nodes: pipeline.nodes,
    edges: pipeline.edges,
    override: pipeline.override
  };
}

export async function listPipelines(limit = 100) {
  const db = await getDb();
  const rows = db.prepare(LIST_PIPELINES).all();

  return rows.slice(0, limit).map(normalizePipelineRow);
}

export async function getPipeline(pipelineId) {
  const db = await getDb();
  const row = db.prepare(GET_PIPELINE).get(pipelineId);

  return normalizePipelineRow(row);
}

export async function upsertPipeline(pipeline) {
  if (!pipeline?.name) {
    throw new Error('PIPELINE_NAME_REQUIRED');
  }

  const db = await getDb();
  const existing = pipeline.id ? await getPipeline(pipeline.id) : null;
  const now = new Date().toISOString();
  const id = pipeline.id || randomUUID();
  const nextVersion = resolveNextVersion(pipeline.version, existing?.version);

  const payload = {
    id,
    projectId: pipeline.projectId ?? null,
    name: pipeline.name,
    version: nextVersion,
    definition: serializeDefinition(pipeline),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  db.prepare(UPSERT_PIPELINE).run(payload);

  const saved = await getPipeline(id);
  await recordPipelineHistory(db, saved, existing);

  return saved;
}

async function recordPipelineHistory(db, currentPipeline, previousPipeline) {
  if (!currentPipeline) {
    return;
  }

  const historyPayload = {
    id: randomUUID(),
    pipelineId: currentPipeline.id,
    projectId: currentPipeline.projectId,
    version: currentPipeline.version,
    payload: serializePayload(currentPipeline),
    diff: JSON.stringify(
      computeJsonDiff(toComparablePipeline(previousPipeline), toComparablePipeline(currentPipeline))
    ),
    createdAt: new Date().toISOString()
  };

  db.prepare(INSERT_HISTORY).run(historyPayload);
}

export async function listPipelineHistory(pipelineId, limit = 20) {
  const db = await getDb();
  const rows = db.prepare(LIST_HISTORY).all(pipelineId, limit);

  return rows.map(normalizeHistoryRow);
}

export async function getPipelineHistoryById(historyId) {
  const db = await getDb();
  const row = db.prepare(GET_HISTORY).get(historyId);

  return normalizeHistoryRow(row);
}
