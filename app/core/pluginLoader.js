import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* Simple plugin loader for agents in core/agents/<Name> */
const AGENTS_DIR = path.join(process.cwd(), 'app', 'core', 'agents');

export async function loadAgents() {
  const result = [];
  try {
    const entries = await fs.readdir(AGENTS_DIR, { withFileTypes: true });
    for (const d of entries) {
      if (!d.isDirectory()) continue;
      const dir = path.join(AGENTS_DIR, d.name);
      const manifestPath = path.join(dir, 'manifest.json');
      const indexPath = path.join(dir, 'index.js');
      try {
        const manifestRaw = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestRaw);
        const mod = await import(pathToFileURL(indexPath).href);
        const execute = mod.default || mod.execute;
        if (typeof execute !== 'function') {
          console.warn(`[pluginLoader] agent ${d.name} has no execute function`);
          continue;
        }
        result.push({ id: d.name, dir, manifest, execute });
      } catch (e) {
        console.warn(`[pluginLoader] failed load ${d.name}: ${e.message}`);
      }
    }
  } catch (e) {
    // no agents dir — return empty
  }
  return result;
}

export async function findAgentByName(name) {
  const list = await loadAgents();
  return list.find((a) => a.manifest && (a.manifest.name === name || a.id === name));
}

// New: registry factory to provide a cached loader and convenience methods
export function createPluginRegistry() {
  let cache = null;

  return {
    // load agents (cached)
    async loadAgents() {
      if (!cache) {
        cache = await loadAgents();
      }
      return cache;
    },

    // listAgents: compatibility wrapper expected by UI/IPC
    async listAgents() {
      const agents = await this.loadAgents();
      return agents.map((a) => ({ id: a.id, manifest: a.manifest }));
    },

    // force reload from FS
    async reload() {
      cache = await loadAgents();
      return cache;
    },

    // find agent by name using cache (reloads if necessary)
    async findAgentByName(name) {
      if (!cache) {
        cache = await loadAgents();
      }
      return cache.find((a) => a.manifest && (a.manifest.name === name || a.id === name)) || null;
    },

    // expose raw loader for advanced use
    __rawLoader: { loadAgents, findAgentByName }
  };
}
