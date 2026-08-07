// Minimal, dependency-light migration runner (node-postgres).
//
// - Applies migrations/NNNN_*.sql in numeric order, each in its own transaction.
// - Records version + sha256 in clara.schema_migrations (created here).
// - Idempotent: already-applied migrations are skipped; a checksum mismatch on
//   an applied migration ABORTS (migrations are immutable — add a new file).
// - HISTORY INTEGRITY (F4): every previously-applied version must still be
//   present on disk with its original checksum. A deleted or renamed applied
//   migration ABORTS — it would otherwise green a fresh CI DB while breaking a
//   real deploy-onto-existing (and a rename re-executes the old effects).
// - ORDERING + CONCURRENCY (F10): filenames must be fixed-width zero-padded
//   (NNNN_) so 10_ can't sort before 2_; duplicate version numbers are rejected;
//   a session advisory lock serialises concurrent runners.
//
// Connection comes from the environment only (see lib/pg.mjs). Never a DSN in argv.
// The migrations directory can be overridden with CLARA_MIGRATIONS_DIR (or the
// `dir` option) — an override hook for local/manual runs. NOTE: CI's
// deploy-onto-existing check does NOT use this var; it swaps the files on disk
// (`git checkout origin/main -- packages/db/migrations`, then re-runs migrate).

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient, targetLabel, isMain, assertNoTargetSplit } from "../lib/pg.mjs";

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

// Fixed-width grammar: exactly 4 leading digits, then _name.sql. Rejecting a
// variable-width prefix is what makes lexical sort == numeric sort safe.
const MIGRATION_NAME = /^(\d{4})_[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/;
// A migration looks like a migration if it starts with digits + .sql — used to
// catch a badly-named file (e.g. "10_x.sql") instead of silently skipping it.
const MIGRATION_LIKE = /^\d+.*\.sql$/;

// Arbitrary but fixed key for the migration advisory lock (namespaced constants).
const LOCK_KEY_1 = 0x1a2b3c4d;
const LOCK_KEY_2 = 0x00c1a7a; // "clara"

function sha256(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

/** Read + validate the on-disk migration set. Throws on a grammar/duplicate error. */
function loadMigrationFiles(dir) {
  const all = readdirSync(dir);
  const migrations = [];
  const seen = new Map(); // version -> filename
  for (const file of all.sort()) {
    if (!MIGRATION_LIKE.test(file)) continue; // not a migration file at all
    const m = MIGRATION_NAME.exec(file);
    if (!m) {
      throw new Error(
        `migration filename "${file}" is malformed — migrations must be fixed-width NNNN_name.sql (four leading digits, e.g. 0002_add_x.sql). Variable-width prefixes sort incorrectly (10_ before 2_).`,
      );
    }
    const num = m[1];
    if (seen.has(num)) {
      throw new Error(
        `duplicate migration version ${num}: "${seen.get(num)}" and "${file}". Each version number must be unique.`,
      );
    }
    seen.set(num, file);
    migrations.push({ file, version: file.replace(/\.sql$/, ""), num: Number(num) });
  }
  // Numeric order (defensive — fixed width already makes lexical == numeric).
  migrations.sort((a, b) => a.num - b.num);
  return migrations;
}

export async function migrate({ log = console.log, dir } = {}) {
  const MIGRATIONS_DIR = dir || process.env.CLARA_MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR;
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  const migrations = loadMigrationFiles(MIGRATIONS_DIR);
  const byVersion = new Map(migrations.map((m) => [m.version, m]));

  // Refuse if a DSN URL var and PG* resolve to different targets (finding 1) —
  // a mutation must never run under an ambiguous target.
  assertNoTargetSplit();

  const client = makeClient();
  // MIGRATION NOTICES ARE OUTPUT, NOT EXHAUST (added 2026-08-08, minted by 0049's review).
  // node-postgres discards every server NOTICE unless something listens, and this runner
  // never listened — so a migration whose in-transaction census reports through
  // `raise notice` printed NOTHING through the production apply path, while the same file
  // under `psql -f` printed all of it. A ceremony was being told to read a number that was
  // never on its screen; an unprinted number is not evidence. Routed through `log`, so the
  // callers that pass a silent log (the rig's upgrade tests) stay silent.
  client.on("notice", (n) => {
    const msg = (n?.message ?? "").toString();
    if (msg) log(`  [${(n?.severity ?? "NOTICE").toLowerCase()}] ${msg}`);
  });
  await client.connect();
  let locked = false;
  try {
    // Serialise concurrent runners for the whole read-then-apply window (F10).
    await client.query("select pg_advisory_lock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2]);
    locked = true;

    await client.query("create schema if not exists clara;");
    await client.query(`
      create table if not exists clara.schema_migrations (
        version    text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      );
    `);

    const appliedRows = (await client.query("select version, checksum from clara.schema_migrations")).rows;
    const applied = new Map(appliedRows.map((r) => [r.version, r.checksum]));

    // HISTORY INTEGRITY (F4): every applied version must still exist on disk with
    // its original checksum. Catches a deleted/renamed/edited applied migration
    // BEFORE we apply anything new — the failure a real deploy-onto-existing hits.
    const drift = [];
    for (const [version, checksum] of applied) {
      const onDisk = byVersion.get(version);
      if (!onDisk) {
        drift.push(
          `applied migration ${version} is MISSING from disk (deleted or renamed). Applied migrations are immutable history — restore the file; never delete or rename it.`,
        );
        continue;
      }
      const cur = sha256(readFileSync(join(MIGRATIONS_DIR, onDisk.file), "utf8"));
      if (cur !== checksum) {
        drift.push(
          `applied migration ${version} was MODIFIED after being applied (checksum drift). Migrations are immutable — add a new migration file instead.`,
        );
      }
    }
    if (drift.length) {
      throw new Error("migration-history integrity check failed:\n  - " + drift.join("\n  - "));
    }

    // ORDERING (finding 5): a pending migration whose number is <= the highest
    // ALREADY-APPLIED number was inserted below the frontier after later
    // migrations were applied — running it now would apply history out of order.
    // Reject it (renumber above the frontier). Applied versions are guaranteed on
    // disk here (the drift check above would have aborted otherwise).
    const maxAppliedNum = applied.size
      ? Math.max(...[...applied.keys()].map((v) => byVersion.get(v).num))
      : -1;
    for (const m of migrations) {
      if (applied.has(m.version)) continue;
      if (m.num <= maxAppliedNum) {
        throw new Error(
          `migration ${m.version} (number ${m.num}) is at or below the highest applied number (${maxAppliedNum}) but was never applied — a late-inserted lower number would run out of order. Renumber it above the frontier; migration history is append-only.`,
        );
      }
    }

    let count = 0;
    for (const { file, version } of migrations) {
      if (applied.has(version)) continue; // already applied + checksum verified above
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const checksum = sha256(sql);

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into clara.schema_migrations (version, checksum) values ($1, $2)", [version, checksum]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`migration ${version} failed and was rolled back: ${err.message}`);
      }
      log(`  applied ${version}`);
      count++;
    }

    log(`migrate: ${count} new migration(s) applied · ${migrations.length} total · target ${targetLabel()}`);
    return { applied: count, total: migrations.length };
  } finally {
    if (locked) {
      try {
        await client.query("select pg_advisory_unlock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2]);
      } catch {
        /* session ends on client.end() — lock released regardless */
      }
    }
    await client.end();
  }
}

if (isMain(import.meta.url)) {
  migrate().catch((err) => {
    console.error("migrate: FAIL —", err.message);
    process.exit(1);
  });
}
