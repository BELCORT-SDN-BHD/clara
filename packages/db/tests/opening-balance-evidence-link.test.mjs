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
  CLR, EVIDENCE_REASON, assertPair, attachEntryEvidence, attachEntryEvidenceOn, linksForDocument,
  postedEntriesOnDocument, entryStatus, draftEntryV3,
  // #821
  gateOpeningWall,
  // #854 — the two-session driver (see the section-4 header there for `isolation`/`commitOrCapture`)
  humanHoldThenContend,
} from "./coding-lane-evidence-link-fixtures.mjs";
import { approveEntry, createClient, freshResolution } from "./rig-fixtures.mjs";
import {
  buildWaveBWorld, seedOpeningCoa, stageBeeSet,
  approveOpeningSeed, approveOpeningSeedOn, planRevision, WB_COA,
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

// ===========================================================================================
// 4 · #854 — THE TWO-SESSION RACE. Every cell above drives obw.evidence_first sequentially, in
// ONE session: the loser's refusal is real, but nothing PROVES the winner's lock is what stopped
// it (a schedule that never blocked proves nothing about a race — the same standard
// coding-lane-evidence-link.test.mjs's `cle.race.*` cells hold themselves to). `humanHoldThenContend`
// drives both arrival orders for real, each proving the contender genuinely BLOCKED on a LOCK.
//
// THE LOCK-ORDER PARAGRAPH, restated once here (0213's own header, and 0037:2414 / 0197 §B/§C
// before it): the opening approver reaches the evidence wall holding the entry's OWN row lock
// first (`select ... for update` on the opening item, 0037:2414), then takes the document lock —
// the SAME order the coding lane's `approve_entry` already takes (0197 §B/§C), so #854 adds no
// new lock pair to the estate. `attach_entry_evidence` takes the document lock directly, with no
// entry-row lock ahead of it. ACCEPTED OUTCOME: with that shared order, the two doors only ever
// contend on ONE lock (`clara.documents`, `for update`, `clara._lock_document_binding`), never on
// each other's row locks in reverse — a genuine DEADLOCK between them is not reachable, so no
// side's abort is ever "a deadlock's documented outcome".
//
// WHAT #854 FOUND, MEASURED TWICE ON THIS RIG (below): `clara.documents` is locked FOR UPDATE by
// both lanes PURELY for serialization — neither lane's body ever changes a column on that row.
// BOTH sides commit: `attach_entry_evidence` (plain, holds first) commits a document it only
// LOCKED (never wrote); the blocked `approve_opening_seed` (SERIALIZABLE, contends) is then
// granted the SAME, byte-identical row, sees no reason to abort, and evaluates
// `clara._document_posting_entry` against a snapshot taken BEFORE the attachment committed —
// which does not see the evidence link at all. The reverse order does not have this hole, because
// there the contender (`attach_entry_evidence`) is plain READ COMMITTED, which always re-reads
// fresh per statement once unblocked — no isolation trick is needed or possible for it to see
// what committed while it waited.
//
// MECHANISM (this lane's OWN READING of the measurement above, not a cited fact — flagged per
// L04-S07): a plausible account is that PostgreSQL's SERIALIZABLE "second updater" protection
// (the one thing that would force a re-read after waiting out a FOR UPDATE) fires only when the
// row waited on was ACTUALLY updated or deleted by the lock holder, never merely locked and
// released — that would explain why a lock-only commit does not force the waiter to re-evaluate.
// An at-least-equally-plausible alternative this lane did NOT rule out: SSI aborts a transaction
// only when it sits at the PIVOT of a dangerous structure (an incoming AND an outgoing
// rw-antidependency, PostgreSQL docs, "Serializable Isolation Level"); a single rw-conflict here
// may simply not be the shape SSI polices at all, which has nothing to do with the second-updater
// rule. Either way, the MEASUREMENT above (both sides commit, reproduced twice, deterministic)
// stands on its own; a successor ticket repairing this should not assume either causal account
// without checking the PostgreSQL source or asking a core committer.
//
// obw.race.evidence_then_opening below is written to PROVE this defect, not to paper over it —
// #854's own brief anticipates exactly this ("if both sides can commit, that is a new defect for
// its own ticket") and puts repairing either wall, either approver or the document lock helper
// explicitly OUT OF SCOPE for this ticket. Filed as a follow-up in this ticket's final report; the
// cell stands as the regression sentinel until that follow-up lands.
//
// CLOSING NOTES, code-review round 2 (findings recorded here rather than answered with new code —
// neither changes an assertion):
//
// L04B-SPEC-04 — AC2's literal wording is "reads standing postings off committed rows and asserts
// exactly ONE". Neither race cell asserts a bare 1: `obw.race.opening_then_evidence` asserts
// `s.drafts.all.length` (>= 3 by the seed's own mandatory multi-item setup, `obw.siblings_ok`) and
// `obw.race.evidence_then_opening` asserts `s.drafts.all.length + 1`. This is a deliberate
// reinterpretation, not an oversight: #821's whole carve-out is that MANY opening items legitimately
// share one tie document, so "exactly one" can only mean "exactly the seed's own item count and
// nothing else" — a single-item opening seed is not a shape this battery (or wb-fixtures.mjs's own
// multi-item seed builder) can construct without weakening the multi-item coverage the ticket also
// asks for. In the second arrival order, the count that actually stands (`+ 1`) IS the measured
// defect this file's finding section names and L04B-SPEC-01 tracks — it is not a looser reading of
// AC2, it is AC2's own assertion catching the regression it exists to catch.
//
// L04B-SPEC-07 — `approve_opening_correction`, named beside `approve_opening_seed` in the brief's
// "Key interfaces" as one of "the contending doors", is never driven by either race cell; both call
// `approveOpeningSeedOn` only. One-line check of whether the correction door reaches the SAME lock
// path: `clara.approve_opening_correction` (0017:4162) loops over its draft correction entries and
// calls `clara._approve_opening_entry(p_seed, e.id, ...)` for each one (0017:4241) — the EXACT SAME
// helper `clara.approve_opening_seed` calls per item (0017:3962). `_approve_opening_entry`'s own
// UPDATE into `journal_entries` (status -> approved) is what fires `t_source_binding_wall_upd`
// (0213), which takes `clara._lock_document_binding` FIRST regardless of which approver's UPDATE
// tripped it. So YES: the correction door shares the exact lock path the seed door does, and the
// double-posting hole L04B-SPEC-01 measures on the seed door is architecturally reachable from the
// correction door too — untested here, and named explicitly in GitHub issue #1014
// (L04B-SPEC-01's required_fix), the residual this ticket's report asked the integrator to file.

/** Asserts the loser's refusal against `expectedShape`, one of the two shapes #854's brief
 *  names: `"CLR13"` (the wall's own `source_already_posted`, a statement-time refusal, same as
 *  every sequential cell above) or `"40001"` (a bare SERIALIZABLE commit-time discovery —
 *  Postgres's own machinery, not this estate's typed refusal, so it carries no `detail.reason`).
 *  The disjunction lives ONLY here, in the helper's contract: which shape a given arrival order
 *  produces IS the finding (#854's brief, verbatim), so each CALL SITE pins the shape it actually
 *  observed on this rig (L04-S06) rather than accepting either — a future change that makes an
 *  arrival order's loser fail a different way than the one this file recorded reds here, by
 *  name, instead of passing silently under the disjunction. */
function assertLoserRefusal(loser, label, expectedShape) {
  assert.equal(loser.ok, false, `${label}: the contender loses`);
  assert.ok(expectedShape === "CLR13" || expectedShape === "40001",
    `assertLoserRefusal(${label}): expectedShape must be "CLR13" or "40001", got ${JSON.stringify(expectedShape)}`);
  const shape = loser.code === "40001" ? "40001" : "CLR13";
  assert.equal(shape, expectedShape,
    `${label}: expected the ${expectedShape} refusal shape; this rig produced ${shape} `
    + `(${JSON.stringify(loser)}) — see assertLoserRefusal's own header for what each shape means`);
  if (shape === "40001") {
    assert.equal(loser.detail?.reason, undefined,
      `${label}: a bare serialization failure carries no typed reason (got ${JSON.stringify(loser.detail)})`);
    return "40001";
  }
  assert.equal(loser.code, CLR.conflict, `${label}: …CLR13`);
  assert.equal(loser.detail.reason, EVIDENCE_REASON.sourceAlreadyPosted,
    `${label}: …source_already_posted, the same token the sequential cells raise`);
  return "CLR13";
}

test("obw.race.opening_then_evidence the opening approval holds; the evidence attachment BLOCKS on it and loses", async (t) => {
  if (await gateOpeningWall(t)) return;
  const s = await stagedSeed("race-oe");
  const host = await postedDocumentless(s.client);
  const rev = await planRevision(s.plan);

  const out = await humanHoldThenContend({
    a: {
      jwtSub: HANA(), isolation: "serializable",
      run: (c) => approveOpeningSeedOn(c, {
        seed: s.seed, planRevision: rev, tieSha256: s.doc.sha256,
        entryRevisions: s.revMap, opKey: opk("w854-race-opening") }),
    },
    b: {
      jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: host.entry_id, document: s.doc.documentId,
        expectedRevision: host.revision_token, opKey: opk("w854-race-attach") }),
    },
  });

  assert.equal(out.a.ok, true, `race.opening_then_evidence: the opening approval holds (${JSON.stringify(out.a)})`);
  assert.equal(out.provedBlocked, true,
    "race.opening_then_evidence: the attachment must WAIT on the opening approval's document lock "
    + `— a schedule that never blocked proves nothing (wait_event_type ${out.waitEventType}/${out.waitEvent})`);
  assert.equal(out.waitEventType, "Lock", "race.opening_then_evidence: …on a LOCK");
  const shape = assertLoserRefusal(out.b, "race.opening_then_evidence", "CLR13");

  // MULTI-ITEM AWARE: the winner is a whole opening SEED (`s.drafts.all.length` items, all bound
  // to the same tie document by design — obw.siblings_ok above), not a single entry, so the
  // correct count here is the SEED's own item count, never a bare 1.
  const standing = await postedEntriesOnDocument(s.doc.documentId);
  assert.equal(standing.length, s.drafts.all.length,
    `race.opening_then_evidence: every opening item posted and NOTHING else (got ${JSON.stringify(standing)}, shape=${shape})`);
  for (const row of standing) {
    assert.ok(s.drafts.all.some((d) => d.entry_id === row.id),
      `race.opening_then_evidence: ${row.id} is one of the seed's own items, not the loser's host entry`);
  }
  assert.equal((await entryStatus(host.entry_id)).status, "approved",
    "race.opening_then_evidence: the host entry itself is untouched — it was already posted "
    + "documentless before the race and the LATE ATTACHMENT is what lost, not the host entry");
  assert.equal((await linksForDocument(s.doc.documentId)).length, 0,
    "race.opening_then_evidence: no evidence link was written — the loser wrote nothing");
});

test("obw.race.evidence_then_opening #854 FINDING: the evidence attachment holds and the opening approval BLOCKS on it, proves it, then BOTH commit — a double posting this ticket did not repair (out of scope: see the file header)", async (t) => {
  if (await gateOpeningWall(t)) return;
  const s = await stagedSeed("race-eo");
  const host = await postedDocumentless(s.client);
  const rev = await planRevision(s.plan);

  const out = await humanHoldThenContend({
    a: {
      jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: host.entry_id, document: s.doc.documentId,
        expectedRevision: host.revision_token, opKey: opk("w854-race-attach") }),
    },
    b: {
      jwtSub: HANA(), isolation: "serializable",
      run: (c) => approveOpeningSeedOn(c, {
        seed: s.seed, planRevision: rev, tieSha256: s.doc.sha256,
        entryRevisions: s.revMap, opKey: opk("w854-race-opening") }),
    },
  });

  assert.equal(out.a.ok, true, `race.evidence_then_opening: the evidence attachment holds (${JSON.stringify(out.a)})`);
  assert.equal(out.provedBlocked, true,
    "race.evidence_then_opening: the opening approval must WAIT on the attachment's document lock "
    + `— a schedule that never blocked proves nothing (wait_event_type ${out.waitEventType}/${out.waitEvent})`);
  assert.equal(out.waitEventType, "Lock", "race.evidence_then_opening: …on a LOCK (waitEvent "
    + `${out.waitEvent} — "transactionid" on this rig: waiting on a still-open FOR UPDATE holder,`
    + " never a serialization-safe re-read)");

  // THE FINDING, asserted rather than hidden: the opening approval is NOT refused. It BLOCKED
  // (proved above), then — once granted `clara.documents`' FOR UPDATE lock unchanged in content —
  // committed against its OWN pre-attachment snapshot, which never saw the live link. If a future
  // fix (successor ticket) makes it lose instead, this assertion is the one to update; a
  // regression back to "both commit" after that fix is what this cell exists to catch too.
  assert.equal(out.b.ok, true,
    `race.evidence_then_opening: MEASURED, not a repair target here — the opening approval also `
    + `commits (${JSON.stringify(out.b)}). #854's brief: "if both sides can commit, that is a new `
    + `defect for its own ticket" — filed in this ticket's report, repair explicitly out of scope.`);

  const standing = await postedEntriesOnDocument(s.doc.documentId);
  assert.equal(standing.length, s.drafts.all.length + 1,
    `race.evidence_then_opening: DOUBLE POSTING — the host entry (via its evidence link) AND `
    + `every opening item all stand on the ONE tie document (got ${JSON.stringify(standing)}); `
    + "the wall this migration (0213) exists to enforce did not hold in this arrival order");
  assert.ok(standing.some((r) => r.id === host.entry_id && r.linked === true),
    "race.evidence_then_opening: the host entry's link is live and counted");
  for (const d of s.drafts.all) {
    assert.ok(standing.some((r) => r.id === d.entry_id),
      "race.evidence_then_opening: every opening item ALSO posted, not merely drafted — the "
      + "batch was not refused");
    assert.equal((await entryStatus(d.entry_id)).status, "approved",
      "race.evidence_then_opening: …approved, not draft (contrast obw.evidence_first's sequential "
      + "cell, where the SAME shape correctly leaves the batch a draft)");
  }
  assert.equal((await linksForDocument(s.doc.documentId)).length, 1,
    "race.evidence_then_opening: the evidence link ALSO stands, live");
});
