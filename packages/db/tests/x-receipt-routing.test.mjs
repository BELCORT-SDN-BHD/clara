// Migration 0025 — 'receipt' joins the automatic facts-enqueue kind gate (owner ruling,
// task #27: Gate P blocker, Malaysian SST lives on receipts). See 0025_receipt_routing.sql's
// own header for the two CoRs (the automatic core + the human re-extraction/backfill verb)
// and the doors-not-data discipline.
//
// READINESS: the 0021+ discipline — every cell FAILS loudly against a 24-migration database
// rather than skipping, so a green battery against a prestate missing the widening proves
// nothing.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, buildWorld, assertRaises, firmOf,
  requestReextraction, laneTasks, grantConsent, seedCitedDocument, enqueueInvoiceFacts,
  invoiceFactsTask, claimTask, persistInvoiceFacts, factField, rm, printLaneNotes, noteLane,
} from "./x1-helpers.mjs";

let W = null;
let has0025 = false;

async function has25() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0025_'");
    return r.rows.length > 0;
  } catch { return false; }
}

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  has0025 = await has25();
  if (has0025) W = await buildWorld();
  else noteLane("0025 absent — x-receipt-routing battery FAILS loudly rather than skipping");
});
after(async () => { printLaneNotes("x-receipt-routing"); await endPool(); });

function requireReady() {
  if (!has0025) {
    throw new Error(
      "0025 NOT applied (clara.schema_migrations has no '0025_%' row) — the receipt kind gate "
      + "is not widened. This battery is REQUIRED to fail against the 24-migration prestate.");
  }
}

/** A filed, kind-stamped pdf document — the NULL-kind-classifies-first gate is bypassed by
 *  stamping the kind directly at seed (the a21-classifier-gate / x1-helpers `extractedDoc`
 *  idiom), so the facts gate engages the KIND GATE under test directly. */
async function kindDoc(sub, { client, kind, cents = 90000 }) {
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(cents) });
  await rootQuery("update clara.documents set document_kind=$2 where id=$1", [cited.documentId, kind]);
  return cited;
}

/** kindDoc, then drive it through the REAL writer chain to a DONE invoice_facts extraction
 *  (claim -> persist), so every guard the write boundary carries actually runs — the SAME
 *  shape x1-helpers' extractedDoc uses, generalised over kind. */
async function extractedKindDoc(sub, { client, kind, cents = 90000 }) {
  const cited = await kindDoc(sub, { client, kind, cents });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  assert.ok(task, `mandatory setup: a ${kind} document enqueues an invoice_facts task`);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", rm(cents)),
    factField("invoice.currency", "MYR"),
    factField("invoice.invoice_id", `RIG-${kind}-${Date.now().toString(36)}`),
    factField("invoice.invoice_date", "2026-06-15", { polygon: [], confidence: 0.9 }),
  ]);
  return cited;
}

test("META x-receipt-routing: migration 0025 present + the kind gate carries receipt", async (t) => {
  if (!has0025) { t.skip("0025 not applied"); return; }
  const mig = await rootQuery("select version from clara.schema_migrations where version ~ '^0025_'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0025_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);
});

// ===========================================================================
// (1) A receipt enqueues to invoice_facts — the automatic core (§A).
// ===========================================================================

test("a filed receipt document enqueues an invoice_facts task (not skipped_kind)", async () => {
  requireReady();
  const client = W.clients.A1;
  const doc = await kindDoc(W.users.alice, { client, kind: "receipt" });
  await enqueueInvoiceFacts(doc.documentId);
  const tasks = await laneTasks(doc.documentId, "invoice_facts");
  const runnable = tasks.filter((t) => ["queued", "held_egress", "running"].includes(t.status));
  assert.equal(runnable.length, 1, "a receipt enqueues exactly one runnable invoice_facts task");
  assert.equal(runnable[0].engine_id, "azure-di:prebuilt-invoice:2024-11-30", "on the SAME engine every admitted kind uses");
  const skipped = tasks.filter((t) => t.status === "failed" && t.error_code === "skipped_kind");
  assert.equal(skipped.length, 0, "no skipped_kind receipt was minted for a receipt document");
});

// ===========================================================================
// (2) The gate NARROWS, it does not vanish — an excluded kind still yields skipped_kind.
// ===========================================================================

test("an EXCLUDED kind (bank_statement) still yields the skipped_kind terminal — the gate narrows, not vanishes", async () => {
  requireReady();
  const client = W.clients.A1;
  const doc = await kindDoc(W.users.alice, { client, kind: "bank_statement" });
  await enqueueInvoiceFacts(doc.documentId);
  const tasks = await laneTasks(doc.documentId, "invoice_facts");
  const runnable = tasks.filter((t) => ["queued", "held_egress", "running", "done"].includes(t.status));
  assert.equal(runnable.length, 0, "NO runnable/completed invoice_facts task exists for a bank_statement (the gate still holds)");
  const skipped = tasks.find((t) => t.status === "failed" && t.error_code === "skipped_kind");
  assert.ok(skipped, "the skipped_kind receipt still lives on the task trail for a still-excluded kind");
  const full = await rootQuery("select attempt_count from clara.document_processing_tasks where id=$1", [skipped.id]);
  assert.equal(full.rows[0].attempt_count, 0, "the receipt row was never claimed and consumes no attempts");
});

test("payroll_summary and claim_form ALSO still refuse the facts lane (a broad narrowing check, not just one kind)", async () => {
  requireReady();
  const client = W.clients.A1;
  for (const kind of ["payroll_summary", "claim_form"]) {
    const doc = await kindDoc(W.users.alice, { client, kind });
    await enqueueInvoiceFacts(doc.documentId);
    const tasks = await laneTasks(doc.documentId, "invoice_facts");
    assert.ok(tasks.some((t) => t.status === "failed" && t.error_code === "skipped_kind"),
      `${kind} still yields skipped_kind after the 0025 widening`);
  }
});

// ===========================================================================
// (3) request_reextraction on a receipt WITH a prior done extraction — the ordinary case.
// ===========================================================================

test("request_reextraction on a receipt WITH a prior completed extraction: a new queued task at version max+1", async () => {
  requireReady();
  const client = W.clients.A1;
  const doc = await extractedKindDoc(W.users.alice, { client, kind: "receipt" });
  const before_ = await laneTasks(doc.documentId);
  assert.equal(before_.length, 1, "the fixture settled exactly one invoice_facts task (mandatory setup)");
  assert.equal(before_[0].status, "done", "…done — receipts corroborate through the SAME pipeline as invoices");

  const res = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "the total misread the tax-inclusive figure", opKey: opk("rex-receipt"),
  });
  assert.equal(res.status, "queued", "a QUEUED task, not a short-circuit receipt");
  assert.equal(res.reused, false, "genuinely minted");
  assert.equal(res.version_n, before_[0].version_n + 1, "the new task takes the next version on the lane");
  const after_ = await laneTasks(doc.documentId);
  assert.equal(after_.length, 2, "exactly one new task exists");
});

// ===========================================================================
// (4) THE BACKFILL PATH: request_reextraction on a receipt with NO prior extraction.
// This is the historical population (receipts ingested BEFORE 0025) that the automatic
// pipeline could never have produced a first extraction for.
// ===========================================================================

test("THE BACKFILL: request_reextraction on a receipt with NO prior extraction succeeds — the ONE-TIME seam for pre-0025 receipts", async () => {
  requireReady();
  const client = W.clients.A1;
  const doc = await kindDoc(W.users.alice, { client, kind: "receipt" });
  // Mandatory setup: prove this receipt carries NO invoice_facts task or extraction at all —
  // simulating a document that pre-dates 0025 and was never touched by the automatic pipeline
  // (kindDoc seeds a citable document but does NOT call enqueueInvoiceFacts).
  assert.equal((await laneTasks(doc.documentId, "invoice_facts")).length, 0,
    "mandatory setup: no invoice_facts task exists yet");
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.document_extractions where document_id=$1 and engine_kind='invoice_facts' and status='done'",
    [doc.documentId])).rows[0].n, 0, "mandatory setup: no DONE extraction exists");

  const res = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "backfill: pre-0025 receipt, no prior facts pass", opKey: opk("rex-backfill"),
  });
  assert.equal(res.status, "queued", "the backfill request mints a live task rather than raising CLR16");
  assert.equal(res.version_n, 1, "the FIRST version for this document/lane — there was nothing to supersede");
  assert.equal(res.reused, false, "genuinely minted, not recovered");

  const tasks = await laneTasks(doc.documentId, "invoice_facts");
  assert.equal(tasks.length, 1, "exactly one task now exists");
  assert.equal(tasks[0].status, "queued", "…queued");
  assert.equal(tasks[0].engine_id, "azure-di:prebuilt-invoice:2024-11-30", "…on the standard engine");

  // The budget control still gates this backfill call exactly like every other invoice_facts
  // reservation (the owner's accepted cost boundary — §C of the migration header).
  const reserved = await rootQuery(
    "select 1 from clara.processing_call_reservations where task_id=$1", [tasks[0].id]);
  assert.equal(reserved.rows.length, 1, "the backfill's page reservation was made — the standing budget control still applies");
});

test("the backfill relaxation is receipt-ONLY: an invoice with NO prior extraction is still refused CLR16", async () => {
  requireReady();
  const client = W.clients.A1;
  const doc = await kindDoc(W.users.alice, { client, kind: "invoice" });
  await enqueueInvoiceFacts(doc.documentId); // the ordinary pipeline enqueues automatically
  const before_ = (await laneTasks(doc.documentId)).length;
  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex-inv-nofirst") }),
    "re-extracting an invoice that has never been extracted — the relaxation must not leak to non-receipt kinds");
  assert.equal((await laneTasks(doc.documentId)).length, before_, "…and nothing new was queued");
});

// ===========================================================================
// (5) Existing invoice behavior is byte-stable: the kind gate, the mime gate, and the
// no-completed-extraction refusal all behave EXACTLY as before for invoice/credit_note/
// debit_note. (x1-reextraction.test.mjs already covers this exhaustively for 'invoice' —
// this cell adds credit_note/debit_note + the still-excluded-kind refusal, so the widening
// is proven correct on the OTHER two previously-admitted kinds too, not just invoice.)
// ===========================================================================

test("existing behavior is BYTE-STABLE for credit_note and debit_note: both still route to invoice_facts and still refuse a still-excluded kind", async () => {
  requireReady();
  const client = W.clients.A1;
  for (const kind of ["credit_note", "debit_note"]) {
    const doc = await extractedKindDoc(W.users.alice, { client, kind });
    const res = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk(`rex-${kind}`) });
    assert.equal(res.status, "queued", `${kind} re-extraction still works exactly as before 0025`);

    await rootQuery("update clara.documents set document_kind='bank_statement' where id=$1", [doc.documentId]);
    await assertRaises("CLR16",
      () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk(`rex-${kind}-excluded`) }),
      `${kind}'s document forcibly re-kinded to an excluded kind is still refused`);
  }
});

test("the still-excluded kind message names 'invoice-shaped' honestly — a receipt no longer reaches this refusal at all", async () => {
  requireReady();
  const client = W.clients.A1;
  const doc = await kindDoc(W.users.alice, { client, kind: "payroll_summary" });
  await assert.rejects(
    () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex-payroll") }),
    (e) => e.code === "CLR16" && /invoice-shaped/.test(e.message),
    "a still-excluded kind (payroll_summary) hits the kind-gate refusal, not the backfill seam",
  );
});
