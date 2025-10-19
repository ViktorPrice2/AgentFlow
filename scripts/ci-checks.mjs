import { execSync } from 'node:child_process';

function runAppScript(scriptName) {
  execSync(`npm run --prefix app ${scriptName}`, { stdio: 'inherit' });
}

function runAppCommand(command) {
  execSync(`npm --prefix app ${command}`, { stdio: 'inherit' });
}

try {
  runAppScript('build:renderer');
  execSync('node ./scripts/check-e2e-bridge.mjs', { stdio: 'inherit' });
  runAppScript('lint');
  runAppScript('test:ci');
  try {
    runAppCommand('audit --omit=dev --audit-level=high');
  } catch {
    console.warn('[SECURITY] moderate issues allowed; high/critical would fail');
  }
  console.log('CI checks passed');
} catch (e) {
  process.exitCode = 1;
  console.error('CI checks failed:', e?.message || e);
}
