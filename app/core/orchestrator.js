import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadAgents } from './pluginLoader.js'; // added to support demo pipeline

/* Orchestrator: simple linear/graph runner */
const DATA_DIR = path.join(process.cwd(), 'data');
const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

async function ensureDirs() {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
}

function now() { return new Date().toISOString(); }

async function appendLog(runId, entry) {
  const file = path.join(LOGS_DIR, `run_${runId}.jsonl`);
  const line = JSON.stringify({ ts: now(), ...entry }) + '\n';
  await fs.appendFile(file, line, 'utf8');
}

async function writeArtifact(runId, relPath, data) {
  const dir = path.join(ARTIFACTS_DIR, runId);
  await fs.mkdir(dir, { recursive: true });
  const safeRel = relPath.replace(/[^a-zA-Z0-9_\-./]/g, '_');
  const full = path.join(dir, safeRel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  if (Buffer.isBuffer(data)) {
    await fs.writeFile(full, data);
  } else if (typeof data === 'object') {
    await fs.writeFile(full, JSON.stringify(data, null, 2), 'utf8');
  } else {
    await fs.writeFile(full, String(data), 'utf8');
  }
  return full;
}

/* runPipeline(pipeline, input, options)
   pipeline: { nodes: [{id, agentName, kind, retries?, onError? , override? }], edges?: [...] }
*/
export async function runPipeline(pipeline, input = {}, ctxOverrides = {}) {
  await ensureDirs();
  const runId = ctxOverrides.runId || randomUUID();
  const ctx = {
    runId,
    env: process.env,
    _artifacts: [],
    log: async (event, data) => appendLog(runId, { event, data }),
    setArtifact: async (relPath, data) => {
      const p = await writeArtifact(runId, relPath, data);
      ctx._artifacts.push(p);
      await appendLog(runId, { event: 'artifact_written', data: { path: p, rel: relPath } });
      return p;
    },
    getAgentConfig: async () => { return null; }, // placeholder, can be extended
    ...ctxOverrides
  };

  await appendLog(runId, { event: 'pipeline_start', data: { pipelineId: pipeline.id || null } });

  // simple node map and execution order: if edges provided, follow edges; else linear by index
  const nodeMap = new Map(pipeline.nodes.map((n) => [n.id, { ...n }]));

  // helper to execute single node with retries
  async function execNode(node, payload) {
    const maxRetries = node.retries == null ? 1 : node.retries;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        await appendLog(runId, { event: 'node_start', data: { nodeId: node.id, attempt } });
        // load agent executor via node._executor (injected by caller) or via node.execute
        if (typeof node._execute !== 'function') {
          throw new Error(`no-executor-for-${node.id}`);
        }
        const out = await node._execute(payload, ctx);
        await appendLog(runId, { event: 'node_success', data: { nodeId: node.id } });
        return { success: true, payload: out };
      } catch (err) {
        await appendLog(runId, { event: 'node_error', data: { nodeId: node.id, attempt, message: String(err) } });
        if (attempt >= maxRetries) {
          return { success: false, error: err };
        }
        // small backoff
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt - 1)));
      }
    }
  }

  // execution flow: linear by nodes array (MVP). If node has onError="route:<id>" we could change next index.
  let payload = { ...input };
  for (let i = 0; i < pipeline.nodes.length; i++) {
    const node = pipeline.nodes[i];
    // allow caller to inject executor (pluginLoader)
    if (!node._execute) {
      await appendLog(runId, { event: 'node_skip', data: { nodeId: node.id, reason: 'no executor' } });
      continue;
    }
    const res = await execNode(node, payload);
    if (!res.success) {
      // handle onError
      const onErr = node.onError || 'fail';
      if (onErr === 'skip') {
        await appendLog(runId, { event: 'node_onerror_skip', data: { nodeId: node.id } });
        continue;
      } else if (onErr && onErr.startsWith('route:')) {
        const targetId = onErr.split(':')[1];
        const idx = pipeline.nodes.findIndex((n) => n.id === targetId);
        if (idx >= 0) {
          i = idx - 1; // -1 because loop will i++
          payload = res.payload || payload;
          continue;
        } else {
          await appendLog(runId, { event: 'node_onerror_fail', data: { nodeId: node.id } });
          return { runId, status: 'failed', error: String(res.error) };
        }
      } else {
        // fail
        await appendLog(runId, { event: 'pipeline_failed', data: { nodeId: node.id, message: String(res.error) } });
        return { runId, status: 'failed', error: String(res.error) };
      }
    }
    // merge payload (non-mutating)
    payload = { ...payload, ...res.payload };
  }

  await appendLog(runId, { event: 'pipeline_finished', data: { artifacts: ctx._artifacts } });
  return { runId, status: 'ok', artifacts: ctx._artifacts, output: payload };
}

// New: convenience demo runner used by API imports that expect runDemoPipeline
export async function runDemoPipeline(input = {}, ctxOverrides = {}) {
  // load available agents and map by manifest.name or folder id
  const agents = await loadAgents();
  const agentMap = new Map(agents.map((a) => [a.manifest.name || a.id, a.execute]));

  const pipeline = {
    id: 'demo_pipeline',
    nodes: [
      {
        id: 'n1',
        agentName: 'Writer',
        step: { override: { template: 'Привет, {{name}}!', vars: { name: 'Мир' } } }
      },
      { id: 'n2', agentName: 'StyleGuard' },
      { id: 'n3', agentName: 'HumanGate' },
      {
        id: 'n4',
        agentName: 'Uploader',
        step: { override: { filename: 'greeting.txt' } }
      }
    ]
  };

  // inject executors into nodes (runPipeline expects node._execute)
  pipeline.nodes = pipeline.nodes.map((n) => {
    const exec = agentMap.get(n.agentName) || agentMap.get(n.agent) || null;
    return { ...n, _execute: exec };
  });

  // delegate to existing runPipeline implementation
  return await runPipeline(pipeline, input, ctxOverrides);
}
