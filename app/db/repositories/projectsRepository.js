import { randomUUID } from 'node:crypto';
import { getDb } from '../client.js';

const UPSERT_PROJECT = `
  INSERT INTO Projects (id, name, description, status, metadata, createdAt, updatedAt)
  VALUES (@id, @name, @description, @status, @metadata, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    metadata = excluded.metadata,
    updatedAt = excluded.updatedAt
`;

const LIST_PROJECTS = `
  SELECT id, name, description, status, metadata, createdAt, updatedAt
  FROM Projects
  ORDER BY createdAt DESC
`;

const GET_PROJECT = `
  SELECT id, name, description, status, metadata, createdAt, updatedAt
  FROM Projects
  WHERE id = ?
`;

export async function upsertProject(project) {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = project.id || randomUUID();

  const payload = {
    id,
    name: project.name,
    description: project.description ?? null,
    status: project.status ?? 'active',
    metadata: project.metadata ? JSON.stringify(project.metadata) : null,
    createdAt: project.createdAt ?? now,
    updatedAt: now
  };

  db.prepare(UPSERT_PROJECT).run(payload);

  return getProject(id);
}

export async function listProjects() {
  const db = await getDb();
  const rows = db.prepare(LIST_PROJECTS).all();

  return rows.map(normalizeProjectRow);
}

export async function getProject(id) {
  const db = await getDb();
  const row = db.prepare(GET_PROJECT).get(id);

  return row ? normalizeProjectRow(row) : null;
}

function normalizeProjectRow(row) {
  return {
    ...row,
    metadata: parseMetadata(row.metadata)
  };
}

function parseMetadata(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
