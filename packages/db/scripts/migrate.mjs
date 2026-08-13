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
import {
  armMigrationTimeout,
  assertNoCheckFunctionBodyOverride,
  assertNoTransactionControl,
  executeMigrationBody,
  migrationServerVersionNum,
  migrationStatementTimeout,
  pinMigrationSession,
  runRollbackOnlyProbe,
  TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM,
} from "./migration-atomicity.mjs";
import {
  CLEANUP_TIMEOUT_MS,
  cleanupNote,
  migrationFailureAfterCleanup,
  migrationFailureBeforeSession,
  recordCleanupOutcome,
  withCleanupDeadline,
} from "./migration-cleanup.mjs";
import {
  ledgerIdentityAllowed,
  readLedgerIdentity,
  readLedgerReceipts,
  readRelationHardening,
} from "./migration-evidence.mjs";

export { CLEANUP_TIMEOUT_MS, hardCloseClient, migrationFailureAfterCleanup, withCleanupDeadline } from "./migration-cleanup.mjs";

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATION_NAME = /^(\d{4})_[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/;
const MIGRATION_LIKE = /^\d+.*\.sql$/;
const LOCK_KEY_1 = 0x1a2b3c4d;
const LOCK_KEY_2 = 0x00c1a7a; // "clara"
export const MIGRATION_CONNECT_TIMEOUT_MS = 5_000;
const FREEZE_GUARDS = [
  {
    label: "evaluator",
    registry: "clara.evaluator_versions",
    members: "clara.evaluator_version_members",
    memberForeignKey: "evaluator_version_id",
    verifier: "clara.verify_evaluator_freeze()",
    protectedRows: "deployed is true",
    protectedDescription: "deployed rows",
  },
  {
    label: "metric input producer",
    registry: "clara.metric_input_producer_versions",
    members: "clara.metric_input_producer_version_members",
    memberForeignKey: "producer_version_id",
    verifier: "clara.verify_metric_input_producer_freeze()",
    protectedRows: "true",
    protectedDescription: "version rows",
  },
];

function sha256(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export function attachMigrationNoticeListener(client, log) { client.on("notice", (notice) => { const message = (notice?.message ?? "").toString(); if (message) log(`  [${(notice?.severity ?? "NOTICE").toLowerCase()}] ${message}`); }); }

/**
 * The runner's server-observed backend identity for this connection. Read from the
 * SERVER (pg_backend_pid), not inferred from the client object — a distinct client
 * handle proves nothing about which backend it landed on.
 */
async function readBackendPid(client) {
  const pid = (await client.query("select pg_catalog.pg_backend_pid()::pg_catalog.int4 as pid")).rows[0]?.pid;
  if (!Number.isInteger(pid)) {
    throw new Error(`migration runner could not read its server backend pid (saw ${JSON.stringify(pid)})`);
  }
  return pid;
}

async function readFreezeEvidence(client, guard, membersExist, protectedOnly, rearm = async () => {}) {
  const where = protectedOnly ? `where ${guard.protectedRows}` : "";
  const members = membersExist
    ? `(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
         'row',pg_catalog.to_jsonb(m),'function',(select pg_catalog.jsonb_build_object(
           'oid',p.oid::pg_catalog.text,'owner',p.proowner::pg_catalog.text,
           'acl',coalesce(p.proacl::pg_catalog.text,''::pg_catalog.text),
           'definition',pg_catalog.pg_get_functiondef(p.oid))
           from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=)
             pg_catalog.to_regprocedure(m.member_signature)))
         order by m.ordinal,pg_catalog.to_jsonb(m)::pg_catalog.text),'[]'::pg_catalog.jsonb)
       from ${guard.members} m where m.${guard.memberForeignKey} OPERATOR(pg_catalog.=) v.id)`
    : "null::pg_catalog.jsonb";
  await rearm(); const rows = await client.query(
    `select pg_catalog.jsonb_build_object('version',pg_catalog.to_jsonb(v),'members',${members})::pg_catalog.text as evidence
       from ${guard.registry} v ${where} order by pg_catalog.to_jsonb(v)::pg_catalog.text`,
  );
  return new Set(rows.rows.map((row) => row.evidence));
}

/**
 * Count member rows referencing no registry row.
 *
 * NARROW by design: this asks the ONE question the evidence readers structurally cannot.
 * They are driven FROM the registry (`from <registry> v`, members joined on `m.fk = v.id`),
 * so a member whose foreign key resolves to nothing is selected by no query and appears in
 * no evidence set — and `readRelationHardening` skips internal triggers, so suppressing the
 * FK's system triggers leaves no trace there either. `set constraints all immediate` does
 * not cover it: it re-checks DEFERRED constraints that were queued, and a row inserted with
 * triggers disabled was never queued. Proven against PostgreSQL 17.10 before this existed —
 * a body that ran `alter table ... disable trigger all`, inserted an orphan and re-enabled
 * was accepted, and the orphan survived into the committed registry.
 */
async function readOrphanedMembers(client, guard, rearm = async () => {}) {
  await rearm();
  return (
    await client.query(
      `select pg_catalog.count(*)::pg_catalog.int4 as orphans
         from ${guard.members} m
        where not exists(select 1 from ${guard.registry} v
                          where v.id OPERATOR(pg_catalog.=) m.${guard.memberForeignKey})`,
    )
  ).rows[0].orphans;
}

async function readFreezeStates(client, rearm = async () => {}) {
  const states = new Map();
  for (const guard of FREEZE_GUARDS) {
    await rearm(); const catalog = (
      await client.query(
        `select
           pg_catalog.to_regclass($1) is not null as registry_exists,
           pg_catalog.to_regclass($1)::pg_catalog.oid as registry_oid,
           pg_catalog.to_regclass($2) is not null as members_exists,
           pg_catalog.to_regclass($2)::pg_catalog.oid as members_oid,
           pg_catalog.to_regprocedure($3) is not null as verifier_exists,
           (select p.provolatile from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=)
             pg_catalog.to_regprocedure($3)) as verifier_volatility,
           (select pg_catalog.jsonb_build_object(
             'oid', p.oid::pg_catalog.text, 'owner', p.proowner::pg_catalog.text,
             'acl', coalesce(p.proacl::pg_catalog.text, ''::pg_catalog.text),
             'definition', pg_catalog.pg_get_functiondef(p.oid)
           )::pg_catalog.text from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=)
             pg_catalog.to_regprocedure($3)) as verifier_identity`,
        [guard.registry, guard.members, guard.verifier],
      )
    ).rows[0];
    let protectedEvidence = new Set();
    let allEvidence = new Set();
    let registryHardening = null;
    let membersHardening = null;
    let orphanedMembers = 0;
    if (catalog.registry_exists) {
      protectedEvidence = await readFreezeEvidence(client, guard, catalog.members_exists, true, rearm);
      allEvidence = await readFreezeEvidence(client, guard, catalog.members_exists, false, rearm);
      registryHardening = await readRelationHardening(client, guard.registry, rearm);
      if (catalog.members_exists) {
        membersHardening = await readRelationHardening(client, guard.members, rearm);
        orphanedMembers = await readOrphanedMembers(client, guard, rearm);
      }
    }
    states.set(guard.label, {
      ...catalog,
      hasProtectedRows: protectedEvidence.size > 0,
      protectedEvidence,
      allEvidence,
      registryHardening,
      membersHardening,
      orphanedMembers,
    });
  }
  return states;
}

const freezeStatesIdentity = (states) => JSON.stringify([...states.entries()].map(([label, state]) => [label,
  { ...state, protectedEvidence: [...state.protectedEvidence].sort(), allEvidence: [...state.allEvidence].sort() }]));

async function verifyDeterministicFreezes(client, before, rearm = async () => {}) {
  const after = await readFreezeStates(client, rearm);
  for (const guard of FREEZE_GUARDS) {
    const prior = before.get(guard.label);
    const current = after.get(guard.label);
    if (prior.registry_exists && (!current.registry_exists || current.registry_oid !== prior.registry_oid)) {
      throw new Error(`${guard.label} freeze registry ${guard.registry} disappeared or was replaced during the migration — refusing to migrate`);
    }
    if (prior.members_exists && (!current.members_exists || current.members_oid !== prior.members_oid)) {
      throw new Error(`${guard.label} freeze members ${guard.members} disappeared or was replaced during the migration — refusing to migrate`);
    }
    // Structural integrity before the verifier runs: a member that outlives the version it
    // belongs to is unreachable from every evidence read, so the freeze would keep
    // reporting clean over a registry that no longer holds together. Absolute, not a
    // delta — the foreign key makes an orphan impossible without a deliberate
    // trigger-suppression posture, so a pre-existing one is corruption too, and the
    // counts say which migration to look at rather than softening the refusal.
    if (current.members_exists && current.orphanedMembers > 0) {
      const introduced = current.orphanedMembers - (prior.members_exists ? prior.orphanedMembers : 0);
      throw new Error(`${guard.label} freeze members ${guard.members} hold ${current.orphanedMembers} row(s) referencing no ${guard.registry} row (${introduced > 0 ? `${introduced} introduced by this migration` : "already present before this migration"}) — refusing to migrate`);
    }
    if (prior.verifier_exists && prior.verifier_identity !== current.verifier_identity) {
      throw new Error(`${guard.label} freeze verifier ${guard.verifier} changed during the migration — refusing to migrate`);
    }
    if (prior.hasProtectedRows && !prior.verifier_exists) {
      throw new Error(`${guard.label} freeze verifier was already absent while ${guard.registry} contained ${guard.protectedDescription} — refusing to migrate`);
    }
    if (prior.hasProtectedRows) {
      if (prior.registryHardening !== current.registryHardening || prior.membersHardening !== current.membersHardening) {
        throw new Error(`${guard.label} freeze registry hardening changed during the migration — refusing to migrate`);
      }
      for (const evidence of prior.protectedEvidence) {
        if (!current.allEvidence.has(evidence)) {
          throw new Error(`${guard.label} protected freeze evidence changed during the migration — refusing to migrate`);
        }
      }
    }
    if (current.verifier_exists) {
      if (current.verifier_volatility === "v") {
        throw new Error(`${guard.label} freeze verifier ${guard.verifier} is VOLATILE — verifier callbacks must be read-only`);
      }
      await runRollbackOnlyProbe(client, () => client.query(`select ${guard.verifier}`), rearm);
      continue;
    }
    if (!current.registry_exists) continue;
    if (prior.hasProtectedRows || current.hasProtectedRows) {
      throw new Error(`${guard.label} freeze verifier is absent while ${guard.registry} contains ${guard.protectedDescription} — refusing to migrate`);
    }
  }
}

function loadMigrationFiles(dir) {
  const all = readdirSync(dir);
  const migrations = [];
  const seen = new Map();
  for (const file of all.sort()) {
    if (!MIGRATION_LIKE.test(file)) continue;
    const match = MIGRATION_NAME.exec(file);
    if (!match) {
      throw new Error(`migration filename "${file}" is malformed — migrations must be fixed-width NNNN_name.sql (four leading digits, e.g. 0002_add_x.sql). Variable-width prefixes sort incorrectly (10_ before 2_).`);
    }
    const num = match[1];
    if (seen.has(num)) {
      throw new Error(`duplicate migration version ${num}: "${seen.get(num)}" and "${file}". Each version number must be unique.`);
    }
    seen.set(num, file);
    migrations.push({ file, version: file.replace(/\.sql$/, ""), num: Number(num) });
  }
  migrations.sort((a, b) => a.num - b.num);
  return migrations;
}

export async function migrate({ log = console.log, dir, clientFactory = makeClient, cleanupTimeoutMs = CLEANUP_TIMEOUT_MS } = {}) {
  const migrationsDir = dir || process.env.CLARA_MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR;
  if (!existsSync(migrationsDir)) throw new Error(`migrations directory not found: ${migrationsDir}`);
  const migrations = loadMigrationFiles(migrationsDir);
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  assertNoTargetSplit();

  // Keep the session lock on a connection migration SQL never receives. Advisory
  // unlocks are session-scoped and survive rollback, so exposing this client would
  // let a body defeat F10 with pg_advisory_unlock[_all]().
  //
  // Two different bounds, only one of which applies here. connectionTimeoutMillis is a
  // node-postgres CONNECT-only knob: it bounds ESTABLISHING the socket, and an
  // unreachable server must not hang the runner before it has even taken the lock. The
  // pg_advisory_lock QUERY that follows is left deliberately UNBOUNDED — waiting is how
  // F10 serialises a second runner behind the one in flight — so the runner arms no
  // statement_timeout, lock_timeout or query deadline on this client.
  const lockClient = clientFactory({ connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS });
  const controlClient = clientFactory({ connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS });
  attachMigrationNoticeListener(controlClient, log);
  let lockConnected = false;
  let clientConnected = false;
  let locked = false;
  try {
    await lockClient.connect();
    lockConnected = true;
    await lockClient.query("select pg_catalog.pg_advisory_lock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2]);
    locked = true;
    await controlClient.connect();
    clientConnected = true;
    await pinMigrationSession(controlClient);
    // Cached by the pin above — no extra round trip. Say so out loud when the server
    // predates the GUC, so a reader never has to infer the pin's absence from silence.
    const serverVersionNum = await migrationServerVersionNum(controlClient);
    if (serverVersionNum < TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM) {
      log(`  note: transaction_timeout pin skipped — server_version_num ${serverVersionNum} predates PostgreSQL 17, which introduced the parameter`);
    }
    await controlClient.query("create schema if not exists clara;");
    await controlClient.query(`create table if not exists clara.schema_migrations (
      version pg_catalog.text primary key, checksum pg_catalog.text not null,
      applied_at pg_catalog.timestamptz not null default pg_catalog.now());`);

    const appliedRows = (await controlClient.query("select version,checksum from clara.schema_migrations")).rows;
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]));
    const drift = [];
    for (const [version, checksum] of applied) {
      const onDisk = byVersion.get(version);
      if (!onDisk) {
        drift.push(`applied migration ${version} is MISSING from disk (deleted or renamed). Applied migrations are immutable history — restore the file; never delete or rename it.`);
        continue;
      }
      if (sha256(readFileSync(join(migrationsDir, onDisk.file), "utf8")) !== checksum) {
        drift.push(`applied migration ${version} was MODIFIED after being applied (checksum drift). Migrations are immutable — add a new migration file instead.`);
      }
    }
    if (drift.length) throw new Error("migration-history integrity check failed:\n  - " + drift.join("\n  - "));

    const maxAppliedNum = applied.size ? Math.max(...[...applied.keys()].map((version) => byVersion.get(version).num)) : -1;
    for (const migration of migrations) {
      if (!applied.has(migration.version) && migration.num <= maxAppliedNum) {
        throw new Error(`migration ${migration.version} (number ${migration.num}) is at or below the highest applied number (${maxAppliedNum}) but was never applied — a late-inserted lower number would run out of order. Renumber it above the frontier; migration history is append-only.`);
      }
    }

    let count = 0;
    // Server-observed backend pid -> the migration that ran on it. A repeat inside one
    // invocation means a connection was REUSED, which would carry session state from one
    // migration into the next; the runner refuses rather than migrating on that premise.
    const backendPids = new Map();
    for (const { file, version } of migrations) {
      if (applied.has(version)) continue;
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      const checksum = sha256(sql);
      assertNoTransactionControl(sql, version);
      assertNoCheckFunctionBodyOverride(sql, version);
      const bodyTimeout = migrationStatementTimeout(sql);
      const client = clientFactory({ connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS }); attachMigrationNoticeListener(client, log);
      let failure;
      let backendPid;
      let connected = false;
      try {
        // connect() belongs INSIDE: it is the one loop exit that would otherwise skip
        // both the version-wrapped error and the bounded end() in the finally.
        await client.connect();
        connected = true;
        await pinMigrationSession(client);
        backendPid = await readBackendPid(client);
        const priorVersion = backendPids.get(backendPid);
        if (priorVersion !== undefined) {
          throw new Error(`migration ${version} landed on server backend pid ${backendPid}, the backend ${priorVersion} already ran on (pid ${backendPid}) — every pending migration must get its own fresh connection, so a reused backend is refused`);
        }
        backendPids.set(backendPid, version);
        await client.query("begin");
        // The PRE-body evidence snapshot gets the same bound as the identical post-body
        // reads: a hung catalog read fails loudly instead of stalling a ceremony on an
        // unbounded session. Disarmed again below so executeMigrationBody still opens on
        // the untouched baseline it asserts.
        const preRearm = () => armMigrationTimeout(client, bodyTimeout);
        const freezeBefore = await readFreezeStates(client, preRearm);
        const ledgerBefore = await readLedgerIdentity(client, preRearm);
        const receiptsBefore = await readLedgerReceipts(client, preRearm);
        await armMigrationTimeout(client, null);
        const { xid: transactionXid, rearm } = await executeMigrationBody(client, sql, bodyTimeout); await rearm();
        const receipt = (
          await client.query(
            `insert into clara.schema_migrations(version,checksum) values($1,$2)
             returning version,checksum,pg_catalog.pg_current_xact_id()::pg_catalog.text as xid`,
            [version, checksum],
          )
        ).rows[0];
        await rearm(); await client.query("set constraints all immediate");
        const ledgerAfter = await readLedgerIdentity(client, rearm);
        await rearm(); const exactReceipt = (
          await client.query(
            `select version,checksum from clara.schema_migrations
              where version OPERATOR(pg_catalog.=) $1 and checksum OPERATOR(pg_catalog.=) $2`,
            [version, checksum],
          )
        ).rows;
        await rearm(); const receiptsAfter = (
          await client.query(
            `select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.version)::pg_catalog.text as receipts
               from clara.schema_migrations m where m.version OPERATOR(pg_catalog.<>) $1`,
            [version],
          )
        ).rows[0].receipts;
        if (!ledgerIdentityAllowed(version, ledgerBefore, ledgerAfter)) {
          throw new Error("migration ledger identity or hardening changed during the migration");
        }
        if (receiptsAfter !== receiptsBefore) {
          throw new Error("migration changed a prior schema_migrations receipt");
        }
        if (receipt?.version !== version || receipt?.checksum !== checksum || receipt?.xid !== transactionXid ||
            exactReceipt.length !== 1 || exactReceipt[0].version !== version || exactReceipt[0].checksum !== checksum) {
          throw new Error("migration ledger did not retain an exact independent receipt in the runner-owned transaction");
        }
        await verifyDeterministicFreezes(client, freezeBefore, rearm);
        const freezeAfterVerification = await readFreezeStates(client, rearm);
        await rearm(); await client.query("set constraints all immediate");
        const freezeFinal = await readFreezeStates(client, rearm);
        const ledgerFinal = await readLedgerIdentity(client, rearm);
        await rearm(); const exactReceiptFinal = (
          await client.query(
            `select version,checksum from clara.schema_migrations
              where version OPERATOR(pg_catalog.=) $1 and checksum OPERATOR(pg_catalog.=) $2`,
            [version, checksum],
          )
        ).rows;
        await rearm(); const receiptsFinal = (
          await client.query(
            `select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.version)::pg_catalog.text as receipts
               from clara.schema_migrations m where m.version OPERATOR(pg_catalog.<>) $1`,
            [version],
          )
        ).rows[0].receipts;
        if (freezeStatesIdentity(freezeFinal) !== freezeStatesIdentity(freezeAfterVerification)) {
          throw new Error("freeze evidence changed after verifier execution");
        }
        if (!ledgerIdentityAllowed(version, ledgerAfter, ledgerFinal) || receiptsFinal !== receiptsBefore ||
            exactReceiptFinal.length !== 1 || exactReceiptFinal[0].version !== version || exactReceiptFinal[0].checksum !== checksum) {
          throw new Error("migration ledger changed during freeze verifier execution");
        }
        await rearm(); const finalXid = (
          await client.query("select pg_catalog.pg_current_xact_id()::pg_catalog.text as xid")
        ).rows[0].xid;
        if (finalXid !== transactionXid) throw new Error("migration replaced the runner-owned transaction after body verification");
        await rearm(); await client.query("commit");
      } catch (error) {
        // No session means nothing to roll back or repin — and measured on pg 8.20.0,
        // query() on a client that never connected NEVER SETTLES, so running the session
        // cleanup here would buy a deadline timeout and a hard close that describe the
        // wrong problem. The bounded end() in the finally still runs either way.
        failure = connected
          ? await migrationFailureAfterCleanup(client, version, error, undefined, cleanupTimeoutMs)
          : migrationFailureBeforeSession(version, error);
        throw failure;
      } finally {
        // Bounded like the rest: pg's own end() destroys the socket when a query is
        // still active, but a graceful end with no active query waits on a FIN that a
        // black-holed peer never sends. The outcome joins the failure's diagnostics
        // (never replacing it) or is logged when the migration itself succeeded.
        const outcome = await withCleanupDeadline(client, `execution client end (${version})`, () => client.end(), cleanupTimeoutMs);
        if (failure) recordCleanupOutcome(failure, outcome);
        else noteCleanup(outcome);
      }
      applied.set(version, checksum);
      log(`  applied ${version} · backend pid ${backendPid}`);
      count++;
    }
    log(`migrate: ${count} new migration(s) applied · ${migrations.length} total · target ${targetLabel()}`);
    return { applied: count, total: migrations.length };
  } finally {
    // Nothing in here may throw: whatever error is propagating out of the body is the
    // one the operator needs, and a cleanup that replaces it costs more than it saves.
    if (locked) {
      noteCleanup(await withCleanupDeadline(lockClient, "advisory unlock", () =>
        lockClient.query("select pg_catalog.pg_advisory_unlock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2]), cleanupTimeoutMs));
    }
    if (clientConnected) noteCleanup(await withCleanupDeadline(controlClient, "control client end", () => controlClient.end(), cleanupTimeoutMs));
    // Ends last, and the lock dies with the session either way — including after a hard close.
    if (lockConnected) noteCleanup(await withCleanupDeadline(lockClient, "lock client end", () => lockClient.end(), cleanupTimeoutMs));
  }

  function noteCleanup(outcome) {
    const note = cleanupNote(outcome);
    if (!note) return;
    try { log(`  cleanup: ${note}`); } catch { /* a logging failure must never replace the error in flight */ }
  }
}

if (isMain(import.meta.url)) {
  migrate().catch((error) => {
    console.error("migrate: FAIL —", error.message);
    process.exit(1);
  });
}
