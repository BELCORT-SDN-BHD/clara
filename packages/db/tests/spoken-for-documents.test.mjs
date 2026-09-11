// #728 item 5 — clara.list_spoken_for_documents (packages/db/migrations/0183_activity_sweep_attribution.sql,
// arm B). The evidence pickers (journal-composer.tsx, attach-evidence-dialog.tsx) offer documents
// that already back a posted entry; this door is the ADVISORY read that lets them disable those
// options instead. It changes NOTHING about the actual conflict: attach_entry_evidence's CLR13
// source_already_posted and admit_journal_work's own check stay the law, and their own batteries
// (journal-work-evidence.test.mjs) are untouched by this file.
//
// Frontier-gated on 0183's OWN stem (SWEEP_STEM below) — a separate migration from 0182's
// journal-evidence lane this door reads out of, so a slice-frontier leg pinned at 0182 skips
// cleanly rather than reds on a door that has not landed yet.
//
// SITS BESIDE journal-work-evidence.test.mjs, per the work order's own instruction, reusing that
// lane's fixtures (documents, filings, attach/reverse wrappers) rather than re-deriving them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, buildWorkWorld, freshWorkClient, endPool, opk, assertRaises,
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry, basis, WCHART,
  printSkipCount, evidenceDocument, attachEntryEvidence, reverseEntry, fileSameDocumentTo,
} from "./journal-work-evidence-fixtures.mjs";
import { withTxn } from "./rig-txn.mjs";

const CLR04 = "CLR04";
const CLR11 = "CLR11";
const STEM = "activity_sweep_attribution$";

let _ready = null;
async function spokenForReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

async function gate(t) {
  if (await spokenForReady()) return false;
  t.skip(`#728 activity-sweep-attribution lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printSkipCount("spoken-for-documents");
  await endPool();
});

const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice; // owner, firm A
const BOB = () => world.users.bob; // bookkeeper, firm A
const CAROL = () => world.users.carol; // viewer, firm A
const DAVE = () => world.users.dave; // owner, firm B

async function listSpokenFor(sub, client) {
  const r = await humanQuery(sub, "select * from clara.list_spoken_for_documents($1::uuid)", [client]);
  return r.rows;
}

/** Admit + claim + mint OBO + post a documentless #623 Work entry against `client`, the same
 *  "armed()" shape journal-work-evidence.test.mjs uses — kept local (not exported by the shared
 *  fixtures) because it composes primitives that ARE exported. */
async function postedEntry({ client, author = BOB(), cents = 120000 }) {
  const b = basis({ cents, memo: `t728 spoken-for ${opk("memo")}` });
  const work = await admitJournalWork({ client, author, basis: b });
  await claimWorkRun({ task: work.task_id, runId: opk("t728-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: author, client });
  const out = await wakeRecordJournalEntry(cred.secret, {
    client, work: work.work_id, logicalOpId: work.logical_op_id, basis: b,
  });
  assert.equal(out.posted, true, "setup: the Work posted");
  return { entryId: out.entry_id, revisionToken: out.revision_token, client, author };
}

/** A journal_entries row bound through the OLDER document-CODING lane
 *  (`journal_entries.document_id`/`source_doc_sha256`/`filing_id`, 0007) rather than through
 *  `clara.entry_evidence_links` (0182/#623's own lane) — the SECOND relation this door's arm 2
 *  reads. Constructed directly (as root): no writer in this estate mints a fresh coding-lane
 *  entry from a clean-room test fixture, and this door only cares about the COLUMN VALUES, not
 *  how a production writer would have arrived at them. Every column `ck_je_doc_pair`/
 *  `ck_je_document_filing_pair`/`fk_journal_entries_filing` requires is set consistently so the
 *  raw INSERT itself proves the fixture is a legal row, not merely a convenient one. */
async function codedEntry({ client, documentId, filingId, sha256, author = BOB(), reversed = false }) {
  // ONE TRANSACTION for the entry and its lines — `clara._assert_balanced` is a DEFERRED
  // constraint trigger checked at COMMIT (rig-txn.mjs's own header: "the DEFERRED constraint
  // triggers... fire at COMMIT even when the writer is bypassed"), so two separate auto-committed
  // `rootQuery` statements would commit the entry ALONE first and fail immediately — measured on
  // this exact fixture before this was one transaction.
  const entryId = await withTxn(async (c) => {
    // DRAFT FIRST, then lines, then approve — `clara._tf_je_lines_immutable`-class guard refuses
    // an INSERT of lines against an entry this SAME transaction already marked 'approved' (the
    // immutability wall makes no exception for "not committed yet"), exactly as the real posting
    // path (draft -> lines -> approve) is shaped. Measured on this exact fixture.
    const row = (await c.query(
      `insert into clara.journal_entries(
          firm_id, client_id, status, posting_date, memo, origin, document_id, source_doc_sha256,
          filing_id, maker_actor)
        values ($1,$2,'draft',current_date,'#728 rig: document-coding fixture','document',$3,$4,$5,$6)
        returning id`,
      [FIRM_A(), client, documentId, sha256, filingId, author])).rows[0];
    // A BALANCED pair of lines — rides the SAME chart freshWorkClient already seeds
    // (WCHART.expense/WCHART.bank) rather than inventing a second one.
    await c.query(
      `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents)
         values ($1,1,$2,12300,0), ($1,2,$3,0,12300)`,
      [row.id, WCHART.expense, WCHART.bank]);
    await c.query("update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2 where id=$1", [row.id, author]);
    return row.id;
  });
  if (reversed) {
    // A REVERSED coded entry (`status` stays 'approved', LAW 6) so arm 2's `reversed_by is null`
    // predicate is what excludes it, not `status`. `reversed_by` is a plain self-FK — a raw stamp
    // is enough to prove the READ's own predicate without driving the whole reversal door.
    const reversalId = await withTxn(async (c) => {
      const reversal = (await c.query(
        `insert into clara.journal_entries(
            firm_id, client_id, status, posting_date, memo, origin, maker_actor, reversal_of)
          values ($1,$2,'draft',current_date,'#728 rig: reversal of coding fixture','reversal',$3,$4)
          returning id`,
        [FIRM_A(), client, author, entryId])).rows[0];
      await c.query(
        `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents)
           values ($1,1,$2,0,12300), ($1,2,$3,12300,0)`,
        [reversal.id, WCHART.expense, WCHART.bank]);
      await c.query("update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2 where id=$1", [reversal.id, author]);
      return reversal.id;
    });
    await rootQuery(
      "update clara.journal_entries set reversed_by=$2, reversal_reason=$3 where id=$1",
      [entryId, reversalId, "#728 rig: reversal-linkage stamp for the coding-lane fixture"]);
  }
  return entryId;
}

// ===========================================================================================
// 1 · Role floor and cross-firm isolation.
// ===========================================================================================

test("sfd.1 refuses a below-bookkeeper caller CLR04, and a bookkeeper of the same firm reads fine", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "sfd1");
  await assertRaises(CLR04, () => listSpokenFor(CAROL(), cli), "sfd.1 viewer");
  const rows = await listSpokenFor(BOB(), cli);
  assert.deepEqual(rows, [], "sfd.1 a bookkeeper of the same firm reads an empty (not denied) answer for a client with nothing spoken for");
});

test("sfd.2 a client of another firm answers the SAME CLR11 as a genuinely absent client id (no oracle)", async (t) => {
  if (await gate(t)) return;
  const cliA = await freshWorkClient(ALICE(), "sfd2");
  const absent = await assertRaises(CLR11, () => listSpokenFor(DAVE(), "00000000-0000-0000-0000-000000000000"),
    "sfd.2 baseline: a genuinely absent client id");
  const crossFirm = await assertRaises(CLR11, () => listSpokenFor(DAVE(), cliA),
    "sfd.2 firm B's owner asks for firm A's real client");
  assert.equal(crossFirm.message, absent.message, "sfd.2 no-oracle: identical refusal text either way");
});

// ===========================================================================================
// 2 · Arm 1 — clara.entry_evidence_links, live vs released.
// ===========================================================================================

test("sfd.3 a LIVE entry_evidence_links binding is reported via='evidence_link', and an unattached document of the same client is not", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "sfd3");
  const posted = await postedEntry({ client: cli });
  const doc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli });
  const other = await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli });

  const before = await listSpokenFor(BOB(), cli);
  assert.deepEqual(before, [], "sfd.3 setup: nothing is spoken for yet");

  const attach = await attachEntryEvidence(BOB(), {
    entry: posted.entryId, document: doc.documentId, expectedRevision: posted.revisionToken,
  });
  assert.equal(attach.attached, true, "sfd.3 setup: the late attachment succeeded");

  const rows = await listSpokenFor(BOB(), cli);
  assert.equal(rows.length, 1, "sfd.3 exactly the attached document is reported");
  assert.equal(rows[0].document_id, doc.documentId);
  assert.equal(rows[0].entry_id, posted.entryId);
  assert.equal(rows[0].client_id, cli, "sfd.3 the claimant is this same client, named explicitly");
  assert.equal(rows[0].client_name, await clientName(cli));
  assert.equal(rows[0].via, "evidence_link");
  assert.equal(rows.some((r) => r.document_id === other.documentId), false,
    "sfd.3 the OTHER filed document of the same client is not spoken for");
});

test("sfd.4 a REVERSED entry's binding is RELEASED — the document it once backed is no longer reported", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "sfd4");
  const posted = await postedEntry({ client: cli });
  const doc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli });
  await attachEntryEvidence(BOB(), { entry: posted.entryId, document: doc.documentId, expectedRevision: posted.revisionToken });

  const before = await listSpokenFor(BOB(), cli);
  assert.equal(before.some((r) => r.document_id === doc.documentId), true, "sfd.4 setup: attached and live");

  await reverseEntry(BOB(), { entry: posted.entryId });

  const after = await listSpokenFor(BOB(), cli);
  assert.equal(after.some((r) => r.document_id === doc.documentId), false,
    "sfd.4 a reversal RELEASES the binding (0182's t_entry_evidence_release) — the correction may cite the same document");
});

// ===========================================================================================
// 3 · Arm 2 — the document-coding lane's journal_entries.document_id, approved and not reversed.
// ===========================================================================================

test("sfd.5 an approved, not-reversed document-coding entry is reported via='coding'", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "sfd5");
  const doc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli });
  const entryId = await codedEntry({ client: cli, documentId: doc.documentId, filingId: doc.filingId, sha256: doc.sha256 });

  const rows = await listSpokenFor(BOB(), cli);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].document_id, doc.documentId);
  assert.equal(rows[0].entry_id, entryId);
  assert.equal(rows[0].client_id, cli);
  assert.equal(rows[0].client_name, await clientName(cli));
  assert.equal(rows[0].via, "coding");
});

test("sfd.6 a REVERSED document-coding entry is excluded — status stays 'approved' (LAW 6), so reversed_by is the predicate that must do the work", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "sfd6");
  const doc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli });
  await codedEntry({ client: cli, documentId: doc.documentId, filingId: doc.filingId, sha256: doc.sha256, reversed: true });

  const rows = await listSpokenFor(BOB(), cli);
  assert.equal(rows.some((r) => r.document_id === doc.documentId), false,
    "sfd.6 a reversed coding-lane entry must not hold a document 'spoken for' for ever");
});

// ===========================================================================================
// 4 · Both arms together, and the empty answer.
// ===========================================================================================

test("sfd.7 both arms compose: an evidence_link document and a coding document of the SAME client both appear, distinctly", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "sfd7");
  const posted = await postedEntry({ client: cli });
  const linkDoc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli });
  await attachEntryEvidence(BOB(), { entry: posted.entryId, document: linkDoc.documentId, expectedRevision: posted.revisionToken });

  const codedDoc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli });
  const codedEntryId = await codedEntry({ client: cli, documentId: codedDoc.documentId, filingId: codedDoc.filingId, sha256: codedDoc.sha256 });

  const rows = await listSpokenFor(BOB(), cli);
  const byDoc = new Map(rows.map((r) => [r.document_id, r]));
  assert.equal(byDoc.get(linkDoc.documentId)?.via, "evidence_link");
  assert.equal(byDoc.get(linkDoc.documentId)?.entry_id, posted.entryId);
  assert.equal(byDoc.get(codedDoc.documentId)?.via, "coding");
  assert.equal(byDoc.get(codedDoc.documentId)?.entry_id, codedEntryId);
  assert.equal(rows.length, 2, "sfd.7 exactly the two spoken-for documents, no duplicates");
});

test("sfd.8 a client with nothing spoken for reads an empty array, not an error and not null", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "sfd8");
  await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli }); // filed, but never attached or coded
  const rows = await listSpokenFor(BOB(), cli);
  assert.deepEqual(rows, []);
});

// ===========================================================================================
// 5 · #728 REVIEW ROUND — THE CLAIM IS FIRM-WIDE, and the door must answer at that scope.
//
// Cross-model review (Codex, 2026-09-11) read the first cut of this door and found it asking a
// CLIENT-scoped question against a FIRM-WIDE invariant. `uq_document_filing_active` is
// `(document_id, client_id) where retired_at is null` (0007:93), so ONE document may be actively
// filed to TWO clients of a firm; `uq_entry_evidence_links_document` carries no client column at
// all, and `clara._document_posting_entry` (0182:579-590) deliberately scopes its own lookup to
// the FIRM for exactly that reason — its header records the same review finding from #634's round.
// A client-scoped read here would call a document free for client B while client A's entry already
// stands on it, and the person would learn that only from the door's refusal on submit — which is
// the whole defect #728 item 5 exists to close.
//
// So the door now asks: of the documents THIS CLIENT'S PICKER CAN OFFER (its own active filings),
// which are claimed by ANY live posted entry of the firm, and by WHOSE entry. `client_id` +
// `client_name` name the claimant so the surface can link to the right client's Journals route.
// ===========================================================================================

/** The claimant's own name, read as root — the fact the door joins in, checked against the
 *  relation rather than against the door's own answer. */
async function clientName(client) {
  return (await rootQuery("select name from clara.clients where id = $1", [client])).rows[0].name;
}

test("sfd.9 a document filed to TWO clients and already backing client A's entry is reported for client B too — naming A as the claimant", async (t) => {
  if (await gate(t)) return;
  const a = await freshWorkClient(ALICE(), "sfd9a");
  const b = await freshWorkClient(ALICE(), "sfd9b");
  const posted = await postedEntry({ client: a });
  const doc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: a });
  // The SAME document, live in both clients at once — the shape uq_document_filing_active admits
  // and the one a client-scoped read cannot see.
  await fileSameDocumentTo(BOB(), { document: doc.documentId, client: b });
  const attach = await attachEntryEvidence(BOB(), {
    entry: posted.entryId, document: doc.documentId, expectedRevision: posted.revisionToken,
  });
  assert.equal(attach.attached, true, "sfd.9 setup: client A's entry now stands on the document");

  const rows = await listSpokenFor(BOB(), b);
  assert.equal(rows.length, 1,
    "sfd.9 client B's picker IS told the document is spoken for, though the entry holding it belongs to A");
  assert.equal(rows[0].document_id, doc.documentId);
  assert.equal(rows[0].entry_id, posted.entryId);
  assert.equal(rows[0].client_id, a, "sfd.9 the CLAIMANT client is named, never the client that asked");
  assert.equal(rows[0].client_name, await clientName(a),
    "sfd.9 …by name, so the surface can say whose entry holds it without a second read");
  assert.equal(rows[0].via, "evidence_link");
});

test("sfd.10 the document-coding lane crosses the same boundary: client A's approved coding holds a document client B's picker also offers", async (t) => {
  if (await gate(t)) return;
  const a = await freshWorkClient(ALICE(), "sfd10a");
  const b = await freshWorkClient(ALICE(), "sfd10b");
  const doc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: a });
  await fileSameDocumentTo(BOB(), { document: doc.documentId, client: b });
  const entryId = await codedEntry({
    client: a, documentId: doc.documentId, filingId: doc.filingId, sha256: doc.sha256,
  });

  const rows = await listSpokenFor(BOB(), b);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].document_id, doc.documentId);
  assert.equal(rows[0].entry_id, entryId);
  assert.equal(rows[0].client_id, a);
  assert.equal(rows[0].client_name, await clientName(a));
  assert.equal(rows[0].via, "coding");
});

test("sfd.11 a document claimed by BOTH lanes is reported ONCE, by the live evidence link — the precedence clara._document_posting_entry itself applies", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "sfd11");
  const posted = await postedEntry({ client: cli });
  const doc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: cli });
  await attachEntryEvidence(BOB(), {
    entry: posted.entryId, document: doc.documentId, expectedRevision: posted.revisionToken,
  });
  // …and a coding-lane entry on the SAME document. #718 records that the coding lane can still
  // post on a document this lane has already bound (not this ticket's to fix), so the double
  // claim is a state the read must answer DETERMINISTICALLY rather than one it may assume away.
  const coded = await codedEntry({
    client: cli, documentId: doc.documentId, filingId: doc.filingId, sha256: doc.sha256,
  });

  const rows = await listSpokenFor(BOB(), cli);
  assert.equal(rows.length, 1, "sfd.11 ONE row per document — a picker option carries one reason, not two");
  assert.equal(rows[0].entry_id, posted.entryId,
    "sfd.11 the LIVE evidence link wins, exactly as clara._document_posting_entry ranks it (0182:581-590)");
  assert.equal(rows[0].via, "evidence_link");
  assert.notEqual(rows[0].entry_id, coded, "sfd.11 …and not the coding-lane entry");
});

test("sfd.12 a document of ANOTHER client, spoken for and never filed to this one, is not this client's business", async (t) => {
  if (await gate(t)) return;
  const a = await freshWorkClient(ALICE(), "sfd12a");
  const b = await freshWorkClient(ALICE(), "sfd12b");
  const posted = await postedEntry({ client: a });
  const doc = await evidenceDocument(BOB(), { firm: FIRM_A(), client: a });
  await attachEntryEvidence(BOB(), {
    entry: posted.entryId, document: doc.documentId, expectedRevision: posted.revisionToken,
  });
  // NO second filing this time: the document is not in client B's picker at all, so naming it to
  // B would be a fact about another client's records that B's surface never asked for.
  assert.deepEqual(await listSpokenFor(BOB(), b), [],
    "sfd.12 the answer is bounded by what THIS client's picker can offer — its own active filings");
});
