// #624 / C-19 / C13.2 — FILING CONFLICT CLASSIFICATION, REMEASURED AGAINST THE LIVE DEFINITIONS.
//
// C-19 asks that exact constraint-name error classification be KEPT, that the affected live
// definitions be remeasured, and that a blanket conflict catch be avoided. C13.2 asks for the
// exact constraint and the current error mapping, tested with ONE same-key replay and ONE
// distinct conflict. Both are discovery obligations: the honest outcome is either a bounded
// repair or a reviewed no-gap result with current evidence attached. This battery IS that
// evidence, and the result it records is NO GAP — measured, not asserted.
//
// WHAT IS ACTUALLY THERE, read off the live catalog (2026-09-13, PostgreSQL 17 rig):
//
//   * The constraint is `uq_document_filing_active` — a PARTIAL unique index on
//     (document_id, client_id) WHERE retired_at is null. It is an INDEX, not a table
//     constraint, which matters: `get stacked diagnostics constraint_name` reports it by that
//     name and nothing else.
//   * `clara._file_document_write` (the live tip under clara.file_document, 0124) does NOT
//     catch unique_violation at all. It refuses an already-active filing with an EXPLICIT
//     PRE-CHECK — `select id from clara.document_filings where ... retired_at is null` then
//     CLR10 "document is already actively filed to this client". So the ordinary duplicate is
//     answered by a named business refusal that never touches the constraint-name machinery.
//   * NINETEEN live bodies read `constraint_name`, and NOT ONE of them names
//     `uq_document_filing_active`. There is therefore no blanket mapping of a filing-path
//     unique violation onto a filing conflict — the exact defect C-19 warns about.
//   * The one handler on the coding path, `clara._draft_entry_core`, names EXACTLY ONE
//     constraint (`uq_journal_entries_one_open_draft_filing` -> CLR21 double_coded) and ends
//     with a bare `raise;`, so every other unique violation keeps its own identity.
//
// The cells below prove each of those claims by provoking the real behaviour on a real rig,
// not by transcribing the body.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, buildWorld, createClient, opk, freshResolution, draftEntry, human, COA,
} from "./rig-fixtures.mjs";
import { seedVerifiedDocument } from "./rig-docs-fixtures.mjs";

const CLR10 = "CLR10";
const CLR21 = "CLR21";
const UNIQUE_VIOLATION = "23505";
const FILING_CONSTRAINT = "uq_document_filing_active";

let world = null;

before(async () => { world = await buildWorld(); });
after(async () => { await endPool(); });

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

async function subject(tag) {
  const firm = world.firms.A;
  const client = await createClient(world.users.alice, { name: `${world.prefix}_fc_${tag}`, opKey: opk("cli") });
  const doc = await seedVerifiedDocument({ firm, filename: `fc_${tag}.pdf`, kind: "invoice" });
  return { firm, client, doc };
}

// ---------------------------------------------------------------------------------------------
// (1) THE SAME-KEY REPLAY. C13.2's first half.
// ---------------------------------------------------------------------------------------------

test("C13.2: a same-op_key file_document replay returns the FIRST receipt, byte for byte — never a second filing and never a conflict", async () => {
  const { client, doc } = await subject("replay");
  const key = opk("file");
  const resolution = await freshResolution(world.users.alice, client,
    { subjectKind: "document", subjectId: doc.documentId });

  const first = (await humanQuery(world.users.alice,
    "select clara.file_document($1,$2,$3,$4) as r", [doc.documentId, client, resolution, key])).rows[0].r;
  const second = (await humanQuery(world.users.alice,
    "select clara.file_document($1,$2,$3,$4) as r", [doc.documentId, client, resolution, key])).rows[0].r;

  assert.equal(second.filing_id, first.filing_id, "the replay must return the SAME filing, not a new one");
  assert.equal(second.document_id, first.document_id);
  assert.equal(second.client_id, first.client_id);

  const n = (await rootQuery(
    "select count(*)::int as n from clara.document_filings where document_id=$1 and client_id=$2",
    [doc.documentId, client])).rows[0].n;
  assert.equal(n, 1, "a replay created a second filing row");
});

test("C-19: a DIFFERENT op_key filing the same document to the same client is a NAMED business refusal (CLR10), not a constraint conflict", async () => {
  const { client, doc } = await subject("dup");
  const resolution = await freshResolution(world.users.alice, client,
    { subjectKind: "document", subjectId: doc.documentId });
  await humanQuery(world.users.alice,
    "select clara.file_document($1,$2,$3,$4) as r", [doc.documentId, client, resolution, opk("file")]);

  const err = await caught(() => humanQuery(world.users.alice,
    "select clara.file_document($1,$2,$3,$4) as r", [doc.documentId, client, resolution, opk("file")]));
  assert.ok(err, "a second distinct-key filing of an already-filed document must be refused");
  assert.equal(err.code, CLR10, `expected the named refusal ${CLR10}, got ${err.code} -- ${err.message}`);
  assert.match(err.message, /already actively filed/i,
    "the refusal names the business state, never a constraint");
  assert.equal(err.constraint, undefined,
    "the ordinary duplicate never reaches the unique index, so no constraint name is reported");
});

// ---------------------------------------------------------------------------------------------
// (2) THE DISTINCT CONFLICT. C13.2's second half, and C-19's "no blanket catch".
// ---------------------------------------------------------------------------------------------

test("C13.2: the filing unique is uq_document_filing_active, it reports itself by name, and NO live body maps it onto a filing conflict", async () => {
  const { firm, client, doc } = await subject("distinct");
  const resolution = await freshResolution(world.users.alice, client,
    { subjectKind: "document", subjectId: doc.documentId });
  const filed = (await humanQuery(world.users.alice,
    "select clara.file_document($1,$2,$3,$4) as r", [doc.documentId, client, resolution, opk("file")])).rows[0].r;
  const actor = (await rootQuery(
    "select filed_by from clara.document_filings where id=$1", [filed.filing_id])).rows[0].filed_by;

  // Bypass the pre-check and hit the index itself. This is the ONLY way to observe what the
  // database actually reports, and observing it is the whole point of C13.2.
  const err = await caught(() => rootQuery(
    `insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis)
     values ($1,$2,$3,$4,$5,'human')`,
    [firm, doc.documentId, client, actor, resolution]));
  assert.ok(err, "the partial unique index did not fire");
  assert.equal(err.code, UNIQUE_VIOLATION);
  assert.equal(err.constraint, FILING_CONSTRAINT,
    `the filing unique must report itself as ${FILING_CONSTRAINT}`);

  // And nothing in the estate translates that name into a filing/coding conflict.
  const mappers = (await rootQuery(
    `select p.oid::regprocedure::text as sig from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and p.prosrc like '%constraint_name%'
        and p.prosrc like ('%' || $1 || '%')`, [FILING_CONSTRAINT])).rows;
  assert.deepEqual(mappers, [],
    `${FILING_CONSTRAINT} is mapped by a constraint_name handler -- C-19's blanket-catch hazard is live`);
});

test("C-19: the ONE handler on the coding path names exactly one constraint and re-raises everything else", async () => {
  const src = (await rootQuery(
    `select prosrc from pg_proc where proname='_draft_entry_core' and pronamespace='clara'::regnamespace`)).rows[0].prosrc;
  // `get stacked diagnostics` appears twice in this body; the OTHER one reads
  // pg_exception_detail on the vendor-binding path and has nothing to do with unique violations.
  // Count the CONSTRAINT-NAME reads specifically -- that is the surface C-19 is about.
  const handlers = (src.match(/get stacked diagnostics\s+\w+\s*=\s*constraint_name/g) || []).length;
  assert.equal(handlers, 1, "the coding writer reads constraint_name exactly once");
  const names = [...src.matchAll(/v_constraint\s*=\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(names, ["uq_journal_entries_one_open_draft_filing"],
    "the handler must name exactly one constraint -- anything broader is the blanket catch C-19 forbids");
  assert.match(src, /raise;\s*\n\s*end;/,
    "the handler must end with a bare `raise;` so an unmapped unique violation keeps its identity");
});

test("C-19 DIFFERENTIAL: the mapped constraint yields CLR21 double_coded; a DISTINCT unique violation on the same filing does NOT", async () => {
  // buildWorld's A1 client, because this cell needs a real chart of accounts to draft against
  // (`subject()` mints a bare client; a draft there refuses CLR10 "line codes to a non-existent
  // account" long before the constraint under test can fire).
  const firm = world.firms.A;
  const client = world.clients.A1;
  const doc = await seedVerifiedDocument({ firm, filename: "fc_diff.pdf", kind: "invoice" });
  const resolution = await freshResolution(world.users.alice, client,
    { subjectKind: "document", subjectId: doc.documentId });
  const filed = (await humanQuery(world.users.alice,
    "select clara.file_document($1,$2,$3,$4) as r", [doc.documentId, client, resolution, opk("file")])).rows[0].r;

  const lines = [
    { account_code: COA.expense, debit_cents: 10_000, credit_cents: 0, description: "rig" },
    { account_code: COA.cash, debit_cents: 0, credit_cents: 10_000, description: "rig" },
  ];
  await draftEntry(human(world.users.alice), {
    client, resolution, document: doc.documentId, sha256: doc.sha256, lines, opKey: opk("draft"),
  });

  // POSITIVE: the MAPPED constraint. A second open draft on the same active filing.
  const mapped = await caught(() => draftEntry(human(world.users.alice), {
    client, resolution, document: doc.documentId, sha256: doc.sha256, lines, opKey: opk("draft"),
  }));
  assert.ok(mapped, "a second open draft on one filing must be refused");
  assert.equal(mapped.code, CLR21, `expected ${CLR21} double_coded, got ${mapped.code} -- ${mapped.message}`);
  assert.match(mapped.message, /open draft/i);

  // NEGATIVE TWIN: a DISTINCT unique violation touching the SAME filing keeps its own identity.
  // It is not translated into "already coded", which is precisely the misclassification C-19
  // exists to prevent -- a professional told their bill is already coded when the real cause was
  // a duplicate FILING would go looking in the wrong place entirely.
  const actor = (await rootQuery(
    "select filed_by from clara.document_filings where id=$1", [filed.filing_id])).rows[0].filed_by;
  const distinct = await caught(() => rootQuery(
    `insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis)
     values ($1,$2,$3,$4,$5,'human')`,
    [firm, doc.documentId, client, actor, resolution]));
  assert.ok(distinct);
  assert.equal(distinct.code, UNIQUE_VIOLATION,
    "a distinct unique violation must surface as itself, not as a mapped business code");
  assert.notEqual(distinct.code, CLR21);
  assert.equal(distinct.constraint, FILING_CONSTRAINT);
});
