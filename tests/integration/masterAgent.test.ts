import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentLoader } from '../../app/core/agentLoader.js';
import { MasterAgent } from '../../app/core/masterAgent.js';
import { ProviderManager } from '../../app/core/providerManager.js';
import { Database } from '../../app/core/database.js';
import { up as migrate } from '../../app/db/migrations/001_initial.js';
import { TaskRepository } from '../../app/core/repositories.js';

const testDbPath = path.resolve('app/data/test-agentflow.db');
let db: Database;

beforeAll(() => {
  if (fs.existsSync(testDbPath)) {
    fs.rmSync(testDbPath);
  }
  db = Database.getInstance(testDbPath);
  migrate(db.connection);
});

afterAll(() => {
  db.close();
  if (fs.existsSync(testDbPath)) {
    fs.rmSync(testDbPath);
  }
});

describe('MasterAgent integration', () => {
  it('executes a task in mock mode', async () => {
    const loader = new AgentLoader();
    const providerManager = new ProviderManager();
    const masterAgent = new MasterAgent(db, loader, providerManager);

    const task = await masterAgent.createTask('Integration test', {
      contentTypes: ['text', 'image'],
      tone: 'friendly'
    });

    await masterAgent.executeTask(task.id, { mode: 'mock' });
    const repo = new TaskRepository(db.connection);
    const updated = repo.findById(task.id);
    expect(updated?.status).toBe('completed');
  });
});
