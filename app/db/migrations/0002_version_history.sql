BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS AgentHistory (
  id TEXT PRIMARY KEY,
  agentId TEXT NOT NULL,
  projectId TEXT,
  version TEXT NOT NULL,
  payload TEXT NOT NULL,
  diff TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agentId) REFERENCES Agents (id) ON DELETE CASCADE,
  UNIQUE (agentId, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_history_agentId ON AgentHistory (agentId);
CREATE INDEX IF NOT EXISTS idx_agent_history_createdAt ON AgentHistory (createdAt);

CREATE TABLE IF NOT EXISTS PipelineHistory (
  id TEXT PRIMARY KEY,
  pipelineId TEXT NOT NULL,
  projectId TEXT,
  version TEXT NOT NULL,
  payload TEXT NOT NULL,
  diff TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pipelineId) REFERENCES Pipelines (id) ON DELETE CASCADE,
  UNIQUE (pipelineId, version)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_history_pipelineId ON PipelineHistory (pipelineId);
CREATE INDEX IF NOT EXISTS idx_pipeline_history_createdAt ON PipelineHistory (createdAt);

COMMIT;
