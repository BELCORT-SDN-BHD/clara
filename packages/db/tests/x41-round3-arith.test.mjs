// 0041 Wave D-a — the ROUND-3 fix-ledger battery, part A: THE ARITHMETIC THAT
// READS THE LEDGER. Every cell here pins the ONE shape the round-3 fold named:
// a frozen snapshot must never stand in for an effective-dated / lineage read.
//
//   x41.n1  F1 — accumulated is a LINEAGE read: a supersede-forward revision whose
//                PREDECESSOR is charged afterwards keeps every sen in the register,
//                at EVERY as-of (tie + list_fixed_assets.accumulated_cents = the GL).
//   x41.n2  F2(a) — the FY-open RB basis is effective-dated: charge Jan..Dec,
//                reverse January per the §3.2 correction law, re-run January, and the
//                FY total is UNCHANGED (166,666, never 136,111).
//   x41.n3  F2(b) — a hole-spanning call cannot over-charge: the segment true-up
//                re-derives from the ledger at the terminating month.
//   x41.n4  F3 — ONE due oracle: `due:true ⇔ compute non-empty`, and a sub-sen RB
//                asset must never wedge the client's ladder (the freeze cell).
//   x41.n5  F3 — stranded months are VISIBLE: a revise-to-none leaves the
//                predecessor's owed months on the due probe, the advisory and the tie,
//                and the disposal precondition walks the lineage.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers): authored
// from the design of record v2.1 + the adjudicated round-3 fix ledger, never from the
// migration, the fix diffs or the harvested bodies. Every date descends from the DB's
// own Asia/Kuala_Lumpur anchor.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  refuses, T, COST, ACCUM, EXPENSE, BANK, GAIN, LOSS,
  mon, dayIn, dstr, lastEndedFy, fyMonths,
  reviseParticulars, runPeriod, runDue, disposeAsset, getFixedAsset, listFixedAssets,
  approveEntry, entryRowOf,
  faRegisterTie, faWorld, faRow, glNet, liveRanges, assertNoOverlaps,
  freshFaClient, buyAsset, completeSL, completeRB, liveAuthority, earnRamp, runAndSettle,
  reverseAndSettle, retireAuthorityVerb, authorityRows,
  lineageIdsOf, lineageLiveRanges, sumRanges, tieAccts, tieSumBy,
  assetRowsOf, assetNodeOf, accumOf, advisoryCountOf, advisoryMonthsOf,
} from "./x41-round3-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round3-arith");
  printSkipCount("x41-round3-arith");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3 arithmetic battery");

/** Drain the due ladder while ASSERTING the F3 invariant on every rung: whenever the
 *  due probe says a period is due, the computation must be NON-EMPTY. A due:true that
 *  computes nothing is the freeze — the sweep re-asks forever and the sequencing law
 *  refuses every later period behind it. */
async function drainDueStrict(client, { cap = 20 } = {}) {
  const out = [];
  for (let i = 0; i < cap; i++) {
    const due = await runDue(client);
    if (!due?.due) return out;
    const settled = await runAndSettle(client, { start: due.period_start, end: due.period_end });
    assert.notEqual(settled.mode, "noop",
      `the ONE due oracle (F3): depreciation_run_due named ${due.period_start}..${due.period_end} DUE, so the run must compute a NON-EMPTY charge set (it returned a no-op — the ladder is frozen)`);
    out.push({ due, settled });
  }
  assert.fail(`the due ladder did not converge in ${cap} periods — a period that computes nothing is wedging the client (F3)`);
  return out;
}

// ===========================================================================
// x41.n1 — F1: ACCUMULATED IS A LINEAGE READ.
// ===========================================================================

test("x41.n1 a revision whose PREDECESSOR is charged afterwards keeps every sen: fa_register_tie is green at EVERY as-of and list_fixed_assets.accumulated_cents equals the GL", async (t) => {
  if (skipHere(t)) return;
  // The x41.e1 worked figure, then the question e1 never asked: where do the
  // predecessor's 12,000 live once the revision has superseded it? The annual run
  // charges BOTH segments — 1,200,000 onto the superseded predecessor (Jan–Sep) and
  // 200,000 onto the active successor (Oct–Dec) — and `_fa_included_at` excludes the
  // predecessor from every as-of at/after superseded_at. A baked successor snapshot
  // loses the 12,000 forever; the lineage read keeps it.
  const client = await freshFaClient("n1");
  const fy = lastEndedFy(12, 31);
  const { asset } = await buyAsset({ client, cents: 8_000_000, postingDate: fy.open, memo: "x41 n1 RB80k" });
  await completeRB(client, asset.id, { life: 120, rateBps: 2000, residual: 0, start: fy.open, description: "x41 n1" });

  const octoberFirst = dstr(fy.closeY, 10, 1);
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: octoberFirst,
    particulars: { method: "reducing_balance", useful_life_months: 120, rate_bps: 1000, residual_cents: 0, start_date: fy.open },
  });
  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "mandatory setup: the revision superseded the predecessor");
  const succId = pred.superseded_by_asset_id;
  assert.ok(succId, "…and named the successor");

  await liveAuthority(client, "annual");
  await earnRamp(client, { start: fy.open, end: fy.close });

  // The fixture is NON-VACUOUS: charges really landed on the SUPERSEDED predecessor.
  const predCharges = sumRanges(await liveRanges(asset.id));
  const succCharges = sumRanges(await liveRanges(succId));
  assert.equal(predCharges, 1_200_000,
    `the superseded predecessor carries its own Jan–Sep segment = round(8,000,000 × 20%) × 9/12 (got ${predCharges})`);
  assert.equal(succCharges, 200_000,
    `the successor carries the Oct–Dec segment = round(8,000,000 × 10%) × 3/12 (got ${succCharges})`);
  assert.equal(sumRanges(await lineageLiveRanges(client, asset.id)), 1_400_000, "…Σ segments = RM14,000");
  assert.equal(await glNet(client, ACCUM, fy.close), -1_400_000, "…and the GL accumulated account carries all of it");

  // THE PIN — the tie is green at EVERY as-of, not only where the snapshot happens to
  // agree. Four dates: birth · the last day BEFORE the revision bites · the FY close
  // (where the predecessor has left the as-of window carrying 12,000 of ledger) · after.
  const sept30 = dstr(fy.closeY, 9, 30);
  for (const [label, asOf, expectAccum] of [
    ["at acquisition", fy.open, 0],
    ["the day before the revision takes effect", sept30, 0],
    ["at the FY close", fy.close, 1_400_000],
    ["after the FY close", dayIn(mon(0), 1), 1_400_000],
  ]) {
    const tie = await faRegisterTie(w.users.alice, client, asOf);
    assert.equal(tie.tie, true, `fa_register_tie is GREEN ${label} (as_of ${asOf}) — got ${JSON.stringify(tie.accounts ?? tie)}`);
    const rows = tieAccts(tie, COST);
    assert.ok(rows.length >= 1, `…and the enrolled cost account appears ${label}`);
    assert.equal(tieSumBy(rows, /^cost_diff/, "the tie cost difference"), 0, `…cost difference EXACTLY zero ${label}`);
    assert.equal(tieSumBy(rows, /^accum_diff/, "the tie accumulated difference"), 0, `…accumulated difference EXACTLY zero ${label} (the lineage read, F1)`);
    // `assert/strict` compares with Object.is, and negating a zero credit balance yields -0,
    // which Object.is separates from 0. `|| 0` collapses the sign of zero and is a no-op on
    // every other figure — a test-lane normalisation, not a relaxation of the assertion.
    assert.equal(-(await glNet(client, ACCUM, asOf)) || 0, expectAccum,
      `…the GL itself carries ${expectAccum} ${label} (fixture cross-check)`);
    assert.equal(tieSumBy(rows, /^register_accum/, "the tie register accumulated"), expectAccum,
      `…and the REGISTER side reports the same ${expectAccum} ${label} — a frozen successor bake would report 200,000`);
  }

  noteLane(`x41.n1 the FY split across the lineage: predecessor ${predCharges} + successor ${succCharges} = ${predCharges + succCharges} (register + GL both)`);

  // The read surface agrees with the GL to the sen (the AF-1 lesson: assert the
  // instrument the professional actually reads, not only the tie).
  const listed = assetRowsOf(await listFixedAssets(w.users.alice, client));
  const succRow = listed.find((r) => r.id === succId);
  assert.ok(succRow, "list_fixed_assets shows the continuing successor");
  assert.equal(accumOf(succRow, "list_fixed_assets"), 1_400_000,
    "list_fixed_assets.accumulated_cents on the successor carries the WHOLE lineage's charges = the GL (F1)");
  const detail = assetNodeOf(await getFixedAsset(w.users.alice, succId));
  assert.equal(accumOf(detail, "get_fixed_asset"), 1_400_000, "…and get_fixed_asset reports the same figure");
});

// ===========================================================================
// x41.n2 — F2(a): THE FY-OPEN BASIS IS EFFECTIVE-DATED.
// ===========================================================================

test("x41.n2 the §3.2 correction law is arithmetically neutral: charge Jan..Dec, reverse January, re-run January — the January charge and the FY total are UNCHANGED", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("n2");
  const fy = lastEndedFy(12, 31);
  const months = fyMonths(fy);
  const { asset } = await buyAsset({ client, cents: 10_000_000, postingDate: fy.open, memo: "x41 n2 RB100k" });
  await completeRB(client, asset.id, { life: 240, rateBps: 2000, residual: 0, start: fy.open, description: "x41 n2" });
  await liveAuthority(client); // MONTHLY — each month is its own entry, so ONE can be reversed

  for (const m of months) {
    const out = await runAndSettle(client, m);
    assert.notEqual(out.mode, "noop", `mandatory setup: ${m.key} charged (got ${out.mode})`);
  }
  const before = (await liveRanges(asset.id)).sort((a, b) => (a.start < b.start ? -1 : 1));
  assert.equal(before.length, 12, `twelve monthly charges (got ${before.length})`);
  assert.equal(before[0].amount, 166_666, "the floor month charges floor(round(10,000,000 × 20%)/12) = 166,666");
  assert.equal(sumRanges(before), 2_000_000, "…and the FY lands EXACTLY on round(basis × rate) = 2,000,000");
  const janEntry = before[0].entry;

  // The design's OWN correction law: reverse the period entry, then re-run it.
  await reverseAndSettle(w.users.alice, { entry: janEntry, reason: "x41 n2 correct january", opKey: opk("x41n2rev") });
  const afterUnwind = await liveRanges(asset.id);
  assert.equal(afterUnwind.length, 11, "the January charge unwound (eleven live charges remain)");
  assert.equal(sumRanges(afterUnwind), 1_833_334, "…leaving Feb..Dec = 1,833,334 in the ledger");

  const due = await runDue(client);
  assert.equal(due.due, true, "January is due again after its correction (design §1.3/§1.5)");
  assert.equal(due.period_start, months[0].start, `…and it is the OLDEST unmet period (got ${due.period_start})`);
  const rerun = await runAndSettle(client, months[0]);
  assert.notEqual(rerun.mode, "noop", "…and the re-run really charges");

  const rows = (await liveRanges(asset.id)).sort((a, b) => (a.start < b.start ? -1 : 1));
  const jan = rows.find((r) => r.start === months[0].start);
  assert.ok(jan, "the re-run charge covers January");
  assert.equal(jan.amount, 166_666,
    "the RE-RUN January charge is the SAME 166,666 — the FY basis reads the EFFECTIVE-DATED ledger at FY-open−1 (zero), never the dateless total that already carries Feb..Dec (F2a: the defect answers 136,111)");
  assert.equal(sumRanges(rows), 2_000_000,
    "…so the FY total is UNCHANGED at 2,000,000 — a correction can never silently under-depreciate a closed FY");
  assertNoOverlaps(rows, "the corrected FY");
  assert.equal(await glNet(client, EXPENSE), 2_000_000, "the expense GL nets to the same 2,000,000 across original + mirror + re-run");
  assert.equal(await glNet(client, ACCUM), -2_000_000, "…and the accumulated GL to the same credit");
});

// ===========================================================================
// x41.n3 — F2(b): A HOLE-SPANNING CALL CANNOT OVER-CHARGE.
// ===========================================================================

test("x41.n3 a call whose span crosses a HOLE re-derives the segment true-up from the ledger: it charges only what is owed, never the months it stepped over", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("n3");
  const fy = lastEndedFy(12, 31);
  const months = fyMonths(fy);
  const { asset } = await buyAsset({ client, cents: 10_000_000, postingDate: fy.open, memo: "x41 n3 RB100k" });
  await completeRB(client, asset.id, { life: 240, rateBps: 2000, residual: 0, start: fy.open, description: "x41 n3" });
  const monthly = await liveAuthority(client);

  for (const m of months.slice(0, 6)) {
    const out = await runAndSettle(client, m);
    assert.notEqual(out.mode, "noop", `mandatory setup: ${m.key} charged`);
  }
  assert.equal(sumRanges(await liveRanges(asset.id)), 999_996, "mandatory setup: Jan..Jun charged 6 × 166,666");

  // Punch the hole: unwind FEBRUARY alone, leaving Jan + Mar..Jun live.
  const feb = (await liveRanges(asset.id)).find((r) => r.start === months[1].start);
  assert.ok(feb, "February is live before the hole is punched");
  await reverseAndSettle(w.users.alice, { entry: feb.entry, reason: "x41 n3 hole", opKey: opk("x41n3rev") });
  const holed = await liveRanges(asset.id);
  assert.equal(holed.length, 5, "five live charges remain (Jan + Mar..Jun)");
  assert.equal(sumRanges(holed), 833_330, "…totalling 833,330");

  // A whole-FY call now SPANS the hole: annual cadence (retire + re-sign, design §1.4).
  await retireAuthorityVerb(w.users.hana, { client, authority: monthly.id, reason: "x41 n3 cadence change" });
  await liveAuthority(client, "annual");
  assert.equal((await authorityRows(client)).filter((a) => a.status === "live")[0].cadence, "annual",
    "mandatory setup: the live authority is now ANNUAL");

  const out = await runAndSettle(client, { start: fy.open, end: fy.close });
  assert.notEqual(out.mode, "noop", "the FY-spanning call charges the uncharged months");
  assert.equal(Number(out.receipt.charged_cents), 1_166_670,
    "the hole-spanning call charges EXACTLY what is owed: 2,000,000 − the 833,330 already live = 1,166,670 (F2b: the defect answers 1,833,334, over by the four Mar..Jun charges it stepped over)");
  const finalRows = await liveRanges(asset.id);
  assert.equal(sumRanges(finalRows), 2_000_000,
    "…and the FY closes on round(basis × rate) = 2,000,000 exactly, never above it");
  assertNoOverlaps(finalRows, "the hole-spanning FY");
  assert.equal(await glNet(client, EXPENSE), 2_000_000, "the expense GL agrees to the sen (original 6 − the unwound Feb + the catch-up)");
  noteLane(`x41.n3 the hole-spanning call recorded ${finalRows.length - 5} new sub-range(s): ${finalRows.filter((r) => r.entry === out.entryId).map((r) => `${r.start}..${r.end}=${r.amount}`).join(" | ")}`);
});

// ===========================================================================
// x41.n4 — F3: ONE DUE ORACLE (the sub-sen freeze cell).
// ===========================================================================

test("x41.n4 due ⇔ compute: a sub-sen RB asset is simply NOT due (it can never wedge the ladder), a later completion lawfully revives it, and every due rung computes something", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("n4");
  const m3 = mon(-3);
  // cost 100 sen at 1 bps → an ANNUAL entitlement of round(100 × 0.0001) = 0 sen. Every
  // month computes nothing. Under a bare month-coverage due probe this month stays due
  // forever, the sequencing law then refuses every LATER period, and the whole client
  // stops depreciating with no refusal, no queue row and no receipt.
  const { asset: tiny } = await buyAsset({ client, cents: 100, postingDate: dayIn(m3, 1), memo: "x41 n4 sub-sen" });
  await completeRB(client, tiny.id, { life: 120, rateBps: 1, residual: 0, start: m3.start, description: "x41 sub-sen RB" });
  await liveAuthority(client);

  // THE INVARIANT, stated exactly: the probe and the computation are ONE oracle. It holds
  // whichever way the sub-sen month is resolved (the ledger's reading — an analytically
  // zero month is simply not due — or a one-sen floor), and it is the assertion that makes
  // the freeze unrepresentable either way.
  const due0 = await runDue(client);
  const forced = await runPeriod({ client, periodStart: m3.start, periodEnd: m3.end });
  if (forced.status === "drafted") {
    // Settle the ramp draft immediately: an outstanding draft would itself hold the due
    // probe false (`period_draft_outstanding`) and mask what this cell is measuring.
    const e = await entryRowOf(forced.entry_id);
    await approveEntry(w.users.alice, { entry: forced.entry_id, expectedRevision: e.revision_token, opKey: opk("x41n4ramp") });
  }
  const computed = forced.status !== "noop";
  assert.equal(due0.due, computed,
    `due ⇔ compute non-empty (F3): the probe said due=${JSON.stringify(due0.due)} while the run answered '${forced.status}' — a due:true that computes nothing freezes the whole client's ladder behind it`);
  const tinyDetail = assetNodeOf(await getFixedAsset(w.users.alice, tiny.id));
  const tinyAdvisory = advisoryCountOf(tinyDetail) ?? 0;
  assert.ok(tinyAdvisory === 0 || due0.due === true,
    `the WD-R6 advisory never names months the oracle will not run (advisory ${tinyAdvisory}, due ${JSON.stringify(due0.due)})`);
  noteLane(`x41.n4 the sub-sen RM1 @ 1bps asset resolved as due=${JSON.stringify(due0.due)} / run='${forced.status}' / advisory=${tinyAdvisory} — the ledger's reading is 'not due, computes nothing'`);

  // NO WEDGE — whatever the resolution, the ladder must converge and every charge that
  // does land must be positive (the table CHECK and the clamp agree).
  const soloRungs = await drainDueStrict(client);
  assert.equal((await runDue(client)).due, false,
    "the sub-sen asset alone leaves NOTHING due once the ladder has drained — it can never wedge the client (F3)");
  noteLane(`x41.n4 draining the sub-sen-only client took ${soloRungs.length} rung(s)`);
  const tinyCharges = await liveRanges(tiny.id);
  for (const r of tinyCharges) assert.ok(r.amount > 0, `every charge row is positive (got ${r.amount})`);
  assert.ok(tinyCharges.reduce((n, r) => n + r.amount, 0) <= 100, "…and the sub-sen asset is never charged past its cost");

  // A later completion lawfully REVIVES the ladder for the months it backdates into.
  const { asset: real } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(m3, 2), memo: "x41 n4 real" });
  await completeSL(client, real.id, { life: 36, start: m3.start, description: "x41 n4 real" });
  const due1 = await runDue(client);
  assert.equal(due1.due, true, "a backdated completion REVIVES the period (F3: a later completion lawfully re-opens it)");
  assert.equal(due1.period_start, m3.start, `…at the OLDEST uncharged in-service month (got ${due1.period_start})`);

  const rungs = await drainDueStrict(client);
  assert.equal(rungs.length, 3, `the ladder drains months −3..−1 and converges (got ${rungs.length} rungs)`);
  assert.equal((await runDue(client)).due, false, "…and nothing is due once the month in progress is all that is left");
  assert.equal((await liveRanges(real.id)).length, 3, "the real asset was charged for all three of its in-service months");
  for (const r of rungs) {
    assert.ok(Number(r.settled.receipt.charged_cents) > 0,
      `every DUE rung charged something (${r.due.period_start}: ${r.settled.receipt.charged_cents})`);
  }
});

// ===========================================================================
// x41.n5 — F3: STRANDED MONTHS ARE VISIBLE ON EVERY INSTRUMENT.
// ===========================================================================

test("x41.n5 a prospective revise-to-none never strands the predecessor's owed months: the due probe, the advisory, the disposal precondition and the tie all surface them", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("n5");
  const m4 = mon(-4);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(m4, 1), memo: "x41 n5" });
  await completeSL(client, asset.id, { life: 36, start: m4.start, description: "x41 n5" });
  await liveAuthority(client);
  await earnRamp(client, m4); // month −4 charged; −3 and −2 left OWED

  const before = await runDue(client);
  assert.equal(before.due, true, "mandatory setup: month −3 is due before the revision");
  assert.equal(before.period_start, mon(-3).start, "…and it is the oldest unmet");

  // A LAWFUL prospective revision — effective after every live charge's period_end.
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: mon(-1).start,
    particulars: { method: "none", residual_cents: 0, start_date: m4.start },
  });
  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "the predecessor is superseded");
  const succId = pred.superseded_by_asset_id;
  assert.equal((await faRow(succId)).depreciation_method, "none", "…and the successor is the non-depreciating row");

  // (1) THE DUE PROBE still sees the predecessor's owed months.
  const after = await runDue(client);
  assert.equal(after.due, true,
    `the predecessor's uncharged months keep the client DUE — the due scan covers status in ('active','superseded') bounded at month_start(superseded_at − 1) exactly as the compute does (F3) — got ${JSON.stringify(after)}`);
  assert.equal(after.period_start, mon(-3).start, `…still pointing at month −3 (got ${after.period_start})`);

  // (2) THE WD-R6 ADVISORY names them on the row that actually owes them.
  const predDetail = assetNodeOf(await getFixedAsset(w.users.alice, asset.id));
  const advisory = advisoryMonthsOf(predDetail);
  assert.ok(advisory.includes(mon(-3).key) && advisory.includes(mon(-2).key),
    `the predecessor's advisory names months ${mon(-3).key} and ${mon(-2).key} (got ${JSON.stringify(advisory)}, count ${advisoryCountOf(predDetail)})`);

  // (3) THE DISPOSAL PRECONDITION walks the LINEAGE — disposing the successor while an
  // ANCESTOR still owes earlier months is refused by name (design §4.1, F3 tail).
  await refuses(() => disposeAsset(w.users.alice, {
    client, asset: succId, disposalDate: dayIn(mon(-1), 20), proceedsCents: 100_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 n5 premature",
  }), T.periodEarlierUnmet,
  "disposing a successor while an ANCESTOR row still holds uncharged months earlier than the disposal period");

  // (4) Draining the ladder actually charges them, onto the row that owes them, and the
  // tie is green afterwards at an as-of where the predecessor has left the window.
  const rungs = await drainDueStrict(client);
  assert.ok(rungs.length >= 2, `the stranded months really ran (got ${rungs.length} rungs)`);
  const predRanges = await liveRanges(asset.id);
  const keys = predRanges.map((r) => r.start.slice(0, 7));
  assert.ok(keys.includes(mon(-3).key) && keys.includes(mon(-2).key),
    `the predecessor carries its own months −3 and −2 (got ${JSON.stringify(keys)})`);
  assert.equal((await lineageIdsOf(client, asset.id)).length, 2, "the lineage is predecessor + successor");

  const asOf = mon(-1).end;
  const tie = await faRegisterTie(w.users.alice, client, asOf);
  assert.equal(tie.tie, true, `fa_register_tie is GREEN once the owed months are charged (got ${JSON.stringify(tie.accounts ?? tie)})`);
  const rows = tieAccts(tie, COST);
  assert.equal(tieSumBy(rows, /^accum_diff/, "the tie accumulated difference"), 0, "…accumulated difference EXACTLY zero");
  assert.equal(tieSumBy(rows, /^register_accum/, "the tie register accumulated"), -(await glNet(client, ACCUM, asOf)),
    "…and the register side equals the independently-summed GL accumulated legs to the sen");
  assert.equal((await runDue(client)).due, false, "…and nothing is left owing");
});
