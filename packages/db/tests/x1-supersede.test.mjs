// Extraction slice X1 (migration 0022) — what happens when a re-extraction SETTLES.
//
// The contract (docs/plan/extraction-slice-contract.md §2, X1) claims settlement needs
// nothing new: `persist_invoice_facts` already inserts the extraction, 0017's
// `t_document_extractions_authority_0017` trigger already supersedes the prior row and
// repoints `documents.authoritative_extraction_id`, and 0016's facts_rotated block already
// rotates every open draft's revision token. It also carries a BUILD-TIME VERIFICATION,
// stated as a claim to prove rather than an assumption to rely on:
//
//   "an open draft binds its specific extraction version, so a mid-review re-extraction
//    cannot swap figures under an approver — provenance binding should already guarantee
//    this; prove it in the rig."
//
// That is what the second cell does, and it matters more than it looks: without it, a
// bookkeeper re-extracting a document while a colleague has its draft open on screen could
// change the numbers under the approver between "read" and "approve". The rotation is what
// turns that into a refusal instead of a silent swap.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, rootQuery, opk, endPool, buildWorld, assertRaises, rm,
  has0022, fail0022, requestReextraction, extractedDoc, extractionsOf, authoritativeExtraction,
  invoiceFactsTask, claimTask, persistInvoiceFacts, factField,
  draftEntryV3, approveEntry, freshResolution, ev, FIELD,
} from "./x1-helpers.mjs";

let W = null;
let live = false;

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  live = await has0022();
  if (live) W = await buildWorld();
});
after(async () => { await endPool(); });

const gate = () => fail0022(live);

/** Claim + settle the task the verb just queued, with a CHANGED total, and return the id. */
async function settleReextraction(document, cents) {
  const task = await invoiceFactsTask(document);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", rm(cents)),
    factField("invoice.currency", "MYR"),
    factField("invoice.invoice_id", "RIG-REEXTRACT-1"),
    factField("invoice.invoice_date", "2026-06-15", { polygon: [], confidence: 0.9 }),
  ]);
  return task.id;
}

// ===========================================================================

test("[0022] a settled re-extraction supersedes the prior one and repoints the authoritative pointer", async () => {
  gate();
  const client = W.clients.A1;
  const doc = await extractedDoc(W.users.alice, { client, cents: 135000 });
  const first = await extractionsOf(doc.documentId);
  assert.equal(first.length, 1, "one invoice_facts extraction before the re-extraction (mandatory setup)");
  assert.equal(await authoritativeExtraction(doc.documentId), first[0].id,
    "…and it is the authoritative one");

  await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "the total was read short by RM 180", opKey: opk("rex") });
  await settleReextraction(doc.documentId, 153000);

  const both = await extractionsOf(doc.documentId);
  assert.equal(both.length, 2, "the settled re-extraction is a SECOND extraction, not an edit of the first");
  const [older, newer] = both;
  assert.equal(newer.version_n, older.version_n + 1, "…at the next version on the chain");
  assert.equal(older.superseded_by, newer.id,
    "the 0017 authority trigger supersedes the prior row — nothing in 0022 had to re-implement this");
  assert.equal(newer.superseded_by, null, "…and the new row is live");
  assert.equal(await authoritativeExtraction(doc.documentId), newer.id,
    "…with documents.authoritative_extraction_id repointed at it");

  // The corrected figure is what the fact state now reports.
  const state = (await rootQuery("select clara._invoice_fact_state($1) as s", [doc.documentId])).rows[0].s;
  assert.equal(Number(state.total_cents), 153000,
    "the fact state reads the NEW extraction — which is the entire point of the verb");
  assert.equal(state.extraction_id, newer.id, "…pinned to the new extraction id");
});

test("[0022] a mid-review re-extraction cannot swap figures under an approver (contract §2 X1 build-time verification)", async () => {
  gate();
  const client = W.clients.A1;
  const doc = await extractedDoc(W.users.alice, { client, cents: 135000 });

  // A colleague has the draft open: they hold `revision_token` as of their read.
  const draft = await draftEntryV3(W.users.bob, {
    client,
    resolution: await freshResolution(W.users.bob, client, {
      subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    lines: [
      { account_code: W.coa.A1.expense, debit_cents: 135000, credit_cents: 0, description: "x1-dr" },
      { account_code: W.coa.A1.cash, debit_cents: 0, credit_cents: 135000, description: "x1-cr" },
    ],
    evidence: [ev(doc.regionId, doc.quote, FIELD.total)],
    opKey: opk("x1d"),
  });
  const staleToken = draft.revision_token;
  assert.ok(staleToken, "the reviewer holds a revision token (mandatory setup)");

  // Meanwhile someone re-extracts the same document and it settles with a DIFFERENT total.
  await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "re-read the total", opKey: opk("rex") });
  await settleReextraction(doc.documentId, 153000);

  const rotated = (await rootQuery(
    "select revision_token from clara.journal_entries where id=$1", [draft.entry_id])).rows[0].revision_token;
  assert.notEqual(rotated, staleToken,
    "settling new facts ROTATED the open draft's revision token (0016's facts_rotated block)");

  const rev = await rootQuery(
    `select reason, revision_token from clara.journal_entry_revisions
      where entry_id=$1 order by revision_no desc limit 1`, [draft.entry_id]);
  assert.equal(rev.rows[0].reason, "facts_rotated",
    "…and left a named revision row, so the reviewer can see WHY their token went stale");
  assert.equal(rev.rows[0].revision_token, rotated, "…carrying the new token");

  // The approver who read the OLD figures is refused. This is the claim the contract asked
  // to be proven rather than assumed: the refusal is what stops a silent swap.
  await assertRaises(CLR.revision,
    () => approveEntry(W.users.alice, {
      entry: draft.entry_id, expectedRevision: staleToken, opKey: opk("x1a") }),
    "approving with the token held before the re-extraction");
  assert.equal(
    (await rootQuery("select status from clara.journal_entries where id=$1", [draft.entry_id])).rows[0].status,
    "draft", "…and the entry is still a draft: nothing was posted on figures nobody re-read");

  // Re-reading the current token approves normally — the refusal is about staleness, not a
  // lock-out. (Kept in the same cell deliberately: a refusal cell that never proves the
  // positive path can pass against a verb that refuses everything.)
  const ok = await approveEntry(W.users.alice, {
    entry: draft.entry_id, expectedRevision: rotated, opKey: opk("x1a2") });
  assert.ok(ok, "with the CURRENT token the same approval goes through");
});

test("[0022] a re-extraction is inert outside the extraction chain — no entry, no filing, no resolution", async () => {
  gate();
  const client = W.clients.A2;
  const doc = await extractedDoc(W.users.alice, { client });
  const snap = async () => (await rootQuery(
    `select (select count(*) from clara.journal_entries where client_id=$1) entries,
            (select count(*) from clara.client_resolutions where client_id=$1) resolutions,
            (select count(*) from clara.document_filings where client_id=$1 and retired_at is null) filings`,
    [client])).rows[0];
  const before_ = await snap();
  await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex") });
  assert.deepEqual(await snap(), before_,
    "asking for a re-extraction writes nothing in the books, the filing history, or attribution");
});
