import { z } from 'zod';

const metadataSchema = z.record(z.unknown()).optional();

const questionOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    value: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    followUps: z.array(z.string().min(1)).optional(),
    metadata: metadataSchema
  })
  .strict();

const questionSchema = z
  .object({
    id: z.string().min(1),
    type: z
      .enum([
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
      ])
      .default('text'),
    prompt: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
    defaultValue: z.unknown().optional(),
    options: z.array(questionOptionSchema).optional(),
    metadata: metadataSchema
  })
  .strict();

const surveySectionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    helpText: z.string().optional(),
    questions: z.array(questionSchema).min(1),
    metadata: metadataSchema
  })
  .strict();

const surveySchema = z
  .object({
    version: z.string().optional(),
    introduction: z.string().optional(),
    completion: z.string().optional(),
    sections: z.array(surveySectionSchema).min(1),
    metadata: metadataSchema
  })
  .strict();

const agentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    description: z.string().optional(),
    version: z.union([z.string().min(1), z.number()]).optional(),
    tags: z.array(z.string().min(1)).optional(),
    config: z.record(z.unknown()),
    entrypoint: z.string().optional(),
    metadata: metadataSchema
  })
  .strict();

const pipelineNodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    config: z.record(z.unknown()).optional(),
    metadata: metadataSchema
  })
  .strict();

const pipelineEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1).optional(),
    from: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    condition: z.union([z.string(), z.record(z.unknown())]).optional(),
    metadata: metadataSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.source && !value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Edge must include either "source" or "from"',
        path: ['source']
      });
    }

    if (!value.target && !value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Edge must include either "target" or "to"',
        path: ['target']
      });
    }
  });

const pipelineSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    version: z.union([z.string().min(1), z.number()]).optional(),
    nodes: z.array(pipelineNodeSchema).default([]),
    edges: z.array(pipelineEdgeSchema).default([]),
    metadata: metadataSchema
  })
  .strict();

const postProcessingStepSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    metadata: metadataSchema
  })
  .strict();

const postProcessingSchema = z
  .object({
    steps: z.array(postProcessingStepSchema).default([]),
    metadata: metadataSchema
  })
  .strict()
  .optional();

const llmAssistProviderSchema = z
  .object({
    providerId: z.string().min(1),
    model: z.string().optional(),
    mode: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
    metadata: metadataSchema
  })
  .strict();

const llmAssistSchema = z
  .object({
    summary: z.string().optional(),
    instructions: z.string().optional(),
    providers: z.array(llmAssistProviderSchema).optional(),
    hints: z.array(z.string()).optional(),
    metadata: metadataSchema
  })
  .strict()
  .optional();

export const industryPresetSchema = z
  .object({
    version: z.string().min(1),
    meta: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        industry: z.string().min(1),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
        versionNotes: z.array(z.string()).optional(),
        maintainers: z.array(z.string()).optional(),
        metadata: metadataSchema
      })
      .strict(),
    survey: surveySchema,
    agents: z.array(agentSchema).default([]),
    pipelines: z.array(pipelineSchema).default([]),
    postProcessing: postProcessingSchema,
    llmAssist: llmAssistSchema
  })
  .strict();

export function parseIndustryPreset(rawPreset) {
  return industryPresetSchema.parse(rawPreset);
}
