import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../data');
const migrationsDir = path.join(__dirname, 'migrations');
const databasePath = path.join(dataDir, 'agentflow.sqlite');

const normalizeSql = (sql) => sql.replace(/\r\n/g, '\n').trim();

const ensureMigrationsTable = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
};

const readSqlFile = async (filePath) => {
  const sql = await fs.readFile(filePath, 'utf-8');
  return normalizeSql(sql);
};

export const runMigrations = async () => {
  await fs.mkdir(dataDir, { recursive: true });

  const db = new Database(databasePath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    ensureMigrationsTable(db);

    const appliedVersions = new Set(
      db
        .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
        .all()
        .map((row) => row.version)
    );

    const migrationFiles = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const appliedNow = [];

    for (const fileName of migrationFiles) {
      const version = fileName.replace(/\.sql$/, '');

      if (appliedVersions.has(version)) {
        continue;
      }

      const sql = await readSqlFile(path.join(migrationsDir, fileName));

      if (!sql) {
        continue;
      }

      const transaction = db.transaction(() => {
        db.exec(sql);
        db
          .prepare(
            "INSERT INTO schema_migrations (version, appliedAt) VALUES (?, datetime('now'))"
          )
          .run(version);
      });

      transaction();
      appliedNow.push(version);
    }

    if (appliedNow.length > 0) {
      console.info('[migrations] Applied versions:', appliedNow.join(', '));
    }

    return {
      databasePath,
      applied: appliedNow
    };
  } catch (error) {
    console.error('[migrations] Failed to apply migrations:', error);
    throw error;
  } finally {
    db.close();
  }
};

export const getDatabasePath = () => databasePath;
