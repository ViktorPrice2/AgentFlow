import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'agentflow.db');

async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
}

async function readMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);

  return files
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

function prepareDatabase() {
  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

export async function runMigrations() {
  await ensureDirectories();

  const migrationFiles = await readMigrationFiles();
  if (migrationFiles.length === 0) {
    return;
  }

  const db = prepareDatabase();

  try {
    const applied = new Set(
      db
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all()
        .map((row) => row.version)
    );

    const insertMigration = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
    const applyMigration = db.transaction((version, sql) => {
      db.exec(sql);
      insertMigration.run(version);
    });

    for (const fileName of migrationFiles) {
      const version = path.basename(fileName, '.sql');
      if (applied.has(version)) {
        continue;
      }

      const migrationPath = path.join(MIGRATIONS_DIR, fileName);
      const sql = await fs.readFile(migrationPath, 'utf8');

      applyMigration(version, sql);
      console.info(`[migrate] Applied migration ${version}`);
    }
  } finally {
    db.close();
  }
}

export function getDatabaseFilePath() {
  return DB_FILE;
}
