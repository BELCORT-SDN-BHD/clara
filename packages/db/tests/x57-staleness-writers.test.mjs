// 0057 (Wave E lane gamma, the period registry + month snapshots) rig -- PART 2:
// the staleness family. Matrix: docs/plan/wave-e-acceptance-matrix.md Section E
// (E2, E2b, E3, E7, E8, E9, E11). Design contract:
// docs/plan/wave-e-design-skeleton-part3.md SS2.11 (the trigger set + the
// INTERSECTS+watermark predicate + the writer table).
//
// CONTRACT-BLIND on 0057 itself -- `_tf_snapshot_staleness` / `_mark_snapshots_
// stale`'s live bodies ARE read via pg_get_functiondef for MY OWN authorial
// grounding (the x56-rest-e precedent); `0057_wave_e_registry_snapshots.sql`
// itself is never opened. Every assertion below is against the LIVE assessment
// rows / the LIVE snapshot_state read, never against this file's paraphrase of
// the trigger body.
//
// THE TRANSACTIONAL-IDENTITY INSTRUMENT (E2's load-bearing proof, reused
// throughout): the mutating call and the snapshot_state read run inside ONE
// open transaction (inHumanTxn/txnSnapshotState, x57-fixtures.mjs) so an
// asynchronous staleness mechanism could not pass this test -- the read is
// taken BEFORE commit, when only a same-transaction trigger could have fired.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, opk, namedCall, idOf, firmOf, buildWorld, printLaneNotes, printSkipCount,
  noteLane, markSkip, endPool, freshResolution, seedCitedDocument,
  proposeCorrection, approveCorrection, FIELD, draftEntryV3, approveEntry, ev,
  has0056, has0057, freshActiveClient, setupCloseCoa, plainEntry, birthCounterparty, bookToday,
  AR1, REVN, BANK1,
  mintMonthSnapshot, snapshotState, reportingPeriodRows, assessmentRows, periodSnapshotRow,
  inHumanTxn, txnSnapshotState, openArItem57, creditNote57, caught,
  addBankAccount, enterStatement, voidBankStatement, exceptLine, resolveException,
  applyOpenItems57, unallocateGroup,
} from "./x57-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = (await has0056()) && (await has0057());
  if (!ready) { noteLane("0056 or 0057 not applied -- x57 staleness-writers suite skipped"); return; }
  world = await buildWorld();
});
after(async () => { printLaneNotes("x57-staleness-writers"); printSkipCount("x57-staleness-writers"); await endPool(); });

function skip57(t) {
  if (!ready) { markSkip(); t.skip("0056/0057 surface absent"); return true; }
  return false;
}

async function pastMonthStart(n) {
  const today = await bookToday();
  const [y, m] = today.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

function monthBounds(monthStart) {
  const [y, m] = monthStart.split("-").map(Number);
  const nextTotal = y * 12 + (m - 1) + 1;
  const ny = Math.floor(nextTotal / 12);
  const nm = (nextTotal % 12) + 1;
  const nextFirst = new Date(Date.UTC(ny, nm - 1, 1));
  const lastDay = new Date(nextFirst.getTime() - 86_400_000);
  return { periodStart: monthStart, periodEnd: lastDay.toISOString().slice(0, 10) };
}

function addMonths(monthStart, n) {
  const [y, m] = monthStart.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** A raw named-arg call issued on the caller's OWN pooled client (mid-transaction). */
async function callInTxn(txc, fnName, specs, vals) {
  const r = await txc.query(namedCall(fnName, specs), vals);
  return r.rows[0].result;
}

// ===========================================================================
// E2 -- THE LOAD-BEARING CELL. A posting whose effect intersects the
// snapshotted period marks it STALE in the SAME transaction as the posting.
// ===========================================================================
test("E2: approve_entry inside the snapshotted period marks the artifact STALE inside the SAME uncommitted transaction", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e2");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 40_000, postingDate: `${monthStart.slice(0, 8)}05` });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current", "mandatory setup: current at mint");

  const resolution = await freshResolution(owner, client, { subjectKind: "manual", subjectId: null });
  const postingDate = `${monthStart.slice(0, 8)}20`;
  let stateInsideTxn = null;
  await inHumanTxn(owner, async (txc) => {
    const draft = await callInTxn(txc, "draft_entry", [
      { name: "p_client" }, { name: "p_resolution" }, { name: "p_posting_date", cast: "date" },
      { name: "p_memo" }, { name: "p_lines", cast: "jsonb" }, { name: "p_op_key" },
    ], [
      client, resolution, postingDate, "x57 E2 in-txn posting",
      JSON.stringify([
        { account_code: BANK1, debit_cents: 5_000, credit_cents: 0, description: "dr" },
        { account_code: REVN, debit_cents: 0, credit_cents: 5_000, description: "cr" },
      ]),
      opk("x57-e2-draft"),
    ]);
    await callInTxn(txc, "approve_entry", [
      { name: "p_entry" }, { name: "p_expected_revision" }, { name: "p_op_key" },
    ], [draft.entry_id, draft.revision_token, opk("x57-e2-approve")]);
    stateInsideTxn = await txnSnapshotState(txc, receipt.snapshot_id);
  });
  assert.equal(stateInsideTxn, "stale", `E2: the snapshot read STALE INSIDE the same uncommitted transaction as the posting -- an asynchronous mechanism could not have run yet (got ${stateInsideTxn})`);

  // Post-commit confirmation + the mechanism's own vocabulary, read from the
  // durable assessment row.
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "stale");
  const rows = await assessmentRows(receipt.snapshot_id);
  const staleRow = rows.find((r) => r.assessment === "stale");
  assert.equal(staleRow.reason, "books_moved_after_mint");
  assert.equal(staleRow.caused_by_table, "journal_entries");
});

// ===========================================================================
// E2b -- INTERSECTS, not CONTAINS. A posting into month M-1 marks month M's
// snapshot stale (a prior-period posting moves M's opening/YTD/comparatives).
// A pure containment predicate would silently pass this cell; it does not.
// ===========================================================================
test("E2b: a posting into month M-1 marks month M's snapshot STALE (INTERSECTS the watermark, not date containment)", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e2b");
  await setupCloseCoa(owner, client);
  const monthM = await pastMonthStart(6);
  const monthMMinus1 = addMonths(monthM, -1);
  await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 20_000, postingDate: `${monthM.slice(0, 8)}05` });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart: monthM });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  const priorDate = `${monthMMinus1.slice(0, 8)}18`;
  assert.ok(priorDate < receipt.period_start, "mandatory setup: the posting date is strictly OUTSIDE [period_start, period_end] of month M");
  await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 15_000, postingDate: priorDate });

  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "stale", "E2b: month M's snapshot went STALE from a month M-1 posting -- containment would have missed this");
  const rows = await assessmentRows(receipt.snapshot_id);
  const staleRow = rows.find((r) => r.assessment === "stale");
  assert.equal(staleRow.caused_by_effect_date, priorDate, "the recorded effect date IS the prior-month posting date, outside the snapshot's own range -- direct proof the predicate is not containment");
});

// ===========================================================================
// E3 -- IMMUTABILITY. After staleness, the artifact's stored BYTES are
// unchanged (staleness lives only in the append-only assessment table); a
// direct attempt to edit the payload/hash/range is REFUSED by its own trigger.
// ===========================================================================
test("E3: after staleness the snapshot's stored bytes are UNCHANGED, and a direct edit attempt is refused (CLR08)", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e3");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 30_000, postingDate: `${monthStart.slice(0, 8)}05` });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  const before = await periodSnapshotRow(receipt.snapshot_id);

  await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 1_000, postingDate: `${monthStart.slice(0, 8)}22` });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "stale", "mandatory setup: the artifact is now stale");

  const after = await periodSnapshotRow(receipt.snapshot_id);
  assert.equal(after.dataset_sha256, before.dataset_sha256, "E3: dataset_sha256 UNCHANGED by staleness");
  assert.deepEqual(after.payload, before.payload, "E3: payload bytes UNCHANGED by staleness");
  assert.equal(after.books_watermark, before.books_watermark, "E3: the pinned watermark UNCHANGED by staleness");
  assert.equal(after.period_start, before.period_start);
  assert.equal(after.period_end, before.period_end);

  // Negative case: change is IMPOSSIBLE, not merely unobserved -- a direct edit
  // attempt on the durable row is refused by its own trigger.
  const err = await caught(() => rootQuery(
    "update clara.period_snapshots set payload = payload || '{\"x57e3\":1}'::jsonb where id=$1",
    [receipt.snapshot_id],
  ));
  assert.ok(err, "E3: a direct payload edit MUST be refused (silent change would be the FAIL)");
  assert.equal(err.code, "CLR08", `E3: refused with CLR08 (immutable) -- got ${err.code} / ${err.message}`);
});

// ===========================================================================
// E7 -- apply_open_items (allocation) marks STALE despite writing ZERO journal
// entries and ZERO open_items rows -- only open_item_allocations.
// ===========================================================================
test("E7: apply_open_items marks the artifact STALE inside its own transaction, writing ZERO journal_entries and ZERO open_items rows", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e7");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E7CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(6);
  const postingDate = `${monthStart.slice(0, 8)}05`;
  const { item: invItem } = await openArItem57(owner, { client, cp, cents: 80_000, postingDate });
  const { item: creditItem } = await creditNote57(owner, { client, cp, cents: 30_000, postingDate });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  const jeCountBefore = (await rootQuery("select count(*)::int as n from clara.journal_entries where client_id=$1", [client])).rows[0].n;
  const itemsCountBefore = (await rootQuery("select count(*)::int as n from clara.open_items where client_id=$1", [client])).rows[0].n;

  let stateInsideTxn = null;
  let group = null;
  await inHumanTxn(owner, async (txc) => {
    const applyReceipt = await callInTxn(txc, "apply_open_items", [
      { name: "p_client" }, { name: "p_applications", cast: "jsonb" }, { name: "p_reason" }, { name: "p_op_key" },
    ], [
      client,
      JSON.stringify([{ source_item_id: creditItem, target_item_id: invItem, amount_cents: 30_000 }]),
      "x57 E7 apply", opk("x57-e7-apply"),
    ]);
    group = applyReceipt?.group_id ?? applyReceipt?.application_group ?? applyReceipt?.group ?? null;
    stateInsideTxn = await txnSnapshotState(txc, receipt.snapshot_id);
  });
  assert.equal(stateInsideTxn, "stale", `E7: STALE inside the SAME transaction as apply_open_items (got ${stateInsideTxn})`);

  const jeCountAfter = (await rootQuery("select count(*)::int as n from clara.journal_entries where client_id=$1", [client])).rows[0].n;
  const itemsCountAfter = (await rootQuery("select count(*)::int as n from clara.open_items where client_id=$1", [client])).rows[0].n;
  assert.equal(jeCountAfter, jeCountBefore, "E7: apply_open_items wrote ZERO new journal_entries");
  assert.equal(itemsCountAfter, itemsCountBefore, "E7: apply_open_items wrote ZERO new open_items rows");

  const rows = await assessmentRows(receipt.snapshot_id);
  const staleRow = rows.find((r) => r.assessment === "stale");
  assert.equal(staleRow.caused_by_table, "open_item_allocations", "the effect table is open_item_allocations, not journal_entries or open_items");
  assert.equal(staleRow.caused_by_entry_id, null, "no entry to attribute -- the apply mints no journal entry at all");
  assert.ok(group, "mandatory grounding: apply_open_items names its application_group");
});

// ===========================================================================
// E8 -- unallocate_group ALSO marks STALE (its own transaction), writing only
// NEGATION rows into open_item_allocations -- the undo is not a one-way door.
// ===========================================================================
test("E8: unallocate_group marks a (freshly re-minted) artifact STALE inside its own transaction", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e8");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E8CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(6);
  const postingDate = `${monthStart.slice(0, 8)}05`;
  const { item: invItem } = await openArItem57(owner, { client, cp, cents: 70_000, postingDate });
  const { item: creditItem } = await creditNote57(owner, { client, cp, cents: 25_000, postingDate });

  const applyReceipt = await applyOpenItems57(owner, {
    client, applications: [{ source_item_id: creditItem, target_item_id: invItem, amount_cents: 25_000 }],
  });
  const group = applyReceipt?.group_id ?? applyReceipt?.application_group ?? applyReceipt?.group ?? null;
  assert.ok(group, "mandatory setup: the apply named its group");

  // A FRESH snapshot, minted AFTER the apply settled -- 'current' again, so this
  // cell isolates unallocate_group's OWN staleness contribution.
  const receipt = await mintMonthSnapshot(owner, { client, monthStart, opKey: opk("x57-e8-mint2") });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  let stateInsideTxn = null;
  await inHumanTxn(owner, async (txc) => {
    await callInTxn(txc, "unallocate_group", [
      { name: "p_client" }, { name: "p_group" }, { name: "p_reason" }, { name: "p_op_key" },
    ], [client, group, "x57 E8 undo", opk("x57-e8-unalloc")]);
    stateInsideTxn = await txnSnapshotState(txc, receipt.snapshot_id);
  });
  assert.equal(stateInsideTxn, "stale", `E8: STALE inside the SAME transaction as unallocate_group (got ${stateInsideTxn})`);
  const rows = await assessmentRows(receipt.snapshot_id);
  const staleRow = rows.find((r) => r.assessment === "stale");
  assert.equal(staleRow.caused_by_table, "open_item_allocations");
});

// ===========================================================================
// E9 -- reversal AND wrong-client correction each mark STALE in their OWN
// audited transaction. E-R3 names posting, reversal, allocation AND
// correction; a trigger proven on postings alone proves postings alone.
// ===========================================================================
test("E9(a): reverse_entry marks the artifact STALE inside the SAME uncommitted transaction as the reversal", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e9a");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  const entry = await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 60_000, postingDate: `${monthStart.slice(0, 8)}05` });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  let stateInsideTxn = null;
  await inHumanTxn(owner, async (txc) => {
    await callInTxn(txc, "reverse_entry", [
      { name: "p_entry" }, { name: "p_reason" }, { name: "p_op_key" },
    ], [entry, "x57 E9a reverse", opk("x57-e9a-reverse")]);
    stateInsideTxn = await txnSnapshotState(txc, receipt.snapshot_id);
  });
  assert.equal(stateInsideTxn, "stale", `E9(a): STALE inside the SAME transaction as reverse_entry (got ${stateInsideTxn})`);
  const rows = await assessmentRows(receipt.snapshot_id);
  assert.equal(rows.find((r) => r.assessment === "stale").caused_by_table, "journal_entries");
});

test("E9(b): a wrong-client correction marks the FROM-client's artifact STALE (the correction's inline mirror-approve is a fourth JE-approve path)", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const checker = world.users.bob;
  const clientFrom = await freshActiveClient(owner, "e9bfrom");
  const clientTo = await freshActiveClient(owner, "e9bto");
  await setupCloseCoa(owner, clientFrom);
  await setupCloseCoa(owner, clientTo);
  const cp = await birthCounterparty(owner, { client: clientFrom, name: `X57 E9BCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const firm = await firmOf(clientFrom);
  const monthStart = await pastMonthStart(6);
  const postingDate = `${monthStart.slice(0, 8)}09`;

  const cited = await seedCitedDocument(owner, { firm, client: clientFrom, quote: "RM 900.00", fieldPath: FIELD.total, kind: "invoice" });
  const resolution = await freshResolution(owner, clientFrom, { subjectKind: "document", subjectId: cited.documentId });
  const d = await draftEntryV3(owner, {
    client: clientFrom, resolution, postingDate, memo: "x57 E9b misfiled invoice",
    lines: [
      { account_code: AR1, debit_cents: 90_000, credit_cents: 0, description: "dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 90_000, description: "cr" },
    ],
    document: cited.documentId, sha256: cited.sha256,
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    vendor: { existing_id: cp, kind: "customer" },
    opKey: opk("x57-e9b-draft"),
  });
  await approveEntry(owner, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x57-e9b-approve") });

  const receipt = await mintMonthSnapshot(owner, { client: clientFrom, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current", "mandatory setup: current before the correction");

  // "The destination attribution must be recorded BEFORE propose" (the x37.m
  // precedent, wave-c-a's own correction battery).
  await freshResolution(owner, clientTo, { subjectKind: "document", subjectId: cited.documentId });
  const proposal = await proposeCorrection(owner, { document: cited.documentId, fromClient: clientFrom, toClient: clientTo, reason: "x57 E9b filed to the wrong client" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  assert.ok(correctionId, `propose_wrong_client_correction returns a correction id (got ${JSON.stringify(proposal)})`);
  const planHash = proposal.plan_hash
    ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  await approveCorrection(checker, { correction: correctionId, planHash });

  const stateAfter = await snapshotState(owner, { snapshot: receipt.snapshot_id });
  assert.equal(stateAfter, "stale", `E9(b): the FROM-client's snapshot went STALE from the correction's inline reversal (got ${stateAfter})`);
  const rows = await assessmentRows(receipt.snapshot_id);
  const staleRow = rows.find((r) => r.assessment === "stale");
  assert.equal(staleRow.caused_by_table, "journal_entries", "the correction's mirror is a journal_entries row -- the FOURTH approve path E-R3's writer table names");
});

// ===========================================================================
// E11 -- the BANK writers, at their TRUE effect tables (the round-2 correction:
// void_bank_statement moves clara.bank_statements, never bank_reconciliations;
// except_bank_line / resolve_bank_line_exception move clara.bank_line_exceptions).
// ===========================================================================
test("E11(i): void_bank_statement marks the covering month's artifact STALE inside its own transaction (effect table: bank_statements)", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e11void");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  const { periodStart, periodEnd } = monthBounds(monthStart);
  const acct = await addBankAccount(owner, { client, bankCode: "MBB", accountNumber: "9057000001", coaAccountCode: BANK1, opKey: opk("x57-e11v-acct") });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  const stmt = await enterStatement(owner, {
    client, bankAccount: bankAccountId, periodStart, periodEnd, opening: 0,
    specs: [{ amountCents: 50_000, entryDate: `${periodStart.slice(0, 8)}10`, description: "x57 e11 void deposit" }],
    keepPeriod: true,
  });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  let stateInsideTxn = null;
  await inHumanTxn(owner, async (txc) => {
    await callInTxn(txc, "void_bank_statement", [
      { name: "p_client" }, { name: "p_statement" }, { name: "p_reason" }, { name: "p_op_key" },
    ], [client, stmt.statementId, "x57 e11 void", opk("x57-e11-void")]);
    stateInsideTxn = await txnSnapshotState(txc, receipt.snapshot_id);
  });
  assert.equal(stateInsideTxn, "stale", `E11(i): STALE inside the SAME transaction as void_bank_statement (got ${stateInsideTxn})`);
  const rows = await assessmentRows(receipt.snapshot_id);
  assert.equal(rows.find((r) => r.assessment === "stale").caused_by_table, "bank_statements", "effect table is bank_statements, NOT bank_reconciliations (the round-2 correction)");
});

test("E11(ii): except_bank_line marks the covering month's artifact STALE inside its own transaction (effect table: bank_line_exceptions)", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e11except");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  const { periodStart, periodEnd } = monthBounds(monthStart);
  const acct = await addBankAccount(owner, { client, bankCode: "MBB", accountNumber: "9057000002", coaAccountCode: BANK1, opKey: opk("x57-e11e-acct") });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  const stmt = await enterStatement(owner, {
    client, bankAccount: bankAccountId, periodStart, periodEnd, opening: 0,
    specs: [
      { amountCents: -40_000, entryDate: `${periodStart.slice(0, 8)}11`, description: "x57 e11 erroneous charge" },
      { amountCents: 40_000, entryDate: `${periodStart.slice(0, 8)}12`, description: "x57 e11 bank reversal" },
    ],
    keepPeriod: true,
  });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  let stateInsideTxn = null;
  await inHumanTxn(owner, async (txc) => {
    await callInTxn(txc, "except_bank_line", [
      { name: "p_line" }, { name: "p_kind" }, { name: "p_reason" }, { name: "p_op_key" },
    ], [stmt.lines[0].id, "bank_error", "x57 e11 except", opk("x57-e11-except")]);
    stateInsideTxn = await txnSnapshotState(txc, receipt.snapshot_id);
  });
  assert.equal(stateInsideTxn, "stale", `E11(ii): STALE inside the SAME transaction as except_bank_line (got ${stateInsideTxn})`);
  const rows = await assessmentRows(receipt.snapshot_id);
  assert.equal(rows.find((r) => r.assessment === "stale").caused_by_table, "bank_line_exceptions");
});

test("E11(iii): resolve_bank_line_exception marks a (freshly re-minted) artifact STALE inside its own transaction (effect table: bank_line_exceptions)", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e11resolve");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  const { periodStart, periodEnd } = monthBounds(monthStart);
  const acct = await addBankAccount(owner, { client, bankCode: "MBB", accountNumber: "9057000003", coaAccountCode: BANK1, opKey: opk("x57-e11r-acct") });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  const stmt = await enterStatement(owner, {
    client, bankAccount: bankAccountId, periodStart, periodEnd, opening: 0,
    specs: [
      { amountCents: -60_000, entryDate: `${periodStart.slice(0, 8)}11`, description: "x57 e11r erroneous charge" },
      { amountCents: 60_000, entryDate: `${periodStart.slice(0, 8)}12`, description: "x57 e11r bank reversal" },
    ],
    keepPeriod: true,
  });
  const ex0 = idOf(await exceptLine(owner, { client, line: stmt.lines[0].id, kind: "bank_error", reason: "x57 e11r leg 1" }), "exception_id", "id");
  await exceptLine(owner, { client, line: stmt.lines[1].id, kind: "bank_error", reason: "x57 e11r leg 2" });
  assert.ok(ex0, "mandatory setup: the first exception minted");

  // A FRESH snapshot, minted AFTER both exceptions were opened -- 'current'
  // again, so this cell isolates resolve_bank_line_exception's OWN contribution.
  const receipt = await mintMonthSnapshot(owner, { client, monthStart, opKey: opk("x57-e11r-mint2") });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  let stateInsideTxn = null;
  await inHumanTxn(owner, async (txc) => {
    await callInTxn(txc, "resolve_bank_line_exception", [
      { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" },
      { name: "p_counterpart_line" }, { name: "p_op_key" },
    ], [ex0, "bank_corrective_line", "x57 e11r the offsetting reversal names its pair", stmt.lines[1].id, opk("x57-e11-resolve")]);
    stateInsideTxn = await txnSnapshotState(txc, receipt.snapshot_id);
  });
  assert.equal(stateInsideTxn, "stale", `E11(iii): STALE inside the SAME transaction as resolve_bank_line_exception (got ${stateInsideTxn})`);
  const rows = await assessmentRows(receipt.snapshot_id);
  assert.equal(rows.find((r) => r.assessment === "stale").caused_by_table, "bank_line_exceptions");
});
