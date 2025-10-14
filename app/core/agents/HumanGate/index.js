import { renderTemplateWithFallback } from '../../utils/template.js';

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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

  return { merged, templates, override };
}

function resolveBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase();

    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

export async function execute(payload, ctx) {
  const agentConfig = ctx.getAgentConfig?.('HumanGate');

  if (!agentConfig) {
    throw new Error('HumanGate configuration not found');
  }

  const { merged, templates, override } = mergeInputs(payload, agentConfig);
  const autoApprove = resolveBoolean(
    override.autoApprove ?? agentConfig.params?.autoApprove,
    true
  );
  const delayMs = Number.parseInt(
    override.delayMs ?? agentConfig.params?.delayMs ?? 0,
    10
  );

  if (delayMs > 0 && Number.isFinite(delayMs)) {
    await sleep(delayMs);
  }

  const note = renderTemplateWithFallback(
    autoApprove ? templates.approved : templates.pending,
    autoApprove ? agentConfig.params?.approvedTemplate : agentConfig.params?.pendingTemplate,
    { ...merged, autoApprove }
  );

  const status = renderTemplateWithFallback(
    templates.status,
    agentConfig.params?.statusTemplate,
    { ...merged, autoApprove }
  );

  await ctx.log?.('agent:humanGate:decision', {
    runId: ctx.runId,
    approved: autoApprove
  });

  return {
    ...payload,
    human: {
      required: true,
      approved: autoApprove,
      decidedAt: new Date().toISOString(),
      note: note || null,
      status: status || null
    }
  };
}
