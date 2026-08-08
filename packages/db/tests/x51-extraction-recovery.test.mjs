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
import { randomUUID } from "node:crypto";
import {
  ROLES, CLR, rootQuery, roleQuery, opk, endPool, buildWorld, assertRaises, firmOf,
  requestReextraction, extractedDoc, failedFactsDoc, taskRow, laneTasks, extractionsOf,
  auditArgs, holdThenContend, seedCitedDocument,
  invoiceFactsTask, claimTask, failInvoiceFacts,
  seedIntake, finalizeIntake, seedVerifiedDocument,
  markSkip, noteLane, printLaneNotes, printSkipCount,
} from "./x1-helpers.mjs";

let W = null;
let ready = false;
let has51 = false;

/** Read from the migration ledger, not from the function's existence: request_reextraction
 *  exists at 0022 and every migration since, so probing the FUNCTION would green this
 *  battery against a database that has none of 0051's behaviour. */
async function has0051() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0051_' limit 1");
    return r.rows.length > 0;
  } catch { return false; }
}

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
    ready = true;
  } catch (e) {
    noteLane(`rig-docs ensureReady failed (${e?.code ?? "?"}) — probing the live catalog as-is`);
    ready = true;
  }
  has51 = await has0051();
  if (ready && has51) W = await buildWorld();
});
after(async () => { printLaneNotes("x51-extraction-recovery"); printSkipCount("x51-extraction-recovery"); await endPool(); });

function skip51(t, msg = "0051 not applied — the extraction-recovery-door battery is dormant") {
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

test("[0051] an in-flight recovery is RETURNED, never double-queued", async (t) => {
  if (skip51(t)) return;
  const doc = await failedFactsDoc(W.users.alice, { client: W.clients.A1 });
  const first = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") });
  assert.equal(first.reused, false, "mandatory setup: the first call minted a live task");

  // A DIFFERENT op_key: op-key replay is not what protects here — the in-flight check is. The
  // new door admits the call (the FAILED v1 is still there and still the only settled
  // outcome), and the short-circuit below it answers with the live task rather than racing a
  // second one onto the same (document, engine, version, lane) key.
  const second = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("x51") });
  assert.equal(second.task_id, first.task_id, "the second request names the SAME in-flight task");
  assert.equal(second.reused, true, "…and says so honestly");
  assert.equal(second.admission, "failed_retry", "…admitted through the recovery door, as it must be");
  assert.equal((await laneTasks(doc.documentId)).length, 2, "…and no third row was created");
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

// ===========================================================================
// (e) §2 — THE INTAKE RECOVERY DOOR. Re-uploading the same file recovers a failed INGEST.
//
// The facts-lane door above is reached by a human verb; THIS one is reached by the ordinary
// duplicate-intake path, so every cell drives clara.finalize_document_intake for real and
// reads the committed rows back. The shared setup shape is the one x-lane-widen-0026's own
// P2 cell established: a verified document, a hand-planted intake task in whatever state the
// cell is about, then a SECOND intake of the same sha256 — the exact ELSE (adopted) branch.
//
// The runtime half — that a minted recovery actually gets a spool sidecar and a run — is
// proven in packages/runtime/tests/intake-recovery-unit.test.mjs and never here.
// ===========================================================================

const FIXTURE_ENGINE = "clara-fixture:v1"; // finalize_document_intake's own p_engine_id default
const AZURE_OCR = "azure-di:prebuilt-layout:2024-11-30";

/** A fresh 64-hex sha, the shape clara.documents' storage_path CHECK is written against. */
const freshSha = () => randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);

/** The ONLY error codes a terminally-failed task may carry with a NULL workflow_run_id —
 *  ck_processing_task_binding_0038's own never-claimed allowlist (0038:7304-7305). Every
 *  other failure reaches 'failed' through a CLAIMED task and keeps its run id. */
const NEVER_CLAIMED = ["budget", "attempt_cap", "skipped_kind", "consent_inactive", "statement_multi_client"];

/** Plant a processing task directly. Setup only — the product path for these states runs
 *  through the runtime workflow, which no DB rig can drive.
 *
 *  IT MUST STILL PLANT A ROW THE PRODUCT COULD PRODUCE. The first cut of this fixture did
 *  not, and the rig said so: five cells died 23514 on ck_processing_task_binding_0038
 *  (0038:7298-7306) before the door was ever exercised.
 *      (status in ('queued','held_egress') and workflow_run_id is null and started_at is null)
 *   or (status in ('running','done')      and workflow_run_id is not null and started_at is not null)
 *   or (status = 'failed' and ((workflow_run_id is not null and started_at is not null)
 *                              or (workflow_run_id is null and started_at is null
 *                                  and error_code in (<the never-claimed five>))))
 *  So 'done' and an ordinary 'failed' (engine_error, internal, …) are CLAIMED shapes: the
 *  workflow claimed the task — stamping workflow_run_id + started_at — and only then settled
 *  it. That is exactly what clara.persist_document_extraction and clara.fail_invoice_facts do,
 *  both of which refuse a task that is not already 'running'. Relaxing the fixture instead
 *  (dropping the constraint, or planting NULLs anyway) would have tested the door against a
 *  row shape the product cannot create — which proves nothing about the door.
 *
 *  `neverClaimed` is deliberately UNUSED by any cell below, and that is a measurement rather
 *  than an oversight: none of the five never-claimed codes is reachable on an INGEST lane
 *  today. `budget` comes from _reserve_processing_call, which is invoice_facts-only; the
 *  claim-time attempt cap is scoped to ('invoice_facts','statement_facts') (0038:6907); and
 *  skipped_kind / consent_inactive / statement_multi_client are the statement router's codes.
 *  The option and its guard exist so that the day one becomes reachable, a cell can plant it
 *  and gets a named refusal instead of a raw 23514 — the door itself already admits it, since
 *  its predicate reads status alone and never the run id. */
async function plantTask(firm, document, { engine = FIXTURE_ENGINE, version = 1, lane = "ocr", status, error = null, neverClaimed = false } = {}) {
  if (status === "failed" && neverClaimed && !NEVER_CLAIMED.includes(error)) {
    throw new Error(`plantTask: '${error}' is not one of the never-claimed codes ${NEVER_CLAIMED.join("/")} — a failed row with no run id would violate ck_processing_task_binding_0038`);
  }
  const claimed = status === "running" || status === "done" || (status === "failed" && !neverClaimed);
  const terminal = status === "done" || status === "failed";
  const now = new Date().toISOString();
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,workflow_run_id,started_at,finished_at,attempt_count)
     values ($1,$2,$3,'{}'::jsonb,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [firm, document, engine, version, lane, status, error,
      claimed ? `rig-run-${randomUUID()}` : null,
      claimed ? now : null,
      terminal ? now : null,
      claimed ? 1 : 0]);
  return r.rows[0].id;
}

/** A verified document plus a SECOND intake of the same bytes, finalized — i.e. the adopted
 *  branch, driven for real. `plant` receives (firm, documentId) and sets up the lane state
 *  the cell is about. Returns { documentId, receipt }. */
async function reIngest(firm, plant, { lane = null, engine = null } = {}) {
  const sha = freshSha();
  const seed = await seedVerifiedDocument({ firm, sha256: sha, mime: "application/pdf" });
  await plant(firm, seed.documentId);
  // uploadedBy is MANDATORY, not decoration: the 0007 attribution trigger resolves an
  // intake's firm from `firm_memberships where user_id = new.uploaded_by and status='active'`
  // (0007:440-443) and raises CLR11 'uploader has no matching intake firm' when that read
  // comes back empty — which a NULL uploader always does. The first cut of this fixture
  // omitted it and the rig caught it. Same binding every other intake seed in
  // rig-docs-fixtures.mjs uses.
  const dup = await seedIntake({
    firm, uploadedBy: W.users.alice, sha256: sha, status: "verified", mime: "application/pdf",
    storageKey: `firms/${firm}/docs/${sha}.pdf`,
  });
  // The explicit-lane cells bypass the adaptive wrapper so they can pass p_lane themselves.
  const receipt = (lane || engine)
    ? (await roleQuery(ROLES.runtime,
        `select clara.finalize_document_intake(p_intake=>$1, p_engine_id=>$2, p_lane=>$3,
           p_version_n=>1, p_op_key=>$4) as r`,
        [dup, engine ?? FIXTURE_ENGINE, lane ?? "ocr", opk("x51fin")])).rows[0].r
    : await finalizeIntake({ intake: dup });
  return { documentId: seed.documentId, sha, receipt };
}

test("[0051 §2] a failed INGEST + a re-upload of the same bytes: adopted, and a recovery attempt is minted", async (t) => {
  if (skip51(t)) return;
  const firm = W.firms.A;
  let failedTask = null;
  const { documentId, sha, receipt } = await reIngest(firm, async (f, d) => {
    failedTask = await plantTask(f, d, { status: "failed", error: "engine_error" });
  });

  // The ORIGINAL exhibit shape: exactly one ingest task, terminal, nothing else.
  const frozen = await taskRow(failedTask);
  assert.equal(frozen.status, "failed", "mandatory setup: the document's only ingest task is TERMINAL");

  assert.equal(receipt.status, "adopted",
    "the receipt still says ADOPTED — the document really was adopted by sha256, and a "
    + "recovery does not change that fact for any existing reader");
  assert.ok(receipt.recovery, "…and it now carries a recovery fragment");
  assert.equal(receipt.recovery.lane, "ocr", "…on the ingest lane");
  assert.equal(receipt.recovery.version_n, 2, "…at version max+1");
  assert.equal(receipt.recovery.engine_id, FIXTURE_ENGINE,
    "…on the SAME engine the failed attempt used, so the lane/engine CHECK holds and the chain composes");
  assert.equal(receipt.recovery.sha256, sha, "…carrying the document's own sha256");
  assert.equal(receipt.recovery.mime_type, "application/pdf", "…and its mime");
  assert.equal(receipt.recovery.storage_path, `firms/${firm}/docs/${sha}.pdf`,
    "…and the DOCUMENT row's storage_path, which ck_documents_storage_path_v2 pins to the "
    + "content-addressed template the re-uploading runtime just computed for these same bytes");
  assert.equal(receipt.task_id, receipt.recovery.task_id,
    "the receipt's task_id names the LIVE task, not the dead one it was minted from");

  const tasks = await laneTasks(documentId, "ocr");
  assert.equal(tasks.length, 2, "exactly one new row exists");
  const fresh = tasks.find((x) => x.id === receipt.recovery.task_id);
  assert.equal(fresh.status, "queued", "the committed recovery row is queued");
  assert.equal(fresh.version_n, 2, "…at the next version");
  assert.equal(fresh.error_code, null, "…and carries no error code");

  // ADR-062's binding requirement, over the WHOLE row rather than a chosen column.
  assert.deepEqual(await taskRow(failedTask), frozen,
    "the terminally-failed row is byte-identical afterwards — a SIBLING was minted, the "
    + "failure was never reopened (which _tf_processing_task_update would refuse anyway)");
});

test("[0051 §2] a HEALTHY adoption is untouched — no recovery, no new task, and no `recovery` key at all", async (t) => {
  if (skip51(t)) return;
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(firm, (f, d) => plantTask(f, d, { status: "done" }));

  assert.equal(receipt.status, "adopted", "a healthy duplicate still adopts");
  assert.equal(receipt.recovery, undefined,
    "…and the receipt carries NO recovery key whatsoever — not even a null one. The key is "
    + "appended conditionally precisely so that every intake receipt in the product stays "
    + "byte-identical to what it was");
  assert.equal((await laneTasks(documentId, "ocr")).length, 1,
    "…and nothing was minted: this is the overwhelmingly common path and it must not change");
});

test("[0051 §2] an IN-FLIGHT ingest blocks the recovery even when the newest task on its own engine failed", async (t) => {
  if (skip51(t)) return;
  // The condition-(3) cell specifically. The newest task on (clara-fixture:v1, ocr) IS failed,
  // so condition (2) is satisfied — but another task on the SAME LANE under a DIFFERENT engine
  // is queued. That is why the in-flight guard is deliberately wider than the failed-task read:
  // an in-flight task under any engine would still egress, and two live tasks on one ingest
  // lane is a double vendor read.
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(firm, async (f, d) => {
    await plantTask(f, d, { status: "failed", error: "engine_error" });
    await plantTask(f, d, { engine: AZURE_OCR, version: 2, status: "queued" });
  });

  assert.equal(receipt.status, "adopted", "still adopted");
  assert.equal(receipt.recovery, undefined,
    "…and NO recovery was minted while a task on that lane is still in flight");
  assert.equal((await laneTasks(documentId, "ocr")).length, 2, "…and no third row was created");
});

test("[0051 §2] a QUEUED newest task is not a failure — nothing is minted", async (t) => {
  if (skip51(t)) return;
  // The condition-(2) cell. 'queued' is not 'failed', and the door reads the task POSITIVELY:
  // an admission phrased as "no successful ingest" would fire here, on a document whose
  // pipeline is simply still running.
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(firm, (f, d) => plantTask(f, d, { status: "queued" }));
  assert.equal(receipt.recovery, undefined, "an in-flight first attempt is not a recovery case");
  assert.equal((await laneTasks(documentId, "ocr")).length, 1, "…and nothing was minted");
});

test("[0051 §2] a failed FACTS extraction on a healthy ingest gets NO ingest recovery — that is §1's verb", async (t) => {
  if (skip51(t)) return;
  // The boundary between the two doors, asserted rather than assumed. This document's INGEST
  // succeeded; what failed is its invoice_facts pass. Re-uploading the bytes must not silently
  // re-buy an OCR read — the facts failure is recovered by request_reextraction, under a
  // bookkeeper's hand and an audited reason.
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(firm, async (f, d) => {
    await plantTask(f, d, { status: "done" });
    await plantTask(f, d, { engine: "azure-di:prebuilt-invoice:2024-11-30", version: 1, lane: "invoice_facts", status: "failed", error: "internal" });
  });

  assert.equal(receipt.recovery, undefined,
    "the intake door never looks at a facts lane — a failed invoice_facts attempt is "
    + "request_reextraction's population, not a re-upload's");
  assert.equal((await laneTasks(documentId, "ocr")).length, 1, "…the ingest lane is untouched");
  assert.equal((await laneTasks(documentId, "invoice_facts")).length, 1, "…and so is the facts lane");
});

test("[0051 §2] the door is gated to the INGEST lanes: a facts lane passed explicitly mints nothing", async (t) => {
  if (skip51(t)) return;
  // Condition (1), driven directly. packages/runtime/lib/intake-lanes.mjs never produces a
  // facts lane here, so this argument is only reachable by a caller that constructs it — and
  // the gate is the wall for exactly that. Without it, a caller could turn a re-upload into a
  // silent, unaudited facts re-extraction that bypasses request_reextraction's bookkeeper
  // floor entirely.
  const firm = W.firms.A;
  const { documentId, receipt } = await reIngest(
    firm,
    (f, d) => plantTask(f, d, { engine: "azure-di:prebuilt-invoice:2024-11-30", version: 1, lane: "invoice_facts", status: "failed", error: "internal" }),
    { lane: "invoice_facts", engine: "azure-di:prebuilt-invoice:2024-11-30" },
  );
  assert.equal(receipt.recovery, undefined,
    "a facts lane is refused by the door's own gate, however it is reached");
  assert.equal((await laneTasks(documentId, "invoice_facts")).length, 1, "…and no facts task was minted");
});

test("[0051 §2] the recovery door opened no new reach — finalize_document_intake stays runtime-only", async (t) => {
  if (skip51(t)) return;
  // The mirror of §1's cost-bound cell. This part deliberately avoids widening anybody's
  // privileges — that is WHY it lives in finalize_document_intake at all rather than in a new
  // verb granted to the runtime. Asserted here rather than inherited from the migration tail,
  // because a tail runs once at apply time and a cell runs on every database the suite meets.
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    if (!role) continue;
    const err = await roleQuery(role,
      "select clara.finalize_document_intake($1,null,'clara-fixture:v1','{}'::jsonb,1,'ocr',null,null,$2)",
      [randomUUID(), opk("x51fin")]).then(() => null, (e) => e);
    assert.ok(err, `${role} must not be able to execute finalize_document_intake`);
    assert.equal(err.code, "42501", `${role} is refused at the GRANT, not inside the body`);
  }
  const allow = await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where function_name='finalize_document_intake'");
  assert.equal(allow.rows[0].n, 0, "…and no wake allowlist row admits it for any wake kind");
});
