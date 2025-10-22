import type { AgentLoader } from './agentLoader.js';
import { ArtifactStorage } from './artifactStorage.js';
import type { ProviderManager } from './providerManager.js';
import { buildDefaultPlan } from './planBuilder.js';
import { RunLogger } from './logger.js';
import { ArtifactRepository, LogRepository, RunRepository, TaskRepository } from './repositories.js';
import type { PlanNode, TaskPlan, TaskRecord } from './types.js';
import type { Database } from './database.js';

interface GeneratePlanOptions {
  tone?: string;
  contentTypes: ('text' | 'image' | 'video')[];
}

interface ExecuteOptions {
  mode?: 'real' | 'mock';
  locale?: 'en' | 'ru';
}

export class MasterAgent {
  private readonly taskRepo: TaskRepository;
  private readonly runRepo: RunRepository;
  private readonly logRepo: LogRepository;
  private readonly artifactRepo: ArtifactRepository;
  private readonly storage: ArtifactStorage;

  constructor(
    db: Database,
    private readonly agentLoader: AgentLoader,
    private readonly providerManager: ProviderManager
  ) {
    const connection = db.connection;
    this.taskRepo = new TaskRepository(connection);
    this.runRepo = new RunRepository(connection);
    this.logRepo = new LogRepository(connection);
    this.artifactRepo = new ArtifactRepository(connection);
    this.storage = new ArtifactStorage(this.artifactRepo);
  }

  async generatePlan(input: string, options: GeneratePlanOptions): Promise<TaskPlan> {
    try {
      if (this.providerManager.getMode() === 'real') {
        const response = await this.providerManager.invoke({
          model: 'gpt-4o-mini',
          type: 'text',
          prompt: `System: design a DAG plan for marketing content. Respond JSON.
User: ${input} | content: ${options.contentTypes.join(', ')}`
        });
        if (response.content) {
          const parsed = JSON.parse(response.content) as TaskPlan;
          if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
            return parsed;
          }
        }
      }
    } catch (error) {
      console.warn('LLM plan generation failed, falling back to template', error);
    }

    return buildDefaultPlan(input, {
      requestedContent: options.contentTypes,
      tone: options.tone
    });
  }

  async createTask(input: string, options: GeneratePlanOptions): Promise<TaskRecord> {
    const plan = await this.generatePlan(input, options);
    return this.taskRepo.create(plan);
  }

  async executeTask(taskId: string, options: ExecuteOptions = {}): Promise<void> {
    const task = this.taskRepo.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.taskRepo.updateStatus(taskId, 'running');
    const plan = task.plan;
    const runs = new Map<string, string>();

    for (const node of plan.nodes) {
      const run = this.runRepo.create(taskId, node.id, node.agent);
      runs.set(node.id, run.id);
    }

    const results = new Map<string, Record<string, unknown>>();
    const mode = options.mode ?? this.providerManager.getMode();
    const locale = options.locale ?? 'en';

    const pending = new Set(plan.nodes.map((node) => node.id));
    while (pending.size > 0) {
      let progressed = false;
      for (const node of plan.nodes) {
        if (!pending.has(node.id)) continue;
        if ((node.dependsOn ?? []).some((dep) => !results.has(dep))) {
          continue;
        }

        const runId = runs.get(node.id);
        if (!runId) continue;
        const run = this.runRepo.findByTask(taskId).find((item) => item.id === runId);
        if (!run) continue;

        const success = await this.executeNode(node, task, run.id, results, mode, locale);
        if (!success) {
          this.taskRepo.updateStatus(taskId, 'failed');
          return;
        }
        pending.delete(node.id);
        progressed = true;
      }

      if (!progressed) {
        throw new Error('No executable nodes remaining; DAG may contain a cycle');
      }
    }

    this.taskRepo.updateStatus(taskId, 'completed');
  }

  private async executeNode(
    node: PlanNode,
    task: TaskRecord,
    runId: string,
    results: Map<string, Record<string, unknown>>,
    mode: 'real' | 'mock',
    locale: 'en' | 'ru'
  ): Promise<boolean> {
    const runLogger = new RunLogger(this.logRepo, runId);
    const dependencies = node.dependsOn ?? [];
    const payload = {
      ...node.input,
      dependencies: Object.fromEntries(dependencies.map((dep) => [dep, results.get(dep)]))
    };

    let attempts = 0;
    while (attempts < 3) {
      attempts += 1;
      this.runRepo.markRunning(runId, attempts);
      try {
        const agentModule = await this.agentLoader.load(node.agent);
        const runRecord = this.runRepo.findByTask(task.id).find((item) => item.id === runId);
        if (!runRecord) {
          throw new Error('Run record missing');
        }

        const output = (await agentModule.execute(payload, {
          task,
          run: runRecord,
          providerManager: this.providerManager,
          storage: this.storage,
          logger: runLogger,
          mode,
          locale
        })) ?? {};

        results.set(node.id, output as Record<string, unknown>);
        this.runRepo.update(runId, 'completed', null, attempts);
        return true;
      } catch (error) {
        runLogger.error('Execution failed', { error: (error as Error).message, attempt: attempts });
        if (attempts >= 3) {
          this.runRepo.update(runId, 'failed', (error as Error).message, attempts);
          const humanResult = await this.invokeHumanGate(
            task,
            node,
            runId,
            results,
            mode,
            locale,
            attempts
          );
          if (humanResult) {
            results.set(node.id, humanResult);
            return true;
          }
          return false;
        }
      }
    }

    return false;
  }

  private async invokeHumanGate(
    task: TaskRecord,
    node: PlanNode,
    runId: string,
    results: Map<string, Record<string, unknown>>,
    mode: 'real' | 'mock',
    locale: 'en' | 'ru',
    attempts: number
  ): Promise<Record<string, unknown> | null> {
    try {
      const manifest = this.agentLoader.getManifest('human-gate-agent');
      if (!manifest) {
        return null;
      }
      const module = await this.agentLoader.load(manifest.name);
      const runRecord = this.runRepo.findByTask(task.id).find((item) => item.id === runId);
      if (!runRecord) return null;
      const logger = new RunLogger(this.logRepo, runId);
      const output = (await module.execute(
        {
          failedNode: node,
          partial: results.get(node.id) ?? {},
          message: 'Automated retries exhausted'
        },
        {
          task,
          run: runRecord,
          providerManager: this.providerManager,
          storage: this.storage,
          logger,
          mode,
          locale
        }
      )) as Record<string, unknown>;
      this.runRepo.update(runId, 'completed', null, attempts + 1);
      return output;
    } catch (error) {
      console.error('Human gate failed', error);
      return null;
    }
  }
}
