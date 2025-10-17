import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataPath, assertAllowedPath } from '../../core/utils/security.js';
import { createDatabaseInstance } from '../../db/sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = resolveDataPath();
const dbPath = resolveDataPath('db.sqlite');
const migrationsDir = path.join(__dirname, '../../db/migrations');
const SCHEMA_TABLE_NAME = 'schema_migrations';
const SCHEMA_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${SCHEMA_TABLE_NAME} (
  version TEXT PRIMARY KEY,
  appliedAt TEXT NOT NULL
)`;

const REQUIRED_TABLES = [
  'Projects',
  'Agents',
  'Pipelines',
  'Runs',
  'Briefs',
  'Logs',
  'Schedules',
  'Metrics',
  'Reports',
  'EntityHistory',
  SCHEMA_TABLE_NAME
];

const REQUIRED_INDEXES = [
  { table: 'Projects', name: 'idx_projects_createdAt' },
  { table: 'Agents', name: 'idx_agents_projectId' },
  { table: 'Agents', name: 'idx_agents_createdAt' },
  { table: 'Pipelines', name: 'idx_pipelines_projectId' },
  { table: 'Pipelines', name: 'idx_pipelines_createdAt' },
  { table: 'Runs', name: 'idx_runs_projectId' },
  { table: 'Runs', name: 'idx_runs_pipelineId' },
  { table: 'Runs', name: 'idx_runs_createdAt' },
  { table: 'Briefs', name: 'idx_briefs_projectId' },
  { table: 'Briefs', name: 'idx_briefs_createdAt' },
  { table: 'Schedules', name: 'idx_schedules_projectId' },
  { table: 'Schedules', name: 'idx_schedules_pipelineId' },
  { table: 'Schedules', name: 'idx_schedules_createdAt' },
  { table: 'Metrics', name: 'idx_metrics_projectId' },
  { table: 'Reports', name: 'idx_reports_projectId' },
  { table: 'Reports', name: 'idx_reports_createdAt' },
  { table: 'EntityHistory', name: 'idx_history_entity' },
  { table: 'EntityHistory', name: 'idx_history_entity_version' },
  { table: 'EntityHistory', name: 'idx_history_createdAt' },
  { table: 'Logs', name: 'idx_logs_createdAt' },
  { table: 'Logs', name: 'idx_logs_runId' }
];

const REQUIRED_RUNTIME_TABLES = ['Agents', 'Pipelines', 'Runs', 'Briefs', 'Logs'];

const ensureDataDirectory = () => {
  const rootDataPath = path.join(process.cwd(), 'data');
  fs.mkdirSync(rootDataPath, { recursive: true });

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(assertAllowedPath(dataDir), { recursive: true });
  }
};

const ensureDatabaseFile = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    const handle = fs.openSync(targetPath, 'a');
    fs.closeSync(handle);
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

const ensureSchemaTable = (db) => {
  db.exec(SCHEMA_TABLE_SQL);
};

const toMigrationVersion = (file) => file.replace(/\.sql$/i, '');

const escapeIdentifier = (value) => String(value).replace(/'/g, "''");

const getTableNames = (db) => {
  const statement = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(statement.all().map((row) => row.name));
};

const getIndexNamesForTable = (db, table) => {
  const statement = db.prepare(`PRAGMA index_list('${escapeIdentifier(table)}')`);
  return new Set(statement.all().map((row) => row.name));
};

export const runMigrations = async () => {
  ensureDataDirectory();

  const migrations = await loadMigrations();
  const safeDbPath = assertAllowedPath(dbPath);
  ensureDatabaseFile(safeDbPath);
  const db = createDatabaseInstance(safeDbPath);

  try {
    db.pragma('journal_mode = WAL');
    ensureSchemaTable(db);

    const appliedVersions = new Set(
      db
        .prepare(`SELECT version FROM ${SCHEMA_TABLE_NAME} ORDER BY version ASC`)
        .all()
        .map((row) => row.version)
    );

    for (const file of migrations) {
      const version = toMigrationVersion(file);

      if (appliedVersions.has(version)) {
        continue;
      }

      const sql = await readMigrationFile(file);

      db.exec('BEGIN');

      try {
        db.exec(sql);
        db
          .prepare(`INSERT INTO ${SCHEMA_TABLE_NAME} (version, appliedAt) VALUES (?, ?)`)
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

export const getMigrationStatus = async () => {
  ensureDataDirectory();

  const migrationFiles = await loadMigrations();
  const migrationVersions = migrationFiles.map((file) => toMigrationVersion(file));
  const safeDbPath = assertAllowedPath(dbPath);
  const databasePresent = fs.existsSync(safeDbPath);

  if (!databasePresent) {
    return {
      dbPath: safeDbPath,
      databasePresent,
      migrations: {
        files: migrationVersions,
        applied: [],
        pending: [...migrationVersions]
      },
      tables: {
        missing: [...REQUIRED_TABLES]
      },
      indexes: {
        missing: REQUIRED_INDEXES.map(({ table, name }) => `${table}.${name}`)
      }
    };
  }

  const db = createDatabaseInstance(safeDbPath, { readonly: true, fileMustExist: true });

  try {
    const tableNames = getTableNames(db);
    const missingTables = REQUIRED_TABLES.filter((table) => !tableNames.has(table));

    let applied = [];
    if (tableNames.has(SCHEMA_TABLE_NAME)) {
      applied = db
        .prepare(`SELECT version FROM ${SCHEMA_TABLE_NAME} ORDER BY version ASC`)
        .all()
        .map((row) => row.version);
    }

    const appliedSet = new Set(applied);
    const pending = migrationVersions.filter((version) => !appliedSet.has(version));

    const missingIndexes = [];
    for (const { table, name } of REQUIRED_INDEXES) {
      if (!tableNames.has(table)) {
        continue;
      }

      const indexes = getIndexNamesForTable(db, table);
      if (!indexes.has(name)) {
        missingIndexes.push(`${table}.${name}`);
      }
    }

    return {
      dbPath: safeDbPath,
      databasePresent,
      migrations: {
        files: migrationVersions,
        applied,
        pending
      },
      tables: {
        missing: missingTables
      },
      indexes: {
        missing: missingIndexes
      }
    };
  } finally {
    db.close();
  }
};

export const printMigrationStatus = async () => {
  const status = await getMigrationStatus();
  const { dbPath: targetPath, databasePresent, migrations, tables, indexes } = status;

  console.log(`Database path: ${targetPath}`);
  console.log(`Database present: ${databasePresent ? 'yes' : 'no'}`);
  console.log(
    `Applied migrations (${migrations.applied.length}/${migrations.files.length}): ${
      migrations.applied.length ? migrations.applied.join(', ') : 'none'
    }`
  );
  console.log(
    `Pending migrations (${migrations.pending.length}): ${
      migrations.pending.length ? migrations.pending.join(', ') : 'none'
    }`
  );

  if (tables.missing.length > 0) {
    console.log(`Missing tables (${tables.missing.length}): ${tables.missing.join(', ')}`);
  } else {
    console.log('All required tables are present.');
  }

  if (indexes.missing.length > 0) {
    console.log(`Missing indexes (${indexes.missing.length}): ${indexes.missing.join(', ')}`);
  } else {
    console.log('All required indexes are present.');
  }
};

export const ensureMigrations = async ({ logger = console } = {}) => {
  await runMigrations();
  const status = await getMigrationStatus();
  const missing = new Set(status.tables.missing);
  const missingRuntime = REQUIRED_RUNTIME_TABLES.filter((table) => missing.has(table));

  if (missingRuntime.length > 0) {
    throw new Error(`Missing required tables after migrations: ${missingRuntime.join(', ')}`);
  }

  if (logger) {
    logger.log(`✅ Database ready at ${status.dbPath}`);
    logger.log(`Tables: ${REQUIRED_RUNTIME_TABLES.join(', ')}`);
  }

  return status;
};

const isMainModule = () => {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    return false;
  }

  return path.resolve(scriptPath) === __filename;
};

if (isMainModule()) {
  const args = new Set(process.argv.slice(2));

  if (args.has('--status') || args.has('-s')) {
    printMigrationStatus().catch((error) => {
      console.error('Migration status check failed:', error);
      process.exitCode = 1;
    });
  } else if (args.has('--test')) {
    ensureMigrations()
      .catch((error) => {
        console.error('Migration test run failed:', error);
        process.exitCode = 1;
      });
  } else {
    runMigrations().catch((error) => {
      console.error('Migration execution failed:', error);
      process.exitCode = 1;
    });
  }
}
