// F-A1 (Wave-F Track A) PR-3 -- THE CUTOVER battery, for
// migrations/0097_f_a1_cutover.sql (number claimed at merge). NOT contract-blind: this
// lane authored the migration, so every cell targets the ACTUAL installed behaviour. Design:
// docs/plan/active/f-a1-witness-pair-design.md §3.5/§3.8/§6.4, D7, D9.
//
// SCOPE: the router recut (§1 -- _enqueue_invoice_facts_core's invoice-kind arm mints
// llm_witness, no dual-run; the already_completed map resolves via llm_text_facts);
// clara.fail_witness_facts (§2); request_reextraction's door widening (§3, D7). The wb-0020
// restore-pair battery (wall 12) is a SEPARATE file (tests/wave-b/wb-0020-legacy.test.mjs),
// not duplicated here.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ROLES, rootQuery, roleQuery, endPool, assertRaises, humanQuery, namedCall, opk } from "./rig-helpers.mjs";
import { printLaneNotes } from "./rig-runtime-helpers.mjs";
import { ensureReady } from "./rig-docs-fixtures.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf, filedDocument } from "./s6-helpers.mjs";
import { seedVerifiedDocument } from "./rig-docs-fixtures.mjs";
import { claimTask } from "./s6-fixtures.mjs";
import {
  grantPurpose, activatePurpose, consentEvidenceDoc,
} from "./wave-b/wb-0020-helpers.mjs";
import { landWitnessPair } from "./f-a1-fixtures.mjs";

const WITNESS_PURPOSE = "witness_extraction";
const WITNESS_ENGINE_ID = "llm-openai:gpt-5.6-terra:v1";
let ready = false;
let world = null;

/** THE CAPABILITY, read from the catalog -- the instrument production itself uses. Two
 *  independently-checked facts, not one: clara.fail_witness_facts existing (a brand-new
 *  verb, unambiguous marker) AND the router's invoice-kind arm actually minting llm_witness
 *  (a half-applied cutover -- the verb landed but the router still mints invoice_facts --
 *  would be DRIFT, not dormancy, and must fail loudly rather than silently skip). */
async function cutoverReady() {
  const r = await rootQuery(`
    select to_regprocedure('clara.fail_witness_facts(uuid,text)') is not null as fail_verb,
           position('v_lane:=''llm_witness''; v_engine:=''llm-openai:gpt-5.6-terra:v1''' in
             (select p.prosrc from pg_proc p
               where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure)) > 0 as router_cut,
           position('e.engine_kind in (''invoice_facts'', ''llm_text_facts'')' in
             (select p.prosrc from pg_proc p
               where p.oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure)) > 0 as reext_cut`);
  const s = r.rows[0];
  if (!s.fail_verb && !s.router_cut && !s.reext_cut) return false;
  if (!s.fail_verb || !s.router_cut || !s.reext_cut) {
    throw new Error(`F-A1 PR-3 DRIFT: a half-applied cutover -- fail_witness_facts=${s.fail_verb} router_cut=${s.router_cut} reext_cut=${s.reext_cut} -- apply 0097_f_a1_cutover.sql as a whole`);
  }
  return true;
}

before(async () => {
  await ensureReady();
  ready = await cutoverReady();
  if (!ready) return;
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("f-a1-cutover");
  await endPool();
});

function mustBeReady() {
  assert.ok(ready, "0097_f_a1_cutover.sql is not applied on this database -- this battery must FAIL, not skip, against a pre-PR-3 chain");
}

async function taskRow(id) {
  const r = await rootQuery("select to_jsonb(t) as row from clara.document_processing_tasks t where t.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}

async function tasksOf(document) {
  const r = await rootQuery(
    "select id, lane, status, error_code, engine_id, version_n from clara.document_processing_tasks where document_id=$1 order by id",
    [document]);
  return r.rows;
}

async function eventCount(firm, type, document = null) {
  const r = document
    ? await rootQuery(
      "select count(*)::int n from clara.domain_events where firm_id=$1 and event_type=$2 and document_id=$3",
      [firm, type, document])
    : await rootQuery(
      "select count(*)::int n from clara.domain_events where firm_id=$1 and event_type=$2", [firm, type]);
  return r.rows[0].n;
}

async function reservationCount(taskId) {
  const r = await rootQuery(
    "select count(*)::int n from clara.processing_call_reservations where task_id=$1", [taskId]);
  return r.rows[0].n;
}

/** A raw llm_witness task in the CLAIMED (running) shape -- workflow_run_id + started_at
 *  set, so a running->failed transition through fail_witness_facts is legal against the
 *  0090 binding CHECK's first failed-arm branch (no error_code restriction there). */
async function insertRunningWitnessTask(firm, document, { versionN = 1 } = {}) {
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
       status,workflow_run_id,started_at)
     values($1,$2,$3,$4,'llm_witness','running',$5,now()) returning id`,
    [firm, document, WITNESS_ENGINE_ID, versionN, `rig-witness-${randomUUID().slice(0, 8)}`]);
  return r.rows[0].id;
}

/** Ensure a firm_document_limits row exists, then set the witness window with a PLAIN
 *  UPDATE (the trigger is BEFORE INSERT only, so it never intercepts this) -- the exact
 *  f-a1-walls.test.mjs idiom, reused here for the wedge-regression cell. */
async function setWitnessConcurrency(firm, n) {
  await rootQuery("insert into clara.firm_document_limits(firm_id) values($1) on conflict (firm_id) do nothing", [firm]);
  await rootQuery("update clara.firm_document_limits set llm_witness_concurrency=$2 where firm_id=$1", [firm, n]);
}

test("META: 0097_f_a1_cutover.sql is applied", async () => {
  mustBeReady();
});

// ===========================================================================
// SECTION 1 -- the router recut.
// ===========================================================================

test("f-a1-cutover.a the router mints llm_witness for an invoice-classified doc with live typed consent, reserving no page budget", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const evidence = await consentEvidenceDoc(users.alice, { firm });
  const grant = await grantPurpose(users.alice, { client: clients.A2, purpose: WITNESS_PURPOSE, evidenceDocument: evidence.documentId });
  assert.equal(grant.status, "live", `witness_extraction grant must succeed (got ${JSON.stringify(grant)})`);
  const activate = await activatePurpose(users.alice, { client: clients.A2, purpose: WITNESS_PURPOSE, consent: grant.consent_id });
  assert.equal(activate.status, "active", `witness_extraction activation must succeed (got ${JSON.stringify(activate)})`);

  const doc = await filedDocument(users.alice, { firm, client: clients.A2, kind: "invoice" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1, `exactly one task minted (got ${JSON.stringify(tasks)})`);
  const t = tasks[0];
  assert.equal(t.lane, "llm_witness", "the invoice-kind arm mints llm_witness, not invoice_facts");
  assert.equal(t.status, "queued", `with live consent the task queues (got ${JSON.stringify(t)})`);
  assert.equal(t.engine_id, WITNESS_ENGINE_ID, "the locked engine literal");
  assert.equal(await reservationCount(t.id), 0, "meter-never-cap (D6): llm_witness reserves NO page budget");
});

test("f-a1-cutover.b consent absent -> witness_consent_inactive enqueue refusal + the lane-true event, and the FILING TRANSACTION IS NOT ABORTED", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const before_ = await eventCount(firm, "document.llm_witness_failed");

  // No witness_extraction consent exists for clients.A1 in THIS file's fresh world -- filing
  // an invoice-kind document must still SUCCEED (the gate never raises; it writes a terminal
  // receipt instead, exactly the statement-lane precedent).
  const doc = await filedDocument(users.alice, { firm, client: clients.A1, kind: "invoice" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1, `exactly one (terminal) task minted (got ${JSON.stringify(tasks)})`);
  const t = tasks[0];
  assert.equal(t.lane, "llm_witness");
  assert.equal(t.status, "failed", `no live consent must refuse at enqueue (got ${JSON.stringify(t)})`);
  assert.equal(t.error_code, "witness_consent_inactive", "exactly one active filing client with no live consent -> witness_consent_inactive (not witness_multi_client)");

  const after_ = await eventCount(firm, "document.llm_witness_failed");
  assert.equal(after_, before_ + 1, "exactly one document.llm_witness_failed event fired");

  // The filing itself is proof the transaction was not aborted: filedDocument() above did not
  // throw, and the filing row exists.
  const filing = await rootQuery("select 1 from clara.document_filings where document_id=$1 and retired_at is null", [doc.documentId]);
  assert.equal(filing.rowCount, 1, "the filing transaction committed -- the enqueue refusal never rolled it back");
});

test("f-a1-cutover.c a document with a DONE witness pair -> re-fire suppressed via the llm_text_facts mapping (already_completed)", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  // Seeded directly, unfiled (client: null) -- the already_completed short-circuit fires
  // before any filing-related check, so no filing is needed to exercise it.
  const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  const documentId = seed.documentId;
  const pair = await landWitnessPair(documentId, { engineId: WITNESS_ENGINE_ID, versionN: 1 });

  const r = await rootQuery("select clara._enqueue_invoice_facts_core($1) as r", [documentId]);
  const receipt = r.rows[0].r;
  assert.equal(receipt.status, "already_completed", `a done witness pair must short-circuit (got ${JSON.stringify(receipt)})`);
  assert.equal(receipt.extraction_id, pair.textId, "the reported extraction_id is the CANONICAL text row, not the vision row");
});

test("f-a1-cutover.d a NON-invoice kind (bank_statement) still routes to its OLD lane, byte-identically", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(users.alice, { firm, client: clients.A1, kind: "bank_statement" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1, `exactly one task minted (got ${JSON.stringify(tasks)})`);
  const t = tasks[0];
  assert.equal(t.lane, "statement_facts", "a bank_statement pdf still routes to statement_facts -- the cutover touches ONLY the invoice-kind arm");
  assert.equal(t.engine_id, "azure-di:prebuilt-bankStatement.us:2024-11-30", "the statement engine literal is untouched");
});

// ===========================================================================
// SECTION 2 -- clara.fail_witness_facts.
// ===========================================================================

// The EXACT eight-code runtime terminal vocabulary (PR-2 delta review D6). Report table:
//   admitted verbatim | bad_type, limit, internal, corrupt, encrypted,
//                        witness_consent_inactive, witness_multi_client, wait_exhausted
//   coerced to engine_error | anything else (incl. the generic engine_error/timeout/
//                        engine_lost/storage_error/budget/attempt_cap family the OLDER
//                        fail_invoice_facts/fail_statement_facts admit, and every
//                        STATEMENT-only code the shared error_code CHECK also carries)
const WITNESS_TERMINAL_CODES = Object.freeze([
  "bad_type", "limit", "internal", "corrupt", "encrypted",
  "witness_consent_inactive", "witness_multi_client", "wait_exhausted",
]);

test("f-a1-cutover.e fail_witness_facts settles running->failed and emits document.llm_witness_failed, for EVERY code in the runtime's 8-code terminal vocabulary", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  for (const code of WITNESS_TERMINAL_CODES) {
    const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
    const taskId = await insertRunningWitnessTask(firm, seed.documentId);
    const before_ = await eventCount(firm, "document.llm_witness_failed", seed.documentId);

    const r = await roleQuery(ROLES.runtime, "select clara.fail_witness_facts($1,$2) as r", [taskId, code]);
    const receipt = r.rows[0].r;
    assert.equal(receipt.status, "failed", `code=${code}`);
    assert.equal(receipt.reason, code, `code=${code} must be stored VERBATIM`);
    const row = await taskRow(taskId);
    assert.equal(row.status, "failed", `code=${code}`);
    assert.equal(row.error_code, code, `code=${code}`);

    const after_ = await eventCount(firm, "document.llm_witness_failed", seed.documentId);
    assert.equal(after_, before_ + 1, `code=${code}: exactly one document.llm_witness_failed event fired`);

    // Replay on an already-failed task returns the stored receipt rather than re-settling.
    const replay = await roleQuery(ROLES.runtime, "select clara.fail_witness_facts($1,$2) as r", [taskId, "bad_type"]);
    assert.equal(replay.rows[0].r.status, "failed");
    assert.equal(replay.rows[0].r.reason, code, `code=${code}: a replay reports the STORED reason, never the new argument`);
    assert.equal(replay.rows[0].r.replayed, true);
  }
});

test("f-a1-cutover.f fail_witness_facts refuses (coerces to engine_error) any code OUTSIDE the 8-code vocabulary, including the generic base family and a STATEMENT-only code", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  for (const code of ["timeout", "engine_error", "engine_lost", "storage_error", "budget", "attempt_cap", "header_unreadable", "not_a_real_code"]) {
    const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
    const taskId = await insertRunningWitnessTask(firm, seed.documentId);
    const r = await roleQuery(ROLES.runtime, "select clara.fail_witness_facts($1,$2) as r", [taskId, code]);
    assert.equal(r.rows[0].r.reason, "engine_error", `code=${code} (outside the 8-code vocabulary) must coerce to engine_error, never store verbatim`);
  }
});

test("f-a1-cutover.f2 queued->failed stays EXACTLY wall 13's two witness consent codes -- the other six terminal codes are still refused on a QUEUED task", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  for (const code of ["witness_consent_inactive", "witness_multi_client"]) {
    const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
    const queued = await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
       values($1,$2,$3,1,'llm_witness','queued') returning id`,
      [firm, seed.documentId, WITNESS_ENGINE_ID]);
    await rootQuery(
      "update clara.document_processing_tasks set status='failed', error_code=$2, finished_at=now() where id=$1",
      [queued.rows[0].id, code]);
    assert.equal((await taskRow(queued.rows[0].id)).status, "failed", `queued->failed on ${code} must still be admitted`);
  }
  for (const code of ["bad_type", "limit", "internal", "corrupt", "encrypted", "wait_exhausted"]) {
    const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
    const queued = await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
       values($1,$2,$3,1,'llm_witness','queued') returning id`,
      [firm, seed.documentId, WITNESS_ENGINE_ID]);
    await assertRaises("CLR16",
      () => rootQuery(
        "update clara.document_processing_tasks set status='failed', error_code=$2, finished_at=now() where id=$1",
        [queued.rows[0].id, code]),
      `queued->failed on ${code} must still be REFUSED -- wall 13 widened for the two enqueue-gate codes only, never the running->failed vocabulary`);
  }
});

test("f-a1-cutover.g fail_witness_facts refuses a non-llm_witness task and a non-running task", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const seed = await seedVerifiedDocument({ firm, client: null, kind: "bank_statement" });
  const stmtTask = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
       status,workflow_run_id,started_at)
     values($1,$2,'azure-di:prebuilt-bankStatement.us:2024-11-30',1,'statement_facts',
       'running',$3,now()) returning id`,
    [firm, seed.documentId, `rig-stmt-${randomUUID().slice(0, 8)}`]);
  await assertRaises("CLR16",
    () => roleQuery(ROLES.runtime, "select clara.fail_witness_facts($1,$2) as r", [stmtTask.rows[0].id, "timeout"]),
    "fail_witness_facts must refuse a statement_facts task");

  const seed2 = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  const queuedTask = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
     values($1,$2,$3,1,'llm_witness','queued') returning id`,
    [firm, seed2.documentId, WITNESS_ENGINE_ID]);
  await assertRaises("CLR16",
    () => roleQuery(ROLES.runtime, "select clara.fail_witness_facts($1,$2) as r", [queuedTask.rows[0].id, "timeout"]),
    "fail_witness_facts must refuse a QUEUED (not running) task");
});

test("f-a1-cutover.k THE WEDGE REGRESSION: the witness-own concurrency window frees the moment fail_witness_facts settles running->failed -- two saturate, both fail via the verb, a THIRD then claims", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  // Isolate this cell's window from any earlier cell's leftover running row on this firm
  // (f-a1-cutover.e/f/g each leave settled rows, never a stray running one -- this is
  // defensive, matching the f-a1-walls.test.mjs precedent for the same shared-firm risk).
  await rootQuery(
    "update clara.document_processing_tasks set status='done',finished_at=now() where firm_id=$1 and lane='llm_witness' and status='running'",
    [firm]);
  await setWitnessConcurrency(firm, 2);

  const seedA = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  const seedB = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  const seedC = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  const taskA = await insertRunningWitnessTask(firm, seedA.documentId);
  const taskB = await insertRunningWitnessTask(firm, seedB.documentId);

  const queuedC = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
     values($1,$2,$3,1,'llm_witness','queued') returning id`,
    [firm, seedC.documentId, WITNESS_ENGINE_ID]);
  await assertRaises("CLR18", () => claimTask(queuedC.rows[0].id, { egressApproved: true }),
    "the witness-own window (cap 2) is saturated by taskA+taskB running -- a third claim must refuse BEFORE either settles");

  // Fail BOTH running tasks through the settle verb under test -- this is the review's B1
  // finding under a real proof: the verb must take the task OUT of status='running' (0090's
  // concurrency count is running-only), or the window stays wedged forever.
  await roleQuery(ROLES.runtime, "select clara.fail_witness_facts($1,$2) as r", [taskA, "timeout"]);
  await roleQuery(ROLES.runtime, "select clara.fail_witness_facts($1,$2) as r", [taskB, "engine_error"]);
  assert.equal((await taskRow(taskA)).status, "failed");
  assert.equal((await taskRow(taskB)).status, "failed");

  const claimed = await claimTask(queuedC.rows[0].id, { egressApproved: true });
  assert.equal(claimed.status, "running", `the window must be FREE the moment both running tasks settle via fail_witness_facts -- a wedged window would refuse this claim too (got ${JSON.stringify(claimed)})`);
});

// ===========================================================================
// SECTION 3 -- request_reextraction door widening (D7).
// ===========================================================================

async function requestReextraction(sub, { document, reason = "rig re-extraction cutover probe", opKey } = {}) {
  const specs = [{ name: "p_document" }, { name: "p_reason" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("request_reextraction", specs),
    [document, reason, opKey === undefined ? opk("rex") : opKey]);
  return r.rows[0].result;
}

test("f-a1-cutover.h re-extraction: a witness-done RECEIPT admits via the PRIMARY branch (never receipt_backfill), mints llm_witness with the locked engine literal, reserves no page budget", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const seed = await seedVerifiedDocument({ firm, client: null, kind: "receipt" });
  const pair = await landWitnessPair(seed.documentId, { engineId: WITNESS_ENGINE_ID, versionN: 1 });

  const res = await requestReextraction(users.bob, { document: seed.documentId });
  assert.equal(res.admission, "reextraction", `a witness-done receipt must admit via the PRIMARY branch, never receipt_backfill (got ${JSON.stringify(res)})`);
  assert.equal(res.status, "queued");
  assert.equal(res.reused, false, "a genuinely NEW task, not a recovered in-flight one");

  const row = await taskRow(res.task_id);
  assert.equal(row.lane, "llm_witness", "the mint targets llm_witness");
  assert.equal(row.engine_id, WITNESS_ENGINE_ID, "the SAME engine literal the router mints");
  assert.equal(row.version_n, pair.versionN + 1, "the next version on the (now shared) llm_witness lane counter");
  assert.equal(await reservationCount(res.task_id), 0, "the page-budget reservation clause stays invoice_facts-only -- a witness re-extraction reserves NOTHING");
});

test("f-a1-cutover.i re-extraction: an invoice-kind document with NO prior extraction still refuses CLR16 (the admission gate itself is untouched)", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  await assertRaises("CLR16",
    () => requestReextraction(users.bob, { document: seed.documentId }),
    "no completed extraction of either regime exists to re-extract");
});

// ===========================================================================
// SECTION 4 -- the engine literal contract, read both sides and compared.
// ===========================================================================

test("f-a1-cutover.j the engine literal string-equals the runtime's WITNESS_ENGINE_SNAPSHOT.engineId -- read both sides independently, compare", async () => {
  mustBeReady();
  const runtimeSrc = readFileSync(new URL("../../runtime/workflows/witnessFacts.v1.services.mjs", import.meta.url), "utf8");
  const modelMatch = /WITNESS_MODEL_ID = process\.env\.CLARA_WITNESS_MODEL_ID \|\| "([^"]+)"/.exec(runtimeSrc);
  const versionMatch = /WITNESS_ENGINE_VERSION = "([^"]+)"/.exec(runtimeSrc);
  assert.ok(modelMatch, "WITNESS_MODEL_ID's default must be readable from the runtime source");
  assert.ok(versionMatch, "WITNESS_ENGINE_VERSION must be readable from the runtime source");
  const runtimeEngineId = `llm-openai:${modelMatch[1]}:${versionMatch[1]}`;
  assert.equal(runtimeEngineId, WITNESS_ENGINE_ID, "the migration's hardcoded literal must string-equal the runtime's derived default");

  const routerSrc = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(routerSrc.includes(`v_engine:='${runtimeEngineId}'`), "the router's own catalog source must carry the SAME literal, read independently");

  const reextSrc = (await rootQuery(
    "select prosrc from pg_proc where oid='clara.request_reextraction(uuid,text,text)'::regprocedure")).rows[0].prosrc;
  assert.ok(reextSrc.includes(`v_engine := '${runtimeEngineId}'`), "request_reextraction's own catalog source must carry the SAME literal, read independently");
});

// ===========================================================================
// SECTION 5 -- clara.persist_witness_facts' writer-parity fixes
// (0096_f_a1_writer_rotation.sql): the financial_date backfill and the
// document.invoice_facts_completed completion event. (The facts_rotated draft-rotation half
// of that migration is exercised end-to-end by x1-supersede.test.mjs's mid-review-swap cell,
// which needs a real open draft + approver -- not duplicated here.)
// ===========================================================================

const WITNESS_BELT = [
  "invoice.total", "invoice.total_excl_tax", "invoice.tax_total", "invoice.rounding",
  "invoice.service_charge", "invoice.discount", "invoice.delivery",
  "invoice.amount_due", "invoice.deposit", "invoice.currency", "invoice.type_code",
];
function minimalWitnessEnvelope(channel, extra = {}) {
  const answers = {};
  for (const f of WITNESS_BELT) answers[f] = { state: "not_printed" };
  for (const [k, v] of Object.entries(extra)) answers[k] = v;
  return { witness: { channel, answers } };
}
async function ocrExtractionFor(firm, documentId) {
  const r = await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,envelope)
     values($1,$2,'clara-fixture:ocr-probe','ocr',1,'done','{}'::jsonb) returning id`,
    [firm, documentId]);
  return r.rows[0].id;
}
async function persistWitness(taskId, text, vision, pagesUsed = 1) {
  const r = await rootQuery(
    "select clara.persist_witness_facts($1,$2::jsonb,$3::jsonb,$4) as s",
    [taskId, JSON.stringify(text), JSON.stringify(vision), pagesUsed]);
  return r.rows[0].s;
}

test("f-a1-cutover.l a settled witness pair backfills financial_date from a stated ISO invoice_date; an ABSENT invoice_date leaves a pre-existing financial_date untouched (legacy coalesce/new-wins semantics)", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);

  // Case 1: no pre-existing financial_date, invoice_date STATED -> backfills.
  const seed1 = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  const ocr1 = await ocrExtractionFor(firm, seed1.documentId);
  const task1 = await insertRunningWitnessTask(firm, seed1.documentId);
  await persistWitness(task1,
    { input_pin: ocr1, prompt_hash: `t-${randomUUID()}`,
      envelope: minimalWitnessEnvelope("text", { "invoice.invoice_date": { state: "value", raw: "2026-06-15" } }) },
    { input_pin: seed1.sha256, prompt_hash: `v-${randomUUID()}`, envelope: minimalWitnessEnvelope("vision") });
  const doc1 = await rootQuery("select to_char(financial_date,'YYYY-MM-DD') as d from clara.documents where id=$1", [seed1.documentId]);
  assert.equal(doc1.rows[0].d, "2026-06-15", "financial_date backfilled from the stated ISO invoice_date");

  // Case 2: a PRE-EXISTING financial_date, invoice_date NOT stated -> kept.
  const seed2 = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  await rootQuery("update clara.documents set financial_date='2025-01-01' where id=$1", [seed2.documentId]);
  const ocr2 = await ocrExtractionFor(firm, seed2.documentId);
  const task2 = await insertRunningWitnessTask(firm, seed2.documentId);
  await persistWitness(task2,
    { input_pin: ocr2, prompt_hash: `t-${randomUUID()}`, envelope: minimalWitnessEnvelope("text") },
    { input_pin: seed2.sha256, prompt_hash: `v-${randomUUID()}`, envelope: minimalWitnessEnvelope("vision") });
  const doc2 = await rootQuery("select to_char(financial_date,'YYYY-MM-DD') as d from clara.documents where id=$1", [seed2.documentId]);
  assert.equal(doc2.rows[0].d, "2025-01-01", "…and an ABSENT invoice_date leaves the pre-existing financial_date untouched");
});

test("f-a1-cutover.m a settled witness pair appends exactly one document.invoice_facts_completed event naming the CANONICAL text extraction, ID-only payload; a REPLAY appends none", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  const ocr = await ocrExtractionFor(firm, seed.documentId);
  const task = await insertRunningWitnessTask(firm, seed.documentId);
  const before_ = await eventCount(firm, "document.invoice_facts_completed", seed.documentId);

  const text = { input_pin: ocr, prompt_hash: `t-${randomUUID()}`, envelope: minimalWitnessEnvelope("text") };
  const vision = { input_pin: seed.sha256, prompt_hash: `v-${randomUUID()}`, envelope: minimalWitnessEnvelope("vision") };
  const r1 = await persistWitness(task, text, vision);
  assert.equal(r1.replayed, false);

  const after_ = await eventCount(firm, "document.invoice_facts_completed", seed.documentId);
  assert.equal(after_, before_ + 1, "exactly one document.invoice_facts_completed event fired -- the SAME name autodraft.mjs's AUTODRAFT_EVENT_TYPES subscribes to");

  const ev = await rootQuery(
    `select payload from clara.domain_events
      where firm_id=$1 and event_type='document.invoice_facts_completed' and document_id=$2
      order by seq desc limit 1`,
    [firm, seed.documentId]);
  assert.deepEqual(Object.keys(ev.rows[0].payload).sort(), ["extraction_id", "task_id", "version_n"],
    "ID-only payload shape, mirroring persist_invoice_facts' own emit exactly");
  assert.equal(ev.rows[0].payload.task_id, task);
  assert.equal(ev.rows[0].payload.extraction_id, r1.text_extraction_id, "extraction_id names the CANONICAL text row, never the vision row");
  assert.equal(ev.rows[0].payload.version_n, r1.version_n);

  // Replay: the SAME task, called again -- no new event.
  const r2 = await persistWitness(task, text, vision);
  assert.equal(r2.replayed, true);
  const afterReplay = await eventCount(firm, "document.invoice_facts_completed", seed.documentId);
  assert.equal(afterReplay, after_, "a replay appends NO additional event");
});

// ===========================================================================
// SECTION 6 -- M-4 (RULED, cross-model review): the already_completed short-circuit is
// EITHER-REGIME. A done extraction in EITHER legacy invoice_facts OR the witness
// llm_text_facts row suppresses the automatic backstop's re-mint -- no silent fact-flip
// under an already-drafted document, no unbudgeted re-read of the legacy corpus. A
// DELIBERATE regime upgrade stays available through request_reextraction (the human-keyed
// door, which always mints fresh -- own admission logic, never already_completed) or
// Wave-G's factory reset. Cell c above already proves the witness-pair side; this section
// proves the legacy side and the request_reextraction contrast.
// ===========================================================================

test("f-a1-cutover.n M-4: a document with a DONE legacy invoice_facts extraction ALSO suppresses the automatic re-fire via already_completed -- the EITHER-REGIME short-circuit's legacy side", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  const legacyExtraction = (await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,'azure-di:prebuilt-invoice:2024-11-30','invoice_facts',1,'done',1) returning id`,
    [firm, seed.documentId])).rows[0].id;

  const r = await rootQuery("select clara._enqueue_invoice_facts_core($1) as r", [seed.documentId]);
  const receipt = r.rows[0].r;
  assert.equal(receipt.status, "already_completed", `a done LEGACY extraction must ALSO short-circuit (got ${JSON.stringify(receipt)})`);
  assert.equal(receipt.extraction_id, legacyExtraction, "the reported extraction_id is the legacy invoice_facts row");
  assert.equal((await tasksOf(seed.documentId)).filter((t) => t.lane === "llm_witness").length, 0,
    "no llm_witness task was minted -- the backstop never re-derives facts under a DIFFERENT regime on its own");
});

test("f-a1-cutover.o M-4: request_reextraction is NEVER short-circuited by already_completed -- it still mints fresh over a done LEGACY extraction, the DELIBERATE human-keyed upgrade door", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const seed = await seedVerifiedDocument({ firm, client: null, kind: "invoice" });
  await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,'azure-di:prebuilt-invoice:2024-11-30','invoice_facts',1,'done',1)`,
    [firm, seed.documentId]);

  // The automatic backstop suppresses (M-4's whole point)…
  const auto = await rootQuery("select clara._enqueue_invoice_facts_core($1) as r", [seed.documentId]);
  assert.equal(auto.rows[0].r.status, "already_completed", "mandatory setup: the automatic backstop suppresses over the legacy extraction");

  // …but the human-keyed door mints fresh regardless -- request_reextraction has its OWN
  // 'reextraction' admission arm (already-widened to read EITHER regime, section 3 above) and
  // is never routed through already_completed at all.
  const res = await requestReextraction(users.bob, { document: seed.documentId });
  assert.equal(res.status, "queued", "request_reextraction mints fresh -- the deliberate upgrade seam stays open");
  assert.equal(res.admission, "reextraction");
  const row = await taskRow(res.task_id);
  assert.equal(row.lane, "llm_witness", "the fresh mint targets llm_witness, per D9's no-dual-run contract");
});
