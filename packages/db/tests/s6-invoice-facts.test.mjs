// Slice-6 rig — the INVOICE-FACTS lane: own extraction row, the two-tier amount
// provenance (Tier-A machine total), the CLR21 reason discriminants, evidence
// congruence, and the evidence/approval race (CLR25 + token rotation). Contract-
// blind: contract §4 + companion §5 + delegated S6-D1 + §12 + INTERFACE-PINS
// §1/§2/§3 — NEVER from 0009. Every test SKIPS until 0009 lands.
//
// Facts write path: enqueue_invoice_facts → claim (egress gate) → persist_invoice_facts
// inserts an OWN document_extractions row (engine_kind='invoice_facts',
// engine_id='azure-di:prebuilt-invoice:2024-11-30', own version_n) with semantic
// regions carrying monetary_cents; it rotates every open draft's revision_token.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROUTINE_CENTS,
  assertRaises,
  assertRaisesReason,
  opk,
  rootQuery,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  CLR,
  CLR21,
  CLR25,
  REASON,
  CODING_KIND,
  INVOICE_ENGINE_ID,
  INVOICE_FACTS_KIND,
  FIELD,
  firmOf,
  upsertPayableAccount,
  upsertAccountClassed,
  billLines,
  balanced,
  draftEntryV3,
  seedCitedDocument,
  ev,
  mintInteractive,
  wakeDraftEntry,
  approveEntry,
  entryRow,
  evidenceRows,
  invoiceFactsExtraction,
  freshResolution,
  enqueueInvoiceFacts,
  invoiceFactsTask,
  claimTask,
  ensureClientEgress,
  persistInvoiceFacts,
  factField,
  factsRegion,
  s6FixReady,
  invoiceFactState,
  reviseEntry,
  getDraftReview,
} from "./s6-fixtures.mjs";

let ready = false;
let world = null;
const AP = "400-000";
const EXP = "500-A01";
const VENDOR = { new: { name: "FACTSCO SDN BHD", registration_no: "201801000777" } };

before(async () => {
  ready = await s6EnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      // [WA-D1] grant a live egress consent so invoice_facts claims reach 'running'
      // (the lane-carve fail-closes to held_egress/CLR28 without one).
      await ensureClientEgress(world.users.alice, { client: c });
    }
  }
});
after(async () => {
  printLaneNotes("s6-invoice-facts");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

/** Seed a cited doc, enqueue+claim+persist facts on it. Returns { cited, task }. */
async function docWithFacts(sub, { client, total = "RM 5,000.00", currency = "MYR", extra = [] }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  assert.ok(task, "an invoice_facts processing task exists after enqueue");
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, total),
    factField(FIELD.currency, currency),
    factField(FIELD.vendorName, "FACTSCO SDN BHD"),
    ...extra,
  ]);
  return { cited, task };
}

/** A wake supplier-bill draft on an already-cited doc (no re-seed). `evidence`
 *  overrides the cited region (Tier-A must cite the MACHINE total's region). */
async function wakeBill(sub, { client, cited, amount, vendor = VENDOR, codingKind = CODING_KIND, evidence = null }) {
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  const res = await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId });
  return wakeDraftEntry(cred, {
    client, resolution: res, lines: billLines(EXP, AP, amount),
    document: cited.documentId, sha256: cited.sha256, vendor,
    evidence: evidence ?? [ev(cited.regionId, cited.quote, FIELD.total)], codingKind,
    opKey: `code-doc:${cited.filingId}:${cited.documentId}`,
  });
}

// ===========================================================================
// Own extraction row + deterministic cents normalization + status honesty.
// ===========================================================================

test("§5 persist_invoice_facts inserts an OWN extraction row (engine_kind='invoice_facts', pinned engine_id) with monetary_cents populated on the total region", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const { cited } = await docWithFacts(users.alice, { client: clients.A1, total: "RM 5,000.00" });
  const ex = await invoiceFactsExtraction(cited.documentId);
  assert.ok(ex, "an invoice_facts extraction row exists after persist");
  assert.equal(ex.engine_kind, INVOICE_FACTS_KIND, "the facts extraction row is engine_kind='invoice_facts' (its OWN row, C-7)");
  assert.equal(ex.engine_id, INVOICE_ENGINE_ID, "the facts extraction carries the pinned engine snapshot id");
  const region = (await rootQuery(
    "select monetary_cents, field_path from clara.document_regions r where r.extraction_id=$1 and r.field_path=$2",
    [ex.id, FIELD.total],
  )).rows[0];
  assert.ok(region, "the total field persists a semantic region on the facts extraction");
  assert.equal(Number(region.monetary_cents), 500000, "'RM 5,000.00' normalizes deterministically to 500000 cents");
});

test("§5 status honesty: an invoice_facts task never touches documents.extraction_status (that reflects the PRIMARY layout lane)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2 });
  const before = (await rootQuery("select extraction_status from clara.documents where id=$1", [cited.documentId])).rows[0].extraction_status;
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [factField(FIELD.total, "RM 1,200.00"), factField(FIELD.currency, "MYR")]);
  const after = (await rootQuery("select extraction_status from clara.documents where id=$1", [cited.documentId])).rows[0].extraction_status;
  assert.equal(after, before, "documents.extraction_status is unchanged by the facts lane (C-10 status honesty)");
});

test("§5 enqueue_invoice_facts is idempotent: a second enqueue in a live state is a no-op (partial unique (document_id, lane))", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  await enqueueInvoiceFacts(cited.documentId);
  await enqueueInvoiceFacts(cited.documentId);
  const n = (await rootQuery("select count(*)::int n from clara.document_processing_tasks where document_id=$1 and lane='invoice_facts' and status in ('queued','held_egress','running')", [cited.documentId])).rows[0].n;
  assert.equal(n, 1, "at most ONE live invoice_facts task per document (structural idempotency, N-F10)");
});

// ===========================================================================
// CLR21 reason discriminants (all DB-raised, INTERFACE-PINS §2).
// ===========================================================================

test("W1 amount exception (SUPERSEDES the draft-time amount_conflict refusal, §6.6 W1): a corroborated-total mismatch PERSISTS at draft with flags.amount_exception; approve refuses CLR21 amount_conflict; a governed p_amount_override (reason + cited region) resolves it HIGH-STAKES; a conforming revise clears it", async (t) => {
  if (unready(t)) return;
  if (!(await s6FixReady())) { t.skip("fix-batch surface (revise_entry p_amount_override) absent — W1 lands in the post-Codex fix batch"); return; }
  const { users, clients } = world;
  const { cited } = await docWithFacts(users.alice, { client: clients.A1, total: "RM 5,000.00" }); // corroborated 500000
  const freg = await factsRegion(cited.documentId, FIELD.total);
  // Propose 400000 against a corroborated 500000 total → the draft PERSISTS (no draft refusal).
  const draft = await wakeBill(users.alice, { client: clients.A1, cited, amount: 400000, evidence: [ev(freg.id, freg.text_content, FIELD.total)] });
  assert.ok(draft.entry_id, "the mismatch draft PERSISTS (W1 supersedes the §6.5 draft-time refusal)");
  const row = await entryRow(draft.entry_id);
  assert.ok(row.flags?.amount_exception, "the draft carries flags.amount_exception");
  assert.ok((await evidenceRows(draft.entry_id)).length >= 1, "evidence was still written in the draft transaction");
  // Approve refuses while the exception is open.
  await assertRaisesReason(CLR21, REASON.amountConflict,
    () => approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: row.revision_token, opKey: opk("ap") }),
    "approve with an open amount_exception → CLR21 amount_conflict");
  // Governed override via revise (reason + cited region) → stamps flags.amount_override + HIGH-STAKES.
  const rev = await reviseEntry(users.bob, {
    entry: draft.entry_id, lines: billLines(EXP, AP, 400000),
    vendor: { new: { name: "OVERRIDECO SDN BHD", registration_no: "201801000411" } },
    evidence: [ev(freg.id, freg.text_content, FIELD.total)], expectedRevision: row.revision_token,
    amountOverride: { reason: "supplier issued a partial credit note", region_id: freg.id },
  });
  const orow = await entryRow(draft.entry_id);
  assert.ok(orow.flags?.amount_override, "revise stamped flags.amount_override");
  const tok = rev.revision_token ?? orow.revision_token;
  // The override makes the entry high-stakes: bob (the editor) cannot solo-approve.
  await assertRaises(CLR.makerChecker, () => approveEntry(users.bob, { entry: draft.entry_id, expectedRevision: tok, opKey: opk("ap") }), "an override draft is high-stakes → self-approval CLR05");
  await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: tok, opKey: opk("ap") });
  assert.equal((await entryRow(draft.entry_id)).status, "approved", "a distinct checker approves the overridden bill");
});

test("W1 a CONFORMING revise clears the amount_exception (no override needed)", async (t) => {
  if (unready(t)) return;
  if (!(await s6FixReady())) { t.skip("fix-batch surface absent — W1 lands post-fix"); return; }
  const { users, clients } = world;
  const { cited } = await docWithFacts(users.alice, { client: clients.A2, total: "RM 5,000.00" });
  const freg = await factsRegion(cited.documentId, FIELD.total);
  const draft = await wakeBill(users.alice, { client: clients.A2, cited, amount: 400000, evidence: [ev(freg.id, freg.text_content, FIELD.total)] });
  assert.ok((await entryRow(draft.entry_id)).flags?.amount_exception, "the mismatch draft carries the exception");
  // Revise to the CONFORMING total (500000) → exception clears; approve succeeds.
  const rev = await reviseEntry(users.bob, { entry: draft.entry_id, lines: billLines(EXP, AP, 500000), vendor: { new: { name: "CONFORMCO SDN BHD", registration_no: "201801000412" } }, evidence: [ev(freg.id, freg.text_content, FIELD.total)], expectedRevision: (await entryRow(draft.entry_id)).revision_token });
  const crow = await entryRow(draft.entry_id);
  assert.ok(!crow.flags?.amount_exception, "the conforming revise cleared flags.amount_exception");
  await approveEntry(users.bob, { entry: draft.entry_id, expectedRevision: rev.revision_token ?? crow.revision_token, opKey: opk("ap") });
  assert.equal((await entryRow(draft.entry_id)).status, "approved", "the conforming bill approves");
});

test("Tier-A agreement: a supplier bill whose line sum EQUALS the verified total (citing the MACHINE total region) drafts + approves", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const { cited } = await docWithFacts(users.alice, { client: clients.A2, total: "RM 5,000.00" });
  const freg = await factsRegion(cited.documentId, FIELD.total);
  assert.ok(freg, "the facts pass persisted a semantic invoice.total region");
  const draft = await wakeBill(users.alice, { client: clients.A2, cited, amount: 500000, evidence: [ev(freg.id, freg.text_content, FIELD.total)] });
  await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("ap") });
  assert.equal((await entryRow(draft.entry_id)).status, "approved", "a Tier-A-agreeing supplier bill approves");
});

test("currency_unsupported: an explicit non-MYR currency on the facts → CLR21 currency_unsupported (refused at either tier)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const { cited } = await docWithFacts(users.alice, { client: clients.A1, total: "5,000.00", currency: "USD" });
  await assertRaisesReason(CLR21, REASON.currencyUnsupported,
    () => wakeBill(users.alice, { client: clients.A1, cited, amount: 500000 }),
    "non-MYR facts currency → CLR21 currency_unsupported");
});

test("vendor_malformed: a supplier bill proposing a blank-name vendor → CLR21 vendor_malformed", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  await assertRaisesReason(CLR21, REASON.vendorMalformed,
    () => wakeBill(users.alice, { client: clients.A1, cited, amount: ROUTINE_CENTS, vendor: { new: { name: "   " } } }),
    "blank vendor name → CLR21 vendor_malformed");
});

test("evidence_invalid: a document-bound bill citing a region that does not belong to the document → CLR21 evidence_invalid", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2 });
  const cred = await mintInteractive(firm);
  const res = await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId });
  const { randomUUID } = await import("node:crypto");
  await assertRaisesReason(CLR21, REASON.evidenceInvalid,
    () => wakeDraftEntry(cred, {
      client: clients.A2, resolution: res, lines: billLines(EXP, AP, ROUTINE_CENTS),
      document: cited.documentId, sha256: cited.sha256, vendor: VENDOR,
      evidence: [ev(randomUUID(), "bogus quote", FIELD.total)], codingKind: CODING_KIND, opKey: opk("ev"),
    }),
    "evidence citing an unrelated region → CLR21 evidence_invalid");
});

test("D-L2-2 evidence is required on the SUPPLIER_BILL coding flow: coding_kind='supplier_bill' + null evidence → CLR21 evidence_invalid; a PLAIN doc-bound draft keeps its shipped S5 evidence-less lawfulness", async (t) => {
  if (unready(t)) return;
  // Adjudicated scope [D-L2-2, orchestrator 2026-07-19]: the DB raise is CORRECT but
  // scoped to the coding flow — the core raises CLR21 evidence_invalid only when
  // p_coding_kind='supplier_bill' AND p_evidence is null/empty. A plain human
  // document-bound draft (no coding_kind) is NOT a coding attempt and keeps the S5
  // evidence-less behavior. This test pins BOTH sides of that boundary.
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);

  // (a) the coding flow: a supplier_bill wake draft with null evidence → CLR21.
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const cred = await mintInteractive(firm);
  const res = await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId });
  await assertRaisesReason(CLR21, REASON.evidenceInvalid,
    () => wakeDraftEntry(cred, {
      client: clients.A1, resolution: res, lines: billLines(EXP, AP, ROUTINE_CENTS),
      document: cited.documentId, sha256: cited.sha256, vendor: VENDOR, evidence: null, codingKind: CODING_KIND, opKey: opk("noev"),
    }),
    "supplier_bill + null evidence → CLR21 evidence_invalid");

  // (b) the boundary: a plain human doc-bound draft (no coding_kind) with null
  // evidence is LAWFUL — the S5 citation floor (CLR02) still binds, but the S6
  // evidence-array requirement does NOT (D-L2-2).
  const plainDoc = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const plain = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1),
    document: plainDoc.documentId, sha256: plainDoc.sha256, lines: balanced(world.coa.A1, ROUTINE_CENTS),
    evidence: null, opKey: opk("plainnoev"),
  });
  assert.ok(plain.entry_id, "a plain (non-supplier_bill) doc-bound draft with null evidence is lawful (S5 behavior preserved, D-L2-2)");
});

test("W2 duplicate_bill (§6.6): a second approved supplier_bill of the same (client, counterparty, facts invoice_id) → CLR21 duplicate_bill at approve; a governed duplicate_override clears it; near_duplicates surface in get_draft_review", async (t) => {
  if (unready(t)) return;
  if (!(await s6FixReady())) { t.skip("fix-batch surface absent — W2 duplicate control lands post-fix"); return; }
  const { users, clients } = world;
  const invId = "INV-DUP-777";
  // Bill 1 approves (births the vendor + records the facts invoice_id).
  const d1 = await docWithFacts(users.alice, { client: clients.A1, total: "RM 5,000.00", extra: [factField(FIELD.invoiceId, invId)] });
  const freg1 = await factsRegion(d1.cited.documentId, FIELD.total);
  const bill1 = await wakeBill(users.alice, { client: clients.A1, cited: d1.cited, amount: 500000, evidence: [ev(freg1.id, freg1.text_content, FIELD.total)] });
  await approveEntry(users.alice, { entry: bill1.entry_id, expectedRevision: bill1.revision_token, opKey: opk("ap") });
  // Bill 2: a DIFFERENT document, same client + same vendor (same registration → same
  // counterparty) + same facts invoice_id.
  const d2 = await docWithFacts(users.alice, { client: clients.A1, total: "RM 5,000.00", extra: [factField(FIELD.invoiceId, invId)] });
  const freg2 = await factsRegion(d2.cited.documentId, FIELD.total);
  const bill2 = await wakeBill(users.alice, { client: clients.A1, cited: d2.cited, amount: 500000, evidence: [ev(freg2.id, freg2.text_content, FIELD.total)] });
  const review = await getDraftReview(users.alice, { entry: bill2.entry_id, client: clients.A1 });
  assert.ok("near_duplicates" in (review ?? {}) || JSON.stringify(review ?? {}).includes("near_dup"), "get_draft_review surfaces near_duplicates (FIX-SP-3)");
  await assertRaisesReason(CLR21, REASON.duplicateBill,
    () => approveEntry(users.alice, { entry: bill2.entry_id, expectedRevision: bill2.revision_token, opKey: opk("ap") }),
    "exact (client, counterparty, invoice_id) duplicate → CLR21 duplicate_bill");
  // A governed duplicate_override via revise clears the block.
  const rev = await reviseEntry(users.bob, { entry: bill2.entry_id, lines: billLines(EXP, AP, 500000), vendor: VENDOR, evidence: [ev(freg2.id, freg2.text_content, FIELD.total)], expectedRevision: bill2.revision_token, duplicateOverride: { reason: "genuinely distinct bill with a reused supplier number" } });
  const tok = rev.revision_token ?? (await entryRow(bill2.entry_id)).revision_token;
  await approveEntry(users.bob, { entry: bill2.entry_id, expectedRevision: tok, opKey: opk("ap") });
  assert.equal((await entryRow(bill2.entry_id)).status, "approved", "the governed duplicate_override lets the second bill post");
});

test("W3 no geometry never corroborates (§6.6): facts with an EMPTY polygon on the total → _invoice_fact_state corroborated=false (Tier B); a mismatching amount drafts with NO exception", async (t) => {
  if (unready(t)) return;
  if (!(await s6FixReady())) { t.skip("fix-batch surface absent — W3 polygon-required corroboration lands post-fix"); return; }
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [factField(FIELD.total, "RM 5,000.00", { polygon: [] }), factField(FIELD.currency, "MYR")]);
  const fs = await invoiceFactState(cited.documentId);
  assert.equal(fs?.corroborated, false, "an empty-polygon total region never corroborates (W3)");
  // A mismatching amount then drafts normally (Tier B — no corroborated total to conflict).
  const draft = await wakeBill(users.alice, { client: clients.A1, cited, amount: 400000 });
  assert.ok(draft.entry_id, "a mismatching amount drafts (facts not corroborated → Tier B)");
  assert.ok(!(await entryRow(draft.entry_id)).flags?.amount_exception, "no amount_exception when the total does not corroborate");
});

test("W5 explicit non-MYR currency in a SUBMITTED evidence row → CLR21 currency_unsupported at draft AND revise (either tier, C-20)", async (t) => {
  if (unready(t)) return;
  if (!(await s6FixReady())) { t.skip("fix-batch surface absent — W5 evidence-row currency check lands post-fix"); return; }
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2 }); // Tier B (no facts)
  const cred = await mintInteractive(firm);
  const res = await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId });
  const usdEvidence = [ev(cited.regionId, "USD", FIELD.currency), ev(cited.regionId, cited.quote, FIELD.total)];
  // at DRAFT: a submitted invoice.currency evidence row quoting USD → CLR21.
  await assertRaisesReason(CLR21, REASON.currencyUnsupported,
    () => wakeDraftEntry(cred, { client: clients.A2, resolution: res, lines: billLines(EXP, AP, ROUTINE_CENTS), document: cited.documentId, sha256: cited.sha256, vendor: VENDOR, evidence: usdEvidence, codingKind: CODING_KIND, opKey: opk("usd") }),
    "non-MYR currency evidence at draft → CLR21 currency_unsupported");
  // at REVISE: a clean MYR draft, then revise adding the USD currency evidence → CLR21.
  const clean = await wakeBill(users.alice, { client: clients.A2, cited, amount: ROUTINE_CENTS });
  await assertRaisesReason(CLR21, REASON.currencyUnsupported,
    () => reviseEntry(users.bob, { entry: clean.entry_id, lines: billLines(EXP, AP, ROUTINE_CENTS), vendor: VENDOR, evidence: usdEvidence, expectedRevision: clean.revision_token }),
    "non-MYR currency evidence at revise → CLR21 currency_unsupported");
});

// ===========================================================================
// Evidence congruence + the evidence/approval race (CLR25 + token rotation).
// ===========================================================================

test("C-9 evidence congruence: a valid supplier bill writes entry_evidence rows (region + field_path + tier) in the draft transaction", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const draft = await wakeBill(users.alice, { client: clients.A1, cited, amount: ROUTINE_CENTS });
  const rows = await evidenceRows(draft.entry_id);
  assert.ok(rows.length >= 1, "the draft persisted at least one entry_evidence row");
  const e = rows[0];
  assert.equal(e.region_id, cited.regionId, "the evidence row binds the cited region");
  assert.equal(e.document_id, cited.documentId, "the evidence row binds the cited document");
  assert.ok(["verified", "model_read"].includes(e.provenance_tier), `evidence carries a provenance_tier (got ${e.provenance_tier})`);
});

test("C-8 stale evidence: a facts completion AFTER a Tier-B draft rotates its token; approving with the ROTATED token → CLR25 (or the bill-shape CLR23), never a silent approve", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 5,000.00" });
  // Tier-B draft (no facts yet): payable/expense = 500000, bound to the OCR region quote.
  const draft = await wakeBill(users.alice, { client: clients.A2, cited, amount: 500000 });
  // Facts complete LATER with a CONTRADICTING total (600000) → token rotates.
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [factField(FIELD.total, "RM 6,000.00"), factField(FIELD.currency, "MYR")]);
  const rotated = (await entryRow(draft.entry_id)).revision_token;
  assert.notEqual(rotated, draft.revision_token, "facts completion rotated the open draft's revision_token (P7)");
  // The OLD token is now stale → CLR06.
  await assertRaises(CLR.revision, () => approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("ap") }), "old token → CLR06");
  // The NEW token surfaces the contradiction → EXACTLY CLR25 (ratified law, W9/§6.6;
  // the earlier CLR23-or-CLR25 tolerance is dropped — stale-evidence is CLR25).
  await assertRaises(CLR25, () => approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: rotated, opKey: opk("ap") }), "contradicting late facts at approve → CLR25 exactly");
});
