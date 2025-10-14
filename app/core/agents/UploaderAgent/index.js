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

  return { merged, templates, override };
}

function getDestinations(config, override) {
  const baseline = Array.isArray(config?.params?.destinations) ? config.params.destinations : [];

  if (Array.isArray(override.destinations) && override.destinations.length > 0) {
    return override.destinations;
  }

  return baseline;
}

export async function execute(payload, ctx) {
  const agentConfig = ctx.getAgentConfig?.('UploaderAgent');

  if (!agentConfig) {
    throw new Error('UploaderAgent configuration not found');
  }

  const { merged, templates, override } = mergeInputs(payload, agentConfig);
  const destinations = getDestinations(agentConfig, override);

  if (destinations.length === 0) {
    throw new Error('UploaderAgent destinations are not defined');
  }

  const uploaded = [];

  for (const destination of destinations) {
    const relPathTemplate =
      typeof destination.pathTemplate === 'string'
        ? destination.pathTemplate
        : destination.path;

    const templateKey =
      destination.templateKey ||
      (destination.template && typeof destination.template === 'string' ? destination.template : undefined);

    const contentTemplate =
      typeof destination.inlineTemplate === 'string'
        ? destination.inlineTemplate
        : templates[templateKey];

    if (!relPathTemplate || !contentTemplate) {
      continue;
    }

    const contentData = {
      ...merged,
      destination
    };

    const relativePath = renderTemplate(relPathTemplate, contentData);
    const fileContent = renderTemplate(contentTemplate, contentData);

    if (!relativePath) {
      continue;
    }

    const artifactInfo = await ctx.setArtifact(relativePath, fileContent);

    uploaded.push({
      id: destination.id || relativePath,
      path: artifactInfo.relativePath,
      templateKey,
      timestamp: new Date().toISOString()
    });
  }

  const statusTemplate = renderTemplateWithFallback(
    templates.status,
    agentConfig.params?.statusTemplate,
    { ...merged, uploaded }
  );

  const summaryTemplate = renderTemplateWithFallback(
    templates.summary,
    agentConfig.params?.summaryTemplate,
    { ...merged, uploaded }
  );

  await ctx.log?.('agent:uploader:completed', {
    runId: ctx.runId,
    items: uploaded.map((item) => item.id)
  });

  const uploaderPayload = {
    ...payload,
    uploader: {
      items: uploaded,
      status: statusTemplate || agentConfig.params?.defaultStatus || null
    }
  };

  if (summaryTemplate) {
    uploaderPayload.summary = summaryTemplate;
  }

  return uploaderPayload;
}
