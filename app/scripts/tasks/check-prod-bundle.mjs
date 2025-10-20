#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PATTERNS = [/window\.e2e\b/, /__e2e__/];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidates = [
  path.resolve(process.cwd(), 'renderer/dist/assets'),
  path.resolve(process.cwd(), 'app/renderer/dist/assets'),
  path.resolve(__dirname, '../../renderer/dist/assets')
];

const assetsDir = candidates.find((dir) => fs.existsSync(dir));

if (!assetsDir) {
  const expected = path.resolve(__dirname, '../../renderer/dist/assets');
  console.error(`[ERROR] Dist not found: ${expected}. Run "npm run build:renderer" first.`);
  process.exit(1);
}

let leaked = false;

function scan(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const pattern of PATTERNS) {
    if (pattern.test(content)) {
      console.error(`[LEAK] ${filePath} matched ${pattern}`);
      leaked = true;
    }
  }
}

const entries = fs.readdirSync(assetsDir);
for (const entry of entries) {
  if (/\.(js|mjs|cjs)$/i.test(entry)) {
    scan(path.join(assetsDir, entry));
  }
}

if (leaked) {
  console.error('E2E code leaked into production bundle. Fix required.');
  process.exit(1);
}

console.log('OK: no e2e code in production bundle.');
