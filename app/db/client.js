import path from 'node:path';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'agentflow.db');

let dbInstance;

async function ensureDataDirectory() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  await ensureDataDirectory();

  dbInstance = new Database(DB_FILE);
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('journal_mode = WAL');

  return dbInstance;
}

export function getDbPath() {
  return DB_FILE;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = undefined;
  }
}
