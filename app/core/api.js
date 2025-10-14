import { runPipeline, runDemoPipeline } from './orchestrator.js';
import { ipcMain } from 'electron';
import { loadAgents } from './pluginLoader.js';
import Database from 'better-sqlite3';
import { getDatabaseFilePath } from '../db/migrate.js';
import { randomUUID } from 'node:crypto';

const agentConfigs = new Map();
const pipelines = new Map();

const defaultAgentConfigs = [
  {
    id: 'WriterAgent',
    name: 'WriterAgent',
    type: 'writer',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Template-driven writer',
    engine: {
      provider: 'mock',
      model: 'template'
    },
    params: {
      outputs: ['title', 'caption', 'description'],
      summaryTemplate: 'Generated draft for {{project.name}} about {{topic}}'
    },
    templates: {
      title: '{{project.name}} — {{topic}}',
      caption: '{{tone}} {{message}}',
      description: '{{outline}}',
      summary: 'Prepared placeholders for {{project.name}}'
    }
  },
  {
    id: 'UploaderAgent',
    name: 'UploaderAgent',
    type: 'uploader',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Simulated uploader',
    params: {
      defaultStatus: 'simulation',
      destinations: [
        {
          id: 'primary',
          pathTemplate: 'uploads/{{destination.id}}.txt',
          templateKey: 'primaryDocument'
        }
      ]
    },
    templates: {
      primaryDocument:
        'Project: {{project.name}}\nTopic: {{topic}}\nTitle: {{writer.outputs.title}}\nCaption: {{writer.outputs.caption}}',
      status: 'Artifacts generated: {{uploaded.length}}',
      summary: 'Artifacts generated: {{uploaded.length}}'
    }
  },
  {
    id: 'StyleGuard',
    name: 'StyleGuard',
    type: 'guard',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Rule-based guard',
    params: {
      rules: [
        {
          id: 'no-medical',
          path: 'writer.outputs.caption',
          disallow: ['medicine', 'pill'],
          reasonKey: 'disallow'
        }
      ],
      failTemplate: 'Style issues detected'
    },
    templates: {
      disallow: 'Disallowed word: {{matchedToken}}',
      pass: 'Style requirements satisfied',
      fail: 'Style requirements not satisfied'
    }
  },
  {
    id: 'HumanGate',
    name: 'HumanGate',
    type: 'human',
    version: '0.1.0',
    source: 'auto',
    instructions: 'Approval gate',
    params: {
      autoApprove: true,
      statusTemplate: 'Status: {{autoApprove}}'
    },
    templates: {
      approved: 'Approved automatically',
      pending: 'Waiting for human approval',
      status: 'Status: {{autoApprove}}'
    }
  }
];

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function ensureDefaultAgentConfigs() {
  defaultAgentConfigs.forEach((config) => {
    if (!agentConfigs.has(config.id)) {
      agentConfigs.set(config.id, cloneConfig(config));
    }
  });
}

ensureDefaultAgentConfigs();

function storeAgentConfig(agent) {
  const id = agent.id || agent.name;

  if (!id) {
    throw new Error('Agent config must include id or name');
  }

  const cloned = cloneConfig({ ...agent, id });
  agentConfigs.set(id, cloned);

  return agentConfigs.get(id);
}

function buildAgentList(pluginRegistry) {
  const staticAgents = pluginRegistry.listAgents();
  const configuredAgents = Array.from(agentConfigs.values()).map((agent) => ({
    id: agent.id,
    name: agent.name,
    type: agent.type ?? 'custom',
    version: agent.version ?? '0.0.1',
    description: agent.description ?? '',
    source: agent.source ?? 'manual'
  }));

  return {
    plugins: staticAgents,
    configs: configuredAgents
  };
}

export function getAgentConfigSnapshot() {
  ensureDefaultAgentConfigs();

  return Array.from(agentConfigs.values()).map((agent) => cloneConfig(agent));
}

export function registerIpcHandlers({ ipcMain, pluginRegistry, providerManager }) {
  if (!ipcMain) {
    throw new Error('ipcMain instance is required');
  }

  if (!pluginRegistry) {
    throw new Error('pluginRegistry instance is required');
  }

  if (!providerManager) {
    throw new Error('providerManager instance is required');
  }

  ensureDefaultAgentConfigs();

  ipcMain.handle('AgentFlow:agents:list', async () => {
    try {
      const agents = await loadAgents();
      // return only JSON-serializable data (no functions)
      return { ok: true, agents: agents.map((a) => ({ id: a.id, manifest: a.manifest })) };
    } catch (err) {
      // return serializable error info
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('AgentFlow:agents:upsert', async (_event, agentConfig) => {
    const stored = storeAgentConfig(agentConfig);

    return {
      ok: true,
      agent: stored
    };
  });

  ipcMain.handle('AgentFlow:providers:status', async () => {
    return providerManager.getProviderStatus();
  });

  ipcMain.handle('AgentFlow:pipeline:runSimple', async (_event, input) => {
    const result = await runDemoPipeline(pluginRegistry, input, {
      providerManager,
      agentConfigs
    });

    return {
      ok: true,
      result
    };
  });

  ipcMain.handle('AgentFlow:pipeline:run', async (_event, pipelineDefinition, inputPayload) => {
    const result = await runPipeline(pipelineDefinition, inputPayload, {
      pluginRegistry,
      agentConfigs,
      providerManager
    });

    return {
      ok: true,
      result
    };
  });

  ipcMain.handle('AgentFlow:pipeline:upsert', async (_event, pipelineDefinition) => {
    const id = pipelineDefinition.id || pipelineDefinition.name || `pipeline-${pipelines.size + 1}`;
    const stored = {
      ...pipelineDefinition,
      id
    };

    pipelines.set(id, stored);

    return {
      ok: true,
      pipeline: stored
    };
  });

  ipcMain.handle('AgentFlow:pipeline:list', async () => {
    return Array.from(pipelines.values());
  });

  /* Register simple IPC handlers for core operations */
  ipcMain.handle('core:listAgents', async () => {
    const agents = await loadAgents();
    return agents.map((a) => ({ id: a.id, manifest: a.manifest }));
  });

  ipcMain.handle('core:runPipelineSimple', async (evt, pipeline) => {
    const agents = await loadAgents();
    const agentMap = new Map(agents.map((a) => [a.manifest.name || a.id, a.execute]));
    const nodes = (pipeline.nodes || []).map((n) => {
      const exec = agentMap.get(n.agentName) || agentMap.get(n.agent) || null;
      return { ...n, _execute: exec };
    });
    const prepared = { ...pipeline, nodes };
    const res = await runPipeline(prepared, pipeline.input || {});
    return res;
  });

  ipcMain.handle('core:upsertAgent', async (evt, agentConfig) => {
    // placeholder persistence
    return { ok: true };
  });

  // --- New: diff:entity handler ------------------------------------------------
  function openDb() {
    const dbFile = getDatabaseFilePath();
    return new Database(dbFile, { readonly: true });
  }

  function parseMaybeJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }

  function jsonDiff(a, b) {
    // recursive shallow+deep diff: returns object of changed keys
    if (a === b) return {};
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      return { from: a, to: b };
    }
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    const result = {};
    for (const k of keys) {
      const va = a ? a[k] : undefined;
      const vb = b ? b[k] : undefined;
      if (typeof va === 'object' && va !== null && typeof vb === 'object' && vb !== null) {
        const sub = jsonDiff(va, vb);
        if (Object.keys(sub).length > 0) result[k] = sub;
      } else if (va !== vb) {
        result[k] = { from: va === undefined ? null : va, to: vb === undefined ? null : vb };
      }
    }
    return result;
  }

  async function getSnapshot(type, ref, options = {}) {
    // ref can be:
    //  - numeric history id (string or number) -> read from *History table by id
    //  - 'current:<entityId>' -> read from main table by id
    //  - 'version:<version>:<entityId>' -> find latest history row with matching version and entityId
    // options.entityId may be provided for convenience
    const db = openDb();
    try {
      // numeric id -> history
      if (!ref && options.entityId) ref = `current:${options.entityId}`;
      if (String(ref).match(/^\d+$/)) {
        const hid = Number(ref);
        if (type === 'agent') {
          const row = db.prepare('SELECT data FROM AgentsHistory WHERE id = ?').get(hid);
          return row ? parseMaybeJson(row.data) : null;
        } else if (type === 'pipeline') {
          const row = db.prepare('SELECT data FROM PipelinesHistory WHERE id = ?').get(hid);
          return row ? parseMaybeJson(row.data) : null;
        }
      }

      if (typeof ref === 'string') {
        if (ref.startsWith('current:')) {
          const entityId = ref.split(':')[1];
          if (!entityId) return null;
          if (type === 'agent') {
            const row = db.prepare('SELECT id, projectId, name, type, version, source, config, createdAt, updatedAt FROM Agents WHERE id = ?').get(entityId);
            if (!row) return null;
            // parse config JSON if present
            const parsed = { ...row, config: parseMaybeJson(row.config) ?? row.config };
            return parsed;
          } else if (type === 'pipeline') {
            const row = db.prepare('SELECT id, projectId, name, version, definition, createdAt, updatedAt FROM Pipelines WHERE id = ?').get(entityId);
            if (!row) return null;
            return { ...row, definition: parseMaybeJson(row.definition) ?? row.definition };
          }
        }

        if (ref.startsWith('version:')) {
          // format: version:<version>:<entityId>
          const parts = ref.split(':');
          const ver = parts[1];
          const entityId = parts[2];
          if (type === 'agent') {
            const row = db.prepare('SELECT data FROM AgentsHistory WHERE entityId = ? AND version = ? ORDER BY createdAt DESC LIMIT 1').get(entityId, ver);
            return row ? parseMaybeJson(row.data) : null;
          } else if (type === 'pipeline') {
            const row = db.prepare('SELECT data FROM PipelinesHistory WHERE entityId = ? AND version = ? ORDER BY createdAt DESC LIMIT 1').get(entityId, ver);
            return row ? parseMaybeJson(row.data) : null;
          }
        }
      }

      return null;
    } finally {
      db.close();
    }
  }

  ipcMain.handle('diff:entity', async (evt, params = {}) => {
    // params: { type: 'agent'|'pipeline', idA, idB, entityId? }
    const { type, idA, idB, entityId } = params || {};
    if (!type || (!idA && !idB)) throw new Error('invalid-params');

    const a = await getSnapshot(type, idA, { entityId });
    const b = await getSnapshot(type, idB, { entityId });

    // return { a,b,diff }
    const diff = jsonDiff(a || {}, b || {});
    return { a, b, diff };
  });

  // Schedules IPC handlers
  ipcMain.handle('schedules:list', async () => {
    const db = new Database(getDatabaseFilePath(), { readonly: true });
    try {
      const rows = db.prepare('SELECT * FROM Schedules ORDER BY createdAt DESC').all();
      return { ok: true, schedules: rows };
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally {
      db.close();
    }
  });

  ipcMain.handle('schedules:add', async (evt, payload = {}) => {
    const id = randomUUID();
    const db = new Database(getDatabaseFilePath());
    try {
      db.prepare('INSERT INTO Schedules (id, projectId, pipelineId, cron, enabled, metadata, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        .run(id, payload.projectId || null, payload.pipelineId || null, payload.cron || '0 0 * * *', payload.enabled ? 1 : 0, payload.metadata ? JSON.stringify(payload.metadata) : null);
      // reload scheduler if present
      try { global.scheduler && global.scheduler.reload && await global.scheduler.reload(); } catch {}
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally {
      db.close();
    }
  });

  ipcMain.handle('schedules:remove', async (evt, id) => {
    const db = new Database(getDatabaseFilePath());
    try {
      db.prepare('DELETE FROM Schedules WHERE id = ?').run(id);
      try { global.scheduler && global.scheduler.reload && await global.scheduler.reload(); } catch {}
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally {
      db.close();
    }
  });

  ipcMain.handle('schedules:toggle', async (evt, { id, enabled }) => {
    const db = new Database(getDatabaseFilePath());
    try {
      db.prepare('UPDATE Schedules SET enabled = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(enabled ? 1 : 0, id);
      try { global.scheduler && global.scheduler.reload && await global.scheduler.reload(); } catch {}
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally {
      db.close();
    }
  });
}
