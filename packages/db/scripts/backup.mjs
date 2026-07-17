// Backup — pg_dump of schema+data to a timestamped plain-SQL file.
//
// Connection is via libpq env vars only (PGHOST/PGPORT/PGUSER/PGPASSWORD/
// PGDATABASE) — pg_dump does NOT read DATABASE_URL, and we never put a DSN on
// the command line. The pg_dump binary MUST match the server major version
// (Postgres 17 here). On a machine whose PATH pg_dump is older, point PG_DUMP
// at a v17 binary, e.g. PG_DUMP=/path/to/pg17/bin/pg_dump.
//
// Usage:
//   node scripts/backup.mjs [--schema <name> | --all] [--out <file>]
// Defaults: --schema clara, output under packages/db/backups/ (gitignored).

import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { targetLabel, isMain } from "../lib/pg.mjs";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function tsStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * @param {{ schema?: string, all?: boolean, out?: string, log?: (s:string)=>void }} [opts]
 * @returns {{ file: string, bytes: number }}
 */
export function backup(opts = {}) {
  const { schema = "clara", all = false, log = console.log } = opts;
  const bin = process.env.PG_DUMP || "pg_dump";
  const backupDir = process.env.CLARA_BACKUP_DIR || join(PKG_ROOT, "backups");
  mkdirSync(backupDir, { recursive: true });

  const label = all ? "all" : schema;
  const out = opts.out || join(backupDir, `clara-${label}-${tsStamp()}.sql`);

  const args = ["--no-owner", "--no-privileges", "--format=plain"];
  if (!all) args.push("--schema", schema);
  args.push("--file", out);
  // dbname from env (not a secret); libpq supplies host/port/user/password.
  args.push("--dbname", process.env.PGDATABASE || "postgres");

  log(`backup: ${bin} ${all ? "(whole db)" : `schema=${schema}`} -> ${out} · target ${targetLabel()}`);
  const r = spawnSync(bin, args, { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  if (r.error) throw new Error(`pg_dump failed to start (${r.error.message}). Is PG_DUMP set to a v17 binary?`);
  if (r.status !== 0) throw new Error(`pg_dump exited ${r.status}`);

  const bytes = statSync(out).size;
  log(`backup: OK — ${bytes} bytes written`);
  return { file: out, bytes };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--schema") opts.schema = argv[++i];
    else if (argv[i] === "--all") opts.all = true;
    else if (argv[i] === "--out") opts.out = argv[++i];
  }
  return opts;
}

if (isMain(import.meta.url)) {
  try {
    backup(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error("backup: FAIL —", err.message);
    process.exit(1);
  }
}
