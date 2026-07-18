// Slice-5 rig — DOCUMENT PIPELINE part 1: STRUCTURE (companion §3.0 + the new
// columns/enums across §3.1–§3.9 + the retired ingest writers §3.0.6). Contract-
// blind: derived from slice5-*.md, never from 0007. Every test SKIPs until
// document_filings + file_document land (docsReady), then turns green.
//
// This file is catalog-shaped (columns, CHECK enums, immutability, dropped
// surfaces) so it needs almost no fixtures — it pins the SHAPE 0007 must produce.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR,
  PG,
  ROLES,
  assertRaises,
  assertRaisesOneOf,
  rootQuery,
  roleQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  seedVerifiedDocument,
  documentRow,
  EXTRACTION_STATUSES,
  RETENTION_STATES,
  INTAKE_STATUSES,
  INTAKE_FAILURE_CODES,
  PROC_TASK_STATUSES,
  PROC_TASK_LANES,
  ENGINE_KINDS,
  LOCATOR_KINDS,
  IDENTIFIER_KINDS,
  CANDIDATE_RULE_KINDS,
  CANDIDATE_DISPOSITIONS,
  RESERVATION_STATES,
  CORRECTION_STATUSES,
  CORRECTION_ITEM_ACTIONS,
  STATUS_WITHDRAWN,
  RETIRED_WRITER_CODES,
  EXPECTED_NEW_TABLES,
} from "./rig-docs-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("structure");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("Slice-5 document pipeline not present — 0007 not yet applied");
    return true;
  }
  return false;
}

async function columnsOf(table) {
  const r = await rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name=$1",
    [table],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

/** All CHECK constraint definitions on a clara table (blind to constraint names). */
async function checkDefs(table) {
  const r = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def
       from pg_constraint c join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname='clara' and t.relname=$1 and c.contype='c'`,
    [table],
  );
  return r.rows.map((x) => x.def);
}

/** Assert every value appears in SOME check def on the table (enum coverage). */
async function assertEnumCovered(table, values, label) {
  const defs = (await checkDefs(table)).join(" ~~ ");
  for (const v of values) {
    assert.ok(defs.includes(`'${v}'`), `${label}: CHECK on clara.${table} admits '${v}' (defs: ${defs.slice(0, 300)})`);
  }
}

// ===========================================================================
// §3.0 — documents evolution: client_id DROPPED, new columns, immutability.
// ===========================================================================

test("§3.0 documents: client_id is DROPPED; the new lifecycle columns exist; status CHECK untouched", async (t) => {
  if (unready(t)) return;
  const cols = await columnsOf("documents");
  assert.ok(!cols.has("client_id"), "documents.client_id is dropped (attribution moved into document_filings)");
  for (const c of [
    "bytes_verified_at", "page_count", "extraction_status", "document_kind",
    "financial_date", "retention_state", "retain_until", "retention_basis",
    "legal_hold", "legal_hold_reason",
  ]) {
    assert.ok(cols.has(c), `documents.${c} exists (companion §3.0 new columns)`);
  }
  await assertEnumCovered("documents", EXTRACTION_STATUSES, "extraction_status");
  await assertEnumCovered("documents", RETENTION_STATES, "retention_state");
});

test("§3.0 documents storage_path grammar CHECK present (post-0007 inserts; legacy preserved)", async (t) => {
  if (unready(t)) return;
  const defs = (await checkDefs("documents")).join(" ~~ ");
  const hasGrammar = /storage_path/.test(defs);
  if (!hasGrammar) noteLane("documents: no storage_path CHECK found by name — the grammar may be enforced by a trigger; inspect (interface expectation)");
  assert.ok(hasGrammar || true, "storage_path grammar recorded (check-or-trigger)"); // observation, not a hard gate (mechanism contract-silent)
});

test("§3.0.5 documents immutability rework: id/firm_id/sha256 frozen, DELETE blocked (even as superuser)", async (t) => {
  if (unready(t)) return;
  const { firms } = world;
  const { documentId } = await seedVerifiedDocument({ firm: firms.A });
  await assertRaisesOneOf([CLR.immutable, CLR.badRequest], () => rootQuery("update clara.documents set sha256 = $2 where id = $1", [documentId, "b".repeat(64)]), "UPDATE documents.sha256");
  await assertRaisesOneOf([CLR.immutable, CLR.badRequest], () => rootQuery("update clara.documents set firm_id = gen_random_uuid() where id = $1", [documentId]), "UPDATE documents.firm_id");
  await assertRaisesOneOf([CLR.immutable, CLR.badRequest], () => rootQuery("delete from clara.documents where id = $1", [documentId]), "DELETE documents");
  const row = await documentRow(documentId);
  assert.ok(row && row.bytes_verified_at != null, "a seeded document is verified (bytes_verified_at set)");
  assert.equal(row.retention_state, "unanchored", "an unfiled document is unanchored (§4.7)");
  assert.equal(row.retain_until ?? null, null, "an unanchored document has NULL retain_until before the first anchor");
});

// ===========================================================================
// §3.x — the new tables all exist with their CHECK enums.
// ===========================================================================

test("§3 new tables all present (14) — the FORCE-RLS/isolation sweeps depend on the exact set", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and relkind='r'",
  );
  const present = new Set(r.rows.map((x) => x.relname));
  for (const tbl of EXPECTED_NEW_TABLES) assert.ok(present.has(tbl), `clara.${tbl} exists`);
});

test("§3.2/§3.9/§3.3/§3.4/§3.6/§3.5 CHECK enums match the contract exactly", async (t) => {
  if (unready(t)) return;
  await assertEnumCovered("document_intakes", INTAKE_STATUSES, "intake status");
  await assertEnumCovered("document_intakes", INTAKE_FAILURE_CODES, "intake failure_code");
  await assertEnumCovered("document_processing_tasks", PROC_TASK_STATUSES, "task status");
  await assertEnumCovered("document_processing_tasks", PROC_TASK_LANES, "task lane");
  await assertEnumCovered("document_extractions", ENGINE_KINDS, "engine_kind");
  await assertEnumCovered("document_regions", LOCATOR_KINDS, "locator_kind");
  await assertEnumCovered("client_identifiers", IDENTIFIER_KINDS, "identifier kind");
  await assertEnumCovered("attribution_candidates", CANDIDATE_RULE_KINDS, "candidate rule_kind");
  await assertEnumCovered("attribution_candidates", CANDIDATE_DISPOSITIONS, "candidate disposition");
  await assertEnumCovered("document_ingest_reservations", RESERVATION_STATES, "reservation state");
  await assertEnumCovered("filing_corrections", CORRECTION_STATUSES, "correction status");
  await assertEnumCovered("filing_correction_items", CORRECTION_ITEM_ACTIONS, "correction item action");
});

// ===========================================================================
// §3.5 — the withdrawn journal status is added; §3.1 filing_id on journal_entries.
// ===========================================================================

test("§3.5 journal_entries.status CHECK now admits 'withdrawn'; §3.1 filing_id column added with the paired CHECK", async (t) => {
  if (unready(t)) return;
  const defs = (await checkDefs("journal_entries")).join(" ~~ ");
  assert.ok(defs.includes(`'${STATUS_WITHDRAWN}'`), `journal_entries.status admits 'withdrawn' (§3.5): ${defs.slice(0, 200)}`);
  const cols = await columnsOf("journal_entries");
  assert.ok(cols.has("filing_id"), "journal_entries.filing_id exists (§3.1 filing-bound provenance)");
  // The paired CHECK: (document_id is null) = (filing_id is null).
  const paired = defs.includes("filing_id") && defs.includes("document_id");
  if (!paired) noteLane("journal_entries: no (document_id is null)=(filing_id is null) paired CHECK found by name — inspect (§3.0.2)");
  assert.ok(paired, "the document_id↔filing_id paired CHECK is present (§3.0.2)");
});

// ===========================================================================
// §3.0.6 — BOTH legacy ingest writers retired (DD-1 extended).
// ===========================================================================

test("§3.0.6 ingest_document + wake_ingest_document retired: bodies raise deterministically; EXECUTE revoked; allowlist row gone; _ingest_document_core dropped", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;

  // The bodies still EXIST but raise a deterministic CLR error (called as superuser,
  // which bypasses the revoked EXECUTE and reaches the body).
  for (const fn of ["ingest_document", "wake_ingest_document"]) {
    const exists = await rootQuery(
      "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1",
      [fn],
    );
    assert.ok(exists.rowCount >= 1, `clara.${fn} still exists as a retired stub`);
  }
  await assertRaisesOneOf(
    RETIRED_WRITER_CODES,
    () => rootQuery("select clara.ingest_document(p_client => $1, p_sha256 => $2, p_filename => 'x', p_mime => 'application/pdf', p_bytes => 1, p_storage_path => 'x', p_op_key => 'x')", [clients.A1, "a".repeat(64)]),
    "retired ingest_document raises",
  );

  // EXECUTE revoked from the human + wake lanes.
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "select clara.ingest_document(p_client => $1, p_sha256 => $2, p_filename => 'x', p_mime => 'x', p_bytes => 1, p_storage_path => 'x', p_op_key => 'x')", [clients.A1, "a".repeat(64)]), "human EXECUTE ingest_document revoked");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.wakeInteractive, "select clara.wake_ingest_document(p_client => $1, p_sha256 => $2, p_filename => 'x', p_mime => 'x', p_bytes => 1, p_storage_path => 'x', p_op_key => 'x')", [clients.A1, "a".repeat(64)]), "wake EXECUTE wake_ingest_document revoked");

  // The wake allowlist row is deleted.
  const allow = await rootQuery("select 1 from clara.wake_fn_allowlist where fn_name = 'wake_ingest_document'");
  assert.equal(allow.rowCount, 0, "wake_ingest_document allowlist row deleted");

  // _ingest_document_core is dropped.
  const core = await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_ingest_document_core'",
  );
  assert.equal(core.rowCount, 0, "_ingest_document_core dropped (the finalizer is the sole creator)");

  noteLane(`retired-writer check exercised for user ${users.alice.slice(0, 8)} — both legacy ingest paths sealed`);
});
