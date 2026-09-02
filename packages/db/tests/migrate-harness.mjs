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
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

/**
 * Clone the AMBIENT (already fully-migrated) database into `targetDb` via
 * `pg_dump | psql`, instead of replaying `migrate()` a second time on the same
 * Postgres SERVER.
 *
 * Roles are CLUSTER-WIDE in Postgres, not per-database. A from-scratch `migrate()`
 * replay reaches a migration's own cluster-wide role census at that migration's
 * position in ITS OWN sequence; if any earlier full pass on the same server (e.g.
 * CI's own `pnpm db:migrate` estate step) already minted a role that a later
 * migration's tail census counts, the replay's own pass sees the resulting
 * cluster-wide count and refuses — a structural mismatch between "a Postgres
 * SERVER can only ever be fully migrated from empty once" and "give this file
 * another private database" (first hit: migration `0154`'s role-count tail
 * assertion, once migration `0160` began minting two roles the estate's own
 * migrate step always completes before any test file's `before()`/top-level-await
 * setup runs). Cloning the ambient database sidesteps this at the root: no
 * migration body ever runs a second time, so no migration-internal cluster-wide
 * census can misfire this way again, on this migration or a future one.
 *
 * `sourceEnv` MUST be captured (via `packages/db/lib/pg.mjs`'s
 * `childEnvForExternalTools()`) BEFORE the caller points this process's
 * `DATABASE_URL` / `WORKFLOW_POSTGRES_URL` / `PGDATABASE` at `targetDb` (e.g. via
 * `setDatabaseEnv()` above) — passing the post-redirect env would clone the
 * target database from itself. `targetDb` must already exist (`CREATE DATABASE`)
 * before calling this. Credentials travel only via env, never argv, matching
 * `lib/pg.mjs`'s own convention (constraint 4). `pg_dump` does not capture roles
 * (already correct — they are cluster-wide); it carries over schema, data,
 * OWNERS and PRIVILEGES faithfully, which is the security envelope (SECURITY
 * DEFINER ownership, GRANT/REVOKE, RLS) a private-database test fixture needs to
 * preserve. `pg_dump`'s own MVCC snapshot makes this read-only-safe against any
 * concurrently-writing sibling suite on the same shared ambient database.
 */
export function cloneAmbientDatabase(sourceEnv, targetDb) {
  const dumpDir = mkdtempSync(join(tmpdir(), "clara-clone-"));
  const dumpFile = join(dumpDir, "estate.sql");
  try {
    const pgDumpBin = process.env.PG_DUMP || "pg_dump";
    const dump = spawnSync(pgDumpBin, ["--no-comments", "--file", dumpFile], {
      env: sourceEnv,
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (dump.error) throw new Error(`pg_dump failed to start (${dump.error.message})`);
    if (dump.status !== 0) throw new Error(`pg_dump exited ${dump.status} cloning the ambient database`);

    const psqlBin = process.env.PSQL || "psql";
    const targetEnv = { ...sourceEnv, PGDATABASE: targetDb };
    const restore = spawnSync(
      psqlBin,
      ["-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", dumpFile, "--dbname", targetDb],
      { env: targetEnv, stdio: ["ignore", "inherit", "inherit"] },
    );
    if (restore.error) throw new Error(`psql failed to start (${restore.error.message})`);
    if (restore.status !== 0) throw new Error(`psql exited ${restore.status} restoring into ${targetDb}`);
  } finally {
    rmSync(dumpDir, { recursive: true, force: true });
  }
}
