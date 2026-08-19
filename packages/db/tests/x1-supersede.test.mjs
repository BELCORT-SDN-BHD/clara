// Extraction slice X1 (migration 0022) — what happens when a re-extraction SETTLES.
//
// The contract (docs/plan/completed/extraction-slice-contract.md §2, X1) claims settlement needs
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
import { randomUUID } from "node:crypto";
import {
  CLR, rootQuery, opk, endPool, buildWorld, assertRaises, rm,
  has0022, fail0022, requestReextraction, extractedDoc, extractionsOf, authoritativeExtraction,
  claimTask,
  draftEntryV3, approveEntry, freshResolution, ev, FIELD,
  laneTasks, markSkip, requireRecoveryDoor,
  failedWitnessDoc, witnessExtractionsOf,
} from "./x1-helpers.mjs";

let W = null;
let live = false;
let has51 = false;

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  live = await has0022();
  if (live) W = await buildWorld();
  // Keyed on the migration's STABLE SUFFIX + a catalog cross-check, never on '^0051_':
  // migration numbers are claimed at merge, and a number-keyed gate turns a renumber into a
  // silent 0-pass/all-skip green. See requireRecoveryDoor in x1-helpers.mjs.
  has51 = live ? await requireRecoveryDoor() : false;
});
after(async () => { await endPool(); });

const gate = () => fail0022(live);

/** 0051's cells are SKIP-gated rather than fail-gated (the 0022 ratchet applies to 0022's
 *  own battery): this file must stay green on every database from 0022 up to the migration
 *  before 0051. */
function skip51(t) {
  if (!live || !has51) { markSkip(); t.skip("0051 not applied — the failed-first settlement re-proof is dormant"); return true; }
  return false;
}

// F-A1 PR-3 CUTOVER: request_reextraction now mints on llm_witness (D7), settled through the
// REAL witness writer (clara.persist_witness_facts) -- the SAME shape f-a1-writer.test.mjs's
// own fixtures use (ocrFixture/runningTask/persist), here adapted to cite the document's own
// pre-seeded OCR region rather than building a fresh one. Only invoice.total is answered with
// a value (the eleven-belt "required answer" rule admits not_printed for the rest, per B1) --
// these cells read total_cents/extraction_id, never the overall corroborated verdict.
const WITNESS_BELT = [
  "invoice.total", "invoice.total_excl_tax", "invoice.tax_total", "invoice.rounding",
  "invoice.service_charge", "invoice.discount", "invoice.delivery",
  "invoice.amount_due", "invoice.deposit", "invoice.currency", "invoice.type_code",
];
function witnessEnvelope(channel, totalRaw) {
  const answers = {};
  for (const f of WITNESS_BELT) {
    answers[f] = f === "invoice.total" ? { state: "value", raw: totalRaw } : { state: "not_printed" };
  }
  return { witness: { channel, answers } };
}

/** Claim + settle the llm_witness task the verb just queued, with a CHANGED total, and
 *  return the id. */
async function settleReextraction(document, cents) {
  const witnessTasks = await laneTasks(document, "llm_witness");
  const queued = witnessTasks.filter((t) => t.status === "queued").sort((a, b) => b.version_n - a.version_n)[0];
  await claimTask(queued.id, { egressApproved: true });

  const ocrExtraction = (await rootQuery(
    `select id from clara.document_extractions
      where document_id=$1 and engine_kind='ocr' and status='done' order by version_n desc limit 1`,
    [document])).rows[0].id;
  const sha256 = (await rootQuery("select sha256 from clara.documents where id=$1", [document])).rows[0].sha256;
  const firm = (await rootQuery("select firm_id from clara.documents where id=$1", [document])).rows[0].firm_id;
  const raw = rm(cents);
  // clara.document_regions is append-only (0007's _tf_append_only) — a CHANGED total needs a
  // NEW region on the SAME pinned OCR extraction, never an UPDATE of the original quote.
  const newRegion = (await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'reextraction_total',$3,1.0)
     returning id`,
    [firm, ocrExtraction, raw])).rows[0];
  const idx = (await rootQuery(
    `select idx from (select id, (row_number() over (order by id))::int as idx
       from clara.document_regions where extraction_id=$1) q where q.id=$2`,
    [ocrExtraction, newRegion.id])).rows[0].idx;

  const text = {
    input_pin: ocrExtraction, prompt_hash: `text-${randomUUID()}`, envelope: witnessEnvelope("text", raw),
    citations: [{ field_path: "invoice.total", region_idx: idx }],
  };
  const vision = {
    input_pin: sha256, prompt_hash: `vision-${randomUUID()}`, envelope: witnessEnvelope("vision", raw),
  };
  const r = (await rootQuery(
    "select clara.persist_witness_facts($1,$2::jsonb,$3::jsonb,$4) as s",
    [queued.id, JSON.stringify(text), JSON.stringify(vision), 1])).rows[0].s;
  return r;
}

// ===========================================================================

test("[0022/F-A1 PR-3] a settled re-extraction lands as a FRESH witness chain and repoints the authoritative pointer — the legacy row is orphaned, never cross-kind superseded", async () => {
  gate();
  const client = W.clients.A1;
  const doc = await extractedDoc(W.users.alice, { client, cents: 135000 });
  const legacy = await extractionsOf(doc.documentId);
  assert.equal(legacy.length, 1, "one invoice_facts extraction before the re-extraction (mandatory setup)");
  assert.equal(await authoritativeExtraction(doc.documentId), legacy[0].id,
    "…and it is the authoritative one");

  await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "the total was read short by RM 180", opKey: opk("rex") });
  await settleReextraction(doc.documentId, 153000);

  // F-A1 PR-3 (design SS3.9): the kind-scoped 0017 trigger supersedes WITHIN a kind only —
  // llm_text_facts is a DIFFERENT engine_kind from invoice_facts, so the legacy row is NEVER
  // cross-kind superseded. It stays exactly as extractedDoc left it: done, live, orphaned.
  const legacyAfter = await extractionsOf(doc.documentId);
  assert.equal(legacyAfter.length, 1, "the legacy invoice_facts row is still the ONLY one of its kind");
  assert.equal(legacyAfter[0].superseded_by, null, "…and it is NEVER superseded — cross-kind supersede does not exist");

  const witnessChain = await witnessExtractionsOf(doc.documentId);
  assert.equal(witnessChain.length, 1, "the settled re-extraction is the llm_witness lane's FIRST (and only) generation");
  assert.equal(witnessChain[0].version_n, 1, "…at that lane's own version 1, independent of the invoice_facts count");
  assert.equal(witnessChain[0].superseded_by, null, "…and live");

  // The document-wide pointer is NOT the per-kind supersede chain — it lands on the NEWEST
  // insert regardless of kind (design SS3.9 note 2: "the pointer is not the predicate's
  // extraction_id"). A witness settle is always newer than the legacy invoice_facts row it
  // never touches, so the pointer moves to the new TEXT row.
  assert.equal(await authoritativeExtraction(doc.documentId), witnessChain[0].id,
    "…with documents.authoritative_extraction_id repointed at the new TEXT row");

  // The corrected figure is what the fact state now reports, resolved through the
  // CROSS-REGIME dispatcher (f-a1-dispatch.test.mjs proves this mechanism directly;
  // this cell proves the RE-EXTRACTION path reaches it end to end).
  const state = (await rootQuery("select clara._invoice_fact_state($1) as s", [doc.documentId])).rows[0].s;
  assert.equal(state.regime, "witness", "the dispatcher resolves the NEWER witness generation");
  assert.equal(Number(state.total_cents), 153000,
    "the fact state reads the NEW extraction — which is the entire point of the verb");
  assert.equal(state.extraction_id, witnessChain[0].id, "…pinned to the new (text) extraction id");
});

test("[0022/F-A1] a mid-review re-extraction cannot swap figures under an approver (contract §2 X1 build-time verification; F-A1 PR-3 writer-parity fix, UNNUMBERED_f_a1_writer_rotation.sql)", async () => {
  gate();
  // Was a KNOWN GAP found while validating PR-3's cutover on this rig: clara.persist_witness_facts
  // (PR-1's writer, 0095) carried no equivalent of clara.persist_invoice_facts' inline
  // "facts_rotated" block, so a witness settle never rotated an open draft's revision token and
  // a stale-token approve succeeded silently. Escalated to the orchestrator, RULED in-charter,
  // fixed by UNNUMBERED_f_a1_writer_rotation.sql (ported verbatim in shape, applied BEFORE the
  // cutover file). This cell now exercises the SAME mechanism through the witness settlement
  // path it always exercised through the legacy one.
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

// ===========================================================================
// 0051 — settlement AFTER a terminally-failed FIRST attempt (§7-A finding F6 / ADR-062).
//
// The 0051 migration only widens ADMISSION; it claims the settlement half needs nothing new.
// That claim is exactly the kind that gets asserted in a header and never measured, so it is
// measured here: a recovery admitted through the new door must settle into the SAME
// authority/supersede machinery every other extraction uses, and a document that has been
// through a failure must still behave normally on every subsequent re-extraction.
// ===========================================================================

test("[0051/F-A1 PR-3] a done extraction settling after a FAILED first llm_witness attempt takes the authority pointer", async (t) => {
  if (skip51(t)) return;
  const client = W.clients.A1;
  const doc = await failedWitnessDoc(W.users.alice, { client, cents: 135000 });

  // The starting state, asserted: the failed attempt left NOTHING in the witness chain, so
  // there is nothing for the settlement to supersede. The authority pointer sits on the
  // fixture's own primary OCR extraction (seedCitedDocument seeds one, done), NOT on a facts
  // extraction of either regime.
  assert.deepEqual(await witnessExtractionsOf(doc.documentId), [],
    "no llm_text_facts extraction exists after a failed first attempt (mandatory setup)");
  assert.equal(await authoritativeExtraction(doc.documentId), doc.extractionId,
    "…and the authoritative pointer is still the primary OCR extraction");

  const admitted = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "the only attempt died on the consent gate", opKey: opk("x51s") });
  assert.equal(admitted.admission, "failed_retry", "the recovery door admitted it (mandatory setup)");
  await settleReextraction(doc.documentId, 135000);

  const chain = await witnessExtractionsOf(doc.documentId);
  assert.equal(chain.length, 1,
    "the recovery settles as the FIRST llm_witness extraction this document has ever had — "
    + "the failed attempt contributed no row to supersede");
  assert.equal(chain[0].status, "done", "…and it is done");
  assert.equal(chain[0].superseded_by, null, "…and live");
  assert.equal(await authoritativeExtraction(doc.documentId), chain[0].id,
    "…with documents.authoritative_extraction_id repointed at it by the 0017 trigger, which "
    + "needed no change for the failed-first case: it ignores non-'done' rows, and a failed "
    + "attempt never produced one");

  const state = (await rootQuery("select clara._invoice_fact_state($1) as s", [doc.documentId])).rows[0].s;
  assert.equal(state.regime, "witness", "the dispatcher resolves the recovered witness generation");
  assert.equal(Number(state.total_cents), 135000, "the fact state reads the recovered extraction");
  assert.equal(state.extraction_id, chain[0].id, "…pinned to its id");

  // And the failed task is STILL terminal and untouched by the settlement.
  const failed = (await laneTasks(doc.documentId, "llm_witness")).find((x) => x.id === doc.taskId);
  assert.equal(failed.status, "failed", "the original failure is still on the record — recovery is not erasure");
});

test("[0051/F-A1 PR-3] a LATER re-extraction of a recovered document supersedes normally, WITHIN the witness lane", async (t) => {
  if (skip51(t)) return;
  const client = W.clients.A1;
  const doc = await failedWitnessDoc(W.users.alice, { client, cents: 135000 });
  await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "recover the failed attempt", opKey: opk("x51s") });
  await settleReextraction(doc.documentId, 135000);

  // From here the document is ordinary: the next request goes through the ORIGINAL door and
  // the supersede chain composes exactly as x1-supersede's first cell proves it does for a
  // document that never failed -- SAME-KIND supersede now genuinely applies (both generations
  // are llm_text_facts), unlike the cross-regime case that first cell exercises. This is what
  // "the recovery is not a special lineage" means.
  const again = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "the total was read short by RM 180", opKey: opk("x51s") });
  assert.equal(again.admission, "reextraction",
    "a recovered document is admitted through the ORDINARY door afterwards — the recovery "
    + "door fires at most once per document");
  await settleReextraction(doc.documentId, 153000);

  const both = await witnessExtractionsOf(doc.documentId);
  assert.equal(both.length, 2, "two llm_text_facts extractions now exist");
  const [older, newer] = both;
  assert.equal(newer.version_n, older.version_n + 1, "…at consecutive versions");
  assert.equal(older.superseded_by, newer.id, "…with the recovered one superseded by the corrected one");
  assert.equal(newer.superseded_by, null, "…and the corrected one live");
  assert.equal(await authoritativeExtraction(doc.documentId), newer.id, "…and authoritative");
  const state = (await rootQuery("select clara._invoice_fact_state($1) as s", [doc.documentId])).rows[0].s;
  assert.equal(state.regime, "witness");
  assert.equal(Number(state.total_cents), 153000, "…and the fact state reads the corrected figure");
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
