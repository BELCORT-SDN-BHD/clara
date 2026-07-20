// Backup — pg_dump of schema+data to a timestamped plain-SQL file.
//
// Two profiles (finding 8 — the DR contract must be honest about what it protects):
//   - DEFAULT (`db:backup`, --schema clara): a DIAGNOSTIC books snapshot ONLY, dumped
//     WITHOUT owners/privileges (`--no-owner --no-privileges`) and WITHOUT the
//     durable-runtime schemas. It MUST NEVER be started as an application database
//     (Codex HIGH-2): restoring it into an empty DB yields postgres-owned,
//     PUBLIC-EXECUTABLE functions (the write wall is OPEN — clara_agent_ro can execute
//     approve_entry), and because the dump carries clara.schema_migrations, a re-migrate
//     is a NO-OP (the ledger says every migration already ran), so the ownership/REVOKE/
//     GRANT wall is NEVER rebuilt. Use it for inspection/diffing, not recovery.
//   - FULL (`db:backup:full`, --profile full): the ONLY production-recovery profile — every
//     authoritative schema that exists (clara + the durable-runtime trio
//     `workflow` / `workflow_drizzle` / `graphile_worker`) dumped WITH owners AND
//     privileges (Lane A G1/G2: the two-lane security model IS the GRANT/REVOKE matrix
//     + clara_fn_owner object ownership — a SECURITY DEFINER writer executes as its
//     owner, so stripping owners on restore is a privilege-ESCALATION, not a cosmetic
//     gap). Roles are cluster-level and NOT captured by pg_dump; the globals dump beside
//     it is an evidence/diff artifact only — the restorable role recreation is the
//     reviewed, idempotent deploy/roles-bootstrap.sql. This is what a real restore needs
//     so it never loses in-flight runs OR the security envelope. Scheduled DR must use
//     the full profile (see docs/ops/DR.md).
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
// The engine keeps its drizzle migration journal in a SEPARATE schema
// `workflow_drizzle` (table workflow_migrations — @workflow/world-postgres cli.js);
// restoring `workflow` without it leaves the engine's bootstrap inconsistent
// (silent no-op or a CREATE-SCHEMA collision), so the durable trio is captured as a
// consistent unit (Lane A finding 2).
export const AUTHORITATIVE_SCHEMAS = ["clara", "workflow", "workflow_drizzle", "graphile_worker"];

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
 * @param {{ schema?: string, schemas?: string[], all?: boolean, stripAclsAndOwners?: boolean, out?: string, log?: (s:string)=>void }} [opts]
 * @returns {{ file: string, bytes: number, schemas: string[] | null }}
 */
export function backup(opts = {}) {
  const { all = false, stripAclsAndOwners = true, log = console.log } = opts;
  const bin = process.env.PG_DUMP || "pg_dump";
  const schemaList = all ? null : opts.schemas && opts.schemas.length ? opts.schemas : [opts.schema || "clara"];

  const label = all ? "all" : safeLabel(schemaList.join("+"));
  const out = opts.out || join(backupDir(), `clara-${label}-${tsStamp()}.sql`);

  // Canonical child env: when a DSN URL is set, PGHOST/PGPORT/PGUSER/PGPASSWORD/
  // PGDATABASE are derived from it (pg_dump ignores the URL) and conflicting
  // inherited PG* are cleared — so the dump lands on the SAME target as targetLabel.
  // Throws on a URL-vs-PG* split (finding 1).
  const childEnv = childEnvForExternalTools();

  // ACL/owner stripping is PROFILE-CONDITIONAL (Lane A G1/G2). The DEFAULT profile
  // strips owners + privileges — a DIAGNOSTIC snapshot only, NOT a recoverable database
  // (Codex HIGH-2: it must never be started as an app DB — see the file header). The
  // FULL DR profile passes stripAclsAndOwners:false so the dump carries `ALTER … OWNER
  // TO clara_fn_owner` + the whole GRANT/REVOKE + ALTER DEFAULT PRIVILEGES matrix —
  // WITHOUT which a restore silently drops the two-lane security wall (and definer
  // writers would execute as the restoring role). We do NOT add --clean/--if-exists (a
  // fresh target) or --create (managed `postgres` db).
  const args = ["--format=plain"];
  if (stripAclsAndOwners) args.push("--no-owner", "--no-privileges");
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

/**
 * Globals (roles) dump — captured as an EVIDENCE / DIFF artifact, NOT a restorable
 * one (Lane A G4). A raw `pg_dumpall --globals` collides with a fresh target's
 * managed roles (postgres / authenticator / authenticated / anon / service_role /
 * supabase_* already exist), so a restore recreates the clara-custom roles via the
 * reviewed, idempotent deploy/roles-bootstrap.sql instead; this dump is only the
 * parity source the DR drill diffs that ceremony against. Best-effort: managed
 * projects may deny it — warn, don't fail.
 */
function dumpGlobals({ log = console.log } = {}) {
  const bin = process.env.PG_DUMPALL || "pg_dumpall";
  const out = join(backupDir(), `clara-globals-${tsStamp()}.sql`);
  const r = spawnSync(bin, ["--globals-only", "--no-role-passwords", "--file", out], {
    stdio: ["ignore", "inherit", "inherit"],
    env: childEnvForExternalTools(), // same canonical target as the schema dump
  });
  if (r.error || r.status !== 0) {
    log(
      `backup(full): globals dump SKIPPED (${r.error ? r.error.message : "exit " + r.status}) — roles may not be dumpable by this user on a managed project. This is an EVIDENCE/DIFF artifact only; the restorable role recreation is deploy/roles-bootstrap.sql (see docs/ops/DR.md).`,
    );
    return null;
  }
  log(`backup(full): globals (evidence/diff artifact — NOT restored; roles are recreated by deploy/roles-bootstrap.sql) -> ${out}`);
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
  // FULL-INVENTORY ASSERTION (finding 10): the production DR profile must capture
  // EVERY authoritative schema, or a restore silently loses in-flight durable-run
  // state. Refuse a partial "full" backup that omits any required schema — do not
  // quietly accept whatever subset happens to exist.
  const missing = AUTHORITATIVE_SCHEMAS.filter((s) => !present.includes(s));
  if (missing.length) {
    throw new Error(
      `full backup: required schema(s) MISSING from the target — ${missing.join(", ")} (present: ${present.join(", ") || "none"}). ` +
        `The FULL DR profile must capture every authoritative schema (${AUTHORITATIVE_SCHEMAS.join(", ")}) so a restore never drops durable-run state; ` +
        `refusing to write a partial "full" backup. If a schema legitimately does not exist yet, the full-profile DR drill is not ready (see docs/ops/DR.md).`,
    );
  }
  log(`backup(full): authoritative schemas present: ${present.join(", ")} · target ${targetLabel()}`);
  const res = backup({ schemas: present, stripAclsAndOwners: false, out: opts.out, log });
  const globals = dumpGlobals({ log });
  return { ...res, globals };
}

// Fail-closed CLI parse (Codex MEDIUM-4): a misspelled `--profile ful` must NOT
// silently fall back to the partial, owner/ACL-stripped default dump (monitoring would
// see a "successful" backup missing three schemas + the whole grant wall). Reject
// unknown switches, missing option values, and any --profile other than full/default.
const VALUE_OPTS = new Set(["--schema", "--profile", "--out"]);
function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") {
      opts.all = true;
    } else if (VALUE_OPTS.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) {
        throw new Error(`backup: option ${a} requires a value`);
      }
      i++;
      if (a === "--schema") opts.schema = v;
      else if (a === "--profile") opts.profile = v;
      else if (a === "--out") opts.out = v;
    } else {
      throw new Error(`backup: unknown argument "${a}". Valid: --schema <name> | --all | --profile full | --out <file>`);
    }
  }
  if (opts.profile !== undefined && opts.profile !== "full" && opts.profile !== "default") {
    throw new Error(
      `backup: --profile must be "full" (or "default"); got "${opts.profile}". A typo must NOT silently fall back to a partial default dump (Codex MEDIUM-4).`,
    );
  }
  return opts;
}

if (isMain(import.meta.url)) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error("backup: FAIL —", err.message);
    process.exit(1);
  }
  const run = args.profile === "full" ? backupFull(args) : Promise.resolve().then(() => backup(args));
  run.catch((err) => {
    console.error("backup: FAIL —", err.message);
    process.exit(1);
  });
}
