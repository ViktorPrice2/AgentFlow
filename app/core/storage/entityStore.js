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

function serializeJson(value) {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return null;
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
  const source = row.source || payload.source || 'custom';
  const originPresetVersion = row.originPresetVersion || payload.originPresetVersion || null;

  const normalizedPayload = {
    ...payload,
    id: row.id,
    name,
    type,
    version,
    source,
    originPresetVersion
  };

  return {
    id: row.id,
    projectId: row.projectId || payload.projectId || null,
    name,
    type,
    version,
    description,
    source,
    originPresetVersion,
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
  const source = row.source || payload.source || 'custom';
  const originPresetVersion = row.originPresetVersion || payload.originPresetVersion || null;

  const normalizedPayload = {
    ...payload,
    id: row.id,
    name,
    projectId: row.projectId || payload.projectId || null,
    version,
    source,
    originPresetVersion
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
    source,
    originPresetVersion,
    createdAt: row.createdAt || payload.createdAt || null,
    updatedAt: row.updatedAt || payload.updatedAt || null,
    payload: normalizedPayload
  };
}

function buildRunRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.projectId,
    pipelineId: row.pipelineId || null,
    status: row.status || null,
    input: safeParse(row.input, null),
    output: safeParse(row.output, null),
    createdAt: row.createdAt || null,
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null
  };
}

function normalizeChannelList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }

        if (item && typeof item === 'object' && typeof item.id === 'string') {
          return item.id.trim();
        }

        return null;
      })
      .filter((item) => item && item.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return normalizeChannelList(parsed);
    } catch {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }

  return [];
}

function normalizeJsonValue(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (Array.isArray(value) || isPlainObject(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function clampProgress(value, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric < 0) {
    return 0;
  }

  if (numeric > 1) {
    return 1;
  }

  return numeric;
}

function buildProjectRecord(row) {
  if (!row) {
    return null;
  }

  const status = row.status || 'draft';
  const briefStatus = row.briefStatus || 'pending';
  const briefProgress = clampProgress(row.briefProgress, 0);
  const channels = normalizeChannelList(row.channels);
  const needsAttention = normalizeJsonValue(row.needsAttention, {});
  const presetDraft = normalizeJsonValue(row.presetDraft, {});

  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    status,
    briefStatus,
    briefProgress,
    briefVersion: row.briefVersion || null,
    needsAttention,
    tgLinkBase: row.tgLinkBase || null,
    tgLastInvitation: row.tgLastInvitation || null,
    tgContactStatus: row.tgContactStatus || null,
    industry: row.industry || null,
    channels,
    presetId: row.presetId || null,
    presetVersion: row.presetVersion || null,
    presetDraft,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  };
}

function normalizeArtifacts(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function buildReportRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.projectId,
    pipelineId: row.pipelineId || null,
    status: row.status || row.state || 'pending',
    title: row.title || null,
    summary: row.summary || row.content || null,
    content: row.content || null,
    artifacts: normalizeArtifacts(row.artifacts),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  };
}

function buildTelegramContactRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    chatId: row.chatId,
    label: row.label || null,
    status: row.status || 'unknown',
    lastContactAt: row.lastContactAt || null,
    projectId: row.projectId || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
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

  function listProjects() {
    const db = openDatabase(dbPath);

    try {
      const rows = db
        .prepare(
          `SELECT id, name, description, status, briefStatus, briefProgress, briefVersion,
                  needsAttention, tgLinkBase, tgLastInvitation, tgContactStatus, industry,
                  channels, presetId, presetVersion, presetDraft, createdAt, updatedAt
             FROM Projects
            ORDER BY datetime(COALESCE(updatedAt, createdAt)) DESC`
        )
        .all();

      return rows.map((row) => buildProjectRecord(row));
    } finally {
      db.close();
    }
  }

  function getProjectById(id) {
    if (!id) {
      throw new Error('Project id is required');
    }

    const db = openDatabase(dbPath);

    try {
      const row = db
        .prepare(
          `SELECT id, name, description, status, briefStatus, briefProgress, briefVersion,
                  needsAttention, tgLinkBase, tgLastInvitation, tgContactStatus, industry,
                  channels, presetId, presetVersion, presetDraft, createdAt, updatedAt
             FROM Projects
            WHERE id = ?`
        )
        .get(id);

      return buildProjectRecord(row);
    } finally {
      db.close();
    }
  }

  function saveProject(project) {
    if (!project) {
      throw new Error('Project payload is required');
    }

    const db = openDatabase(dbPath);
    const now = new Date().toISOString();

    try {
      const existingRaw = project.id
        ? db
            .prepare(
              `SELECT id, name, description, status, briefStatus, briefProgress, briefVersion,
                      needsAttention, tgLinkBase, tgLastInvitation, tgContactStatus, industry,
                      channels, presetId, presetVersion, presetDraft, createdAt, updatedAt
                 FROM Projects
                WHERE id = ?`
            )
            .get(project.id)
        : null;

      const existing = existingRaw ? buildProjectRecord(existingRaw) : null;
      const id = project.id || existing?.id || randomUUID();
      const resolvedName = project.name ?? existing?.name;

      if (!resolvedName || !String(resolvedName).trim()) {
        throw new Error('Project name is required');
      }

      const name = String(resolvedName).trim();

      const description =
        project.description === undefined ? existing?.description ?? null : project.description;
      const status = project.status ?? existing?.status ?? 'draft';
      const briefStatus = project.briefStatus ?? existing?.briefStatus ?? 'pending';
      const briefProgress = clampProgress(
        project.briefProgress ?? existing?.briefProgress ?? 0,
        existing?.briefProgress ?? 0
      );
      const briefVersion =
        project.briefVersion === undefined
          ? existing?.briefVersion ?? null
          : project.briefVersion === null || project.briefVersion === ''
          ? null
          : String(project.briefVersion);

      const channelsInput =
        project.channels === undefined ? existing?.channels ?? [] : project.channels ?? [];
      const channels = normalizeChannelList(channelsInput);

      const needsAttentionInput =
        project.needsAttention === undefined ? existing?.needsAttention ?? {} : project.needsAttention ?? {};
      const needsAttention = normalizeJsonValue(needsAttentionInput, {});

      const presetDraftInput =
        project.presetDraft === undefined ? existing?.presetDraft ?? {} : project.presetDraft ?? {};
      const presetDraft = normalizeJsonValue(presetDraftInput, {});

      const tgLinkBase =
        project.tgLinkBase === undefined
          ? existing?.tgLinkBase ?? null
          : project.tgLinkBase === null || project.tgLinkBase === ''
          ? null
          : String(project.tgLinkBase).trim();
      const tgLastInvitation =
        project.tgLastInvitation === undefined
          ? existing?.tgLastInvitation ?? null
          : project.tgLastInvitation === null || project.tgLastInvitation === ''
          ? null
          : String(project.tgLastInvitation).trim();
      const tgContactStatus =
        project.tgContactStatus === undefined
          ? existing?.tgContactStatus ?? null
          : project.tgContactStatus === null || project.tgContactStatus === ''
          ? null
          : String(project.tgContactStatus).trim();

      const industry =
        project.industry === undefined
          ? existing?.industry ?? null
          : project.industry === null || project.industry === ''
          ? null
          : String(project.industry).trim();
      const presetId =
        project.presetId === undefined
          ? existing?.presetId ?? null
          : project.presetId === null || project.presetId === ''
          ? null
          : String(project.presetId);
      const presetVersion =
        project.presetVersion === undefined
          ? existing?.presetVersion ?? null
          : project.presetVersion === null || project.presetVersion === ''
          ? null
          : String(project.presetVersion);

      const createdAt = existing?.createdAt || now;
      const updatedAt = now;

      const serializedNeedsAttention = JSON.stringify(needsAttention ?? {});
      const serializedChannels = JSON.stringify(channels);
      const serializedPresetDraft = JSON.stringify(presetDraft ?? {});

      if (existing) {
        db.prepare(
          `UPDATE Projects
              SET name = ?, description = ?, status = ?, briefStatus = ?, briefProgress = ?, briefVersion = ?,
                  needsAttention = ?, tgLinkBase = ?, tgLastInvitation = ?, tgContactStatus = ?, industry = ?,
                  channels = ?, presetId = ?, presetVersion = ?, presetDraft = ?, updatedAt = ?
            WHERE id = ?`
        ).run(
          name,
          description,
          status,
          briefStatus,
          briefProgress,
          briefVersion,
          serializedNeedsAttention,
          tgLinkBase,
          tgLastInvitation,
          tgContactStatus,
          industry,
          serializedChannels,
          presetId,
          presetVersion,
          serializedPresetDraft,
          updatedAt,
          id
        );
      } else {
        db.prepare(
          `INSERT INTO Projects (
              id, name, description, status, briefStatus, briefProgress, briefVersion,
              needsAttention, tgLinkBase, tgLastInvitation, tgContactStatus, industry,
              channels, presetId, presetVersion, presetDraft, createdAt, updatedAt
            )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          name,
          description,
          status,
          briefStatus,
          briefProgress,
          briefVersion,
          serializedNeedsAttention,
          tgLinkBase,
          tgLastInvitation,
          tgContactStatus,
          industry,
          serializedChannels,
          presetId,
          presetVersion,
          serializedPresetDraft,
          createdAt,
          updatedAt
        );
      }

      return getProjectById(id);
    } finally {
      db.close();
    }
  }

  function deleteProject(id) {
    if (!id) {
      throw new Error('Project id is required');
    }

    const db = openDatabase(dbPath);

    try {
      db.prepare('DELETE FROM Projects WHERE id = ?').run(id);
    } finally {
      db.close();
    }
  }

  function listReports(filter = {}) {
    const db = openDatabase(dbPath);

    try {
      let query =
        `SELECT id, projectId, pipelineId, status, title, summary, content, artifacts, createdAt, updatedAt
           FROM Reports`;
      const conditions = [];
      const params = [];

      if (filter.projectId) {
        conditions.push('projectId = ?');
        params.push(filter.projectId);
      }

      if (filter.status) {
        conditions.push('status = ?');
        params.push(filter.status);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY datetime(COALESCE(updatedAt, createdAt)) DESC';

      const rows = db.prepare(query).all(...params);
      return rows.map((row) => buildReportRecord(row));
    } finally {
      db.close();
    }
  }

  function getReportById(id) {
    if (!id) {
      throw new Error('Report id is required');
    }

    const db = openDatabase(dbPath);

    try {
      const row = db
        .prepare(
          `SELECT id, projectId, pipelineId, status, title, summary, content, artifacts, createdAt, updatedAt
             FROM Reports
            WHERE id = ?`
        )
        .get(id);

      return buildReportRecord(row);
    } finally {
      db.close();
    }
  }

  function saveReport(report) {
    if (!report?.projectId) {
      throw new Error('Report must include projectId');
    }

    const db = openDatabase(dbPath);
    const now = new Date().toISOString();

    try {
      const existing = report.id
        ? db
            .prepare(
              `SELECT id, projectId, pipelineId, status, title, summary, content, artifacts, createdAt, updatedAt
                 FROM Reports
                WHERE id = ?`
            )
            .get(report.id)
        : null;

      const id = existing?.id || report.id || randomUUID();
      const projectId = report.projectId ?? existing?.projectId;

      if (!projectId) {
        throw new Error('Report projectId cannot be null');
      }

      const pipelineId = report.pipelineId ?? existing?.pipelineId ?? null;
      const status = report.status ?? existing?.status ?? 'pending';
      const title = report.title ?? existing?.title ?? null;
      const summary = report.summary ?? existing?.summary ?? null;
      const content = report.content ?? existing?.content ?? null;
      const artifacts = normalizeArtifacts(report.artifacts ?? existing?.artifacts ?? []);
      const artifactsJson = JSON.stringify(artifacts);
      const createdAt = existing?.createdAt || now;
      const updatedAt = now;

      if (existing) {
        db.prepare(
          `UPDATE Reports
              SET projectId = ?, pipelineId = ?, status = ?, title = ?, summary = ?, content = ?, artifacts = ?, updatedAt = ?
            WHERE id = ?`
        ).run(projectId, pipelineId, status, title, summary, content, artifactsJson, updatedAt, id);
      } else {
        db.prepare(
          `INSERT INTO Reports (id, projectId, pipelineId, status, title, summary, content, artifacts, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, projectId, pipelineId, status, title, summary, content, artifactsJson, createdAt, updatedAt);
      }

      return getReportById(id);
    } finally {
      db.close();
    }
  }

  function deleteReport(id) {
    if (!id) {
      throw new Error('Report id is required');
    }

    const db = openDatabase(dbPath);

    try {
      db.prepare('DELETE FROM Reports WHERE id = ?').run(id);
    } finally {
      db.close();
    }
  }

  function listTelegramContacts(filter = {}) {
    const db = openDatabase(dbPath);

    try {
      let query =
        `SELECT id, chatId, label, status, lastContactAt, projectId, createdAt, updatedAt
           FROM TelegramContacts`;
      const params = [];
      const conditions = [];

      if (filter.projectId) {
        conditions.push('(projectId = ? OR projectId IS NULL)');
        params.push(filter.projectId);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY datetime(COALESCE(updatedAt, createdAt)) DESC';

      const rows = db.prepare(query).all(...params);
      return rows.map((row) => buildTelegramContactRecord(row));
    } finally {
      db.close();
    }
  }

  function getTelegramContactById(id) {
    if (!id) {
      throw new Error('Telegram contact id is required');
    }

    const db = openDatabase(dbPath);

    try {
      const row = db
        .prepare(
          `SELECT id, chatId, label, status, lastContactAt, projectId, createdAt, updatedAt
             FROM TelegramContacts
            WHERE id = ?`
        )
        .get(id);

      return buildTelegramContactRecord(row);
    } finally {
      db.close();
    }
  }

  function getTelegramContactByChatId(chatId) {
    if (chatId === undefined || chatId === null || chatId === '') {
      throw new Error('Telegram contact chatId is required');
    }

    const db = openDatabase(dbPath);

    try {
      const row = db
        .prepare(
          `SELECT id, chatId, label, status, lastContactAt, projectId, createdAt, updatedAt
             FROM TelegramContacts
            WHERE chatId = ?`
        )
        .get(chatId);

      return buildTelegramContactRecord(row);
    } finally {
      db.close();
    }
  }

  function saveTelegramContact(contact) {
    if (!contact?.chatId) {
      throw new Error('Telegram contact must include chatId');
    }

    const db = openDatabase(dbPath);
    const now = new Date().toISOString();

    try {
      const existing = contact.id
        ? db
            .prepare(
              `SELECT id, chatId, label, status, lastContactAt, projectId, createdAt, updatedAt
                 FROM TelegramContacts
                WHERE id = ?`
            )
            .get(contact.id)
        : db
            .prepare(
              `SELECT id, chatId, label, status, lastContactAt, projectId, createdAt, updatedAt
                 FROM TelegramContacts
                WHERE chatId = ?`
            )
            .get(contact.chatId);

      const id = existing?.id || contact.id || randomUUID();
      const chatId = contact.chatId || existing?.chatId;

      if (!chatId) {
        throw new Error('Telegram contact chatId cannot be null');
      }

      const projectId =
        contact.projectId === undefined ? existing?.projectId ?? null : contact.projectId || null;
      const label =
        contact.label === undefined ? existing?.label ?? null : contact.label === null ? null : String(contact.label).trim();
      const status =
        contact.status === undefined
          ? existing?.status ?? 'unknown'
          : contact.status === null || contact.status === ''
          ? 'unknown'
          : String(contact.status).trim();
      const lastContactAt =
        contact.lastContactAt === undefined
          ? existing?.lastContactAt ?? null
          : contact.lastContactAt === null || contact.lastContactAt === ''
          ? null
          : String(contact.lastContactAt).trim();

      const createdAt = existing?.createdAt || now;
      const updatedAt = now;

      if (existing) {
        db.prepare(
          `UPDATE TelegramContacts
              SET chatId = ?, label = ?, status = ?, lastContactAt = ?, projectId = ?, updatedAt = ?
            WHERE id = ?`
        ).run(chatId, label, status, lastContactAt, projectId, updatedAt, id);
      } else {
        db.prepare(
          `INSERT INTO TelegramContacts (id, chatId, label, status, lastContactAt, projectId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, chatId, label, status, lastContactAt, projectId, createdAt, updatedAt);
      }

      return getTelegramContactById(id);
    } finally {
      db.close();
    }
  }

  function deleteTelegramContact(id) {
    if (!id) {
      throw new Error('Telegram contact id is required');
    }

    const db = openDatabase(dbPath);

    try {
      db.prepare('DELETE FROM TelegramContacts WHERE id = ?').run(id);
    } finally {
      db.close();
    }
  }

  function listAgentRecords(filter = {}) {
    const db = openDatabase(dbPath);

    try {
      let query =
        `SELECT id, projectId, name, type, config, version, source, originPresetVersion, createdAt, updatedAt
           FROM Agents`;
      const params = [];
      const conditions = [];

      if (filter.projectId) {
        conditions.push('projectId = ?');
        params.push(filter.projectId);
      }

      if (filter.source) {
        conditions.push('source = ?');
        params.push(filter.source);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY datetime(COALESCE(updatedAt, createdAt)) DESC';

      const rows = db.prepare(query).all(...params);

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
          `SELECT id, projectId, name, type, config, version, source, originPresetVersion, createdAt, updatedAt
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
        .prepare('SELECT id, projectId, version, createdAt, source, originPresetVersion FROM Agents WHERE id = ?')
        .get(id);

      const projectId = agent.projectId ?? existing?.projectId ?? null;
      const name = agent.name || id;
      const type = agent.type || null;
      const previousVersion = existing?.version || 0;
      const nextVersion = previousVersion + 1;
      const createdAt = existing?.createdAt || now;
      const source = agent.source ?? existing?.source ?? 'custom';
      const originPresetVersion = agent.originPresetVersion ?? existing?.originPresetVersion ?? null;
      const payload = {
        ...agent,
        id,
        name,
        type,
        projectId,
        version: nextVersion,
        source,
        originPresetVersion
      };
      const serializedConfig = stringifyPayload(payload);

      if (existing) {
        db.prepare(
          `UPDATE Agents
             SET projectId = ?, name = ?, type = ?, config = ?, version = ?, source = ?, originPresetVersion = ?, updatedAt = ?
           WHERE id = ?`
        ).run(projectId, name, type, serializedConfig, nextVersion, source, originPresetVersion, now, id);
      } else {
        db.prepare(
          `INSERT INTO Agents (id, projectId, name, type, config, version, source, originPresetVersion, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          projectId,
          name,
          type,
          serializedConfig,
          nextVersion,
          source,
          originPresetVersion,
          createdAt,
          now
        );
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
        source,
        originPresetVersion,
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

  function listPipelines(filter = {}) {
    const db = openDatabase(dbPath);

    try {
      let query =
        `SELECT id, projectId, name, definition, version, source, originPresetVersion, createdAt, updatedAt
           FROM Pipelines`;
      const params = [];
      const conditions = [];

      if (filter.projectId) {
        conditions.push('projectId = ?');
        params.push(filter.projectId);
      }

      if (filter.source) {
        conditions.push('source = ?');
        params.push(filter.source);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY datetime(COALESCE(updatedAt, createdAt)) DESC';

      const rows = db.prepare(query).all(...params);

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
          `SELECT id, projectId, name, definition, version, source, originPresetVersion, createdAt, updatedAt
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
        .prepare('SELECT id, projectId, version, createdAt, source, originPresetVersion FROM Pipelines WHERE id = ?')
        .get(id);

      const projectId = pipeline.projectId ?? existing?.projectId ?? null;
      const name = pipeline.name || id;
      const previousVersion = existing?.version || 0;
      const nextVersion = previousVersion + 1;
      const createdAt = existing?.createdAt || now;
      const source = pipeline.source ?? existing?.source ?? 'custom';
      const originPresetVersion = pipeline.originPresetVersion ?? existing?.originPresetVersion ?? null;
      const payload = {
        ...pipeline,
        id,
        name,
        projectId,
        version: nextVersion,
        source,
        originPresetVersion
      };
      const serializedDefinition = stringifyPayload(payload);

      if (existing) {
        db.prepare(
          `UPDATE Pipelines
             SET projectId = ?, name = ?, definition = ?, version = ?, source = ?, originPresetVersion = ?, updatedAt = ?
           WHERE id = ?`
        ).run(projectId, name, serializedDefinition, nextVersion, source, originPresetVersion, now, id);
      } else {
        db.prepare(
          `INSERT INTO Pipelines (id, projectId, name, definition, version, source, originPresetVersion, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          projectId,
          name,
          serializedDefinition,
          nextVersion,
          source,
          originPresetVersion,
          createdAt,
          now
        );
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
        source,
        originPresetVersion,
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

  function saveRun(run) {
    if (!run) {
      throw new Error('Run payload is required');
    }

    if (!run.projectId) {
      throw new Error('Run must include a projectId');
    }

    const db = openDatabase(dbPath);
    const now = new Date().toISOString();

    try {
      const id = run.id || randomUUID();
      const existing = db.prepare('SELECT id, createdAt FROM Runs WHERE id = ?').get(id);

      const createdAt = run.createdAt || existing?.createdAt || now;
      const startedAt = run.startedAt || null;
      const finishedAt = run.finishedAt || null;
      const pipelineId = run.pipelineId || null;
      const status = run.status || null;
      const inputJson = serializeJson(run.input);
      const outputJson = serializeJson(run.output);

      if (existing) {
        db.prepare(
          `UPDATE Runs
              SET projectId = ?, pipelineId = ?, status = ?, input = ?, output = ?,
                  createdAt = ?, startedAt = ?, finishedAt = ?
            WHERE id = ?`
        ).run(run.projectId, pipelineId, status, inputJson, outputJson, createdAt, startedAt, finishedAt, id);
      } else {
        db.prepare(
          `INSERT INTO Runs (id, projectId, pipelineId, status, input, output, createdAt, startedAt, finishedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, run.projectId, pipelineId, status, inputJson, outputJson, createdAt, startedAt, finishedAt);
      }

      return getRunById(id);
    } finally {
      db.close();
    }
  }

  function getRunById(id) {
    if (!id) {
      throw new Error('Run id is required');
    }

    const db = openDatabase(dbPath);

    try {
      const row = db
        .prepare(
          `SELECT id, projectId, pipelineId, status, input, output, createdAt, startedAt, finishedAt
             FROM Runs
            WHERE id = ?`
        )
        .get(id);

      return buildRunRecord(row);
    } finally {
      db.close();
    }
  }

  function listRuns(filter = {}) {
    const db = openDatabase(dbPath);

    try {
      const conditions = [];
      const params = [];

      if (filter.projectId) {
        conditions.push('projectId = ?');
        params.push(filter.projectId);
      }

      if (filter.pipelineId) {
        conditions.push('pipelineId = ?');
        params.push(filter.pipelineId);
      }

      let query =
        `SELECT id, projectId, pipelineId, status, input, output, createdAt, startedAt, finishedAt
           FROM Runs`;

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY datetime(COALESCE(finishedAt, startedAt, createdAt)) DESC';

      const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : 50;

      if (limit > 0) {
        query += ' LIMIT ?';
        params.push(limit);
      }

      const rows = db.prepare(query).all(...params);

      return rows.map((row) => buildRunRecord(row));
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
    listProjects,
    getProjectById,
    saveProject,
    deleteProject,
    listReports,
    getReportById,
    saveReport,
    deleteReport,
    listTelegramContacts,
    getTelegramContactById,
    getTelegramContactByChatId,
    saveTelegramContact,
    deleteTelegramContact,
    listAgentRecords,
    getAgentById,
    saveAgent,
    deleteAgent,
    listPipelines,
    getPipelineById,
    savePipeline,
    deletePipeline,
    saveRun,
    getRunById,
    listRuns,
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
