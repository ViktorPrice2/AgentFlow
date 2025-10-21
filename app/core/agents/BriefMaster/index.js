import { loadPreset } from '../../presets/loader.js';
import { normalizeChannels } from '../../utils/channels.js';

function toLowerSet(items) {
  const set = new Set();
  (items || []).forEach((item) => {
    if (typeof item === 'string') {
      set.add(item.toLowerCase());
    }
  });
  return set;
}

function collectMissingQuestions(survey, answers = {}, attention = {}) {
  if (!survey) {
    return [];
  }

  const missing = new Set(Array.isArray(attention.missingFields) ? attention.missingFields : []);
  const result = [];

  (survey.sections || []).forEach((section) => {
    (section.questions || []).forEach((question) => {
      if (!question) {
        return;
      }

      const key = question.id || question.prompt;
      if (!key) {
        return;
      }

      if (question.required) {
        const answer = answers[key];
        const answered =
          answer !== undefined &&
          answer !== null &&
          !(typeof answer === 'string' && answer.trim().length === 0);

        if (!answered) {
          missing.add(key);
          result.push({
            id: key,
            prompt: question.prompt || key,
            section: section.title || section.id || null
          });
        }
      }
    });
  });

  if (result.length === 0 && missing.size > 0) {
    missing.forEach((id) => {
      result.push({ id, prompt: id, section: null });
    });
  }

  return result;
}

function collectAgentSuggestions(project, preset) {
  const suggestions = [];
  const projectChannels = normalizeChannels(project.channels);

  if (!preset || projectChannels.length === 0) {
    return suggestions;
  }

  const agentTags = new Set();
  (preset.agents || []).forEach((agent) => {
    if (!agent) {
      return;
    }

    if (Array.isArray(agent.tags)) {
      agent.tags.forEach((tag) => {
        if (typeof tag === 'string') {
          agentTags.add(tag.toLowerCase());
        }
      });
    }

    if (typeof agent.type === 'string' && agent.type) {
      agentTags.add(agent.type.toLowerCase());
    }
  });

  projectChannels.forEach((channel) => {
    const normalized = channel.toLowerCase();
    if (!agentTags.has(normalized)) {
      suggestions.push({
        type: 'agent',
        channel,
        message: `Добавить агента или шаблон для канала “${channel}”.`
      });
    }
  });

  return suggestions;
}

function collectPipelineSuggestions(project, preset) {
  const suggestions = [];
  const projectChannels = normalizeChannels(project.channels);
  if (!preset || projectChannels.length === 0) {
    return suggestions;
  }

  const pipelineNames = toLowerSet((preset.pipelines || []).map((pipeline) => pipeline?.name || pipeline?.id));

  projectChannels.forEach((channel) => {
    const normalized = channel.toLowerCase();
    const matched = Array.from(pipelineNames).some((name) => name.includes(normalized));

    if (!matched) {
      suggestions.push({
        type: 'pipeline',
        channel,
        message: `Создать сценарий для канала “${channel}”, чтобы автоматически использовать бриф.`
      });
    }
  });

  return suggestions;
}

function buildDraftSummary(draft, project) {
  const suggestionCount = draft.suggestions.length;
  const questionsCount = draft.additionalQuestions.length;
  const projectName = project?.name || project?.id || 'проект';

  const parts = [`Анализ брифа для ${projectName}.`];
  parts.push(`Найдено рекомендаций: ${suggestionCount}.`);
  if (questionsCount > 0) {
    parts.push(`Дополнительные вопросы: ${questionsCount}.`);
  }

  if (draft.suggestions.length > 0) {
    const topSuggestion = draft.suggestions[0];
    if (topSuggestion?.message) {
      parts.push(`Приоритет: ${topSuggestion.message}`);
    }
  }

  return parts.join(' ');
}

async function resolvePreset(payload, ctxProject) {
  const presetFromPayload = payload.preset && typeof payload.preset === 'object' ? payload.preset : null;
  const presetId =
    payload.presetId ||
    presetFromPayload?.meta?.id ||
    ctxProject?.presetId ||
    (ctxProject?.industry ? `${ctxProject.industry}` : null) ||
    'generic';

  if (presetFromPayload) {
    return { presetId, preset: presetFromPayload, version: presetFromPayload.version || null };
  }

  try {
    const entry = await loadPreset(presetId);
    return { presetId: entry.id, preset: entry.preset, version: entry.version };
  } catch (error) {
    return { presetId, preset: null, version: null, error };
  }
}

export async function execute(payload = {}, ctx = {}) {
  const project = ctx.project || payload.project || {};
  const presetResolution = await resolvePreset(payload, project);
  const preset = presetResolution.preset;
  const presetVersion = presetResolution.version;
  const presetId = presetResolution.presetId;

  const answers = payload.answers || payload.brief || {};
  const attention = payload.needsAttention || project.needsAttention || {};
  const additionalQuestions = collectMissingQuestions(preset?.survey, answers, attention);
  const suggestions = [
    ...collectAgentSuggestions(project, preset),
    ...collectPipelineSuggestions(project, preset)
  ];

  const draft = {
    presetId,
    presetVersion,
    generatedAt: new Date().toISOString(),
    additionalQuestions,
    suggestions,
    presetMeta: preset?.meta
      ? {
          id: preset.meta.id || null,
          name: preset.meta.name || null,
          industry: preset.meta.industry || null
        }
      : null
  };

  if (typeof ctx.updatePresetDraft === 'function') {
    try {
      await ctx.updatePresetDraft(draft);
    } catch (error) {
      await ctx.log?.('agent:briefmaster:presetDraft:error', {
        runId: ctx.runId,
        message: error?.message
      });
    }
  }

  let llmSummary = null;
  if (ctx.providers?.callLLM) {
    try {
      const response = await ctx.providers.callLLM('BriefMaster', {
        mode: 'analysis',
        messages: [
          {
            role: 'system',
            content:
              'Ты помощник-аналитик. Кратко перечисли главные рекомендации по обновлению пресета и уточнения для брифа.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              project: {
                id: project.id,
                name: project.name,
                industry: project.industry,
                channels: normalizeChannels(project.channels)
              },
              suggestions,
              additionalQuestions
            })
          }
        ]
      });

      if (response?.content && typeof response.content === 'string') {
        const trimmed = response.content.trim();
        if (trimmed) {
          llmSummary = trimmed;
        }
      }
    } catch (error) {
      await ctx.log?.('agent:briefmaster:llm:error', {
        runId: ctx.runId,
        message: error?.message,
        code: error?.code || null
      });
    }
  }

  const summary = llmSummary || buildDraftSummary(draft, project);

  await ctx.log?.('agent:briefmaster:completed', {
    runId: ctx.runId,
    presetId,
    suggestions: suggestions.length,
    additionalQuestions: additionalQuestions.length,
    usedLLM: Boolean(llmSummary)
  });

  return {
    ...payload,
    briefMaster: {
      presetId,
      presetVersion,
      suggestions,
      additionalQuestions,
      summary,
      usedLLM: Boolean(llmSummary),
      presetMeta: draft.presetMeta
    },
    summary
  };
}
