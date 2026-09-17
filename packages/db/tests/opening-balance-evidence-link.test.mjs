// #821 — THE OPENING-BALANCE LANE LOOKS BACK AT THE EVIDENCE LINKS (the residual #718 left open).
//
// Frontier-gated on the `opening_balance_evidence_link_wall$` stem, so a `db-slice-frontiers` leg
// pinned between 0197 and this migration records a COUNTED SKIP instead of a red.
//
// WHAT THIS FILE IS ABOUT. #718 walled the DOCUMENT-CODING lane against a live evidence link and
// deliberately carved the opening lane OUT of it, because wave-B's opening seed binds MANY
// opening items to ONE tie document by design. That carve-out left the reverse direction open:
// bind a document through the evidence lane, then run an opening seed tied to that SAME document,
// and the estate ends with two live postings ranked on one document. #821 closes exactly that,
// and nothing else: sibling opening items on one tie document stay legal, which is what the
// multi-item cell below (and `wb-k-approval`, and `x42.s5.2c`) keep honest.
//
// EVERY CLAIM IS READ OFF THE COMMITTED ROWS through `postedEntriesOnDocument`, never off a
// door's own answer.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount,
  CLR, EVIDENCE_REASON, assertPair, attachEntryEvidence, linksForDocument,
  postedEntriesOnDocument, entryStatus, draftEntryV3,
  // #821
  gateOpeningWall,
} from "./coding-lane-evidence-link-fixtures.mjs";
import { approveEntry, createClient, freshResolution } from "./rig-fixtures.mjs";
import {
  buildWaveBWorld, seedOpeningCoa, stageBeeSet,
  approveOpeningSeed, planRevision, WB_COA,
} from "./wave-b/wb-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWaveBWorld();
});
after(async () => {
  printLaneNotes("opening-balance-evidence-link");
  printSkipCount("opening-balance-evidence-link");
  await endPool();
});

const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice;   // owner, firm A — the CHECKER of the plain entry
const BOB = () => world.users.bob;       // bookkeeper, firm A — the MAKER everywhere
const HANA = () => world.users.hana;     // admin, firm A — the opening seed's CHECKER

/** A staged, UNAPPROVED opening seed of a FRESH client, tie document and all.
 *
 *  THE CLIENT IS ACTIVE, not an onboarding birth, and that is a requirement rather than a
 *  preference: WB-R1 refuses `draft_entry` on an onboarding client ("operational consumers
 *  exclude onboarding/archived clients"), and this battery must post a plain entry through the
 *  human lane to have something for the evidence door to attach to. `createClient` births the
 *  client THROUGH the estate's own doors and the rig's activation bridge, so it carries both the
 *  onboarding plan `create_opening_seed` requires and the active status `draft_entry` requires. */
async function stagedSeed(label) {
  const client = await createClient(ALICE(),
    { name: `w821_${label}_${opk("cli").slice(-12)}`, opKey: opk("w821-cli") });
  const plan = (await rootQuery(
    "select id from clara.onboarding_plans where client_id=$1 order by created_at limit 1",
    [client])).rows[0]?.id;
  assert.ok(plan, "mandatory setup: the client birth left the onboarding plan the opening seed hangs on");
  await seedOpeningCoa(ALICE(), client);
  const st = await stageBeeSet(BOB(), { firm: FIRM_A(), client, plan });
  return { client, plan, ...st };
}

/** A posted, DOCUMENTLESS entry of this client — the host a late attachment needs. Maker and
 *  checker are different people on purpose, so `approve_entry`'s high-stakes arm never decides
 *  the cell instead of this ticket's wall. */
async function postedDocumentless(client, { cents = 25_000 } = {}) {
  const draft = await draftEntryV3(BOB(), {
    client,
    resolution: freshResolution(BOB(), client),
    memo: `#821 rig host ${opk("memo")}`,
    lines: [
      { account_code: WB_COA.expense, debit_cents: cents, credit_cents: 0, description: "host-exp" },
      { account_code: WB_COA.cash, debit_cents: 0, credit_cents: cents, description: "host-cash" },
    ],
    opKey: opk("w821-draft"),
  });
  const ok = await approveEntry(ALICE(), {
    entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("w821-approve"),
  });
  assert.equal(ok.status, "approved", `mandatory setup: the host entry posts (${JSON.stringify(ok)})`);
  return { entry_id: draft.entry_id, revision_token: (await entryStatus(draft.entry_id)).revision_token };
}

// ===========================================================================================
// 1 · The direction #718 left open: evidence first, then the OPENING approval.
// ===========================================================================================

test("obw.evidence_first a live evidence link refuses the OPENING approval — CLR13 source_already_posted, naming the link's entry", async (t) => {
  if (await gateOpeningWall(t)) return;
  const s = await stagedSeed("ef");
  const host = await postedDocumentless(s.client);

  // THE EVIDENCE LANE BINDS THE TIE DOCUMENT WHILE IT IS STILL FREE. Nothing is approved on it
  // yet, so #718's evidence wall lets this through — which is precisely the state #821 is about.
  const link = await attachEntryEvidence(BOB(), {
    entry: host.entry_id, document: s.doc.documentId, expectedRevision: host.revision_token });
  assert.equal(link.attached, true, `mandatory setup: the late door bound the tie document (${JSON.stringify(link)})`);
  const live = await linksForDocument(s.doc.documentId);
  assert.equal(live.length, 1, "evidence_first: one live link stands on the tie document");
  assert.equal(live[0].released_at, null, "evidence_first: …and it is LIVE, which is what makes it a conflict");

  const { detail, err } = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    async () => approveOpeningSeed(HANA(), {
      seed: s.seed, planRevision: await planRevision(s.plan), tieSha256: s.doc.sha256,
      entryRevisions: s.revMap, opKey: opk("w821-apr") }),
    "obw.evidence_first");
  assert.notEqual(err.code, "23505",
    "evidence_first: the refusal is TYPED — a bare unique violation carries no detail.reason");
  assert.equal(detail.entry_id, host.entry_id,
    "evidence_first: it names the entry the LINK stands for — the opening arm resolves its "
    + "conflict from the live link alone, never from a sibling opening item");
  assert.equal(detail.document_id, s.doc.documentId, "evidence_first: …and the document");
  assert.equal(detail.conflict, true, "evidence_first: …and it is flagged a conflict, as 0182's arms are");

  for (const d of s.drafts.all) {
    assert.equal((await entryStatus(d.entry_id)).status, "draft",
      "evidence_first: the refused batch is atomic — every opening item is still a draft");
  }
  const standing = await postedEntriesOnDocument(s.doc.documentId);
  assert.equal(standing.length, 1,
    `evidence_first: ONE posted entry on the document, not two (got ${JSON.stringify(standing)})`);
  assert.equal(standing[0].id, host.entry_id, "evidence_first: …and it is the one that was there first");
});

// ===========================================================================================
// 2 · ONE REFUSAL, ONE SPELLING. The wire vocabulary does not grow.
// ===========================================================================================

test("obw.same_spelling the opening refusal is byte-comparable to the evidence lane's own — same message, same detail keys", async (t) => {
  if (await gateOpeningWall(t)) return;
  const s = await stagedSeed("sp");
  const host = await postedDocumentless(s.client);
  await attachEntryEvidence(BOB(), {
    entry: host.entry_id, document: s.doc.documentId, expectedRevision: host.revision_token });

  const opening = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    async () => approveOpeningSeed(HANA(), {
      seed: s.seed, planRevision: await planRevision(s.plan), tieSha256: s.doc.sha256,
      entryRevisions: s.revMap, opKey: opk("w821-apr") }),
    "obw.same_spelling.opening");

  // THE COMPARAND, raised by the lane that already owns this refusal: a SECOND posted entry
  // trying to take the same document through the late door.
  const other = await postedDocumentless(s.client, { cents: 31_000 });
  const evidence = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    () => attachEntryEvidence(BOB(), { entry: other.entry_id, document: s.doc.documentId,
      expectedRevision: other.revision_token }),
    "obw.same_spelling.evidence");

  assert.equal(opening.err.code, evidence.err.code, "same_spelling: the same SQLSTATE");
  assert.equal(opening.err.message, evidence.err.message, "same_spelling: the same message, byte for byte");
  assert.deepEqual(Object.keys(opening.detail).sort(), Object.keys(evidence.detail).sort(),
    "same_spelling: the same detail KEYS — no new wire token is minted for this conflict");
  assert.equal(opening.detail.reason, evidence.detail.reason, "same_spelling: the same reason token");
  assert.equal(opening.detail.entry_id, host.entry_id, "same_spelling: both name the entry standing there");
  assert.equal(evidence.detail.entry_id, host.entry_id, "same_spelling: …the same one");
});

// ===========================================================================================
// 3 · WHAT MUST NOT CHANGE: one tie document, MANY opening items.
// ===========================================================================================

test("obw.siblings_ok a multi-item seed on ONE tie document still approves every item — a sibling opening item is not a conflict", async (t) => {
  if (await gateOpeningWall(t)) return;
  const s = await stagedSeed("sib");
  assert.ok(s.drafts.all.length >= 3,
    `mandatory setup: the seed really is multi-item (got ${s.drafts.all.length})`);
  assert.equal((await linksForDocument(s.doc.documentId)).length, 0,
    "siblings_ok: no evidence link stands on the tie document — the ONLY thing #821 refuses");

  const receipt = await approveOpeningSeed(HANA(), {
    seed: s.seed, planRevision: await planRevision(s.plan), tieSha256: s.doc.sha256,
    entryRevisions: s.revMap, opKey: opk("w821-sib") });
  assert.equal(receipt.status, "finalized", `siblings_ok: the batch finalized (${JSON.stringify(receipt)})`);
  for (const d of s.drafts.all) {
    assert.equal((await entryStatus(d.entry_id)).status, "approved",
      "siblings_ok: EVERY opening item approved against the one tie document");
  }
  const approved = await rootQuery(
    "select count(*)::int as n from clara.journal_entries where document_id=$1 and status='approved'"
    + " and is_opening_balance and reversed_by is null", [s.doc.documentId]);
  assert.equal(approved.rows[0].n, s.drafts.all.length,
    "siblings_ok: many opening items, one tie document — unchanged by #821");
});
