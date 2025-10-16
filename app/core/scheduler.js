import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runPipeline } from './orchestrator.js';
import { createEntityStore } from './storage/entityStore.js';

const LOG_FILE = path.join(process.cwd(), 'data', 'logs', 'scheduler.jsonl');

function createFallbackCron() {
  return {
    validate(expression) {
      return (
        expression === '* * * * *' ||
        /^\*\/(\d{1,2}) \* \* \* \*$/.test(expression) ||
        /^0 \* \* \* \*$/.test(expression)
      );
    },
    schedule(expression, callback, options = {}) {
      const everyMatch = expression.match(/^\*\/(\d{1,2}) \* \* \* \*$/);
      const hourlyMatch = expression === '0 * * * *';
      const minutes = everyMatch ? Math.max(parseInt(everyMatch[1], 10), 1) : hourlyMatch ? 60 : 1;
      const intervalMs = minutes * 60 * 1000;

      let timer = null;
      let next = new Date(Date.now() + intervalMs);

      const task = {
        start() {
          if (timer) {
            return;
          }

          timer = setInterval(() => {
            next = new Date(Date.now() + intervalMs);
            Promise.resolve()
              .then(() => callback())
              .catch(() => {});
          }, intervalMs);

          if (options.runOnInit) {
            Promise.resolve()
              .then(() => callback())
              .catch(() => {});
          }
        },
        stop() {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        },
        nextDates() {
          return next || new Date(Date.now() + intervalMs);
        }
      };

      if (options.scheduled !== false) {
        task.start();
      }

      return task;
    }
  };
}

let cron;

try {
  const imported = await import('node-cron');
  cron = imported.default ?? imported;
} catch (error) {
  console.warn('node-cron недоступен, используется резервный планировщик:', error.message);
  cron = createFallbackCron();
}

async function appendLog(event, data = {}, logFile = LOG_FILE) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    data
  };

  const logDir = path.dirname(logFile);
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

function resolveNextRun(task) {
  if (!task || typeof task.nextDates !== 'function') {
    return null;
  }

  try {
    const next = task.nextDates();

    if (!next) {
      return null;
    }

    if (typeof next.toDate === 'function') {
      const asDate = next.toDate();
      return asDate instanceof Date ? asDate.toISOString() : null;
    }

    if (next instanceof Date) {
      return next.toISOString();
    }

    if (typeof next.toISOString === 'function') {
      return next.toISOString();
    }
  } catch (error) {
    // noop — invalid cron iteration
  }

  return null;
}

export function createScheduler(options = {}) {
  const {
    pluginRegistry,
    providerManager,
    entityStore = createEntityStore(),
    logFile = LOG_FILE
  } = options;

  if (!pluginRegistry) {
    throw new Error('Scheduler requires a plugin registry');
  }

  if (!providerManager) {
    throw new Error('Scheduler requires provider manager');
  }

  const jobs = new Map();
  let running = false;
  let startedAt = null;
  let lastRunAt = null;

  async function log(event, data = {}) {
    await appendLog(event, data, logFile);
  }

  async function updateNextRunMetadata(scheduleId, task) {
    const nextRun = resolveNextRun(task);

    await entityStore.updateScheduleNextRun(scheduleId, nextRun);
  }

  async function runScheduledPipeline(scheduleId, context = {}) {
    const schedule = entityStore.getScheduleById(scheduleId);

    if (!schedule) {
      await log('scheduler.missingSchedule', { scheduleId });
      return;
    }

    if (!schedule.enabled) {
      await log('scheduler.skipDisabled', { scheduleId });
      return;
    }

    const pipelineRecord = entityStore.getPipelineById(schedule.pipelineId);

    if (!pipelineRecord) {
      await log('scheduler.missingPipeline', {
        scheduleId,
        pipelineId: schedule.pipelineId
      });
      return;
    }

    const pipelineDefinition = pipelineRecord.payload || pipelineRecord;
    const agentConfigs = entityStore.buildAgentConfigMap();
    const runId = randomUUID();

    await log('scheduler.run.start', {
      scheduleId,
      pipelineId: schedule.pipelineId,
      projectId: schedule.projectId,
      runId
    });

    try {
      const result = await runPipeline(
        {
          ...pipelineDefinition,
          id: pipelineDefinition.id || pipelineRecord.id
        },
        {
          scheduleId,
          projectId: schedule.projectId,
          context
        },
        { pluginRegistry, providerManager, agentConfigs, runId }
      );

      lastRunAt = new Date().toISOString();

      await log('scheduler.run.completed', {
        scheduleId,
        pipelineId: schedule.pipelineId,
        runId: result.runId,
        status: result.status
      });
    } catch (error) {
      lastRunAt = new Date().toISOString();

      await log('scheduler.run.failed', {
        scheduleId,
        pipelineId: schedule.pipelineId,
        message: error.message,
        stack: error.stack
      });
    } finally {
      const task = jobs.get(scheduleId);

      if (task) {
        await updateNextRunMetadata(scheduleId, task);
      }
    }
  }

  function stopAllJobs() {
    jobs.forEach((task) => {
      try {
        task.stop();
      } catch (error) {
        // ignore
      }
    });

    jobs.clear();
  }

  async function registerSchedule(schedule) {
    if (!schedule.enabled) {
      return;
    }

    if (!cron.validate(schedule.cron)) {
      await log('scheduler.invalidCron', {
        scheduleId: schedule.id,
        cron: schedule.cron
      });
      return;
    }

    const existing = jobs.get(schedule.id);

    if (existing) {
      existing.stop();
      jobs.delete(schedule.id);
    }

    const task = cron.schedule(
      schedule.cron,
      () => {
        runScheduledPipeline(schedule.id).catch((error) => {
          log('scheduler.callbackError', {
            scheduleId: schedule.id,
            message: error.message
          });
        });
      },
      { scheduled: false }
    );

    task.start();
    jobs.set(schedule.id, task);

    await updateNextRunMetadata(schedule.id, task);
  }

  async function refreshJobs(filter = {}) {
    const schedules = entityStore.listSchedules(filter);

    stopAllJobs();

    if (!running) {
      return;
    }

    for (const schedule of schedules) {
      // eslint-disable-next-line no-await-in-loop
      await registerSchedule(schedule);
    }
  }

  return {
    async start() {
      if (running) {
        return;
      }

      running = true;
      startedAt = new Date().toISOString();
      await refreshJobs();
      await log('scheduler.started', {});
    },
    async stop() {
      if (!running) {
        return;
      }

      running = false;
      stopAllJobs();
      await log('scheduler.stopped', {});
    },
    async reload(projectId) {
      await refreshJobs(projectId ? { projectId } : {});
    },
    async list(projectId) {
      return entityStore.listSchedules(projectId ? { projectId } : {});
    },
    async upsert(schedule) {
      const stored = entityStore.saveSchedule(schedule);

      if (running) {
        await registerSchedule(stored);
      }

      await log('scheduler.schedule.upserted', {
        scheduleId: stored.id,
        pipelineId: stored.pipelineId
      });

      return stored;
    },
    async remove(scheduleId) {
      const task = jobs.get(scheduleId);

      if (task) {
        task.stop();
        jobs.delete(scheduleId);
      }

      entityStore.deleteSchedule(scheduleId);
      await log('scheduler.schedule.removed', { scheduleId });
    },
    async toggle(scheduleId, enabled) {
      entityStore.setScheduleEnabled(scheduleId, enabled);
      const schedule = entityStore.getScheduleById(scheduleId);

      if (!schedule) {
        return null;
      }

      if (enabled) {
        if (running) {
          await registerSchedule(schedule);
        }
      } else if (jobs.has(scheduleId)) {
        const task = jobs.get(scheduleId);
        task.stop();
        jobs.delete(scheduleId);
        await entityStore.updateScheduleNextRun(scheduleId, null);
      }

      await log('scheduler.schedule.toggled', { scheduleId, enabled });

      return schedule;
    },
    async runNow(scheduleId, context = {}) {
      await runScheduledPipeline(scheduleId, { ...context, manual: true });
    },
    status() {
      return {
        running,
        startedAt,
        lastRunAt,
        jobs: jobs.size
      };
    }
  };
}

export function registerSchedulerIpcHandlers(ipcMain, scheduler) {
  if (!ipcMain) {
    throw new Error('ipcMain is required to register scheduler handlers');
  }

  if (!scheduler) {
    throw new Error('Scheduler instance is required');
  }

  ipcMain.handle('AgentFlow:schedules:list', async (_event, filter = {}) => {
    try {
      const schedules = await scheduler.list(filter.projectId);
      return { ok: true, schedules };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:schedules:upsert', async (_event, schedule) => {
    try {
      const stored = await scheduler.upsert(schedule);
      return { ok: true, schedule: stored };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:schedules:delete', async (_event, scheduleId) => {
    try {
      await scheduler.remove(scheduleId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:schedules:toggle', async (_event, payload) => {
    try {
      const { id, enabled } = payload || {};
      const schedule = await scheduler.toggle(id, enabled);
      return { ok: true, schedule };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:schedules:runNow', async (_event, scheduleId) => {
    try {
      await scheduler.runNow(scheduleId, { origin: 'ipc' });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('AgentFlow:schedules:status', async () => {
    try {
      const status = scheduler.status();
      return { ok: true, status };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}
