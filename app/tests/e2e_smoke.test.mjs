import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createPluginRegistry } from '../core/pluginLoader.js';
import { runDemoPipeline } from '../core/orchestrator.js';

test.describe('Demo pipeline', () => {
  test('Writer → Uploader pipeline produces artifact', async () => {
    const registry = await createPluginRegistry();
    const input = {
      title: 'Демо запуск',
      caption: 'Маркетинговый текст без ограничений'
    };

    const result = await runDemoPipeline(registry, input);

    expect(result.status).toBe('completed');
    expect(result.payload.writer).toBeTruthy();
    expect(result.payload.uploader).toBeTruthy();
    expect(Array.isArray(result.payload._artifacts)).toBe(true);
    expect(result.payload._artifacts.length).toBeGreaterThan(0);

    const artifactPath = result.payload._artifacts.find((entry) => entry.includes('uploader'));

    expect(artifactPath, 'Artifact path should point to uploader report').toBeTruthy();
    expect(artifactPath).toContain('report');

    const absoluteArtifactPath = path.join(process.cwd(), 'data', artifactPath);
    const artifactContent = await fs.readFile(absoluteArtifactPath, 'utf8');

    expect(artifactContent).toContain(input.title);

    if (result.logFile) {
      await fs.rm(result.logFile, { force: true });
    }

    await fs.rm(path.dirname(absoluteArtifactPath), { recursive: true, force: true });
  });
});
