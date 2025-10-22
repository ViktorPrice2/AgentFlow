import fs from 'node:fs';
import path from 'node:path';
import type { AgentModule } from '../../core/types.js';

const diagnosticAgent: AgentModule = {
  async execute(payload, ctx) {
    const runs = (payload.runs as Array<{ nodeId: string; status: string; attempts: number }>) ?? [];
    const logs = (payload.logs as Array<{ type: string; message: string }>) ?? [];

    const failing = runs.filter((run) => run.status === 'failed');
    const summaryLines = [
      `## Task ${ctx.task.id} diagnostics`,
      `- Total nodes: ${runs.length}`,
      `- Failures: ${failing.length}`,
      `- Retries: ${runs.reduce((acc, run) => acc + Math.max(0, run.attempts - 1), 0)}`,
      '',
      '### Recent logs'
    ];
    for (const entry of logs.slice(-10)) {
      summaryLines.push(`- [${entry.type}] ${entry.message}`);
    }

    const reportPath = path.resolve('docs/VerificationReport.md');
    const reportContent = `# Verification Report\n\n${summaryLines.join('\n')}\n`;
    fs.writeFileSync(reportPath, reportContent, 'utf-8');

    ctx.logger.info('Diagnostic report written', { path: reportPath });
    return { reportPath };
  }
};

export default diagnosticAgent;
