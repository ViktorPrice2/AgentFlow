import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { resolveDataPath, assertAllowedPath } from '../core/utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = resolveDataPath();
const dbPath = resolveDataPath('app.db');
const migrationsDir = path.join(__dirname, 'migrations');

const ensureDataDirectory = async () => {
  if (!fs.existsSync(dataDir)) {
    await fsp.mkdir(assertAllowedPath(dataDir), { recursive: true });
  }
};

const loadMigrations = async () => {
  try {
    const files = await fsp.readdir(migrationsDir);
    return files
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
};

const readMigrationFile = (file) => fsp.readFile(path.join(migrationsDir, file), 'utf8');

export const runMigrations = async () => {
  await ensureDataDirectory();

  const migrations = await loadMigrations();
  const safeDbPath = assertAllowedPath(dbPath);
  const db = new Database(safeDbPath);

  try {
    db.pragma('journal_mode = WAL');
    db.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (\n        version TEXT PRIMARY KEY,\n        appliedAt TEXT NOT NULL\n      )`
    );

    const appliedVersions = new Set(
      db
        .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
        .all()
        .map((row) => row.version)
    );

    for (const file of migrations) {
      const version = file.replace(/\.sql$/i, '');

      if (appliedVersions.has(version)) {
        continue;
      }

      const sql = await readMigrationFile(file);

      db.exec('BEGIN');

      try {
        db.exec(sql);
        db
          .prepare('INSERT INTO schema_migrations (version, appliedAt) VALUES (?, ?)')
          .run(version, new Date().toISOString());
        db.exec('COMMIT');
      } catch (migrationError) {
        db.exec('ROLLBACK');
        migrationError.message = `Migration ${version} failed: ${migrationError.message}`;
        throw migrationError;
      }
    }
  } finally {
    db.close();
  }
};

if (import.meta.url === `file://${__filename}`) {
  runMigrations().catch((error) => {
    console.error('Migration execution failed:', error);
    process.exitCode = 1;
  });
}
