// 0041 Wave D-a — the ROUND-3.5 fix-ledger battery, part G: THE SPLIT-REVERSAL CLOSURE
// ABSORBS CLEAN REVISION CHAINS BELOW A SPLIT CHILD (G5).
//
//   x41.s9a  THE ADMISSION — split, then REVISE the continuing child (a prospective
//            MPERS-17.19 particulars revision), then reverse the SPLIT: it must SUCCEED.
//            The original comes back active with superseded_by/superseded_at cleared,
//            BOTH split successors unwind, and the child's REVISION successor unwinds
//            with them. The register ties to the GL at an as-of past the mirror, every
//            stub the split minted is unwound, and the lineage holds no live charge.
//            …and then (the (c) arm) the ACQUISITION above it is reversible too — the
//            chain the reversal left behind is truly clean, not merely quiet.
//   x41.s9b  THE REFUSAL BOUNDARY (charges) — the same shape, but the revision successor
//            carries a LATER live charge: reversing the split refuses by the named token,
//            mints NO mirror, and the named remedy reaches green.
//   x41.s9c  THE REFUSAL BOUNDARY (disposal) — the same shape, but the revision successor
//            has been DISPOSED: refused by the same token, and its remedy reaches green.
//
// WHY. A particulars revision is NOT an entry: it has no mirror, no reversal verb, no
// "reverse the descendant first" remedy a bookkeeper could follow. So a successor-advanced
// guard that treats a merely-REVISED child as "advanced" does not defer the split reversal
// — it deletes it, permanently, and the acquisition above it with it. That collides head-on
// with the house's reverse-not-delete law: no approved entry may ever become un-reversible.
// The fix is a CLOSURE, not an exemption — the same absorption the acquisition arm already
// performs, reused below both split children — so the refusal must still bite on the states
// that DO have a followable remedy: a live charge, a disposal, a further split. s9b and s9c
// are the two halves of that boundary; without them s9a would merely prove the guard was
// switched off.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers): authored from
// docs/plan/completed/wave-d-a-fa-design.md v2.1 §2.3/§2.4/§4.3 + the adjudicated round-3.5 fix ledger
// (G5) ONLY. This lane never reads 0041's SQL, the fix diffs, or the harvested live bodies.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  refuses, T, COST, ACCUM, BANK, GAIN, LOSS, mon, dayIn,
  reverseEntry, reviseParticulars, faRegisterTie, drainDue,
  faWorld, faRow, faRows, chargeRows, entryRowOf, glNet,
  liveRanges, lineageIdsOf, lineageLiveRanges,
  freshFaClient, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle,
  disposeAndSettle, reverseAndSettle, tieAccts, tieSumBy,
} from "./x41-round35-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round35-g5");
  printSkipCount("x41-round35-g5");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3.5 G5 admission battery");

// ---------------------------------------------------------------------------
// Local readers (all root readbacks — fixtures and assertions only).
// ---------------------------------------------------------------------------

/** Every mirror minted against an original entry. A REFUSED reversal must mint NONE —
 *  the round-3 F6 law: no un-approvable poison draft, in either direction. */
const mirrorsOf = async (entry) =>
  (await rootQuery("select id, status from clara.journal_entries where reversal_of=$1", [entry])).rows;

/** The four-row shape this whole file is about, captured BEFORE any reversal: the
 *  reversal clears `superseded_by_asset_id`, so a lineage walked afterwards would no
 *  longer reach the rows whose statuses are the claim. */
async function splitShape(client, root) {
  const rows = await faRows(client);
  const successors = rows.filter((r) => r.supersedes_asset_id === root);
  assert.equal(successors.length, 2, `mandatory setup: the split produced two successors (got ${successors.length})`);
  const disposed = successors.find((r) => r.status === "disposed");
  const continuing = successors.find((r) => r.status !== "disposed");
  assert.ok(disposed, "mandatory setup: one successor carries the disposed portion");
  assert.ok(continuing, "mandatory setup: the other successor continues");
  return { disposed, continuing };
}

/** Every charge row across a whole lineage, whatever its status. */
async function lineageCharges(client, root) {
  const out = [];
  for (const id of await lineageIdsOf(client, root)) {
    for (const r of await chargeRows(id)) out.push({ ...r, asset: id });
  }
  return out;
}

/** Every non-unwind charge row in `rows` must carry an unwind row of its own. */
function assertAllUnwound(rows, label) {
  const unwinds = new Set(rows.filter((r) => r.unwind_of).map((r) => r.unwind_of));
  const originals = rows.filter((r) => !r.unwind_of);
  for (const r of originals) {
    assert.ok(unwinds.has(r.id),
      `${label}: charge ${r.period_start}..${r.period_end} on asset ${r.asset} is UNWOUND by the reversal`);
  }
  return originals.length;
}

/** The tie, GREEN, measured with the instrument production itself uses. */
async function assertTieGreen(client, asOf, label, { drill = true } = {}) {
  const tie = await faRegisterTie(w.users.alice, client, asOf);
  assert.equal(tie.tie, true,
    `${label}: fa_register_tie is GREEN at ${asOf} — got ${JSON.stringify(tie.accounts ?? tie)}`);
  if (!drill) return tie;
  const rows = tieAccts(tie, COST);
  assert.ok(rows.length >= 1, `${label}: the enrolled cost account appears in the tie at ${asOf}`);
  assert.equal(tieSumBy(rows, /^cost_diff/, `${label} tie cost difference`), 0,
    `${label}: cost difference EXACTLY zero at ${asOf}`);
  assert.equal(tieSumBy(rows, /^accum_diff/, `${label} tie accumulated difference`), 0,
    `${label}: accumulated difference EXACTLY zero at ${asOf}`);
  // `0 - x`, NEVER `-x`: after everything has unwound both sides are zero, and `-0` is a
  // DIFFERENT value from `0` under strictEqual — a zero-vs-zero red would be a cell bug
  // wearing a books-defect costume (the x41.s2 note).
  assert.equal(tieSumBy(rows, /^register_accum/, `${label} tie register accumulated`),
    0 - (await glNet(client, ACCUM, asOf)),
    `${label}: the register accumulated side equals the independently-summed GL legs at ${asOf}`);
  return tie;
}

// ===========================================================================
// x41.s9a — THE ADMISSION (G5), and the acquisition above it stays reversible.
// ===========================================================================

test("x41.s9a a split whose continuing child was merely REVISED still reverses: the original is restored, both successors AND the revision successor unwind, the register ties past the mirror — and the acquisition above is reversible afterwards", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s9a");
  const start = mon(-4);
  const { entry: acquisition, asset } = await buyAsset({
    client, cents: 4_000_000, postingDate: dayIn(start, 1), memo: "x41 s9a machine",
  });
  await completeSL(client, asset.id, { life: 40, start: start.start, description: "x41 s9a" });
  // NO authority: the per-asset precondition is over DUE periods and none exist, so the
  // split rides its own stub alone (the x41.p3 idiom) and this cell stays about the
  // CLOSURE — a live charge on the original would be a different refusal entirely.

  const split = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-3), 7), proceedsCents: 400_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 s9a split",
    costPortionCents: 1_000_000,
  });
  const { disposed, continuing } = await splitShape(client, asset.id);
  noteLane(`x41.s9a the split proposal landed as '${split.mode}'; continuing cost=${continuing.cost_cents}, disposed portion=${disposed.cost_cents}`);

  // THE SHAPE THAT BREAKS THE DEFECT: a prospective particulars revision on the CONTINUING
  // child. Effective AFTER the disposal month, so it can never collide with the stub.
  const revFrom = dayIn(mon(-2), 1);
  await reviseParticulars(w.users.alice, {
    client, asset: continuing.id, effectiveFrom: revFrom,
    particulars: { method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: start.start },
  });
  const childAfterRevision = await faRow(continuing.id);
  assert.equal(childAfterRevision.status, "superseded",
    "mandatory setup: the revision superseded the continuing child");
  const grandchild = childAfterRevision.superseded_by_asset_id;
  assert.ok(grandchild, "…and named its revision successor");
  const grandchildRow = await faRow(grandchild);
  assert.equal(Number(grandchildRow.useful_life_months), 60, "…carrying the REVISED life");
  assert.equal(grandchildRow.status, "active", "…and the revision successor is the LIVE row");

  const lineageBefore = await lineageIdsOf(client, asset.id);
  assert.equal(lineageBefore.length, 4,
    `mandatory setup: original + two split successors + the revision successor (got ${lineageBefore.length})`);
  const chargesBefore = await lineageCharges(client, asset.id);
  noteLane(`x41.s9a lineage before the reversal: ${lineageBefore.length} rows, ${chargesBefore.length} charge row(s)`);

  // ---- THE ADMISSION. A revision is not an entry: "reverse the descendant first" is an
  // UN-FOLLOWABLE remedy, so refusing here would make the split — and the acquisition above
  // it — permanently un-reversible. The closure must absorb the clean chain (G5).
  const rev = await reverseAndSettle(w.users.alice, {
    entry: split.entryId, reason: "x41 s9a undo the split", opKey: opk("x41s9a"),
  });
  const mirror = await entryRowOf(rev.mirrorId);
  noteLane(`x41.s9a the split mirror landed '${rev.mode}' posted ${mirror.posting_date}`);

  const restored = await faRow(asset.id);
  assert.equal(restored.status, "active", "the ORIGINAL is restored to active");
  assert.equal(restored.superseded_by_asset_id, null, "…superseded_by cleared");
  assert.equal(restored.superseded_at, null, "…and superseded_at cleared");
  for (const [label, id] of [["the disposed portion", disposed.id], ["the continuing child", continuing.id],
    ["the child's REVISION successor", grandchild]]) {
    const row = await faRow(id);
    assert.equal(row.status, "unwound", `${label} (${id}) is UNWOUND by the split reversal`);
    assert.equal(row.superseded_by_asset_id, null,
      `…and ${label} carries superseded_by_asset_id NULL (ck_fixed_assets_superseded_state_0017 stays satisfied)`);
  }

  // CHARGES + HISTORY COHERENT: nothing live anywhere in the lineage, and every stub the
  // split minted was unwound rather than deleted (append-only, reverse-not-delete).
  assert.equal((await lineageLiveRanges(client, asset.id)).length, 0,
    "no LIVE charge survives anywhere in the lineage after the split reversal");
  const stubs = assertAllUnwound(await lineageCharges(client, asset.id), "x41.s9a");
  noteLane(`x41.s9a ${stubs} stub charge(s) were unwound by the split reversal`);

  // THE BOOKS. At/past the mirror's posting date the A6 correction window is CLOSED (the
  // GL has been put back exactly as the register was), so the tie is a real assertion here
  // and not one measured inside a legitimate, self-closing disagreement. Every as-of in
  // this file is the mirror's own date — never a future date, whose behaviour no cell in
  // this battery has established.
  await assertTieGreen(client, mirror.posting_date, "x41.s9a at the split mirror's own posting date");
  assert.equal(await glNet(client, COST), Number(restored.cost_cents),
    "the GL cost account carries exactly the restored original's cost — the split's cost credit is fully reversed");
  assert.equal(await glNet(client, ACCUM), 0, "…and the accumulated account nets to zero, the stub having been unwound");

  // ---- (c) THE CHAIN IS TRULY CLEAN. Design §2.4's "refuses UNTIL those are reversed"
  // must have a reachable 'until': after the split reversal the acquisition itself must go.
  const acqRev = await reverseAndSettle(w.users.alice, {
    entry: acquisition, reason: "x41 s9a mis-coded purchase", opKey: opk("x41s9ac"),
  });
  for (const id of lineageBefore) {
    assert.equal((await faRow(id)).status, "unwound",
      `the acquisition reverses green afterwards and row ${id} is unwound — unwound successors are NOT live descendants`);
  }
  assert.equal(await glNet(client, COST), 0, "…and the GL cost account is back to zero");
  const acqMirror = await entryRowOf(acqRev.mirrorId);
  await assertTieGreen(client, acqMirror.posting_date, "x41.s9a after the acquisition reversal", { drill: false });
});

// ===========================================================================
// x41.s9b — THE REFUSAL BOUNDARY: a LATER LIVE CHARGE below the revised child.
// ===========================================================================

test("x41.s9b the closure is not an exemption: a revision successor carrying a LATER LIVE CHARGE still refuses the split reversal by name, mints no mirror, and the named remedy reaches green", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s9b");
  const start = mon(-4);
  const { asset } = await buyAsset({
    client, cents: 4_000_000, postingDate: dayIn(start, 1), memo: "x41 s9b machine",
  });
  await completeSL(client, asset.id, { life: 40, start: start.start, description: "x41 s9b" });
  await liveAuthority(client);
  await earnRamp(client, start);
  await runAndSettle(client, mon(-3)); // every period EARLIER than the disposal month is met

  const split = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-2), 7), proceedsCents: 400_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 s9b split",
    costPortionCents: 1_000_000,
  });
  const { disposed, continuing } = await splitShape(client, asset.id);

  // Revise the continuing child effective at the start of a month NOT yet charged, so the
  // revision itself is lawful and the NEXT run lands on the revision successor.
  await reviseParticulars(w.users.alice, {
    client, asset: continuing.id, effectiveFrom: mon(-1).start,
    particulars: { method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: start.start },
  });
  const grandchild = (await faRow(continuing.id)).superseded_by_asset_id;
  assert.ok(grandchild, "mandatory setup: the revision minted a successor below the split child");

  // ADVANCE it: drain the due ladder so the lineage below the split is genuinely charged.
  const drained = await drainDue(client);
  noteLane(`x41.s9b the ladder ran ${drained.length} period(s) after the revision`);
  const advanced = await liveRanges(grandchild);
  assert.ok(advanced.length > 0,
    `mandatory setup: the REVISION successor carries a later live charge (got ${advanced.length})`);
  assert.ok(advanced.every((r) => r.entry !== split.entryId),
    "…on an entry other than the split's own — the split's own stub is never 'later state'");

  // THE PIN. A live charge HAS a followable remedy (reverse the charge), so the refusal is
  // right here — the closure absorbs clean revision chains, never advanced ones.
  await refuses(() => reverseEntry(w.users.alice, {
    entry: split.entryId, reason: "x41 s9b refuse", opKey: opk("x41s9b"),
  }), T.partialSuccessorAdvanced,
  "reversing a split whose child's REVISION successor now carries a later live charge");
  assert.deepEqual(await mirrorsOf(split.entryId), [],
    "…and the refusal minted NO mirror (F6: no un-approvable poison draft)");
  assert.equal((await faRow(asset.id)).status, "superseded", "…and the register is untouched");

  // THE REMEDY, followed all the way. Every entry that charged the lineage BELOW the split
  // is reversed — the acquisition's own earlier charges sit ABOVE it and are not in the way.
  const below = [...new Set((await lineageLiveRanges(client, continuing.id)).map((r) => r.entry))];
  assert.ok(below.length > 0, "mandatory cross-check: there really are charge entries below the split to unwind");
  for (const entry of below) {
    await reverseAndSettle(w.users.alice, { entry, reason: "x41 s9b undo later charge", opKey: opk("x41s9bu") });
  }
  assert.equal((await lineageLiveRanges(client, continuing.id)).length, 0, "the named remedy cleared them");

  await reverseAndSettle(w.users.alice, {
    entry: split.entryId, reason: "x41 s9b undo the split", opKey: opk("x41s9bg"),
  });
  const restored = await faRow(asset.id);
  assert.equal(restored.status, "active", "…and the split then reverses green, restoring the original");
  assert.equal(restored.superseded_by_asset_id, null, "…superseded_by cleared");
  assert.equal(restored.superseded_at, null, "…and superseded_at cleared");
  for (const [label, id] of [["the disposed portion", disposed.id], ["the continuing child", continuing.id],
    ["the revision successor", grandchild]]) {
    assert.equal((await faRow(id)).status, "unwound", `${label} (${id}) is unwound with it`);
  }
  // The ORIGINAL keeps the charges it earned BEFORE the split — the reversal restores a row,
  // it does not rewrite its history.
  assert.ok((await liveRanges(asset.id)).length > 0,
    "the restored original still carries its own pre-split live charges (the reversal restores, it does not erase)");
});

// ===========================================================================
// x41.s9c — THE REFUSAL BOUNDARY: a DISPOSAL below the revised child.
// ===========================================================================

test("x41.s9c a revision successor that has been DISPOSED refuses the split reversal by the same name, and reversing the disposal first reaches green", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s9c");
  const start = mon(-4);
  const { asset } = await buyAsset({
    client, cents: 4_000_000, postingDate: dayIn(start, 1), memo: "x41 s9c machine",
  });
  await completeSL(client, asset.id, { life: 40, start: start.start, description: "x41 s9c" });
  // No authority again — this cell's subject is the DISPOSAL below the revision, and a
  // charge would refuse for the other reason and prove nothing about this one.

  const split = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-3), 7), proceedsCents: 400_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 s9c split",
    costPortionCents: 1_000_000,
  });
  const { disposed, continuing } = await splitShape(client, asset.id);

  await reviseParticulars(w.users.alice, {
    client, asset: continuing.id, effectiveFrom: dayIn(mon(-2), 1),
    particulars: { method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: start.start },
  });
  const grandchild = (await faRow(continuing.id)).superseded_by_asset_id;
  assert.ok(grandchild, "mandatory setup: the revision minted a successor below the split child");

  const sale = await disposeAndSettle(w.users.alice, {
    client, asset: grandchild, disposalDate: dayIn(mon(-1), 9), proceedsCents: 2_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 s9c sold the remainder",
  });
  assert.equal((await faRow(grandchild)).status, "disposed",
    "mandatory setup: the REVISION successor below the split child is disposed");

  // THE PIN. A disposal IS an entry, so "reverse it first" is a followable remedy — which is
  // exactly why the guard must still bite here even though a revision sits in between.
  await refuses(() => reverseEntry(w.users.alice, {
    entry: split.entryId, reason: "x41 s9c refuse", opKey: opk("x41s9c"),
  }), T.partialSuccessorAdvanced,
  "reversing a split whose child's REVISION successor has since been disposed");
  assert.deepEqual(await mirrorsOf(split.entryId), [], "…and the refusal minted NO mirror (F6)");
  assert.equal((await faRow(grandchild)).status, "disposed", "…and the register is untouched");

  // THE REMEDY: the later entry first, in dependency order.
  await reverseAndSettle(w.users.alice, { entry: sale.entryId, reason: "x41 s9c undo the sale", opKey: opk("x41s9cu") });
  const back = await faRow(grandchild);
  assert.equal(back.status, "active", "reversing the LATER disposal restores the revision successor");
  assert.equal(back.disposed_at, null, "…disposed_at cleared");
  assert.equal(back.disposal_entry_id, null, "…and disposal_entry_id cleared");

  const rev = await reverseAndSettle(w.users.alice, {
    entry: split.entryId, reason: "x41 s9c undo the split", opKey: opk("x41s9cg"),
  });
  const restored = await faRow(asset.id);
  assert.equal(restored.status, "active", "…and the split then reverses green, restoring the original");
  assert.equal(restored.superseded_by_asset_id, null, "…superseded_by cleared");
  assert.equal(restored.superseded_at, null, "…and superseded_at cleared");
  for (const [label, id] of [["the disposed portion", disposed.id], ["the continuing child", continuing.id],
    ["the revision successor", grandchild]]) {
    assert.equal((await faRow(id)).status, "unwound", `${label} (${id}) is unwound with it`);
  }
  assert.equal((await lineageLiveRanges(client, asset.id)).length, 0,
    "no live charge survives in the lineage — the split's stub and the sale's stub are both unwound");
  assertAllUnwound(await lineageCharges(client, asset.id), "x41.s9c");

  const mirror = await entryRowOf(rev.mirrorId);
  await assertTieGreen(client, mirror.posting_date, "x41.s9c at the split mirror's posting date");
  noteLane(`x41.s9c the whole chain unwound behind two reversals; tie green at ${mirror.posting_date}`);
});
