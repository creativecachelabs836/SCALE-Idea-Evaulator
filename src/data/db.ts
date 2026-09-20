import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '@/lib/config';
import { MIGRATIONS } from './migrations';

/**
 * The SQLite connection (spec section 7, Persistence).
 *
 * One connection per process, opened lazily so that importing this module
 * never touches the filesystem - a Server Component that only renders static
 * copy should not create a database file as a side effect of being bundled.
 *
 * better-sqlite3 is synchronous by design, which is why every repository
 * function below it is synchronous too. The orchestrator is the only caller
 * doing long work, and it is already off the request path.
 */

let connection: Database.Database | null = null;

function open(): Database.Database {
  const file = path.resolve(process.cwd(), config.dbPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);

  // WAL lets the poll endpoint read run progress while the orchestrator is
  // still writing it. Without it, every progress read would block behind the
  // run it is reporting on.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // A run and a poll can collide; wait rather than throwing SQLITE_BUSY.
  db.pragma('busy_timeout = 5000');

  migrate(db);
  return db;
}

/**
 * Apply any migration the database has not seen, in order, each in its own
 * transaction. Versions are recorded, so an existing database is upgraded
 * rather than recreated and no evaluation is ever lost to a schema change
 * (spec section 10).
 */
function migrate(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = new Set<number>(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    const run = db.transaction(() => {
      db.exec(migration.up);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      );
    });
    run();
  }
}

export function db(): Database.Database {
  if (!connection) connection = open();
  return connection;
}

/**
 * Close and forget the connection. Only used by tests, which point
 * `SCALE_DB_PATH` at a temporary file and need it released between cases.
 */
export function closeDb(): void {
  connection?.close();
  connection = null;
}
