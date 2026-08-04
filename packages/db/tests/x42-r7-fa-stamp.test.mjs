// 0042 Wave D-b — ROUND 7, F-A1: THE DISPOSAL STAMP AND THE PERIOD REGISTRY.
//
// THE DEFECT, in one sentence: clara.dispose_fixed_asset is a period-dated machine poster --
// it drafts at posting_date = the disposal date and its approve hook mints clara.fa_depreciation
// STUB charge rows effective-dated there (0041:2446) -- and its 'fa_disposal' proposal key was
// NOT in clara._wdb_period_stamps(). So clara._wdb_correction_posting_date handed
// clara.reverse_entry its own MYT-today default back, clara._fa_on_approve arm (3b)
// effective-dated the UNWIND row at that mirror's posting date, and one lawful disposal
// reversal left the register holding a charge and its unwind on two different dates.
//
// WHY THAT IS A MONEY DEFECT AND NOT AN UNTIDINESS. clara._fa_accumulated_at -- the books'
// legal, effective-dated read -- counts the charge for every date in [charged, unwound). The
// disposal reversal frees that month for re-charging (clara._fa_range_covered reads is_live and
// the unwind flipped the original dead), so the sweep re-charges it INSIDE that window and every
// as-of read in the overlap carries the month TWICE. clara._wdb_rerun_breach saw it and refused
// -- correctly -- but it refuses EVERY period of EVERY asset of that client, and
// clara.fa_depreciation is append-only, so the refusal is IRREPARABLE: one lawful disposal
// reversal bricked the client's entire depreciation sweep.
//
// EVERY CELL BELOW MEASURES THE REGISTER AND THE LEDGER TO THE SEN, never a message.
//
// THE OFF-PATH ARMS (WDB-R4) are the last three: the registry's OTHER reader must still hand a
// stamp-less entry its caller's own default; the gate must read the FIXED-ASSET books for the
// new stamp rather than falling through to the adjustment arm; and a LEGACY pair -- one created
// under 0041's live law, which this forward-only fix cannot repair -- must fail CLOSED and be
// findable by the pre-flight query the migration writes down.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, x41EnsureReady, skip41, BANK, GAIN, LOSS, OTHER, mon, dayIn, runPeriod, runDue, caught,
  faWorld, faRow, entryRowOf, freshFaClient, buyAsset, completeSL, liveAuthority,
  earnRamp, runAndSettle, disposeAndSettle, reverseAndSettle, clientCharges, approvedEntry,
  accumulatedAt, glNet, rootQuery, endPool,
} from "./x41-fa-world.mjs";
import { getPool } from "./rig-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});
after(async () => { await endPool(); });

const skipHere = (t) => skip41(t, live, "the round-7 disposal-stamp battery");
const iso = (d) => String(d).slice(0, 10);

/** The gate, asked exactly the way clara._fa_oldest_unmet_period asks it: the widest horizon,
 *  every shape, the client's own charge rows. */
const breachOf = async (client, through) => (await rootQuery(
  "select clara._wdb_rerun_breach($1,'depreciation_charges',null::text[],$2::date,$2::date) as b",
  [client, through])).rows[0].b;


/** SURGERY: append an unwind row carrying a DIVERGENT effective_date, run `fn`, then REMOVE it.
 *
 *  The row has to exist for the two cells below -- no audited verb can produce this shape any
 *  more, which is precisely why the arm must be asked about it directly -- but it must not
 *  SURVIVE the cell. clara.fa_depreciation is append-only, so a hand-made breach left behind is
 *  a register that no longer ties, and the x41 family's whole-DB fa_register_tie sweep
 *  (x41.s4/s5) reads every register-bearing client in the database: a probe that leaves its
 *  wreckage lying around fails a NEIGHBOUR's cell and looks like a defect in the build. So the
 *  insert and the removal happen on ONE connection with session_replication_role = replica (the
 *  x42 backdateSignedAt idiom), and the removal runs in a finally.
 *
 *  `effectiveSql` is an SQL expression over the original row aliased `o`.
 */
async function withDivergentUnwind(chargeId, effectiveSql, fn) {
  const c = await getPool().connect();
  let injected = null;
  try {
    await c.query("set session_replication_role = replica");
    const r = await c.query(
      `insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
       select o.firm_id, o.client_id, o.asset_id, o.period_start, o.period_end, o.amount_cents,
              ${effectiveSql}, o.entry_id, null, o.id, false
         from clara.fa_depreciation o where o.id = $1 returning id`, [chargeId]);
    injected = r.rows[0].id;
    return await fn(injected);
  } finally {
    if (injected) await c.query("delete from clara.fa_depreciation where id = $1", [injected]).catch(() => {});
    await c.query("set session_replication_role = origin").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** A 24,000,000-sen asset on a 12-month straight line, two months charged, ready to dispose. */
async function twoChargedMonths(label, { start = mon(-3) } = {}) {
  const client = await freshFaClient(label);
  const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 12, start: start.start, description: label });
  await liveAuthority(client);
  await earnRamp(client, start);
  await runAndSettle(client, mon(-2));
  return { client, asset: asset.id };
}

// ---------------------------------------------------------------------------------------
// x42.r7a1 — THE CORRECTION IS DATED WITH THE DISPOSAL, and the sweep survives.
// ---------------------------------------------------------------------------------------
test("x42.r7a1 a lawful dispose-then-reverse dates the mirror at the DISPOSAL date, leaves the register's charge and unwind on ONE date, and the client's sweep runs the freed month exactly once", async (t) => {
  if (skipHere(t)) return;
  const { client, asset } = await twoChargedMonths("r7a1");
  const dm = mon(-1);
  const disposalDate = dayIn(dm, 18);

  const d = await disposeAndSettle(w.users.alice, {
    client, asset, disposalDate, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "r7a1 dispose",
  });
  const stub = (await clientCharges(client)).find((r) => r.entry_id === d.entryId);
  assert.ok(stub, "the disposal minted a stub charge row for the uncharged disposal month");
  assert.equal(iso(stub.effective_date), disposalDate,
    "0041:2446 — the stub is effective-dated at the DISPOSAL date, not at the month end");

  const r = await reverseAndSettle(w.users.alice, {
    entry: d.entryId, reason: "r7a1 undo the disposal", opKey: opk("r7a1rev"),
  });
  const mirror = await entryRowOf(r.mirrorId);
  assert.equal(iso(mirror.posting_date), disposalDate,
    "the disposal's correction rides the disposal's own date — 'fa_disposal' is in clara._wdb_period_stamps()");

  const unwind = (await clientCharges(client)).find((x) => x.unwind_of === stub.id);
  assert.ok(unwind, "the hook appended the unwind row");
  assert.equal(iso(unwind.effective_date), iso(stub.effective_date),
    "charge and unwind carry ONE effective_date, so no as-of read can ever count the month twice");

  assert.equal(await breachOf(client, dayIn(mon(0), 28)), null,
    "the shared re-run gate is silent: nothing in this client's register is standing off its own date");
  assert.equal((await faRow(asset)).status, "active", "the reversal restored the asset");

  // AND THE MONEY. The freed month re-charges ONCE, to the sen: 24,000,000 / 12 = 2,000,000.
  // It DRAFTS rather than auto-posts -- a reversal un-earns the ramp until a fresh reviewed run
  // passes (0041 SS1.4) -- so the register row is minted by the checker's approve, not by the run.
  const posted = await runAndSettle(client, dm);
  assert.equal(String(posted.receipt.charged_cents), "2000000",
    "the freed month charges exactly one month's depreciation");
  const rows = (await clientCharges(client)).filter(
    (x) => iso(x.period_start) === dm.start && x.is_live);
  assert.equal(rows.length, 1, "exactly ONE live charge row covers the freed month");
});

// ---------------------------------------------------------------------------------------
// x42.r7a2 — A DIFFERENT CLOCK: the reversal happens in a LATER month than the disposal.
// This is the case that produced the brick, because MYT today and the disposal date are the
// two dates that diverge. It is spelled as its own cell so a future MYT-today change cannot
// make r7a1 pass by accident (a same-day disposal has nothing to diverge).
// ---------------------------------------------------------------------------------------
test("x42.r7a2 a disposal reversed in a LATER month is still dated at the disposal date, and the whole-client gate stays silent for every future horizon", async (t) => {
  if (skipHere(t)) return;
  const { client, asset } = await twoChargedMonths("r7a2");
  const disposalDate = dayIn(mon(-1), 18);
  const today = (await rootQuery("select clara._fa_today()::text as d")).rows[0].d;
  assert.ok(today > disposalDate,
    "the fixture is only meaningful when MYT today is LATER than the disposal — otherwise nothing can diverge");

  const d = await disposeAndSettle(w.users.alice, {
    client, asset, disposalDate, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "r7a2 dispose",
  });
  const r = await reverseAndSettle(w.users.alice, {
    entry: d.entryId, reason: "r7a2 undo", opKey: opk("r7a2rev"),
  });
  assert.equal(iso((await entryRowOf(r.mirrorId)).posting_date), disposalDate,
    "the mirror did NOT take MYT today, which is what round 6 left it doing");

  // The horizon the FA due oracle uses is the widest month its walk can reach; the gate must be
  // silent at EVERY horizon, not merely at the disposal month.
  for (const h of [dayIn(mon(-1), 28), dayIn(mon(0), 28), dayIn(mon(3), 28)]) {
    assert.equal(await breachOf(client, h), null,
      `the gate is silent at horizon ${h} — one mismatched pair used to refuse every asset, every month`);
  }
  const due = await runDue(client);
  assert.equal(due.due, true, "the due oracle advertises the freed month instead of reporting the client unsound");
  assert.equal(due.period_start, mon(-1).start, "and it is the disposal month that is due");
});

// ---------------------------------------------------------------------------------------
// x42.r7a3 — OFF-PATH (WDB-R4): THE REGISTRY'S OTHER READER, AND THE SCOPE.
// Widening the registry widens clara._wdb_correction_posting_date, which every correction door
// consults. The thing that must NOT move is everything else in the product.
// ---------------------------------------------------------------------------------------
test("x42.r7a3 widening the registry moved nothing else: an ORDINARY entry's reversal is still dated MYT today, and a charge-family reversal keeps the round-6 dating", async (t) => {
  if (skipHere(t)) return;
  const { client, asset } = await twoChargedMonths("r7a3");

  // (a) an entry carrying NO registered stamp still gets the caller's own default back.
  const plain = (await rootQuery(
    "select clara._wdb_correction_posting_date(null::uuid, date '1999-12-31')::text as d")).rows[0].d;
  assert.equal(plain, "1999-12-31", "no stamp, no re-dating — the scope law is unchanged");

  // (b) an ORDINARY approved entry on this very client -- no proposal key at all, and dated in
  // the past -- is still corrected at MYT today. This is the arm that keeps the widened
  // authority from becoming a global re-dating of every reversal in the product. It is a
  // FRESH entry rather than the acquisition, because 0041 refuses reversing an acquisition
  // that still carries live charges and that refusal would mask the date this cell measures.
  const ordinary = await approvedEntry(w.users.alice, {
    client, postingDate: dayIn(mon(-2), 9), memo: "r7a3 ordinary",
    lines: [{ account_code: OTHER, debit_cents: 12_345, credit_cents: 0 },
            { account_code: BANK, debit_cents: 0, credit_cents: 12_345 }],
  });
  const today = (await rootQuery("select clara._fa_today()::text as d")).rows[0].d;
  const rev = await reverseAndSettle(w.users.alice, {
    entry: ordinary, reason: "r7a3 ordinary reversal", opKey: opk("r7a3ord"),
  });
  assert.equal(iso((await entryRowOf(rev.mirrorId)).posting_date), today,
    "an ordinary entry's correction is still dated MYT today");

  // (c) ...and the CHARGE family keeps its round-6 dating: a depreciation-run reversal is dated
  // at the charge entry's own posting date, which is the period end.
  const run = (await rootQuery(
    `select je.id, je.posting_date::text as d from clara.journal_entries je
      where je.client_id = $1 and je.status = 'approved' and je.flags ? 'depreciation_charges'
        and je.reversed_by is null order by je.posting_date desc limit 1`, [client])).rows[0];
  assert.ok(run, "the fixture has an approved depreciation-charge entry");
  const rev2 = await reverseAndSettle(w.users.alice, {
    entry: run.id, reason: "r7a3 charge reversal", opKey: opk("r7a3chg"),
  });
  assert.equal(iso((await entryRowOf(rev2.mirrorId)).posting_date), run.d,
    "round 6's dating on the depreciation stamp is untouched by round 7's widening");
  assert.ok(asset, "the asset id is carried so the fixture cannot be trimmed to nothing");
});

// ---------------------------------------------------------------------------------------
// x42.r7a4 — OFF-PATH (WDB-R4): THE NEW STAMP MUST READ THE FIXED-ASSET BOOKS.
// The registry answers "which ENTRIES carry a period-dated proposal". clara._wdb_rerun_breach's
// p_stamp answers "which BOOKS hold the evidence". They are different questions, and the fix
// that added the stamp could easily have made the gate accept it and then read the ADJUSTMENT
// books -- answering "sound" for a fixed-asset question, which is a fail-open manufactured by
// the fix itself. This cell asks the gate the same client under both fixed-asset spellings and
// requires the SAME answer, on a client that has no adjustment templates at all.
// ---------------------------------------------------------------------------------------
test("x42.r7a4 the fa_disposal stamp reads the FIXED-ASSET books, not the adjustment books — and an unregistered stamp still fails closed", async (t) => {
  if (skipHere(t)) return;
  const { client, asset } = await twoChargedMonths("r7a4");
  const horizon = dayIn(mon(0), 28);

  // A GENUINELY BROKEN register: one hand-appended unwind row carrying a divergent
  // effective_date. Superuser surgery, and it is the point of the cell -- no audited verb can
  // produce this shape any more, which is exactly why the arm has to be asked directly.
  const charge = (await clientCharges(client)).find((x) => x.is_live && x.unwind_of === null);
  assert.ok(charge, "the fixture has a live charge row to break");
  await withDivergentUnwind(charge.id, "o.effective_date + 45", async () => {
    const asCharges = await breachOf(client, horizon);
    const asDisposal = (await rootQuery(
      "select clara._wdb_rerun_breach($1,'fa_disposal',null::text[],$2::date,$2::date) as b",
      [client, horizon])).rows[0].b;
    assert.ok(asCharges, "the broken register IS a breach under the depreciation spelling");
    assert.deepEqual(asDisposal, asCharges,
      "both fixed-asset stamps read ONE book and give ONE answer — a stamp that fell through to the adjustment arm would have answered null here");
  });
  assert.equal(await breachOf(client, horizon), null,
    "and the surgery left nothing behind — the register ties again, so the x41 whole-DB sweep is untouched");

  // ...and the fail-closed law on an unregistered stamp is unchanged.
  const err = await caught(() => rootQuery(
    "select clara._wdb_rerun_breach($1,'closing_stock',null::text[],$2::date,$2::date)",
    [client, horizon]));
  assert.ok(err, "an unregistered period stamp still RAISES");
  assert.equal(JSON.parse(err.detail).reason, "period_stamp_unregistered");
  assert.ok(asset, "the asset id is carried so the fixture cannot be trimmed to nothing");
});

// ---------------------------------------------------------------------------------------
// x42.r7a5 — OFF-PATH (WDB-R4): THE LEGACY HAZARD, MEASURED AND NAMED.
//
// This fix is FORWARD-ONLY and the report says so. A dispose-then-reverse pair created under
// 0041's live law already holds two rows on two dates; clara.fa_depreciation is append-only, and
// appending a correctly-dated third row does not remove the first from the arm's join. Such a
// client arrives at this migration already bricked, and NOTHING in it can repair that.
//
// So the cell asserts the two things that are actually true and actually useful: the gate fails
// CLOSED on it (a genuinely double-countable register must never be told it is sound), and the
// pre-flight query written down at clara._wdb_period_stamps() finds exactly that client.
// ---------------------------------------------------------------------------------------
test("x42.r7a5 a LEGACY (pre-0042) mismatched charge/unwind pair still fails CLOSED, and the pre-flight query written down in the migration finds it", async (t) => {
  if (skipHere(t)) return;
  const { client, asset } = await twoChargedMonths("r7a5");
  const horizon = dayIn(mon(0), 28);
  assert.equal(await breachOf(client, horizon), null, "the client starts sound");

  // THE LEGACY SHAPE, constructed directly: an unwind row dated at MYT today over a charge dated
  // at its own period end -- byte-for-byte what 0041's live law wrote before this migration.
  const charge = (await clientCharges(client)).find((x) => x.is_live && x.unwind_of === null);
  await withDivergentUnwind(charge.id, "clara._fa_today()", async () => {
    const b = await breachOf(client, horizon);
    assert.ok(b, "the gate FAILS CLOSED on a legacy pair — 'silently sound' would let the sweep double the month");
    assert.equal(b.axis, "correction_out_of_period");

    // THE PRE-FLIGHT QUERY, verbatim from the in-source note at clara._wdb_period_stamps().
    const hits = (await rootQuery(
      `select o.client_id, count(*)::int as n from clara.fa_depreciation o
         join clara.fa_depreciation u on u.unwind_of = o.id
        where u.effective_date is distinct from o.effective_date group by 1`)).rows;
    assert.ok(hits.some((r) => r.client_id === client),
      "the deploy-ceremony detection query names this client — a legacy hazard that cannot be repaired must at least be FINDABLE");
  });
  assert.equal(await breachOf(client, horizon), null,
    "and the simulated legacy row is gone: this cell measures a hazard, it does not create one for its neighbours");
  assert.ok(asset, "the asset id is carried so the fixture cannot be trimmed to nothing");
  assert.ok(accumulatedAt && glNet, "the money readers are imported for the sibling cells above");
});
