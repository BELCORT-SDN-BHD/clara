// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-r8-fy.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-r8-fy.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (5): x42.r8.fy.1, x42.r8.fy.2, x42.r8.fy.3, x42.r8.fy.4, x42.r8.fy.5
// CELLS IN THE SIBLING FORK(S): b0 → D-b0
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
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
// x42.r8.fy.1 — MID-MONTH FYE (6,15): every calendar day of a full year belongs to EXACTLY
// one annual period through the production instrument, and the window is 365 days.
// ===========================================================================
test("x42.r8.fy.1 a mid-month FYE (6,15) leaves no calendar day outside every annual period, through clara._adj_period_start/_end", async (t) => {
  if (skipHere(t)) return;
  const w = await faWorld();
  const client = await freshFaClient("r8fy1");
  await setClientFyEnd(w.users.alice, { client, month: 6, day: 15 });

  const { ps, pe } = await period(client, "annual", "2026-06-01");
  assert.equal(days(ps, pe), 365, `the mid-month FYE annual window must be exactly 365 days (got ${ps}..${pe})`);

  const gap = await gapSweep(client, "2025-07-01", "2026-06-30");
  assert.equal(gap, 0, "no calendar day of a full year may belong to no annual period");

  // the exact boundary day the pre-fix algebra stranded (16 June): must belong to the FY that
  // OPENS that day, not to no period and not to the year that already ended.
  const boundary = await period(client, "annual", "2026-06-16");
  assert.equal(boundary.ps, "2026-06-16", "16 June opens the NEW annual period");
  assert.equal(boundary.pe, "2027-06-15", "…and it runs through 15 June the following year");
  noteLane(`fy.1 mid-month (6,15) window ${ps}..${pe}, boundary day 16-Jun resolves into ${boundary.ps}..${boundary.pe}`);
});

// ===========================================================================
// x42.r8.fy.2 [WDB-R4 off-path] — MONTHLY CADENCE IS FY-INDEPENDENT, UNTOUCHED BY THIS FIX.
// ===========================================================================
test("x42.r8.fy.2 [WDB-R4] monthly-cadence periods are unaffected by a mid-month FYE — a calendar month, always", async (t) => {
  if (skipHere(t)) return;
  const w = await faWorld();
  const client = await freshFaClient("r8fy2");
  await setClientFyEnd(w.users.alice, { client, month: 6, day: 15 });
  const { ps, pe } = await period(client, "monthly", "2026-06-20");
  assert.equal(ps, "2026-06-01", "a monthly period opens on the calendar month start regardless of the client's FYE");
  assert.equal(pe, "2026-06-30", "…and ends on the calendar month end");
});

// ===========================================================================
// x42.r8.fy.3/4 — MONTH-END BYTE-IDENTITY. Every live client today is NULL-default or a
// month-end FYE (RS's real 31 March) — both must be byte-identical to the pre-fix algebra,
// re-derived independently here (the OLD month-truncation formula, restated) rather than
// asserted against a function this migration just replaced.
// ===========================================================================
test("x42.r8.fy.3 the (3,31) month-end FYE is byte-identical to the pre-fix month-truncated algebra", async (t) => {
  if (skipHere(t)) return;
  const w = await faWorld();
  const client = await freshFaClient("r8fy3");
  await setClientFyEnd(w.users.alice, { client, month: 3, day: 31 });
  const { ps, pe } = await period(client, "annual", "2026-06-01");
  assert.equal(pe, "2027-03-31", "month-end FYE end date, unaffected");
  const oldOpen = await rootQuery(
    "select (date_trunc('month', $1::date) - interval '11 months')::date::text as x", [pe]);
  assert.equal(ps, oldOpen.rows[0].x, "the NEW open must equal the OLD month-truncated formula for a month-end FYE");
});

test("x42.r8.fy.4 the NULL-default (Dec-31 fallback) FYE is byte-identical to the pre-fix algebra", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("r8fy4");
  // NULL is the client's birth default — no set_client_fy_end call needed.
  const { ps, pe } = await period(client, "annual", "2026-06-01");
  assert.equal(pe, "2026-12-31", "the Dec-31 fallback end date, unaffected");
  const oldOpen = await rootQuery(
    "select (date_trunc('month', $1::date) - interval '11 months')::date::text as x", [pe]);
  assert.equal(ps, oldOpen.rows[0].x, "the NEW open must equal the OLD month-truncated formula for the NULL-default fallback");
});

// ===========================================================================
// x42.r8.fy.5 [WDB-R4 off-path] — THE LEAP BOUNDARY, ADJUDICATED. set_client_fy_end's own
// validator admits day 29 for February (it refuses only `p_day > 29`), so a Feb-29
// financial-year end is a LAWFUL election, not a rejected edge case — and its non-leap-year
// snap (via the pre-existing clara._fa_ym_date least() clamp, untouched by this fix) must
// still leave every calendar day in exactly one period.
// ===========================================================================
test("x42.r8.fy.5 [WDB-R4] the Feb-29 leap boundary is gap-free across a five-year sweep, and its (2,28) month-end control is unaffected", async (t) => {
  if (skipHere(t)) return;
  const w = await faWorld();
  const clientLeap = await freshFaClient("r8fy5a");
  await setClientFyEnd(w.users.alice, { client: clientLeap, month: 2, day: 29 });

  // non-leap year: snaps to 28 Feb, 365-day window.
  const nonLeap = await period(clientLeap, "annual", "2027-02-20");
  assert.equal(nonLeap.pe, "2027-02-28", "fy_end=(2,29) in a non-leap year snaps to 28 Feb");
  assert.equal(days(nonLeap.ps, nonLeap.pe), 365, "…with a 365-day window");
  // leap year: lands exactly on 29 Feb, 366-day window.
  const leap = await period(clientLeap, "annual", "2028-02-29");
  assert.equal(leap.pe, "2028-02-29", "fy_end=(2,29) in a leap year lands ON 29 Feb");
  assert.equal(days(leap.ps, leap.pe), 366, "…with a 366-day window");

  const gapLeap = await gapSweep(clientLeap, "2025-03-01", "2030-03-01");
  assert.equal(gapLeap, 0, "fy_end=(2,29) must be gap-free across a five-year sweep crossing the leap boundary twice");

  // the (2,28) plain month-end control: never snaps.
  const clientCtrl = await freshFaClient("r8fy5b");
  await setClientFyEnd(w.users.alice, { client: clientCtrl, month: 2, day: 28 });
  const gapCtrl = await gapSweep(clientCtrl, "2025-03-01", "2030-03-01");
  assert.equal(gapCtrl, 0, "the (2,28) month-end control must also be gap-free");
  noteLane(`fy.5 leap (2,29): non-leap window ${nonLeap.ps}..${nonLeap.pe} (365d), leap window ${leap.ps}..${leap.pe} (366d), five-year sweep 0 gaps; (2,28) control also 0 gaps`);
});
