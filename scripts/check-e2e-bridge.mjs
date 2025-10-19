import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const ASSETS_DIR = path.resolve(ROOT, '../app/renderer/dist/assets');
const PATTERN = /(window\.e2e|__e2e__)/;

async function main() {
  try {
    const entries = await fs.readdir(ASSETS_DIR, { withFileTypes: true });
    const offenders = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(ASSETS_DIR, entry.name);
      const content = await fs.readFile(filePath, 'utf8');

      if (PATTERN.test(content)) {
        offenders.push(entry.name);
      }
    }

    if (offenders.length > 0) {
      console.error(
        '[check-e2e-bridge] Found e2e bridge tokens in production bundle:',
        offenders.join(', ')
      );
      process.exitCode = 1;
      return;
    }

    console.log('[check-e2e-bridge] Production bundle is clean.');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('[check-e2e-bridge] assets directory not found; skipping check.');
      return;
    }

    console.error('[check-e2e-bridge] Failed to inspect bundle:', error.message);
    process.exitCode = 1;
  }
}

main();
