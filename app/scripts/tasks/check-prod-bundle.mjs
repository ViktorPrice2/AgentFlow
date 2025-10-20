import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BANNED_PATTERNS = [
  { label: 'window.e2e', regex: /window\.e2e/ },
  { label: '__e2e__', regex: /__e2e__/ }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../../renderer/dist/assets');

async function collectJsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

async function checkForLeaks() {
  let files;

  try {
    files = await collectJsFiles(DIST_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('[e2e-guard] Renderer assets directory not found, skipping leak check.');
      return;
    }

    throw error;
  }

  if (files.length === 0) {
    console.warn('[e2e-guard] No JavaScript assets found, skipping leak check.');
    return;
  }

  let hasLeak = false;

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');

    for (const { label, regex } of BANNED_PATTERNS) {
      if (regex.test(content)) {
        hasLeak = true;
        console.error(`[e2e-guard] Found forbidden token "${label}" in ${filePath}`);
      }
    }
  }

  if (hasLeak) {
    throw new Error('Detected e2e bridge tokens in production bundle.');
  }

  console.log('[e2e-guard] No e2e bridge leaks detected.');
}

checkForLeaks().catch((error) => {
  console.error('[e2e-guard] Check failed:', error.message || error);
  process.exitCode = 1;
});
