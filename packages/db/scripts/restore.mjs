// Restore — applies a plain-SQL dump file with psql, ON_ERROR_STOP=1.
//
// Connection is via libpq env vars only (see backup.mjs). psql 16+ can restore
// a plain dump into a Postgres 17 server (only pg_dump enforces a strict
// server-version match). Point PSQL at a specific binary if PATH's is wrong.
//
// Usage:
//   node scripts/restore.mjs --file <path.sql>

import { spawnSync } from "node:child_process";
import { targetLabel, isMain } from "../lib/pg.mjs";

/**
 * @param {{ file: string, log?: (s:string)=>void }} opts
 */
export function restore(opts) {
  if (!opts || !opts.file) throw new Error("restore requires { file }");
  const { file, log = console.log } = opts;
  const bin = process.env.PSQL || "psql";
  const args = ["-X", "-v", "ON_ERROR_STOP=1", "-f", file, "--dbname", process.env.PGDATABASE || "postgres"];

  log(`restore: ${bin} -f ${file} · target ${targetLabel()}`);
  const r = spawnSync(bin, args, { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  if (r.error) throw new Error(`psql failed to start (${r.error.message})`);
  if (r.status !== 0) throw new Error(`psql exited ${r.status}`);
  log("restore: OK");
  return { ok: true };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") opts.file = argv[++i];
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
