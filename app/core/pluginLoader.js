import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_AGENT_DIR_CANDIDATES = [
  path.join(process.cwd(), 'core', 'agents'),
  path.join(process.cwd(), 'app', 'core', 'agents'),
  path.join(__dirname, 'agents')
];

function resolveDefaultAgentsDir() {
  for (const candidate of DEFAULT_AGENT_DIR_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_AGENT_DIR_CANDIDATES[DEFAULT_AGENT_DIR_CANDIDATES.length - 1];
}

const AGENTS_DIR = resolveDefaultAgentsDir();

class PluginRegistry {
  constructor(baseDir = AGENTS_DIR) {
    this.baseDir = baseDir || AGENTS_DIR;
    this.agents = new Map();
  }

  async load() {
    await this.registerBuiltInStubs();

    let entries;

    try {
      entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      throw error;
    }

    const loaders = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => this.loadAgentFromDirectory(dirent.name));

    await Promise.all(loaders);
  }

  async registerBuiltInStubs() {
    if (!this.agents.has('FormCollector')) {
      this.agents.set('FormCollector', {
        id: 'FormCollector',
        manifest: {
          name: 'FormCollector',
          version: '0.1.0',
          description: 'Captures submitted brief data and hands it to downstream nodes.'
        },
        async execute(payload = {}) {
          const submittedAt = new Date().toISOString();
          const normalized = payload && typeof payload === 'object' ? { ...payload } : {};
          const form = normalized.form && typeof normalized.form === 'object' ? { ...normalized.form } : {};

          return {
            ...normalized,
            form: {
              ...form,
              status: form.status || 'submitted',
              submittedAt: form.submittedAt || submittedAt
            }
          };
        }
      });
    }

    if (!this.agents.has('WriterStub')) {
      this.agents.set('WriterStub', {
        id: 'WriterStub',
        manifest: {
          name: 'WriterStub',
          version: '0.0.1',
          description: 'Simulated writer agent (Phase 2)'
        },
        async execute(payload) {
          const base = payload || {};
          const title = base.title ?? 'Заглушка контента';
          const caption = base.caption ?? 'Тестовый текст от WriterStub';

          return {
            ...base,
            writer: {
              title,
              caption,
              status: 'simulated'
            },
            summary: 'WriterStub generated simulated content.'
          };
        }
      });
    }

    if (!this.agents.has('UploaderStub')) {
      this.agents.set('UploaderStub', {
        id: 'UploaderStub',
        manifest: {
          name: 'UploaderStub',
          version: '0.0.1',
          description: 'Simulated uploader agent (Phase 2)'
        },
        async execute(payload, ctx) {
          const content = [
            '# Демонстрационный файл',
            '',
            `Название: ${payload?.writer?.title ?? 'без названия'}`,
            `Описание: ${payload?.writer?.caption ?? 'нет описания'}`,
            '',
            `Дата: ${new Date().toISOString()}`
          ].join('\n');

          if (ctx && typeof ctx.setArtifact === 'function') {
            await ctx.setArtifact('uploader/report.txt', content);
          }

          return {
            ...payload,
            uploader: {
              status: 'simulated',
              platforms: ['demo']
            },
            summary: 'UploaderStub stored a simulated artifact.'
          };
        }
      });
    }
  }

  async loadAgentFromDirectory(directoryName) {
    const location = path.join(this.baseDir, directoryName);
    const manifestPath = path.join(location, 'manifest.json');
    const entryPath = path.join(location, 'index.js');

    try {
      const manifestRaw = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestRaw);
      const moduleUrl = pathToFileURL(entryPath).href;
      const module = await import(moduleUrl);

      if (typeof module.execute !== 'function') {
        throw new Error(`Agent "${directoryName}" does not export async function execute`);
      }

      const agentId = manifest.name || directoryName;

      this.agents.set(agentId, {
        id: agentId,
        manifest,
        execute: module.execute
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      throw error;
    }
  }

  getAgent(agentName) {
    return this.agents.get(agentName) || null;
  }

  listAgents() {
    return Array.from(this.agents.values()).map(({ id, manifest }) => ({
      id,
      name: manifest?.name || id,
      version: manifest?.version || '0.0.0',
      description: manifest?.description || ''
    }));
  }
}

export async function createPluginRegistry(options = {}) {
  const registry = new PluginRegistry(options.baseDir);
  await registry.load();
  return registry;
}
