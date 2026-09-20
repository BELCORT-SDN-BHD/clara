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
  // #1014 — the binding-claim frontier this file's repaired race cells stand on
  BINDING_CLAIM_STEM, gateBindingClaim,
} from "./coding-lane-evidence-link-fixtures.mjs";
import { approveEntry, createClient, freshResolution } from "./rig-fixtures.mjs";
import {
  buildWaveBWorld, seedOpeningCoa, stageBeeSet,
  approveOpeningSeed, approveOpeningSeedOn, planRevision, WB_COA,
} from "./wave-b/wb-fixtures.mjs";

const CLAIM_MIGRATION = "0235_opening_binding_claim.sql";

let world = null;
before(async () => {
  // #1014 — A FOCUSED RUN MUST NEVER SKIP SILENTLY. The estate sweep preloads
  // ./tests/opening-binding-claim-preintegration-gate.mjs and every claim cell then skips,
  // counted; a focused invocation against a chain below 0235 fails HERE instead.
  const at = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [BINDING_CLAIM_STEM]);
  if (at.rows[0].n === 0 && process.env.CLARA_ALLOW_MISSING_OPENING_BINDING_CLAIM !== "1") {
    throw new Error(
      `opening-balance-evidence-link premise ${CLAIM_MIGRATION} is not applied (no `
      + `${BINDING_CLAIM_STEM} row in clara.schema_migrations) and `
      + "CLARA_ALLOW_MISSING_OPENING_BINDING_CLAIM is unset -- this is a FOCUSED run and must fail "
      + "loudly, not skip. Preload ./tests/opening-binding-claim-preintegration-gate.mjs for an "
      + "estate sweep against a pre-PR chain.");
  }
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

test("obw.race.evidence_then_opening #1014: the evidence attachment holds, the opening approval BLOCKS on it and LOSES — exactly one side commits in THIS arrival order too", async (t) => {
  if (await gateOpeningWall(t)) return;
  if (await gateBindingClaim(t)) return;
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
    + `${out.waitEvent} — "transactionid" on this rig: waiting on a still-open FOR UPDATE holder)`);

  // THE REPAIR, asserted as OUTCOME rather than as mechanism: the side that took the document
  // binding FIRST keeps it, and the side that blocked on it does NOT commit. #854 measured the
  // opposite here (both committed); the shape of the loser's refusal is pinned by
  // obw.race.typed_refusal below, so this cell stays about WHO WINS.
  assert.equal(out.b.ok, false,
    "race.evidence_then_opening: the opening approval LOSES — it blocked on a document whose "
    + "binding another session had already taken, and the evidence wall exists so that exactly "
    + `one of the two can stand on it (${JSON.stringify(out.b)})`);
  assertLoserRefusal(out.b, "race.evidence_then_opening", "CLR13");

  const standing = await postedEntriesOnDocument(s.doc.documentId);
  assert.equal(standing.length, 1,
    "race.evidence_then_opening: ONE posted entry stands on the tie document, not the host entry "
    + `AND every opening item (got ${JSON.stringify(standing)})`);
  assert.equal(standing[0].id, host.entry_id,
    "race.evidence_then_opening: …and it is the winner — the host entry, through the evidence "
    + "link the attaching session committed first");
  assert.equal(standing[0].linked, true, "race.evidence_then_opening: …counted through its LIVE link");
  for (const d of s.drafts.all) {
    assert.equal((await entryStatus(d.entry_id)).status, "draft",
      "race.evidence_then_opening: the refused batch is ATOMIC — every opening item is still a "
      + "draft, exactly as the sequential obw.evidence_first cell leaves it");
  }
  assert.equal((await linksForDocument(s.doc.documentId)).length, 1,
    "race.evidence_then_opening: the winner's evidence link stands, live and alone");
});

test("obw.race.typed_refusal the loser of the repaired race is refused in the WALL'S OWN VOICE — CLR13 source_already_posted, never a raw 40001", async (t) => {
  if (await gateOpeningWall(t)) return;
  if (await gateBindingClaim(t)) return;

  // THE RACE, driven exactly as obw.race.evidence_then_opening drives it. That cell owns WHO
  // wins; this one owns WHAT THE LOSER IS TOLD, which is a separate promise: a person meets this
  // refusal in the opening approve dialog, and Postgres's own 40001 says nothing they can act on.
  const raced = await stagedSeed("typed-eo");
  const racedHost = await postedDocumentless(raced.client);
  const racedRev = await planRevision(raced.plan);
  const out = await humanHoldThenContend({
    a: {
      jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: racedHost.entry_id, document: raced.doc.documentId,
        expectedRevision: racedHost.revision_token, opKey: opk("w1014-typed-attach") }),
    },
    b: {
      jwtSub: HANA(), isolation: "serializable",
      run: (c) => approveOpeningSeedOn(c, {
        seed: raced.seed, planRevision: racedRev, tieSha256: raced.doc.sha256,
        entryRevisions: raced.revMap, opKey: opk("w1014-typed-opening") }),
    },
  });
  assert.equal(out.a.ok, true, `typed_refusal: the attachment holds (${JSON.stringify(out.a)})`);
  assert.equal(out.provedBlocked, true,
    `typed_refusal: the opening approval genuinely BLOCKED (${out.waitEventType}/${out.waitEvent})`);
  assert.equal(out.b.ok, false, `typed_refusal: …and lost (${JSON.stringify(out.b)})`);

  assert.notEqual(out.b.code, "40001",
    `typed_refusal: NOT Postgres's own serialization failure — "could not serialize access due to `
    + "concurrent update\" is the mechanism, not something a person can act on "
    + `(${JSON.stringify(out.b)})`);
  assert.equal(out.b.code, CLR.conflict, "typed_refusal: the estate's own conflict code");
  assert.equal(out.b.detail.reason, EVIDENCE_REASON.sourceAlreadyPosted,
    "typed_refusal: …with the token the sequential cells raise, not a new one minted for a race");
  assert.equal(out.b.detail.document_id, raced.doc.documentId,
    "typed_refusal: …naming the document that was refused");
  assert.equal(out.b.detail.conflict, true, "typed_refusal: …flagged a conflict, as 0182's arms are");

  // THE COMPARAND: the SAME refusal reached sequentially, where the wall can see the link it is
  // refusing for. One spelling, raised from two places — the standard obw.same_spelling holds the
  // opening arm to against the evidence lane's own.
  const seq = await stagedSeed("typed-seq");
  const seqHost = await postedDocumentless(seq.client);
  await attachEntryEvidence(BOB(), { entry: seqHost.entry_id, document: seq.doc.documentId,
    expectedRevision: seqHost.revision_token });
  const sequential = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    async () => approveOpeningSeed(HANA(), {
      seed: seq.seed, planRevision: await planRevision(seq.plan), tieSha256: seq.doc.sha256,
      entryRevisions: seq.revMap, opKey: opk("w1014-typed-seq") }),
    "obw.race.typed_refusal.sequential");

  assert.equal(out.b.message, sequential.err.message,
    "typed_refusal: the raced refusal's message is byte-identical to the sequential one — a person "
    + "reading it cannot tell which schedule produced it, and should not have to");
  assert.deepEqual(Object.keys(out.b.detail).sort(), Object.keys(sequential.detail).sort(),
    "typed_refusal: the same detail KEYS — no wire token grows for the concurrent arm");

  // THE ONE HONEST DIFFERENCE, pinned so it stays deliberate: the sequential arm NAMES the entry
  // standing on the document; the raced one cannot. The winner committed after this transaction's
  // snapshot, and no read inside a SERIALIZABLE transaction can reach it — that is the isolation
  // level, not a gap in the wall. The key is present and null rather than absent, which is what
  // keeps the key-set assertion above true.
  assert.equal(sequential.detail.entry_id, seqHost.entry_id,
    "typed_refusal: sequentially the wall names the entry standing there");
  assert.equal(out.b.detail.entry_id, null,
    "typed_refusal: in the race it names the document and answers null for the entry, rather than "
    + "inventing one it cannot see");
});
