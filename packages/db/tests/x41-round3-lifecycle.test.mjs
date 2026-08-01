// 0041 Wave D-a — the ROUND-3 fix-ledger battery, part B: REVERSAL DISPATCH AND
// LIFECYCLE-AWARE DEPENDENCY PROBES (fix ledger F4 + F6).
//
// The shape under test: reversal must discriminate on the ORIGINAL ENTRY's own
// proposal, never on the ROW SHAPE of whatever happens to descend from it, and every
// dependency probe must be lifecycle-aware (an `unwound` row is not a dependency).
// The house correction law is reverse-not-delete, so NO approved entry may ever be
// permanently un-reversible — every refusal below is followed all the way to green.
//
//   x41.p1  revise (twice) → reverse the acquisition: the WHOLE revision chain unwinds.
//   x41.p2  revise + live charges → the refusal is `fa_reverse_while_depreciated`
//           (followable), and following it reaches green.
//   x41.p3  split → reverse the split → reverse the acquisition: UNWOUND successors
//           are not dependencies.
//   x41.p4  full disposal of a REVISION successor reverses as a FULL restore — the
//           revision stays intact and the predecessor is never resurrected.
//   x41.p5  split → dispose the remainder → both reversible, in order (the deadlock).
//   x41.p6  F6 — `reverse_entry` carries the verb-side FA guard (no poison draft is
//           ever minted) AND the approve-time twin still re-derives it.
//   x41.p7  the successor-advanced refusal on a DETERMINISTIC fixture, plus its remedy.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  refuses, idOf, T, BANK, GAIN, LOSS, mon, dayIn,
  reverseEntry, approveEntry, runPeriod, reviseParticulars,
  faWorld, faRow, faRows, chargeRows, entryRowOf, liveRanges, lineageIdsOf,
  freshFaClient, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle,
  disposeAndSettle, reverseAndSettle,
} from "./x41-round3-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round3-lifecycle");
  printSkipCount("x41-round3-lifecycle");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3 lifecycle battery");

/** Every mirror minted against an original entry (a REFUSED reversal must mint none —
 *  that is the whole point of the verb-side guard: no un-approvable poison draft). */
const mirrorsOf = async (entry) =>
  (await rootQuery("select id, status from clara.journal_entries where reversal_of=$1", [entry])).rows;

/** Every register row of a lineage, keyed by id. */
async function lineageRows(client, root) {
  const ids = await lineageIdsOf(client, root);
  const rows = await faRows(client);
  return ids.map((id) => rows.find((r) => r.id === id));
}

// ===========================================================================
// x41.p1 / p2 — REVISION LINEAGE UNWIND (F4).
// ===========================================================================

test("x41.p1 an acquisition whose asset was REVISED is still reversible: the whole single-successor revision chain unwinds together", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("p1");
  const start = mon(-2);
  const { entry, asset } = await buyAsset({ client, cents: 50_000, postingDate: dayIn(start, 3), memo: "x41 p1" });
  await completeSL(client, asset.id, { life: 24, start: start.start, description: "x41 p1" });

  // TWO prospective revisions — the chain is three rows deep, so "unwinds the WHOLE
  // chain" is a real claim and not a one-hop coincidence.
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: dayIn(mon(-1), 1),
    particulars: { method: "straight_line", useful_life_months: 36, residual_cents: 0, start_date: start.start },
  });
  const mid = (await faRow(asset.id)).superseded_by_asset_id;
  await reviseParticulars(w.users.alice, {
    client, asset: mid, effectiveFrom: dayIn(mon(-1), 15),
    particulars: { method: "straight_line", useful_life_months: 48, residual_cents: 0, start_date: start.start },
  });
  const chain = await lineageIdsOf(client, asset.id);
  assert.equal(chain.length, 3, `mandatory setup: a three-row revision chain (got ${chain.length})`);

  // A revision is not an entry, so "reverse the descendants first" would be an
  // UN-FOLLOWABLE remedy — the acquisition must simply reverse (F4).
  await reverseAndSettle(w.users.alice, { entry, reason: "x41 p1 mis-coded purchase", opKey: opk("x41p1") });
  for (const row of await lineageRows(client, asset.id)) {
    assert.equal(row.status, "unwound",
      `every row of the revision lineage is UNWOUND by the acquisition reversal (row ${row.id} is '${row.status}')`);
    assert.equal(row.superseded_by_asset_id, null,
      "…and an unwound row carries superseded_by_asset_id NULL (ck_fixed_assets_superseded_state_0017 stays satisfied)");
  }
});

test("x41.p2 a revised asset carrying LIVE charges refuses by the FOLLOWABLE name, and following the named remedy reaches green", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("p2");
  const start = mon(-3);
  const { entry, asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1), memo: "x41 p2" });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 p2" });
  await liveAuthority(client);
  const ramp = await earnRamp(client, start);
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: mon(-1).start,
    particulars: { method: "straight_line", useful_life_months: 24, residual_cents: 0, start_date: start.start },
  });

  // The refusal names the LIVE CHARGES (which are reversible), never the revision
  // successor (which is not an entry and has no reversal verb) — F4.
  await refuses(() => reverseEntry(w.users.alice, { entry, reason: "x41 p2 refuse", opKey: opk("x41p2a") }),
    T.reverseDepreciated, "reversing an acquisition whose REVISED lineage still carries live depreciation charges");
  assert.deepEqual(await mirrorsOf(entry), [], "…and the refusal minted NO mirror (F6: no poison draft)");

  // Follow the remedy all the way: reverse the charge, then the acquisition.
  await reverseAndSettle(w.users.alice, { entry: ramp.entryId, reason: "x41 p2 undo charge", opKey: opk("x41p2b") });
  assert.equal((await liveRanges(asset.id)).length, 0, "the named remedy really cleared the live charges");
  await reverseAndSettle(w.users.alice, { entry, reason: "x41 p2 undo acquisition", opKey: opk("x41p2c") });
  for (const row of await lineageRows(client, asset.id)) {
    assert.equal(row.status, "unwound", `…and the acquisition then reverses green (row ${row.id} is '${row.status}')`);
  }
});

// ===========================================================================
// x41.p3 / p4 / p5 — DISPOSAL/SPLIT DISPATCH AND DEPENDENCY ORDER (F4).
// ===========================================================================

test("x41.p3 split → reverse the split → reverse the acquisition: an UNWOUND successor is not a dependency", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("p3");
  const start = mon(-3);
  const { entry, asset } = await buyAsset({ client, cents: 4_000_000, postingDate: dayIn(start, 1), memo: "x41 p3" });
  await completeSL(client, asset.id, { life: 40, start: start.start, description: "x41 p3" });
  // No authority: the per-asset precondition is over DUE periods and none exist, so the
  // split rides its own stub alone (the x41.g4c law) and this cell stays about dispatch.
  const split = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-1), 7), proceedsCents: 400_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 p3 split",
    costPortionCents: 1_000_000,
  });
  const successors = (await faRows(client)).filter((r) => r.supersedes_asset_id === asset.id);
  assert.equal(successors.length, 2, "mandatory setup: the split produced two successors");

  await reverseAndSettle(w.users.alice, { entry: split.entryId, reason: "x41 p3 undo split", opKey: opk("x41p3a") });
  assert.equal((await faRow(asset.id)).status, "active", "the split reversal restored the original");
  for (const s of successors) {
    assert.equal((await faRow(s.id)).status, "unwound", `…and unwound successor ${s.id}`);
  }
  assert.equal((await liveRanges(asset.id)).length, 0, "…and unwound the stub charges it had minted");

  // THE PIN: the acquisition is now reachable. Design §2.4's "refuses UNTIL those are
  // reversed" must have a reachable 'until' — a status-blind descendants probe does not.
  await reverseAndSettle(w.users.alice, { entry, reason: "x41 p3 undo acquisition", opKey: opk("x41p3b") });
  assert.equal((await faRow(asset.id)).status, "unwound",
    "the acquisition reverses green once the split is reversed — unwound successors are NOT live descendants (F4)");
});

test("x41.p4 a FULL disposal of a REVISION successor reverses as a full restore: the successor comes back and the revision is left intact", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("p4");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1), memo: "x41 p4" });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 p4" });
  const revFrom = dayIn(mon(-2), 1);
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: revFrom,
    particulars: { method: "straight_line", useful_life_months: 48, residual_cents: 0, start_date: start.start },
  });
  const predBefore = await faRow(asset.id);
  const succId = predBefore.superseded_by_asset_id;
  assert.ok(succId, "mandatory setup: the revision named a successor");
  assert.equal(Number((await faRow(succId)).useful_life_months), 48, "…carrying the REVISED life");

  const disposal = await disposeAndSettle(w.users.alice, {
    client, asset: succId, disposalDate: dayIn(mon(-1), 15), proceedsCents: 100_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 p4 sold",
  });
  assert.equal((await faRow(succId)).status, "disposed", "mandatory setup: the successor is disposed");

  // A full disposal is a full disposal, however the disposed ROW came to exist. The
  // branch must key on the ORIGINAL entry's `fa_disposal.cost_portion_cents` being NULL,
  // never on `supersedes_asset_id is not null` (F4).
  await reverseAndSettle(w.users.alice, { entry: disposal.entryId, reason: "x41 p4 undo sale", opKey: opk("x41p4") });
  const succAfter = await faRow(succId);
  assert.equal(succAfter.status, "active", "the disposed SUCCESSOR is restored to active (a FULL restore)");
  assert.equal(succAfter.disposed_at, null, "…disposed_at cleared");
  assert.equal(succAfter.disposal_entry_id, null, "…and disposal_entry_id cleared");
  assert.equal(Number(succAfter.useful_life_months), 48, "…still carrying the revised life");

  const predAfter = await faRow(asset.id);
  assert.equal(predAfter.status, "superseded",
    "the MPERS-17.19 revision is INTACT — an unrelated disposal reversal never resurrects the pre-revision row (F4)");
  assert.equal(predAfter.superseded_by_asset_id, succId, "…still naming its successor");
  assert.equal(predAfter.superseded_at, revFrom, "…with superseded_at untouched");
  assert.equal(Number(predAfter.useful_life_months), 36, "…and its own pre-revision life untouched");
  for (const r of await chargeRows(succId)) {
    if (r.entry_id !== disposal.entryId || r.unwind_of) continue;
    assert.ok((await chargeRows(succId)).some((u) => u.unwind_of === r.id),
      "every stub charge the disposal minted is unwound by its reversal");
  }
});

test("x41.p5 the two-step deadlock is gone: split a machine, sell the remainder, and BOTH entries reverse — in dependency order", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("p5");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 4_000_000, postingDate: dayIn(start, 1), memo: "x41 p5" });
  await completeSL(client, asset.id, { life: 40, start: start.start, description: "x41 p5" });
  const split = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-2), 7), proceedsCents: 400_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 p5 split",
    costPortionCents: 1_000_000,
  });
  const successors = (await faRows(client)).filter((r) => r.supersedes_asset_id === asset.id);
  const continuing = successors.find((r) => r.status !== "disposed");
  assert.ok(continuing, "mandatory setup: the split left a continuing successor");

  const sale = await disposeAndSettle(w.users.alice, {
    client, asset: continuing.id, disposalDate: dayIn(mon(-1), 9), proceedsCents: 2_500_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 p5 sold the remainder",
  });
  assert.equal((await faRow(continuing.id)).status, "disposed", "mandatory setup: the remainder is sold");

  // The LATER entry first — the ordinary dependency order. It must not be mistaken for a
  // partial-split reversal just because the disposed row has a `supersedes_asset_id`.
  await reverseAndSettle(w.users.alice, { entry: sale.entryId, reason: "x41 p5 undo sale", opKey: opk("x41p5a") });
  assert.equal((await faRow(continuing.id)).status, "active", "reversing the LATER full disposal restores the remainder");

  // …and now the split itself. Its disposed-portion sibling carries THIS entry's own
  // disposal_entry_id, which is not "later state" (F4).
  await reverseAndSettle(w.users.alice, { entry: split.entryId, reason: "x41 p5 undo split", opKey: opk("x41p5b") });
  const restored = await faRow(asset.id);
  assert.equal(restored.status, "active", "…and the split then reverses too, restoring the original");
  assert.equal(restored.superseded_by_asset_id, null, "…superseded_by cleared");
  assert.equal(restored.superseded_at, null, "…and superseded_at cleared");
  for (const s of successors) {
    assert.equal((await faRow(s.id)).status, "unwound", `…both successors unwound (${s.id})`);
  }
});

// ===========================================================================
// x41.p6 / p7 — THE VERB-SIDE GUARD, ITS APPROVE-TIME TWIN, AND SUCCESSOR-ADVANCED.
// ===========================================================================

test("x41.p6 reverse_entry carries the FA guard itself (no un-approvable poison draft is ever minted), and the approve-time TWIN still re-derives it", async (t) => {
  if (skipHere(t)) return;
  // ARM A — the VERB side. A HIGH-STAKES acquisition (above the firm's RM10,000
  // default threshold) is the dangerous case: reverse_entry would otherwise return a
  // success receipt for an act that can never complete, leaving a permanent /queue row.
  const c1 = await freshFaClient("p6a");
  const start = mon(-3);
  const { entry: bigEntry, asset: big } = await buyAsset({
    client: c1, cents: 24_000_000, postingDate: dayIn(start, 1), memo: "x41 p6 high-stakes",
  });
  await completeSL(c1, big.id, { life: 12, start: start.start, description: "x41 p6a" });
  await liveAuthority(c1);
  const ramp = await runPeriod({ client: c1, periodStart: start.start, periodEnd: start.end });
  assert.equal(ramp.status, "drafted", "mandatory setup: the high-stakes ramp run drafts");
  const rampRow = await entryRowOf(ramp.entry_id);
  await approveEntry(w.users.alice, {
    entry: ramp.entry_id, expectedRevision: rampRow.revision_token, opKey: opk("x41p6run"),
  });
  assert.ok((await liveRanges(big.id)).length > 0, "…and a live charge really landed");

  await refuses(() => reverseEntry(w.users.alice, { entry: bigEntry, reason: "x41 p6 verb guard", opKey: opk("x41p6a") }),
    T.reverseDepreciated, "reverse_entry ITSELF on a high-stakes acquisition that carries live charges (F6)");
  assert.deepEqual(await mirrorsOf(bigEntry), [],
    "…and NO mirror exists — the maker never got a success receipt for an act that cannot complete");
  assert.equal((await faRow(big.id)).status, "active", "…and the register is untouched");

  // ARM B — the APPROVE-TIME TWIN. The guard passes at reverse time (no charges yet),
  // the mirror drafts because it is high-stakes, and a charge lands in the maker-checker
  // gap. The hook must re-derive the refusal at approve.
  const c2 = await freshFaClient("p6b");
  const { entry: e2, asset: a2 } = await buyAsset({
    client: c2, cents: 24_000_000, postingDate: dayIn(start, 1), memo: "x41 p6 twin",
  });
  await completeSL(c2, a2.id, { life: 12, start: start.start, description: "x41 p6b" });
  const receipt = await reverseEntry(w.users.alice, { entry: e2, reason: "x41 p6 twin", opKey: opk("x41p6b") });
  const mirrorId = idOf(receipt, "reversal_entry_id", "entry_id", "id") ?? (await mirrorsOf(e2))[0]?.id;
  assert.ok(mirrorId, "a clean acquisition reversal is admitted by the verb and mints its mirror");
  const mirror = await entryRowOf(mirrorId);
  assert.equal(mirror.status, "draft",
    "…and the high-stakes mirror DRAFTS, opening the maker-checker gap the twin exists for");

  await liveAuthority(c2);
  const run2 = await runPeriod({ client: c2, periodStart: start.start, periodEnd: start.end });
  assert.notEqual(run2.status, "noop", "a charge is computed inside the gap");
  const run2Row = await entryRowOf(run2.entry_id);
  if (run2Row.status === "draft") {
    await approveEntry(w.users.alice, {
      entry: run2.entry_id, expectedRevision: run2Row.revision_token, opKey: opk("x41p6run2"),
    });
  }
  assert.ok((await liveRanges(a2.id)).length > 0, "…and it really landed while the mirror was pending");

  await refuses(() => approveEntry(w.users.hana, {
    entry: mirrorId, expectedRevision: mirror.revision_token, opKey: opk("x41p6twin"),
  }), T.reverseDepreciated, "approving the reversal MIRROR after charges landed in the maker-checker gap (the approve-time twin)");
  assert.equal((await faRow(a2.id)).status, "active", "…and the refused approve executed NOTHING");
  noteLane("x41.p6 verb guard + approve-time twin both fired; the mirror stays a draft the checker can withdraw");
});

test("x41.p7 the successor-advanced refusal on a deterministic fixture: a split whose CONTINUING successor was charged refuses by name, and unwinding that charge reaches green", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("p7");
  const start = mon(-4);
  const { asset } = await buyAsset({ client, cents: 4_000_000, postingDate: dayIn(start, 1), memo: "x41 p7" });
  await completeSL(client, asset.id, { life: 40, start: start.start, description: "x41 p7" });
  await liveAuthority(client);
  await earnRamp(client, start);
  await runAndSettle(client, mon(-3)); // every period EARLIER than the disposal month is charged

  const split = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-2), 7), proceedsCents: 400_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 p7 split",
    costPortionCents: 1_000_000,
  });
  const successors = (await faRows(client)).filter((r) => r.supersedes_asset_id === asset.id);
  const continuing = successors.find((r) => r.status !== "disposed");
  assert.ok(continuing, "mandatory setup: the split left a continuing successor");

  // ADVANCE the continuing successor with a charge on a DIFFERENT entry.
  const later = await runAndSettle(client, mon(-1));
  assert.notEqual(later.mode, "noop", "mandatory setup: the next period charged");
  const advanced = await liveRanges(continuing.id);
  assert.ok(advanced.length > 0, `mandatory setup: the continuing successor carries a later charge (got ${advanced.length})`);
  assert.ok(advanced.every((r) => r.entry !== split.entryId), "…on an entry other than the split's own");

  await refuses(() => reverseEntry(w.users.alice, { entry: split.entryId, reason: "x41 p7 refuse", opKey: opk("x41p7a") }),
    T.partialSuccessorAdvanced, "reversing a split whose CONTINUING successor now carries later charges");
  assert.deepEqual(await mirrorsOf(split.entryId), [], "…and the refusal minted NO mirror (F6)");

  // The remedy is followable: unwind the later charge, then the split reverses.
  await reverseAndSettle(w.users.alice, { entry: later.entryId, reason: "x41 p7 undo later", opKey: opk("x41p7b") });
  assert.equal((await liveRanges(continuing.id)).length, 0, "the later charge is unwound");
  await reverseAndSettle(w.users.alice, { entry: split.entryId, reason: "x41 p7 undo split", opKey: opk("x41p7c") });
  assert.equal((await faRow(asset.id)).status, "active", "…and the split then reverses green, restoring the original");
  for (const s of successors) {
    assert.equal((await faRow(s.id)).status, "unwound", `…with both successors unwound (${s.id})`);
  }
});
