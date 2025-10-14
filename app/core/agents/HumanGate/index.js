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

export async function execute(payload = {}, ctx) {
  // If step.override.forceRequire === true, require human; for MVP auto-approve
  const required = payload.step && payload.step.override && payload.step.override.requireHuman ? true : false;
  const approved = true; // simulate immediate approval
  await ctx.log('humangate', { required, approved });
  const next = { ...payload, _human: { required, approved } };
  return next;
}

export default { execute };
