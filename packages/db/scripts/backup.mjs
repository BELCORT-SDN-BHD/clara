// Backup — pg_dump of schema+data to a timestamped plain-SQL file.
//
// Two profiles (finding 8 — the DR contract must be honest about what it protects):
//   - DEFAULT (`db:backup`, --schema clara): the app books only. A quick app-state
//     snapshot. It does NOT capture in-flight durable runs.
//   - FULL (`db:backup:full`, --profile full): the PRODUCTION DR profile — every
//     authoritative schema that exists (clara + the durable-runtime schemas
//     `workflow` / `graphile_worker`) plus best-effort globals (roles). This is
//     what a real restore needs so it never loses in-flight runs. Scheduled DR
//     must use the full profile (see docs/ops/DR.md).
//
// Connection is via libpq env vars only (PGHOST/PGPORT/PGUSER/PGPASSWORD/
// PGDATABASE) — pg_dump does NOT read DATABASE_URL, and we never put a DSN on the
// command line. The pg_dump binary MUST match the server major version
// (Postgres 17 here). On a machine whose PATH pg_dump is older, point PG_DUMP at a
// v17 binary, e.g. PG_DUMP=/path/to/pg17/bin/pg_dump (PG_DUMPALL for globals).
//
// Usage:
//   node scripts/backup.mjs [--schema <name> | --all | --profile full] [--out <file>]
// Defaults: --schema clara, output under packages/db/backups/ (gitignored).

import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient, targetLabel, isMain, childEnvForExternalTools } from "../lib/pg.mjs";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Authoritative schemas for the FULL DR profile (durable-runtime state included).
const AUTHORITATIVE_SCHEMAS = ["clara", "workflow", "graphile_worker"];

function tsStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
function backupDir() {
  const dir = process.env.CLARA_BACKUP_DIR || join(PKG_ROOT, "backups");
  mkdirSync(dir, { recursive: true });
  return dir;
}
function safeLabel(s) {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "backup";
}

/**
 * pg_dump one or more schemas (or the whole db) to a plain-SQL file.
 * @param {{ schema?: string, schemas?: string[], all?: boolean, out?: string, log?: (s:string)=>void }} [opts]
 * @returns {{ file: string, bytes: number, schemas: string[] | null }}
 */
export function backup(opts = {}) {
  const { all = false, log = console.log } = opts;
  const bin = process.env.PG_DUMP || "pg_dump";
  const schemaList = all ? null : opts.schemas && opts.schemas.length ? opts.schemas : [opts.schema || "clara"];

  const label = all ? "all" : safeLabel(schemaList.join("+"));
  const out = opts.out || join(backupDir(), `clara-${label}-${tsStamp()}.sql`);

  // Canonical child env: when a DSN URL is set, PGHOST/PGPORT/PGUSER/PGPASSWORD/
  // PGDATABASE are derived from it (pg_dump ignores the URL) and conflicting
  // inherited PG* are cleared — so the dump lands on the SAME target as targetLabel.
  // Throws on a URL-vs-PG* split (finding 1).
  const childEnv = childEnvForExternalTools();

  const args = ["--no-owner", "--no-privileges", "--format=plain"];
  if (!all) for (const s of schemaList) args.push("--schema", s);
  args.push("--file", out);
  args.push("--dbname", childEnv.PGDATABASE || "postgres"); // libpq (childEnv) supplies host/port/user/password

  log(`backup: ${bin} ${all ? "(whole db)" : `schema(s)=${schemaList.join(",")}`} -> ${out} · target ${targetLabel()}`);
  const r = spawnSync(bin, args, { stdio: ["ignore", "inherit", "inherit"], env: childEnv });
  if (r.error) throw new Error(`pg_dump failed to start (${r.error.message}). Is PG_DUMP set to a v17 binary?`);
  if (r.status !== 0) throw new Error(`pg_dump exited ${r.status}`);

  const bytes = statSync(out).size;
  log(`backup: OK — ${bytes} bytes written`);
  return { file: out, bytes, schemas: schemaList };
}

/** Best-effort globals (roles) dump. Managed projects may deny it — warn, don't fail. */
function dumpGlobals({ log = console.log } = {}) {
  const bin = process.env.PG_DUMPALL || "pg_dumpall";
  const out = join(backupDir(), `clara-globals-${tsStamp()}.sql`);
  const r = spawnSync(bin, ["--globals-only", "--no-role-passwords", "--file", out], {
    stdio: ["ignore", "inherit", "inherit"],
    env: childEnvForExternalTools(), // same canonical target as the schema dump
  });
  if (r.error || r.status !== 0) {
    log(
      `backup(full): globals dump SKIPPED (${r.error ? r.error.message : "exit " + r.status}) — roles may not be dumpable by this user on a managed project; capture globals out-of-band (see docs/ops/DR.md).`,
    );
    return null;
  }
  log(`backup(full): globals -> ${out}`);
  return out;
}

/**
 * FULL production DR profile: every authoritative schema that exists + globals.
 * @param {{ out?: string, log?: (s:string)=>void }} [opts]
 */
export async function backupFull(opts = {}) {
  const { log = console.log } = opts;
  const client = makeClient();
  await client.connect();
  let present;
  try {
    const r = await client.query("select nspname from pg_namespace where nspname = any($1) order by nspname", [
      AUTHORITATIVE_SCHEMAS,
    ]);
    present = r.rows.map((x) => x.nspname);
  } finally {
    await client.end();
  }
  if (present.length === 0) {
    throw new Error(`full backup: none of the authoritative schemas exist (${AUTHORITATIVE_SCHEMAS.join(", ")}).`);
  }
  log(`backup(full): authoritative schemas present: ${present.join(", ")} · target ${targetLabel()}`);
  const res = backup({ schemas: present, out: opts.out, log });
  const globals = dumpGlobals({ log });
  return { ...res, globals };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--schema") opts.schema = argv[++i];
    else if (argv[i] === "--all") opts.all = true;
    else if (argv[i] === "--profile") opts.profile = argv[++i];
    else if (argv[i] === "--out") opts.out = argv[++i];
  }
  return opts;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const run = args.profile === "full" ? backupFull(args) : Promise.resolve().then(() => backup(args));
  run.catch((err) => {
    console.error("backup: FAIL —", err.message);
    process.exit(1);
  });
}
