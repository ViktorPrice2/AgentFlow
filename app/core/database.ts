import DatabaseConstructor from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export class Database {
  private static instance: Database | null = null;
  private db: DatabaseConstructor.Database;

  private constructor(dbPath?: string) {
    const resolved = dbPath ?? path.resolve('app/data/agentflow.db');
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseConstructor(resolved);
    this.db.pragma('journal_mode = WAL');
  }

  static getInstance(dbPath?: string): Database {
    if (!Database.instance) {
      Database.instance = new Database(dbPath);
    }
    return Database.instance;
  }

  get connection(): DatabaseConstructor.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
    Database.instance = null;
  }
}
