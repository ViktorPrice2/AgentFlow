import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const DAG_PATH = path.join(ROOT, 'plans', 'dag.json');
const WORKITEMS_DIR = path.join(ROOT, 'plans', 'workitems');
const REPORTS_DIR = path.join(ROOT, 'reports');
const SUMMARY_PATH = path.join(REPORTS_DIR, 'summary.json');

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function loadDag() {
  try {
    return await readJson(DAG_PATH);
  } catch (error) {
    throw new Error(`Failed to load DAG definition at ${DAG_PATH}: ${error.message}`);
  }
}

async function loadWorkItem(nodeId) {
  const workItemPath = path.join(WORKITEMS_DIR, `${nodeId}.json`);

  try {
    return await readJson(workItemPath);
  } catch (error) {
    console.warn(`[Orchestrator] Workitem ${nodeId} not found or invalid: ${error.message}`);
    return null;
  }
}

async function ensureReportsDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

function runCommand(command) {
  execSync(command, { stdio: 'inherit' });
}

async function main() {
  const startTime = new Date().toISOString();
  const runId = randomUUID();
  const dag = await loadDag();
  const results = [];

  for (const node of dag.nodes || []) {
    const workItem = await loadWorkItem(node.id);
    const stepInfo = {
      id: node.id,
      type: node.type,
      status: 'pending',
      workItem
    };

    console.log(`[Orchestrator] Starting ${node.id} (${node.type})`);

    try {
      runCommand(`node ./scripts/run-agent.mjs ${node.id}`);
      runCommand('node ./scripts/ci-checks.mjs');
      stepInfo.status = 'completed';
      console.log(`[Orchestrator] Completed ${node.id}`);
    } catch (error) {
      stepInfo.status = 'failed';
      stepInfo.error = error?.message || String(error);
      results.push(stepInfo);
      console.error(`[Orchestrator] Failed ${node.id}:`, stepInfo.error);
      break;
    }

    results.push(stepInfo);
  }

  const summary = {
    runId,
    startedAt: startTime,
    finishedAt: new Date().toISOString(),
    results
  };

  await ensureReportsDir();
  await fs.writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[Orchestrator] Summary written to ${SUMMARY_PATH}`);
}

main().catch((error) => {
  console.error('[Orchestrator] Unhandled error:', error?.message || error);
  process.exitCode = 1;
});
