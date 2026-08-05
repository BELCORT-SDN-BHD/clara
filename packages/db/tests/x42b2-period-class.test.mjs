// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-period-class.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-period-class.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (1): x42.pc4
// CELLS IN THE SIBLING FORK(S): b0 → D-b0
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-period-class.test.mjs lands with its own slice.
// ===========================================================================
// 0042 Wave D-b — THE PERIOD-DATED POSTING CLASS (as-built ladder round 6).
//
// THE INVARIANT THIS FILE DEFENDS: for one client, one period and one account line-shape the
// books may carry at most ONE net machine-posted charge — so every approved posting of that
// (client, period, shape) that has since been corrected must have been neutralised ON THE VERY
// date it was booked at, before ANY lane posts into that period again.
//
// WHY IT IS A SEPARATE FILE FROM x42-adj-period-double. Round 5 closed exactly this composition
// on the recurring-adjustment lane and keyed both of its remedies on a LANE and an IDENTITY
// (`flags ? 'recurring_adjustment'`, `template_id`). Round 6 measured the FIXED-ASSET lane
// carrying the identical shape end to end on LIVE 0041 code, unattended:
//   monthly straight-line 360,000/36 = 10,000 a month; month 1 corrected through
//   clara.reverse_entry; the correction landing MYT-today so the month's own books never moved;
//   clara.depreciation_run_due re-proposing the month; and the re-run AUTO-POSTING because the
//   ramp was already earned — leaving 20,000 of accumulated depreciation and 20,000 of expense
//   in a month whose charge is 10,000, with clara.fa_register_tie certifying accum_diff_cents=0
//   because register and ledger had been made wrong in exactly the same way.
// The cells below are the sibling lane's money proof, the gate that holds when the date fix
// cannot reach the door, and the ratchet that stops a THIRD lane repeating this.
//
// Every cell asserts a NUMBER or a catalog fact, never a message alone.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, noteLane, printLaneNotes, printSkipCount,
  ACCUM, EXPENSE, mon, rootQuery, getPool,
  runPeriod, runDue, entryRowOf, approveEntry,
  faWorld, chargeRows, accumulatedAt, registerAccumulatedAt, glNet, drainDue,
  freshFaClient, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle, reverseAndSettle,
  retireAuthorityVerb,
} from "./x41-fa-world.mjs";
import { x42S5Ready, x42S5SkipHere } from "./x42-s5-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42S5Ready();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x42-period-class");
  printSkipCount("x42-period-class");
  await endPool();
});

const skipHere = (t) => x42S5SkipHere(t, live);
const iso = (d) => String(d).slice(0, 10);
/** Accumulated depreciation as a POSITIVE figure at an as-of. The `+ 0` is load-bearing:
 *  negating a zero GL balance yields -0, and node:assert's strictEqual distinguishes it from
 *  0 — a false red on the single most important assertion in this file. */
const accumAt = async (client, asOf) => -(await glNet(client, ACCUM, asOf)) + 0;

/** One monthly straight-line asset, three charged months, the ramp earned. 10,000 sen a
 *  month is the round-6 probe's own figure, kept so the numbers below read as measured. */
async function threeChargedMonths(label) {
  const client = await freshFaClient(label);
  const m1 = mon(-3), m2 = mon(-2), m3 = mon(-1);
  const cost = 360_000;
  const { asset } = await buyAsset({ client, cents: cost, postingDate: m1.start, memo: label });
  await completeSL(client, asset.id, { life: 36, start: m1.start, description: `${label} SL` });
  await liveAuthority(client, "monthly");
  const r1 = await earnRamp(client, m1);
  await runAndSettle(client, m2);
  await runAndSettle(client, m3);
  return { client, asset, m1, m2, m3, monthly: 10_000, firstEntry: r1.entryId };
}

/** Move ONE register row's effective_date, with user triggers silenced. This is what a
 *  correction door 0042 does not own writes today, and what every pre-0042 unwind row already
 *  carries — the state the GATE (not the date fix) has to hold against. */
async function forgeChargeEffective(rowId, isoDate) {
  const c = await getPool().connect();
  try {
    await c.query("set session_replication_role = replica");
    await c.query("update clara.fa_depreciation set effective_date = $2::date where id = $1",
      [rowId, isoDate]);
  } finally {
    await c.query("set session_replication_role = origin").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

// ---------------------------------------------------------------------------------------
// x42.pc4 — WHAT THE FIX DID NOT THINK OF, part 2: THE RATCHET AND THE SCOPE.
//
// Round 5's remedy was correct and was bypassed inside one round because a sibling lane existed
// outside its key. The only defence that survives the NEXT lane is a catalog fact, so this cell
// asks the catalog rather than the behaviour.
// ---------------------------------------------------------------------------------------
test("x42.pc4 the class ratchet: one correction-date authority and one re-run gate, every door on them, the stamp registry covering every machine poster — and an UNREGISTERED stamp raising rather than answering 'sound'", async (t) => {
  if (skipHere(t)) return;

  // ROUND 7 ADDED THE THIRD MEMBER. clara.dispose_fixed_asset drafts at posting_date = the
  // disposal date and its approve hook mints clara.fa_depreciation stub rows effective-dated
  // there, so it is a period-dated machine poster — and it was outside the registry, which is
  // what let a lawful disposal reversal date its mirror at MYT today and brick the client's
  // whole depreciation sweep irreparably (the table is append-only).
  const stamps = (await rootQuery("select clara._wdb_period_stamps() as s")).rows[0].s;
  assert.deepEqual([...stamps].sort(),
    ["depreciation_charges", "fa_disposal", "recurring_adjustment"],
    "the registry names all three machine period stamps");

  // EVERY MACHINE POSTER IS INSIDE THE REGISTRY. Asked of pg_proc, so a fourth poster added
  // later cannot be outside it and still be green.
  const posters = ["_fa_run_period_core", "_adj_run_occurrence_core", "_adj_on_approve",
    "dispose_fixed_asset"];
  for (const p of posters) {
    const src = await rootQuery(
      "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname=$1", [p]);
    assert.equal(src.rows.length, 1, `${p} exists`);
    assert.ok(stamps.some((s) => src.rows[0].prosrc.includes(s)),
      `${p} mints a stamp that is IN the registry — a period-dated poster outside it is a correction-date and re-run hole by construction`);
  }

  // ...AND EVERY REGISTERED STAMP HAS A BOOKS ARM. The registry answers "which entries carry a
  // period-dated proposal"; the gate's p_stamp answers "which BOOKS hold the evidence". Round 7
  // measured the fail-open that appears when the second question is answered by falling through:
  // a stamp that passes the registry check and then reads the WRONG books answers "sound".
  const gateSrc = (await rootQuery(
    "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname='_wdb_rerun_breach'"
  )).rows[0].prosrc;
  for (const s of stamps) {
    assert.ok(gateSrc.includes(s),
      `the registered stamp ${s} is named by an arm of the re-run gate — an unclaimed stamp falls through to whichever arm is written last`);
  }

  // THE TWO FAMILIES ARE WHOLE. These are the counts the migration itself asserts; asserted
  // again from the test side because a census that only ever runs at apply time cannot catch a
  // later hand-edit on a live database.
  const dateDoors = await rootQuery(
    `select proname from pg_proc where pronamespace='clara'::regnamespace
       and prosrc like '%clara._wdb_correction_posting_date(%' order by proname`);
  assert.deepEqual(dateDoors.rows.map((r) => r.proname),
    ["_adv_release_one_way", "_adv_reversal_admission", "_pair_reverse_core", "reverse_entry"],
    "exactly the two correction DOORS this migration owns, plus the two advance-side READERS that must predict the mirror date the way those doors set it, consult the ONE correction-date authority (round 8, lane M3 — see s5-residuals.sql S5.15e (1) for each reader's classification)");
  const gateDoors = await rootQuery(
    `select proname from pg_proc where pronamespace='clara'::regnamespace
       and prosrc like '%clara._wdb_rerun_breach(%' order by proname`);
  assert.deepEqual(gateDoors.rows.map((r) => r.proname),
    ["_adj_oldest_unmet_period", "_adj_run_occurrence_core", "_fa_oldest_unmet_period", "_fa_run_period_core"],
    "BOTH posters and BOTH due oracles consult the ONE re-run gate — a fix that lands on one poster is the exact failure round 6 measured");

  // AN UNREGISTERED STAMP FAILS CLOSED. "Silently sound" is precisely how the depreciation
  // lane spent a whole round outside round 5's remedy.
  let err = null;
  try {
    await rootQuery("select clara._wdb_rerun_breach($1::uuid, 'closing_stock', null::text[], current_date, current_date)",
      ["00000000-0000-0000-0000-000000000000"]);
  } catch (e) { err = e; }
  assert.ok(err, "an unregistered period stamp RAISES");
  assert.equal(err.code, "CLR10");
  assert.equal(JSON.parse(err.detail).reason, "period_stamp_unregistered");

  // THE SCOPE PROOF, from the other side: an entry carrying NO registered stamp gets its
  // caller's default back, byte-identically. This is what keeps the widened authority from
  // becoming a global re-dating of every reversal in the product.
  const plain = await rootQuery(
    `select clara._wdb_correction_posting_date(null::uuid, date '2001-02-03')::text as d`);
  assert.equal(plain.rows[0].d, "2001-02-03",
    "an entry outside the registry hands the caller's own default straight back");
});
