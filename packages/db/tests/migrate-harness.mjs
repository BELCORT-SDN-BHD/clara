// Shared fixture plumbing for the migrate-* runner battery.
//
// NOT a test file — only *.test.mjs is collected; the cells import this.
//
// Each runner cell spins its OWN disposable database, because the runner under test
// owns session state, an advisory lock and the migration ledger: sharing a database
// between cells would let one cell's ledger decide another cell's outcome. The
// connection details still come from the ENVIRONMENT only (a DSN URL var or libpq
// PG*) — these helpers redirect which DATABASE is targeted, never how to authenticate.

import { randomUUID } from "node:crypto";

const ENV_KEYS = ["DATABASE_URL", "WORKFLOW_POSTGRES_URL", "PGDATABASE", "PGUSER"];

/** A unique, SQL-safe disposable database name for one test file. */
export function disposableDatabaseName(prefix) {
  const name = `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  if (!/^[a-z0-9_]+$/u.test(name)) throw new Error(`disposable database name is not a bare identifier: ${name}`);
  return name;
}

/**
 * pg client config for the ambient target, optionally pointed at `database`.
 * Mirrors lib/pg.mjs: a DSN URL var wins, otherwise libpq PG* are read by pg itself.
 */
export function connectionConfig(database) {
  const raw = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
  if (!raw) return { user: process.env.PGUSER || "postgres", ...(database ? { database } : {}) };
  const url = new URL(raw);
  if (database) url.pathname = `/${database}`;
  return { connectionString: url.toString() };
}

/**
 * Point the runner's environment at `dbname`. Returns the restore function — the
 * two-runner serialization cell needs the environment held across concurrent calls,
 * which a scoped wrapper cannot express.
 */
export function setDatabaseEnv(dbname) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${dbname}`;
    process.env.DATABASE_URL = url.toString();
    // A URL is authoritative here — for migrate.mjs's own connConfig() AND for every
    // other consumer that checks DATABASE_URL first. Leaving PGDATABASE set too (even to
    // this SAME dbname) manufactures a phantom PG* source for a STRICTER consumer: e.g.
    // packages/runtime/lib/relay.mjs's own assertNoTargetSplit treats "PGDATABASE is
    // set" as an independent target, invents localhost:5432 defaults for the unset
    // PGHOST/PGPORT, and then throws a false target-split against the URL's REAL
    // host/port on any DSN-configured dev machine (127.0.0.1, the dsn-bridge port, a
    // remote pooler — anything that isn't literally localhost:5432). Deleting it removes
    // that phantom source; nothing needs it once a URL is authoritative (pg_dump/psql
    // get PGDATABASE rebuilt fresh FROM the url by lib/pg.mjs's own
    // childEnvForExternalTools()).
    delete process.env.PGDATABASE;
  } else if (process.env.WORKFLOW_POSTGRES_URL) {
    const url = new URL(process.env.WORKFLOW_POSTGRES_URL);
    url.pathname = `/${dbname}`;
    process.env.WORKFLOW_POSTGRES_URL = url.toString();
    delete process.env.PGDATABASE; // same reasoning as the DATABASE_URL branch above.
  } else {
    process.env.PGUSER ||= "postgres";
    process.env.PGDATABASE = dbname;
  }
  return () => {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
  };
}

/** Run fn with the runner's environment pointed at `dbname`, restoring it afterwards. */
export async function withDatabaseEnv(dbname, fn) {
  const restore = setDatabaseEnv(dbname);
  try {
    return await fn();
  } finally {
    restore();
  }
}
