// #634 — OPTIONAL AND LATE EVIDENCE for the expert journal path.
//
// Frontier-gated on the `journal_work_evidence$` stem (and on #623's own stem for the Work verbs
// it drives), so `db-slice-frontiers` legs pinned below either migration skip cleanly.
//
// WHAT THIS FILE IS ABOUT. #634 asks for THREE entry points onto the same accounting fact —
// a Work admitted WITH a document, a Work admitted WITHOUT one, and a LATE attachment against an
// entry that is already posted — and demands that they "share stable intent/Work identity and
// cannot double post after retry; attachment conflict opens impact/correction rather than another
// effect". Those are claims about DATA, so every cell below reads the committed rows under the
// real least-privileged roles rather than trusting a verb's own answer.
//
// THE ONE STRUCTURAL FACT THE WHOLE BATTERY LEANS ON, asserted in its own cell: a POSTED entry is
// never rewritten. `clara._tf_entry_immutable` admits exactly {reversed_by, reversal_reason,
// updated_at} on an approved -> approved UPDATE, so evidence cannot be stored ON the entry and is
// stored BESIDE it in `clara.entry_evidence_links` — the same relation both entry points write.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount,
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry, freshWorkClient,
  basis, WCHART, REASON, CLR, assertPair, assertRaises, rootQuery, humanQuery, opk,
  workRow, receiptsForWork, entryCount,
  // #634
  gateEvidence, EVIDENCE_REASON, EVIDENCE_CLR, attachEntryEvidence, listEntryLinks,
  evidenceDocument, retireFiling, docRef, linksForEntry, linksForDocument, linkCount,
  entryRow, opReceiptCount, reverseEntry, holdThenContend, recordJournalEntryOn,
  attachEntryEvidenceOn, ROLES, withTxnOrNull, fileSameDocumentTo,
} from "./journal-work-evidence-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("journal-work-evidence");
  printSkipCount("journal-work-evidence");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const B1 = () => world.clients.B1;
const FIRM_A = () => world.firms.A;
const FIRM_B = () => world.firms.B;
const ALICE = () => world.users.alice;   // owner, firm A
const BOB = () => world.users.bob;       // bookkeeper, firm A
const CAROL = () => world.users.carol;   // viewer, firm A
const DAVE = () => world.users.dave;     // owner, firm B

/** Admit a Work (optionally with a document ref), claim its run, mint the run's credential. */
async function armed({ client = null, author = null, b = null, sourceRefs = [] } = {}) {
  const cli = client ?? A1();
  const who = author ?? BOB();
  const theBasis = b ?? basis();
  const work = await admitJournalWork({
    client: cli, author: who, basis: theBasis, sourceRefs });
  await claimWorkRun({ task: work.task_id, runId: opk("run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: who, client: cli });
  return { ...work, cred, client: cli, author: who, basis: theBasis };
}

const post = (a, over = {}) => wakeRecordJournalEntry(a.cred.secret, {
  client: a.client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis, ...over,
});

/** One posted, documentless entry of client A1 — the subject of the late-attachment cells. */
async function postedEntry({ client = null, cents = 120000 } = {}) {
  const a = await armed({ client, b: basis({ cents, memo: `w634 ${opk("memo")}` }) });
  const out = await post(a);
  return { ...a, entry_id: out.entry_id, revision_token: out.revision_token,
    receipt_id: out.receipt_id };
}

// ===========================================================================================
// 0 · The structural fact the design rests on.
// ===========================================================================================

test("w634.wall a POSTED entry is never rewritten — the approved->approved allowset is the reversal pair", async (t) => {
  if (await gateEvidence(t)) return;
  const r = await rootQuery(
    "select prosrc from pg_proc where oid='clara._tf_entry_immutable()'::regprocedure");
  const src = r.rows[0].prosrc;
  assert.ok(src.includes("array['reversed_by','reversal_reason','updated_at']"),
    "wall: the approved->approved allowset is still the three-column reversal pair — the whole "
    + "reason evidence lives beside the entry rather than on it");
  // …and the two CHECKs that make `document_id` the DOCUMENT-CODING lane's trio are still there.
  const c = await rootQuery(
    `select conname from pg_constraint where conrelid='clara.journal_entries'::regclass
       and conname in ('ck_je_doc_pair','ck_je_document_filing_pair')`);
  assert.equal(c.rows.length, 2,
    "wall: document_id is still paired with source_doc_sha256 AND filing_id, so it cannot be set alone");
});

test("w634.table entry_evidence_links is append-only, forced-RLS and carries NO DML grant", async (t) => {
  if (await gateEvidence(t)) return;
  const rls = await rootQuery(
    `select c.relrowsecurity as on, c.relforcerowsecurity as forced from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname='entry_evidence_links'`);
  assert.equal(rls.rows[0].on, true, "table: RLS on");
  assert.equal(rls.rows[0].forced, true, "table: RLS forced (the owner is not exempt)");
  const dml = await rootQuery(
    `select count(*)::int as n from information_schema.role_table_grants
      where table_schema='clara' and table_name='entry_evidence_links'
        and privilege_type in ('INSERT','UPDATE','DELETE') and grantee <> 'clara_fn_owner'`);
  assert.equal(dml.rows[0].n, 0,
    "table: every write rides a definer door — no application role holds DML");
  const uq = await rootQuery(
    `select indexdef from pg_indexes where schemaname='clara'
       and indexname='uq_entry_evidence_links_document'`);
  assert.equal(uq.rows.length, 1,
    "table: the ONE-DOCUMENT-ONE-ENTRY claim has a structural half, not only a door check");
});

// ===========================================================================================
// 1 · Admission with a document ref.
// ===========================================================================================

test("w634.admit.doc a valid client document rides the Work's source_refs", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const out = await admitJournalWork({
    client: A1(), author: BOB(), sourceRefs: [docRef(doc.documentId)] });
  assert.equal(out.replayed, false);
  const w = await workRow(out.work_id);
  assert.equal(w.source_refs.length, 1, "admit.doc: exactly the one ref");
  assert.equal(w.source_refs[0].kind, "document");
  assert.equal(w.source_refs[0].document_id, doc.documentId,
    "admit.doc: the document the human picked, verbatim");
});

test("w634.admit.documentless an EMPTY source_refs array is still admitted — evidence is optional", async (t) => {
  if (await gateEvidence(t)) return;
  const out = await admitJournalWork({ client: A1(), author: BOB(), sourceRefs: [] });
  const w = await workRow(out.work_id);
  assert.deepEqual(w.source_refs, [], "admit.documentless: no document, no fabricated one");
});

test("w634.admit.badref every malformed / foreign / retired ref is refused BY NAME, with its field", async (t) => {
  if (await gateEvidence(t)) return;
  const mine = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const otherClient = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A2() });
  const otherFirm = await evidenceDocument(DAVE(), { firm: FIRM_B(), client: B1() });
  const before = await entryCount(A1());

  const cases = [
    { refs: ["nope"], constraint: "object", field: "source_refs[1]", label: "not an object" },
    { refs: [{ kind: "invoice", document_id: mine.documentId }], constraint: "kind",
      field: "source_refs[1]", label: "unsupported kind" },
    { refs: [{ kind: "document" }], constraint: "document_id", field: "source_refs[1]",
      label: "no document id" },
    { refs: [{ kind: "document", document_id: "not-a-uuid" }], constraint: "uuid",
      field: "source_refs[1]", label: "malformed document id" },
    { refs: [docRef("00000000-0000-4000-8000-000000634aaa")], constraint: "not_filed",
      field: "source_refs[1]", label: "a uuid naming nothing" },
    { refs: [docRef(otherClient.documentId)], constraint: "not_filed", field: "source_refs[1]",
      label: "another CLIENT's document" },
    { refs: [docRef(otherFirm.documentId)], constraint: "not_filed", field: "source_refs[1]",
      label: "another FIRM's document" },
    // 1-BASED index, the estate's `with ordinality` convention: the SECOND element is [2].
    { refs: [{ kind: "chat_task", task_id: null }, docRef(otherClient.documentId)],
      constraint: "not_filed", field: "source_refs[2]", label: "the second element" },
    { refs: [docRef(mine.documentId), docRef(mine.documentId)],
      constraint: "at_most_one_document", field: "source_refs[2]", label: "two documents" },
  ];
  for (const c of cases) {
    const { detail } = await assertPair(CLR.badRequest, EVIDENCE_REASON.invalidSourceRef,
      () => admitJournalWork({ client: A1(), author: BOB(), sourceRefs: c.refs }),
      `admit.badref (${c.label})`);
    assert.equal(detail.field, c.field, `admit.badref (${c.label}): names the offending element`);
    assert.equal(detail.constraint, c.constraint, `admit.badref (${c.label}): names what was violated`);
  }

  // A RETIRED filing is no longer this client's document.
  const retiring = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  await retireFiling(ALICE(), { filing: retiring.filingId });
  const { detail } = await assertPair(CLR.badRequest, EVIDENCE_REASON.invalidSourceRef,
    () => admitJournalWork({ client: A1(), author: BOB(), sourceRefs: [docRef(retiring.documentId)] }),
    "admit.badref (retired filing)");
  assert.equal(detail.constraint, "not_filed");

  assert.equal(await entryCount(A1()), before,
    "admit.badref: not one refusal wrote a journal row");
});

test("w634.admit.chatlane a chat_task ref (the FROZEN chatTurn.v18 shape) is still admitted untouched", async (t) => {
  if (await gateEvidence(t)) return;
  const refs = [{ kind: "chat_task", task_id: null, session_id: null }];
  const out = await admitJournalWork({ client: A1(), author: BOB(), sourceRefs: refs,
    origin: "clara_interpreted" });
  const w = await workRow(out.work_id);
  assert.deepEqual(w.source_refs, refs,
    "admit.chatlane: the frozen lane's ref shape is stored verbatim — #634 widens, never narrows");
  assert.equal(w.basis_origin, "clara_interpreted");
});

// ===========================================================================================
// 2 · Intent identity — the evidence half of the payload.
// ===========================================================================================

test("w634.intent.replay the SAME key + SAME basis + SAME document replays; a CHANGED document conflicts", async (t) => {
  if (await gateEvidence(t)) return;
  const d1 = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const d2 = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const key = `w634-intent-${Date.now().toString(36)}`;

  const first = await admitJournalWork({
    client: A1(), author: BOB(), intentKey: key, sourceRefs: [docRef(d1.documentId)] });
  assert.equal(first.replayed, false);

  const again = await admitJournalWork({
    client: A1(), author: BOB(), intentKey: key, sourceRefs: [docRef(d1.documentId)] });
  assert.equal(again.replayed, true, "intent.replay: an identical resubmit is a replay…");
  assert.equal(again.work_id, first.work_id, "intent.replay: …of the SAME Work");

  // A DIFFERENT document under the SAME intent key is a CHANGED payload, not a replay: the
  // evidence is half of what makes this the same accounting act.
  const { detail } = await assertPair(CLR.badRequest, REASON.intentConflict,
    () => admitJournalWork({ client: A1(), author: BOB(), intentKey: key,
      sourceRefs: [docRef(d2.documentId)] }),
    "intent.replay (changed document)");
  assert.equal(detail.work_id, first.work_id,
    "intent.replay: the conflict names the Work so the human can open it");

  // …and DROPPING the document is equally a changed payload.
  await assertPair(CLR.badRequest, REASON.intentConflict,
    () => admitJournalWork({ client: A1(), author: BOB(), intentKey: key, sourceRefs: [] }),
    "intent.replay (document dropped)");

  const w = await workRow(first.work_id);
  assert.equal(w.source_refs[0].document_id, d1.documentId,
    "intent.replay: the stored Work still carries the document it was admitted with");
});

test("w634.intent.chatreplay a chat_task ref replays across DIFFERENT task ids (run identifiers are not intent)", async (t) => {
  if (await gateEvidence(t)) return;
  const key = `w634-chat-${Date.now().toString(36)}`;
  const first = await admitJournalWork({ client: A1(), author: BOB(), intentKey: key,
    sourceRefs: [{ kind: "chat_task", task_id: "11111111-1111-4111-8111-111111111111",
      session_id: "s-1" }] });
  const again = await admitJournalWork({ client: A1(), author: BOB(), intentKey: key,
    sourceRefs: [{ kind: "chat_task", task_id: "22222222-2222-4222-8222-222222222222",
      session_id: "s-2" }] });
  assert.equal(again.replayed, true,
    "intent.chatreplay: a re-run turn carries a new task id and is still the same accounting intent");
  assert.equal(again.work_id, first.work_id);
});

// ===========================================================================================
// 3 · One document, one posted entry — at admission and at commit.
// ===========================================================================================

test("w634.commit.doc the posted entry's evidence link names the document, the Work and the receipt", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const a = await armed({ sourceRefs: [docRef(doc.documentId)] });
  const before = await entryCount(A1());
  const out = await post(a);

  assert.equal(out.posted, true);
  assert.equal(out.document_id, doc.documentId, "commit.doc: the answer names the evidence");
  assert.equal(await entryCount(A1()), before + 1, "commit.doc: exactly ONE new entry");

  // THE ENTRY ITSELF IS UNTOUCHED by the document-coding trio: LAW 6 and ck_je_doc_pair.
  const e = await entryRow(out.entry_id);
  assert.equal(e.status, "approved");
  assert.equal(e.origin, "agent");
  assert.equal(e.document_id, null,
    "commit.doc: journal_entries.document_id stays NULL — that column is the coding lane's trio");
  assert.equal(e.filing_id, null);
  assert.equal(e.source_doc_sha256, null, "commit.doc: no fabricated document sha");

  const links = await linksForEntry(out.entry_id);
  assert.equal(links.length, 1, "commit.doc: exactly ONE evidence link");
  assert.equal(links[0].document_id, doc.documentId);
  assert.equal(links[0].work_id, a.work_id, "commit.doc: the link names the Work");
  assert.equal(links[0].receipt_id, out.receipt_id, "commit.doc: …and the operation receipt");
  assert.equal(links[0].attached_via, "work_commit");
  assert.equal(links[0].attached_by, BOB(),
    "commit.doc: attributed to the human whose authority was rechecked, not to the agent");
  assert.equal(links[0].logical_op_id, a.logical_op_id,
    "commit.doc: the link rides the Work's OWN operation identity");

  const receipts = await receiptsForWork(a.work_id);
  assert.equal(receipts.length, 1, "commit.doc: still ONE operation receipt");
  assert.equal(receipts[0].effects.entry_id, out.entry_id);
  assert.equal(receipts[0].effects.document_id, doc.documentId,
    "commit.doc: the receipt's effects carry the evidence");

  const w = await workRow(a.work_id);
  assert.equal(w.result.document_id, doc.documentId);
});

test("w634.commit.documentless a Work with no document posts EXACTLY as #623 left it, and writes no link", async (t) => {
  if (await gateEvidence(t)) return;
  const a = await armed();
  const out = await post(a);
  assert.equal(out.posted, true);
  assert.equal(out.document_id, null, "commit.documentless: honest null, not an empty slot");
  assert.equal((await linksForEntry(out.entry_id)).length, 0,
    "commit.documentless: no evidence relation row is invented");
  const receipts = await receiptsForWork(a.work_id);
  assert.equal(receipts[0].effects.document_id, undefined,
    "commit.documentless: the receipt's effects are byte-identical to 0178's");
  const e = await entryRow(out.entry_id);
  assert.equal(e.document_id, null);
});

test("w634.conflict.admission a document already backing a posted entry is refused AT ADMISSION — no second Work", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const first = await armed({ sourceRefs: [docRef(doc.documentId)] });
  const posted = await post(first);

  const workBefore = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id=$1", [A1()]);
  const { detail } = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    () => admitJournalWork({ client: A1(), author: BOB(), sourceRefs: [docRef(doc.documentId)] }),
    "conflict.admission");
  assert.equal(detail.entry_id, posted.entry_id,
    "conflict.admission: the refusal NAMES the entry that already stands on the document — that "
    + "is what opens impact/correction instead of another effect");
  assert.equal(detail.document_id, doc.documentId);
  assert.equal(detail.conflict, true);
  const workAfter = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id=$1", [A1()]);
  assert.equal(workAfter.rows[0].n, workBefore.rows[0].n,
    "conflict.admission: refused BEFORE anything durable — no Work, no run, no budget");
});

test("w634.conflict.commit a document posted by a SIBLING between admission and commit refuses source_conflict, no effect", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  // Two Works admitted against the SAME document, admitted before either commits — the race the
  // admission check alone cannot close.
  const slow = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 50000, memo: "w634 slow" }) });
  const fast = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 60000, memo: "w634 fast" }) });
  const won = await post(fast);

  const before = await entryCount(A1());
  const { detail } = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceConflict,
    () => post(slow), "conflict.commit");
  assert.equal(detail.constraint, "already_posted");
  assert.equal(detail.entry_id, won.entry_id, "conflict.commit: names the entry that won");
  assert.equal(await entryCount(A1()), before,
    "conflict.commit: a refused commit writes NOTHING — not a draft, not a line");
  assert.equal((await receiptsForWork(slow.work_id)).length, 0,
    "conflict.commit: …and no receipt");
  assert.equal((await linksForDocument(doc.documentId)).length, 1,
    "conflict.commit: the document still backs exactly one entry");
});

test("w634.conflict.retired a filing retired between admission and commit refuses source_conflict/not_filed", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const a = await armed({ sourceRefs: [docRef(doc.documentId)] });
  await retireFiling(ALICE(), { filing: doc.filingId });

  const before = await entryCount(A1());
  const { detail } = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceConflict,
    () => post(a), "conflict.retired");
  assert.equal(detail.constraint, "not_filed");
  assert.equal(detail.document_id, doc.documentId);
  assert.equal(await entryCount(A1()), before, "conflict.retired: nothing posted");
});

test("w634.commit.replay a COMMITTED identity replays its receipt even though its own link now holds the document", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const a = await armed({ sourceRefs: [docRef(doc.documentId)] });
  const first = await post(a);
  const before = await entryCount(A1());

  const again = await post(a);
  assert.equal(again.replayed, true,
    "commit.replay: idempotency wins over the source check — an entry already posted is never "
    + "re-diagnosed as a conflict with its own evidence");
  assert.equal(again.entry_id, first.entry_id);
  assert.equal(await entryCount(A1()), before, "commit.replay: no second entry");
  assert.equal((await linksForEntry(first.entry_id)).length, 1, "commit.replay: no second link");
});

// ===========================================================================================
// 4 · The LATE door.
// ===========================================================================================

test("w634.attach.happy a posted documentless entry gains its source, with NO financial effect", async (t) => {
  if (await gateEvidence(t)) return;
  const p = await postedEntry();
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const beforeEntry = await entryRow(p.entry_id);
  const beforeLines = await rootQuery(
    "select count(*)::int as n, coalesce(sum(debit_cents),0)::text as dr from clara.journal_lines where entry_id=$1",
    [p.entry_id]);

  const out = await attachEntryEvidence(BOB(), {
    entry: p.entry_id, document: doc.documentId, expectedRevision: p.revision_token });
  assert.equal(out.attached, true);
  assert.equal(out.document_id, doc.documentId);
  assert.equal(out.attached_via, "late_attachment");
  assert.equal(out.work_id, p.work_id,
    "attach.happy: the act is recorded UNDER THE SAME WORK the entry came from");
  assert.equal(out.logical_op_id, `work:${p.work_id}:attach_evidence:1`,
    "attach.happy: a stable operation identity, compared as a WHOLE STRING");

  const link = (await linksForEntry(p.entry_id))[0];
  assert.equal(link.document_id, doc.documentId);
  assert.equal(link.attached_via, "late_attachment");
  assert.equal(link.attached_by, BOB(), "attach.happy: attributed to the human who attached it");
  assert.equal(link.receipt_id, null,
    "attach.happy: a HUMAN act names no workflow run — clara.operation_receipts is an agent-run "
    + "shape (task_id/run_id/bundle_digest NOT NULL) and none of those may be invented");

  // NOT ONE COLUMN OF THE POSTED ENTRY MOVED.
  const afterEntry = await entryRow(p.entry_id);
  assert.deepEqual(afterEntry, beforeEntry,
    "attach.happy: the posted entry is byte-identical — LAW 6, and the revision token did not move");
  const afterLines = await rootQuery(
    "select count(*)::int as n, coalesce(sum(debit_cents),0)::text as dr from clara.journal_lines where entry_id=$1",
    [p.entry_id]);
  assert.deepEqual(afterLines.rows[0], beforeLines.rows[0], "attach.happy: no financial effect");
});

test("w634.attach.idempotent the SAME op key replays; the SAME document under a NEW key replays too", async (t) => {
  if (await gateEvidence(t)) return;
  const p = await postedEntry();
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const key = opk("w634-attach-idem");

  const first = await attachEntryEvidence(BOB(), {
    entry: p.entry_id, document: doc.documentId, expectedRevision: p.revision_token, opKey: key });
  const same = await attachEntryEvidence(BOB(), {
    entry: p.entry_id, document: doc.documentId, expectedRevision: p.revision_token, opKey: key });
  assert.equal(same.replayed, true, "attach.idempotent: a repeated op key reads the stored answer");
  assert.equal(same.link_id, first.link_id);

  // A LOST RESPONSE retried with a fresh key must be safe too: the same document is not a
  // conflict, it is the state the caller already asked for.
  const fresh = await attachEntryEvidence(BOB(), {
    entry: p.entry_id, document: doc.documentId, expectedRevision: p.revision_token });
  assert.equal(fresh.already_attached, true,
    "attach.idempotent: the same document under a new key answers honestly instead of refusing");
  assert.equal(fresh.link_id, first.link_id);
  assert.equal((await linksForEntry(p.entry_id)).length, 1,
    "attach.idempotent: exactly ONE link, however many times it was asked for");
});

test("w634.attach.refusals the whole matrix, each by name and with the input preserved", async (t) => {
  if (await gateEvidence(t)) return;
  const p = await postedEntry();
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const other = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const foreignClient = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A2() });

  // A blank op key is refused BEFORE any reservation.
  await assertPair(CLR.badRequest, EVIDENCE_REASON.invalidOpKey,
    () => attachEntryEvidence(BOB(), { entry: p.entry_id, document: doc.documentId,
      expectedRevision: p.revision_token, opKey: "   " }), "attach.blankkey");
  assert.equal(await opReceiptCount("attach_entry_evidence", "   "), 0,
    "attach.blankkey: nothing was reserved");

  // An entry of ANOTHER FIRM is not-found, never a different error.
  const dRow = await rootQuery(
    "select id from clara.journal_entries where client_id=$1 limit 1", [B1()]);
  if (dRow.rows[0]) {
    await assertPair(CLR.notFound, EVIDENCE_REASON.entryNotFound,
      () => attachEntryEvidence(BOB(), { entry: dRow.rows[0].id, document: doc.documentId,
        expectedRevision: p.revision_token }), "attach.crossfirm");
  }
  await assertPair(CLR.notFound, EVIDENCE_REASON.entryNotFound,
    () => attachEntryEvidence(BOB(), { entry: "00000000-0000-4000-8000-000000634bbb",
      document: doc.documentId, expectedRevision: p.revision_token }), "attach.absent");

  // A stale revision token.
  await assertPair(EVIDENCE_CLR.stale, EVIDENCE_REASON.staleRevision,
    () => attachEntryEvidence(BOB(), { entry: p.entry_id, document: doc.documentId,
      expectedRevision: "00000000-0000-4000-8000-000000634ccc" }), "attach.stale");

  // A document of another client of the SAME firm — no existence oracle, one token.
  await assertPair(CLR.badRequest, EVIDENCE_REASON.invalidSourceRef,
    () => attachEntryEvidence(BOB(), { entry: p.entry_id, document: foreignClient.documentId,
      expectedRevision: p.revision_token }), "attach.foreigndoc");

  // A VIEWER may not attach evidence (the bookkeeper floor is the door's own).
  await assertRaises(CLR.authz,
    () => attachEntryEvidence(CAROL(), { entry: p.entry_id, document: doc.documentId,
      expectedRevision: p.revision_token }), "attach.viewer");

  assert.equal((await linksForEntry(p.entry_id)).length, 0,
    "attach.refusals: not one refusal wrote a link");

  // Now attach for real, then prove the two CONFLICT arms.
  await attachEntryEvidence(BOB(), { entry: p.entry_id, document: doc.documentId,
    expectedRevision: p.revision_token });
  const already = await assertPair(CLR.conflict, EVIDENCE_REASON.evidenceAlreadyAttached,
    () => attachEntryEvidence(BOB(), { entry: p.entry_id, document: other.documentId,
      expectedRevision: p.revision_token }), "attach.alreadyattached");
  assert.equal(already.detail.document_id, doc.documentId,
    "attach.alreadyattached: names the document already standing there — impact/correction, not overwrite");

  const p2 = await postedEntry();
  const posted = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    () => attachEntryEvidence(BOB(), { entry: p2.entry_id, document: doc.documentId,
      expectedRevision: p2.revision_token }), "attach.sourceposted");
  assert.equal(posted.detail.entry_id, p.entry_id,
    "attach.sourceposted: names the entry that already stands on the document");
  assert.equal((await linksForDocument(doc.documentId)).length, 1,
    "attach.sourceposted: the document still backs exactly one entry");
});

test("w634.attach.notapproved a DRAFT entry refuses entry_not_approved by name", async (t) => {
  if (await gateEvidence(t)) return;
  // A draft reached through the estate's OWN human door, so the state under test is real.
  const client = await freshWorkClient(ALICE(), "w634draft");
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client });
  const res = await humanQuery(ALICE(),
    "select clara.record_client_resolution(p_client => $1::uuid, p_subject_kind => $2::text,"
    + " p_subject => $3::uuid, p_confidence => $4::numeric, p_method => $5::text,"
    + " p_evidence => $6::jsonb, p_op_key => $7::text) as result",
    [client, "manual", null, 0.99, "human", "{}", opk("w634-res")]);
  const drafted = await humanQuery(ALICE(),
    "select clara.draft_entry(p_client => $1::uuid, p_resolution => $2::uuid,"
    + " p_posting_date => $3::date, p_memo => $4::text, p_lines => $5::jsonb,"
    + " p_document => null::uuid, p_sha256 => null::text, p_flags => '{}'::jsonb,"
    + " p_op_key => $6::text) as result",
    [client, res.rows[0].result.resolution_id, "2026-09-01", "w634 draft",
      JSON.stringify([
        { account_code: WCHART.expense, debit_cents: 1000, credit_cents: 0 },
        { account_code: WCHART.bank, debit_cents: 0, credit_cents: 1000 }]),
      opk("w634-draft")]).catch((e) => ({ error: e }));
  if (drafted.error) {
    // The document lane's draft door has its own prerequisites; if this world cannot reach a
    // draft, say so rather than skipping silently.
    t.diagnostic(`attach.notapproved: draft_entry unavailable in this world (${drafted.error.code}: ${drafted.error.message})`);
    return;
  }
  const entryId = drafted.rows[0].result.entry_id;
  const rev = (await entryRow(entryId)).revision_token;
  const { detail } = await assertPair(CLR.conflict, EVIDENCE_REASON.entryNotApproved,
    () => attachEntryEvidence(ALICE(), { entry: entryId, document: doc.documentId,
      expectedRevision: rev }), "attach.notapproved");
  assert.equal(detail.status, "draft", "attach.notapproved: names the state that blocked it");
});

// ===========================================================================================
// 4b · LAW 6 AND THE DOCUMENT. A reversed entry must RELEASE its source, or the firm's own
// invoice is unusable for ever and the correction it exists for cannot be recorded.
// ===========================================================================================

test("w634.release.reversal reversing a document-backed entry frees the document for the correction", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const first = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 77700, memo: `w634 wrong period ${opk("memo")}` }) });
  const wrong = await post(first);
  const held = (await linksForEntry(wrong.entry_id))[0];
  assert.equal(held.released_at, null, "release: a live binding holds the document");

  const reversed = await reverseEntry(ALICE(), {
    entry: wrong.entry_id, reason: "w634: posted against the wrong period" });
  assert.equal(reversed.status, "approved", "release: LAW 6's own door posted the mirror");

  // 1 · THE LINK IS STAMPED, NOT DELETED AND NOT RE-POINTED.
  const after = (await linksForEntry(wrong.entry_id))[0];
  assert.ok(after.released_at, "release: the reversal RELEASED the binding");
  assert.equal(after.document_id, doc.documentId,
    "release: …and the row still names the document — the chain stays inspectable");
  assert.equal(after.entry_id, wrong.entry_id);
  assert.equal(after.attached_via, "work_commit", "release: nothing else about the act moved");

  // 2 · THE CORRECTED JV MAY CITE THE SAME INVOICE — admitted, and it COMMITS.
  const fixed = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 77700, memo: `w634 corrected ${opk("memo")}` }) });
  const posted = await post(fixed);
  assert.equal(posted.posted, true, "release: the correction posts");
  assert.equal(posted.document_id, doc.documentId,
    "release: …backed by the very document the reversed entry cited");
  const live = await linksForDocument(doc.documentId);
  assert.equal(live.length, 2, "release: two links — one released, one live");
  assert.equal(live.filter((r) => r.released_at === null).length, 1,
    "release: exactly ONE live binding, which is what the partial unique index enforces");

  // 3 · THE READ REPORTS BOTH HONESTLY.
  const rows = await listEntryLinks(BOB(), {
    client: A1(), entries: [wrong.entry_id, posted.entry_id] });
  const byId = Object.fromEntries(rows.map((r) => [r.entry_id, r]));
  assert.equal(byId[wrong.entry_id].document_id, doc.documentId);
  assert.ok(byId[wrong.entry_id].released_at,
    "release: the surface can tell a RELEASED binding from a live one");
  assert.equal(byId[wrong.entry_id].reversed_by, reversed.reversal_id);
  assert.equal(byId[posted.entry_id].document_id, doc.documentId);
  assert.equal(byId[posted.entry_id].released_at, null);
});

test("w634.release.late the late door attaches a released document to the replacement entry", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const first = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 51100, memo: `w634 late-release ${opk("memo")}` }) });
  const wrong = await post(first);
  await reverseEntry(ALICE(), { entry: wrong.entry_id, reason: "w634: wrong account" });

  const replacement = await postedEntry({ cents: 51100 });
  const out = await attachEntryEvidence(BOB(), {
    entry: replacement.entry_id, document: doc.documentId,
    expectedRevision: replacement.revision_token });
  assert.equal(out.attached, true,
    "release.late: a document freed by a reversal is attachable to the entry that replaced it");
  assert.equal(out.document_id, doc.documentId);
  assert.equal(out.attached_via, "late_attachment");
  assert.equal((await linksForDocument(doc.documentId)).filter((r) => r.released_at === null).length, 1,
    "release.late: still exactly one LIVE binding");
});

test("w634.release.reversed the late door refuses closed history and names the correction", async (t) => {
  if (await gateEvidence(t)) return;
  const p = await postedEntry({ cents: 62200 });
  const reversed = await reverseEntry(ALICE(), {
    entry: p.entry_id, reason: "w634: reversed before any source was named" });
  assert.equal(reversed.status, "approved");
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });

  // The reversed entry is STILL `approved` (LAW 6 reverses, it does not withdraw), so this is
  // its own token rather than `entry_not_approved`.
  const row = await entryRow(p.entry_id);
  assert.equal(row.status, "approved", "release.reversed: the state that makes the arm necessary");
  const { detail } = await assertPair(CLR.conflict, EVIDENCE_REASON.entryReversed,
    () => attachEntryEvidence(BOB(), { entry: p.entry_id, document: doc.documentId,
      expectedRevision: row.revision_token }), "release.reversed");
  assert.equal(detail.reversed_by, reversed.reversal_id,
    "release.reversed: the refusal names the entry that replaced this one");
  assert.equal((await linksForEntry(p.entry_id)).length, 0,
    "release.reversed: no link was written — a link here could never be released and would "
    + "strand the document for ever");
});

test("w634.release.appendonly released_at is the ONLY column that may ever move, and only once", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const other = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const a = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 33300, memo: `w634 belt ${opk("memo")}` }) });
  const out = await post(a);
  const link = (await linksForEntry(out.entry_id))[0];

  // Even as ROOT, through no door at all: the belt is a property of the data.
  const swap = await withTxnOrNull((c) => c.query(
    "update clara.entry_evidence_links set document_id=$2 where id=$1", [link.id, other.documentId]));
  assert.equal(swap.error?.code, "CLR08",
    "release.appendonly: a link is never re-pointed at another document");
  const smuggle = await withTxnOrNull((c) => c.query(
    "update clara.entry_evidence_links set released_at=now(), document_id=$2 where id=$1",
    [link.id, other.documentId]));
  assert.equal(smuggle.error?.code, "CLR08",
    "release.appendonly: …and a release may not carry another column with it");
  const gone = await withTxnOrNull((c) => c.query(
    "delete from clara.entry_evidence_links where id=$1", [link.id]));
  assert.equal(gone.error?.code, "CLR08", "release.appendonly: a link is never deleted");

  // The lawful move, then its irreversibility.
  const released = await withTxnOrNull((c) => c.query(
    "update clara.entry_evidence_links set released_at=now() where id=$1", [link.id]));
  assert.equal(released.error, undefined, "release.appendonly: the one lawful move is allowed");
  const undo = await withTxnOrNull((c) => c.query(
    "update clara.entry_evidence_links set released_at=null where id=$1", [link.id]));
  assert.equal(undo.error?.code, "CLR08", "release.appendonly: a released link is final");
});

// ===========================================================================================
// 4c · THE INDEX'S OWN REFUSAL WEARS THE DOOR'S NAME. Two sessions, a PROVEN block, and a
// TYPED answer — never a raw 23505 no classifier above can act on.
// ===========================================================================================

test("w634.race.commit two runs posting the same document: the loser gets source_conflict, not 23505", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const one = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 41100, memo: `w634 race one ${opk("memo")}` }) });
  const two = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 41200, memo: `w634 race two ${opk("memo")}` }) });

  const out = await holdThenContend({
    a: { role: ROLES.wakeInteractive, wakeSecret: one.cred.secret,
      run: (c) => recordJournalEntryOn(c, { client: one.client, work: one.work_id,
        logicalOpId: one.logical_op_id, basis: one.basis }) },
    b: { role: ROLES.wakeInteractive, wakeSecret: two.cred.secret,
      run: (c) => recordJournalEntryOn(c, { client: two.client, work: two.work_id,
        logicalOpId: two.logical_op_id, basis: two.basis }) },
  });

  assert.equal(out.a.ok, true, `race.commit: the holder posts (${out.a.code ?? ""} ${out.a.message ?? ""})`);
  assert.equal(out.provedBlocked, true,
    "race.commit: the contender genuinely BLOCKED on the holder — a schedule that never blocked "
    + "proves nothing about the race");
  assert.equal(out.b.ok, false, "race.commit: …and lost");
  assert.equal(out.b.code, "CLR13",
    `race.commit: a TYPED conflict, never a raw 23505 (got ${out.b.code}: ${out.b.message})`);
  assert.equal(out.b.detail.reason, EVIDENCE_REASON.sourceConflict);
  assert.equal(out.b.detail.constraint, "already_posted");
  assert.equal(out.b.detail.entry_id, out.a.receipt.entry_id,
    "race.commit: the refusal names the entry that won the document");
  assert.equal((await linksForDocument(doc.documentId)).length, 1,
    "race.commit: one document, one link — the index held");
  assert.equal((await receiptsForWork(two.work_id)).length, 0,
    "race.commit: the loser's whole transaction rolled back — no receipt, no effect");
});

test("w634.race.late two late attachments of one document: the loser gets source_already_posted", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const p1 = await postedEntry({ cents: 44400 });
  const p2 = await postedEntry({ cents: 44500 });

  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: p1.entry_id, document: doc.documentId,
        expectedRevision: p1.revision_token, opKey: opk("w634-race-late-a") }) },
    b: { role: ROLES.authenticated, jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: p2.entry_id, document: doc.documentId,
        expectedRevision: p2.revision_token, opKey: opk("w634-race-late-b") }) },
  });

  assert.equal(out.a.ok, true, `race.late: the holder attaches (${out.a.code ?? ""} ${out.a.message ?? ""})`);
  assert.equal(out.provedBlocked, true, "race.late: the contender genuinely BLOCKED");
  assert.equal(out.b.ok, false);
  assert.equal(out.b.code, "CLR13",
    `race.late: a TYPED conflict, never a raw 23505 (got ${out.b.code}: ${out.b.message})`);
  assert.equal(out.b.detail.reason, EVIDENCE_REASON.sourceAlreadyPosted);
  assert.equal(out.b.detail.entry_id, p1.entry_id,
    "race.late: the refusal names the entry that already stands on the document");
  assert.equal((await linksForEntry(p2.entry_id)).length, 0, "race.late: the loser wrote nothing");
});

test("w634.race.samestate a race that lands the very state the caller asked for REPLAYS, it does not refuse", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const p = await postedEntry({ cents: 45500 });

  // Two presses of ONE decision under two keys (a lost response, retried) that happen to race.
  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: p.entry_id, document: doc.documentId,
        expectedRevision: p.revision_token, opKey: opk("w634-race-same-a") }) },
    b: { role: ROLES.authenticated, jwtSub: BOB(),
      run: (c) => attachEntryEvidenceOn(c, { entry: p.entry_id, document: doc.documentId,
        expectedRevision: p.revision_token, opKey: opk("w634-race-same-b") }) },
  });

  assert.equal(out.a.ok, true, `race.samestate: the holder attaches (${out.a.code ?? ""} ${out.a.message ?? ""})`);
  assert.equal(out.provedBlocked, true, "race.samestate: the contender genuinely BLOCKED");
  assert.equal(out.b.ok, true,
    `race.samestate: the loser is told the truth, not refused (${out.b.code ?? ""}: ${out.b.message ?? ""})`);
  assert.equal(out.b.receipt.already_attached, true);
  assert.equal(out.b.receipt.link_id, out.a.receipt.link_id,
    "race.samestate: both presses name the ONE link");
  assert.equal((await linksForEntry(p.entry_id)).length, 1,
    "race.samestate: exactly one link, however many sessions asked for it");
});

// ===========================================================================================
// 5 · The journal surface's read.
// ===========================================================================================

test("w634.links.shape list_entry_links exposes purpose, source, Work, receipt and the correction chain", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const withDoc = await armed({ sourceRefs: [docRef(doc.documentId)] });
  const postedWithDoc = await post(withDoc);
  const bare = await postedEntry();

  const rows = await listEntryLinks(BOB(), {
    client: A1(), entries: [postedWithDoc.entry_id, bare.entry_id] });
  assert.equal(rows.length, 2, "links.shape: one row per named entry");
  const byId = Object.fromEntries(rows.map((r) => [r.entry_id, r]));

  const d = byId[postedWithDoc.entry_id];
  assert.equal(d.work_id, withDoc.work_id, "links.shape: the Work");
  assert.equal(d.receipt_id, postedWithDoc.receipt_id, "links.shape: the operation receipt");
  assert.equal(d.logical_op_id, withDoc.logical_op_id, "links.shape: the operation identity");
  assert.equal(d.purpose, "journal_entry");
  assert.equal(d.basis_origin, "user_direct", "links.shape: how the basis was authored");
  assert.equal(d.initiator, BOB(), "links.shape: the human behind it, not the agent");
  assert.equal(d.initiator_role, "bookkeeper");
  assert.equal(d.document_id, doc.documentId, "links.shape: the source document");
  assert.equal(d.document_source, "work_commit", "links.shape: …and HOW it was bound");
  assert.equal(d.released_at, null,
    "links.shape: a LIVE binding — the column the surface reads to tell it from a released one");
  assert.equal(d.status, "approved");
  assert.equal(d.origin, "agent");
  assert.equal(d.reversal_of, null);
  assert.equal(d.reversed_by, null);

  const b = byId[bare.entry_id];
  assert.equal(b.document_id, null, "links.shape: an honest null, never an empty slot");
  assert.equal(b.document_source, null);
  assert.equal(b.work_id, bare.work_id);
});

test("w634.links.correction the reversal pair rides the same read", async (t) => {
  if (await gateEvidence(t)) return;
  const p = await postedEntry({ cents: 77700 });
  // ASSERTED, never swallowed. An earlier cut of this cell caught a raise from `reverse_entry`,
  // wrote a diagnostic and RETURNED GREEN — so a broken reversal door, or a world that could not
  // reach one, read exactly like a passing correction chain. LAW 6 is the subject of this cell:
  // if the estate cannot reverse this entry, that is the finding.
  const reversed = await reverseEntry(ALICE(), {
    entry: p.entry_id, reason: "w634: posted against the wrong period", opKey: opk("w634-rev") });
  assert.equal(reversed.status, "approved",
    "links.correction: the reversal mirror is posted, not parked as a high-stakes draft");
  const mirror = reversed.reversal_id;
  assert.ok(mirror, "links.correction: the door names the entry it wrote");
  const rows = await listEntryLinks(BOB(), { client: A1(), entries: [p.entry_id, mirror] });
  const byId = Object.fromEntries(rows.map((r) => [r.entry_id, r]));
  assert.equal(byId[p.entry_id].reversed_by, mirror,
    "links.correction: the original points FORWARD to its correction");
  assert.ok(byId[p.entry_id].reversal_reason,
    "links.correction: …with the reason a reviewer needs");
  assert.equal(byId[mirror].reversal_of, p.entry_id,
    "links.correction: and the correction points BACK");
});

test("w634.links.scope the read is firm+client floored, bookkeeper+, and leaks no other firm's entry", async (t) => {
  if (await gateEvidence(t)) return;
  const p = await postedEntry();

  // Another firm's client is NOT-FOUND, never an empty array (which would confirm it exists).
  await assertPair(CLR.notFound, EVIDENCE_REASON.clientNotFound,
    () => listEntryLinks(BOB(), { client: B1(), entries: [p.entry_id] }), "links.scope (cross-firm client)");

  // An entry id that is not this client's is simply absent — no oracle either way.
  const rows = await listEntryLinks(BOB(), {
    client: A2(), entries: [p.entry_id] });
  assert.deepEqual(rows, [], "links.scope: an entry of another client of the SAME firm is not returned");

  // A VIEWER is below the door's floor.
  await assertRaises(CLR.authz,
    () => listEntryLinks(CAROL(), { client: A1(), entries: [p.entry_id] }), "links.scope (viewer)");

  // The batch cap is refused by name rather than silently truncated.
  const many = Array.from({ length: 501 }, (_, i) =>
    `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const { detail } = await assertPair(CLR.badRequest, EVIDENCE_REASON.tooManyEntries,
    () => listEntryLinks(BOB(), { client: A1(), entries: many }), "links.scope (batch cap)");
  assert.equal(detail.limit, 500);

  assert.deepEqual(await listEntryLinks(BOB(), { client: A1(), entries: [] }), [],
    "links.scope: an empty ask is an empty answer, not a refusal");
});

test("w634.links.rls the link table itself is firm-scoped for a signed-in human", async (t) => {
  if (await gateEvidence(t)) return;
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const a = await armed({ sourceRefs: [docRef(doc.documentId)] });
  await post(a);

  const mine = await humanQuery(BOB(),
    "select count(*)::int as n from clara.entry_evidence_links where client_id=$1", [A1()]);
  assert.ok(mine.rows[0].n >= 1, "links.rls: a member of firm A reads firm A's links");
  const theirs = await humanQuery(DAVE(),
    "select count(*)::int as n from clara.entry_evidence_links where client_id=$1", [A1()]);
  assert.equal(theirs.rows[0].n, 0, "links.rls: a member of firm B reads none of them");
});

// ===========================================================================================
// 6 · The role/period race at commit, for an EVIDENCE-BEARING Work.
// ===========================================================================================

test("w634.race.role an evidence-bearing Work whose initiator lost the floor refuses at COMMIT, and frees nothing", async (t) => {
  if (await gateEvidence(t)) return;
  const client = await freshWorkClient(ALICE(), "w634race");
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client });
  const work = await admitJournalWork({
    client, author: BOB(), sourceRefs: [docRef(doc.documentId)] });
  await claimWorkRun({ task: work.task_id, runId: opk("run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: BOB(), client });

  // The credential is minted; NOW the human drops below the floor. The commit rereads LIVE
  // authority, so the evidence never reaches the books under stale authority.
  await rootQuery(
    "update clara.firm_memberships set role='viewer' where user_id=$1 and firm_id=$2",
    [BOB(), FIRM_A()]);
  try {
    const before = await entryCount(client);
    // CLR03, not CLR04: `clara.wake_context()`'s OWN liveness predicate refuses a credential
    // whose on_behalf_of stopped being an active bookkeeper+, so the wake door answers before the
    // core's belt arms are reached. Measured, and asserted as measured — the operative claim of
    // this cell is what did NOT reach the books, and it holds under either refusal.
    await assertRaises(CLR.wake,
      () => wakeRecordJournalEntry(cred.secret, { client, work: work.work_id,
        logicalOpId: work.logical_op_id, basis: basis() }), "race.role");
    assert.equal(await entryCount(client), before, "race.role: nothing posted");
    assert.equal(await linkCount(client), 0,
      "race.role: …and no evidence link — the document is still free for a lawful posting");
  } finally {
    await rootQuery(
      "update clara.firm_memberships set role='bookkeeper' where user_id=$1 and firm_id=$2",
      [BOB(), FIRM_A()]);
  }
});

// ===========================================================================================
// 8 · CROSS-MODEL REVIEW (Codex). Two claims measured against the catalog and fixed: the
// binding lookup's SCOPE, and the ORDER of the mutable-world checks against a replay.
// ===========================================================================================

test("w634.conflict.crossclient a document live in TWO clients of one firm binds ONCE, by name", async (t) => {
  if (await gateEvidence(t)) return;
  // `uq_document_filing_active` is (document_id, client_id) WHERE retired_at is null (0007:93),
  // so ONE document may be actively filed to two clients of a firm — while
  // `uq_entry_evidence_links_document` carries NO client column. A client-scoped lookup would
  // answer "free" for the sibling's binding and let the write reach the index as a raw 23505.
  const other = await freshWorkClient(ALICE(), "w634cross");
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const second = await fileSameDocumentTo(ALICE(), { document: doc.documentId, client: other })
    .catch((e) => ({ error: e }));
  if (second && second.error) {
    // If the estate ever narrows the filing key to the document alone, this cell's PREMISE is
    // gone — say so loudly rather than going green on a scenario that cannot happen.
    t.diagnostic(`conflict.crossclient: the same document could not be filed twice (${second.error.code}: ${second.error.message}) -- re-derive _document_posting_entry's scope`);
    return;
  }

  const first = await armed({ sourceRefs: [docRef(doc.documentId)],
    b: basis({ cents: 88800, memo: `w634 cross one ${opk("memo")}` }) });
  const posted = await post(first);

  // assertPair itself is the "typed, never a raw 23505" claim: it fails unless the raise carries
  // BOTH the CLR13 sqlstate and `detail.reason = source_already_posted`, which a bare unique
  // violation cannot.
  const { detail, err } = await assertPair(CLR.conflict, EVIDENCE_REASON.sourceAlreadyPosted,
    () => admitJournalWork({ client: other, author: BOB(), sourceRefs: [docRef(doc.documentId)] }),
    "conflict.crossclient");
  assert.notEqual(err.code, "23505", "the index's own refusal never reaches a caller unnamed");
  assert.equal(detail.entry_id, posted.entry_id,
    "conflict.crossclient: it names the SIBLING client's entry — which this firm's member may "
    + "already read (journal_entries' human policy is firm-scoped), so nothing leaks");
  assert.equal((await linksForDocument(doc.documentId)).length, 1,
    "conflict.crossclient: one document, one live binding, firm-wide");
});

test("w634.intent.replay_after_retire a lost-response retry RESOLVES even if the filing moved", async (t) => {
  if (await gateEvidence(t)) return;
  // THE PATH THIS CLOSES. A Work is admitted with a document; the response is lost; the filing is
  // retired; the composer re-sends the SAME intent key. With the filing check BEFORE the replay
  // lookup the retry answered `invalid_source_ref` — a field refusal for a Work that already
  // existed — and the composer's next move (a different document under the same key) is a payload
  // conflict, which rotates the key, which admits a SECOND Work for figures already admitted.
  const doc = await evidenceDocument(ALICE(), { firm: FIRM_A(), client: A1() });
  const key = `w634-replay-${opk("k")}`;
  const first = await admitJournalWork({
    client: A1(), author: BOB(), intentKey: key, sourceRefs: [docRef(doc.documentId)] });
  assert.equal(first.replayed, false);

  await retireFiling(ALICE(), { filing: doc.filingId });

  const again = await admitJournalWork({
    client: A1(), author: BOB(), intentKey: key, sourceRefs: [docRef(doc.documentId)] });
  assert.equal(again.replayed, true,
    "intent.replay_after_retire: the SAME key resolves to the Work it already admitted, whatever "
    + "the world did in between");
  assert.equal(again.work_id, first.work_id);

  // …and a NEW intent naming the same, now-retired document is STILL refused by name: the
  // deferral moved the check, it did not remove it.
  const { detail } = await assertPair(CLR.badRequest, EVIDENCE_REASON.invalidSourceRef,
    () => admitJournalWork({ client: A1(), author: BOB(), sourceRefs: [docRef(doc.documentId)] }),
    "intent.replay_after_retire (a new intent)");
  assert.equal(detail.constraint, "not_filed");
  assert.equal(detail.field, "source_refs[1]");
});

test("w634.intent.shape a MALFORMED ref is refused before the replay lookup, on any key", async (t) => {
  if (await gateEvidence(t)) return;
  // The other half of the split: SHAPE is a property of the payload and stays in front of
  // everything, so a malformed ref can never mint a Work and is never answered as a conflict.
  const key = `w634-shape-${opk("k")}`;
  const { detail } = await assertPair(CLR.badRequest, EVIDENCE_REASON.invalidSourceRef,
    () => admitJournalWork({ client: A1(), author: BOB(), intentKey: key,
      sourceRefs: [{ kind: "document", document_id: "not-a-uuid" }] }), "intent.shape");
  assert.equal(detail.constraint, "uuid");
  const works = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id=$1 and intent_key=$2",
    [A1(), key]);
  assert.equal(works.rows[0].n, 0, "intent.shape: nothing durable was minted");
});
