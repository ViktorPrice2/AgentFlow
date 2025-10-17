CREATE INDEX IF NOT EXISTS idx_projects_createdAt ON Projects(createdAt);
CREATE INDEX IF NOT EXISTS idx_agents_createdAt ON Agents(createdAt);
CREATE INDEX IF NOT EXISTS idx_pipelines_createdAt ON Pipelines(createdAt);
CREATE INDEX IF NOT EXISTS idx_runs_createdAt ON Runs(createdAt);
CREATE INDEX IF NOT EXISTS idx_briefs_createdAt ON Briefs(createdAt);
CREATE INDEX IF NOT EXISTS idx_schedules_createdAt ON Schedules(createdAt);
CREATE INDEX IF NOT EXISTS idx_reports_createdAt ON Reports(createdAt);
CREATE INDEX IF NOT EXISTS idx_history_createdAt ON EntityHistory(createdAt);
