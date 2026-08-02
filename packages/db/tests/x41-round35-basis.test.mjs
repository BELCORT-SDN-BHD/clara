// 0041 Wave D-a — the ROUND-3.5 fix-ledger battery, part A: THE REDUCING-BALANCE
// FY-OPEN BASIS IS A PERIOD-NET READ, NEVER AN EFFECTIVE-DATE AS-OF READ (fix ledger G1).
//
//   x41.s1  the design's OWN correction law is NEXT-FY neutral — reverse a CLOSED FY's
//           depreciation, re-run it, and the FOLLOWING year's entitlement is unchanged.
//           Both cadences, because the annual arm is wrong next YEAR and the monthly arm
//           is wrong the very next MONTH.
//
// WHY THIS SHAPE. `Accumulated(asset, as_of)` is effective-dated and (by the §1.3 law)
// blind to `is_live`: a charge is effective at its period end, its unwind at the MIRROR's
// posting date. So at any as-of between the original charge and the reversal, the ledger
// truthfully holds BOTH the original and its replacement — that IS what the books said on
// that date, and the GL agrees, which is exactly why `fa_register_tie` stays GREEN on the
// doubled figure. It is NOT "accumulated depreciation of this asset", and the RB FY-open
// basis is the one consumer that must never read it that way: it must net BY PERIOD
// (a charge counts when its period ends before the bound; an unwind counts against ITS
// ORIGINAL'S period), so a lawful correction cannot silently under-depreciate every
// remaining year of the asset's life.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers): authored from
// the design of record v2.1 + the adjudicated round-3.5 fix ledger, never from the
// migration, the fix diffs or the harvested bodies. Every date descends from the DB's own
// Asia/Kuala_Lumpur anchor.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  ACCUM, EXPENSE, lastEndedFy, fyBefore, fyMonths,
  runDue, getFixedAsset, assetNodeOf, anyKey, numKey,
  faWorld, glNet, liveRanges, sumRanges, assertNoOverlaps,
  freshFaClient, buyAsset, completeRB, liveAuthority, earnRamp, runAndSettle, reverseAndSettle,
} from "./x41-round35-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round35-basis");
  printSkipCount("x41-round35-basis");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3.5 RB-basis battery");

// The worked figures, derived here INDEPENDENTLY of the DB (design §3.1):
//   cost 8,000,000 @ 20% ⇒ FY-2 entitlement round(8,000,000 × 0.20) = 1,600,000
//                          FY-1 basis 8,000,000 − 1,600,000 = 6,400,000 ⇒ 1,280,000
//   monthly floor of FY-1 = floor(1,280,000 / 12) = 106,666
// The defect answers 960,000 (annual) / 104,444 (monthly) — it subtracts the corrected
// year's money TWICE, so the discrimination is 320,000 / 2,222 sen wide.
const COST = 8_000_000;
const FY2_ENTITLEMENT = 1_600_000;
const FY1_ENTITLEMENT = 1_280_000;
const FY1_MONTHLY_FLOOR = 106_666;

/** The whole live ledger of one asset, in sen. */
const ledgerTotal = async (asset) => sumRanges(await liveRanges(asset));

/** The live charges whose period falls inside [open, close]. */
async function fyCharges(asset, fy) {
  return (await liveRanges(asset)).filter((r) => r.start >= fy.open && r.end <= fy.close);
}

/** The DB-projected schedule series off `get_fixed_asset`, discovered BY MEANING —
 *  the key spelling was never pinned by a contract, so an absent series is recorded as
 *  a finding rather than asserted into a false red (the key-discovery rule). */
function projectedSeries(detail) {
  const hit = anyKey(detail, /schedule|project/);
  const arr = Array.isArray(hit?.value) ? hit.value
    : Array.isArray(hit?.value?.rows) ? hit.value.rows
      : Array.isArray(hit?.value?.periods) ? hit.value.periods : null;
  if (!arr) return null;
  const out = [];
  for (const row of arr) {
    const n = numKey(row, /project/) ?? numKey(row, /amount|charge/);
    if (n) out.push(n.value);
  }
  return out.length ? { key: hit.key, series: out } : null;
}

// ===========================================================================
// x41.s1 — THE CORRECTION LAW IS NEXT-FY NEUTRAL, BOTH CADENCES (G1).
// ===========================================================================

test("x41.s1 reverse a closed FY's depreciation and re-run it: the FOLLOWING period's entitlement is UNCHANGED — annual cadence next YEAR, monthly cadence next MONTH", async (t) => {
  if (skipHere(t)) return;
  const fy1 = lastEndedFy(12, 31); // the last FY that has ENDED
  const fy2 = fyBefore(fy1); // …and the one before it — both are CLOSED years
  assert.ok(fy2.close < fy1.open, `mandatory setup: two consecutive closed FYs (${fy2.open}..${fy2.close} then ${fy1.open}..${fy1.close})`);

  // ---- ARM A — ANNUAL cadence. The wrong money lands the NEXT YEAR. ------------------
  {
    const client = await freshFaClient("s1a");
    const { asset } = await buyAsset({ client, cents: COST, postingDate: fy2.open, memo: "x41 s1 annual RB80k" });
    await completeRB(client, asset.id, { life: 120, rateBps: 2000, residual: 0, start: fy2.open, description: "x41 s1a" });
    await liveAuthority(client, "annual");

    // Every figure below is read from the LEDGER, not from the run receipt — the books
    // are the assertion surface, and a receipt that agreed with a wrong ledger would be
    // the least interesting kind of green.
    const first = await earnRamp(client, { start: fy2.open, end: fy2.close });
    assert.equal(sumRanges(await fyCharges(asset.id, fy2)), FY2_ENTITLEMENT,
      `mandatory setup: FY-2 charges round(cost × 20%) = ${FY2_ENTITLEMENT}`);
    const second = await runAndSettle(client, { start: fy1.open, end: fy1.close });
    assert.equal(sumRanges(await fyCharges(asset.id, fy1)), FY1_ENTITLEMENT,
      `mandatory setup: FY-1 charges round((cost − ${FY2_ENTITLEMENT}) × 20%) = ${FY1_ENTITLEMENT} — the CONTROL`);
    assert.equal(Number(second.receipt.charged_cents), FY1_ENTITLEMENT, "…and the run receipt agrees with the ledger");
    assert.equal(await ledgerTotal(asset.id), FY2_ENTITLEMENT + FY1_ENTITLEMENT, "…and the ledger carries both years");

    // THE DESIGN'S OWN CORRECTION LAW, applied to the EARLIER closed year: reverse the
    // period entry, then re-run the period (§3.2). Both acts are lawful and expected.
    await reverseAndSettle(w.users.alice, { entry: first.entryId, reason: "x41 s1a correct FY-2", opKey: opk("x41s1arev") });
    assert.equal((await fyCharges(asset.id, fy2)).length, 0, "the FY-2 charge really unwound");
    const dueA = await runDue(client);
    assert.equal(dueA.due, true, "FY-2 is due again after its correction (§1.3/§1.5)");
    assert.equal(dueA.period_start, fy2.open, `…and it is the OLDEST unmet period (got ${dueA.period_start})`);
    await runAndSettle(client, { start: fy2.open, end: fy2.close });
    assert.equal(sumRanges(await fyCharges(asset.id, fy2)), FY2_ENTITLEMENT,
      "the FY-2 RE-RUN charges the same money (its own basis reads a ledger that is empty before FY-2 opens)");

    // NOW THE PIN. Correct FY-1 the same lawful way and re-run it. Its basis must read
    // 8,000,000 − 1,600,000, not 8,000,000 − 3,200,000: the corrected year's original and
    // its replacement are BOTH effective at FY-2's close, so an effective-date as-of read
    // subtracts that year's money twice.
    await reverseAndSettle(w.users.alice, { entry: second.entryId, reason: "x41 s1a correct FY-1", opKey: opk("x41s1arev2") });
    const dueB = await runDue(client);
    assert.equal(dueB.due, true, "FY-1 is due again after ITS correction");
    assert.equal(dueB.period_start, fy1.open, `…and it is the oldest unmet (got ${dueB.period_start})`);
    await runAndSettle(client, { start: fy1.open, end: fy1.close });
    assert.equal(sumRanges(await fyCharges(asset.id, fy1)), FY1_ENTITLEMENT,
      `the NEXT FY's entitlement is UNCHANGED at ${FY1_ENTITLEMENT} — the FY-open basis nets BY PERIOD (G1). An effective-dated as-of read answers 960,000 here, RM3,200 too little, and it compounds for the rest of the asset's life`);

    const rows = await liveRanges(asset.id);
    assert.equal(sumRanges(rows), FY2_ENTITLEMENT + FY1_ENTITLEMENT,
      "…so two lawful corrections leave the ledger EXACTLY where it started");
    assertNoOverlaps(rows, "the twice-corrected annual ledger");
    assert.equal(await glNet(client, EXPENSE), FY2_ENTITLEMENT + FY1_ENTITLEMENT,
      "the expense GL nets to the same figure across originals + mirrors + re-runs");
    assert.equal(await glNet(client, ACCUM), -(FY2_ENTITLEMENT + FY1_ENTITLEMENT), "…and the accumulated GL to the same credit");

    // The user-facing projection reads the SAME arithmetic: a reducing-balance schedule
    // that ENDS higher than it STARTS is the defect's visible signature.
    const proj = projectedSeries(assetNodeOf(await getFixedAsset(w.users.alice, asset.id)));
    if (!proj) {
      noteLane("x41.s1 get_fixed_asset projects no discoverable schedule series — FINDING (the G1 blast radius on the read surface is unpinned here)");
    } else {
      noteLane(`x41.s1 the projected schedule ('${proj.key}') runs ${proj.series[0]} … ${proj.series[proj.series.length - 1]} over ${proj.series.length} row(s)`);
      assert.ok(proj.series[proj.series.length - 1] <= proj.series[0],
        `a reducing-balance projection must never END above where it STARTS (got ${JSON.stringify(proj.series)}) — the defect projects an INCREASING series`);
    }
  }

  // ---- ARM B — MONTHLY cadence. The wrong money lands the NEXT MONTH. ----------------
  {
    const client = await freshFaClient("s1b");
    const months2 = fyMonths(fy2);
    const months1 = fyMonths(fy1);
    const { asset } = await buyAsset({ client, cents: COST, postingDate: fy2.open, memo: "x41 s1 monthly RB80k" });
    await completeRB(client, asset.id, { life: 120, rateBps: 2000, residual: 0, start: fy2.open, description: "x41 s1b" });
    await liveAuthority(client, "monthly");

    await earnRamp(client, months2[0]);
    for (const m of months2.slice(1)) {
      const out = await runAndSettle(client, m);
      assert.notEqual(out.mode, "noop", `mandatory setup: ${m.key} charged (got ${out.mode})`);
    }
    assert.equal(sumRanges(await fyCharges(asset.id, fy2)), FY2_ENTITLEMENT,
      `mandatory setup: FY-2 closes on exactly ${FY2_ENTITLEMENT} across twelve monthly charges`);

    const janFirst = await runAndSettle(client, months1[0]);
    assert.notEqual(janFirst.mode, "noop", "mandatory setup: the first month of FY-1 charged");
    const control = (await liveRanges(asset.id)).find((r) => r.start === months1[0].start);
    assert.ok(control, "…and it landed on the FY-1 opening month");
    assert.equal(control.amount, FY1_MONTHLY_FLOOR,
      `the CONTROL: a floor month of FY-1 charges floor(${FY1_ENTITLEMENT}/12) = ${FY1_MONTHLY_FLOOR} (got ${control.amount})`);

    // Correct the LAST month of FY-2 — deliberately the true-up month, the one that
    // absorbs the year's rounding, so the corrected pair is as big as this shape allows.
    const decOld = (await liveRanges(asset.id)).find((r) => r.start === months2[11].start);
    assert.ok(decOld, "FY-2's closing month is live before the correction");
    await reverseAndSettle(w.users.alice, { entry: decOld.entry, reason: "x41 s1b correct FY-2 close", opKey: opk("x41s1brev") });
    const dueA = await runDue(client);
    assert.equal(dueA.due, true, "the corrected month is due again");
    assert.equal(dueA.period_start, months2[11].start, `…and it is the oldest unmet (got ${dueA.period_start})`);
    await runAndSettle(client, months2[11]);
    assert.equal(sumRanges(await fyCharges(asset.id, fy2)), FY2_ENTITLEMENT,
      `…and FY-2 STILL closes on exactly ${FY2_ENTITLEMENT} (the segment true-up re-derives from the ledger — F2b, certified sound)`);

    // THE PIN — the very next month. Correct FY-1's opening month and re-run it: its basis
    // reads FY-2's close, where the corrected month's original AND replacement are both
    // effective.
    await reverseAndSettle(w.users.alice, { entry: control.entry, reason: "x41 s1b correct FY-1 open", opKey: opk("x41s1brev2") });
    const dueB = await runDue(client);
    assert.equal(dueB.due, true, "FY-1's opening month is due again");
    assert.equal(dueB.period_start, months1[0].start, `…and it is the oldest unmet (got ${dueB.period_start})`);
    await runAndSettle(client, months1[0]);
    const after = (await liveRanges(asset.id)).find((r) => r.start === months1[0].start);
    assert.ok(after, "the re-run charge covers FY-1's opening month");
    assert.equal(after.amount, FY1_MONTHLY_FLOOR,
      `the RE-RUN charges the SAME ${FY1_MONTHLY_FLOOR} — a MONTHLY client posts wrong money the very next month, not next year (the defect answers 104,444)`);
    assert.equal(after.amount, control.amount, "…identical to the control, to the sen");

    const rows = await liveRanges(asset.id);
    assert.equal(sumRanges(rows), FY2_ENTITLEMENT + FY1_MONTHLY_FLOOR,
      "…and the whole ledger is back exactly where two lawful corrections found it");
    assertNoOverlaps(rows, "the twice-corrected monthly ledger");
    assert.equal(await glNet(client, ACCUM), -(FY2_ENTITLEMENT + FY1_MONTHLY_FLOOR),
      "the accumulated GL agrees to the sen across originals + mirrors + re-runs");
    noteLane(`x41.s1 both cadences neutral under the correction law: annual ${FY1_ENTITLEMENT}, monthly ${FY1_MONTHLY_FLOOR}`);
  }
});
