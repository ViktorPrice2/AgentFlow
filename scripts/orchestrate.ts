import { Database } from '../app/core/database.js';
import { AgentLoader } from '../app/core/agentLoader.js';
import { ProviderManager } from '../app/core/providerManager.js';
import { MasterAgent } from '../app/core/masterAgent.js';
import { up as migrate } from '../app/db/migrations/001_initial.js';

async function orchestrate() {
  const db = Database.getInstance();
  migrate(db.connection);

  const loader = new AgentLoader();
  const providerManager = new ProviderManager();
  const masterAgent = new MasterAgent(db, loader, providerManager);

  const input = process.argv[2] ?? 'Launch new product';
  const contentTypes = (process.argv[3]?.split(',') as ('text' | 'image' | 'video')[]) ?? [
    'text',
    'image',
    'video'
  ];

  const task = await masterAgent.createTask(input, { contentTypes, tone: 'enthusiastic' });
  console.log(`Created task ${task.id}`);
  await masterAgent.executeTask(task.id, { mode: providerManager.getMode() });
  console.log('Task execution finished');
}

orchestrate().catch((error) => {
  console.error('Orchestration failed', error);
  process.exit(1);
});
