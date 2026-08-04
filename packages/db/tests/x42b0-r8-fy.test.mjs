// ===========================================================================
// [WAVE D-b SPLIT — D-b0 (0042, shared authorities)] A FORK OF `x42-r8-fy.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-r8-fy.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (1): x42.r8.fy.6
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0 (0041 template + 0042)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-r8-fy.test.mjs lands with its own slice.
// ===========================================================================
// Wave D-b (0042) — round-8 fix-wave lane M4: x42.r8.fy THE MID-MONTH FINANCIAL-YEAR END
// (round-8 lens X1 finding F1, MEDIUM; owner ruling 2026-08-03 WDB-R1 root-not-symptom).
//
// THE DEFECT, AS FOUND. `set_client_fy_end` admits ANY real calendar day as a financial-year
// end — lawful in Malaysia; SSM/LHDN name no month-end requirement. But `clara._fa_fy_end_for`
// chose the governing YEAR by comparing the fy_end MONTH alone, never the DAY, so every date
// in the fy_end month resolved to the SAME year regardless of whether it fell before or after
// the fy_end day inside that month — and `clara._fa_fy_open_for` derived the OPEN by
// truncating the end to a month boundary and stepping back eleven months. MEASURED,
// fy_end=(6,15): 16–30 June belonged to NO annual period any oracle would ever propose, and
// the annual window the machine used was 350 days, not 365.
//
// THE FIX (S5.26, this migration). `_fa_fy_end_for` compares the (MONTH, DAY) pair; a date
// strictly after the fy_end day in the fy_end month resolves into the NEXT year, exactly as a
// date in a later month already did. `_fa_fy_open_for` is the day AFTER the previous year's
// actual end — no month truncation, leap-Feb snapping inherited from `_fa_fy_end_for` rather
// than re-derived. Every window then abuts the one before it by construction.
//
// THE KNOCK-ON THIS FIX FOUND IN ITSELF (S5.27, WDB-R4). `clara._fa_asset_charges`'
// reducing-balance segment boundary (`v_seg_start := greatest(v_fy_open, v_first)`) is
// MONTH-GRAIN arithmetic (`_fa_month_diff` extracts year/month only) that silently assumed
// `_fa_fy_open_for` always returned a month-start — true before S5.26, false for a mid-month
// FYE after it. Feeding the exact-day open straight into `v_seg_start` re-admitted an
// already-charged month into the next FY's segment, inflating a reducing-balance charge by a
// real, measured amount (x42.r8.fy.6 reproduces the mechanism directly). S5.27 gives
// `_fa_asset_charges` its own honestly-named month-grain primitive
// (`clara._fa_fy_month_open_for`) instead of re-truncating S5.26's exact-day answer.
//
// WDB-R4 — GRAINS THE FIX DID NOT THINK OF, each pinned by its own cell: monthly-cadence
// periods (FY-independent by design, unaffected); the annual TEMPLATE algebra
// (`clara._adj_period_start`/`_adj_period_end`, the instrument production actually calls, not
// `_fa_fy_open_for` in isolation); the (3,31) and NULL-default month-end controls
// (byte-identical to the pre-fix algebra — every live client today has one of these shapes);
// the Feb-29 leap boundary (`set_client_fy_end`'s own validator admits day 29 for February,
// so it is a lawful election, not a rejected edge case); and the reducing-balance charge tie
// to the cent across the FY boundary this fix itself moved.
//
// ROUND-9 FIX WAVE, LANE N2 (r9 finding 7, MEDIUM) — x42.r8.fy.6 ITSELF CARRIED A HARDCODED
// CALENDAR LITERAL. Its subject date was already anchor-relative (`mon(-14)`), but the cell's
// whole shape (FY1 = one chargeable month; FY2 = exactly 12) held only because `mon(-14)`
// happened to land in the FYE month while the MYT anchor was August 2026, and the FY2 upper
// bound was pinned to the literal "2026-06" — both would have broken silently, in a way that
// reads like a depreciation defect rather than a stale fixture, the instant real time crossed
// 2026-09-01. Fixed by deriving the acquisition month and the FY2 window from `lastEndedFy`
// (the anchor-relative FY primitive x41-fa-fixtures.mjs already exports) instead of trusting
// where a relative-month shift happens to land.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, noteLane,
} from "./a21-helpers.mjs";
import { x42S5Ready, x42S5SkipHere } from "./x42-s5-helpers.mjs";
import {
  faWorld, freshFaClient, setClientFyEnd, buyAsset, completeRB, liveAuthority, drainDue,
  chargeRows, lastEndedFy, dstr,
} from "./x41-fa-world.mjs";

let live = false;

before(async () => {
  live = await x42S5Ready();
});

after(async () => {
  printLaneNotes("x42-r8-fy");
  printSkipCount("x42-r8-fy");
  await endPool();
});

const skipHere = (t) => x42S5SkipHere(t, live);

/** `clara._adj_period_start`/`_adj_period_end`, cast to text so the answer is a plain
 *  'YYYY-MM-DD' string — sidesteps node-postgres's local-timezone `date` parsing entirely.
 *  This pair is the SHARED annual/monthly period algebra every adjustment template AND every
 *  non-monthly depreciation authority actually calls (s2-adjustments.sql:295-305 delegates
 *  straight to the D-a FY primitives this fix recuts) — measuring through it, not
 *  `clara._fa_fy_open_for`/`_fa_fy_end_for` in isolation, is "the instrument production uses". */
async function period(client, cadence, d) {
  const r = await rootQuery(
    "select clara._adj_period_start($1,$2,$3::date)::text as ps, clara._adj_period_end($1,$2,$3::date)::text as pe",
    [client, cadence, d]);
  return { ps: r.rows[0].ps, pe: r.rows[0].pe };
}

/** Inclusive day count between two 'YYYY-MM-DD' strings. */
const days = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000) + 1;

const gapSweep = (client, from, to) => rootQuery(
  `select count(*) filter (where not (
              d::date between clara._adj_period_start($1,'annual',d::date)
                           and clara._adj_period_end($1,'annual',d::date)))::int as gap
     from generate_series($2::date, $3::date, '1 day') d`,
  [client, from, to]).then((r) => r.rows[0].gap);

// ===========================================================================
// x42.r8.fy.6 — THE KNOCK-ON, TIED TO THE CENT. A monthly-cadence reducing-balance asset
// crossing a mid-month FY boundary must charge EXACTLY what an economically-correct
// reducing-balance schedule owes — a regression of S5.27 ALONE (leaving S5.26 standing) would
// re-inflate FY2's total by exactly the amount named below, so this cell catches it by name.
// ===========================================================================
test("x42.r8.fy.6 [round-8 M4 F1 knock-on] a reducing-balance asset crossing a mid-month FY boundary charges to the cent, not the S5.26-alone conflation", async (t) => {
  if (skipHere(t)) return;
  const w = await faWorld();
  const sub = w.users.alice;
  const client = await freshFaClient("r8fy6");
  await setClientFyEnd(sub, { client, month: 6, day: 15 });
  await liveAuthority(client, "monthly");
  // THE ACQUISITION MONTH IS PINNED INTO THE FYE MONTH, DERIVED FROM THE DB ANCHOR -- NEVER A
  // CALENDAR LITERAL AND NEVER LEFT TO mon(-14)'S ACCIDENT [round-9 fix wave, lane N2; r9 finding
  // 7, MEDIUM]. THE DEFECT, AS FOUND: this cell's whole shape (FY1 = a single chargeable month;
  // FY2 = exactly 12 months) held only because mon(-14) happened to land in the FYE month while
  // the MYT anchor was August 2026 -- from a 2026-09 anchor mon(-14) lands a month later, whose
  // FY block is the FULL prior year rather than one month, and the cell's premise silently no
  // longer described anything. lastEndedFy(6,15) names the most recently ENDED (6,15) financial
  // year against the DB's own MYT anchor -- guaranteed fully elapsed by its own construction (the
  // anchor month must already be past fyMonth, else a year is subtracted), so every one of the 13
  // months this cell drains is due whichever month the suite actually runs in. FY2 is that ended
  // year; FY1's own single chargeable month is, by construction, the FYE month of the year
  // immediately before FY2 opens -- the cell's actual premise ("the acquisition month IS the
  // FY-end month"), pinned here as an asserted fixture fact rather than inferred from where
  // mon(-14) happened to land.
  const fy2 = lastEndedFy(6, 15);
  const startDate = dstr(fy2.closeY - 1, 6, 1);
  assert.equal(startDate.slice(5, 7), "06", "fixture premise: the asset must be acquired IN the client's FYE month (June)");
  const { asset } = await buyAsset({ client, cents: 1_000_000, postingDate: startDate });
  await completeRB(client, asset.id, { life: 60, rateBps: 2000, start: startDate });
  const receipts = await drainDue(client);
  assert.ok(receipts.length >= 13, `expected at least 13 monthly runs to cross the FY boundary (got ${receipts.length})`);

  const rows = await chargeRows(asset.id);
  const byMonth = Object.fromEntries(rows.map((r) => [String(r.period_start).slice(0, 7), Number(r.amount_cents)]));
  // FY1 (the acquisition month alone, basis 1,000,000): floor(1,000,000 x 0.20 / 12) = 16,666.
  const fy1Month = startDate.slice(0, 7);
  assert.equal(byMonth[fy1Month], 16666, `FY1's single chargeable month must charge 16,666 sen (got ${byMonth[fy1Month]})`);

  // FY2 runs a full 12 months (July .. June), its upper bound DERIVED from lastEndedFy's own
  // closeY -- never a hardcoded "YYYY-06" (the exact literal r9 finding 7 measured breaking the
  // instant real time crossed 2026-09-01) -- on a basis REDUCED by FY1's own 16,666 charge:
  // basis = 1,000,000 - 16,666 = 983,334; annual = round(983,334 x 0.20) = 196,667.
  const fy2UpperMonth = `${fy2.closeY}-06`;
  const fy2Months = Object.entries(byMonth)
    .filter(([k]) => k > fy1Month && k <= fy2UpperMonth)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  assert.equal(fy2Months.length, 12, `FY2 must be exactly 12 charged months (got ${fy2Months.length}: ${fy2Months.map(([k]) => k).join(",")})`);
  const fy2Total = fy2Months.reduce((s, [, v]) => s + v, 0);
  assert.equal(fy2Total, 196667, `FY2's total charge must be 196,667 sen (round(983,334 x 0.20)) -- the S5.26-alone conflation charged 216,666 by re-admitting June's own month into a 13-month FY2 segment (got ${fy2Total})`);
  // ...and no single FY2 month may be double the ordinary monthly rate (the tell-tale sign
  // of the conflation's true-up absorbing an extra whole month at the FY2 close).
  for (const [k, v] of fy2Months) {
    assert.ok(v < 2 * 16667, `${k}: FY2 month charged ${v} sen -- suspiciously close to DOUBLE the ordinary ~16,666 rate, the conflation's signature`);
  }
  noteLane(`fy.6 FY1=${byMonth[fy1Month]} FY2 total=${fy2Total} over ${fy2Months.length} months (${fy2Months.map(([k, v]) => `${k}:${v}`).join(" ")})`);
});
