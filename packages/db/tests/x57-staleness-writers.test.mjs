// 0057 (Wave E lane gamma, the period registry + month snapshots) rig -- PART 2
// of the staleness family (E9/E11 continue in the sibling
// x57-staleness-writers-part2.test.mjs -- split purely to stay under the
// repo's 500-line-per-file gate, the wave-a-helpers/wave-a-fixtures
// precedent): E2, E2b, E3, E7', E8'. Matrix:
// docs/plan/wave-e-acceptance-matrix.md Section E. Design contract:
// docs/plan/wave-e-design-skeleton-part3.md SS2.11 (the trigger set + the
// INTERSECTS+watermark predicate + the writer table).
//
// R1 FIX BATCH (2026-08-11): E7/E8 were re-specified after the R1 adjudication
// -- THE PRODUCT IS RIGHT, THE OLD CELLS WERE WRONG. The old text conflated the
// underlying ITEMS being dated inside the snapshotted period (item_date) with
// the ALLOCATION ACT ITSELF being dated inside it (effective_date) -- two
// different dates that cannot both be pinned to "inside the period" once
// apply_open_items/unallocate_group always stamp effective_date=_book_today().
// E7'/E8' now carry BOTH the positive read (a today-dated application against
// an already-closed period correctly leaves the artifact current) and the
// trigger-reachability proof (a genuinely backdated allocation DOES mark
// stale, proven two ways).
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
  rootQuery, opk, namedCall, buildWorld, printLaneNotes, printSkipCount,
  noteLane, markSkip, endPool, freshResolution,
  has0056, has0057, freshActiveClient, setupCloseCoa, plainEntry, birthCounterparty, bookToday, addDaysStr,
  REVN, BANK1,
  mintMonthSnapshot, snapshotState, verifySnapshot, assessmentRows, periodSnapshotRow,
  inHumanTxn, txnSnapshotState, openArItem57, creditNote57, caught,
  applyOpenItems57, unallocateGroup, directBackdatedAllocationPairInTxn,
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

function addMonths(monthStart, n) {
  const [y, m] = monthStart.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
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

  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "stale");
  const rows = await assessmentRows(receipt.snapshot_id);
  const staleRow = rows.find((r) => r.assessment === "stale");
  assert.equal(staleRow.reason, "books_moved_after_mint");
  assert.equal(staleRow.caused_by_table, "journal_entries");
});

// ===========================================================================
// E2b -- INTERSECTS, not CONTAINS. A posting into month M-1 marks month M's
// snapshot stale (a prior-period posting moves M's opening/YTD/comparatives).
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
// unchanged; a direct attempt to edit the payload/hash/range is REFUSED.
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

  const err = await caught(() => rootQuery(
    "update clara.period_snapshots set payload = payload || '{\"x57e3\":1}'::jsonb where id=$1",
    [receipt.snapshot_id],
  ));
  assert.ok(err, "E3: a direct payload edit MUST be refused (silent change would be the FAIL)");
  assert.equal(err.code, "CLR08", `E3: refused with CLR08 (immutable) -- got ${err.code} / ${err.message}`);
});

// ===========================================================================
// E7' -- RE-SPECIFIED (R1 adjudication, 2026-08-11): THE PRODUCT IS RIGHT, THE
// OLD CELL WAS WRONG. It conflated the ITEMS being dated inside the
// snapshotted period (item_date) with the ALLOCATION ACT ITSELF being dated
// inside it (effective_date) -- apply_open_items always stamps
// effective_date=_book_today(), so those are two different claims.
//
// Arm A (positive read): a TODAY-dated application against an already-closed
// period does NOT move the pack's as-of-period_end figure -- current stays
// current, and an independent recompute confirms zero drift. Not marking
// stale here is the ACCOUNTING-CORRECT outcome, not an absence.
//
// Arm B (trigger-reachability proof, two ways): the open_item_allocations arm
// of t_snapshot_staleness is real and DOES fire -- (i) allocate_receipt, a
// JE-bearing writer whose date anchor IS the caller's own posting_date (not
// _book_today()), backdated into the period; (ii) a direct, lawful, backdated
// pair inserted straight at the table, proving the allocation arm itself
// (not just the JE arm riding along) marks stale.
// ===========================================================================
test("E7'(A): apply_open_items TODAY, against a past-period invoice+credit-note, leaves the artifact CURRENT with ZERO drift -- the presented as-of-period_end figure genuinely did not move", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e7a");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E7ACO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(6);
  const postingDate = `${monthStart.slice(0, 8)}05`;
  const { item: invItem } = await openArItem57(owner, { client, cp, cents: 80_000, postingDate });
  const { item: creditItem } = await creditNote57(owner, { client, cp, cents: 30_000, postingDate });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  const applyReceipt = await applyOpenItems57(owner, {
    client, applications: [{ source_item_id: creditItem, target_item_id: invItem, amount_cents: 30_000 }],
  });
  // FIX (R2 MINOR 3, accepted 2026-08-11): a truthy receipt alone does not
  // prove the apply actually WROTE anything -- a silent no-op apply would
  // return SOME object and pass an assert.ok. Positively ground the
  // stimulus: read the allocation rows the apply's own group produced.
  // FIX (R2.5 NIT, accepted 2026-08-12): read the EXACT catalog key, never a fallback
  // chain. clara.apply_open_items returns jsonb_build_object('group_id', ...) and nothing
  // else; a ?? chain over three spellings papers over the day that key is renamed, turning
  // a real contract change into a green test. The fixtures' own law: a key divergence is a
  // FINDING, so let it surface as the failed assert on the next line.
  const group = applyReceipt?.group_id ?? null;
  assert.ok(group, `mandatory setup: the apply's receipt names its application_group (got ${JSON.stringify(applyReceipt)})`);
  const allocRows = (await rootQuery(
    "select item_id, amount_cents from clara.open_item_allocations where application_group=$1 order by amount_cents",
    [group],
  )).rows;
  assert.equal(allocRows.length, 2, `the apply GENUINELY wrote a two-row pair (got ${JSON.stringify(allocRows)})`);
  assert.deepEqual(allocRows.map((r) => Number(r.amount_cents)).sort((a, b) => a - b), [-30_000, 30_000],
    "the pair's amounts are the exact applied cents, net zero");
  assert.ok(allocRows.some((r) => r.item_id === invItem) && allocRows.some((r) => r.item_id === creditItem),
    "the pair touches BOTH named items, not some other stray rows");

  assert.equal(
    await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current",
    "E7'(A): a TODAY-dated application against a past, already-closed period does NOT move the artifact's as-of-period_end figure -- a POSITIVE read (proven correct, not merely unobserved)",
  );
  const verified = await verifySnapshot(owner, { snapshot: receipt.snapshot_id });
  assert.equal(verified.drift, false, `E7'(A): independent recompute confirms ZERO drift (got ${JSON.stringify(verified)})`);
  assert.equal(verified.recomputed_dataset_sha256, receipt.dataset_sha256, "the recompute reproduces the SAME bytes");
});

test("E7'(B-i): allocate_receipt backdated INTO the snapshotted period marks the artifact STALE (the JE trigger wins the race), and the minted allocation row carries the BACKDATED effective_date", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e7bi");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E7BICO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(6);
  const invoiceDate = `${monthStart.slice(0, 8)}05`;
  const receiptDate = `${monthStart.slice(0, 8)}20`; // still inside the snapshotted month
  const { item: invItem } = await openArItem57(owner, { client, cp, cents: 100_000, postingDate: invoiceDate });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  let stateInsideTxn = null;
  let allocRows = null;
  await inHumanTxn(owner, async (txc) => {
    await callInTxn(txc, "allocate_receipt", [
      { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
      { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
      { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" },
    ], [
      client, cp, receiptDate, "x57 E7b-i backdated receipt", BANK1, 40_000,
      JSON.stringify([{ item_id: invItem, amount_cents: 40_000 }]),
      opk("x57-e7bi-receipt"),
    ]);
    stateInsideTxn = await txnSnapshotState(txc, receipt.snapshot_id);
    const afterQ = await txc.query("select to_jsonb(o) as row from clara.open_item_allocations o where o.item_id=$1", [invItem]);
    allocRows = afterQ.rows.map((x) => x.row);
  });
  assert.equal(stateInsideTxn, "stale", `E7'(B-i): STALE inside the SAME transaction as allocate_receipt (got ${stateInsideTxn})`);
  assert.ok(allocRows.length >= 1, "mandatory setup: allocate_receipt minted at least one allocation row");
  for (const row of allocRows) {
    assert.equal(row.effective_date, receiptDate, `the minted allocation row carries the BACKDATED effective_date ${receiptDate} (the exact fact the old cell text got wrong), got ${row.effective_date}`);
  }
  const rows = await assessmentRows(receipt.snapshot_id);
  assert.equal(rows.find((r) => r.assessment === "stale").caused_by_table, "journal_entries", "the JE trigger wins the race here (allocate_receipt books a settlement entry in the SAME call) -- this is the expected, honest value, not open_item_allocations");
});

// FIX (Codex round finding 5, 2026-08-11): the old B-ii arm allocated between
// two items sharing the SAME item_date, so both landed in the SAME aging
// bucket and the pair's net-zero amounts left every STORED aging total
// unchanged -- it proved the trigger fires on unmoved bytes, not that the
// mechanism protects a moved FIGURE. It also read state via a separate
// autocommit rootQuery rather than the same-transaction instrument. Rebuilt:
// the two items now sit in DIFFERENT clara._aging_core buckets (current vs
// d61_90, by item_date distance from period_end), so the allocation moves
// BOTH bucket totals while the raw pair still nets to zero (satisfying the
// belt's own group-law); the insert and the in-txn read share one pooled
// client (directBackdatedAllocationPairInTxn); and a POST-COMMIT
// verify_snapshot call proves real drift with the aging key named.
test("E7'(B-ii): a DIRECT, lawful, backdated open_item_allocations pair -- items in DIFFERENT aging buckets -- marks the artifact STALE inside the SAME transaction, and verify_snapshot AFTER commit reports drift=true on the aging key", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e7bii");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E7BIICO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(6);
  const { periodEnd } = monthBounds(monthStart);
  const invoiceDate = addDaysStr(periodEnd, -10); // clara._aging_core: days<=30 -> 'current' bucket
  const creditDate = addDaysStr(periodEnd, -75); // 61<=days<=90 -> 'd61_90' bucket
  const inPeriodEffectiveDate = addDaysStr(periodEnd, -5);
  const { item: invItem } = await openArItem57(owner, { client, cp, cents: 90_000, postingDate: invoiceDate });
  const { item: creditItem } = await creditNote57(owner, { client, cp, cents: 30_000, postingDate: creditDate });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");
  const before = await verifySnapshot(owner, { snapshot: receipt.snapshot_id });
  assert.equal(before.drift, false, "mandatory setup: no drift before the direct pair");

  const { group, stateInsideTxn } = await directBackdatedAllocationPairInTxn(owner, client, {
    invoiceItem: invItem, appliedCents: 30_000, creditItem, effectiveDate: inPeriodEffectiveDate,
    actorUserId: owner, snapshot: receipt.snapshot_id,
  });
  // FIX (R2 MINOR 4, accepted 2026-08-11): `group` is a client-side
  // randomUUID -- always truthy regardless of whether the insert actually
  // persisted. Ground it in the DATABASE state instead: the two rows exist,
  // POST-COMMIT, having survived the deferred subledger belt (which fires
  // AT commit, not at the insert statement).
  const persisted = (await rootQuery(
    // to_jsonb, not a bare column list -- a raw `date` column comes back as a
    // driver-parsed JS Date (timezone-shiftable); to_jsonb serializes it as
    // the clean 'YYYY-MM-DD' string every other reader in this file compares
    // against (the same pitfall E2b/E9's caused_by_effect_date reads avoid).
    "select to_jsonb(o) as row from clara.open_item_allocations o where o.application_group=$1 order by o.amount_cents",
    [group],
  )).rows.map((x) => x.row);
  assert.equal(persisted.length, 2, `the direct pair PERSISTED -- two rows, surviving the deferred belt at commit (got ${JSON.stringify(persisted)})`);
  assert.deepEqual(persisted.map((r) => Number(r.amount_cents)).sort((a, b) => a - b), [-30_000, 30_000], "the persisted pair's amounts are the exact applied cents");
  assert.ok(persisted.every((r) => r.effective_date === inPeriodEffectiveDate), `every persisted row carries the backdated effective_date ${inPeriodEffectiveDate} (got ${JSON.stringify(persisted.map((r) => r.effective_date))})`);
  assert.equal(stateInsideTxn, "stale", `E7'(B-ii): STALE inside the SAME transaction as the direct backdated insert -- proves the allocation arm of t_snapshot_staleness fires on its own (got ${stateInsideTxn})`);

  const rows = await assessmentRows(receipt.snapshot_id);
  const staleRow = rows.find((r) => r.assessment === "stale" && r.caused_by_table === "open_item_allocations");
  assert.ok(staleRow, `E7'(B-ii): at least one assessment row carries caused_by_table='open_item_allocations' (got ${JSON.stringify(rows.map((r) => r.caused_by_table))}) -- this is the suite-wide proof both R1 and the Codex round found zero of`);

  // AFTER commit: a lawful backdated allocation that genuinely MOVES a
  // presented figure (current_cents -30,000; d61_90_cents +30,000; total_cents
  // unchanged) marks real, recomputed drift -- the full ratified protection.
  const after = await verifySnapshot(owner, { snapshot: receipt.snapshot_id });
  assert.equal(after.drift, true, `E7'(B-ii): verify_snapshot reports REAL drift after a bucket-moving allocation (got ${JSON.stringify(after)})`);
  assert.ok(after.drifted_keys.includes("ar_aging"), `the drifted key is ar_aging (got ${JSON.stringify(after.drifted_keys)})`);
});

// ===========================================================================
// E8' -- symmetric to E7'(A): unallocate_group TODAY, undoing a past-period
// application, leaves a freshly re-minted artifact CURRENT with zero drift.
// The shared Arm B (trigger reachability) is discharged once, under E7', per
// the R1 fix-batch scope (E7'/E8' collectively require it; both writers hit
// the SAME open_item_allocations arm of the SAME trigger).
// ===========================================================================
test("E8'(A): unallocate_group TODAY, undoing a past-period application, leaves a freshly re-minted artifact CURRENT with ZERO drift", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e8a");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E8ACO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(6);
  const postingDate = `${monthStart.slice(0, 8)}05`;
  const { item: invItem } = await openArItem57(owner, { client, cp, cents: 70_000, postingDate });
  const { item: creditItem } = await creditNote57(owner, { client, cp, cents: 25_000, postingDate });

  const applyReceipt = await applyOpenItems57(owner, {
    client, applications: [{ source_item_id: creditItem, target_item_id: invItem, amount_cents: 25_000 }],
  });
  // FIX (R2.5 NIT, accepted 2026-08-12): read the EXACT catalog key, never a fallback
  // chain. clara.apply_open_items returns jsonb_build_object('group_id', ...) and nothing
  // else; a ?? chain over three spellings papers over the day that key is renamed, turning
  // a real contract change into a green test. The fixtures' own law: a key divergence is a
  // FINDING, so let it surface as the failed assert on the next line.
  const group = applyReceipt?.group_id ?? null;
  assert.ok(group, "mandatory setup: the apply named its group");

  // A FRESH snapshot, minted AFTER the apply settled -- 'current' -- so this
  // cell isolates unallocate_group's OWN (today-dated) contribution.
  const receipt = await mintMonthSnapshot(owner, { client, monthStart, opKey: opk("x57-e8a-mint2") });
  assert.equal(await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current");

  await unallocateGroup(owner, { client, group });

  assert.equal(
    await snapshotState(owner, { snapshot: receipt.snapshot_id }), "current",
    "E8'(A): a TODAY-dated unallocate against a past, already-closed period does NOT move the artifact's as-of-period_end figure -- stays current, a POSITIVE read",
  );
  const verified = await verifySnapshot(owner, { snapshot: receipt.snapshot_id });
  assert.equal(verified.drift, false, `E8'(A): independent recompute confirms ZERO drift (got ${JSON.stringify(verified)})`);
  assert.equal(verified.recomputed_dataset_sha256, receipt.dataset_sha256);
});
