// x51 rig — migration 0051: THE EXTRACTION-RECOVERY DOOR (§7-A finding F6 / task #31 +
// the ADR-062 registration, ONE item per wave-e-contract E-R1).
//
// THE GAP THESE CELLS CLOSE, in the shape it was actually measured. A first invoice_facts
// attempt that dies terminally had NO recovery path: docs/plan/wave-7a-acceptance-h1.md:
// 540-564 records all four doors closed on one real document (LUMINOUS, c597a24b) —
// request_reextraction refused `CLR16 no completed extraction to re-extract`, a
// content-addressed re-ingest of identical bytes ADOPTED the same document_id and spawned no
// attempt, and the terminal task row is immutable by trigger. The only thing that worked was
// re-exporting the PDF with one extra byte, which is a user workaround, not a product door.
//
// WHAT 0051 CHANGES, AND THEREFORE WHAT IS WORTH TESTING. It adds a FOURTH admission door
// ('failed_retry') as the LAST arm of request_reextraction's admission chain, reading the
// TASK table for a terminally-failed task in the document's own facts lane. It builds no new
// machinery: the version race, the in-flight short-circuit, the page budget, the audit row
// and the receipt are the ones that were already there. So these cells are weighted towards
// the two things a widening can get wrong —
//   (a) does it admit the population it was built for, WITHOUT mutating the terminal row
//       (ADR-062's binding requirement: mint a sibling, never reopen); and
//   (b) does it leave every OTHER population answering exactly what it answered before —
//       the never-extracted refusal, the in-flight short-circuit, the ordinary
//       'reextraction' door, the bookkeeper floor, and the structural cost bound (no machine
//       lane can reach the verb at all).
//
// CONTRACT-BLIND WHERE IT CAN BE: the cells name the OUTCOME a caller sees (a new queued
// task at the next version / a CLR16 refusal / the same in-flight task returned) rather than
// the internal branch that produced it. The one exception is `admission`, which is a
// deliberate part of the receipt and audit contract (0026 §G threaded it there precisely so
// a reader can tell WHICH door let a call in), so it is asserted by name.
//
// packages/db/tests/x1-reextraction.test.mjs is deliberately NOT modified by this migration.
// Its cell at :110-129 ("a document with NO completed extraction is refused") is the exact
// regression this widening must not cause, and a cell that gets edited alongside the change
// it is meant to catch has stopped being evidence. It is re-proved here independently.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, CLR, rootQuery, roleQuery, opk, endPool, buildWorld, assertRaises, firmOf,
  requestReextraction, extractedDoc, failedFactsDoc, taskRow, laneTasks, extractionsOf,
  auditArgs, holdThenContend, seedCitedDocument,
  invoiceFactsTask, claimTask, failInvoiceFacts, requireRecoveryDoor,
  markSkip, noteLane, printLaneNotes, printSkipCount,
} from "./x1-helpers.mjs";

let W = null;
let ready = false;
let has51 = false;

// The readiness gate lives in x1-helpers.mjs (`requireRecoveryDoor`) and is keyed on the
// migration's STABLE SUFFIX cross-checked against the live catalog — never on '^0051_'. A
// number-keyed gate goes silently dormant the moment the file is renumbered at merge, which
// is exactly how a battery reports 0 pass / 17 skip / exit 0 and looks green.

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
    ready = true;
  } catch (e) {
    noteLane(`rig-docs ensureReady failed (${e?.code ?? "?"}) — probing the live catalog as-is`);
    ready = true;
  }
  has51 = await requireRecoveryDoor();
  if (ready && has51) W = await buildWorld();
});
after(async () => { printLaneNotes("x51-extraction-recovery"); printSkipCount("x51-extraction-recovery"); await endPool(); });

function skip51(t, msg = "the extraction-recovery door is not applied — battery dormant") {
  if (!ready || !has51) { markSkip(); t.skip(msg); return true; }
  return false;
}

// ===========================================================================
// (a) THE ADMISSION — the population F6 is about
// ===========================================================================

test("[0051] a terminally-FAILED first extraction is admitted: a NEW attempt at version max+1", async (t) => {
  if (skip51(t)) return;
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });

  // MANDATORY SETUP, asserted rather than assumed — this is the exact live shape, and if the
  // fixture drifts off it the cell below would be testing something else entirely.
  const before_ = await laneTasks(doc.documentId);
  assert.equal(before_.length, 1, "exactly one invoice_facts task exists");
  assert.equal(before_[0].status, "failed", "…and it is TERMINAL — the state no legal transition exits");
  assert.equal(before_[0].error_code, "internal", "…with the exhibit's own error_code");
  assert.deepEqual(await extractionsOf(doc.documentId), [],
    "…and ZERO invoice_facts extractions exist: fail_invoice_facts writes no extraction row, "
    + "which is why an admission guard phrased against document_extractions could never have "
    + "admitted this document");

  const frozen = await taskRow(doc.taskId);
  const res = await requestReextraction(W.users.bob, {
    document: doc.documentId,
    reason: "the first extraction died on an engine fault; the document itself is fine",
    opKey: opk("x51"),
  });

  assert.equal(res.admission, "failed_retry", "the receipt names the door that admitted it");
  assert.equal(res.document_id, doc.documentId, "…and the document");
  assert.equal(res.status, "queued", "…and a genuinely QUEUED task, not a short-circuit receipt");
  assert.equal(res.reused, false, "…freshly minted, not a recovered in-flight task");
  assert.equal(res.version_n, before_[0].version_n + 1, "…at the next version on the lane");

  const after_ = await laneTasks(doc.documentId);
  assert.equal(after_.length, 2, "exactly one new row exists");
  const fresh = after_.find((x) => x.id === res.task_id);
  assert.equal(fresh.status, "queued", "the committed row is queued");
  assert.equal(fresh.engine_id, "azure-di:prebuilt-invoice:2024-11-30",
    "…on the SAME engine, so the version chain composes");
  assert.equal(fresh.error_code, null, "…and carries no error code");

  // ADR-062's BINDING requirement, proven over the whole row rather than a chosen column:
  // "admit a NEW attempt row per (document,lane) — NEVER mutate or reopen the terminal row."
  assert.deepEqual(await taskRow(doc.taskId), frozen,
    "the terminally-failed row is byte-identical afterwards — the recovery mints a SIBLING, "
    + "it never reopens the failure (which _tf_processing_task_update would refuse anyway)");
});

test("[0051] the audit row and the stored receipt both name the door, and the op_key replays", async (t) => {
  if (skip51(t)) return;
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  const reason = "engine fault on the only attempt — retrying the same bytes";
  const key = opk("x51");
  const res = await requestReextraction(W.users.bob, { document: doc.documentId, reason, opKey: key });

  const aud = await auditArgs("request_reextraction", "task_id", res.task_id);
  assert.ok(aud, "an audit row names the task");
  assert.equal(aud.actor, W.users.bob, "…attributed to the human who asked");
  assert.equal(aud.via_wake_kind, null, "…and to no wake lane: this verb has none");
  assert.equal(aud.args.admission, "failed_retry",
    "the audit says WHICH door admitted the call — a recovery that cannot be told apart from "
    + "an ordinary re-extraction is a diagnostic that has stopped answering the question");
  assert.equal(aud.args.reason, reason, "…and carries the human's reason");
  assert.equal(aud.args.lane, "invoice_facts", "…and the lane");

  const stored = await rootQuery(
    "select result from clara.op_receipts where fn='request_reextraction' and result->>'task_id'=$1",
    [res.task_id]);
  assert.equal(stored.rows.length, 1, "one stored receipt names the task");
  assert.equal(stored.rows[0].result.admission, "failed_retry", "…and it is complete, door included");

  const replay = await requestReextraction(W.users.bob, { document: doc.documentId, reason, opKey: key });
  assert.deepEqual(replay, res, "the same op_key returns the stored receipt byte-identically");
  assert.equal((await laneTasks(doc.documentId)).length, 2, "…and queued nothing further");
});

// ===========================================================================
// (b) THE REFUSALS THAT MUST SURVIVE — a widening is only as good as what it still refuses
// ===========================================================================

test("[0051] a document that has never been extracted is STILL refused — the queued backstop is not a failure", async (t) => {
  if (skip51(t)) return;
  // The independent re-proof of x1-reextraction.test.mjs:110-129, which this migration is
  // forbidden to edit. The distinction the new door rests on: filing an invoice-kind document
  // leaves a QUEUED lane task (the 0009 coding-time backstop), and 'queued' is not 'failed' —
  // so the door's positive read finds nothing and the chain still falls to the raise. If the
  // widening had been phrased as "no done extraction exists" (an ABSENCE) this cell would go
  // green in the wrong direction and the ordinary first-extraction path would be hidden from
  // the intake receipts that own it.
  const client = W.clients.A1;
  const firm = await firmOf(client);
  const fresh = await seedCitedDocument(W.users.alice, { firm, client, kind: "invoice" });
  const before_ = await laneTasks(fresh.documentId);
  assert.equal(before_.filter((x) => x.status === "failed").length, 0,
    "mandatory setup: this document's lane holds no FAILED task");

  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: fresh.documentId, opKey: opk("x51") }),
    "re-extracting a document that has never been extracted");
  assert.equal((await laneTasks(fresh.documentId)).length, before_.length,
    "…and the verb queued nothing");
});

test("[0051] a document whose lane holds a DONE extraction takes the ordinary door, not the recovery one", async (t) => {
  if (skip51(t)) return;
  // The placement proof. 'failed_retry' is the LAST arm, so a document that ALSO carries a
  // successful extraction must keep answering 'reextraction' — otherwise the widening would
  // have silently relabelled (and re-routed) a population that already worked.
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  const first = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "re-read the total", opKey: opk("x51") });
  assert.equal(first.admission, "reextraction", "mandatory setup: the ordinary door admitted it");

  // Now kill that second attempt, so the lane holds BOTH a done extraction and a failed task.
  const t2 = await invoiceFactsTask(doc.documentId);
  await claimTask(t2.id, { egressApproved: true });
  await failInvoiceFacts(t2.id, "engine_error");
  assert.equal((await laneTasks(doc.documentId)).filter((x) => x.status === "failed").length, 1,
    "mandatory setup: a terminally-failed task now exists in the lane");
  assert.equal((await extractionsOf(doc.documentId)).filter((x) => x.status === "done").length, 1,
    "…alongside the still-live done extraction");

  const second = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "and again", opKey: opk("x51") });
  assert.equal(second.admission, "reextraction",
    "the ordinary door is still reached FIRST — the recovery door is additive, never a "
    + "reroute of a population that already had a path");
});

test("[0051] NEWEST, not ANY: once a recovery is queued the door REFUSES rather than re-admitting", async (t) => {
  if (skip51(t)) return;
  // REPLACES the cell that blessed "any historical failure" admission (cross-model finding #5,
  // CONFIRMED). The first cut asked `exists(... status='failed')`, so after a recovery was
  // minted a second call was STILL admitted here — because v1 was failed — and only the
  // in-flight short-circuit further down stopped it double-minting. An admission that depends
  // on a later guard for its safety is the wrong admission. The door now reads the LANE's
  // NEWEST task, which is the queued recovery, and refuses.
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  const first = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") });
  assert.equal(first.admission, "failed_retry", "mandatory setup: the first call was admitted and minted");
  assert.equal(first.reused, false, "…a live task");

  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") }),
    "a second call while the recovery is still queued");
  assert.equal((await laneTasks(doc.documentId)).length, 2, "…and no third row was created");
});

test("[0051] NEWEST, not ANY: a stale failure under a newest-DONE task never re-admits", async (t) => {
  if (skip51(t)) return;
  // The second half of finding #5, and the one that matters most: in a schema-valid state
  // where the newest task is 'done' but its extraction row is absent, "any historical failure"
  // would mint over it. The door must fail closed on the POSITIVE newest-'done' read instead.
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  const firm = (await rootQuery("select firm_id from clara.documents where id=$1", [doc.documentId])).rows[0].firm_id;
  const v = Math.max(...(await laneTasks(doc.documentId)).map((x) => x.version_n)) + 1;
  await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at,finished_at,attempt_count)
     values ($1,$2,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,$3,'invoice_facts','done','rig-run',now(),now(),1)`,
    [firm, doc.documentId, v]);
  assert.deepEqual(await extractionsOf(doc.documentId), [],
    "mandatory setup: the newest task is DONE while its extraction row is absent — schema-valid, and "
    + "exactly the inconsistent state an any-historical-failure door would mint over");

  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") }),
    "re-extracting when the lane's NEWEST task succeeded");
  assert.equal((await laneTasks(doc.documentId)).length, 2, "…and nothing was minted");
});

test("[0051] the kind and mime gates are untouched — an unclassified document is still refused", async (t) => {
  if (skip51(t)) return;
  // This is also the honest boundary of what F6 closes. ADR-062's OTHER half — a failed
  // INGEST, whose document never got classified at all — is refused HERE, at the kind gate,
  // before the admission chain is ever reached. 0051 deliberately does not widen this gate
  // (its header records why: the recovered ingest task would be undispatchable on the
  // deployed runtime image). The cell pins that boundary so nobody reads F6 as closed.
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  await rootQuery("update clara.documents set document_kind=null where id=$1", [doc.documentId]);
  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") }),
    "recovering a failed attempt on a document with no classified kind");

  await rootQuery("update clara.documents set document_kind='invoice', mime_type='text/plain' where id=$1",
    [doc.documentId]);
  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") }),
    "…and one whose mime reaches no facts lane");

  await rootQuery("update clara.documents set mime_type='application/pdf' where id=$1", [doc.documentId]);
  const ok = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") });
  assert.equal(ok.admission, "failed_retry",
    "with kind and mime restored the same call is admitted — the gates are specific, not a "
    + "blanket refusal the new door happened to route around");
});

// ===========================================================================
// (c) THE FLOOR AND THE COST BOUND — a widened ADMISSION must not widen the REACH
// ===========================================================================

test("[0051] the recovery door keeps the BOOKKEEPER floor: a viewer is refused", async (t) => {
  if (skip51(t)) return;
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  await assertRaises(CLR.authz,
    () => requestReextraction(W.users.carol, { document: doc.documentId, opKey: opk("x51") }),
    "carol (viewer) recovering a failed extraction");
  const ok = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") });
  assert.equal(ok.admission, "failed_retry", "the same call from a bookkeeper is admitted — a floor, not a deny");
});

test("[0051] a document in ANOTHER firm is an honest refusal, not a silent no-op", async (t) => {
  if (skip51(t)) return;
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  const before_ = (await laneTasks(doc.documentId)).length;
  await assertRaises(CLR.notFound,
    () => requestReextraction(W.users.dave, { document: doc.documentId, opKey: opk("x51") }),
    "dave (firm B) recovering firm A's failed extraction");
  assert.equal((await laneTasks(doc.documentId)).length, before_, "…and nothing was queued");
});

test("[0051] NO machine lane gained reach — the structural cost bound survives the widening", async (t) => {
  if (skip51(t)) return;
  // ADR-047 Q4 declined a numeric per-document re-extraction cap and put a STRUCTURAL bound in
  // its place: if no workflow, sweep or wake can execute the verb, none can spend Azure pages
  // in a loop. A widened admission is exactly the change that could erode that by accident —
  // a recovery door is the kind of thing someone later wants a sweep to drive — so the bound
  // is re-proved on this migration's own gate rather than inherited from 0022's cell.
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    if (!role) continue;
    const err = await roleQuery(role,
      "select clara.request_reextraction($1,'machine recovery',$2)", [doc.documentId, opk("x51")])
      .then(() => null, (e) => e);
    assert.ok(err, `${role} must not be able to execute request_reextraction`);
    assert.equal(err.code, "42501", `${role} is refused at the GRANT, not inside the body`);
  }
  const allow = await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where function_name='request_reextraction'");
  assert.equal(allow.rows[0].n, 0, "…and no wake allowlist row admits it for any wake kind");
});

// ===========================================================================
// (d) THE VERSION RACE, on the recovery population specifically
// ===========================================================================

test("[0051] the bounded retry converges on the recovery path too, under a forced conflict", async (t) => {
  if (skip51(t)) return;
  // The same forced two-session schedule x1-reextraction.test.mjs:263-321 uses for the
  // ordinary door, re-run on a document admitted through the NEW one. It earns its cost
  // because the new door reaches the retry loop by a path that loop was never exercised on:
  //   A (root)  inserts a task at version N and HOLDS it uncommitted — the shape a caller
  //             leaves behind when _reserve_processing_call raises CLR18 and marks its own
  //             row failed/budget in the same transaction;
  //   B (human) calls the verb, is ADMITTED through 'failed_retry', computes N too, and its
  //             `insert ... on conflict do nothing` BLOCKS on A's uncommitted index entry —
  //             proven via pg_blocking_pids, not inferred from timing;
  //   A commits. B wakes, finds no ACTIVE task to recover, recomputes N+1 and succeeds.
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  const firm = (await rootQuery("select firm_id from clara.documents where id=$1", [doc.documentId])).rows[0].firm_id;
  const N = Math.max(...(await laneTasks(doc.documentId)).map((x) => x.version_n)) + 1;

  const out = await holdThenContend({
    a: {
      run: (c) => c.query(
        `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
            version_n,lane,status,error_code,finished_at)
         values($1,$2,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,$3,'invoice_facts','failed','budget',now())`,
        [firm, doc.documentId, N]),
    },
    b: {
      role: ROLES.authenticated, jwtSub: W.users.bob,
      run: async (c) => (await c.query(
        "select clara.request_reextraction(p_document => $1, p_reason => $2, p_op_key => $3) as r",
        [doc.documentId, "forced conflict on the recovery path", opk("x51")])).rows[0].r,
    },
  });

  assert.ok(out.a.ok, `the holder's insert succeeded (got ${out.a.code}: ${out.a.message})`);
  assert.equal(out.provedBlocked, true,
    "the verb BLOCKED on the uncommitted conflicting version — so the retry path was genuinely "
    + "entered rather than skipped by a lucky version number");
  assert.ok(out.b.ok, `the verb succeeded after the holder committed (got ${out.b.code}: ${out.b.message})`);

  const r = out.b.receipt;
  assert.equal(r.admission, "failed_retry", "the receipt still names the recovery door");
  assert.ok(r.task_id, "…and a task — NOT the malformed {document_id, reused} shell");
  assert.equal(r.version_n, N + 1, "…at the version ABOVE the terminal winner it lost to");
  assert.equal(r.status, "queued", "…live");
  assert.equal(r.reused, false, "…and freshly minted");

  const committed = await laneTasks(doc.documentId);
  assert.equal(committed.filter((x) => x.version_n === N)[0].status, "failed",
    "the winner it lost to is the terminal budget row");
  assert.equal(committed.find((x) => x.id === r.task_id).status, "queued", "…and the verb's own task is queued");
});

