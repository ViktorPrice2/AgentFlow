ALTER TABLE Agents ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
UPDATE Agents SET version = COALESCE(version, 1);

ALTER TABLE Pipelines ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
UPDATE Pipelines SET version = COALESCE(version, 1);

CREATE TABLE IF NOT EXISTS EntityHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_entity ON EntityHistory(entityType, entityId);
CREATE INDEX IF NOT EXISTS idx_history_entity_version ON EntityHistory(entityType, entityId, version);
