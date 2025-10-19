import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const WORKITEMS_DIR = path.join(ROOT, 'plans', 'workitems');

const workItemId = process.argv[2] || 'unknown';

async function loadWorkItem(id) {
  const filePath = path.join(WORKITEMS_DIR, `${id}.json`);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function runCommand(command, options = {}) {
  execSync(command, { stdio: 'inherit', cwd: ROOT, ...options });
}

function runVitestForOutput(output) {
  const relativePath = path.relative(ROOT, path.resolve(ROOT, output));
  runCommand(`npm run test:unit --prefix app -- --run ${relativePath}`);
}

async function executeWorkItem(workItem) {
  if (!Array.isArray(workItem.outputs) || workItem.outputs.length === 0) {
    console.log(`[run-agent] No outputs defined for ${workItem.id}, skipping.`);
    return;
  }

  for (const output of workItem.outputs) {
    if (output.endsWith('docs/VerificationReport.md') || output.endsWith('VerificationReport.md')) {
      runCommand('npm run verify --prefix app');
    } else if (output.includes('tests/unit/')) {
      runVitestForOutput(output);
    } else {
      console.log(`[run-agent] No handler for output "${output}".`);
    }
  }
}

loadWorkItem(workItemId)
  .then(executeWorkItem)
  .catch((error) => {
    console.error(`[run-agent] Failed to execute ${workItemId}:`, error.message);
    process.exitCode = 1;
  });
