// 0041 Wave D-a — the FA REGISTER battery, part 3: REDUCING BALANCE (design §3.1)
// and ANNUAL CADENCE at a non-December FYE (WD-R4, design §1.6/§3.1).
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header). Every FY window is derived from
// the DATABASE's own Asia/Kuala_Lumpur anchor month via lastEndedFy() — an FY is a
// run candidate only once it has ENDED, so the cells always target the LAST ENDED FY
// and never a calendar literal.
//
// The RB law under test (design §3.1):
//   basis        = cost − Accumulated(asset, greatest(FY_open − 1 day, baseline_as_of))
//   entitlement_s= round(basis × rate_s) × months_s / 12     (per rate segment s)
//   sen law      = floor monthly + the segment's LAST CHARGED month absorbs
//   FY total     = Σ segments  — the PROSPECTIVE reading (a 20%→10% October revision
//                  on an RM80,000 basis = 12,000 + 2,000 = RM14,000)
//   the true-up rides whichever charge TERMINATES the FY charging (a December run, a
//   life-end clamp, or the disposal stub); clamps: never below residual, and a
//   negative true-up clamps to ZERO with a receipt note.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41, caught,
  ACCUM, EXPENSE, BANK, GAIN, LOSS, mon, dayIn, dstr, lastEndedFy, reviseParticulars, runPeriod,
  disposeAsset, setClientFyEnd, runDue, getAuthority, faWorld, faRow, faRows, chargeRows,
  entryRowOf, accumulatedAt, glNet, liveRanges, assertNoOverlaps, freshFaClient, buyAsset,
  completeRB, completeSL, liveAuthority, earnRamp, runAndSettle, kSeededFaClient,
} from "./x41-fa-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-reducing-balance");
  printSkipCount("x41-reducing-balance");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a reducing-balance battery");

/** Every LIVE charge across an asset's whole supersede LINEAGE (a revision splits an
 *  asset into predecessor + successor; the FY total is a property of the lineage). */
async function lineageCharges(client, rootAsset) {
  const rows = await faRows(client);
  const ids = new Set([rootAsset]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.supersedes_asset_id && ids.has(r.supersedes_asset_id) && !ids.has(r.id)) { ids.add(r.id); grew = true; }
    }
  }
  const out = [];
  for (const id of ids) out.push(...(await liveRanges(id)));
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}
const sumOf = (ranges) => ranges.reduce((n, r) => n + r.amount, 0);

// ===========================================================================
// x41.e — THE REDUCING-BALANCE BATTERY.
// ===========================================================================

test("x41.e1 the WORKED FIGURE: an RM80,000 basis at 20% revised to 10% effective 1 October charges 12,000 + 2,000 = RM14,000 for the FY — the PROSPECTIVE reading, Σ segments", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("e1");
  const fy = lastEndedFy(12, 31); // the Dec-31 fallback (design §1.6)
  const { asset } = await buyAsset({ client, cents: 8_000_000, postingDate: fy.open, memo: "x41 RB worked figure" });
  await completeRB(client, asset.id, { life: 120, rateBps: 2000, residual: 0, start: fy.open, description: "x41 RB80k" });

  const octoberFirst = dstr(fy.closeY, 10, 1);
  // [ASSEMBLY] p_particulars is the SAME full particulars object on both change doors
  // (contract §2 states the key set once) — a revision states the whole forward driver set.
  await reviseParticulars(w.users.alice, {
    client, asset: asset.id, effectiveFrom: octoberFirst,
    particulars: { method: "reducing_balance", useful_life_months: 120, rate_bps: 1000, residual_cents: 0, start_date: fy.open },
  });

  await liveAuthority(client, "annual");
  const due = await runDue(client);
  assert.equal(due.due, true, "the LAST ENDED FY is due under annual cadence");
  assert.equal(due.cadence, "annual", "…and the probe reports the authority's cadence (WD-R4 consumed, round-2 fold 6)");
  assert.equal(due.period_start, fy.open, `…the FY window opens ${fy.open} (got ${due.period_start})`);
  assert.equal(due.period_end, fy.close, `…and closes ${fy.close} (got ${due.period_end})`);

  const out = await earnRamp(client, { start: fy.open, end: fy.close });
  const charged = sumOf(await lineageCharges(client, asset.id));
  assert.equal(charged, 1_400_000,
    `Σ segments = round(8,000,000 × 20%) × 9/12 + round(8,000,000 × 10%) × 3/12 = 1,200,000 + 200,000 = RM14,000 (got ${charged})`);
  assert.equal(Number(out.receipt.charged_cents), 1_400_000, "…and the receipt reports the same total to the sen");
  // [ASSEMBLY] the receipt's `entries` counts LEDGER CHARGE ROWS, not journal entries (two
  // here: one per rate segment). The one-entry law is asserted where it lives — the client has
  // exactly ONE scheduled_run journal entry for the FY.
  assert.equal(Number(out.receipt.entries), 2, "the receipt counts one ledger charge row per rate SEGMENT");
  const scheduled = await rootQuery(
    "select count(*)::int as n from clara.journal_entries where client_id=$1 and origin='scheduled_run'", [client]);
  assert.equal(scheduled.rows[0].n, 1, "annual cadence posts ONE entry at FY end (design §3.1)");
  assert.equal(await glNet(client, EXPENSE, fy.close), 1_400_000, "the depreciation expense GL carries the same figure");
  assert.equal(await glNet(client, ACCUM, fy.close), -1_400_000, "…and the accumulated account the same credit");

  const ranges = await lineageCharges(client, asset.id);
  assertNoOverlaps(ranges, "the segmented FY");
  for (const r of ranges) {
    assert.ok(r.start >= fy.open && r.end <= fy.close, `every ledger row records a sub-range INSIDE the FY (got ${r.start}..${r.end})`);
  }
  noteLane(`x41.e1 the FY was recorded as ${ranges.length} ledger sub-range(s): ${ranges.map((r) => `${r.start}..${r.end}=${r.amount}`).join(" | ")}`);
});

test("x41.e2 a mid-year start earns only its in-service months of the FY: entitlement = round(basis × rate) × months/12", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("e2");
  const fy = lastEndedFy(12, 31);
  const inService = dstr(fy.closeY, 4, 1); // April → 9 in-service months of the FY
  const { asset } = await buyAsset({ client, cents: 4_000_000, postingDate: inService, memo: "x41 RB mid-year" });
  await completeRB(client, asset.id, { life: 120, rateBps: 2500, residual: 0, start: inService, description: "x41 RB midyear" });
  await liveAuthority(client, "annual");
  await earnRamp(client, { start: fy.open, end: fy.close });

  const expected = Math.round(4_000_000 * 0.25) * 9 / 12;
  const charged = sumOf(await lineageCharges(client, asset.id));
  assert.ok(Math.abs(charged - expected) <= 1,
    `a 9-month in-service FY charges round(4,000,000 × 25%) × 9/12 = ${expected} to the sen (got ${charged})`);
  const ranges = await lineageCharges(client, asset.id);
  assert.equal(ranges[0].start, inService, "the ledger row's sub-range STARTS at the in-service month (month-grain: the in-service month is charged)");
  assert.equal(ranges[ranges.length - 1].end, fy.close, "…and runs to the FY close");
});

test("x41.e3 the carried-basis `greatest` law: an RB asset carried in with a baseline runs WITHOUT tripping the as_of < baseline_as_of refusal, on the carried NBV", async (t) => {
  if (skipHere(t)) return;
  const k = await kSeededFaClient("e3", { method: "reducing_balance", rateBps: 2000, life: 120 });
  const asset = await faRow(k.assetId);
  assert.equal(asset.depreciation_method, "reducing_balance", "the carry-down really seeded a REDUCING-BALANCE asset (WD-R3: the CLR31 sites widened)");

  await liveAuthority(k.client);
  const firstDue = await runDue(k.client);
  assert.equal(firstDue.due, true, "the carried RB asset makes a period due — the basis read did not refuse (round-2 fold 7)");
  const out = await earnRamp(k.client, mon(-5));
  assert.notEqual(out.mode, "noop", "the run is NON-VACUOUS: it really charged the carried asset");

  const fyOpenMinus1 = dstr(mon(0).y, 1, 1) > k.baselineAsOf
    ? dstr(mon(0).y - 1, 12, 31)
    : k.baselineAsOf;
  const basisDate = fyOpenMinus1 > k.baselineAsOf ? fyOpenMinus1 : k.baselineAsOf;
  const basis = k.cost - (await accumulatedAt(k.assetId, basisDate));
  assert.equal(basis, k.cost - k.accum,
    `the basis reads the carried NBV at greatest(FY_open−1, baseline_as_of)=${basisDate} (got ${basis})`);

  const charged = sumOf(await liveRanges(k.assetId));
  assert.ok(charged > 0, "a non-zero charge landed");
  const annual = Math.round(basis * 0.20);
  assert.ok(charged <= annual, `one month's charge never exceeds the FY entitlement ${annual} (got ${charged})`);
  noteLane(`x41.e3 carried RB: basis ${basis} at ${basisDate}; first month charged ${charged}`);
});

test("x41.e4 the sen law: within a segment every month but the LAST charges the floor, and the last month ABSORBS the remainder exactly", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("e4");
  const fy = lastEndedFy(12, 31);
  const inService = dstr(fy.closeY, 10, 1); // Oct/Nov/Dec — a THREE-month segment that
  // terminates at the FY end INSIDE the window this suite can run, so the absorb is
  // actually observable (under a longer segment the absorb lands in a future December).
  const { asset } = await buyAsset({ client, cents: 100_000, postingDate: inService, memo: "x41 RB sen tail" });
  await completeRB(client, asset.id, { life: 120, rateBps: 3333, residual: 0, start: inService, description: "x41 RB tail" });
  await liveAuthority(client); // MONTHLY — so the segment's months are separate rows

  await earnRamp(client, { start: inService, end: dstr(fy.closeY, 10, 31) });
  await runAndSettle(client, { start: dstr(fy.closeY, 11, 1), end: dstr(fy.closeY, 11, 30) });
  await runAndSettle(client, { start: dstr(fy.closeY, 12, 1), end: fy.close });

  const ranges = (await liveRanges(asset.id)).sort((a, b) => (a.start < b.start ? -1 : 1));
  assert.equal(ranges.length, 3, `three monthly charges across the segment (got ${ranges.length})`);
  assert.equal(ranges[0].amount, ranges[1].amount, "the non-final months charge the SAME floor");
  const floorAmt = ranges[0].amount;
  const tail = ranges[2].amount;
  assert.ok(tail >= floorAmt, `the LAST charged month absorbs (tail ${tail} >= floor ${floorAmt})`);
  assert.ok(tail - floorAmt < 3, `the absorb is the remainder, strictly below the month count (tail − floor = ${tail - floorAmt})`);
  assert.notEqual(tail, floorAmt, "the fixture is NON-VACUOUS: this entitlement really does leave a sen tail");

  const total = floorAmt * 2 + tail;
  const entitlement = Math.round(100_000 * 0.3333) * 3 / 12;
  assert.ok(Math.abs(total - entitlement) <= 1,
    `Σ the segment = round(100,000 × 33.33%) × 3/12 = ${entitlement} to the sen (got ${total}; tail = ${tail - floorAmt} sen)`);
  noteLane(`x41.e4 sen tail observed: floor ${floorAmt} ×2 + tail ${tail} (absorb ${tail - floorAmt} sen) = ${total}`);
});

test("x41.e5 life-end and the clamps: RB terminates at life end charging NBV − residual exactly, never below residual, and a zero/negative true-up charges NOTHING (no non-positive ledger row can exist)", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("e5");
  const m3 = mon(-3);
  // A 2-month life: RB would never reach the residual on its own, so the LIFE-END
  // clamp is what writes the remainder off (design §3.1).
  const { asset } = await buyAsset({ client, cents: 100_000, postingDate: dayIn(m3, 1), memo: "x41 RB life-end" });
  await completeRB(client, asset.id, { life: 2, rateBps: 2000, residual: 10_000, start: m3.start, description: "x41 RB short life" });
  await liveAuthority(client);
  await earnRamp(client, m3);
  await runAndSettle(client, mon(-2));

  const accum = await accumulatedAt(asset.id, mon(-2).end);
  assert.equal(accum, 100_000 - 10_000, "at life end accumulated = cost − residual EXACTLY (the terminating charge is NBV − residual)");
  for (const r of await chargeRows(asset.id)) {
    assert.ok(Number(r.amount_cents) > 0, `every ledger row carries a POSITIVE amount (got ${r.amount_cents}) — the table CHECK and the clamp agree`);
  }

  // A further period charges nothing at all — the negative/zero true-up clamps.
  const after = await runPeriod({ client, periodStart: mon(-1).start, periodEnd: mon(-1).end });
  const before = (await liveRanges(asset.id)).length;
  if (after.status !== "noop") {
    const reasons = (after.skipped ?? []).map((s) => s.reason);
    assert.ok(reasons.includes("fully_depreciated"), `a fully-clamped asset is skipped BY NAME (got ${JSON.stringify(reasons)})`);
  }
  assert.equal((await liveRanges(asset.id)).length, before, "…and no additional charge row appeared (a zero/negative true-up clamps to zero)");
  assert.equal(await accumulatedAt(asset.id, mon(-1).end), 100_000 - 10_000, "…accumulated never passes cost − residual");
});

// ===========================================================================
// x41.f — ANNUAL CADENCE AT A NON-DECEMBER FYE (WD-R4, round-2 fold 6).
// ===========================================================================

test("x41.f1 annual cadence at a 30 June FYE: ONE entry at FY end, per-asset sub-ranges, and a mid-FY disposal stub is that asset's ONLY in-year charge", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("f1");
  await setClientFyEnd(w.users.alice, { client, month: 6, day: 30 });
  const fy = lastEndedFy(6, 30);
  // Asset A rides the whole FY; asset B is disposed mid-FY.
  const a = (await buyAsset({ client, cents: 1_200_000, postingDate: fy.open, memo: "x41 annual A" })).asset;
  const b = (await buyAsset({ client, cents: 600_000, postingDate: fy.open, memo: "x41 annual B" })).asset;
  await completeSL(client, a.id, { life: 120, start: fy.open, description: "x41 annual A" });
  await completeSL(client, b.id, { life: 60, start: fy.open, description: "x41 annual B" });

  const auth = await getAuthority(w.users.alice, client);
  assert.equal(Number(auth.fy_end?.month), 6, "get_depreciation_authority surfaces the client's FYE month");
  assert.equal(Number(auth.fy_end?.day), 30, "…and its day");
  assert.equal(auth.fy_end?.fallback, false, "…and fallback:false once the year end is explicitly set (design §1.6)");

  await liveAuthority(client, "annual");
  // B is disposed three months into the FY — its stub through the disposal month is
  // its ONLY in-year charge, so the annual-overcharge class is unrepresentable.
  const dispTotal = fy.openY * 12 + (fy.openM - 1) + 2; // the FY's THIRD month
  const dispY = Math.floor(dispTotal / 12);
  const dispM = dispTotal - dispY * 12 + 1;
  const disposalMonthEnd = dstr(dispY, dispM, 31);
  const disposal = await disposeAsset(w.users.alice, {
    client, asset: b.id, disposalDate: disposalMonthEnd, proceedsCents: 500_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 mid-FY disposal",
  });
  assert.ok(disposal, "the mid-FY disposal posted");
  assert.equal((await faRow(b.id)).status, "disposed", "…and B is disposed");

  const out = await earnRamp(client, { start: fy.open, end: fy.close });
  assert.equal(Number(out.receipt.entries), 1, "annual cadence posts exactly ONE entry for the whole FY");
  const runEntry = await entryRowOf(out.entryId);
  assert.equal(runEntry.posting_date, fy.close, "…dated at the FY end");

  const aRanges = await liveRanges(a.id);
  assert.ok(aRanges.length >= 1, "asset A was charged");
  assert.equal(aRanges[0].start, fy.open, "A's sub-range opens at the FY open");
  assert.equal(aRanges[aRanges.length - 1].end, fy.close, "…and closes at the FY close (the ledger records the EXACT sub-range charged)");

  const bRanges = await liveRanges(b.id);
  assertNoOverlaps(bRanges, "the mid-FY disposed asset");
  for (const r of bRanges) {
    assert.ok(r.end <= disposalMonthEnd,
      `the disposed asset is never charged past its disposal month (got a range ending ${r.end} > ${disposalMonthEnd})`);
  }
  const bStubEntries = new Set(bRanges.map((r) => r.entry));
  assert.ok(!bStubEntries.has(out.entryId),
    "the FY-end annual entry charges NOTHING for the disposed asset — its stub was its only in-year charge");
});

test("x41.f2 the FYE fallback is SURFACED: a client with no explicit year end reports the Dec-31 default as a fallback, not as a fact", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("f2");
  await liveAuthority(client, "annual");
  const auth = await getAuthority(w.users.alice, client);
  assert.equal(Number(auth.fy_end?.month), 12, "the fallback FYE month is December");
  assert.equal(Number(auth.fy_end?.day), 31, "…on the 31st");
  assert.equal(auth.fy_end?.fallback, true, "…and it is SURFACED as a fallback (design §1.6) — the card must not present it as a stated fact");

  await setClientFyEnd(w.users.alice, { client, month: 3, day: 31 });
  const after = await getAuthority(w.users.alice, client);
  assert.equal(Number(after.fy_end?.month), 3, "the setter moved the FYE month");
  assert.equal(after.fy_end?.fallback, false, "…and the fallback flag cleared");

  // The contract assigns no token to the setter's own range validation, so the cell
  // pins the BEHAVIOUR (it must refuse) and records the shape that fired.
  const err = await caught(() => setClientFyEnd(w.users.alice, { client, month: 13, day: 1 }));
  assert.ok(err, "set_client_fy_end must REFUSE an out-of-range month (13)");
  noteLane(`x41.f2 set_client_fy_end(month=13) refused with code=${err.code} detail=${err.detail ?? "(none)"}`);
  assert.equal(Number((await getAuthority(w.users.alice, client)).fy_end?.month), 3, "…and the refusal changed nothing");
});
