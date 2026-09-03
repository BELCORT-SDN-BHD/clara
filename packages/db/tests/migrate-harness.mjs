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
import pg from "pg";
import { assertDestructiveAllowed } from "../lib/guard.mjs";

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
 * OWNERS and PRIVILEGES (SECURITY DEFINER ownership, GRANT/REVOKE, RLS) — but
 * NOT `COMMENT ON` bodies (`--no-comments`, rev-498 MINOR-2: 45 dropped on one
 * measured estate; nothing reads one today). `pg_dump`'s own MVCC snapshot makes
 * this read-only-safe against any concurrently-writing sibling suite, but the
 * clone therefore carries THAT suite's committed state too, whatever it is at
 * the snapshot instant — not a deterministic function of "the migrated estate"
 * alone (rev-498 MINOR-3).
 *
 * **Guarded, over `sourceEnv` — not ambient `process.env`.** The very first
 * statement is `assertDestructiveAllowed({ env: sourceEnv })`
 * (`packages/db/lib/guard.mjs:52`) — the SAME gate `reset.mjs`/`seed.mjs`/
 * `restore.mjs`/`restore-full.mjs`/`dr-selftest.mjs` already enforce for every
 * other destructive data-plane operation, evaluated over the exact env this
 * call is about to read FROM (rev-498 M2: `sourceEnv` and `process.env` agree
 * for every caller today, but a future caller passing a `sourceEnv` derived
 * from something else must not silently gate the wrong target). Refuses unless
 * `CLARA_ALLOW_DESTRUCTIVE=1` is set AND the resolved source is disposable
 * (`localhost`/`127.0.0.1`/a `*_ci`/`*_test`/`*_tmp` database) or the operator
 * names it exactly via `CLARA_DESTRUCTIVE_TARGET`. **Necessary, not sufficient**
 * (rev-498, #518 D3): `targetIsEphemeral` authorises ANY loopback host
 * regardless of database name — `127.0.0.1/clara_production_copy` passes. It
 * closes the remote-live-cluster footgun (an arbitrary ambient DSN pointing at
 * a real project); it does not prove a LOCAL Postgres holds only disposable data.
 */
export function cloneAmbientDatabase(sourceEnv, targetDb) {
  assertDestructiveAllowed({ action: `cloneAmbientDatabase (pg_dump | psql clone of the ambient database into "${targetDb}")`, env: sourceEnv });
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
      // -q (rev-498 INFO-1): unquiet, every SET/CREATE/ALTER/COPY status tag from restoring
      // the whole estate lands as a `#` line in the TAP stream -- ~16k lines per clone,
      // burying real output in the one job whose log people read when the estate reds.
      ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", dumpFile, "--dbname", targetDb],
      { env: targetEnv, stdio: ["ignore", "inherit", "inherit"] },
    );
    if (restore.error) throw new Error(`psql failed to start (${restore.error.message})`);
    if (restore.status !== 0) throw new Error(`psql exited ${restore.status} restoring into ${targetDb}`);
  } finally {
    rmSync(dumpDir, { recursive: true, force: true });
  }
}

/**
 * Assert a `cloneAmbientDatabase()` target actually landed real content — rev-498
 * M1: the dump/restore's own exit-status checks catch a FAILING pg_dump/psql,
 * never a SUCCESSFUL EMPTY one (a `sourceEnv` resolving to the wrong database, a
 * `PG_DUMP` pointed at a schema-filtering wrapper, or a future reordering that
 * captures `sourceEnv` after the env redirect). Measured: excluding schema
 * `clara` from the dump leaves both `pg_dump`/`psql` at exit 0 while a consumer
 * whose readiness probe is fail-OPEN (skip on absent schema, never throw) goes
 * silently green with its ENTIRE battery skipped — a clone this hollow must
 * throw here, loud, before any consumer gets the chance to skip past it.
 *
 * Two positive reads, by EXACT SIGNATURE where the second applies (law 3 — a
 * bare function name is a projection, not the thing): `clara.schema_migrations`
 * actually has rows, and `witnessSignature` (a `to_regprocedure(...)` argument,
 * e.g. `"clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)"`)
 * resolves — callers name a body their OWN dependency chain actually needs, so
 * this stays a real content check rather than a generic row-count that could
 * pass on a schema missing exactly the thing the caller is about to use.
 * @param {import("pg").ClientConfig} clientConfig connectionConfig(targetDb) from the caller
 * @param {string} witnessSignature an exact `to_regprocedure()` argument
 */
export async function assertCloneIsPopulated(clientConfig, witnessSignature) {
  const probe = new pg.Client(clientConfig);
  await probe.connect();
  try {
    const migrations = await probe.query("select count(*)::int as n from clara.schema_migrations");
    if (migrations.rows[0].n === 0) throw new Error("cloneAmbientDatabase() landed an EMPTY private database (0 rows in clara.schema_migrations)");
    const witness = await probe.query("select to_regprocedure($1) as fn", [witnessSignature]);
    if (!witness.rows[0].fn) throw new Error(`the cloned database is missing the witness ${witnessSignature} — not the real schema`);
  } finally {
    await probe.end();
  }
}

/**
 * `CREATE DATABASE "<dbname>"` on the ambient cluster, via an already-connected
 * admin client (`connectionConfig()`, pointed at whatever the ambient target
 * currently is — the new database does not exist yet, so there is nothing else
 * to connect to). Guarded the same way `cloneAmbientDatabase()` is: refuses
 * unless `CLARA_ALLOW_DESTRUCTIVE=1` names a disposable or explicitly-confirmed
 * ambient target. Two files (`packages/runtime/tests/relay-taxonomy.test.mjs`,
 * `packages/runtime/tests/fs7-v17-chatturn-db.test.mjs`) independently minted
 * their own unguarded `CREATE DATABASE`/`DROP DATABASE` calls before this helper
 * existed — this is the one shared, gated spelling both now use.
 */
export async function createDisposableDatabase(adminClient, dbname) {
  assertDestructiveAllowed({ action: `createDisposableDatabase (CREATE DATABASE "${dbname}")` });
  await adminClient.query(`create database "${dbname}"`);
}

/**
 * Poll `pg_stat_activity` on `adminClient` (connected to a DIFFERENT database
 * than `dbname`, the same requirement `dropDisposableDatabase()` has) until no
 * backend is attached to `dbname`, or `timeoutMs` elapses — call this AFTER
 * every pool pointed at `dbname` has been closed and BEFORE
 * `dropDisposableDatabase()` (rev-534 F-2, minted from CI job 100523835379's
 * real channel). `pool.end()` (node-postgres / pg-pool) resolves once every
 * client has been TOLD to end but does not itself await the underlying
 * socket's close (`_remove()`'s own `client.end(cb)` is fire-and-forget), so
 * an idle backend can still be attached to `dbname` for a few ms after
 * `endPool()` resolves — on a contended host that window is wide enough for
 * `DROP DATABASE ... WITH (FORCE)` to `TerminateOtherDBBackends` a socket that
 * is still mid-close, surfacing as `FATAL: terminating connection due to
 * administrator command` (57P01) on that connection. `WITH (FORCE)` stays as
 * the BACKSTOP for whatever this bounded poll does not catch — this narrows
 * the window, it does not replace the force flag. Best-effort like
 * `dropDisposableDatabase()`: a probe failure or a timeout both fall through
 * to that backstop rather than throwing from teardown. FAILS OPEN AND PRINTS
 * NOTHING ITSELF — the caller logs `{ cleared, remaining }` (PRINT-THE-THING:
 * a silent wait is an absence-shaped instrument); a caller that discards the
 * result cannot tell "drained cleanly" from "gave up with N attached".
 * @returns {Promise<{ cleared: boolean, remaining: number }>}
 */
export async function waitForBackendsClear(adminClient, dbname, { timeoutMs = 5000, stepMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let remaining = -1;
  for (;;) {
    try {
      const r = await adminClient.query("select count(*)::int as n from pg_stat_activity where datname = $1", [dbname]);
      remaining = r.rows[0].n;
      if (remaining === 0) return { cleared: true, remaining: 0 };
    } catch {
      return { cleared: false, remaining }; // best-effort — fall through to the FORCE-drop backstop
    }
    if (Date.now() >= deadline) return { cleared: false, remaining };
    await new Promise((res) => setTimeout(res, stepMs));
  }
}

/**
 * `DROP DATABASE IF EXISTS "<dbname>" WITH (FORCE)`, best-effort (never throws —
 * a teardown failure must never mask the real test failure it is cleaning up
 * after; see the `cleanupPrivateDb`/`after()` review history on both consumers
 * for why this stays unguarded and swallowed). `adminClient` must be connected
 * to a DIFFERENT database than `dbname` (Postgres refuses to drop the database a
 * connection is currently using) — callers restore the ambient target before
 * calling this. Not gated by `assertDestructiveAllowed()`: the guard already ran
 * at `createDisposableDatabase()`/`cloneAmbientDatabase()` for this same
 * `dbname`, and re-checking here would risk throwing from teardown, which is
 * exactly the class of bug PR #498's own review history (M1/R2) already fixed
 * once for this exact code path. Callers should call `waitForBackendsClear()`
 * first (rev-534 F-2) — `WITH (FORCE)` here is the backstop for whatever that
 * bounded drain does not catch, not the primary mechanism.
 */
export async function dropDisposableDatabase(adminClient, dbname) {
  await adminClient.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
}
