import fs from 'node:fs';
import path from 'node:path';
import type { AgentModule } from '../../core/types.js';

const OUTPUT_DIR = path.resolve('app/data/published');

const uploaderAgent: AgentModule = {
  async execute(payload, ctx) {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const dependencies = payload.dependencies as Record<string, Record<string, unknown>> | undefined;
    const collected: string[] = [];

    if (dependencies) {
      for (const entry of Object.values(dependencies)) {
        const artifactPath = entry?.imagePath ?? entry?.videoPath;
        if (typeof artifactPath === 'string' && fs.existsSync(artifactPath)) {
          const dest = path.join(OUTPUT_DIR, path.basename(artifactPath));
          await fs.promises.copyFile(artifactPath, dest);
          collected.push(dest);
        }
      }
    }

    ctx.logger.info('Uploader collected artifacts', { count: collected.length });
    return { published: collected };
  }
};

export default uploaderAgent;
