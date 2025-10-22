import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ArtifactRepository } from './repositories.js';
import type { ArtifactRecord, ArtifactStorageApi, ContentType } from './types.js';

export class ArtifactStorage implements ArtifactStorageApi {
  constructor(private readonly repo: ArtifactRepository, private readonly root = 'app/data/artifacts') {
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root, { recursive: true });
    }
  }

  async saveArtifact(
    runId: string,
    type: ContentType,
    content: Buffer | string,
    extension: string,
    metadata: Record<string, unknown> = {}
  ): Promise<ArtifactRecord> {
    const safeExtension = extension.replace(/[^a-zA-Z0-9.]/g, '');
    const fileName = `${runId}-${randomUUID()}.${safeExtension || 'dat'}`;
    const filePath = path.resolve(this.root, fileName);
    await fs.promises.writeFile(filePath, content);
    const record = this.repo.create({ runId, type, path: filePath, metadata });
    return record;
  }
}
