// #973 [0248] — FOLD `preview_depreciation_run`'S DUPLICATED LEG-PAIRING AGGREGATION INTO
// `clara._fa_run_period_core`'S OWN, BOTH NOW THROUGH ONE ROUTINE.
//
//   p973.core.shape   the new routine `clara._fa_depreciation_leg_pairing(jsonb)` exists, is
//                      OWNED by clara_fn_owner, `stable`, and UNGRANTED — PUBLIC and every named
//                      application role are denied EXECUTE. This is the VACUITY ANCHOR: it reds
//                      against 0227 alone (the routine does not exist yet) and against a
//                      vacuously-added routine that nobody revoked from public.
//   p973.core.pairs   the routine's own arithmetic, called directly (root, since it is ungranted):
//                      TWO different (expense, accumulated) pairs in one charge set come back as
//                      FOUR legs, grouped by the PAIR and not by either account alone, in
//                      (expense, accumulated) order — an independent, hand-computed expectation.
//   p973.callers.recut both recut bodies now CALL the shared routine, and the raw duplicated
//                      fragment #651's own tail (0227 §I, T.13) bound is GONE from both — the
//                      fragment survives in EXACTLY ONE clara function afterwards: the new core.
//   p973.behaviour.two_pairs  THE BEHAVIOURAL PROOF, at the public seam neither #651 cell reaches:
//                      #651's own `p651.preview.matches_run` uses a single account pair, which
//                      cannot tell "grouped by pair" from "grouped by expense account alone" —
//                      a bug the fold could introduce invisibly. A client with TWO chargeable
//                      assets under two DIFFERENT account pairs proves the preview shows four
//                      legs, hand-computed, and the run that follows posts the identical four.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA (`humanQuery` at its least-privileged floor
// via the shared #651 verb wrappers), except the two catalog cells, which read pg_proc as root —
// there is no persona-level door onto an ungranted internal core to begin with.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate973, FA_DEPRECIATION_LEG_FOLD_STEM, LEG_AGGREGATION_FRAGMENT, LEG_PAIRING_CALL,
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, x41EnsureReady,
  faWorld, p651Client, buyAsset, completeSL, liveAuthorityWithRef, backdateAuthorityFloor,
  previewRun, runManual, entryRowOf, approveEntry, entryLinesOf, upsertFaProfile,
  mon, dayIn, COST2, ACCUM2, EXPENSE2,
} from "./fa-depreciation-leg-fold-fixtures.mjs";

let live = false;
before(async () => { live = await x41EnsureReady(); });
after(async () => {
  printLaneNotes("fa-depreciation-leg-fold");
  printSkipCount("fa-depreciation-leg-fold");
  await endPool();
});

/** Every cell needs 0041 (the register), 0227 (#651's preview and poster) and 0248 (this fold). */
async function gate(t) {
  if (!live) {
    t.skip("0041 is not applied — the #973 battery is dormant");
    return true;
  }
  return gate973(t);
}

/** Run a period through the HUMAN door and settle the draft it leaves — copied from #651's own
 *  `runManualAndSettle` (depreciation-history.test.mjs:73), not exported from its fixtures. */
async function runManualAndSettle(client, period, { as = null, approveAs = null } = {}) {
  const w = await faWorld();
  const receipt = await runManual(as ?? w.users.bob,
    { client, periodStart: period.start, periodEnd: period.end });
  if (receipt.status === "noop") return { receipt, entryId: null };
  const e = await entryRowOf(receipt.entry_id);
  if (e.status === "draft") {
    await approveEntry(approveAs ?? w.users.alice,
      { entry: receipt.entry_id, expectedRevision: e.revision_token, opKey: opk("p973apr") });
  }
  return { receipt, entryId: receipt.entry_id };
}

// ===========================================================================================
// 1 · THE ROUTINE'S OWN SHAPE — VACUITY ANCHOR.
// ===========================================================================================

test("p973.core.shape clara._fa_depreciation_leg_pairing(jsonb) exists, is owned by clara_fn_owner, stable, and UNGRANTED — PUBLIC and every named application role are denied EXECUTE", async (t) => {
  if (await gate(t)) return;

  const mig = await rootQuery(
    "select version from clara.schema_migrations where version ~ $1", [FA_DEPRECIATION_LEG_FOLD_STEM]);
  assert.equal(mig.rows.length, 1,
    `exactly one applied ${FA_DEPRECIATION_LEG_FOLD_STEM} migration (got ${mig.rows.map((x) => x.version).join(",")})`);

  const fn = await rootQuery(
    `select p.provolatile, p.prosecdef, p.proowner::regrole::text as owner,
            'search_path=clara, pg_temp' = any(p.proconfig) as pinned_path
       from pg_proc p where p.oid = 'clara._fa_depreciation_leg_pairing(jsonb)'::regprocedure`);
  assert.equal(fn.rows.length, 1, "clara._fa_depreciation_leg_pairing(jsonb) exists");
  assert.equal(fn.rows[0].provolatile, "s", "…and is STABLE — the language itself refuses to let it write");
  assert.ok(fn.rows[0].prosecdef, "…SECURITY DEFINER, like every other ungranted FA internal core");
  assert.equal(fn.rows[0].owner, "clara_fn_owner", "…owned by clara_fn_owner, like its siblings");
  assert.ok(fn.rows[0].pinned_path, "…and its search_path is pinned");

  const acl = await rootQuery(
    `select count(*)::int as n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
      where p.oid = 'clara._fa_depreciation_leg_pairing(jsonb)'::regprocedure
        and a::text not like 'clara_fn_owner=%'`);
  assert.equal(acl.rows[0].n, 0, "no grant beyond the owner's own — an INTERNAL, granted to nobody");

  for (const role of ["clara_authenticated", "clara_runtime", "clara_agent_ro"]) {
    const has = await rootQuery(
      "select has_function_privilege($1, 'clara._fa_depreciation_leg_pairing(jsonb)'::regprocedure, 'EXECUTE') as ok",
      [role]);
    assert.equal(has.rows[0].ok, false, `${role} does NOT hold EXECUTE on the new core`);
  }
});

// ===========================================================================================
// 2 · THE ROUTINE'S OWN ARITHMETIC, CALLED DIRECTLY (root — it is ungranted; there is no
//     persona-level door onto it).
// ===========================================================================================

test("p973.core.pairs TWO different (expense, accumulated) pairs in one charge set come back as FOUR legs, grouped by the PAIR and not by either account alone, in (expense, accumulated) order", async (t) => {
  if (await gate(t)) return;

  const client = await p651Client("973_pairs");
  await upsertFaProfile((await faWorld()).users.alice,
    { client, assetAccount: COST2, accumAccount: ACCUM2, expenseAccount: EXPENSE2 });
  const start = mon(-3);
  const a = await buyAsset({ client, cents: 100_000, postingDate: dayIn(start, 1) });
  const b = await buyAsset({ client, cents: 500_000, postingDate: dayIn(start, 2), account: COST2 });

  // A HAND-COMPUTED expectation, independent of anything the routine itself derives: asset `a`
  // charges land on the COST/ACCUM/EXPENSE pair (2 charges, summed), asset `b` on the
  // COST2/ACCUM2/EXPENSE2 pair (1 charge) — two DISTINCT pairs, never merged by either account
  // alone even though nothing here shares an account code across the two.
  const charges = JSON.stringify([
    { asset_id: a.asset.id, amount_cents: 1_000 },
    { asset_id: a.asset.id, amount_cents: 2_000 },
    { asset_id: b.asset.id, amount_cents: 7_000 },
  ]);
  const r = await rootQuery(
    "select clara._fa_depreciation_leg_pairing($1::jsonb) as legs", [charges]);
  const legs = r.rows[0].legs;

  const expenseOf = a.asset.depr_expense_account_code < b.asset.depr_expense_account_code
    ? [a, b] : [b, a];
  assert.deepEqual(legs, [
    { account_code: expenseOf[0].asset.depr_expense_account_code,
      debit_cents: expenseOf[0] === a ? 3_000 : 7_000, credit_cents: 0 },
    { account_code: expenseOf[0].asset.accum_depr_account_code,
      debit_cents: 0, credit_cents: expenseOf[0] === a ? 3_000 : 7_000 },
    { account_code: expenseOf[1].asset.depr_expense_account_code,
      debit_cents: expenseOf[1] === a ? 3_000 : 7_000, credit_cents: 0 },
    { account_code: expenseOf[1].asset.accum_depr_account_code,
      debit_cents: 0, credit_cents: expenseOf[1] === a ? 3_000 : 7_000 },
  ], `two charges on one pair summed to 3,000 and one charge on the other pair at 7,000, four legs ordered by (expense, accumulated) code (got ${JSON.stringify(legs)})`);
});

// ===========================================================================================
// 3 · BOTH RECUT BODIES, OFF THE CATALOG — the VACUITY check that this is a FOLD, not an
//     "add a call and keep the old copy too" patch.
// ===========================================================================================

test("p973.callers.recut both clara._fa_run_period_core and clara.preview_depreciation_run now CALL clara._fa_depreciation_leg_pairing, and neither still carries the raw duplicated fragment #651's own tail (0227 T.13) bound", async (t) => {
  if (await gate(t)) return;

  const poster = await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = "
    + "'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure");
  const preview = await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = "
    + "'clara.preview_depreciation_run(uuid)'::regprocedure");
  assert.equal(poster.rows.length, 1);
  assert.equal(preview.rows.length, 1);

  // Normalized the SAME way the migration's own tail normalizes prosrc before comparing: line
  // comments stripped, lowercased, whitespace runs collapsed to one space.
  const normalize = (src) => src.replace(/--[^\n]*/g, "").toLowerCase().replace(/\s+/g, " ");

  for (const [name, src] of [["clara._fa_run_period_core", poster.rows[0].src],
    ["clara.preview_depreciation_run", preview.rows[0].src]]) {
    assert.ok(src.includes(LEG_PAIRING_CALL),
      `${name} calls ${LEG_PAIRING_CALL} (its body does not)`);
    assert.ok(!normalize(src).includes(LEG_AGGREGATION_FRAGMENT),
      `${name} no longer carries the raw duplicated fragment inline`);
  }

  // …and the fragment survives EXACTLY ONCE across the whole schema — inside the new core.
  const carriers = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and position($1 in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\\s+', ' ', 'g'))) <> 0`,
    ["join clara.fixed_assets f on f.id = (x ->> 'asset_id')::uuid group by 1, 2 order by 1, 2"]);
  assert.deepEqual(carriers.rows.map((r) => r.proname), ["_fa_depreciation_leg_pairing"],
    `exactly one clara function carries the leg-pairing fragment now (got ${JSON.stringify(carriers.rows)})`);
});

// ===========================================================================================
// 4 · THE BEHAVIOURAL PROOF, at the public seam — TWO account pairs, which #651's OWN
//     `p651.preview.matches_run` never exercises (it uses a single pair throughout, so it cannot
//     tell "grouped by the PAIR" from "grouped by the expense account alone").
// ===========================================================================================

test("p973.behaviour.two_pairs a client with TWO chargeable assets under TWO different account pairs: the preview shows FOUR legs, hand-computed, and the run that follows posts the identical four", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();
  const client = await p651Client("973_behaviour");
  await upsertFaProfile(w.users.alice,
    { client, assetAccount: COST2, accumAccount: ACCUM2, expenseAccount: EXPENSE2 });
  const start = mon(-3);

  // Asset A on the COST/ACCUM/EXPENSE pair: 360,000 / 36 months = 10,000/month.
  const a = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1) });
  await completeSL(client, a.asset.id, { life: 36, start: start.start, description: "p973 pair-a" });
  // Asset B on the COST2/ACCUM2/EXPENSE2 pair: 60,000 / 12 months = 5,000/month — a DIFFERENT
  // pair AND a different amount, so a mis-pairing (e.g. grouping by expense account alone,
  // which would still be correct here since the two never share one) or a mis-sum both show up
  // as a wrong account code or a wrong amount rather than accidentally cancelling out.
  const b = await buyAsset({ client, cents: 60_000, postingDate: dayIn(start, 2), account: COST2 });
  await completeSL(client, b.asset.id, { life: 12, start: start.start, description: "p973 pair-b" });

  const au = await liveAuthorityWithRef(client);
  await backdateAuthorityFloor(au.id, mon(-12).start);

  const pv = await previewRun(w.users.carol, client);
  assert.equal(pv.due, true, `the preview says a period is due (got ${JSON.stringify(pv)})`);
  assert.equal(pv.period_start, start.start, "…the period the two assets' own SL schedules start in");
  assert.equal(pv.charged_cents, 15_000, "10,000 (pair A) + 5,000 (pair B)");

  const HAND_COMPUTED = [
    { account_code: a.asset.depr_expense_account_code, debit_cents: 10_000, credit_cents: 0 },
    { account_code: a.asset.accum_depr_account_code, debit_cents: 0, credit_cents: 10_000 },
    { account_code: b.asset.depr_expense_account_code, debit_cents: 5_000, credit_cents: 0 },
    { account_code: b.asset.accum_depr_account_code, debit_cents: 0, credit_cents: 5_000 },
  ];
  assert.deepEqual(pv.legs, HAND_COMPUTED,
    `four legs, one debit/credit pair per asset's own account pair, NEVER merged across pairs (got ${JSON.stringify(pv.legs)})`);

  const { receipt } = await runManualAndSettle(client, { start: pv.period_start, end: pv.period_end });
  assert.equal(receipt.charged_cents, pv.charged_cents,
    "the RUN charges exactly what the preview showed");
  const lines = await entryLinesOf(receipt.entry_id);
  assert.deepEqual(
    lines.map((l) => ({ account_code: l.account_code, debit_cents: Number(l.debit_cents), credit_cents: Number(l.credit_cents) })),
    HAND_COMPUTED,
    "…and the posted entry's own lines are the SAME four, in the same order, to the sen — the two-pair case #651's single-pair regression cannot see");
});
