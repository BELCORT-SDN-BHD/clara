// Migration 0024 — clara.fail_classify, the classify lane's missing DB terminal-fail path
// (ADR-030 deferred hardening; see 0024_fail_classify.sql's own header for the gap it closes).
// CONTRACT-BLIND in the a21 sense is not applicable here (0024 postdates the contract-blind
// lane's cutoff); this file reads the migration directly, like x1-*/x5-* do for their slice.
//
// READINESS: the 0021+ discipline — every cell FAILS loudly against a 23-migration database
// rather than skipping, so a green battery against a prestate missing the verb proves nothing.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, firmOf, endPool,
  printLaneNotes, noteLane, buildWorld, grantConsent,
  classifyDocument, docKind, docTasks, roleCanExecute, fnSource,
  filedDocument, claimTask, seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask,
} from "./a21-helpers.mjs";
// The generic two-session forced-schedule driver (X7 law: prove the block via
// pg_blocking_pids before releasing, the x1/rig-docs-race precedent) — for the
// deterministic fail_classify <-> classify_document lock-order cells below.
import { holdThenContend } from "./rig-docs-race.mjs";

const CLASSIFY_ENGINE_ID = "clara-classify-llm:v1";

let has0024 = false;
let world = null;

async function has24() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0024_'");
    return r.rows.length > 0;
  } catch { return false; }
}

before(async () => {
  has0024 = await has24();
  if (has0024) {
    world = await buildWorld();
    for (const c of [world.clients.A1]) {
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  } else {
    noteLane("0024 absent — x-fail-classify battery FAILS loudly rather than skipping");
  }
});
after(async () => { printLaneNotes("x-fail-classify"); await endPool(); });

function requireReady() {
  if (!has0024) {
    throw new Error(
      "0024 NOT applied (clara.schema_migrations has no '0024_%' row) — clara.fail_classify "
      + "does not exist. This battery is REQUIRED to fail against the 23-migration prestate.");
  }
}

/** fail_classify(p_task, p_reason, p_op_key), called as the runtime lane. */
async function failClassify(task, { reason = "engine_error", opKey } = {}) {
  const specs = [{ name: "p_task" }, { name: "p_reason" }, { name: "p_op_key" }];
  const r = await roleQuery(ROLES.runtime, namedCall("fail_classify", specs),
    [task, reason, opKey === undefined ? opk("failclassify") : opKey]);
  return r.rows[0].result;
}

/** A filed, unclassified pdf document with a citable OCR layout region, so the facts gate
 *  routes it through 'classify' first (the a21-classifier-gate pdfDoc(kind=null) shape). */
async function pdfDocUnclassified(client) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  return seedCitedDocument(sub, { firm, client });
}

/** Drive a document to a RUNNING classify task (queued -> claimed), via the same
 *  claim_document_processing_task the classify consumer calls (egress-hold does not apply to
 *  the classify lane — classify.mjs L140-142 claims with p_egress_approved=false). */
async function runningClassifyTask(client) {
  const cited = await pdfDocUnclassified(client);
  await enqueueInvoiceFacts(cited.documentId);
  const rows = await docTasks(cited.documentId);
  const task = rows.find((t) => t.lane === "classify");
  assert.ok(task, "mandatory setup: a classify task was enqueued for the NULL-kind document");
  const claimed = await claimTask(task.id, { egressApproved: false });
  return { document: cited, taskId: task.id, claimed };
}

test("META x-fail-classify: migration 0024 present + clara.fail_classify exists", async (t) => {
  if (!has0024) { t.skip("0024 not applied"); return; }
  const mig = await rootQuery("select version from clara.schema_migrations where version ~ '^0024_'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0024_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);
  assert.equal(await roleCanExecute("clara_runtime", "fail_classify"), true, "clara.fail_classify exists and clara_runtime may EXECUTE it");
});

// ===========================================================================
// Grants — clara_runtime only, mirroring fail_invoice_facts.
// ===========================================================================

test("fail_classify EXECUTE is clara_runtime ONLY — human/agent/wake lanes all denied 42501", async () => {
  requireReady();
  for (const role of ["clara_authenticated", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive"]) {
    assert.equal(await roleCanExecute(role, "fail_classify"), false, `${role} may NOT execute fail_classify`);
  }
  await assert.rejects(
    () => roleQuery(ROLES.agentRo, "select clara.fail_classify(p_task => gen_random_uuid(), p_reason => 'engine_error', p_op_key => $1)", [opk("denied")]),
    (e) => e.code === "42501",
    "the agent role is denied fail_classify behaviorally (42501)",
  );
  await assert.rejects(
    () => humanQuery(world.users.alice, "select clara.fail_classify(p_task => gen_random_uuid(), p_reason => 'engine_error', p_op_key => $1)", [opk("denied2")]),
    (e) => e.code === "42501",
    "a human caller is denied fail_classify behaviorally (42501) — this is a machine-only terminal writer",
  );
});

// ===========================================================================
// The core cell: a poisoned RUNNING classify task -> terminal failed with error_code.
// ===========================================================================

test("a poisoned classify task is terminally failed: status='failed', error_code set, finished_at set, audited, document.classify_failed emitted", async () => {
  requireReady();
  const client = world.clients.A1;
  const { document, taskId } = await runningClassifyTask(client);
  const before = (await docTasks(document.documentId)).find((x) => x.id === taskId);
  assert.equal(before.status, "running", "mandatory setup: the classify task is RUNNING before fail_classify");

  const receipt = await failClassify(taskId, { reason: "engine_error" });
  assert.equal(receipt.status, "failed", "the receipt reports failed");
  assert.equal(receipt.reason, "engine_error", "the receipt carries the classified error_code");

  const after = (await docTasks(document.documentId)).find((x) => x.id === taskId);
  assert.equal(after.status, "failed", "the task row is terminal failed");
  assert.equal(after.error_code, "engine_error", "error_code is stamped");
  assert.ok(after.finished_at, "finished_at is stamped");

  const audit = await rootQuery(
    "select 1 from clara.audit_log where fn='fail_classify' and args->>'task' = $1 limit 1",
    [taskId],
  );
  assert.ok(audit.rows.length, "fail_classify audits the call");

  const ev = await rootQuery(
    "select 1 from clara.domain_events where event_type='document.classify_failed' and payload->>'task_id' = $1 limit 1",
    [taskId],
  );
  assert.ok(ev.rows.length, "document.classify_failed is emitted on the spine");
});

test("an unrecognized reason is honestly normalized to 'engine_error' rather than raising or lying", async () => {
  requireReady();
  const client = world.clients.A1;
  const { taskId } = await runningClassifyTask(client);
  const receipt = await failClassify(taskId, { reason: "not_a_real_code" });
  assert.equal(receipt.reason, "engine_error", "an unrecognized reason defaults to engine_error (never raises, never stores the raw string)");
});

// ===========================================================================
// Replay idempotency — the op-key path AND the task-state path.
// ===========================================================================

test("replay under the SAME op_key returns the identical receipt (no second audit/event row)", async () => {
  requireReady();
  const client = world.clients.A1;
  const { taskId } = await runningClassifyTask(client);
  const key = opk("replay-same");
  const r1 = await failClassify(taskId, { reason: "timeout", opKey: key });
  const r2 = await failClassify(taskId, { reason: "timeout", opKey: key });
  assert.deepEqual(r1, r2, "the same op_key replays the identical receipt");
  const audits = await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='fail_classify' and args->>'task' = $1",
    [taskId],
  );
  assert.equal(audits.rows[0].n, 1, "the op_key dedupe means only ONE audit row exists, not two");
});

test("a SECOND call under a DIFFERENT op_key on an already-failed task returns the honest terminal state (replayed:true), never CLR16", async () => {
  requireReady();
  const client = world.clients.A1;
  const { taskId } = await runningClassifyTask(client);
  await failClassify(taskId, { reason: "attempt_cap", opKey: opk("first") });
  const second = await failClassify(taskId, { reason: "internal", opKey: opk("second-different-key") });
  assert.equal(second.status, "failed", "the honest terminal state is returned");
  assert.equal(second.reason, "attempt_cap", "the ORIGINAL error_code survives — a second call cannot rewrite an already-terminal reason");
  assert.equal(second.replayed, true, "the receipt is marked replayed");
});

// ===========================================================================
// Refusal shapes.
// ===========================================================================

test("op_key is required: null/blank raises CLR10", async () => {
  requireReady();
  const client = world.clients.A1;
  const { taskId } = await runningClassifyTask(client);
  await assert.rejects(
    () => roleQuery(ROLES.runtime, "select clara.fail_classify(p_task => $1, p_reason => 'engine_error', p_op_key => null)", [taskId]),
    (e) => e.code === "CLR10",
    "a null op_key raises CLR10",
  );
});

test("a non-classify task (invoice_facts lane) is refused CLR16 — fail_classify is lane-scoped", async () => {
  requireReady();
  const client = world.clients.A1;
  const sub = world.users.alice;
  const firm = await firmOf(client);
  const doc = await filedDocument(sub, { firm, client, kind: "invoice" });
  await enqueueInvoiceFacts(doc.documentId);
  const task = await invoiceFactsTask(doc.documentId);
  assert.ok(task, "mandatory setup: an invoice_facts task exists");
  await assert.rejects(
    () => failClassify(task.id, { opKey: opk("wrong-lane") }),
    (e) => e.code === "CLR16",
    "fail_classify refuses a task from a different lane",
  );
});

test("a QUEUED (never claimed) classify task is refused CLR16 — fail_classify requires running", async () => {
  requireReady();
  const client = world.clients.A1;
  const doc = await pdfDocUnclassified(client);
  await enqueueInvoiceFacts(doc.documentId);
  const rows = await docTasks(doc.documentId);
  const queuedTask = rows.find((x) => x.lane === "classify" && x.status === "queued");
  assert.ok(queuedTask, "mandatory setup: a QUEUED classify task exists (never claimed)");
  await assert.rejects(
    () => failClassify(queuedTask.id, { opKey: opk("queued-refuse") }),
    (e) => e.code === "CLR16",
    "fail_classify refuses a task that was never claimed to running",
  );
});

test("a nonexistent task id is refused CLR16", async () => {
  requireReady();
  await assert.rejects(
    () => failClassify("00000000-0000-0000-0000-000000000000", { opKey: opk("ghost") }),
    (e) => e.code === "CLR16",
    "an absent task id is refused CLR16 (never an existence oracle beyond the honest not-found code)",
  );
});

// ===========================================================================
// THE RACE (cross-model review finding): fail_classify opens a new way for a classify
// task to go terminal WHILE classify_document is mid-flight toward settling the SAME
// task. Both deterministic lock orders, driven for real via holdThenContend (X7 law:
// PROVE the block via pg_blocking_pids, never assume a lucky ordering) — exactly one
// terminal event must ever fire for one attempt, and the loser must refuse honestly
// rather than silently no-op past the winner's effect.
// ===========================================================================

test("RACE, lock order 1 — fail_classify holds first: classify_document blocks, then refuses honestly; the document is NEVER classified and only classify_failed fires", async () => {
  requireReady();
  const client = world.clients.A1;
  const { document, taskId } = await runningClassifyTask(client);

  const out = await holdThenContend({
    a: {
      role: ROLES.runtime,
      run: (c) => c.query(
        "select clara.fail_classify(p_task => $1, p_reason => $2, p_op_key => $3) as receipt",
        [taskId, "engine_error", opk("race1-fail")],
      ).then((r) => r.rows[0].receipt),
    },
    b: {
      role: ROLES.runtime,
      run: (c) => c.query(
        "select clara.classify_document(p_document => $1, p_kind => $2, p_confidence => $3, p_engine_id => $4, p_op_key => $5) as receipt",
        [document.documentId, "invoice", 0.95, CLASSIFY_ENGINE_ID, opk("race1-classify")],
      ).then((r) => r.rows[0].receipt),
    },
  });

  assert.ok(out.provedBlocked, "classify_document genuinely BLOCKED behind fail_classify's row lock (pg_blocking_pids proved it) — not a lucky ordering");
  assert.equal(out.a.ok, true, `fail_classify (the lock holder) should succeed: ${out.a.message ?? ""}`);
  assert.equal(out.a.receipt?.status, "failed", "fail_classify's receipt reports failed");
  assert.equal(out.b.ok, false, "classify_document (the contender) must NOT succeed once its task already failed");
  assert.equal(out.b.code, "CLR16", `classify_document should refuse CLR16 rather than silently classifying past the loss (got ${out.b.code}: ${out.b.message})`);

  const after = (await docTasks(document.documentId)).find((x) => x.id === taskId);
  assert.equal(after.status, "failed", "the task stays terminally failed");
  const verdict = await rootQuery(
    "select 1 from clara.document_extractions where document_id=$1 and engine_kind='doc_classify' and engine_id=$2",
    [document.documentId, CLASSIFY_ENGINE_ID],
  );
  assert.equal(verdict.rows.length, 0, "NO doc_classify verdict was written — the loser's refusal is honest, not a silent partial effect");
  assert.equal(await docKind(document.documentId), null, "document_kind was never set — the document was never classified by the losing call");
  const classifiedEv = await rootQuery(
    "select 1 from clara.domain_events where event_type='document.classified' and document_id=$1", [document.documentId],
  );
  assert.equal(classifiedEv.rows.length, 0, "document.classified never fires for this race");
  const failedEv = await rootQuery(
    "select 1 from clara.domain_events where event_type='document.classify_failed' and payload->>'task_id'=$1", [taskId],
  );
  assert.equal(failedEv.rows.length, 1, "exactly ONE document.classify_failed fires — one terminal event for one attempt");
});

test("RACE, lock order 2 — classify_document holds first: fail_classify blocks, then refuses honestly; the document IS classified and only classified fires", async () => {
  requireReady();
  const client = world.clients.A1;
  const { document, taskId } = await runningClassifyTask(client);

  const out = await holdThenContend({
    a: {
      role: ROLES.runtime,
      run: (c) => c.query(
        "select clara.classify_document(p_document => $1, p_kind => $2, p_confidence => $3, p_engine_id => $4, p_op_key => $5) as receipt",
        [document.documentId, "invoice", 0.95, CLASSIFY_ENGINE_ID, opk("race2-classify")],
      ).then((r) => r.rows[0].receipt),
    },
    b: {
      role: ROLES.runtime,
      run: (c) => c.query(
        "select clara.fail_classify(p_task => $1, p_reason => $2, p_op_key => $3) as receipt",
        [taskId, "engine_error", opk("race2-fail")],
      ).then((r) => r.rows[0].receipt),
    },
  });

  assert.ok(out.provedBlocked, "fail_classify genuinely BLOCKED behind classify_document's row lock (pg_blocking_pids proved it) — not a lucky ordering");
  assert.equal(out.a.ok, true, `classify_document (the lock holder) should succeed: ${out.a.message ?? ""}`);
  assert.equal(out.a.receipt?.kind_set, true, "classify_document's receipt reports the kind was set");
  assert.equal(out.b.ok, false, "fail_classify (the contender) must NOT succeed once its task already settled done");
  assert.equal(out.b.code, "CLR16", `fail_classify should refuse CLR16 rather than resurrecting a settled task (got ${out.b.code}: ${out.b.message})`);

  const after = (await docTasks(document.documentId)).find((x) => x.id === taskId);
  assert.equal(after.status, "done", "the task stays settled done");
  assert.equal(await docKind(document.documentId), "invoice", "the document WAS classified by the winning call");
  const failedEv = await rootQuery(
    "select 1 from clara.domain_events where event_type='document.classify_failed' and payload->>'task_id'=$1", [taskId],
  );
  assert.equal(failedEv.rows.length, 0, "document.classify_failed never fires for this race");
  const classifiedEv = await rootQuery(
    "select 1 from clara.domain_events where event_type='document.classified' and document_id=$1", [document.documentId],
  );
  assert.equal(classifiedEv.rows.length, 1, "exactly ONE document.classified fires — one terminal event for one attempt");
});

// ===========================================================================
// The happy classify path stays byte-unchanged: classify_document still settles a
// RUNNING task to 'done' exactly as before — fail_classify does not touch that branch.
// ===========================================================================

test("the happy classify path is untouched: classify_document still settles a running task to done, sets the kind, and a subsequently-failed task never resurrects", async () => {
  requireReady();
  const client = world.clients.A1;
  const { document, taskId } = await runningClassifyTask(client);
  await classifyDocument({ document: document.documentId, kind: "invoice", confidence: 0.93 });
  const settled = (await docTasks(document.documentId)).find((x) => x.id === taskId);
  assert.equal(settled.status, "done", "classify_document still settles the claimed task to done (fail_classify never touches this path)");
  assert.equal(await docKind(document.documentId), "invoice", "the kind is still set by classify_document");
  // A done task can never be terminal-failed after the fact — fail_classify requires 'running'.
  await assert.rejects(
    () => failClassify(taskId, { opKey: opk("post-done") }),
    (e) => e.code === "CLR16",
    "fail_classify refuses a task that already settled done — it is not a second settle path",
  );
});

test("persist_document_extraction's classify-lane refusal is untouched: it still refuses to settle a classify task itself", async () => {
  requireReady();
  const client = world.clients.A1;
  const { taskId } = await runningClassifyTask(client);
  const src = await fnSource("persist_document_extraction");
  assert.match(src, /classify tasks are settled by classify_document/, "persist_document_extraction's classify refusal message is still present");
  await assert.rejects(
    () => roleQuery(ROLES.runtime,
      "select clara.persist_document_extraction(p_task => $1, p_status => 'failed', p_page_count => 0, p_envelope => '{}'::jsonb, p_regions => '[]'::jsonb, p_error_code => 'engine_error', p_vendor_op_ref => null, p_op_key => $2)",
      [taskId, opk("persist-refuse")]),
    (e) => e.code === "CLR16",
    "persist_document_extraction still refuses to settle a classify task (0024 adds a SEPARATE verb, not a widened one)",
  );
});
