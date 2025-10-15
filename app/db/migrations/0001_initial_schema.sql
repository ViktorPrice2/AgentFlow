PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Agents (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  agentType TEXT NOT NULL,
  config TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Pipelines (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  definition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Runs (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  pipelineId TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT,
  output TEXT,
  error TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  finishedAt TEXT,
  FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
  FOREIGN KEY (pipelineId) REFERENCES Pipelines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Briefs (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  payload TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Schedules (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  pipelineId TEXT NOT NULL,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  nextRun TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
  FOREIGN KEY (pipelineId) REFERENCES Pipelines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Metrics (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  runId TEXT,
  name TEXT NOT NULL,
  value REAL,
  unit TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
  FOREIGN KEY (runId) REFERENCES Runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS Reports (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  runId TEXT,
  title TEXT,
  reportType TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
  FOREIGN KEY (runId) REFERENCES Runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_createdAt ON Projects(createdAt);

CREATE INDEX IF NOT EXISTS idx_agents_projectId ON Agents(projectId);
CREATE INDEX IF NOT EXISTS idx_agents_createdAt ON Agents(createdAt);

CREATE INDEX IF NOT EXISTS idx_pipelines_projectId ON Pipelines(projectId);
CREATE INDEX IF NOT EXISTS idx_pipelines_createdAt ON Pipelines(createdAt);

CREATE INDEX IF NOT EXISTS idx_runs_projectId_createdAt ON Runs(projectId, createdAt);
CREATE INDEX IF NOT EXISTS idx_runs_pipelineId ON Runs(pipelineId);

CREATE INDEX IF NOT EXISTS idx_briefs_projectId_createdAt ON Briefs(projectId, createdAt);

CREATE INDEX IF NOT EXISTS idx_schedules_projectId_createdAt ON Schedules(projectId, createdAt);
CREATE INDEX IF NOT EXISTS idx_schedules_pipelineId ON Schedules(pipelineId);

CREATE INDEX IF NOT EXISTS idx_metrics_projectId_createdAt ON Metrics(projectId, createdAt);
CREATE INDEX IF NOT EXISTS idx_metrics_runId ON Metrics(runId);

CREATE INDEX IF NOT EXISTS idx_reports_projectId_createdAt ON Reports(projectId, createdAt);
CREATE INDEX IF NOT EXISTS idx_reports_runId ON Reports(runId);
