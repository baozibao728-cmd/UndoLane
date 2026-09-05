import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { UndoLaneError } from '../contracts/index.ts';

export class UndoEngine {
  private db: Database.Database;
  constructor(path = ':memory:') {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }
  private migrate() {
    const migration = readFileSync(new URL('./migrations/001-core.sql', import.meta.url), 'utf-8');
    this.db.exec(migration);
  }
  close() { this.db.close(); }
}
