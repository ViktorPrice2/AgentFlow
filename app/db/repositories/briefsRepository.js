import { randomUUID } from 'node:crypto';
import { getDb } from '../client.js';

const UPSERT_BRIEF = `
  INSERT INTO Briefs (
    id,
    projectId,
    title,
    content,
    status,
    source,
    metadata,
    createdAt,
    updatedAt
  ) VALUES (
    @id,
    @projectId,
    @title,
    @content,
    @status,
    @source,
    @metadata,
    @createdAt,
    @updatedAt
  )
  ON CONFLICT(id) DO UPDATE SET
    projectId = excluded.projectId,
    title = excluded.title,
    content = excluded.content,
    status = excluded.status,
    source = excluded.source,
    metadata = excluded.metadata,
    updatedAt = excluded.updatedAt
`;

const LIST_BRIEFS_BY_PROJECT = `
  SELECT id, projectId, title, content, status, source, metadata, createdAt, updatedAt
  FROM Briefs
  WHERE projectId = ?
  ORDER BY updatedAt DESC
`;

const GET_BRIEF = `
  SELECT id, projectId, title, content, status, source, metadata, createdAt, updatedAt
  FROM Briefs
  WHERE id = ?
`;

export async function upsertBrief(brief) {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = brief.id || randomUUID();

  const payload = {
    id,
    projectId: brief.projectId,
    title: brief.title?.trim() || 'Бриф',
    content: typeof brief.content === 'string' ? brief.content : JSON.stringify(brief.content ?? {}),
    status: brief.status ?? 'draft',
    source: brief.source ?? 'manual',
    metadata: brief.metadata ? JSON.stringify(brief.metadata) : null,
    createdAt: brief.createdAt ?? now,
    updatedAt: now
  };

  db.prepare(UPSERT_BRIEF).run(payload);

  return getBrief(id);
}

export async function listBriefsByProject(projectId) {
  const db = await getDb();
  const rows = db.prepare(LIST_BRIEFS_BY_PROJECT).all(projectId);

  return rows.map(normalizeBriefRow);
}

export async function getBrief(id) {
  const db = await getDb();
  const row = db.prepare(GET_BRIEF).get(id);

  return row ? normalizeBriefRow(row) : null;
}

function normalizeBriefRow(row) {
  return {
    ...row,
    content: parseJson(row.content),
    metadata: parseJson(row.metadata)
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
