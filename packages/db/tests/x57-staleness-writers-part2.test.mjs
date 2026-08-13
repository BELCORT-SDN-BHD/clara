// 0057 (Wave E lane gamma, the period registry + month snapshots) rig -- PART 3
// (split from x57-staleness-writers.test.mjs purely to stay under the repo's
// 500-line-per-file gate -- the wave-a-helpers/wave-a-fixtures split
// precedent): E9 (reversal + wrong-client correction) and E11 (the bank
// writers). Matrix: docs/plan/active/wave-e-acceptance-matrix.md Section E. Design
// contract: docs/plan/active/wave-e-design-skeleton-part3.md SS2.11.
//
// R1 FIX BATCH (2026-08-11), finding 10: E9(b) now uses the SAME
// transactional-identity instrument as its siblings (was a post-commit read)
// and covers BOTH clients -- SS2.11 row 8 says the correction's inline
// mirror-approve marks "both clients' snapshots"; the TO-client half is
// measured and reported, not assumed.
//
// CONTRACT-BLIND on 0057 itself; `0057_wave_e_registry_snapshots.sql` is never
// opened. The transactional-identity instrument (inHumanTxn/txnSnapshotState,
// x57-fixtures.mjs) runs the mutating call and the snapshot_state read inside
// ONE open transaction, so an asynchronous staleness mechanism could not pass.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, opk, namedCall, idOf, firmOf, buildWorld, printLaneNotes, printSkipCount,
  noteLane, markSkip, endPool, freshResolution, seedCitedDocument,
  proposeCorrection, FIELD, draftEntryV3, approveEntry, ev,
  has0056, has0057, freshActiveClient, setupCloseCoa, plainEntry, birthCounterparty, bookToday, addDaysStr,
  AR1, REVN, BANK1,
  mintMonthSnapshot, snapshotState, verifySnapshot, assessmentRows,
  inHumanTxn, txnSnapshotState,
  addBankAccount, enterStatement, exceptLine,
} from "./x57-fixtures.mjs";
// The FA register world (0041, already shipped) -- reused rather than
// re-deriving "soft-birth" (an approved-entry-triggered belt insert) from
// scratch. A SEPARATE, already-proven firm/client graph (wb.buildWaveBWorld,
// cached per process); x57's own generic wrappers (mint/snapshot/verify) work
// identically against it since they key only on the calling human's JWT firm.
// SINGLE DOOR (R2.5 NIT, accepted 2026-08-12): x41-fa-world.mjs re-exports the fixtures
// wholesale (`export * from "./x41-fa-fixtures.mjs"`), so importing from both it and the
// fixtures directly gives one module two entry points here -- and the second one bypasses
// whatever the world sets up around them. Everything comes through the world.
import { faWorld, freshFaClient, buyAsset, completeSL, reviseParticulars } from "./x41-fa-world.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = (await has0056()) && (await has0057());
  if (!ready) { noteLane("0056 or 0057 not applied -- x57 staleness-writers-part2 suite skipped"); return; }
  world = await buildWorld();
});
after(async () => { printLaneNotes("x57-staleness-writers-part2"); printSkipCount("x57-staleness-writers-part2"); await endPool(); });

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

/** A raw named-arg call issued on the caller's OWN pooled client (mid-transaction). */
async function callInTxn(txc, fnName, specs, vals) {
  const r = await txc.query(namedCall(fnName, specs), vals);
  return r.rows[0].result;
}

// ===========================================================================
// E9 -- reversal AND wrong-client correction each mark STALE in their OWN
// audited transaction.
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

// FIX (Codex round adjudication, 2026-08-11): the TRUE contract, asserted
// POSITIVELY, not logged as an observation. approve_wrong_client_correction
// reverses at FROM only -- it retires the filing and opens a TO coding task,
// it never books at TO. Design row 8's "both clients' snapshots mark" was
// wrong for a normal correction (amended: wave-e-design-skeleton-part3.md
// SS2.11 row 8), and this cell now asserts what the live body actually does:
// FROM marks stale inside the correction's own transaction; TO stays CURRENT
// through the correction; TO marks later, at its own ordinary row-1 JE-arm
// event, when the recoded entry is drafted and approved there.
test("E9(b): a wrong-client correction marks FROM (in-txn) and leaves TO CURRENT through the correction; TO marks later, at its own recoding approve", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const checker = world.users.bob;
  const clientFrom = await freshActiveClient(owner, "e9bfrom");
  const clientTo = await freshActiveClient(owner, "e9bto");
  await setupCloseCoa(owner, clientFrom);
  await setupCloseCoa(owner, clientTo);
  const cp = await birthCounterparty(owner, { client: clientFrom, name: `X57 E9BCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const cpTo = await birthCounterparty(owner, { client: clientTo, name: `X57 E9BCOTO ${randomUUID().slice(0, 6)}`, kind: "customer" });
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

  const receiptFrom = await mintMonthSnapshot(owner, { client: clientFrom, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receiptFrom.snapshot_id }), "current", "mandatory setup: FROM current before the correction");
  // The TO client gets its OWN snapshot for the SAME month, so this cell
  // asserts (not merely observes) the correction's non-effect there.
  const receiptTo = await mintMonthSnapshot(owner, { client: clientTo, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receiptTo.snapshot_id }), "current", "mandatory setup: TO current before the correction");

  await freshResolution(owner, clientTo, { subjectKind: "document", subjectId: cited.documentId });
  const proposal = await proposeCorrection(owner, { document: cited.documentId, fromClient: clientFrom, toClient: clientTo, reason: "x57 E9b filed to the wrong client" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  assert.ok(correctionId, `propose_wrong_client_correction returns a correction id (got ${JSON.stringify(proposal)})`);
  const planHash = proposal.plan_hash
    ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;

  let stateFromInsideTxn = null;
  let stateToInsideTxn = null;
  await inHumanTxn(checker, async (txc) => {
    await callInTxn(txc, "approve_wrong_client_correction", [
      { name: "p_correction" }, { name: "p_plan_hash" }, { name: "p_attestation" }, { name: "p_op_key" },
    ], [correctionId, planHash, null, opk("x57-e9b-approvecorr")]);
    stateFromInsideTxn = await txnSnapshotState(txc, receiptFrom.snapshot_id);
    stateToInsideTxn = await txnSnapshotState(txc, receiptTo.snapshot_id);
  });
  assert.equal(stateFromInsideTxn, "stale", `E9(b): the FROM-client's snapshot went STALE inside the SAME transaction as the correction's approve (got ${stateFromInsideTxn})`);
  const fromRows = await assessmentRows(receiptFrom.snapshot_id);
  assert.equal(fromRows.find((r) => r.assessment === "stale").caused_by_table, "journal_entries", "the correction's mirror is a journal_entries row -- the FOURTH approve path E-R3's writer table names");

  // POSITIVE ASSERTION: the correction's OWN transaction books nothing at TO,
  // so TO's artifact stays current THROUGH it -- not an absence, a measured
  // fact taken inside the same transaction that just marked FROM stale.
  assert.equal(stateToInsideTxn, "current", `E9(b): TO's snapshot stays CURRENT through the correction's own transaction (got ${stateToInsideTxn}) -- the live body reverses at FROM only and re-books at TO LATER, via that client's own recoding`);
  const toRowsDuring = await assessmentRows(receiptTo.snapshot_id);
  assert.equal(toRowsDuring.filter((r) => r.assessment === "stale").length, 0, "TO carries ZERO stale assessment rows from the correction itself");

  // THE RECODING HALF: an ordinary draft+approve at TO (standing in for the
  // human recoding the task the correction opened) marks TO stale later, at
  // its OWN row-1 JE-arm event -- a separate transaction, not the correction's.
  const recodeDate = `${monthStart.slice(0, 8)}11`;
  const recode = await draftEntryV3(owner, {
    client: clientTo, resolution: await freshResolution(owner, clientTo, { subjectKind: "manual", subjectId: null }),
    postingDate: recodeDate, memo: "x57 E9b TO recoding",
    lines: [
      { account_code: AR1, debit_cents: 90_000, credit_cents: 0, description: "dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 90_000, description: "cr" },
    ],
    vendor: { existing_id: cpTo, kind: "customer" }, opKey: opk("x57-e9b-recode-draft"),
  });
  await approveEntry(owner, { entry: recode.entry_id, expectedRevision: recode.revision_token, opKey: opk("x57-e9b-recode-approve") });
  assert.equal(await snapshotState(owner, { snapshot: receiptTo.snapshot_id }), "stale", "E9(b) recoding half: TO's snapshot marks stale at its OWN recoding approve -- a separate, later, ordinary row-1 JE-arm event");
  const toRowsAfter = await assessmentRows(receiptTo.snapshot_id);
  assert.equal(toRowsAfter.find((r) => r.assessment === "stale").caused_by_table, "journal_entries");
});

// ===========================================================================
// E11 -- the BANK writers, at their TRUE effect tables.
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

test("E11(iv/v): complete INSERT and void UPDATE each mark a fresh artifact STALE inside their own transaction (bank_reconciliations), while management_accounts bytes do not drift", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e11recon");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  const { periodStart, periodEnd } = monthBounds(monthStart);
  const acct = await addBankAccount(owner, {
    client, bankCode: "MBB", accountNumber: "9057000004", coaAccountCode: BANK1,
    opKey: opk("x57-e11recon-acct"),
  });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  const stmt = await enterStatement(owner, {
    client, bankAccount: bankAccountId, periodStart, periodEnd, opening: 0,
    specs: [], keepPeriod: true,
  });

  const beforeComplete = await mintMonthSnapshot(owner, {
    client, monthStart, opKey: opk("x57-e11recon-mint-insert"),
  });
  assert.equal(await snapshotState(owner, { snapshot: beforeComplete.snapshot_id }), "current");

  let completeReceipt = null;
  let stateInsideComplete = null;
  await inHumanTxn(owner, async (txc) => {
    completeReceipt = await callInTxn(txc, "complete_bank_reconciliation", [
      { name: "p_statement" }, { name: "p_ack_outstanding", cast: "uuid[]" }, { name: "p_op_key" },
    ], [stmt.statementId, [], opk("x57-e11recon-complete")]);
    stateInsideComplete = await txnSnapshotState(txc, beforeComplete.snapshot_id);
  });
  assert.equal(stateInsideComplete, "stale", `E11(iv): STALE inside the SAME transaction as complete_bank_reconciliation's INSERT (got ${stateInsideComplete})`);
  const completeRows = await assessmentRows(beforeComplete.snapshot_id);
  assert.equal(completeRows.find((r) => r.assessment === "stale").caused_by_table, "bank_reconciliations");
  const afterComplete = await verifySnapshot(owner, { snapshot: beforeComplete.snapshot_id });
  assert.equal(afterComplete.drift, false, `bank_reconciliations deliberately overcovers management_accounts -- INSERT marks stale while deterministic recomputation reports no dataset drift (got ${JSON.stringify(afterComplete)})`);
  assert.ok(afterComplete.covered_tables_inert_for_this_payload.includes("bank_reconciliations"), "verify_snapshot names bank_reconciliations as inert for THIS payload kind");

  const beforeVoid = await mintMonthSnapshot(owner, {
    client, monthStart, opKey: opk("x57-e11recon-mint-update"),
  });
  assert.equal(await snapshotState(owner, { snapshot: beforeVoid.snapshot_id }), "current");
  const recon = idOf(completeReceipt, "reconciliation_id", "recon_id", "id");
  assert.ok(recon, `completion returned a reconciliation id (got ${JSON.stringify(completeReceipt)})`);

  let stateInsideVoid = null;
  await inHumanTxn(owner, async (txc) => {
    await callInTxn(txc, "void_bank_reconciliation", [
      { name: "p_recon" }, { name: "p_reason" }, { name: "p_op_key" },
    ], [recon, "x57 E11 reconciliation void", opk("x57-e11recon-void")]);
    stateInsideVoid = await txnSnapshotState(txc, beforeVoid.snapshot_id);
  });
  assert.equal(stateInsideVoid, "stale", `E11(v): STALE inside the SAME transaction as void_bank_reconciliation's UPDATE (got ${stateInsideVoid})`);
  const voidRows = await assessmentRows(beforeVoid.snapshot_id);
  assert.equal(voidRows.find((r) => r.assessment === "stale").caused_by_table, "bank_reconciliations");
  const afterVoid = await verifySnapshot(owner, { snapshot: beforeVoid.snapshot_id });
  assert.equal(afterVoid.drift, false, `bank_reconciliations deliberately overcovers management_accounts -- UPDATE marks stale while deterministic recomputation reports no dataset drift (got ${JSON.stringify(afterVoid)})`);
});

// ===========================================================================
// THE FA ARM, FIRED HONESTLY (R2 residual, accepted 2026-08-11). A revision
// with an IN-PERIOD effective boundary marks the artifact STALE
// (caused_by_table='fixed_assets') AND verify_snapshot reports drift=FALSE --
// a positive read pinning the documented truth that fixed_assets is one of
// the FOUR tables inert for a management_accounts payload (it owns no
// trial_balance/aging figure), yet still marks as the fail-safe direction so
// a FUTURE payload kind (an FA register pack) is covered from day one.
// ===========================================================================
test("the FA arm: revise_fixed_asset_particulars with an in-period effective_from marks the artifact STALE (fixed_assets), and verify_snapshot reports drift=FALSE -- fixed_assets is INERT for this payload kind", async (t) => {
  if (skip57(t)) return;
  const fa = await faWorld();
  const faSub = fa.users.alice;
  const client = await freshFaClient("x57fa1");
  const monthStart = await pastMonthStart(6);
  const acquireDate = addDaysStr(monthStart, -180); // well before the snapshotted month
  const { asset } = await buyAsset({ client, cents: 200_000, postingDate: acquireDate });
  await completeSL(client, asset.id, { life: 36, start: acquireDate, description: "x57 FA arm asset" });

  const receipt = await mintMonthSnapshot(faSub, { client, monthStart });
  assert.equal(await snapshotState(faSub, { snapshot: receipt.snapshot_id }), "current");
  const before = await verifySnapshot(faSub, { snapshot: receipt.snapshot_id });
  assert.equal(before.drift, false, "mandatory setup: no drift before the revision");

  const inPeriodEffectiveFrom = `${monthStart.slice(0, 8)}12`;
  await reviseParticulars(faSub, {
    client, asset: asset.id,
    particulars: { method: "straight_line", useful_life_months: 24, residual_cents: 0, start_date: acquireDate },
    effectiveFrom: inPeriodEffectiveFrom,
  });

  assert.equal(await snapshotState(faSub, { snapshot: receipt.snapshot_id }), "stale", "the FA arm marks stale on an in-period revision");
  const rows = await assessmentRows(receipt.snapshot_id);
  assert.equal(rows.find((r) => r.assessment === "stale").caused_by_table, "fixed_assets");

  const after = await verifySnapshot(faSub, { snapshot: receipt.snapshot_id });
  assert.equal(after.drift, false, `fixed_assets is INERT for a management_accounts payload -- the recompute confirms zero drift even though the trigger correctly (fail-safe) marked stale (got ${JSON.stringify(after)})`);
  assert.ok(after.covered_tables_inert_for_this_payload.includes("fixed_assets"), "verify_snapshot's own payload names fixed_assets as inert for THIS payload kind");
});
