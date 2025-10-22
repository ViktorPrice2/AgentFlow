import type { AgentLogger, LogLevel } from './types.js';
import type { LogRepository } from './repositories.js';

export class RunLogger implements AgentLogger {
  constructor(private readonly repo: LogRepository, private readonly runId: string) {}

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const fullMessage = meta ? `${message} | ${JSON.stringify(meta)}` : message;
    this.repo.create(this.runId, level, fullMessage);
  }
}
