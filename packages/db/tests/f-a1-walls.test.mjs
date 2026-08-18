// F-A1 (Wave-F Track A) PR-1 piece 2 -- THE WALLS battery, for
// migrations/0090_f_a1_walls.sql (number claimed at merge). NOT contract-blind: this
// lane authored the migration, so every cell targets the ACTUAL installed behaviour. Design:
// docs/plan/active/f-a1-witness-pair-design.md + f-a1-annexes.md (Annex A walls 1-9/12, Annex
// C "Walls" cells).
//
// SCOPE: engine_kind/lane/prefix CHECKs (walls 1-3); claim_document_processing_task +
// release_held_document_tasks (walls 4-5 -- llm_witness joins the kill-switch triple, the
// attempt cap, its OWN concurrency window (M10), and the inner kill-switch-only release
// branch); typed purpose witness_extraction (wall 6 -- both purpose CHECKs + the doc_sha
// CHECK + the four purpose verbs + prepare_egress_dispatch); both refusal-code CHECKs (wall
// 7); get_document_extract's extracted_at (M7) and the witness-envelope budget exclusion
// (M14). The wb-0020 restore-pair battery (wall 12) is a SEPARATE file
// (tests/wave-b/wb-0020-legacy.test.mjs), not duplicated here -- green (9/9) already.
//
// _enqueue_invoice_facts_core's inert llm_witness enqueue-gate branch (wall 6's other half)
// is NOT exercised behaviourally -- genuinely unreachable at this frontier (no mime/kind arm
// ever sets v_lane:='llm_witness'; the fn is ungranted to every app role). Proven instead by
// (a) successful migration apply, (b) the wb-0020 restore-pair hash match, (c) f-a1.m below.
//
// Runs in the default sweep once 0090 sits in the real migrations chain (post-merge). The
// authoring-era caveat (scratch CLARA_MIGRATIONS_DIR with a temporarily-numbered copy,
// because the deliverable shipped UNNUMBERED) retired at PR-1 assembly.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, endPool, assertRaises,
} from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { ensureReady } from "./rig-docs-fixtures.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf, filedDocument } from "./s6-helpers.mjs";
import { claimTask, getDocumentExtract } from "./s6-fixtures.mjs";
import {
  grantPurpose, activatePurpose, consentEvidenceDoc, livePurposeConsent, livePurposeActivation,
} from "./wave-b/wb-0020-helpers.mjs";

const WITNESS_PURPOSE = "witness_extraction";
let ready = false;
let world = null;

/** THE CAPABILITY, read from the catalog -- the instrument production itself uses. A single
 *  unambiguous marker for "has 0090_f_a1_walls.sql landed on this database": the
 *  witness-own concurrency column exists nowhere before this migration. */
async function f_a1Ready() {
  const r = await rootQuery(
    "select 1 from information_schema.columns where table_schema='clara' and table_name='firm_document_limits' and column_name='llm_witness_concurrency'",
  );
  return r.rowCount > 0;
}

before(async () => {
  await ensureReady();
  ready = await f_a1Ready();
  if (!ready) return;
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("f-a1-walls");
  await endPool();
});

function mustBeReady() {
  assert.ok(ready, "0090_f_a1_walls.sql is not applied on this database (llm_witness_concurrency column absent) -- this battery must FAIL, not skip, against a pre-F-A1 chain");
}

// ---------------------------------------------------------------------------
// Fixture helpers local to this file.
// ---------------------------------------------------------------------------

/** A minimal llm_witness processing-task row, direct INSERT (the x49/x54 idiom: what is
 *  under test is the WALL, not a writer -- no legitimate verb can mint this lane at this
 *  frontier, by design). */
async function insertWitnessTask(firm, document, {
  versionN = 1, engineId = "llm-openai:gpt-5.1:v1", attemptCount = 0, status = "queued", errorCode = null,
} = {}) {
  // ck_processing_task_error / ck_processing_task_terminal: a 'failed' row needs a
  // non-null error_code AND finished_at; every other status needs both null.
  // ck_processing_task_binding_f_a1: a 'failed' row is legal EITHER claimed-shaped
  // (workflow_run_id + started_at both set) OR never-claimed-shaped (both null AND
  // error_code in the never-claimed allowlist). A plain synthetic 'engine_error' fixture
  // therefore needs the CLAIMED shape -- the never-claimed shape is exercised directly
  // (raw INSERT, not this helper) in f-a1.n.
  const finishedAt = status === "done" || status === "failed" ? new Date() : null;
  const code = status === "failed" ? (errorCode ?? "engine_error") : null;
  const claimedShape = status === "running" || status === "done" || status === "failed";
  const workflowRunId = claimedShape ? `wf-${randomUUID()}` : null;
  const startedAt = claimedShape ? new Date() : null;
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status,attempt_count,error_code,finished_at,workflow_run_id,started_at)
     values($1,$2,$3,$4,'llm_witness',$5,$6,$7,$8,$9,$10) returning id`,
    [firm, document, engineId, versionN, status, attemptCount, code, finishedAt, workflowRunId, startedAt],
  );
  return r.rows[0].id;
}

async function taskRow(id) {
  const r = await rootQuery("select to_jsonb(t) as row from clara.document_processing_tasks t where t.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}

/** Ensure a firm_document_limits row exists (via the INSERT-only-if-absent path, never
 *  touching columns the pseudo-upsert trigger would blindly reset), then set the witness
 *  window with a PLAIN UPDATE -- which the trigger (BEFORE INSERT only) never intercepts. */
async function setWitnessConcurrency(firm, n) {
  await rootQuery("insert into clara.firm_document_limits(firm_id) values($1) on conflict (firm_id) do nothing", [firm]);
  await rootQuery("update clara.firm_document_limits set llm_witness_concurrency=$2 where firm_id=$1", [firm, n]);
}

/** IA-7-style sha-bound overload wrappers (x38's own local pattern) -- the 6-arg
 *  prepare_egress_dispatch / 7-arg consume_egress_dispatch document-tied overloads. */
async function prepareDispatchSha({ firm, client, purpose = WITNESS_PURPOSE, eventSeq = 1, eventType = "witness.dispatch", documentSha256, role = ROLES.runtime }) {
  const r = await roleQuery(role,
    `select clara.prepare_egress_dispatch(p_firm => $1, p_client => $2, p_purpose => $3,
       p_event_seq => $4::bigint, p_event_type => $5, p_document_sha256 => $6) as r`,
    [firm, client, purpose, eventSeq, eventType, documentSha256]);
  return r.rows[0].r;
}
async function consumeDispatchSha({ firm, authorization, client, purpose = WITNESS_PURPOSE, eventSeq = 1, eventType = "witness.dispatch", documentSha256, role = ROLES.runtime }) {
  const r = await roleQuery(role,
    `select clara.consume_egress_dispatch(p_firm => $1, p_authorization => $2, p_client => $3,
       p_purpose => $4, p_event_seq => $5::bigint, p_event_type => $6, p_document_sha256 => $7) as r`,
    [firm, authorization, client, purpose, eventSeq, eventType, documentSha256]);
  return r.rows[0].r;
}

async function assertCheckViolation(fn, label) {
  try {
    await fn();
    assert.fail(`${label}: expected a CHECK violation (23514), nothing raised`);
  } catch (e) {
    assert.equal(e.code, "23514", `${label}: expected CHECK violation 23514, got ${e.code}: ${e.message}`);
  }
}

test("META: 0090_f_a1_walls.sql is applied", async () => {
  mustBeReady();
});

// ===========================================================================
// WALL 1 -- engine_kind CHECK (document_extractions). BLIND: raw catalog probe.
// ===========================================================================

test("f-a1.a engine_kind admits llm_text_facts and llm_vision_facts, refuses an unknown kind", async () => {
  mustBeReady();
  const { users, clients } = world;
  const doc = await filedDocument(users.alice, { firm: await firmOf(clients.A1), client: clients.A1 });
  const firm = await firmOf(clients.A1);
  for (const kind of ["llm_text_facts", "llm_vision_facts"]) {
    const r = await rootQuery(
      `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,envelope)
       values($1,$2,$3,$4,1,'done','{}'::jsonb) returning id`,
      [firm, doc.documentId, `llm-openai:gpt-5.1:${kind}`, kind],
    );
    assert.ok(r.rows[0].id, `engine_kind='${kind}' must be admitted`);
  }
  await assertCheckViolation(
    () => rootQuery(
      `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,envelope)
       values($1,$2,'llm-x:v1','llm_bogus_kind',2,'done','{}'::jsonb)`,
      [firm, doc.documentId],
    ),
    "an unknown engine_kind must still be refused",
  );
});

// ===========================================================================
// WALL 2/3 -- lane CHECK + lane<->engine prefix CHECK. BLIND: raw catalog probes.
// ===========================================================================

test("f-a1.b lane admits llm_witness, refuses an unknown lane", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  const id = await insertWitnessTask(firm, doc.documentId, { versionN: 1 });
  assert.ok(id, "lane='llm_witness' must be admitted");
  await assertCheckViolation(
    () => rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane)
       values($1,$2,'clara-fixture:x',9,'llm_witness_bogus_lane')`,
      [firm, doc.documentId],
    ),
    "an unknown lane must still be refused",
  );
});

test("f-a1.c prefix CHECK: llm_witness requires engine_id like 'llm-%', refuses a mismatched prefix, and the lane-blind clara-fixture:% door still opens for this lane", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });

  await assertCheckViolation(
    () => rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane)
       values($1,$2,'azure-di:prebuilt-invoice:2024-11-30',1,'llm_witness')`,
      [firm, doc.documentId],
    ),
    "engine_id not matching 'llm-%' must be refused for lane=llm_witness",
  );

  const okId = await insertWitnessTask(firm, doc.documentId, { versionN: 2, engineId: "llm-openai:gpt-5.1:vision" });
  assert.ok(okId, "an 'llm-%' engine_id must be admitted for lane=llm_witness");

  // A SEPARATE document: uq_document_processing_one_live_lane admits only one LIVE
  // (queued/held_egress/running) task per (document,lane), and okId above already holds it.
  const doc2 = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  const fixtureRow = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane)
     values($1,$2,'clara-fixture:test-witness',1,'llm_witness') returning id`,
    [firm, doc2.documentId],
  );
  assert.ok(fixtureRow.rows[0].id, "the lane-blind clara-fixture:% door must still admit llm_witness (the rig's door, unchanged)");
});

// ===========================================================================
// WALL 4 -- claim_document_processing_task: kill switch, attempt cap (M9), and the
// witness-OWN concurrency window (M10), exercised NONVACUOUSLY.
// ===========================================================================

test("f-a1.d claim HOLDS an llm_witness task with kill_switch when the switch is off, and admits it when the switch is on", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  const taskId = await insertWitnessTask(firm, doc.documentId, { versionN: 1 });

  const held = await claimTask(taskId, { egressApproved: false });
  assert.equal(held.status, "held_egress", `switch off must hold, got ${JSON.stringify(held)}`);
  assert.equal(held.payload?.reason, "kill_switch", `the hold reason must be kill_switch (got ${JSON.stringify(held)})`);
  assert.equal((await taskRow(taskId)).status, "held_egress", "the row itself reads held_egress");

  // A held row is only re-claimable once the release sweep flips it back to queued (wall 5,
  // f-a1.g) -- claim_document_processing_task itself refuses a non-'queued' status outright.
  await roleQuery(ROLES.runtime, "select clara.release_held_document_tasks(1000) as r");
  assert.equal((await taskRow(taskId)).status, "queued", "the release sweep must have requeued it");

  const running = await claimTask(taskId, { egressApproved: true });
  assert.equal(running.status, "running", `switch on must admit the claim, got ${JSON.stringify(running)}`);
  assert.equal((await taskRow(taskId)).status, "running");
});

test("f-a1.e attempt cap (per-lane sum >= 3) fails the claim and fires document.llm_witness_failed (M9), not the invoice or statement twin", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  // One prior row already carries 3 attempts on this document+lane; the row under claim
  // starts at 0 -- sum=3 caps BEFORE the queued->running transition, exactly the shape
  // x38.z2 exercises for statement_facts.
  await insertWitnessTask(firm, doc.documentId, { versionN: 1, status: "failed", attemptCount: 3 });
  const taskId = await insertWitnessTask(firm, doc.documentId, { versionN: 2, attemptCount: 0 });

  const before = await rootQuery(
    "select count(*)::int as n from clara.domain_events where firm_id=$1 and event_type='document.llm_witness_failed'",
    [firm],
  );
  const capped = await claimTask(taskId, { egressApproved: true });
  assert.equal(capped.status, "failed", `expected an attempt-cap failure, got ${JSON.stringify(capped)}`);
  assert.equal(capped.reason, "attempt_cap");
  const row = await taskRow(taskId);
  assert.equal(row.error_code, "attempt_cap");

  const after = await rootQuery(
    "select count(*)::int as n from clara.domain_events where firm_id=$1 and event_type='document.llm_witness_failed'",
    [firm],
  );
  assert.equal(after.rows[0].n, before.rows[0].n + 1, "the attempt-cap failure must fire exactly one document.llm_witness_failed event");

  const invoiceTwin = await rootQuery(
    "select count(*)::int as n from clara.domain_events where firm_id=$1 and event_type='document.invoice_facts_failed' and payload->>'task_id'=$2",
    [firm, taskId],
  );
  assert.equal(invoiceTwin.rows[0].n, 0, "the invoice twin must NEVER fire for a witness-lane attempt-cap failure");
});

test("f-a1.f the witness-own concurrency window (M10) caps INDEPENDENTLY of the shared ocr/invoice_facts/statement_facts window -- neither leaks into the other", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  // Earlier cells in this file (f-a1.d) leave a claimed llm_witness row 'running' on this
  // same firm -- settle it so THIS cell's cap is measured from a clean window, not inflated
  // by another cell's fixture.
  await rootQuery(
    "update clara.document_processing_tasks set status='done',finished_at=now() where firm_id=$1 and lane='llm_witness' and status='running'",
    [firm],
  );
  await setWitnessConcurrency(firm, 1);

  const docA = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  const docB = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  const taskA = await insertWitnessTask(firm, docA.documentId, { versionN: 1 });
  const taskB = await insertWitnessTask(firm, docB.documentId, { versionN: 1 });

  const runningA = await claimTask(taskA, { egressApproved: true });
  assert.equal(runningA.status, "running", "the first llm_witness claim must saturate the cap of one");

  // A SECOND llm_witness claim must now hit the witness-own CLR18 -- not silently pass
  // because it was folded into the (much larger, default-2) shared ocr/invoice/statement
  // window, which this document never touches.
  await assertRaises("CLR18", () => claimTask(taskB, { egressApproved: true }), "a second llm_witness claim over the witness-own cap of one");

  // NONVACUOUS distinctness: a FRESH ocr claim, on the same firm, must NOT be blocked by
  // the witness lane's own saturation -- the witness window must never leak into the shared
  // one it sits beside.
  const ocrDoc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  const ocrTask = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane)
     values($1,$2,'clara-fixture:ocr-probe',1,'ocr') returning id`,
    [firm, ocrDoc.documentId],
  );
  const ocrRunning = await claimTask(ocrTask.rows[0].id, { egressApproved: true });
  assert.equal(ocrRunning.status, "running", "a saturated witness-own window must not block a fresh OCR claim on the shared window");
});

// ===========================================================================
// WALL 5 -- release_held_document_tasks: llm_witness joins BOTH the outer held-egress
// list AND the inner kill-switch-only branch (its consent is typed, enqueue-time only).
// ===========================================================================

test("f-a1.g a held llm_witness task RELEASES (queued) on the next release sweep -- the inner kill-switch-only branch", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  const taskId = await insertWitnessTask(firm, doc.documentId, { versionN: 1 });

  const held = await claimTask(taskId, { egressApproved: false });
  assert.equal(held.status, "held_egress");
  assert.equal((await taskRow(taskId)).status, "held_egress");

  const released = await roleQuery(ROLES.runtime, "select clara.release_held_document_tasks(1000) as r");
  assert.ok(released.rows[0].r.released >= 1, `release must report at least one released row (got ${JSON.stringify(released.rows[0].r)})`);
  const row = await taskRow(taskId);
  assert.equal(row.status, "queued", "an llm_witness held row must transition back to queued -- its ONLY hold cause is the kill switch, so a release sweep must clear it unconditionally, exactly like ocr/statement_facts");
});

// ===========================================================================
// WALL 6 -- typed purpose witness_extraction.
// ===========================================================================

test("f-a1.h witness_extraction is grantable and activatable through the four typed-purpose verbs (the necessary in-body allowlist widening)", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const evidence = await consentEvidenceDoc(users.alice, { firm });
  const grant = await grantPurpose(users.alice, { client: clients.A2, purpose: WITNESS_PURPOSE, evidenceDocument: evidence.documentId });
  assert.equal(grant.status, "live", `witness_extraction grant must succeed (got ${JSON.stringify(grant)})`);
  assert.ok(await livePurposeConsent(clients.A2, WITNESS_PURPOSE), "a live witness_extraction consent must read back");

  const activate = await activatePurpose(users.alice, { client: clients.A2, purpose: WITNESS_PURPOSE, consent: grant.consent_id });
  assert.equal(activate.status, "active", `witness_extraction activation must succeed (got ${JSON.stringify(activate)})`);
  assert.ok(await livePurposeActivation(clients.A2, WITNESS_PURPOSE), "a live witness_extraction activation must read back");
});

test("f-a1.i typed purpose ABSENT: prepare_egress_dispatch refuses witness_extraction uniformly ('unknown') before any consent exists", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
  const r = await prepareDispatchSha({ firm, client: clients.A1, documentSha256: doc.sha256 });
  assert.deepEqual(r, { verdict: "unknown", authorization_id: null }, `no live (consent,activation) for witness_extraction yet -- must refuse uniformly, got ${JSON.stringify(r)}`);
});

test("f-a1.j the witness doc_sha arm forces doc_sha NON-NULL at prepare time (mirrors statement_extraction's arm)", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A2);
  const r = await prepareDispatchSha({ firm, client: clients.A2, documentSha256: null });
  assert.deepEqual(r, { verdict: "unknown", authorization_id: null }, `a null document_sha256 must refuse for purpose=witness_extraction, got ${JSON.stringify(r)}`);
  noteLane("f-a1.j: also structurally BLIND-checked at the table level in f-a1.k (ck_egress_dispatch_authorizations_doc_sha)");
});

test("f-a1.k the doc_sha CHECK itself refuses a null hash for witness_extraction (BLIND, direct catalog probe) and accepts a non-null one", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A2);
  await assertCheckViolation(
    () => rootQuery(
      `insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
       select $1,$2,'witness_extraction',c.id,a.id,1,'probe',null,now(),now()+interval '60 seconds'
       from clara.client_egress_purpose_consents c join clara.client_egress_purpose_activations a on a.consent_id=c.id
       where c.client_id=$2 and c.purpose='witness_extraction' limit 1`,
      [firm, clients.A2],
    ),
    "a NULL document_sha256 on a witness_extraction authorization must violate ck_egress_dispatch_authorizations_doc_sha",
  );
  const ok = await rootQuery(
    `insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
     select $1,$2,'witness_extraction',c.id,a.id,2,'probe',$3,now(),now()+interval '60 seconds'
     from clara.client_egress_purpose_consents c join clara.client_egress_purpose_activations a on a.consent_id=c.id
     where c.client_id=$2 and c.purpose='witness_extraction' limit 1 returning id`,
    [firm, clients.A2, "a".repeat(64)],
  );
  assert.ok(ok.rows[0].id, "a non-null 64-hex document_sha256 must be admitted for witness_extraction");
});

test("f-a1.l present-for-other-doc refuses via the sha re-binding arm at consume time, uniformly (BLIND, non-oracle)", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const docA = await filedDocument(users.alice, { firm, client: clients.A2 });
  const docB = await filedDocument(users.alice, { firm, client: clients.A2 });

  const prepared = await prepareDispatchSha({ firm, client: clients.A2, documentSha256: docA.sha256, eventSeq: 10, eventType: "witness.probe" });
  assert.equal(prepared.verdict, "granted", `prepare must succeed once witness_extraction is live and activated, got ${JSON.stringify(prepared)}`);

  const wrongDoc = await consumeDispatchSha({
    firm, authorization: prepared.authorization_id, client: clients.A2,
    documentSha256: docB.sha256, eventSeq: 10, eventType: "witness.probe",
  });
  assert.deepEqual(wrongDoc, { verdict: "unknown" }, `an authorization minted for document A's bytes presented against document B's must refuse uniformly, got ${JSON.stringify(wrongDoc)}`);

  const rightDoc = await consumeDispatchSha({
    firm, authorization: prepared.authorization_id, client: clients.A2,
    documentSha256: docA.sha256, eventSeq: 10, eventType: "witness.probe",
  });
  assert.deepEqual(rightDoc, { verdict: "granted" }, `the SAME authorization presented against its OWN document's bytes must still consume, got ${JSON.stringify(rightDoc)}`);
});

// ===========================================================================
// WALL 6b -- the inert _enqueue_invoice_facts_core branch: catalog-only proof (see header).
// ===========================================================================

test("f-a1.m the inert llm_witness enqueue-gate branch is installed in _enqueue_invoice_facts_core (catalog marker; genuinely unreachable this frontier, see file header)", async () => {
  mustBeReady();
  const r = await rootQuery(
    "select prosrc from pg_proc where oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure",
  );
  const src = r.rows[0].prosrc;
  assert.ok(src.includes("elsif v_lane='llm_witness' then"), "the inert branch must be present");
  assert.ok(src.includes("witness_multi_client") && src.includes("witness_consent_inactive"), "the branch must mint its own named refusal codes");
  assert.ok(src.includes("document.llm_witness_failed"), "the branch's emit must name the witness twin");
  const grants = await rootQuery(
    `select count(*)::int as n from pg_proc p, aclexplode(p.proacl) a
       where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure and a.grantee<>'clara_fn_owner'::regrole`,
  );
  assert.equal(grants.rows[0].n, 0, "the function must stay ungranted to every application role -- the branch cannot be reached through any live caller");
});

// ===========================================================================
// WALL 7 -- BOTH refusal-code CHECKs. BLIND: raw catalog probes.
// ===========================================================================

test("f-a1.n both refusal-code CHECKs accept witness_multi_client / witness_consent_inactive and refuse an unknown code", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });

  for (const [i, code] of ["witness_multi_client", "witness_consent_inactive"].entries()) {
    // The NEVER-CLAIMED shape (binding CHECK's allowlist arm): status=failed,
    // workflow_run_id=null, started_at=null.
    const r = await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status,error_code,finished_at)
       values($1,$2,'llm-probe:v1',$3,'llm_witness','failed',$4,now()) returning id`,
      [firm, doc.documentId, 10 + i, code],
    );
    assert.ok(r.rows[0].id, `error_code='${code}' must be admitted in the never-claimed shape`);
  }
  await assertCheckViolation(
    () => rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status,error_code,finished_at)
       values($1,$2,'llm-probe:v1',20,'llm_witness','failed','witness_bogus_code',now())`,
      [firm, doc.documentId],
    ),
    "an unknown error_code must be refused by the error_code CHECK",
  );
  await assertCheckViolation(
    () => rootQuery(
      // Legal error_code, but the CLAIMED shape's arm requires BOTH workflow_run_id AND
      // started_at when neither is in the never-claimed allowlist's own null/null arm --
      // a witness code with a workflow_run_id but no started_at must still violate binding.
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status,error_code,workflow_run_id,finished_at)
       values($1,$2,'llm-probe:v1',21,'llm_witness','failed','witness_multi_client','wf-probe',now())`,
      [firm, doc.documentId],
    ),
    "witness_multi_client with a workflow_run_id but no started_at must still violate the binding CHECK's shape rule",
  );
});

// ===========================================================================
// WALL 13 -- the queued->failed TRANSITION arm in clara._tf_processing_task_update.
// The refusal-code CHECKs (wall 7) admit the VALUES; only this trigger admits the MOVE, and
// section 7e's llm_witness gate flips a queued task IN PLACE. Without it the gate raises CLR16
// the first time PR-3's router mints a witness task.
// ===========================================================================

test("f-a1.q wall 13: a queued llm_witness task flips to failed on a WITNESS refusal code, and an unlisted code is still CLR16", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);

  for (const code of ["witness_multi_client", "witness_consent_inactive"]) {
    // Each sub-case gets its OWN document: uq_document_processing_one_live_lane admits one live
    // llm_witness task per document, and the first flip leaves a terminal row behind.
    const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
    const id = await insertWitnessTask(firm, doc.documentId, { status: "queued" });
    await rootQuery(
      `update clara.document_processing_tasks set status='failed', error_code=$2, finished_at=now() where id=$1`,
      [id, code]);
    const row = await taskRow(id);
    assert.equal(row.status, "failed", `queued -> failed on ${code} must be admitted for lane=llm_witness`);
    assert.equal(row.error_code, code);
  }

  // An unlisted code on the SAME transition is still refused -- the arm widened by exactly two
  // codes, not by "any witness-shaped string".
  {
    const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
    const id = await insertWitnessTask(firm, doc.documentId, { status: "queued" });
    await assertRaises("CLR16", () => rootQuery(
      `update clara.document_processing_tasks set status='failed', error_code='engine_error', finished_at=now() where id=$1`,
      [id]),
    "a queued llm_witness task must not be flippable to an arbitrary failure code");
  }

  // …and the widening is LANE-SCOPED: the same two codes on a queued INVOICE task are refused.
  // (The error_code CHECK admits the value, so the term doing the work here is the lane scope.)
  {
    const doc = await filedDocument(world.users.alice, { firm, client: clients.A1 });
    const r = await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
       values($1,$2,'azure-di:prebuilt-invoice:2024-11-30',1,'invoice_facts','queued') returning id`,
      [firm, doc.documentId]);
    await assertRaises("CLR16", () => rootQuery(
      `update clara.document_processing_tasks set status='failed', error_code='witness_multi_client', finished_at=now() where id=$1`,
      [r.rows[0].id]),
    "a queued invoice_facts task must NOT be flippable to a witness verdict -- the arm is lane-scoped");
  }
});

// ===========================================================================
// M7/M14 -- get_document_extract: extracted_at published; witness envelopes excluded from
// the budgeted set while region coverage does not shrink.
// ===========================================================================

test("f-a1.o get_document_extract publishes extracted_at on both extraction and region entries", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(users.alice, { firm, client: clients.A1 });
  const ext = await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,envelope)
     values($1,$2,'clara-fixture:x-a1o','ocr',1,'done','{}'::jsonb) returning id`,
    [firm, doc.documentId],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'invoice.total','RM 100.00',1.0)`,
    [firm, ext.rows[0].id],
  );
  const extract = await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1 });
  assert.ok(Array.isArray(extract.extractions) && extract.extractions.length >= 1, "extractions[] must be present");
  for (const e of extract.extractions) {
    assert.ok("extracted_at" in e, `every extraction entry must carry extracted_at (got keys ${Object.keys(e)})`);
    assert.ok(e.extracted_at, "extracted_at must be non-null on a done extraction");
  }
  assert.ok(Array.isArray(extract.regions) && extract.regions.length >= 1, "regions[] must be present");
  for (const r of extract.regions) {
    assert.ok("extracted_at" in r, `every region entry must carry extracted_at (got keys ${Object.keys(r)})`);
  }
});

test("f-a1.p M14: a witness-kind envelope is EXCLUDED from the budgeted set (envelope_text stays '') while region coverage does NOT shrink for the ocr extraction beside it", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const doc = await filedDocument(users.alice, { firm, client: clients.A1 });

  // An ocr extraction with a real region, plus its OWN sizable envelope.
  const ocrEnvelope = JSON.stringify({ content: "x".repeat(500) });
  const ocrExt = await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,envelope)
     values($1,$2,'clara-fixture:x-a1p-ocr','ocr',1,'done',$3::jsonb) returning id`,
    [firm, doc.documentId, ocrEnvelope],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'invoice.total','RM 250.00',1.0)`,
    [firm, ocrExt.rows[0].id],
  );

  const baseline = await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1, maxChars: 2000 });
  const baselineRegionIds = new Set((baseline.regions ?? []).map((r) => r.id));

  // A LARGE witness-kind envelope lands beside it -- large enough to dominate a tight
  // char budget if it were NOT excluded.
  const witnessEnvelope = JSON.stringify({ content: "y".repeat(5000) });
  await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,envelope)
     values($1,$2,'llm-openai:gpt-5.1:vision','llm_vision_facts',1,'done',$3::jsonb)`,
    [firm, doc.documentId, witnessEnvelope],
  );

  const after = await getDocumentExtract(users.alice, { document: doc.documentId, client: clients.A1, maxChars: 2000 });
  const afterRegionIds = new Set((after.regions ?? []).map((r) => r.id));

  assert.ok(afterRegionIds.size >= baselineRegionIds.size, `region coverage must not shrink after a witness persist (before=${baselineRegionIds.size}, after=${afterRegionIds.size})`);
  for (const id of baselineRegionIds) {
    assert.ok(afterRegionIds.has(id), `region ${id} present before the witness persist must still be present after it`);
  }

  const witnessEntry = after.extractions.find((e) => e.engine_kind === "llm_vision_facts");
  assert.ok(witnessEntry, "the witness extraction entry must still appear in extractions[]");
  assert.equal(witnessEntry.envelope_text, "", "the witness envelope's text must be starved to '' -- excluded from the budgeted set (M14)");

  const ocrEntry = after.extractions.find((e) => e.engine_kind === "ocr");
  assert.ok(ocrEntry && ocrEntry.envelope_text.length > 0, "the ocr envelope must still be published (not excluded) and non-empty within budget");
});
