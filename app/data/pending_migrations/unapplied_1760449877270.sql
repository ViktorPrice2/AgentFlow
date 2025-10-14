BEGIN TRANSACTION;

-- history tables
CREATE TABLE IF NOT EXISTS AgentsHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entityId TEXT NOT NULL,
  version TEXT,
  data TEXT NOT NULL, -- JSON snapshot
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agentshistory_entityId ON AgentsHistory (entityId);
CREATE INDEX IF NOT EXISTS idx_agentshistory_createdAt ON AgentsHistory (createdAt);

CREATE TABLE IF NOT EXISTS PipelinesHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entityId TEXT NOT NULL,
  version TEXT,
  data TEXT NOT NULL, -- JSON snapshot
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipelineshistory_entityId ON PipelinesHistory (entityId);
CREATE INDEX IF NOT EXISTS idx_pipelineshistory_createdAt ON PipelinesHistory (createdAt);

-- helper: create JSON snapshot of Agents row
CREATE TRIGGER IF NOT EXISTS agents_after_insert
AFTER INSERT ON Agents
BEGIN
  INSERT INTO AgentsHistory (entityId, version, data, createdAt)
  VALUES (
    NEW.id,
    NEW.version,
    json_object(
      'id', NEW.id,
      'projectId', NEW.projectId,
      'name', NEW.name,
      'type', NEW.type,
      'version', NEW.version,
      'source', NEW.source,
      'config', NEW.config,
      'createdAt', NEW.createdAt,
      'updatedAt', NEW.updatedAt
    ),
    CURRENT_TIMESTAMP
  );
END;

CREATE TRIGGER IF NOT EXISTS agents_after_update
AFTER UPDATE ON Agents
BEGIN
  INSERT INTO AgentsHistory (entityId, version, data, createdAt)
  VALUES (
    NEW.id,
    NEW.version,
    json_object(
      'id', NEW.id,
      'projectId', NEW.projectId,
      'name', NEW.name,
      'type', NEW.type,
      'version', NEW.version,
      'source', NEW.source,
      'config', NEW.config,
      'createdAt', NEW.createdAt,
      'updatedAt', NEW.updatedAt
    ),
    CURRENT_TIMESTAMP
  );
END;

-- pipelines triggers
CREATE TRIGGER IF NOT EXISTS pipelines_after_insert
AFTER INSERT ON Pipelines
BEGIN
  INSERT INTO PipelinesHistory (entityId, version, data, createdAt)
  VALUES (
    NEW.id,
    NEW.version,
    json_object(
      'id', NEW.id,
      'projectId', NEW.projectId,
      'name', NEW.name,
      'version', NEW.version,
      'definition', NEW.definition,
      'createdAt', NEW.createdAt,
      'updatedAt', NEW.updatedAt
    ),
    CURRENT_TIMESTAMP
  );
END;

CREATE TRIGGER IF NOT EXISTS pipelines_after_update
AFTER UPDATE ON Pipelines
BEGIN
  INSERT INTO PipelinesHistory (entityId, version, data, createdAt)
  VALUES (
    NEW.id,
    NEW.version,
    json_object(
      'id', NEW.id,
      'projectId', NEW.projectId,
      'name', NEW.name,
      'version', NEW.version,
      'definition', NEW.definition,
      'createdAt', NEW.createdAt,
      'updatedAt', NEW.updatedAt
    ),
    CURRENT_TIMESTAMP
  );
END;

COMMIT;
