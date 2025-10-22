import { randomUUID } from 'node:crypto';
import type { ContentType, PlanNode, TaskPlan } from './types.js';

export interface PlanOptions {
  requestedContent: ContentType[];
  tone?: string;
}

export function buildDefaultPlan(input: string, options: PlanOptions): TaskPlan {
  const nodes: PlanNode[] = [];

  let writerNodeId: string | undefined;

  if (options.requestedContent.includes('text')) {
    writerNodeId = `writer-${randomUUID()}`;
    nodes.push({
      id: writerNodeId,
      agent: 'writer-agent',
      type: 'writer',
      input: { topic: input, tone: options.tone ?? 'neutral', format: 'article' }
    });
    nodes.push({
      id: `guard-${randomUUID()}`,
      agent: 'guard-agent',
      type: 'guard',
      input: { field: 'text', retryOn: ['toxicity'] },
      dependsOn: [writerNodeId]
    });
  }

  let imageNodeId: string | undefined;
  if (options.requestedContent.includes('image')) {
    imageNodeId = `image-${randomUUID()}`;
    nodes.push({
      id: imageNodeId,
      agent: 'image-agent',
      type: 'image',
      input: { description: `Visualize: ${input}` },
      dependsOn: writerNodeId ? [writerNodeId] : undefined
    });
  }

  if (options.requestedContent.includes('video')) {
    nodes.push({
      id: `video-${randomUUID()}`,
      agent: 'video-agent',
      type: 'video',
      input: { scriptDependsOn: writerNodeId, imageDependsOn: imageNodeId },
      dependsOn: [writerNodeId, imageNodeId].filter(Boolean) as string[]
    });
  }

  const uploaderDepends = nodes.map((node) => node.id);
  nodes.push({
    id: `uploader-${randomUUID()}`,
    agent: 'uploader-agent',
    type: 'uploader',
    input: {},
    dependsOn: uploaderDepends
  });

  return {
    nodes,
    description: `Plan for ${input}`,
    contentTypes: options.requestedContent
  };
}
