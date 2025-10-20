export interface IndustryPresetMeta {
  id: string;
  name: string;
  industry: string;
  description?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  versionNotes?: string[];
  maintainers?: string[];
}

export interface IndustryPresetQuestionOption {
  id: string;
  label: string;
  value?: string;
  description?: string;
  followUps?: string[];
  metadata?: Record<string, unknown>;
}

export type IndustryPresetQuestionType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'number'
  | 'rating'
  | 'email'
  | 'channels'
  | 'industry'
  | 'custom';

export interface IndustryPresetQuestion {
  id: string;
  type: IndustryPresetQuestionType;
  prompt: string;
  title?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: IndustryPresetQuestionOption[];
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetSection {
  id: string;
  title: string;
  description?: string;
  helpText?: string;
  questions: IndustryPresetQuestion[];
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetSurvey {
  version?: string;
  introduction?: string;
  completion?: string;
  sections: IndustryPresetSection[];
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetAgent {
  id: string;
  name: string;
  type: string;
  description?: string;
  version?: string | number;
  tags?: string[];
  config: Record<string, unknown>;
  entrypoint?: string;
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetPipelineNode {
  id: string;
  type: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetPipelineEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetPipeline {
  id: string;
  name: string;
  description?: string;
  version?: string | number;
  nodes: IndustryPresetPipelineNode[];
  edges: IndustryPresetPipelineEdge[];
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetPostProcessingStep {
  id: string;
  type: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetPostProcessing {
  steps: IndustryPresetPostProcessingStep[];
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetLLMAssistProviderConfig {
  providerId: string;
  model?: string;
  mode?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface IndustryPresetLLMAssist {
  summary?: string;
  instructions?: string;
  providers?: IndustryPresetLLMAssistProviderConfig[];
  hints?: string[];
  metadata?: Record<string, unknown>;
}

export interface IndustryPreset {
  version: string;
  meta: IndustryPresetMeta;
  survey: IndustryPresetSurvey;
  agents: IndustryPresetAgent[];
  pipelines: IndustryPresetPipeline[];
  postProcessing?: IndustryPresetPostProcessing;
  llmAssist?: IndustryPresetLLMAssist;
}

export type IndustryPresetMap = Record<string, IndustryPreset>;

