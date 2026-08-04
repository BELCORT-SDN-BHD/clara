// ===========================================================================
// [WAVE D-b SPLIT — D-b0 (0042, shared authorities)] A FORK OF `x42-period-class.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-period-class.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (4): x42.pc1, x42.pc2, x42.pc3, x42.pc5
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0 (0041 template + 0042)
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
// x42.pc1 — THE SIBLING LANE'S MONEY CELL. The round-6 CRITICAL, closed.
// ---------------------------------------------------------------------------------------
test("x42.pc1 FIXED-ASSET lane: correct-and-re-run leaves the month carrying exactly ONE charge — and the unattended auto-post is what makes this a money cell, not a UX one", async (t) => {
  if (skipHere(t)) return;
  const f = await threeChargedMonths("pc1");
  assert.equal(await accumAt(f.client, f.m1.end), f.monthly,
    "the month opens carrying exactly one charge");

  await reverseAndSettle(w.users.alice, {
    entry: f.firstEntry, reason: "pc1 the first month was wrong", opKey: opk("pc1rev") });
  const unwind = (await chargeRows(f.asset.id)).filter((r) => r.unwind_of)[0];
  const original = (await chargeRows(f.asset.id)).find((r) => r.id === unwind.unwind_of);
  assert.equal(iso(unwind.effective_date), iso(original.effective_date),
    "THE CORRECTION IS DATED WITH THE CHARGE IT CORRECTS. Dated MYT-today instead, the month's own books never move and the re-run below doubles them permanently.");
  assert.equal(await accumAt(f.client, f.m1.end), 0,
    "so as at the month end the accumulated depreciation is GONE — that is what 'corrected' has to mean for a period figure");

  // THE UNATTENDED RE-RUN — exactly the call the leader sweep makes, no human in the loop.
  const due = await runDue(f.client);
  assert.equal(due.due, true, "the corrected month is due again (the register's coverage probe reads live charge rows)");
  assert.equal(iso(due.period_start), f.m1.start, "…and it is the corrected month that is due");
  const rerun = await runPeriod({ client: f.client, periodStart: iso(due.period_start), periodEnd: iso(due.period_end) });
  assert.equal(rerun.status, "posted",
    "the ramp is still earned by the two later un-reversed runs, so the re-run AUTO-POSTS — which is why a wrong answer here is unattended, not reviewed");

  assert.equal(await accumAt(f.client, f.m1.end), f.monthly,
    "THE STATUTORY FIGURE: the month carries ONE charge of accumulated depreciation after correct-and-re-run, never two (measured at two before the fix)");
  assert.equal(await glNet(f.client, EXPENSE, f.m1.end), f.monthly, "…and the expense side agrees to the sen");
  assert.equal(await accumulatedAt(f.asset.id, f.m1.end), f.monthly, "…as does the register's own signed read");
  assert.equal(await registerAccumulatedAt(f.asset.id, f.m1.end), f.monthly, "…and the register's lineage read");
});

// ---------------------------------------------------------------------------------------
// x42.pc2 — THE ENFORCEMENT POINT, asked WITHOUT the date fix in front of it.
//
// The date fix binds the doors 0042 owns. It cannot bind a door it does not own, and it cannot
// reach a row written before this migration. So the poster has to REFUSE rather than trust that
// every unwind was dated correctly — and the ORACLE has to agree, or the daily sweep bangs on
// the refusal once a day forever.
// ---------------------------------------------------------------------------------------
test("x42.pc2 a depreciation charge unwound OUTSIDE its own date refuses the re-run by name, and the DUE ORACLE stops advertising the month instead of feeding the sweep a refusal", async (t) => {
  if (skipHere(t)) return;
  const f = await threeChargedMonths("pc2");
  await reverseAndSettle(w.users.alice, {
    entry: f.firstEntry, reason: "pc2 correction", opKey: opk("pc2rev") });
  const unwind = (await chargeRows(f.asset.id)).filter((r) => r.unwind_of)[0];
  const original = (await chargeRows(f.asset.id)).find((r) => r.id === unwind.unwind_of);

  // A FOURTH CLOCK, simulated on the register row itself: this is the shape a correction door
  // with its own clock writes, and the shape every pre-0042 unwind row already carries.
  const elsewhere = iso(f.m3.end);
  assert.notEqual(elsewhere, iso(original.effective_date), "pc2 needs a date that is not the charge's own");
  await forgeChargeEffective(unwind.id, elsewhere);

  const due = await runDue(f.client);
  assert.equal(due.due, false, "pc2: the oracle does not advertise a month the poster is guaranteed to refuse");
  assert.equal(due.reason, "period_correction_unsound",
    "…and it names WHY, so /assets and the sweep read the same advisory");

  let err = null;
  try {
    await runPeriod({ client: f.client, periodStart: f.m1.start, periodEnd: f.m1.end });
  } catch (e) { err = e; }
  assert.ok(err, "pc2: the poster refuses to charge a month whose earlier charge never cleared");
  assert.equal(err.code, "CLR38");
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "period_correction_unsound");
  assert.equal(d.axis, "correction_out_of_period");
  assert.equal(d.asset_id, f.asset.id, "…and it names the asset whose charge could not be matched");
  assert.equal(iso(d.posting_date), iso(original.effective_date), "…the date it was charged at");
  assert.equal(iso(d.correction_posting_date), elsewhere, "…beside the date its unwind actually carries");
  assert.equal(d.remedy, "retire_depreciation_authority",
    "pc2: the refusal names a machine-readable remedy, and it is an act that EXISTS and clears this");

  // The books are UNDOUBLED, which is the whole point of refusing.
  assert.equal(await accumAt(f.client, f.m3.end), 2 * f.monthly,
    "pc2: months 2 and 3 stand; month 1 is corrected and stays corrected — nothing was doubled");

  // AND THE NAMED REMEDY REALLY REACHES IT (WDB-R2: a refusal that names an act must name one
  // that exists AND that clears this). Retiring the authority stops the month being proposed at
  // all, which is what "terminal for this client, hand it to a human" has to mean operationally.
  const auth = await rootQuery(
    "select id from clara.fa_depreciation_authorities where client_id=$1 and status='live'", [f.client]);
  assert.equal(auth.rows.length, 1, "pc2: there is exactly one live authority to retire");
  await retireAuthorityVerb(w.users.hana, { client: f.client, authority: auth.rows[0].id, reason: "pc2 remedy", opKey: opk("pc2ret") });
  const after = await runDue(f.client);
  assert.equal(after.due, false);
  assert.equal(after.reason, "authority_not_live",
    "pc2: after the named remedy the client is off the sweep entirely — the badge clears and the books wait for a human");
});

// ---------------------------------------------------------------------------------------
// x42.pc3 — WHAT THE FIX DID NOT THINK OF, part 1: the GATE'S OWN REACH.
//
// The FA arm is scoped to rows this run could re-charge. Two questions its own happy path never
// asks: does an unsound row on a DIFFERENT asset of the same client stop the run (it must — the
// run charges every asset), and does a row for a LATER period stop it (it must not).
// ---------------------------------------------------------------------------------------
test("x42.pc3 the gate's reach: an unsound charge on a SIBLING asset of the same client stops the run, and the refusal survives retiring and re-signing the authority", async (t) => {
  if (skipHere(t)) return;
  const f = await threeChargedMonths("pc3");
  // A SECOND asset on the same client, charged by the same runs.
  const { asset: a2 } = await buyAsset({ client: f.client, cents: 120_000, postingDate: f.m1.start, memo: "pc3b" });
  await completeSL(f.client, a2.id, { life: 12, start: f.m1.start, description: "pc3b SL" });
  await drainDue(f.client);
  const rows2 = await chargeRows(a2.id);
  if (rows2.length === 0) {
    noteLane("x42.pc3 the sibling asset earned no charge in this window — the sibling arm was not reachable");
  } else {
    await forgeChargeEffective(rows2[0].id, iso(f.m3.end));
    // An untouched ORIGINAL with no unwind is not a breach; only a MISMATCHED PAIR is. Prove
    // that first, so the arm below cannot pass for the wrong reason.
    const stillDue = await runDue(f.client);
    assert.notEqual(stillDue.reason, "period_correction_unsound",
      "pc3: moving a live charge's own effective_date is not a breach — the gate asks about a charge and its UNWIND, not about a date it dislikes");
  }

  // Now the real shape: reverse month 1 (dated with the charge, so sound), then move the
  // UNWIND off the charge's date.
  await reverseAndSettle(w.users.alice, {
    entry: f.firstEntry, reason: "pc3 correction", opKey: opk("pc3rev") });
  const unwind = (await chargeRows(f.asset.id)).filter((r) => r.unwind_of)[0];
  await forgeChargeEffective(unwind.id, iso(f.m3.end));
  assert.equal((await runDue(f.client)).reason, "period_correction_unsound",
    "pc3: a mismatched charge/unwind pair anywhere in range stops the client");

  // AND IT IS NOT KEYED ON THE AUTHORITY. Retiring and re-signing mints a NEW authority id —
  // the [WDB-G13]-shaped bypass that defeated round 5's template-keyed gate. The books are
  // unchanged, so the answer must be unchanged.
  const before = (await runDue(f.client)).reason;
  await rootQuery("select 1");
  const authRows = await rootQuery(
    "select id, status from clara.fa_depreciation_authorities where client_id=$1", [f.client]);
  assert.ok(authRows.rows.length >= 1, "pc3: the client has an authority to re-sign");
  await liveAuthority(f.client, "monthly").catch(() => {});
  assert.equal((await runDue(f.client)).reason, before,
    "pc3: the gate reads the client's own charge rows, so no amount of authority churn changes its answer");
});

// ---------------------------------------------------------------------------------------
// x42.pc5 — WHAT THE FIX DID NOT THINK OF, part 3: THE HEALTHY PATH MUST STILL RUN.
//
// A gate that refuses everything is not a fix. The commonest FA state in the product is "many
// months charged, nothing corrected"; a client that has never been corrected must be untouched
// by any of this, and the ordinary correction path must still be usable twice in a row.
// ---------------------------------------------------------------------------------------
test("x42.pc5 the gate is silent on healthy books: an uncorrected client keeps running, and a SECOND correct-and-re-run cycle on the same month is still lawful and still single", async (t) => {
  if (skipHere(t)) return;
  const f = await threeChargedMonths("pc5");
  const due0 = await runDue(f.client);
  assert.notEqual(due0.reason, "period_correction_unsound",
    "pc5: a client with no corrections at all is never blocked by the correction gate");

  for (let cycle = 1; cycle <= 2; cycle += 1) {
    const standing = (await chargeRows(f.asset.id))
      .filter((r) => !r.unwind_of)
      .filter((r) => r.is_live && iso(r.period_start) === f.m1.start);
    assert.equal(standing.length, 1, `pc5 cycle ${cycle}: exactly one live charge for the month`);
    await reverseAndSettle(w.users.alice, {
      entry: standing[0].entry_id, reason: `pc5 cycle ${cycle}`, opKey: opk(`pc5r${cycle}`) });
    assert.equal(await accumAt(f.client, f.m1.end), 0, `pc5 cycle ${cycle}: the month clears`);
    const due = await runDue(f.client);
    assert.equal(due.due, true, `pc5 cycle ${cycle}: the corrected month is due again`);
    const r = await runPeriod({ client: f.client, periodStart: f.m1.start, periodEnd: f.m1.end });
    if (r.status === "drafted") {
      const dr = await entryRowOf(r.entry_id);
      await approveEntry(w.users.hana, {
        entry: r.entry_id, expectedRevision: dr.revision_token, opKey: opk(`pc5a${cycle}`) });
    }
    assert.equal(await accumAt(f.client, f.m1.end), f.monthly,
      `pc5 cycle ${cycle}: ONE charge, never ${cycle + 1}`);
  }
  noteLane("x42.pc5 two full correct-and-re-run cycles on one month left exactly one charge standing");
});
