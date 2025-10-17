CREATE TABLE IF NOT EXISTS Logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  runId TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  source TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_createdAt ON Logs(createdAt);
CREATE INDEX IF NOT EXISTS idx_logs_runId ON Logs(runId);
