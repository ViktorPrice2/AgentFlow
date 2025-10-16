CREATE TABLE IF NOT EXISTS Projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS Agents (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  config TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS Pipelines (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  definition TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS Runs (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  pipelineId TEXT,
  status TEXT,
  input TEXT,
  output TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  startedAt TEXT,
  finishedAt TEXT
);

CREATE TABLE IF NOT EXISTS Briefs (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  summary TEXT,
  details TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS Schedules (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  pipelineId TEXT,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  nextRun TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS Metrics (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL,
  unit TEXT,
  capturedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Reports (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_agents_projectId ON Agents(projectId);
CREATE INDEX IF NOT EXISTS idx_pipelines_projectId ON Pipelines(projectId);
CREATE INDEX IF NOT EXISTS idx_runs_projectId ON Runs(projectId);
CREATE INDEX IF NOT EXISTS idx_briefs_projectId ON Briefs(projectId);
CREATE INDEX IF NOT EXISTS idx_schedules_projectId ON Schedules(projectId);
CREATE INDEX IF NOT EXISTS idx_metrics_projectId ON Metrics(projectId);
CREATE INDEX IF NOT EXISTS idx_reports_projectId ON Reports(projectId);
