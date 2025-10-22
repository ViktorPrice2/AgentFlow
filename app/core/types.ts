export type ContentType = 'text' | 'image' | 'video';

export type AgentType =
  | 'writer'
  | 'image'
  | 'video'
  | 'guard'
  | 'human_gate'
  | 'uploader'
  | 'diagnostic';

export interface PlanNode {
  id: string;
  agent: string;
  type: AgentType;
  input: Record<string, unknown>;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskPlan {
  nodes: PlanNode[];
  description: string;
  contentTypes: ContentType[];
}

export interface TaskRecord {
  id: string;
  plan: TaskPlan;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

export interface RunRecord {
  id: string;
  taskId: string;
  nodeId: string;
  agentName: string;
  status: RunStatus;
  error?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  attempts: number;
}

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ArtifactRecord {
  id: string;
  runId: string;
  type: ContentType;
  path: string;
  metadata: Record<string, unknown>;
}

export type LogLevel = 'info' | 'error' | 'warn';

export interface LogRecord {
  id: string;
  runId: string;
  type: LogLevel;
  message: string;
  timestamp: Date;
}

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  enabled: boolean;
  priority: number;
  models: string[];
  mock?: boolean;
}

export interface AgentManifest {
  name: string;
  version: string;
  description: string;
  type: AgentType;
  defaultParams?: Record<string, unknown>;
  models?: string[];
  mockOutput?: unknown;
  entry: string;
  pre?: string;
  post?: string;
}

export interface AgentContext {
  task: TaskRecord;
  run: RunRecord;
  providerManager: ProviderManagerApi;
  storage: ArtifactStorageApi;
  logger: AgentLogger;
  mode: 'real' | 'mock';
  locale: 'en' | 'ru';
}

export interface AgentLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ArtifactStorageApi {
  saveArtifact(runId: string, type: ContentType, content: Buffer | string, extension: string, metadata?: Record<string, unknown>): Promise<ArtifactRecord>;
}

export interface ProviderRequest {
  model: string;
  type: 'text' | 'image' | 'video';
  prompt?: string;
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface ProviderResponse {
  content?: string;
  url?: string;
  binary?: Buffer;
  metadata?: Record<string, unknown>;
}

export interface ProviderManagerApi {
  invoke(request: ProviderRequest): Promise<ProviderResponse>;
  getMode(): 'real' | 'mock';
}

export interface AgentModule {
  execute(payload: Record<string, unknown>, ctx: AgentContext): Promise<Record<string, unknown> | void>;
}
