BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS Projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME,
  UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_projects_createdAt ON Projects (createdAt);

CREATE TABLE IF NOT EXISTS Agents (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '0.0.1',
  source TEXT,
  config TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME,
  FOREIGN KEY (projectId) REFERENCES Projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agents_projectId ON Agents (projectId);
CREATE INDEX IF NOT EXISTS idx_agents_createdAt ON Agents (createdAt);

CREATE TABLE IF NOT EXISTS Pipelines (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '0.0.1',
  definition TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME,
  FOREIGN KEY (projectId) REFERENCES Projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pipelines_projectId ON Pipelines (projectId);
CREATE INDEX IF NOT EXISTS idx_pipelines_createdAt ON Pipelines (createdAt);

CREATE TABLE IF NOT EXISTS Runs (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  pipelineId TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT,
  output TEXT,
  metrics TEXT,
  error TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  startedAt DATETIME,
  finishedAt DATETIME,
  FOREIGN KEY (projectId) REFERENCES Projects (id) ON DELETE CASCADE,
  FOREIGN KEY (pipelineId) REFERENCES Pipelines (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_projectId ON Runs (projectId);
CREATE INDEX IF NOT EXISTS idx_runs_pipelineId ON Runs (pipelineId);
CREATE INDEX IF NOT EXISTS idx_runs_createdAt ON Runs (createdAt);

CREATE TABLE IF NOT EXISTS Briefs (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT,
  metadata TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME,
  FOREIGN KEY (projectId) REFERENCES Projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_briefs_projectId ON Briefs (projectId);
CREATE INDEX IF NOT EXISTS idx_briefs_createdAt ON Briefs (createdAt);

CREATE TABLE IF NOT EXISTS Schedules (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  pipelineId TEXT NOT NULL,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  nextRun DATETIME,
  metadata TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME,
  FOREIGN KEY (projectId) REFERENCES Projects (id) ON DELETE CASCADE,
  FOREIGN KEY (pipelineId) REFERENCES Pipelines (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedules_projectId ON Schedules (projectId);
CREATE INDEX IF NOT EXISTS idx_schedules_createdAt ON Schedules (createdAt);

CREATE TABLE IF NOT EXISTS Metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId TEXT,
  entityType TEXT,
  entityId TEXT,
  name TEXT NOT NULL,
  value REAL,
  unit TEXT,
  metadata TEXT,
  recordedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projectId) REFERENCES Projects (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_projectId ON Metrics (projectId);
CREATE INDEX IF NOT EXISTS idx_metrics_recordedAt ON Metrics (recordedAt);

CREATE TABLE IF NOT EXISTS Reports (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  format TEXT,
  metadata TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME,
  FOREIGN KEY (projectId) REFERENCES Projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_projectId ON Reports (projectId);
CREATE INDEX IF NOT EXISTS idx_reports_createdAt ON Reports (createdAt);

COMMIT;
