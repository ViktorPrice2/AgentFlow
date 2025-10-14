import { getValueByPath, renderTemplate, renderTemplateWithFallback } from '../../utils/template.js';

function mergeInputs(payload, config) {
  const override = payload?.override && typeof payload.override === 'object' ? payload.override : {};
  const overrideParams =
    override.params && typeof override.params === 'object' ? override.params : {};
  const configParams = config?.params && typeof config.params === 'object' ? config.params : {};

  const merged = {
    ...(payload || {}),
    ...configParams,
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

  return {
    id: rule.id || rule.path,
    pass: passed,
    reasons
  };
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
  const guardPassed = failed.length === 0;

  const summaryTemplateKey = guardPassed ? 'pass' : 'fail';
  const summary = renderTemplateWithFallback(
    templates[summaryTemplateKey],
    agentConfig.params?.[`${summaryTemplateKey}Template`],
    { ...merged, evaluations }
  );

  await ctx.log?.('agent:styleGuard:completed', {
    runId: ctx.runId,
    passed: guardPassed,
    failed: failed.map((entry) => entry.id)
  });

  const guardPayload = {
    ...payload,
    guard: {
      pass: guardPassed,
      results: evaluations
    }
  };

  if (summary) {
    guardPayload.summary = summary;
  }

  return guardPayload;
}
