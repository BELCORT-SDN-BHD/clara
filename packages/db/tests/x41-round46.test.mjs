// 0041 Wave D-a — the ROUND-4.6 battery: THE MERGE-GATE FOLDS, all four of them
// annual/boundary shapes the round-4 cells never reached.
//
//   x41.u1  LIFE END ACROSS A REVISION, straight-line, ANNUAL cadence. An open-FY
//           revision SHORTENS the life; the disposal's stub then terminates the
//           lineage. The stub proposes the ancestor's segment AND the successor's
//           terminating segment in ONE entry, so the terminating clamp must count
//           the ancestor charges it is proposing beside it — not merely the
//           accumulated already persisted. Total charges can never pass
//           cost − residual − persisted accumulated.
//   x41.u2  THE SAME SHAPE ON REDUCING BALANCE, where the life-end clamp writes off
//           NBV − residual in one charge and the over-spend is largest.
//   x41.u3  THE ANNUAL EXECUTABLE REMEDY. An ancestor owing an ENDED ANNUAL FY is
//           still refused `period_earlier_unmet` — and the refusal must name the
//           FINANCIAL-YEAR window `run_depreciation_manual` accepts VERBATIM. A
//           calendar month is not a remedy on this cadence: that verb refuses a
//           month-shaped range by name, so the cell drives BOTH — the month-shaped
//           range is refused, the named window runs green, and the disposal posts.
//   x41.u4  THE 64-EDGE LINEAGE BOUNDARY. A 64-hop revision chain disposes lawfully
//           (the disposal precondition AND the stub's own ancestor walk both read it),
//           and the 65th hop is refused by name.
//
// WHY. Round 4's stub extension made ancestor months INSIDE the disposal's own cadence
// period ride the disposal stub. On the annual cadence that period is twelve months
// wide, so one stub can now carry several revision segments of one lineage at once —
// and the arithmetic that was safe when each segment was its own entry is not safe when
// they are proposed together. These are the three seams that opens, plus the depth cap
// every lineage reader must agree on.
//
// THE MONEY IS PINNED EXACTLY; THE CALENDAR IS PINNED AGNOSTICALLY. Which month a
// shortened life's cap lands on is a lawful implementation reading — a life measured off
// the particulars' `start_date` ends one month earlier than one measured off the
// successor's own effective month — and BOTH readings owe the identical money, because
// the terminating charge writes the asset down to its residual either way. So the cells
// below choose a disposal month PAST both candidate life ends, assert every sen to the
// sen, and assert the calendar only as: no month twice, every charged month inside the
// window, and the months both readings must charge really charged.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers): authored
// from docs/plan/wave-d-a-fa-design.md v2.1, the adjudicated round-4.6 folds and the
// battery's own conventions. This lane never reads 0041's SQL, its diffs, the fix-lane
// output, or the harvested live bodies.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, noteLane, endPool, printLaneNotes, printSkipCount, markSkip,
  x41EnsureReady, skip41, caught, refuses, refusesAxis, reasonToken,
  T, ACCUM, COST, BANK, GAIN, LOSS,
  mon, dayIn, dstr, shift, lastEndedFy,
  setClientFyEnd, reviseParticulars, disposeAsset, disposeAndSettle, runDue, runManual,
  faWorld, faRow, glNet, lineageIdsOf, registerAccumulatedAt,
  freshFaClient, buyAsset, completeSL, completeRB, liveAuthority,
  // the round-4 shared readers (x41-round4-helpers.mjs) — see that file's header
  disposalEntries, lineagePicture, assertCoversOnce, assertSenExact, assertStubIsPerAsset,
  runManualAndSettle, namedPeriod, accumMovement, assertTieGreen,
} from "./x41-round4-helpers.mjs";

let live = false;
let w = null;
let today = null;

/** Every FYE this file sets lands on the 28th — a day every month owns, so the FY
 *  window arithmetic never depends on month length or on a leap year. */
const FY_DAY = 28;

/** The lineage-depth refusal the disposal precondition and the stub's ancestor walk
 *  must agree on. Pinned as a TOKEN (contract §4 discipline); a divergence is a
 *  FINDING for adjudication, never a silent test edit. */
const TOO_DEEP = "fa_lineage_too_deep";

before(async () => {
  live = await x41EnsureReady();
  if (live) {
    w = await faWorld();
    // The DB's OWN Asia/Kuala_Lumpur business date — the clock the due-ness evaluator
    // reads. Never a JS `new Date()`, never a calendar literal.
    today = (await rootQuery("select (now() at time zone 'Asia/Kuala_Lumpur')::date::text as d")).rows[0].d;
    noteLane(`x41.u* the DB's MYT business date is ${today}`);
  }
});

after(async () => {
  printLaneNotes("x41-round46");
  printSkipCount("x41-round46");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-4.6 merge-gate battery");

/** Today, as a disposal date — the latest date any of these cells may name. */
const todayDate = () => dayIn(mon(0), Number(today.slice(8, 10)));

// ---------------------------------------------------------------------------
// The two local laws these cells add to the round-4 readers.
// ---------------------------------------------------------------------------

/** THE MONEY CEILING. A disposal stub proposes every owed revision segment of a lineage
 *  in ONE entry. If each later segment's remaining-money clamp is measured against the
 *  PERSISTED accumulated balance alone, the earlier segments proposed beside it are
 *  invisible to it and the terminating segment consumes a remainder already spent. The
 *  lineage's live charges can therefore NEVER exceed cost − residual − the accumulated
 *  already persisted: past that line the books carry accumulated depreciation above
 *  cost, a negative NBV, and a fabricated gain on disposal. */
function assertMoneyCeiling(pic, { cost, residual = 0, persisted = 0 }, label) {
  const total = pic.reduce((n, a) => n + a.amount, 0);
  const capacity = cost - residual - persisted;
  assert.ok(total <= capacity,
    `${label}: the lineage's live charges (${total}) must NEVER exceed cost − residual − persisted accumulated (${cost} − ${residual} − ${persisted} = ${capacity}). A stub that computes each revision segment against the SAME persisted balance double-spends the remainder — accumulated depreciation above cost, negative NBV, false gain.`);
  return total;
}

/** The calendar, agnostically: no month charged twice anywhere in the lineage, every
 *  charged month inside `windowKeys`, and every month of `atLeast` genuinely charged. */
function assertMonthsWithin(pic, windowKeys, atLeast, label) {
  const all = pic.flatMap((a) => a.months);
  assert.equal(all.length, new Set(all).size,
    `${label}: NO calendar month is charged twice across the lineage (got ${[...all].sort().join(", ")})`);
  for (const k of all) {
    assert.ok(windowKeys.includes(k),
      `${label}: every charged month lies inside ${windowKeys[0]}..${windowKeys[windowKeys.length - 1]} (got ${k})`);
  }
  for (const k of atLeast) {
    assert.ok(all.includes(k),
      `${label}: month ${k} is charged somewhere in the lineage (got ${[...all].sort().join(", ") || "(none)"})`);
  }
  return all;
}

/** The t2 construction, at an arbitrary offset: an FYE `back` months ago on the 28th, so
 *  the financial year IN PROGRESS opened on the 1st of the following month and closes
 *  twelve months later — an open period no run can ever clear, which is what makes the
 *  disposal stub the only charger in the year. Returns that open window. */
async function openFyFrom(client, back) {
  await setClientFyEnd(w.users.alice, { client, month: mon(-back).m, day: FY_DAY });
  const close = shift(-back + 12);
  return { open: mon(-back + 1).start, close: dstr(close.y, close.m, FY_DAY) };
}

// ===========================================================================
// x41.u1 — STRAIGHT LINE, ANNUAL, LIFE END ACROSS A REVISION.
// ===========================================================================

test("x41.u1 straight-line annual: a life-shortening revision then a disposal whose stub TERMINATES the lineage charges cost − residual EXACTLY — never more, so accumulated never passes cost, NBV never goes negative, and the gain is the proceeds", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("u1");
  const fy = await openFyFrom(client, 4); // opens mon(−3), closes eight months out

  // The Codex 300-sen shape, scaled to sen: cost RM3,000, original life 4 months
  // (floor 75,000/month), REVISED at the start of month 2 to life 3 (floor
  // 100,000/month). The revision is effective on the FIRST of mon(−2), which hands
  // that whole month to the successor — so the ancestor owes exactly mon(−3).
  const CENTS = 300_000;
  const L1 = 4;
  const L2 = 3;
  const RATE1 = Math.floor(CENTS / L1); //  75,000
  const RATE2 = Math.floor(CENTS / L2); // 100,000

  const { asset } = await buyAsset({ client, cents: CENTS, postingDate: fy.open, memo: "x41 u1" });
  await completeSL(client, asset.id, { life: L1, start: fy.open, description: "x41 u1" });
  await liveAuthority(client, "annual");
  assert.equal((await runDue(client)).due, false,
    `mandatory setup: no ENDED financial year is owed (the year in progress runs ${fy.open}..${fy.close}) — every month in this cell lives inside the OPEN period`);
  await refusesAxis(() => runManual(w.users.alice, { client, periodStart: fy.open, periodEnd: fy.close }),
    T.periodRequestInvalid, ["not_ended"],
    "running the financial year in progress by hand — nothing can clear these months but the disposal stub");

  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: mon(-2).start,
    particulars: { method: "straight_line", useful_life_months: L2, residual_cents: 0, start_date: fy.open },
  });
  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "mandatory setup: the life-shortening revision superseded the predecessor");
  const succId = pred.superseded_by_asset_id;
  assert.ok(succId, "…and named the successor");
  assert.equal((await lineagePicture(client, asset.id)).reduce((n, a) => n + a.amount, 0), 0,
    "mandatory setup: NOTHING is charged yet — the persisted accumulated balance is zero, so the whole of cost − residual is the stub's ceiling and the over-spend has nowhere to hide");

  // The disposal sits PAST both candidate life ends (mon(−1) if the life is read off the
  // particulars' start date, mon(0) if off the successor's own effective month), so the
  // terminating charge has certainly happened and the money is the same under either.
  const disposalDate = todayDate();
  const PROCEEDS = 50_000;
  let sold = null;
  const err = await caught(async () => {
    sold = await disposeAndSettle(w.users.alice, {
      client, asset: succId, disposalDate, proceedsCents: PROCEEDS,
      proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 u1 sold",
    });
  });
  assert.ok(!err, `the disposal must post — its stub carries both segments of the open year. Got reason='${reasonToken(err)}' — ${err?.message}`);
  assert.equal((await faRow(succId)).status, "disposed", "…and the successor really is disposed");

  const pic = await lineagePicture(client, asset.id);
  const { named } = await assertStubIsPerAsset(pic, sold.entryId, await lineageIdsOf(client, asset.id), "x41.u1");
  assert.ok(named.includes(asset.id) && named.includes(succId),
    `both segments rode the ONE stub — the ancestor's pre-revision month and the successor's terminating months (stub named: ${named.join(", ")})`);

  // THE PIN — the ceiling first, then the exact figures it bounds.
  const total = assertMoneyCeiling(pic, { cost: CENTS, residual: 0, persisted: 0 }, "x41.u1");
  assert.equal(total, CENTS,
    `the terminating charge writes the lineage down to its residual EXACTLY: Σ charges = cost − residual = ${CENTS}`);
  const ancestor = pic.find((a) => a.asset === asset.id);
  assert.equal(ancestor.amount, RATE1,
    `the ancestor's pre-revision segment is its ONE month at its OWN §3.1 rate floor(${CENTS}/${L1}) = ${RATE1} — the successor's shorter life never reaches back over it`);
  const successor = pic.find((a) => a.asset === succId);
  assert.equal(successor.amount, CENTS - RATE1,
    `…and the successor's segment is everything that remains, ${CENTS} − ${RATE1} = ${CENTS - RATE1}: it charges its own floor ${RATE2} while the life runs and its terminating month absorbs cost − residual − the accumulated INCLUDING the ancestor charge proposed beside it in this same entry`);
  assertMonthsWithin(pic, [mon(-3).key, mon(-2).key, mon(-1).key, mon(0).key],
    [mon(-3).key, mon(-2).key, mon(-1).key], "x41.u1");

  const regAccum = await registerAccumulatedAt(succId, disposalDate);
  assert.equal(regAccum, CENTS,
    `the register's OWN accumulated read at the disposal date is EXACTLY cost − residual (${CENTS}) — never above it, which is the same statement as "NBV is never negative" (got ${regAccum})`);
  const moved = await accumMovement(client);
  assert.equal(moved.credited, CENTS, "every sen the stub charged reached the GL accumulated account");
  assert.equal(moved.relieved, moved.credited, "…and the disposal relieved exactly that much");
  assert.equal(await glNet(client, ACCUM, disposalDate), 0, "…so the accumulated account nets to zero after the total disposal");
  assert.equal(await glNet(client, COST, disposalDate), 0, "…and the cost is fully derecognised");
  assert.equal(await glNet(client, GAIN, disposalDate), -PROCEEDS,
    `NO FALSE GAIN: NBV at disposal is zero, so the gain is EXACTLY the proceeds (${PROCEEDS}) — an over-charged stub credits the overcharge as profit`);
  assert.equal(await glNet(client, LOSS, disposalDate), 0, "…and no loss leg exists");
  await assertTieGreen(w.users.alice, client, disposalDate, "x41.u1 at the disposal date");
  await assertTieGreen(w.users.alice, client, dayIn(mon(1), 28), "x41.u1 past every mirror this database can hold");
  noteLane(`x41.u1 open FY ${fy.open}..${fy.close}; stub segments — ancestor ${ancestor.amount} over ${ancestor.months.join(",")} · successor ${successor.amount} over ${successor.months.join(",")}`);
});

// ===========================================================================
// x41.u2 — REDUCING BALANCE, ANNUAL, LIFE END ACROSS A REVISION.
// ===========================================================================

test("x41.u2 reducing balance annual: a rate-and-life revision then a terminating disposal stub — the life-end clamp charges NBV − residual measured against the ancestor charge proposed beside it, so the lineage lands on cost − residual to the sen", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("u2");
  const fy = await openFyFrom(client, 4);

  // basis = cost − Accumulated(greatest(FY_open − 1 day, baseline)) = the full cost:
  // the asset is acquired ON the FY open, so nothing precedes it.
  //   ancestor segment = ONE month at 20% → round(300,000 × 20%) × 1/12 =  5,000
  //   successor segment runs at 10% until the LIFE-END clamp terminates it at
  //   NBV − residual (design §3.1 "RB terminates at life end") — so the lineage owes
  //   cost − residual in total whichever month that cap lands on.
  const CENTS = 300_000;
  const RATE1_BPS = 2000;
  const RATE2_BPS = 1000;
  const ANCESTOR = Math.round(CENTS * RATE1_BPS / 10_000) / 12; // 60,000 / 12 = 5,000

  const { asset } = await buyAsset({ client, cents: CENTS, postingDate: fy.open, memo: "x41 u2" });
  await completeRB(client, asset.id, { life: 4, rateBps: RATE1_BPS, residual: 0, start: fy.open, description: "x41 u2" });
  await liveAuthority(client, "annual");
  assert.equal((await runDue(client)).due, false,
    `mandatory setup: no ENDED financial year is owed (the year in progress runs ${fy.open}..${fy.close})`);

  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: mon(-2).start,
    particulars: { method: "reducing_balance", useful_life_months: 3, rate_bps: RATE2_BPS, residual_cents: 0, start_date: fy.open },
  });
  const pred = await faRow(asset.id);
  assert.equal(pred.status, "superseded", "mandatory setup: the mid-FY rate/life revision superseded the predecessor");
  const succId = pred.superseded_by_asset_id;
  assert.ok(succId, "…and named the successor");
  assert.equal((await lineagePicture(client, asset.id)).reduce((n, a) => n + a.amount, 0), 0,
    "mandatory setup: NOTHING is charged yet — persisted accumulated is zero, so cost − residual is the whole ceiling");

  const disposalDate = todayDate();
  const PROCEEDS = 20_000;
  let sold = null;
  const err = await caught(async () => {
    sold = await disposeAndSettle(w.users.alice, {
      client, asset: succId, disposalDate, proceedsCents: PROCEEDS,
      proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 u2 sold",
    });
  });
  assert.ok(!err, `the disposal must post — its stub carries both rate segments. Got reason='${reasonToken(err)}' — ${err?.message}`);

  const pic = await lineagePicture(client, asset.id);
  const { named } = await assertStubIsPerAsset(pic, sold.entryId, await lineageIdsOf(client, asset.id), "x41.u2");
  assert.ok(named.includes(asset.id) && named.includes(succId),
    `both rate segments rode the ONE stub (stub named: ${named.join(", ")})`);

  const total = assertMoneyCeiling(pic, { cost: CENTS, residual: 0, persisted: 0 }, "x41.u2");
  assert.equal(total, CENTS,
    `RB terminates at life end charging NBV − residual, so the lineage's total is cost − residual = ${CENTS} exactly — under a per-segment clamp against the persisted balance it would be ${CENTS + ANCESTOR}`);
  const ancestor = pic.find((a) => a.asset === asset.id);
  assert.equal(ancestor.amount, ANCESTOR,
    `the pre-revision segment is round(${CENTS} × ${RATE1_BPS / 100}%) × 1/12 = ${ANCESTOR} — its own month at its own rate (§3.1, Σ segments, prospective)`);
  const successor = pic.find((a) => a.asset === succId);
  assert.equal(successor.amount, CENTS - ANCESTOR,
    `…and the terminating segment absorbs the remainder ${CENTS} − ${ANCESTOR} = ${CENTS - ANCESTOR}, measured against an accumulated balance that INCLUDES the ancestor charge proposed beside it`);
  assertMonthsWithin(pic, [mon(-3).key, mon(-2).key, mon(-1).key, mon(0).key],
    [mon(-3).key, mon(-2).key, mon(-1).key], "x41.u2");

  assert.equal(await registerAccumulatedAt(succId, disposalDate), CENTS,
    `accumulated at the disposal date is EXACTLY cost − residual (${CENTS}) and never above it — no negative NBV`);
  const moved = await accumMovement(client);
  assert.equal(moved.credited, CENTS, "every sen the stub charged reached the GL accumulated account");
  assert.equal(moved.relieved, moved.credited, "…and the disposal relieved exactly that much");
  assert.equal(await glNet(client, GAIN, disposalDate), -PROCEEDS,
    `NO FALSE GAIN: NBV is zero at life end, so the gain is exactly the proceeds (${PROCEEDS})`);
  assert.equal(await glNet(client, LOSS, disposalDate), 0, "…and no loss leg exists");
  await assertTieGreen(w.users.alice, client, disposalDate, "x41.u2 at the disposal date");
  await assertTieGreen(w.users.alice, client, dayIn(mon(1), 28), "x41.u2 past every mirror this database can hold");
  noteLane(`x41.u2 RB segments — ancestor ${ancestor.amount} over ${ancestor.months.join(",")} · successor ${successor.amount} over ${successor.months.join(",")}`);
});

// ===========================================================================
// x41.u3 — THE ANNUAL EXECUTABLE REMEDY.
// ===========================================================================

test("x41.u3 annual cadence: an ancestor owing an ENDED FINANCIAL YEAR is refused period_earlier_unmet, and the refusal names the FY window run_depreciation_manual accepts VERBATIM — a calendar month is refused not_cadence_aligned by that very verb", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("u3");
  // An FYE on the 28th of LAST month: the financial year that ended then is genuinely
  // owed, and the year in progress opened on the 1st of this month — so the disposal's
  // OWN period and the debt sit in DIFFERENT annual windows, which is the only shape
  // where the ended-period refusal can fire on this cadence.
  await setClientFyEnd(w.users.alice, { client, month: mon(-1).m, day: FY_DAY });
  const fy = lastEndedFy(mon(-1).m, FY_DAY);
  assert.equal(fy.open, mon(-12).start, `mandatory setup: the ended FY opens ${mon(-12).start} (got ${fy.open})`);
  assert.equal(fy.close, dayIn(mon(-1), FY_DAY), `…and closes ${dayIn(mon(-1), FY_DAY)} (got ${fy.close})`);

  const CENTS = 1_200_000;
  const { asset } = await buyAsset({ client, cents: CENTS, postingDate: mon(-4).start, memo: "x41 u3" });
  await completeSL(client, asset.id, { life: 120, start: mon(-4).start, description: "x41 u3" });
  await liveAuthority(client, "annual");
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: mon(-2).start,
    particulars: { method: "straight_line", useful_life_months: 60, residual_cents: 0, start_date: mon(-4).start },
  });
  const succId = (await faRow(asset.id)).superseded_by_asset_id;
  assert.ok(succId, "mandatory setup: the mid-FY revision minted a successor");

  const due = await runDue(client);
  assert.equal(due.due, true, "mandatory setup: the ENDED financial year is genuinely owed by the lineage");
  assert.equal(due.cadence, "annual", "…on the annual cadence");
  assert.equal(due.period_start, fy.open, `…and the cadence window opens ${fy.open} (got ${due.period_start})`);
  assert.equal(due.period_end, fy.close, `…and closes ${fy.close} (got ${due.period_end})`);

  // A MONTH-SHAPED remedy does not exist here. This is the whole point of the fold: an
  // ended-period refusal that names month_end(first_due_month) sends a professional to a
  // verb that refuses the range outright.
  await refusesAxis(() => runManual(w.users.alice, { client, periodStart: mon(-4).start, periodEnd: mon(-4).end }),
    T.periodRequestInvalid, ["not_cadence_aligned"],
    "running the ancestor's first owed CALENDAR MONTH by hand under an ANNUAL authority — the month-shaped remedy the un-normalised refusal would name");

  const disposalDate = todayDate();
  const PROCEEDS = 600_000;
  const err = await refuses(() => disposeAsset(w.users.alice, {
    client, asset: succId, disposalDate, proceedsCents: PROCEEDS,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 u3 premature",
  }), T.periodEarlierUnmet,
  "disposing while an ancestor owes an ENDED financial year EARLIER than the disposal's own — the stub extension covers the disposal's OWN cadence period and nothing before it");
  assert.equal((await faRow(succId)).status, "active", "…the refusal left the register untouched");
  assert.deepEqual(await disposalEntries(client), [], "…and minted NO disposal entry — the remedy is named, not half-applied");

  // THE PIN — the named period is the AUTHORITY'S OWN cadence window, verbatim.
  const namedP = namedPeriod(err);
  assert.ok(namedP, `the refusal NAMES the period to run (detail: ${err.detail ?? "(none)"} — message: ${err.message})`);
  assert.equal(namedP.start, fy.open,
    "the refusal names the FINANCIAL YEAR's opening date — not the first day of the owed calendar month");
  assert.equal(namedP.end, fy.close,
    "THE FOLD: the owed month is normalised to the AUTHORITY'S cadence window (calendar month for monthly, the client FY window for annual), so the remedy is a range run_depreciation_manual accepts — month_end(first_due_month) is refused not_cadence_aligned by that very verb");
  assert.ok(namedP.end < today, `…and that window has ENDED (${namedP.end} < ${today}) — an unended window is unfollowable by construction`);

  const remedy = await runManualAndSettle(w.users.alice, w.users.bob,
    { client, periodStart: namedP.start, periodEnd: namedP.end });
  assert.notEqual(remedy.mode, "noop",
    "the window the refusal named really charges when it is run VERBATIM — the remedy is executable, not decorative");
  assert.equal((await runDue(client)).due, false, "…and nothing ENDED is owed once it has run");
  noteLane(`x41.u3 refusal named ${namedP.start}..${namedP.end}; the manual remedy ran as '${remedy.mode}'`);

  let sold = null;
  const err2 = await caught(async () => {
    sold = await disposeAndSettle(w.users.alice, {
      client, asset: succId, disposalDate, proceedsCents: PROCEEDS,
      proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 u3 sold",
    });
  });
  assert.ok(!err2, `the disposal posts once the NAMED window has been run. Got reason='${reasonToken(err2)}' — ${err2?.message}`);
  assert.equal((await faRow(succId)).status, "disposed", "…and the register row flips disposed");

  const pic = await lineagePicture(client, asset.id);
  await assertStubIsPerAsset(pic, sold.entryId, await lineageIdsOf(client, asset.id), "x41.u3");
  assertCoversOnce(pic, [mon(-4).key, mon(-3).key, mon(-2).key, mon(-1).key, mon(0).key], "x41.u3");
  await assertSenExact(pic, "x41.u3");
  const total = assertMoneyCeiling(pic, { cost: CENTS, residual: 0, persisted: 0 }, "x41.u3");
  const moved = await accumMovement(client);
  assert.equal(total, moved.credited, "the whole lineage's live charges equal every sen credited to the GL accumulated account");
  assert.equal(moved.relieved, moved.credited, "…and the disposal relieved exactly that much");
  await assertTieGreen(w.users.alice, client, dayIn(mon(1), 28), "x41.u3 past every mirror this database can hold");
  assert.equal(await glNet(client, ACCUM, dayIn(mon(1), 28)), 0,
    "…and the accumulated account nets to zero after the total disposal, independently summed");
});

// ===========================================================================
// x41.u4 — THE 64-EDGE LINEAGE BOUNDARY.
// ===========================================================================

/** The k-th revision effective date: consecutive days walked across mon(−5)…, capped at
 *  28 per month so the sequence is strictly increasing on every calendar. */
const chainDate = (k) => dayIn(mon(-5 + Math.floor(k / 28)), (k % 28) + 1);

/** Drive `hops` audited revisions in a row, returning the leaf. Every hop states the
 *  same forward particulars — only the effective date moves, so the chain is pure depth
 *  and the arithmetic stays one flat rate across the lineage. */
async function reviseChain(client, rootId, hops, particulars, label) {
  let cur = rootId;
  for (let k = 0; k < hops; k++) {
    await reviseParticulars(w.users.alice, { client, asset: cur, effectiveFrom: chainDate(k), particulars });
    cur = (await faRow(cur)).superseded_by_asset_id;
    assert.ok(cur, `${label}: hop ${k + 1} minted a successor — the chain must really be ${hops} edges deep`);
  }
  return cur;
}

test("x41.u4 the 64-edge lineage boundary: a 64-hop revision chain disposes lawfully — the precondition AND the stub's own ancestor walk read every edge — and the 65th hop is refused by name", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("u4");
  const fy = await openFyFrom(client, 7); // opens mon(−6), closes five months out
  const CENTS = 300_000;
  const LIFE = 120;
  const MONTHLY = Math.floor(CENTS / LIFE); // 2,500
  const particulars = { method: "straight_line", useful_life_months: LIFE, residual_cents: 0, start_date: fy.open };

  const { asset } = await buyAsset({ client, cents: CENTS, postingDate: fy.open, memo: "x41 u4 deep" });
  await completeSL(client, asset.id, { life: LIFE, start: fy.open, description: "x41 u4" });
  await liveAuthority(client, "annual");
  assert.equal((await runDue(client)).due, false,
    `mandatory setup: the whole chain lives inside ONE open financial year (${fy.open}..${fy.close}) — no run can land a charge on it, so every hop stays lawful and the stub is the only charger`);

  const t0 = Date.now();
  const leaf64 = await reviseChain(client, asset.id, 64, particulars, "x41.u4");
  const buildMs = Date.now() - t0;
  assert.equal((await lineageIdsOf(client, asset.id)).length, 65,
    "mandatory setup: 64 hops = 65 register rows in ONE lineage — exactly the documented cap");
  noteLane(`x41.u4 built a 64-edge chain in ${buildMs} ms (${Math.round(buildMs / 64)} ms/hop)`);

  const disposalDate = todayDate();
  let sold = null;
  const errDisp = await caught(async () => {
    sold = await disposeAndSettle(w.users.alice, {
      client, asset: leaf64, disposalDate, proceedsCents: 200_000,
      proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 u4 sold",
    });
  });
  assert.ok(!errDisp,
    `a 64-edge lineage is INSIDE the documented cap: the disposal precondition, the lineage reader and the stub's own ancestor walk must all admit it. A walk seeded at the immediate parent that refuses only past 64 hops admits 65 edges and disagrees with its neighbours — this is the aligned boundary. Got reason='${reasonToken(errDisp)}' — ${errDisp?.message}`);

  const pic = await lineagePicture(client, asset.id);
  await assertStubIsPerAsset(pic, sold.entryId, await lineageIdsOf(client, asset.id), "x41.u4");
  const months = [];
  for (let k = -6; k <= 0; k++) months.push(mon(k).key);
  assertCoversOnce(pic, months, "x41.u4");
  await assertSenExact(pic, "x41.u4");
  const total = assertMoneyCeiling(pic, { cost: CENTS, residual: 0, persisted: 0 }, "x41.u4");
  assert.equal(total, months.length * MONTHLY,
    `the deep lineage is charged ${months.length} month(s) × ${MONTHLY} across all 65 rows — one flat rate, no month lost to a hop and none charged twice`);
  const moved = await accumMovement(client);
  assert.equal(total, moved.credited, "every sen the deep stub charged reached the GL accumulated account");
  assert.equal(moved.relieved, moved.credited, "…and the disposal relieved exactly that much");
  await assertTieGreen(w.users.alice, client, dayIn(mon(1), 28), "x41.u4 past every mirror this database can hold");

  // THE 65th HOP. The cap is a property of the LINEAGE, so either door may own the
  // refusal — the revise verb can decline to mint a 65th edge, or the disposal
  // precondition can decline to read one. The cell accepts the NAMED refusal at
  // whichever door fires and records which one did.
  if (buildMs * 2 > 30_000) {
    markSkip();
    noteLane(`x41.u4 the 65-edge half was NOT built: one 64-edge chain cost ${buildMs} ms and a second would blow this cell's ~30 s budget. The 64-edge half above stands on its own; re-run on a faster rig to close the far side of the boundary.`);
    return;
  }
  const deeper = (await buyAsset({ client, cents: CENTS, postingDate: fy.open, memo: "x41 u4 deeper" })).asset;
  await completeSL(client, deeper.id, { life: LIFE, start: fy.open, description: "x41 u4 deeper" });
  const leafB = await reviseChain(client, deeper.id, 64, particulars, "x41.u4 (65-edge chain)");

  const errRev = await caught(() => reviseParticulars(w.users.alice,
    { client, asset: leafB, effectiveFrom: chainDate(64), particulars }));
  if (errRev) {
    const got = reasonToken(errRev);
    const blob = `${errRev.message ?? ""} ${errRev.detail ?? ""} ${errRev.hint ?? ""}`;
    assert.ok(got === TOO_DEEP || blob.includes(TOO_DEEP),
      `the 65th hop, refused at the REVISE door, must name '${TOO_DEEP}'; got reason='${got ?? "(none)"}' code=${errRev.code ?? "(none)"} — ${errRev.message}`);
    noteLane("x41.u4 the 65th hop was refused at the REVISE door");
    return;
  }
  const leaf65 = (await faRow(leafB)).superseded_by_asset_id;
  assert.ok(leaf65, "the 65th hop minted a successor");
  assert.equal((await lineageIdsOf(client, deeper.id)).length, 66, "…so that lineage is 65 edges deep — one past the cap");
  await refuses(() => disposeAsset(w.users.alice, {
    client, asset: leaf65, disposalDate, proceedsCents: 200_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 u4 too deep",
  }), TOO_DEEP,
  "disposing a 65-edge lineage — one edge past the documented cap, where a reader that admitted it would walk further than its neighbours ever will");
  const strays = (await disposalEntries(client)).map((e) => e.id).filter((id) => id !== sold.entryId);
  assert.deepEqual(strays, [], "…and the refusal minted NO disposal entry");
  noteLane("x41.u4 the 65th hop was refused at the DISPOSAL precondition");
});
