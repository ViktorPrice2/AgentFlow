import { Database } from '../app/core/database.js';
import { AgentLoader } from '../app/core/agentLoader.js';
import { ProviderManager } from '../app/core/providerManager.js';
import { MasterAgent } from '../app/core/masterAgent.js';
import { ArtifactRepository, LogRepository, RunRepository, TaskRepository } from '../app/core/repositories.js';
import { ArtifactStorage } from '../app/core/artifactStorage.js';
import { up as migrate } from '../app/db/migrations/001_initial.js';

async function verify() {
  const dbInstance = Database.getInstance();
  migrate(dbInstance.connection);

  const loader = new AgentLoader();
  const providerManager = new ProviderManager();
  const masterAgent = new MasterAgent(dbInstance, loader, providerManager);

  const taskRepo = new TaskRepository(dbInstance.connection);
  const runRepo = new RunRepository(dbInstance.connection);
  const logRepo = new LogRepository(dbInstance.connection);
  const artifactRepo = new ArtifactRepository(dbInstance.connection);
  const storage = new ArtifactStorage(artifactRepo);

  const existingTasks = dbInstance.connection.prepare('SELECT COUNT(*) as count FROM tasks').get() as {
    count: number;
  };
  if (existingTasks.count === 0) {
    const task = await masterAgent.createTask('Verification run', {
      contentTypes: ['text', 'image'],
      tone: 'neutral'
    });
    await masterAgent.executeTask(task.id, { mode: 'mock' });
  }

  const latestTask = dbInstance.connection
    .prepare('SELECT id FROM tasks ORDER BY created_at DESC LIMIT 1')
    .get() as { id: string };
  const taskRecord = taskRepo.findById(latestTask.id);
  if (!taskRecord) {
    throw new Error('Task record missing for diagnostics');
  }

  const runs = runRepo.findByTask(taskRecord.id);
  const logs = runs.flatMap((run) => logRepo.findByRun(run.id));

  const diagnostic = await loader.load('diagnostic-agent');
  const logger = {
    info: (message: string, meta?: Record<string, unknown>) => console.log(message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => console.warn(message, meta),
    error: (message: string, meta?: Record<string, unknown>) => console.error(message, meta)
  };
  await diagnostic.execute(
    {
      runs: runs.map((run) => ({ nodeId: run.nodeId, status: run.status, attempts: run.attempts })),
      logs: logs.map((log) => ({
        id: log.id,
        type: log.type,
        message: log.message,
        timestamp: log.timestamp.toISOString()
      }))
    },
    {
      task: taskRecord,
      run: runs[0] ?? {
        id: 'diagnostic',
        taskId: taskRecord.id,
        nodeId: 'diagnostic',
        agentName: 'diagnostic-agent',
        status: 'completed',
        error: null,
        startedAt: new Date(),
        endedAt: new Date(),
        attempts: 1
      },
      providerManager,
      storage,
      logger,
      mode: providerManager.getMode(),
      locale: 'en'
    }
  );

  console.log('Verification completed. See docs/VerificationReport.md');
}

verify().catch((error) => {
  console.error('Verification failed', error);
  process.exit(1);
});
