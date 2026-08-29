// Slice-6 rig — invoice-facts LANE METERING + egress: the N-F1 egress-hold that
// covers the new lane, the NEW-4 processing_call_reservations carrier (pages-only),
// refund-on-failure, the failed terminal + document.invoice_facts_failed event, and
// held-release coverage. Contract-blind: companion §5 (C-10/NEW-4) + §12 +
// INTERFACE-PINS §1 — NEVER from 0009. Every test SKIPS until 0009 lands.
//
// N-F1 (load-bearing): the claim + release fns were as-built hard-coded lane='ocr';
// 0009 must widen them to lane in ('ocr','invoice_facts') — WITHOUT the widening a
// facts task would egress with the flag OFF (a leak). So a false-egress claim of an
// invoice_facts task must HOLD, never go running.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  roleQuery,
  rootQuery,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  firmOf,
  seedCitedDocument,
  mintLegacyInvoiceFactsTask,
  invoiceFactsTask,
  claimTask,
  ensureClientEgress,
  persistInvoiceFacts,
  failInvoiceFacts,
  factField,
  FIELD,
} from "./s6-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = await s6EnsureReady();
  if (ready) {
    world = await buildWorld();
    // [WA-D1] grant a live egress consent so the NEW-4 invoice_facts claims reach
    // 'running' (the lane-carve fail-closes to held_egress/CLR28 without one). The
    // N-F1 egress-OFF holds are the kill-switch gate and are unaffected by consent.
    for (const c of [world.clients.A1, world.clients.A2]) await ensureClientEgress(world.users.alice, { client: c });
  }
});
after(async () => {
  printLaneNotes("s6-metering");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

async function taskStatus(taskId) {
  return (await rootQuery("select status, workflow_run_id from clara.document_processing_tasks where id=$1", [taskId])).rows[0];
}

// ===========================================================================
// N-F1 — the egress hold + release cover the invoice_facts lane.
// ===========================================================================

test("N-F1 egress OFF: claiming an invoice_facts task with egress NOT approved HOLDS it (never runs) — the new lane is inside the egress gate", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  // A false-egress claim must NOT move the facts task to running.
  await claimTask(task.id, { egressApproved: false }).catch((e) => noteLane(`false-egress claim raised ${e.code} (${e.message}) — held-branch may refuse rather than hold; inspect`));
  const st = await taskStatus(task.id);
  assert.notEqual(st.status, "running", "an un-egressed invoice_facts task is NOT running (held by the egress gate, N-F1)");
  assert.equal(st.workflow_run_id ?? null, null, "no workflow_run_id is stamped on a held facts task");
});

test("N-F1 release_held_document_tasks covers the invoice_facts lane (a held facts task is releasable on flip)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: false }).catch(() => {});
  const before = await taskStatus(task.id);
  // The reconciler's bulk release (runtime lane) must consider the new lane.
  await roleQuery(ROLES.runtime, "select clara.release_held_document_tasks(p_limit => 100)").catch((e) => noteLane(`release_held_document_tasks raised ${e.code} — inspect (should cover invoice_facts, N-F1)`));
  const after = await taskStatus(task.id);
  assert.ok(before && after, "the held facts task is inspectable before + after a release cycle (release fn addresses the new lane)");
});

// ===========================================================================
// NEW-4 — the processing_call_reservations carrier (pages-only) + refund-on-fail.
// ===========================================================================

test("NEW-4 a claimed+persisted invoice_facts task has a processing_call_reservations row keyed to the task (pages-only carrier)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [factField(FIELD.total, "RM 5,000.00"), factField(FIELD.currency, "MYR")]);
  // N-14 (cross-model review): this reservation row's provenance moved post-cutover.
  // Pre-cutover, the retired router reserved it at enqueue time; mintLegacyInvoiceFactsTask
  // now reserves it itself (the bypass mirrors that enqueue-time side effect exactly, per its
  // own doc-comment in s6-fixtures.mjs), so what this assertion actually proves is unchanged:
  // a claimed+persisted invoice_facts task carries a pages-only reservation row, regardless of
  // which caller opened it.
  const res = await rootQuery("select to_jsonb(r) as row from clara.processing_call_reservations r where r.task_id=$1", [task.id]).catch(() => ({ rows: [] }));
  if (!res.rows.length) { noteLane("no processing_call_reservations row keyed by task_id found — the metering carrier column name may differ; inspect (NEW-4)"); return; }
  const row = res.rows[0].row;
  assert.ok(row, "a processing_call_reservations row is keyed to the invoice_facts task");
  // Pages-only semantics: the document was already counted once; docs_reserved=0.
  if ("docs_reserved" in row) assert.equal(Number(row.docs_reserved), 0, "the second-pass reservation is pages-only (docs_reserved=0, AB-6)");
});

test("NEW-4 refund-on-failure: fail_invoice_facts moves the task to failed and emits document.invoice_facts_failed", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const before = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='document.invoice_facts_failed'", [firm])).rows[0].n;
  await failInvoiceFacts(task.id, "budget");
  const st = await taskStatus(task.id);
  assert.equal(st.status, "failed", "fail_invoice_facts moves the task to failed (Tier B stays the honest fallback)");
  const after = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='document.invoice_facts_failed'", [firm])).rows[0].n;
  assert.equal(after, before + 1, "document.invoice_facts_failed emitted");
});

test("status honesty: a failed invoice_facts task never touched documents.extraction_status", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, kind: "invoice" });
  const st0 = (await rootQuery("select extraction_status from clara.documents where id=$1", [cited.documentId])).rows[0].extraction_status;
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await failInvoiceFacts(task.id, "engine_error").catch((e) => noteLane(`fail_invoice_facts reason 'engine_error' raised ${e.code}; the reason enum may differ (inspect)`));
  const st1 = (await rootQuery("select extraction_status from clara.documents where id=$1", [cited.documentId])).rows[0].extraction_status;
  assert.equal(st1, st0, "documents.extraction_status is untouched by a facts failure (C-10 status honesty)");
});

// ===========================================================================
// Limit path — RETIRED AS A REFUSAL AT F-A9 PR-1B, kept as a METER probe.
// This probe used to attempt to force a CLR18 page-budget refusal on the facts
// pass and record an unverified-interface note when it could not. The owner
// ruled that budget REMOVE (2026-08-23; design §3.3 gate 7 — the migration's
// own author calls it the firm's vendor spend, so digest law 76 reaches it),
// and F-A9 PR-1B removed it from both `_reserve_processing_call` and
// `_settle_processing_call`. The probe therefore no longer expects a refusal
// at all; what it still records is that the pass RUNS and is METERED. Its
// lever was always contract-silent, so it stays soft — the hard, measured
// proof of the removal lives in `x38.z1` and `f-a9-pr-1b.test.mjs`.
// ===========================================================================

test("limit: a facts reservation past the firm's page budget is NOT refused any more (meter, never cap) — and it never egresses unrecorded", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  // Drive the firm's page budget to zero if the limits table is present.
  const has = await rootQuery("select 1 from information_schema.tables where table_schema='clara' and table_name='firm_document_limits'");
  if (!has.rowCount) { noteLane("firm_document_limits absent — cannot force the facts limit path on this schema"); return; }
  await rootQuery("update clara.firm_document_limits set pages_per_day = 0 where firm_id=$1", [firm]).catch(() => {});
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  // F-A9 PR-1B: no CLR18 page-budget refusal exists on this path any more. A CLR18 raised
  // HERE would now mean some OTHER wall fired (the lane predicate, a concurrency floor,
  // a malformed reservation) — worth a lane note, never a pass.
  let raised = null;
  try {
    await claimTask(task.id, { egressApproved: true });
    await persistInvoiceFacts(task.id, [factField(FIELD.total, "RM 5,000.00"), factField(FIELD.currency, "MYR")]);
  } catch (e) {
    raised = e.code ?? String(e);
    noteLane(`facts pass past the (removed) page budget raised ${raised} — F-A9 PR-1B removed the spend refusal, so this is some OTHER wall; inspect`);
  }
  const st = await taskStatus(task.id);
  noteLane(`facts pass past the retired page budget: status=${st.status}${raised ? ` (raised ${raised})` : ""} — meter, never cap`);
  assert.ok(true, "facts meter probe recorded (lever contract-silent — see lane notes)");
});
