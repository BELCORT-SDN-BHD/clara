// restore-full — the FULL-profile DR restore orchestrator (Lane A G10 / §2.4).
//
// A full restore is a 3-step ORDERED sequence, not a single `psql -f`:
//   (a) recreate the clara-custom roles  (deploy/roles-bootstrap.sql) — pg_dump never
//       captures roles, and the full dump emits `ALTER … OWNER TO clara_fn_owner` +
//       `GRANT clara_* …`, which fail unless the roles (and the deploy role's
//       clara_fn_owner membership WITH SET) already exist. Roles FIRST.
//   (b) restore the full dump           (restore.mjs, single-transaction) — schema +
//       data + owners + the whole GRANT/REVOKE/RLS matrix, atomic.
//   (c) print the MANUAL post-restore checklist (ceremonies + Storage + verify) — this
//       script does NOT auto-run them: the write-login ceremony is interactive
//       (\prompt), and Storage bytes / bucket live outside Postgres.
//
// GUARDED once (finding 9): the whole op is destructive (it overwrites the target and
// creates cluster roles), so it refuses unless CLARA_ALLOW_DESTRUCTIVE=1 AND the
// target is disposable or explicitly named (see lib/guard.mjs). restore.mjs re-asserts
// the same guard for step (b) — the authorization is identical, so the re-check is a
// harmless no-op (the dr-selftest precedent).
//
// Connection via libpq env only (see backup.mjs). Point PSQL/PG* at a v17 client and
// the SAME target the guard authorized. It does NOT touch Supabase Storage.
//
// Usage:
//   node scripts/restore-full.mjs --file <full-dump.sql> [--no-single-transaction]

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { targetLabel, isMain, childEnvForExternalTools } from "../lib/pg.mjs";
import { assertDestructiveAllowed } from "../lib/guard.mjs";
import { restore } from "./restore.mjs";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROLES_BOOTSTRAP = join(PKG_ROOT, "deploy", "roles-bootstrap.sql");

/** Run a deploy/*.sql ceremony file with psql against the canonical target. */
function psqlFile(file, { log = console.log } = {}) {
  if (!existsSync(file)) throw new Error(`ceremony file not found: ${file}`);
  const bin = process.env.PSQL || "psql";
  const childEnv = childEnvForExternalTools();
  const args = ["-X", "-v", "ON_ERROR_STOP=1", "-f", file, "--dbname", childEnv.PGDATABASE || "postgres"];
  log(`restore-full: psql -f ${file} · target ${targetLabel()}`);
  const r = spawnSync(bin, args, { stdio: ["ignore", "inherit", "inherit"], env: childEnv });
  if (r.error) throw new Error(`psql failed to start (${r.error.message})`);
  if (r.status !== 0) throw new Error(`psql exited ${r.status} applying ${file}`);
}

/**
 * @param {{ file: string, singleTransaction?: boolean, log?: (s:string)=>void }} opts
 */
export function restoreFull(opts) {
  if (!opts || !opts.file) throw new Error("restore-full requires { file } (the full-profile dump)");
  const { file, singleTransaction = true, log = console.log } = opts;
  if (!existsSync(file)) throw new Error(`full dump not found: ${file}`);

  // ONE destructive-guard assertion for the whole sequence (restore.mjs re-asserts
  // the identical authorization for step (b) — a harmless no-op).
  assertDestructiveAllowed({ action: `restore-full (roles-bootstrap + overwrite ${targetLabel()})` });

  log(`restore-full: target ${targetLabel()}`);
  log("restore-full: step (a) — recreate clara-custom roles (deploy/roles-bootstrap.sql)");
  psqlFile(ROLES_BOOTSTRAP, { log });

  log("restore-full: step (b) — restore the full-profile dump (single-transaction)");
  restore({ file, singleTransaction, log });

  log("restore-full: step (c) — MANUAL post-restore ceremonies (NOT auto-run):");
  printChecklist(log);
  return { ok: true };
}

/** The manual post-restore checklist — ceremonies + Storage + verification. */
function printChecklist(log = console.log) {
  const lines = [
    "",
    "  ===== POST-RESTORE CHECKLIST (run manually, in order) =====",
    "  Schema + data + owners + the GRANT/REVOKE/RLS matrix are restored. Still required:",
    "",
    "  1. STORAGE (out-of-band — bytes live in Supabase Storage, not Postgres):",
    "       - recreate the private `firm-docs` bucket",
    "       - psql -f deploy/storage-provision.sql   (clara_storage_docs policies)",
    "       - re-upload the document bytes from the off-site byte mirror",
    "       - verify every clara.documents.source_doc_sha256 matches a re-uploaded object",
    "  2. LOGIN CEREMONIES (interactive — set the pool passwords, roles are NOLOGIN):",
    "       - psql -f deploy/write-login-ceremony.sql   (clara_wake_write_login; \\prompt)",
    "       - psql -f deploy/read-logins-ceremony.sql    (clara_runtime_login + clara_agent_read_login; \\prompt)",
    "       - update CLARA_WRITE_DATABASE_URL / the runtime + read DSNs out of band",
    "  3. ACL BASELINE (a restore does NOT carry the public-schema ACL — re-apply is",
    "     MANDATORY): psql -f deploy/acl-baseline.sql   (as the db owner)",
    "  4. ENGINE SANITY (do NOT re-bootstrap blindly): confirm",
    "     workflow_drizzle.workflow_migrations == source BEFORE any worker could start,",
    "     else the engine silent-no-ops or collides on CREATE SCHEMA. Then, BY MODE:",
    "       * REAL RECOVERY (this target becomes production): start the runtime",
    "         (CLARA_START_WORLD=1) — it SHOULD resume the parked canary; that IS the recovery.",
    "       * DRILL/REHEARSAL (production is alive; this is a scratch project): NEVER start a",
    "         runtime/world here. The restored canary is a COPY of the live interruption and",
    "         must stay parked on BOTH sides — resuming it would duplicate a live run and",
    "         break canary parity. Drill verification is SQL-only (step 5).",
    "       If you are unsure which mode you are in, you are in a DRILL. Do not start the world.",
    "  5. VERIFICATION BATTERY: node scripts/dr-verify.mjs (source↔target) — all PASS.",
    "",
    "  (See docs/ops/DR-full-drill.md §3 — the full-profile restore runbook.)",
    "",
  ];
  for (const l of lines) log(l);
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
    restoreFull(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error("restore-full: FAIL —", err.message);
    process.exit(1);
  }
}
