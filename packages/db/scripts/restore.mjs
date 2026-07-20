// Restore — applies a plain-SQL dump file with psql.
//
// GUARDED (finding 9): a restore OVERWRITES whatever database is in the ambient
// PG* / DATABASE_URL. It refuses unless CLARA_ALLOW_DESTRUCTIVE=1 AND the target
// is disposable or explicitly named via CLARA_DESTRUCTIVE_TARGET — so a restore
// can never silently land in the wrong project (see lib/guard.mjs).
//
// ATOMIC by default: psql runs with --single-transaction and ON_ERROR_STOP=1, so
// a failure rolls the WHOLE restore back instead of leaving a half-applied
// database. A dump profile that can't run in one transaction (e.g. one containing
// CREATE INDEX CONCURRENTLY) can opt out with --no-single-transaction.
//
// Connection is via libpq env vars only (see backup.mjs). psql 16+ can restore a
// plain dump into a Postgres 17 server. Point PSQL at a specific binary if needed.
//
// Usage:
//   node scripts/restore.mjs --file <path.sql> [--no-single-transaction]

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { targetLabel, isMain, childEnvForExternalTools } from "../lib/pg.mjs";
import { assertDestructiveAllowed } from "../lib/guard.mjs";

/**
 * @param {{ file: string, singleTransaction?: boolean, log?: (s:string)=>void }} opts
 */
export function restore(opts) {
  if (!opts || !opts.file) throw new Error("restore requires { file }");
  const { file, singleTransaction = true, log = console.log } = opts;
  // Fail fast and legibly on a bad path (restore-full.mjs already does). Without this,
  // psql opens the missing file itself and the operator sees a bare "psql exited 1"
  // from inside a restore — maximally confusing mid-drill. Relative paths resolve
  // against the CWD, so run these from the repo root.
  if (!existsSync(file)) throw new Error(`dump file not found: ${file} (paths resolve against the CWD — run from the repo root)`);

  assertDestructiveAllowed({ action: `restore (overwrite ${targetLabel()})` });

  // Canonical child env (finding 1): derives PG* from a DSN URL when set so psql
  // overwrites the SAME target the guard just authorized, never a split ambient DB.
  const childEnv = childEnvForExternalTools();
  const bin = process.env.PSQL || "psql";
  const args = ["-X", "-v", "ON_ERROR_STOP=1"];
  if (singleTransaction) args.push("--single-transaction");
  args.push("-f", file, "--dbname", childEnv.PGDATABASE || "postgres");

  log(`restore: ${bin} ${singleTransaction ? "--single-transaction " : ""}-f ${file} · target ${targetLabel()}`);
  const r = spawnSync(bin, args, { stdio: ["ignore", "inherit", "inherit"], env: childEnv });
  if (r.error) throw new Error(`psql failed to start (${r.error.message})`);
  if (r.status !== 0) throw new Error(`psql exited ${r.status}`);
  log("restore: OK");
  return { ok: true };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") opts.file = argv[++i];
    else if (argv[i] === "--no-single-transaction") opts.singleTransaction = false;
  }
  return opts;
}

if (isMain(import.meta.url)) {
  try {
    restore(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error("restore: FAIL —", err.message);
    process.exit(1);
  }
}
