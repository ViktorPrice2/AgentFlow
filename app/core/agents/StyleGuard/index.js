import { getValueByPath, renderTemplate, renderTemplateWithFallback } from '../../utils/template.js';

const DEFAULT_LLM_REVIEW_PROMPT =
  'You are a marketing compliance reviewer. Evaluate the provided copy quality report.';

function sanitizeJsonBlock(rawContent = '') {
  if (typeof rawContent !== 'string') {
    return null;
  }

  const fencedMatch = rawContent.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : rawContent;
  const trimmed = candidate.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}

function mergeInputs(payload, config) {
  const override = payload?.override && typeof payload.override === 'object' ? payload.override : {};
  const overrideParams =
    override.params && typeof override.params === 'object' ? override.params : {};
  const configParams = config?.params && typeof config.params === 'object' ? config.params : {};

  const merged = {
    ...configParams,
    ...(payload || {}),
    ...overrideParams
  };

  const templates = {
    ...(config?.templates || {}),
    ...(override.templates || {})
  };

  const rules = [
    ...(Array.isArray(config?.params?.rules) ? config.params.rules : []),
    ...(Array.isArray(override.rules) ? override.rules : [])
  ];

  return { merged, templates, rules };
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

function evaluateRule(rule, data, templates) {
  const value = getValueByPath(data, rule.path);
  let passed = true;
  const reasons = [];
  const context = { ...data, rule, value };

  if (rule.disallow) {
    const disallowList = toArray(rule.disallow).map((entry) => String(entry).toLowerCase());
    const valueString = typeof value === 'string' ? value.toLowerCase() : '';
    const matchedToken = disallowList.find((token) => valueString.includes(token));

    if (matchedToken) {
      passed = false;
      const reason = renderTemplateWithFallback(
        templates[rule.reasonKey],
        rule.reasonTemplate,
        { ...context, matchedToken }
      );

      if (reason) {
        reasons.push(reason);
      }
    }
  }

  if (passed && rule.mustInclude) {
    const includeList = toArray(rule.mustInclude).map((entry) => String(entry).toLowerCase());
    const valueString = typeof value === 'string' ? value.toLowerCase() : '';
    const missingToken = includeList.find((token) => !valueString.includes(token));

    if (missingToken) {
      passed = false;
      const reason = renderTemplateWithFallback(
        templates[rule.reasonKey],
        rule.reasonTemplate,
        { ...context, missingToken }
      );

      if (reason) {
        reasons.push(reason);
      }
    }
  }

  if (passed && rule.equals !== undefined) {
    const expected = rule.equals;
    const matches = Array.isArray(expected)
      ? expected.some((candidate) => renderTemplate(String(candidate), context) === String(value ?? ''))
      : String(value ?? '') === renderTemplate(String(expected), context);

    if (!matches) {
      passed = false;
      const reason = renderTemplateWithFallback(
        templates[rule.reasonKey],
        rule.reasonTemplate,
        { ...context, expected }
      );

      if (reason) {
        reasons.push(reason);
      }
    }
  }

  if (passed && typeof rule.maxLength === 'number') {
    const valueString = typeof value === 'string' ? value : '';
    if (valueString.length > rule.maxLength) {
      passed = false;
      const reason = renderTemplateWithFallback(
        templates[rule.reasonKey],
        rule.reasonTemplate,
        { ...context, maxLength: rule.maxLength, length: valueString.length }
      );

      if (reason) {
        reasons.push(reason);
      }
    }
  }

  if (passed && typeof rule.minLength === 'number') {
    const valueString = typeof value === 'string' ? value : '';
    if (valueString.length < rule.minLength) {
      passed = false;
      const reason = renderTemplateWithFallback(
        templates[rule.reasonKey],
        rule.reasonTemplate,
        { ...context, minLength: rule.minLength, length: valueString.length }
      );

      if (reason) {
        reasons.push(reason);
      }
    }
  }

  return {
    id: rule.id || rule.path,
    pass: passed,
    reasons
  };
}

function shouldUseLlm(agentConfig, ctx) {
  if (!ctx?.providers?.callLLM) {
    return false;
  }

  const engine = agentConfig?.engine;
  if (!engine || engine.provider === 'mock') {
    return false;
  }

  if (agentConfig?.params?.llmReview === false) {
    return false;
  }

  return true;
}

function buildReviewPrompt({ merged, evaluations, agentConfig }) {
  const explicitPrompt =
    (typeof agentConfig?.templates?.llmPrompt === 'string' && agentConfig.templates.llmPrompt) ||
    (typeof agentConfig?.params?.llmPrompt === 'string' && agentConfig.params.llmPrompt);

  if (explicitPrompt) {
    return renderTemplate(explicitPrompt, { ...merged, evaluations });
  }

  return [
    agentConfig?.instructions || DEFAULT_LLM_REVIEW_PROMPT,
    '',
    'Assess the supplied evaluation results for marketing copy. Respond in JSON with fields:',
    '- verdict: "pass" or "fail"',
    '- summary: short natural language explanation (1-2 sentences)',
    '- suggestions: optional array with improvement tips (strings)',
    '',
    'Evaluation results JSON:',
    JSON.stringify(evaluations, null, 2),
    '',
    'Context JSON:',
    JSON.stringify(merged, null, 2)
  ].join('\n');
}

export async function execute(payload, ctx) {
  const agentConfig = ctx.getAgentConfig?.('StyleGuard');

  if (!agentConfig) {
    throw new Error('StyleGuard configuration not found');
  }

  const { merged, templates, rules } = mergeInputs(payload, agentConfig);

  if (rules.length === 0) {
    throw new Error('StyleGuard rules are not configured');
  }

  const evaluations = rules.map((rule) => evaluateRule(rule, merged, templates));
  const failed = evaluations.filter((result) => !result.pass);
  const rulePass = failed.length === 0;
  let guardPassed = rulePass;
  let llmReview = null;

  if (shouldUseLlm(agentConfig, ctx)) {
    try {
      const prompt = buildReviewPrompt({ merged, evaluations, agentConfig });
      const response = await ctx.providers.callLLM('StyleGuard', {
        messages: [
          {
            role: 'system',
            content: agentConfig.instructions || DEFAULT_LLM_REVIEW_PROMPT
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        override: payload?.override?.engine
      });

      const parsed = sanitizeJsonBlock(response?.content);

      if (parsed && typeof parsed === 'object') {
        const verdict = typeof parsed.verdict === 'string' ? parsed.verdict.toLowerCase() : null;
        const summaryText = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
        const suggestions = Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((item) => typeof item === 'string' && item.trim().length > 0)
          : [];

        llmReview = {
          verdict: verdict === 'fail' ? 'fail' : 'pass',
          summary: summaryText || null,
          suggestions,
          providerId: response?.providerId ?? null,
          model: response?.model ?? agentConfig.engine?.model ?? null,
          mode: response?.mode ?? null
        };

        if (llmReview.verdict === 'fail') {
          guardPassed = false;
        }

        await ctx.log?.('agent:styleGuard:llm:used', {
          runId: ctx.runId,
          verdict: llmReview.verdict,
          provider: llmReview.providerId,
          model: llmReview.model
        });
      } else {
        await ctx.log?.('agent:styleGuard:llm:parse_error', {
          runId: ctx.runId,
          provider: response?.providerId ?? null,
          model: response?.model ?? null,
          content: response?.content ?? null
        });
      }
    } catch (error) {
      await ctx.log?.('agent:styleGuard:llm:error', {
        runId: ctx.runId,
        message: error?.message,
        code: error?.code
      });
    }
  }

  const summaryTemplateKey = guardPassed ? 'pass' : 'fail';
  const summary =
    llmReview?.summary ||
    renderTemplateWithFallback(
      templates[summaryTemplateKey],
      agentConfig.params?.[`${summaryTemplateKey}Template`],
      { ...merged, evaluations }
    );

  const guardPayload = {
    ...payload,
    guard: {
      pass: guardPassed,
      rulePass,
      results: evaluations,
      llm: llmReview
    }
  };

  if (summary) {
    guardPayload.summary = summary;
  }

  await ctx.log?.('agent:styleGuard:completed', {
    runId: ctx.runId,
    passed: guardPassed,
    failed: failed.map((entry) => entry.id),
    mode: llmReview ? 'rule+llm' : 'rule-only'
  });

  return guardPayload;
}
