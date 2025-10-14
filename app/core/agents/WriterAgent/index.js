import { renderTemplate, renderTemplateWithFallback } from '../../utils/template.js';

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

  return { merged, templates };
}

function selectOutputKeys(config, templates) {
  const paramsOutputs = Array.isArray(config?.params?.outputs) ? config.params.outputs : [];

  if (paramsOutputs.length > 0) {
    return paramsOutputs;
  }

  return Object.keys(templates).filter((key) => key !== 'summary');
}

export async function execute(payload, ctx) {
  const agentConfig = ctx.getAgentConfig?.('WriterAgent');

  if (!agentConfig) {
    throw new Error('WriterAgent configuration not found');
  }

  const { merged, templates } = mergeInputs(payload, agentConfig);
  const outputKeys = selectOutputKeys(agentConfig, templates);
  const generated = {};

  outputKeys.forEach((key) => {
    const templateDescriptor = templates[key];

    if (typeof templateDescriptor === 'string') {
      generated[key] = renderTemplate(templateDescriptor, { ...merged, outputKey: key });
    } else if (
      templateDescriptor &&
      typeof templateDescriptor === 'object' &&
      typeof templateDescriptor.template === 'string'
    ) {
      generated[key] = renderTemplate(templateDescriptor.template, {
        ...merged,
        outputKey: key
      });
    }
  });

  const summary = renderTemplateWithFallback(
    templates.summary,
    agentConfig.params?.summaryTemplate,
    { ...merged, generated }
  );

  await ctx.log?.('agent:writer:completed', {
    runId: ctx.runId,
    outputs: Object.keys(generated)
  });

  const writerPayload = {
    ...payload,
    writer: {
      outputs: generated,
      agentId: agentConfig.id ?? agentConfig.name ?? 'WriterAgent',
      producedAt: new Date().toISOString()
    }
  };

  if (summary) {
    writerPayload.summary = summary;
  }

  return writerPayload;
}
