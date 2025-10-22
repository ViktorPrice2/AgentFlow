import { renderTemplate, renderTemplateWithFallback } from '../../utils/template.js';
import { enrichWithProjectContext } from '../../utils/project.js';

const DEFAULT_LLM_INSTRUCTIONS =
  'You are an experienced marketing copywriter. Produce concise, engaging assets.';

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
  } catch (error) {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return null;
      }
    }

    return null;
  }
}

function mergeInputs(payload, config, ctx) {
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

  enrichWithProjectContext(merged, ctx, payload);

  return { merged, templates };
}

function selectOutputKeys(config, templates) {
  const paramsOutputs = Array.isArray(config?.params?.outputs) ? config.params.outputs : [];

  if (paramsOutputs.length > 0) {
    return paramsOutputs;
  }

  return Object.keys(templates).filter((key) => key !== 'summary');
}

function shouldUseLlm(agentConfig, ctx) {
  if (!ctx?.providers?.callLLM) {
    return false;
  }

  const engine = agentConfig?.engine;
  if (!engine || engine.provider === 'mock') {
    return false;
  }

  if (agentConfig?.params?.llm === false) {
    return false;
  }

  return true;
}

function buildLlmPrompt({ merged, agentConfig, outputKeys, templates }) {
  const explicitPrompt =
    (typeof agentConfig?.templates?.llmPrompt === 'string' && agentConfig.templates.llmPrompt) ||
    (typeof agentConfig?.params?.llmPrompt === 'string' && agentConfig.params.llmPrompt);

  if (explicitPrompt) {
    return renderTemplate(explicitPrompt, {
      ...merged,
      outputs: outputKeys
    });
  }

  const summaryTemplate =
    typeof templates.summary === 'string' || typeof agentConfig.params?.summaryTemplate === 'string';

  return [
    agentConfig?.instructions || DEFAULT_LLM_INSTRUCTIONS,
    '',
    'Return a valid JSON object (no extra commentary) with the following fields:',
    `- Required outputs: ${outputKeys.join(', ')}`,
    summaryTemplate ? '- Optional field "summary" to describe the generated assets.' : null,
    '',
    'Context JSON:',
    JSON.stringify(merged, null, 2)
  ]
    .filter(Boolean)
    .join('\n');
}

export async function execute(payload, ctx) {
  const agentConfig = ctx.getAgentConfig?.('WriterAgent');

  if (!agentConfig) {
    throw new Error('WriterAgent configuration not found');
  }

  const { merged, templates } = mergeInputs(payload, agentConfig, ctx);
  const outputKeys = selectOutputKeys(agentConfig, templates);
  const generated = {};
  let llmUsed = false;
  let llmSummary = null;
  let llmMetadata = null;

  if (shouldUseLlm(agentConfig, ctx)) {
    try {
      const prompt = buildLlmPrompt({ merged, agentConfig, outputKeys, templates });
      const response = await ctx.providers.callLLM('WriterAgent', {
        messages: [
          {
            role: 'system',
            content: agentConfig.instructions || DEFAULT_LLM_INSTRUCTIONS
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
        outputKeys.forEach((key) => {
          const value = parsed[key];
          if (typeof value === 'string' && value.trim().length > 0) {
            generated[key] = value.trim();
          }
        });

        if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
          llmSummary = parsed.summary.trim();
        }

        llmUsed = true;
        llmMetadata = {
          providerId: response?.providerId ?? null,
          model: response?.model ?? agentConfig.engine?.model ?? null,
          mode: response?.mode ?? null
        };

        await ctx.log?.('agent:writer:llm:used', {
          runId: ctx.runId,
          provider: llmMetadata.providerId,
          model: llmMetadata.model,
          outputs: outputKeys
        });
      } else {
        await ctx.log?.('agent:writer:llm:parse_error', {
          runId: ctx.runId,
          provider: response?.providerId ?? null,
          model: response?.model ?? null,
          content: response?.content ?? null
        });
      }
    } catch (error) {
      await ctx.log?.('agent:writer:llm:error', {
        runId: ctx.runId,
        message: error?.message,
        code: error?.code
      });
    }
  }

  outputKeys.forEach((key) => {
    if (typeof generated[key] === 'string') {
      return;
    }

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

  const summary = llmSummary
    ? llmSummary
    : renderTemplateWithFallback(
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
      producedAt: new Date().toISOString(),
      mode: llmUsed ? 'llm' : 'template',
      llm: llmMetadata
    }
  };

  if (summary) {
    writerPayload.summary = summary;
  }

  await ctx.log?.('agent:writer:completed', {
    runId: ctx.runId,
    outputs: Object.keys(generated),
    mode: writerPayload.writer.mode,
    provider: llmMetadata?.providerId ?? null
  });

  return writerPayload;
}
