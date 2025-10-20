class IndustryPresetValidationError extends Error {
  constructor(message, path) {
    const suffix = path ? ` (at ${path})` : '';
    super(`${message}${suffix}`);
    this.name = 'IndustryPresetValidationError';
    this.path = path;
    this.code = 'PRESET_INVALID_SCHEMA';
  }
}

const ROOT_KEYS = new Set(['version', 'meta', 'survey', 'agents', 'pipelines', 'postProcessing', 'llmAssist']);
const META_KEYS = new Set([
  'id',
  'name',
  'industry',
  'description',
  'tags',
  'createdAt',
  'updatedAt',
  'versionNotes',
  'maintainers',
  'metadata'
]);
const QUESTION_OPTION_KEYS = new Set(['id', 'label', 'value', 'description', 'followUps', 'metadata']);
const QUESTION_KEYS = new Set([
  'id',
  'type',
  'prompt',
  'title',
  'description',
  'placeholder',
  'required',
  'defaultValue',
  'options',
  'metadata'
]);
const SURVEY_SECTION_KEYS = new Set(['id', 'title', 'description', 'helpText', 'questions', 'metadata']);
const SURVEY_KEYS = new Set(['version', 'introduction', 'completion', 'sections', 'metadata']);
const AGENT_KEYS = new Set(['id', 'name', 'type', 'description', 'version', 'tags', 'config', 'entrypoint', 'metadata']);
const PIPELINE_NODE_KEYS = new Set(['id', 'type', 'config', 'metadata']);
const PIPELINE_EDGE_KEYS = new Set(['id', 'source', 'from', 'target', 'to', 'condition', 'metadata']);
const PIPELINE_KEYS = new Set(['id', 'name', 'description', 'version', 'nodes', 'edges', 'metadata']);
const POST_PROCESSING_STEP_KEYS = new Set(['id', 'type', 'config', 'enabled', 'metadata']);
const POST_PROCESSING_KEYS = new Set(['steps', 'metadata']);
const LLM_ASSIST_PROVIDER_KEYS = new Set(['providerId', 'model', 'mode', 'temperature', 'maxTokens', 'metadata']);
const LLM_ASSIST_KEYS = new Set(['summary', 'instructions', 'providers', 'hints', 'metadata']);

const QUESTION_TYPES = new Set([
  'text',
  'textarea',
  'select',
  'multiselect',
  'boolean',
  'number',
  'rating',
  'email',
  'channels',
  'industry',
  'custom'
]);

function throwValidationError(path, message) {
  throw new IndustryPresetValidationError(message, path);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensurePlainObject(value, path, { optional = false } = {}) {
  if (value === undefined) {
    if (optional) {
      return undefined;
    }

    throwValidationError(path, 'is required');
  }

  if (!isPlainObject(value)) {
    throwValidationError(path, 'must be an object');
  }

  return value;
}

function ensureAllowedKeys(object, allowedKeys, path) {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throwValidationError(path, `contains unsupported property "${key}"`);
    }
  }
}

function parseString(value, path, { minLength = 0, optional = false, trim = false } = {}) {
  if (value === undefined) {
    if (optional) {
      return undefined;
    }

    throwValidationError(path, 'is required');
  }

  if (value === null) {
    throwValidationError(path, 'must be a string');
  }

  if (typeof value !== 'string') {
    throwValidationError(path, 'must be a string');
  }

  const result = trim ? value.trim() : value;

  if (result.length < minLength) {
    throwValidationError(path, `must be at least ${minLength} character${minLength === 1 ? '' : 's'} long`);
  }

  return result;
}

function parseOptionalString(value, path, options = {}) {
  return parseString(value, path, { ...options, optional: true });
}

function parseBoolean(value, path, { optional = false } = {}) {
  if (value === undefined) {
    if (optional) {
      return undefined;
    }

    throwValidationError(path, 'is required');
  }

  if (value === null) {
    throwValidationError(path, 'must be a boolean');
  }

  if (typeof value !== 'boolean') {
    throwValidationError(path, 'must be a boolean');
  }

  return value;
}

function parseNumber(value, path, { optional = false } = {}) {
  if (value === undefined) {
    if (optional) {
      return undefined;
    }

    throwValidationError(path, 'is required');
  }

  if (value === null) {
    throwValidationError(path, 'must be a number');
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throwValidationError(path, 'must be a number');
  }

  return value;
}

function parseStringOrNumber(value, path, { optional = false } = {}) {
  if (value === undefined) {
    if (optional) {
      return undefined;
    }

    throwValidationError(path, 'is required');
  }

  if (value === null) {
    throwValidationError(path, 'must be a string or number');
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throwValidationError(path, 'must not be NaN');
    }

    return value;
  }

  if (typeof value === 'string') {
    if (!value.length) {
      throwValidationError(path, 'must be a non-empty string');
    }

    return value;
  }

  throwValidationError(path, 'must be a string or number');
}

function parseStringArray(value, path, { optional = false, minLength = 0 } = {}) {
  const result = parseArray(value, path, (item, itemPath) => parseString(item, itemPath), {
    optional,
    minLength
  });

  return result;
}

function parseArray(value, path, parseItem, { optional = false, minLength = 0, defaultValue } = {}) {
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return [...defaultValue];
    }

    if (optional) {
      return undefined;
    }

    throwValidationError(path, 'is required');
  }

  if (value === null) {
    throwValidationError(path, 'must be an array');
  }

  if (!Array.isArray(value)) {
    throwValidationError(path, 'must be an array');
  }

  const result = value.map((item, index) => parseItem(item, `${path}[${index}]`));

  if (result.length < minLength) {
    throwValidationError(path, `must contain at least ${minLength} item${minLength === 1 ? '' : 's'}`);
  }

  return result;
}

function parseMetadata(value, path) {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throwValidationError(path, 'must be an object');
  }

  return { ...value };
}

function parseQuestionOption(option, path) {
  const object = ensurePlainObject(option, path);
  ensureAllowedKeys(object, QUESTION_OPTION_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const label = parseString(object.label, `${path}.label`, { minLength: 1 });
  const value = parseOptionalString(object.value, `${path}.value`, { minLength: 1, trim: true });
  const description = parseOptionalString(object.description, `${path}.description`);
  const followUps = parseArray(object.followUps, `${path}.followUps`, (item, itemPath) =>
    parseString(item, itemPath, { minLength: 1 })
  , { optional: true });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = { id, label };

  if (value !== undefined) {
    result.value = value;
  }

  if (description !== undefined) {
    result.description = description;
  }

  if (followUps !== undefined) {
    result.followUps = followUps;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parseQuestion(question, path) {
  const object = ensurePlainObject(question, path);
  ensureAllowedKeys(object, QUESTION_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const type = parseString(object.type ?? 'text', `${path}.type`, { minLength: 1 });

  if (!QUESTION_TYPES.has(type)) {
    throwValidationError(`${path}.type`, `must be one of: ${Array.from(QUESTION_TYPES).join(', ')}`);
  }

  const prompt = parseString(object.prompt, `${path}.prompt`, { minLength: 1 });
  const title = parseOptionalString(object.title, `${path}.title`);
  const description = parseOptionalString(object.description, `${path}.description`);
  const placeholder = parseOptionalString(object.placeholder, `${path}.placeholder`);
  const required = parseBoolean(object.required, `${path}.required`, { optional: true });
  const defaultValue = object.defaultValue === undefined ? undefined : object.defaultValue;
  const options = parseArray(object.options, `${path}.options`, (item, itemPath) => parseQuestionOption(item, itemPath), {
    optional: true
  });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = {
    id,
    type,
    prompt
  };

  if (title !== undefined) {
    result.title = title;
  }

  if (description !== undefined) {
    result.description = description;
  }

  if (placeholder !== undefined) {
    result.placeholder = placeholder;
  }

  if (required !== undefined) {
    result.required = required;
  }

  if (defaultValue !== undefined) {
    result.defaultValue = defaultValue;
  }

  if (options !== undefined) {
    result.options = options;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parseSurveySection(section, path) {
  const object = ensurePlainObject(section, path);
  ensureAllowedKeys(object, SURVEY_SECTION_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const title = parseString(object.title, `${path}.title`, { minLength: 1 });
  const description = parseOptionalString(object.description, `${path}.description`);
  const helpText = parseOptionalString(object.helpText, `${path}.helpText`);
  const questions = parseArray(object.questions, `${path}.questions`, (item, itemPath) => parseQuestion(item, itemPath), {
    minLength: 1
  });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = {
    id,
    title,
    questions
  };

  if (description !== undefined) {
    result.description = description;
  }

  if (helpText !== undefined) {
    result.helpText = helpText;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parseSurvey(survey, path) {
  const object = ensurePlainObject(survey, path);
  ensureAllowedKeys(object, SURVEY_KEYS, path);

  const version = parseOptionalString(object.version, `${path}.version`);
  const introduction = parseOptionalString(object.introduction, `${path}.introduction`);
  const completion = parseOptionalString(object.completion, `${path}.completion`);
  const sections = parseArray(object.sections, `${path}.sections`, (item, itemPath) => parseSurveySection(item, itemPath), {
    minLength: 1
  });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = {
    sections
  };

  if (version !== undefined) {
    result.version = version;
  }

  if (introduction !== undefined) {
    result.introduction = introduction;
  }

  if (completion !== undefined) {
    result.completion = completion;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parseAgent(agent, path) {
  const object = ensurePlainObject(agent, path);
  ensureAllowedKeys(object, AGENT_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const name = parseString(object.name, `${path}.name`, { minLength: 1 });
  const type = parseString(object.type, `${path}.type`, { minLength: 1 });
  const description = parseOptionalString(object.description, `${path}.description`);
  const version = parseStringOrNumber(object.version, `${path}.version`, { optional: true });
  const tags = parseStringArray(object.tags, `${path}.tags`, { optional: true });
  const config = ensurePlainObject(object.config, `${path}.config`);
  const entrypoint = parseOptionalString(object.entrypoint, `${path}.entrypoint`);
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = {
    id,
    name,
    type,
    config
  };

  if (description !== undefined) {
    result.description = description;
  }

  if (version !== undefined) {
    result.version = version;
  }

  if (tags !== undefined) {
    result.tags = tags;
  }

  if (entrypoint !== undefined) {
    result.entrypoint = entrypoint;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parsePipelineNode(node, path) {
  const object = ensurePlainObject(node, path);
  ensureAllowedKeys(object, PIPELINE_NODE_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const type = parseString(object.type, `${path}.type`, { minLength: 1 });
  const config = ensurePlainObject(object.config, `${path}.config`, { optional: true });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = { id, type };

  if (config !== undefined) {
    result.config = config;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parsePipelineEdge(edge, path) {
  const object = ensurePlainObject(edge, path);
  ensureAllowedKeys(object, PIPELINE_EDGE_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const source = parseOptionalString(object.source, `${path}.source`, { minLength: 1 });
  const from = parseOptionalString(object.from, `${path}.from`, { minLength: 1 });
  const target = parseOptionalString(object.target, `${path}.target`, { minLength: 1 });
  const to = parseOptionalString(object.to, `${path}.to`, { minLength: 1 });

  if (!source && !from) {
    throwValidationError(path, 'must include either "source" or "from"');
  }

  if (!target && !to) {
    throwValidationError(path, 'must include either "target" or "to"');
  }

  const condition = (() => {
    if (object.condition === undefined) {
      return undefined;
    }

    if (typeof object.condition === 'string') {
      return object.condition;
    }

    if (isPlainObject(object.condition)) {
      return { ...object.condition };
    }

    throwValidationError(`${path}.condition`, 'must be a string or object');
  })();

  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = { id };

  if (source !== undefined) {
    result.source = source;
  }

  if (from !== undefined) {
    result.from = from;
  }

  if (target !== undefined) {
    result.target = target;
  }

  if (to !== undefined) {
    result.to = to;
  }

  if (condition !== undefined) {
    result.condition = condition;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parsePipeline(pipeline, path) {
  const object = ensurePlainObject(pipeline, path);
  ensureAllowedKeys(object, PIPELINE_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const name = parseString(object.name, `${path}.name`, { minLength: 1 });
  const description = parseOptionalString(object.description, `${path}.description`);
  const version = parseStringOrNumber(object.version, `${path}.version`, { optional: true });
  const nodes = parseArray(object.nodes, `${path}.nodes`, (item, itemPath) => parsePipelineNode(item, itemPath), {
    defaultValue: []
  });
  const edges = parseArray(object.edges, `${path}.edges`, (item, itemPath) => parsePipelineEdge(item, itemPath), {
    defaultValue: []
  });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = {
    id,
    name,
    nodes,
    edges
  };

  if (description !== undefined) {
    result.description = description;
  }

  if (version !== undefined) {
    result.version = version;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parsePostProcessingStep(step, path) {
  const object = ensurePlainObject(step, path);
  ensureAllowedKeys(object, POST_PROCESSING_STEP_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const type = parseString(object.type, `${path}.type`, { minLength: 1 });
  const config = ensurePlainObject(object.config, `${path}.config`, { optional: true });
  const enabled = parseBoolean(object.enabled, `${path}.enabled`, { optional: true });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = { id, type };

  if (config !== undefined) {
    result.config = config;
  }

  if (enabled !== undefined) {
    result.enabled = enabled;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parsePostProcessing(postProcessing, path) {
  const object = ensurePlainObject(postProcessing, path, { optional: true });

  if (object === undefined) {
    return undefined;
  }

  ensureAllowedKeys(object, POST_PROCESSING_KEYS, path);

  const steps = parseArray(object.steps, `${path}.steps`, (item, itemPath) => parsePostProcessingStep(item, itemPath), {
    defaultValue: []
  });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = { steps };

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parseLlmAssistProvider(provider, path) {
  const object = ensurePlainObject(provider, path);
  ensureAllowedKeys(object, LLM_ASSIST_PROVIDER_KEYS, path);

  const providerId = parseString(object.providerId, `${path}.providerId`, { minLength: 1 });
  const model = parseOptionalString(object.model, `${path}.model`);
  const mode = parseOptionalString(object.mode, `${path}.mode`);
  const temperature = parseNumber(object.temperature, `${path}.temperature`, { optional: true });
  const maxTokens = parseNumber(object.maxTokens, `${path}.maxTokens`, { optional: true });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = { providerId };

  if (model !== undefined) {
    result.model = model;
  }

  if (mode !== undefined) {
    result.mode = mode;
  }

  if (temperature !== undefined) {
    result.temperature = temperature;
  }

  if (maxTokens !== undefined) {
    result.maxTokens = maxTokens;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parseLlmAssist(llmAssist, path) {
  const object = ensurePlainObject(llmAssist, path, { optional: true });

  if (object === undefined) {
    return undefined;
  }

  ensureAllowedKeys(object, LLM_ASSIST_KEYS, path);

  const summary = parseOptionalString(object.summary, `${path}.summary`);
  const instructions = parseOptionalString(object.instructions, `${path}.instructions`);
  const providers = parseArray(object.providers, `${path}.providers`, (item, itemPath) => parseLlmAssistProvider(item, itemPath), {
    optional: true
  });
  const hints = parseStringArray(object.hints, `${path}.hints`, { optional: true });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = {};

  if (summary !== undefined) {
    result.summary = summary;
  }

  if (instructions !== undefined) {
    result.instructions = instructions;
  }

  if (providers !== undefined) {
    result.providers = providers;
  }

  if (hints !== undefined) {
    result.hints = hints;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function parseMeta(meta, path) {
  const object = ensurePlainObject(meta, path);
  ensureAllowedKeys(object, META_KEYS, path);

  const id = parseString(object.id, `${path}.id`, { minLength: 1 });
  const name = parseString(object.name, `${path}.name`, { minLength: 1 });
  const industry = parseString(object.industry, `${path}.industry`, { minLength: 1 });
  const description = parseOptionalString(object.description, `${path}.description`);
  const tags = parseStringArray(object.tags, `${path}.tags`, { optional: true });
  const createdAt = parseOptionalString(object.createdAt, `${path}.createdAt`);
  const updatedAt = parseOptionalString(object.updatedAt, `${path}.updatedAt`);
  const versionNotes = parseStringArray(object.versionNotes, `${path}.versionNotes`, { optional: true });
  const maintainers = parseStringArray(object.maintainers, `${path}.maintainers`, { optional: true });
  const metadata = parseMetadata(object.metadata, `${path}.metadata`);

  const result = {
    id,
    name,
    industry
  };

  if (description !== undefined) {
    result.description = description;
  }

  if (tags !== undefined) {
    result.tags = tags;
  }

  if (createdAt !== undefined) {
    result.createdAt = createdAt;
  }

  if (updatedAt !== undefined) {
    result.updatedAt = updatedAt;
  }

  if (versionNotes !== undefined) {
    result.versionNotes = versionNotes;
  }

  if (maintainers !== undefined) {
    result.maintainers = maintainers;
  }

  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}

function ensureRootKeys(object) {
  ensureAllowedKeys(object, ROOT_KEYS, 'preset');
}

export function parseIndustryPreset(rawPreset) {
  const root = ensurePlainObject(rawPreset, 'preset');
  ensureRootKeys(root);

  const version = parseString(root.version, 'preset.version', { minLength: 1 });
  const meta = parseMeta(root.meta, 'preset.meta');
  const survey = parseSurvey(root.survey, 'preset.survey');
  const agents = parseArray(root.agents, 'preset.agents', (item, itemPath) => parseAgent(item, itemPath), {
    defaultValue: []
  });
  const pipelines = parseArray(root.pipelines, 'preset.pipelines', (item, itemPath) => parsePipeline(item, itemPath), {
    defaultValue: []
  });
  const postProcessing = parsePostProcessing(root.postProcessing, 'preset.postProcessing');
  const llmAssist = parseLlmAssist(root.llmAssist, 'preset.llmAssist');

  const result = {
    version,
    meta,
    survey,
    agents,
    pipelines
  };

  if (postProcessing !== undefined) {
    result.postProcessing = postProcessing;
  }

  if (llmAssist !== undefined) {
    result.llmAssist = llmAssist;
  }

  return result;
}

export const industryPresetSchema = {
  parse: parseIndustryPreset
};

export { IndustryPresetValidationError };
