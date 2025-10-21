import { normalizeChannels, buildChannelSummary } from './channels.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildProjectContext(ctxProject = null, payloadProject = null, fallback = {}) {
  const base = {};

  if (isObject(ctxProject)) {
    Object.assign(base, ctxProject);
  }

  if (isObject(payloadProject)) {
    Object.assign(base, payloadProject);
  }

  const industry =
    (isObject(payloadProject) && payloadProject.industry) ||
    (isObject(ctxProject) && ctxProject.industry) ||
    fallback.industry ||
    base.industry ||
    null;

  if (industry) {
    base.industry = industry;
  }

  const normalizedFromBase = normalizeChannels(base.channels);
  const fallbackChannels = normalizeChannels(fallback.channels);
  const combinedChannels = Array.from(new Set([...normalizedFromBase, ...fallbackChannels]));

  base.channels = combinedChannels;
  base.channelList = combinedChannels;
  base.channelSummary = buildChannelSummary(combinedChannels);

  return base;
}

export function enrichWithProjectContext(merged, ctx, payload = {}) {
  const context = buildProjectContext(ctx?.project, payload.project, {
    industry: payload.industry,
    channels: payload.channels
  });

  if (Object.keys(context).length > 0) {
    merged.project = context;
  }

  const projectIndustry = context.industry || payload.industry || merged.industry || null;
  if (projectIndustry && !merged.industry) {
    merged.industry = projectIndustry;
  }
  merged.projectIndustry = projectIndustry;

  const projectChannels = context.channels || [];
  merged.channels = projectChannels;
  merged.projectChannels = projectChannels;

  const summary = context.channelSummary || '';
  if (!merged.channelSummary) {
    merged.channelSummary = summary;
  }
  merged.projectChannelSummary = summary;

  return merged;
}
