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
