import fs from 'node:fs';
import path from 'node:path';
import type { AgentModule } from '../../core/types.js';

interface Rule {
  pattern: string;
  message: string;
}

interface GuardConfig {
  forbidden: Rule[];
  required: Rule[];
}

const configPath = path.resolve('app/config/guardRules.json');
const guardConfig: GuardConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const guardAgent: AgentModule = {
  async execute(payload, ctx) {
    const textSource = payload.dependencies
      ? (Object.values(payload.dependencies as Record<string, { text?: string }>).find(
          (entry) => typeof entry?.text === 'string'
        )?.text ?? '')
      : String(payload.text ?? '');

    const issues: string[] = [];
    for (const rule of guardConfig.forbidden) {
      const regex = new RegExp(rule.pattern, 'g');
      if (regex.test(textSource)) {
        issues.push(rule.message);
      }
    }

    for (const rule of guardConfig.required) {
      const regex = new RegExp(rule.pattern, 'g');
      if (!regex.test(textSource)) {
        issues.push(rule.message);
      }
    }

    const passed = issues.length === 0;
    ctx.logger.info('Validation complete', { passed, issues });
    return {
      passed,
      issues,
      suggestions: passed
        ? []
        : issues.map((issue) => `Consider revising content to address: ${issue}`)
    };
  }
};

export default guardAgent;
