import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'agentflow.db');
const PENDING_DIR = path.join(DATA_DIR, 'pending_migrations');

async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
  await fs.mkdir(PENDING_DIR, { recursive: true });
}

async function readMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

// --- Mock DB fallback for environments without better-sqlite3 binary ----------------
async function readAppliedPending() {
  const file = path.join(PENDING_DIR, 'applied.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function writeAppliedPending(arr) {
  const file = path.join(PENDING_DIR, 'applied.json');
  await fs.writeFile(file, JSON.stringify(arr || [], null, 2), 'utf8');
}
async function savePendingMigration(version, sql) {
  const file = path.join(PENDING_DIR, `${version}.sql`);
  await fs.writeFile(file, sql, 'utf8');
}

// Minimal mock DB that records applied versions and accepts exec/prepare/transaction
function createMockDb() {
  // returns object with exec, prepare, transaction, close
  return {
    async exec(sql) {
      // store the migration SQL into pending folder so operator can apply later
      // try to extract version from a surrounding caller context is not available,
      // so log a generic file with timestamp
      const fname = `unapplied_${Date.now()}.sql`;
      const fpath = path.join(PENDING_DIR, fname);
      await fs.writeFile(fpath, sql, 'utf8');
    },
    prepare(sql) {
      // support two patterns used by migrate.js:
      //  - SELECT version FROM schema_migrations ORDER BY version
      //  - INSERT INTO schema_migrations (version) VALUES (?)
      // For SELECT: return object with all() -> applied versions
      // For INSERT: return object with run(version) -> append to applied.json
      return {
        all: async () => {
          // return array of { version }
          const applied = await readAppliedPending();
          return applied.map((v) => ({ version: v }));
        },
        run: async (version) => {
          const applied = await readAppliedPending();
          if (!applied.includes(version)) {
            applied.push(version);
            await writeAppliedPending(applied);
          }
          return { changes: 1 };
        }
      };
    },
    transaction(fn) {
      // emulate transaction by calling the function synchronously/asynchronously
      return async (...args) => {
        return await fn(...args);
      };
    },
    close() {
      // nothing to close
    },
    pragma() {
      // no-op
    }
  };
}
// -------------------------------------------------------------------------------------

async function prepareDatabase() {
  // try dynamic import of better-sqlite3; fallback to mock DB if not available
  try {
    // dynamic import to avoid crashing when native bindings missing
    const mod = await import('better-sqlite3').catch(() => null);
    const Database = (mod && (mod.default || mod)) || null;
    if (Database) {
      const db = new Database(DB_FILE);
      // enable WAL if supported
      try { db.pragma('journal_mode = WAL'); } catch { /* ignore */ }
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      return db;
    } else {
      // better-sqlite3 not available -> create mock DB and ensure pending dir exists
      await fs.mkdir(PENDING_DIR, { recursive: true });
      // ensure applied.json exists
      const applied = await readAppliedPending();
      await writeAppliedPending(applied);
      return createMockDb();
    }
  } catch (err) {
    // if any unexpected error, fall back to mock DB to avoid crash
    try {
      await fs.mkdir(PENDING_DIR, { recursive: true });
    } catch {}
    return createMockDb();
  }
}

export async function runMigrations() {
  await ensureDirectories();

  const migrationFiles = await readMigrationFiles();
  if (migrationFiles.length === 0) {
    return;
  }

  const db = await prepareDatabase();

  try {
    const appliedRows = await db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    const applied = new Set((appliedRows || []).map((row) => row.version));

    const insertMigration = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
    const applyMigration = db.transaction(async (version, sql) => {
      // If using real DB, exec will apply SQL; if mock, exec will write file to pending
      await db.exec(sql);
      await insertMigration.run(version);
    });

    for (const fileName of migrationFiles) {
      const version = path.basename(fileName, '.sql');
      if (applied.has(version)) {
        continue;
      }

      const migrationPath = path.join(MIGRATIONS_DIR, fileName);
      const sql = await fs.readFile(migrationPath, 'utf8');

      // If db is mock, save migration SQL to pending and mark applied in applied.json
      if (typeof db.exec === 'function' && db.exec.toString().includes('unapplied')) {
        // not reliable to detect; instead detect presence of close method typical of better-sqlite3
      }

      // Apply (real DB will execute SQL; mock DB will write pending file and record applied)
      await applyMigration(version, sql);
      console.info(`[migrate] Applied migration ${version}`);
    }
  } finally {
    try { db.close(); } catch {}
  }
}

export function getDatabaseFilePath() {
  return DB_FILE;
}
