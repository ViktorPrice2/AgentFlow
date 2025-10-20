ALTER TABLE Projects ADD COLUMN briefStatus TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE Projects ADD COLUMN briefProgress REAL NOT NULL DEFAULT 0;
ALTER TABLE Projects ADD COLUMN briefVersion TEXT;
ALTER TABLE Projects ADD COLUMN needsAttention TEXT DEFAULT '{}';
ALTER TABLE Projects ADD COLUMN tgLinkBase TEXT;
ALTER TABLE Projects ADD COLUMN tgLastInvitation TEXT;
ALTER TABLE Projects ADD COLUMN tgContactStatus TEXT;
ALTER TABLE Projects ADD COLUMN industry TEXT;
ALTER TABLE Projects ADD COLUMN channels TEXT DEFAULT '[]';
ALTER TABLE Projects ADD COLUMN presetId TEXT;
ALTER TABLE Projects ADD COLUMN presetVersion TEXT;
ALTER TABLE Projects ADD COLUMN presetDraft TEXT DEFAULT '{}';

ALTER TABLE Agents ADD COLUMN source TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE Agents ADD COLUMN originPresetVersion TEXT;

ALTER TABLE Pipelines ADD COLUMN source TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE Pipelines ADD COLUMN originPresetVersion TEXT;

ALTER TABLE Reports ADD COLUMN pipelineId TEXT;
ALTER TABLE Reports ADD COLUMN status TEXT;
ALTER TABLE Reports ADD COLUMN summary TEXT;
ALTER TABLE Reports ADD COLUMN artifacts TEXT DEFAULT '[]';

CREATE TABLE IF NOT EXISTS TelegramContacts (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL,
  label TEXT,
  status TEXT,
  lastContactAt TEXT,
  projectId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_contacts_chatId ON TelegramContacts(chatId);
CREATE INDEX IF NOT EXISTS idx_telegram_contacts_projectId ON TelegramContacts(projectId);

