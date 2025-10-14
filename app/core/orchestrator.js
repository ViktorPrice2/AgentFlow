import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');

const defaultOptions = {
  agentConfigs: new Map(),
  override: undefined
};

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeLog(logFile, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    data
  };

  await fs.appendFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

function buildGraph(edges = []) {
  const adjacency = new Map();

  edges.forEach((edge) => {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }

    adjacency.get(edge.from).push(edge);
  });

  return adjacency;
}

function findStartNodeId(pipeline) {
  if (pipeline?.startId) {
    return pipeline.startId;
  }

  if (pipeline?.start) {
    return pipeline.start;
  }

  if (!Array.isArray(pipeline?.nodes) || pipeline.nodes.length === 0) {
    return undefined;
  }

  if (!Array.isArray(pipeline?.edges) || pipeline.edges.length === 0) {
    return pipeline.nodes[0].id;
  }

  const targets = new Set(pipeline.edges.map((edge) => edge.to));
  const startNode = pipeline.nodes.find((node) => !targets.has(node.id));

  return startNode ? startNode.id : pipeline.nodes[0].id;
}

function resolveValueFromPath(source, pathExpression) {
  return pathExpression
    .split('.')
    .filter(Boolean)
    .reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), source);
}

function evaluateCondition(condition, payload) {
  if (!condition) {
    return true;
  }

  if (typeof condition === 'function') {
    return Boolean(condition(payload));
  }

  if (typeof condition === 'string') {
    const [pathExpression, expectedRaw] = condition.split('==');

    if (!expectedRaw) {
      return false;
    }

    const expectedValue = expectedRaw.trim().replace(/^['"]|['"]$/g, '');
    const actualValue = resolveValueFromPath(payload, pathExpression.trim());

    return actualValue === expectedValue;
  }

  if (typeof condition === 'object' && condition !== null) {
    if ('equals' in condition && typeof condition.equals === 'object') {
      const { path: pathExpr, value } = condition.equals;
      const actualValue = resolveValueFromPath(payload, pathExpr);

      return actualValue === value;
    }
  }

  return false;
}

function determineNextNodes(currentNode, payload, adjacency) {
  const outgoing = adjacency.get(currentNode.id) || [];

  if (currentNode.kind === 'router') {
    const matched = outgoing.filter((edge) => evaluateCondition(edge.condition, payload));

    if (matched.length > 0) {
      return matched.map((edge) => edge.to);
    }

    const fallthrough = outgoing.filter((edge) => !edge.condition);

    return fallthrough.map((edge) => edge.to);
  }

  return outgoing.map((edge) => edge.to);
}

async function writeArtifact(runId, relativePath, content) {
  const artifactRoot = path.join(ARTIFACTS_DIR, runId);
  const destination = path.join(artifactRoot, relativePath);
  const destinationDir = path.dirname(destination);

  await ensureDir(destinationDir);

  if (Buffer.isBuffer(content)) {
    await fs.writeFile(destination, content);
  } else if (typeof content === 'string') {
    await fs.writeFile(destination, content, 'utf8');
  } else {
    await fs.writeFile(destination, JSON.stringify(content, null, 2), 'utf8');
  }

  const relativeToData = path.relative(DATA_DIR, destination).split(path.sep).join('/');

  return {
    absolutePath: destination,
    relativePath: relativeToData
  };
}

function buildContext(runId, pipeline, options, logFn, artifactCollector) {
  const agentConfigMap =
    options.agentConfigs instanceof Map
      ? options.agentConfigs
      : new Map(
          Object.entries(options.agentConfigs || {}).map(([key, value]) => [key, value])
        );

  return {
    runId,
    project: pipeline?.project || null,
    env: process.env,
    override: options.override,
    getAgentConfig(agentName) {
      return agentConfigMap.get(agentName) || null;
    },
    async log(event, data) {
      await logFn(event, data);
    },
    async setArtifact(relativePath, content) {
      const artifactInfo = await writeArtifact(runId, relativePath, content);

      artifactCollector(artifactInfo);

      return artifactInfo;
    }
  };
}

/**
 * Executes a pipeline graph using loaded agents.
 * @param {object} pipeline - Pipeline definition with nodes and edges.
 * @param {object} input - Initial payload passed to the first node.
 * @param {object} options - Execution options ({ pluginRegistry, agentConfigs, override, runId }).
 * @returns {Promise<object>} Execution result with payload, nodes state, and log path.
 */
export async function runPipeline(pipeline, input = {}, options = {}) {
  const resolvedOptions = { ...defaultOptions, ...options };
  const pluginRegistry = resolvedOptions.pluginRegistry;

  if (!pluginRegistry) {
    throw new Error('pluginRegistry is required to run pipeline');
  }

  const runId = resolvedOptions.runId || randomUUID();
  const logDirPath = LOG_DIR;
  await ensureDir(logDirPath);

  const logFile = path.join(logDirPath, `run_${runId}.jsonl`);
  const collectedArtifacts = [];

  const logFn = async (event, data) => {
    await writeLog(logFile, event, data);
  };

  const ctx = buildContext(runId, pipeline, resolvedOptions, logFn, (artifactInfo) => {
    collectedArtifacts.push(artifactInfo.relativePath);
  });

  const adjacency = buildGraph(pipeline?.edges);
  const nodesById = new Map((pipeline?.nodes || []).map((node) => [node.id, node]));
  const results = [];

  let payload = {
    ...(input || {}),
    _artifacts: []
  };

  const enqueue = [];
  const visited = new Set();
  const startId = findStartNodeId(pipeline);

  if (!startId) {
    throw new Error('Pipeline does not contain a start node');
  }

  enqueue.push(startId);

  await logFn('pipeline:start', {
    runId,
    pipelineId: pipeline?.id || null,
    name: pipeline?.name || null
  });

  while (enqueue.length > 0) {
    const nodeId = enqueue.shift();

    if (!nodesById.has(nodeId)) {
      await logFn('pipeline:missing-node', { nodeId });
      continue;
    }

    const node = nodesById.get(nodeId);
    const retries = Number.isInteger(node.retries) && node.retries > 0 ? node.retries : 1;
    let attempt = 0;
    let success = false;
    let lastError;
    let nodeResult = null;

    while (attempt < retries && !success) {
      attempt += 1;

      try {
        await logFn('node:start', { nodeId, attempt, kind: node.kind, agentName: node.agentName });

        const agentModule = pluginRegistry.getAgent(node.agentName);

        if (!agentModule) {
          throw new Error(`Agent "${node.agentName}" is not registered`);
        }

        const executionPayload = {
          ...payload,
          override: node.override ? { ...(payload.override || {}), ...node.override } : payload.override
        };

        const artifactBaseline = collectedArtifacts.length;

        const result = await agentModule.execute(executionPayload, ctx);

        if (!result || typeof result !== 'object') {
          throw new Error(`Agent "${node.agentName}" returned invalid result`);
        }

        payload = {
          ...payload,
          ...result
        };

        if (!Array.isArray(payload._artifacts)) {
          payload._artifacts = [];
        }

        const newArtifacts = collectedArtifacts.slice(artifactBaseline);

        if (newArtifacts.length > 0) {
          const artifactSet = new Set(payload._artifacts);
          newArtifacts.forEach((artifact) => artifactSet.add(artifact));
          payload._artifacts = Array.from(artifactSet);
        }

        nodeResult = {
          id: node.id,
          status: 'completed',
          attempts: attempt,
          outputSummary: result.summary || null,
          finishedAt: new Date().toISOString()
        };

        await logFn('node:completed', { nodeId, attempts: attempt });
        success = true;
      } catch (error) {
        lastError = error;
        await logFn('node:error', {
          nodeId,
          attempt,
          message: error.message,
          stack: error.stack
        });
      }
    }

    if (!success) {
      const failureRecord = {
        id: node.id,
        status: 'error',
        attempts: retries,
        error: lastError?.message || 'Unknown error',
        finishedAt: new Date().toISOString()
      };

      results.push(failureRecord);

      if (node.onError && typeof node.onError === 'string') {
        if (node.onError === 'skip') {
          continue;
        }

        if (node.onError.startsWith('route:')) {
          const routeTarget = node.onError.split(':')[1];

          if (routeTarget) {
            enqueue.push(routeTarget);
            continue;
          }
        }
      }

      await logFn('pipeline:failed', { nodeId, message: lastError?.message });

      return {
        runId,
        status: 'failed',
        payload,
        nodes: [...results],
        logFile
      };
    }

    results.push(nodeResult);
    visited.add(node.id);

    const nextNodeIds = determineNextNodes(node, payload, adjacency);
    nextNodeIds
      .filter((nextId) => !!nextId)
      .forEach((nextId) => {
        if (!visited.has(nextId)) {
          enqueue.push(nextId);
        }
      });
  }

  await logFn('pipeline:completed', { runId });

  return {
    runId,
    status: 'completed',
    payload,
    nodes: results,
    logFile
  };
}

/**
 * Convenience helper to run a simulated Writer → Uploader pipeline for development testing.
 * @param {object} pluginRegistry
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function runDemoPipeline(pluginRegistry, input = {}) {
  const demoPipeline = {
    id: 'demo',
    name: 'Writer → Uploader',
    nodes: [
      { id: 'writer', agentName: 'WriterStub', kind: 'task' },
      { id: 'uploader', agentName: 'UploaderStub', kind: 'task' }
    ],
    edges: [{ from: 'writer', to: 'uploader' }]
  };

  return runPipeline(demoPipeline, input, { pluginRegistry });
}
