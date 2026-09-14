// #718 — THE DOCUMENT-CODING LANE LOOKS BACK AT THE EVIDENCE LINKS.
//
// Frontier-gated on the `coding_lane_evidence_link$` stem (and, through the fixtures it reuses,
// on #634's and #623's own stems), so a `db-slice-frontiers` leg pinned below this migration
// skips cleanly instead of failing.
//
// WHAT THIS FILE IS ABOUT. 0182 made "ONE DOCUMENT, ONE POSTED ENTRY" law from the WORK-EVIDENCE
// side only: admission, commit and the late door all ask `clara._document_posting_entry`, and
// `uq_entry_evidence_links_document` backs them structurally. The DOCUMENT-CODING lane
// (`draft_entry` -> `approve_entry`) never asked at all — it checked `journal_entries.filing_id`
// and nothing else — so a document already holding a LIVE evidence link could be coded and
// approved into a SECOND posted entry. #718 closes that, and demands the closure survive a
// two-session race in BOTH arrival orders.
//
// EVERY CLAIM BELOW IS READ OFF THE COMMITTED ROWS, never off a door's own answer: `postedEntries
// OnDocument` counts approved, not-reversed entries standing on one document through EITHER lane,
// and that count is the ticket. The doors are driven under the least-privileged roles the
// autodraft cells use — a signed-in bookkeeper drafts, a signed-in owner approves, the runtime
// role admits Work and a client-pinned wake credential posts it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, opk, rootQuery,
  WCHART, CLR, basis, assertPair, assertRaises, ROLES,
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry,
  evidenceDocument, docRef, EVIDENCE_REASON, attachEntryEvidence, attachEntryEvidenceOn,
  linksForDocument, linkCount, reverseEntry, holdThenContend, recordJournalEntryOn,
  // #718
  gateCodingLink, codedDraftOnDocument, approveCodedEntry, approveCodedEntryOn,
  postedEntriesOnDocument, entryStatus, wallCatalog, humanHoldThenContend,
} from "./coding-lane-evidence-link-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("coding-lane-evidence-link");
  printSkipCount("coding-lane-evidence-link");
  await endPool();
});

const A1 = () => world.clients.A1;
const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice;   // owner, firm A — the CHECKER
const BOB = () => world.users.bob;       // bookkeeper, firm A — the MAKER

/** A document of A1, plus a posted accounting-work entry that BINDS it through the evidence
 *  lane. Returns `{ doc, workEntry }`. */
async function boundByEvidence({ client = null, cents = 77000 } = {}) {
  const cli = client ?? A1();
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: cli });
  const b = basis({ cents, memo: `#718 evidence-first ${opk("memo")}` });
  const work = await admitJournalWork({
    client: cli, author: BOB(), basis: b, sourceRefs: [docRef(doc.documentId)] });
  await claimWorkRun({ task: work.task_id, runId: opk("w718-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: BOB(), client: cli });
  const posted = await wakeRecordJournalEntry(cred.secret, {
    client: cli, work: work.work_id, logicalOpId: work.logical_op_id, basis: b });
  return { doc, workEntry: posted.entry_id };
}

/** A posted, DOCUMENTLESS accounting-work entry of A1 — the subject a late attachment needs. */
async function postedDocumentless({ client = null, cents = 91000 } = {}) {
  const cli = client ?? A1();
  const b = basis({ cents, memo: `#718 documentless ${opk("memo")}` });
  const work = await admitJournalWork({ client: cli, author: BOB(), basis: b });
  await claimWorkRun({ task: work.task_id, runId: opk("w718-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: BOB(), client: cli });
  const posted = await wakeRecordJournalEntry(cred.secret, {
    client: cli, work: work.work_id, logicalOpId: work.logical_op_id, basis: b });
  return { entry_id: posted.entry_id, revision_token: posted.revision_token };
}

// ===========================================================================================
// 0 · The structural facts the battery leans on.
// ===========================================================================================

test("cle.wall the two walls exist, are trigger-only, and are reachable by no application role", async (t) => {
  if (await gateCodingLink(t)) return;
  const { fns, triggers } = await wallCatalog();
  assert.equal(fns.length, 3,
    "wall: the lock helper and BOTH wall bodies exist — a half-armed pair is a half-closed race");
  for (const f of fns) {
    assert.equal(f.owner, "clara_fn_owner", `wall: clara.${f.proname} is owned by clara_fn_owner`);
    assert.equal(f.prosecdef, true, `wall: clara.${f.proname} is SECURITY DEFINER`);
    assert.equal(f.public_exec, false, `wall: PUBLIC holds no EXECUTE on clara.${f.proname}`);
  }
  for (const role of [ROLES.authenticated, ROLES.runtime, ROLES.agentRo]) {
    const r = await rootQuery(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara'
          and p.proname in ('_lock_document_binding','_tf_source_binding_wall','_tf_evidence_link_binding_wall')
          and has_function_privilege($1, p.oid, 'execute')`, [role]);
    assert.equal(r.rows[0].n, 0, `wall: ${role} cannot EXECUTE any of the three — they are trigger-only`);
  }
  assert.deepEqual(triggers.map((x) => `${x.relname}.${x.tgname}`).sort(), [
    "entry_evidence_links.t_entry_evidence_links_binding_wall",
    "journal_entries.t_source_binding_wall_ins",
    "journal_entries.t_source_binding_wall_upd",
  ], "wall: BOTH lanes carry a wall — the coding lane alone would still lose the race");
  assert.ok(triggers.every((x) => x.before_row),
    "wall: every wall is a BEFORE ROW trigger — AFTER, the evidence wall's own row would mask "
    + "the coded entry it exists to find (rank 0 beats rank 1 under `order by rank limit 1`)");

  // THE OPENING-LANE CARVE-OUT, structurally. Wave-B's opening seed binds MANY opening items to
  // ONE tie document by design (clara._approve_opening_entry, 0037), so the CODING wall excludes
  // `is_opening_balance` rows — and the EVIDENCE wall does not, because a carve-out there would
  // weaken 0182 rather than preserve it. The behavioural proof that the carve-out is load-bearing
  // is packages/db/tests/x42-s5-residuals.test.mjs cell x42.s5.2c, which reds without it.
  const defs = await rootQuery(
    `select t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t
      where not t.tgisinternal and t.tgname in
        ('t_source_binding_wall_ins','t_source_binding_wall_upd','t_entry_evidence_links_binding_wall')`);
  for (const row of defs.rows) {
    const coding = row.tgname.startsWith("t_source_binding_wall");
    assert.equal(row.def.includes("is_opening_balance"), coding,
      `wall: ${row.tgname} ${coding ? "carves out" : "must NOT carve out"} the opening-balance lane`);
  }
});

// ===========================================================================================
// 1 · Evidence first, then coding — the direction #718 opened.
// ===========================================================================================

test("cle.evidence_first a live evidence link refuses the coded approval — CLR13 source_already_posted, naming the entry", async (t) => {
  if (await gateCodingLink(t)) return;
  const { doc, workEntry } = await boundByEvidence();
  assert.equal((await linksForDocument(doc.documentId)).length, 1,
    "evidence_first: the accounting-work commit bound the document");

  // THE DRAFT IS STILL ACCEPTED. #718 places the refusal on the APPROVAL path, and this asserts
  // that placement rather than assuming it: a draft is a proposal a human is about to look at,
  // and the conflicting link can be released by a reversal before they approve (cle.released).
  const coded = await codedDraftOnDocument(BOB(),
    { firm: FIRM_A(), client: A1(), chart: WCHART, document: doc });
  assert.equal((await entryStatus(coded.entry_id)).status, "draft",
    "evidence_first: the coding lane may still DRAFT on a bound document");

  const { detail, err } = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    () => approveCodedEntry(ALICE(),
      { entry: coded.entry_id, expectedRevision: coded.revision_token }),
    "evidence_first");
  assert.notEqual(err.code, "23505",
    "evidence_first: the refusal is TYPED — a bare unique violation carries no detail.reason and "
    + "every classifier reads it as an unmapped 500");
  assert.equal(detail.entry_id, workEntry,
    "evidence_first: it names the entry that already stands on the document, which is what turns "
    + "the refusal into a route to impact/correction");
  assert.equal(detail.document_id, doc.documentId, "evidence_first: …and the document");
  assert.equal(detail.conflict, true, "evidence_first: …and it is flagged a conflict, as 0182's arms are");

  assert.equal((await entryStatus(coded.entry_id)).status, "draft",
    "evidence_first: the refused draft is still a draft — nothing half-approved");
  const standing = await postedEntriesOnDocument(doc.documentId);
  assert.equal(standing.length, 1,
    `evidence_first: ONE posted entry on the document, not two (got ${JSON.stringify(standing)})`);
  assert.equal(standing[0].id, workEntry, "evidence_first: …and it is the one that was there first");
});

// ===========================================================================================
// 2 · Coding first, then evidence — 0182's own direction, asserted UNCHANGED.
// ===========================================================================================

test("cle.coding_first a posted coded entry still refuses both evidence doors — 0182's arms, unmoved", async (t) => {
  if (await gateCodingLink(t)) return;
  const coded = await codedDraftOnDocument(BOB(), { firm: FIRM_A(), client: A1(), chart: WCHART });
  await approveCodedEntry(ALICE(), { entry: coded.entry_id, expectedRevision: coded.revision_token });
  assert.equal((await entryStatus(coded.entry_id)).status, "approved", "coding_first: the coded entry is posted");
  const linksBefore = await linkCount(A1());

  // (a) ADMISSION. 0182's own pre-check, reached before anything durable is written: no Work is
  // minted, and no link exists for this trigger to have spoken about.
  const admitted = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    () => admitJournalWork({ client: A1(), author: BOB(), sourceRefs: [docRef(coded.documentId)] }),
    "coding_first.admit");
  assert.equal(admitted.detail.entry_id, coded.entry_id,
    "coding_first.admit: the admission arm names the coded entry — clara._document_posting_entry's "
    + "rank-1 arm, exactly as it did before #718");
  assert.equal(await linkCount(A1()), linksBefore,
    "coding_first.admit: admission writes NO link, so this refusal is 0182's and not the new wall's");

  // (b) THE LATE DOOR, against a posted documentless entry. Same token, same shape.
  const host = await postedDocumentless();
  const attached = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    () => attachEntryEvidence(BOB(), { entry: host.entry_id, document: coded.documentId,
      expectedRevision: host.revision_token }),
    "coding_first.attach");
  assert.equal(attached.detail.entry_id, coded.entry_id, "coding_first.attach: it names the coded entry");
  assert.equal(await linkCount(A1()), linksBefore, "coding_first.attach: no link was written");
  assert.equal((await postedEntriesOnDocument(coded.documentId)).length, 1,
    "coding_first: ONE posted entry on the document");
});

test("cle.replay_untouched the late door's REPLAY arm still replays — the wall skips the row that is asking", async (t) => {
  if (await gateCodingLink(t)) return;
  // The guard that makes this pass (`v_posted <> new.entry_id`) is the difference between a wall
  // and a regression: without it, a lost-response retry of an attachment that ALREADY landed
  // would be refused as a conflict with itself.
  const host = await postedDocumentless();
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const first = await attachEntryEvidence(BOB(),
    { entry: host.entry_id, document: doc.documentId, expectedRevision: host.revision_token });
  assert.equal(first.attached, true, "replay_untouched: the first attachment lands");
  assert.equal(first.already_attached, false, "replay_untouched: …as a NEW link");
  const again = await attachEntryEvidence(BOB(),
    { entry: host.entry_id, document: doc.documentId, expectedRevision: host.revision_token });
  assert.equal(again.already_attached, true,
    "replay_untouched: the same entry and the same document REPLAY, exactly as 0182 answers");
  assert.equal((await linksForDocument(doc.documentId)).length, 1,
    "replay_untouched: and one link, not two");
});

// ===========================================================================================
// 3 · The two-session race — the half a check inside a writer body cannot buy.
// ===========================================================================================

test("cle.race.link_then_coding the evidence attachment holds; the coded approval BLOCKS on it and loses", async (t) => {
  if (await gateCodingLink(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const host = await postedDocumentless();
  const coded = await codedDraftOnDocument(BOB(),
    { firm: FIRM_A(), client: A1(), chart: WCHART, document: doc });

  const out = await humanHoldThenContend({
    a: {
      jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: host.entry_id, document: doc.documentId,
        expectedRevision: host.revision_token, opKey: opk("w718-race-attach") }),
    },
    b: {
      jwtSub: ALICE(),
      run: (c) => approveCodedEntryOn(c, { entry: coded.entry_id,
        expectedRevision: coded.revision_token, opKey: opk("w718-race-approve") }),
    },
  });

  assert.equal(out.a.ok, true, `race.link_then_coding: the holder attached (${JSON.stringify(out.a)})`);
  assert.equal(out.provedBlocked, true,
    "race.link_then_coding: the approval must WAIT on the holder's document lock — a schedule "
    + `that never blocked proves nothing about a race (wait_event_type ${out.waitEventType}/${out.waitEvent})`);
  assert.equal(out.waitEventType, "Lock",
    "race.link_then_coding: it waits on a LOCK, which is the serialization point this ticket added");
  assert.equal(out.b.ok, false, "race.link_then_coding: the approval loses");
  assert.equal(out.b.code, CLR.conflict, "race.link_then_coding: …CLR13");
  assert.equal(out.b.detail.reason, EVIDENCE_REASON.sourceAlreadyPosted,
    "race.link_then_coding: …source_already_posted, the same token the unraced direction raises");
  assert.equal(out.b.detail.entry_id, host.entry_id,
    "race.link_then_coding: …naming the entry the winner bound the document to");

  const standing = await postedEntriesOnDocument(doc.documentId);
  assert.equal(standing.length, 1,
    `race.link_then_coding: EXACTLY ONE posted entry (got ${JSON.stringify(standing)})`);
  assert.equal((await entryStatus(coded.entry_id)).status, "draft",
    "race.link_then_coding: the loser is still a draft");
});

test("cle.race.coding_then_link the coded approval holds; the evidence attachment BLOCKS on it and loses", async (t) => {
  if (await gateCodingLink(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const host = await postedDocumentless();
  const coded = await codedDraftOnDocument(BOB(),
    { firm: FIRM_A(), client: A1(), chart: WCHART, document: doc });

  // THE ORDER THAT AN ASYMMETRIC LOCK WOULD HAVE LOST. The attaching session ran its own
  // `_document_posting_entry` pre-check while the approval was still uncommitted — it saw a free
  // document. Only the wall's re-read UNDER the lock can catch it.
  const out = await humanHoldThenContend({
    a: {
      jwtSub: ALICE(),
      run: (c) => approveCodedEntryOn(c, { entry: coded.entry_id,
        expectedRevision: coded.revision_token, opKey: opk("w718-race-approve") }),
    },
    b: {
      jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: host.entry_id, document: doc.documentId,
        expectedRevision: host.revision_token, opKey: opk("w718-race-attach") }),
    },
  });

  assert.equal(out.a.ok, true, `race.coding_then_link: the holder approved (${JSON.stringify(out.a)})`);
  assert.equal(out.provedBlocked, true,
    "race.coding_then_link: the attachment must WAIT on the holder's document lock "
    + `(wait_event_type ${out.waitEventType}/${out.waitEvent})`);
  assert.equal(out.waitEventType, "Lock", "race.coding_then_link: …on a LOCK");
  assert.equal(out.b.ok, false, "race.coding_then_link: the attachment loses");
  assert.equal(out.b.code, CLR.conflict, "race.coding_then_link: …CLR13");
  assert.equal(out.b.detail.reason, EVIDENCE_REASON.sourceAlreadyPosted,
    "race.coding_then_link: …source_already_posted — the SAME token clara.attach_entry_evidence's "
    + "own unique_violation handler raises, so one refusal has one spelling however it is detected");
  assert.equal(out.b.detail.entry_id, coded.entry_id,
    "race.coding_then_link: …naming the coded entry that won");

  const standing = await postedEntriesOnDocument(doc.documentId);
  assert.equal(standing.length, 1,
    `race.coding_then_link: EXACTLY ONE posted entry (got ${JSON.stringify(standing)})`);
  assert.equal(standing[0].id, coded.entry_id, "race.coding_then_link: …the coded one, which won");
  assert.equal((await linksForDocument(doc.documentId)).length, 0,
    "race.coding_then_link: and no link was written");
});

test("cle.race.coding_then_work_commit the coded approval holds; the WORK COMMIT blocks on it and loses source_conflict/already_posted", async (t) => {
  if (await gateCodingLink(t)) return;
  // THE WORK_COMMIT ARM IS THE LOAD-BEARING ONE, and every cell above reaches the evidence wall
  // through `attach_entry_evidence` — i.e. its LATE_ATTACHMENT arm. Until this cell the
  // `work_commit` arm was only probed as a LITERAL in the migration's own tail census, which
  // proves the branch is written, never that it is reached or that it answers. The door that
  // reaches it is the one #634 runs in production: `wake_record_journal_entry`, whose link is the
  // only one in the estate that carries `attached_via = 'work_commit'` (0182:1009-1012).
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });

  // THE WORK IS ARMED FIRST, WHILE THE DOCUMENT IS STILL FREE. 0182's admission arm refuses a
  // Work whose source already backs a posted entry, so a coded entry that was already APPROVED
  // would be refused one statement earlier and this cell would test admission instead. Arming
  // before the approval is the race, not a way around it.
  const b = basis({ cents: 58000, memo: `#718 work-commit race ${opk("memo")}` });
  const work = await admitJournalWork({
    client: A1(), author: BOB(), basis: b, sourceRefs: [docRef(doc.documentId)] });
  await claimWorkRun({ task: work.task_id, runId: opk("w718-wc-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: BOB(), client: A1() });
  const coded = await codedDraftOnDocument(BOB(),
    { firm: FIRM_A(), client: A1(), chart: WCHART, document: doc });

  // 0182's OWN driver, because this race is wake-credential-on-one-side: `humanHoldThenContend`
  // enters both sides as signed-in humans and has no `wakeSecret` to give the commit door.
  const out = await holdThenContend({
    a: {
      role: ROLES.authenticated, jwtSub: ALICE(),
      run: (c) => approveCodedEntryOn(c, { entry: coded.entry_id,
        expectedRevision: coded.revision_token, opKey: opk("w718-wc-approve") }),
    },
    b: {
      role: ROLES.wakeInteractive, wakeSecret: cred.secret,
      run: (c) => recordJournalEntryOn(c, { client: A1(), work: work.work_id,
        logicalOpId: work.logical_op_id, basis: b }),
    },
  });

  assert.equal(out.a.ok, true, `race.work_commit: the holder approved (${JSON.stringify(out.a)})`);
  assert.equal(out.provedBlocked, true,
    "race.work_commit: the commit must WAIT on the holder's document lock — holdThenContend "
    + "reports true only for wait_event_type='Lock' AND pg_blocking_pids naming the holder's "
    + "backend, and a schedule that never blocked proves nothing about a race");
  assert.equal(out.b.ok, false, "race.work_commit: the commit loses");
  assert.equal(out.b.code, CLR.conflict,
    `race.work_commit: …CLR13, never a raw 23505 (got ${out.b.code}: ${out.b.message})`);
  assert.equal(out.b.detail.reason, EVIDENCE_REASON.sourceConflict,
    "race.work_commit: …IN THE VOICE OF THE DOOR THAT REACHED IT — source_conflict, the commit "
    + "path's own token, and NOT the late door's source_already_posted; an inverted arm would "
    + "deliver exactly that other spelling here");
  assert.equal(out.b.detail.constraint, "already_posted",
    "race.work_commit: …with the constraint name clara._agent_post_entry_core's own "
    + "unique_violation handler carries (0182:1014) — the late-attachment spelling carries none");
  assert.equal(out.b.detail.entry_id, coded.entry_id,
    "race.work_commit: …naming the coded entry that won the document");

  const standing = await postedEntriesOnDocument(doc.documentId);
  assert.equal(standing.length, 1,
    `race.work_commit: EXACTLY ONE posted entry (got ${JSON.stringify(standing)})`);
  assert.equal(standing[0].id, coded.entry_id, "race.work_commit: …the coded one, which won");
  // VACUITY CONTROL, and it is what lets this cell name the ARM rather than only the pair:
  // `uq_entry_evidence_links_document`'s own handler raises the SAME (source_conflict,
  // already_posted) pair (0182:1012-1018), so the assertions above would also pass if the index
  // had refused. NO link ever stood on this document — the winner is a CODED entry, which writes
  // none — so the index cannot have fired, and the only remaining producer of that pair is the
  // wall's work_commit branch.
  assert.equal((await linksForDocument(doc.documentId)).length, 0,
    "race.work_commit: no link was ever written on this document, so uq_entry_evidence_links_"
    + "document cannot be what refused — the refusal is the wall's work_commit arm");
});

// ===========================================================================================
// 4 · Release. THE THIRD MEASUREMENT (0182's header) still holds from this side.
// ===========================================================================================

test("cle.released a REVERSED entry releases its link, and the coded approval then stands", async (t) => {
  if (await gateCodingLink(t)) return;
  const { doc, workEntry } = await boundByEvidence({ cents: 64000 });
  const coded = await codedDraftOnDocument(BOB(),
    { firm: FIRM_A(), client: A1(), chart: WCHART, document: doc });
  await assertRaises(CLR.conflict,
    () => approveCodedEntry(ALICE(), { entry: coded.entry_id, expectedRevision: coded.revision_token }),
    "released.before");

  await reverseEntry(ALICE(), { entry: workEntry, reason: "#718 rig: posted in error" });
  const links = await linksForDocument(doc.documentId);
  assert.equal(links.length, 1, "released: the link is KEPT (the correction chain stays inspectable)");
  assert.ok(links[0].released_at != null, "released: …and released, which is what frees the document");

  const fresh = await entryStatus(coded.entry_id);
  const ok = await approveCodedEntry(ALICE(),
    { entry: coded.entry_id, expectedRevision: fresh.revision_token });
  assert.equal(ok.status, "approved",
    "released: a corrected coding may cite the same document — the wall reads the LIVE binding, "
    + "not the history of one");
  const standing = await postedEntriesOnDocument(doc.documentId);
  assert.equal(standing.length, 1, `released: still exactly one (got ${JSON.stringify(standing)})`);
  assert.equal(standing[0].id, coded.entry_id, "released: …and it is the coded entry that replaced it");
});
