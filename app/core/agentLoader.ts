import fs from 'node:fs';
import path from 'node:path';
import type { AgentManifest, AgentModule } from './types.js';
import { pathToFileURL } from 'node:url';

export class AgentLoader {
  private readonly root: string;
  private cache = new Map<string, AgentManifest>();

  constructor(rootDir?: string) {
    this.root = rootDir ?? path.resolve('app/agents');
    this.loadAllManifests();
  }

  private loadAllManifests(): void {
    if (!fs.existsSync(this.root)) return;
    const entries = fs.readdirSync(this.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(this.root, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as AgentManifest;
      this.cache.set(manifest.name, { ...manifest, entry: path.join(this.root, entry.name, manifest.entry) });
    }
  }

  getManifest(name: string): AgentManifest | undefined {
    return this.cache.get(name);
  }

  listManifests(): AgentManifest[] {
    return Array.from(this.cache.values());
  }

  async load(name: string): Promise<AgentModule> {
    const manifest = this.cache.get(name);
    if (!manifest) {
      throw new Error(`Agent ${name} not found`);
    }

    const imported = await import(pathToFileURL(manifest.entry).toString());
    const module = (imported.default ?? imported) as AgentModule;
    if (typeof module.execute !== 'function') {
      throw new Error(`Agent ${name} missing execute function`);
    }

    return module;
  }
}
