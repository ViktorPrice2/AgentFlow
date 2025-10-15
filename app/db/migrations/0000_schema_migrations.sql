-- Schema migrations metadata table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
