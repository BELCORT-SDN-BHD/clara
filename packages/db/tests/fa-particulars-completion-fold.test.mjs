// #976 [0249] — FOLD THE DUPLICATED FIXED-ASSET PARTICULARS COMPLETION WALL SHARED BY
// `clara.complete_fixed_asset_particulars` AND `clara._fa_complete_particulars_core` INTO ONE
// ROUTINE, `clara._fa_assert_particulars_completable`.
//
//   p976.core.shape         the new routine exists, is OWNED by clara_fn_owner, `stable`, and
//                           UNGRANTED — PUBLIC and every named application role are denied
//                           EXECUTE. This is the VACUITY ANCHOR: it reds against 0248 alone (the
//                           routine does not exist yet) and against a vacuously-added routine
//                           that nobody revoked from public.
//   p976.callers.recut      both recut bodies now CALL the shared routine, and the raw
//                           duplicated fragments (the "first completion is not a change" check
//                           and the "already complete" check onward) are GONE from both — each
//                           fragment survives in EXACTLY ONE clara function afterwards: the new
//                           core.
//   p976.behaviour.already_complete_both_doors  THE BEHAVIOURAL PROOF, at the public seam
//                           neither #651 cell reaches: nothing in this repo's existing suite
//                           ever drove the "already complete" refusal through EITHER completion
//                           door (measured: `grep -rn fa_particulars_already_complete
//                           *.test.mjs` returns nothing before this file). A client completes
//                           one asset through the HUMAN door, then a second completion attempt
//                           on the SAME asset through the HUMAN door is refused
//                           fa_particulars_already_complete; a second asset completes through
//                           the RUNTIME door, then a second attempt on IT through the RUNTIME
//                           door is refused the SAME way — same code, same detail shape, proving
//                           AC3 for the refusal #651's own regression never exercised.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA (`humanQuery` / `roleQuery(ROLES.runtime)`
// via the shared #651 verb wrappers `completeWith` / `completeForWith`), except the two catalog
// cells, which read pg_proc as root — there is no persona-level door onto an ungranted internal
// core to begin with.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate976, FA_PARTICULARS_COMPLETION_FOLD_STEM, FRAG_CHANGE_CLASS, FRAG_ALREADY_COMPLETE,
  PARTICULARS_WALL_CALL,
  rootQuery, endPool, printLaneNotes, printSkipCount, x41EnsureReady,
  faWorld, p651Client, buyAsset, completeWith, completeForWith, faRow,
  refuses, caught, reasonToken, mon, dayIn,
} from "./fa-particulars-completion-fold-fixtures.mjs";

/** A minimal straight-line particulars object, copied from depreciation-history.test.mjs's own
 *  local `SL` helper (not exported) — this battery needs no other method. */
const SL = (start) => ({ method: "straight_line", useful_life_months: 36, residual_cents: 0, start_date: start });

let live = false;
before(async () => { live = await x41EnsureReady(); });
after(async () => {
  printLaneNotes("fa-particulars-completion-fold");
  printSkipCount("fa-particulars-completion-fold");
  await endPool();
});

/** Every cell needs 0041 (the register), 0216/0227 (the two completion doors) and 0249 (this fold). */
async function gate(t) {
  if (!live) {
    t.skip("0041 is not applied — the #976 battery is dormant");
    return true;
  }
  return gate976(t);
}

// ===========================================================================================
// 1 · THE ROUTINE'S OWN SHAPE — VACUITY ANCHOR.
// ===========================================================================================

test("p976.core.shape clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb) exists, is owned by clara_fn_owner, stable, and UNGRANTED — PUBLIC and every named application role are denied EXECUTE", async (t) => {
  if (await gate(t)) return;

  const mig = await rootQuery(
    "select version from clara.schema_migrations where version ~ $1", [FA_PARTICULARS_COMPLETION_FOLD_STEM]);
  assert.equal(mig.rows.length, 1,
    `exactly one applied ${FA_PARTICULARS_COMPLETION_FOLD_STEM} migration (got ${mig.rows.map((x) => x.version).join(",")})`);

  const sig = "clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)";
  const fn = await rootQuery(
    `select p.provolatile, p.prosecdef, p.proowner::regrole::text as owner,
            'search_path=clara, pg_temp' = any(p.proconfig) as pinned_path
       from pg_proc p where p.oid = $1::regprocedure`, [sig]);
  assert.equal(fn.rows.length, 1, `${sig} exists`);
  assert.equal(fn.rows[0].provolatile, "s", "…and is STABLE — the language itself refuses to let it write");
  assert.ok(fn.rows[0].prosecdef, "…SECURITY DEFINER, like every other ungranted FA internal core");
  assert.equal(fn.rows[0].owner, "clara_fn_owner", "…owned by clara_fn_owner, like its siblings");
  assert.ok(fn.rows[0].pinned_path, "…and its search_path is pinned");

  const acl = await rootQuery(
    `select count(*)::int as n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
      where p.oid = $1::regprocedure and a::text not like 'clara_fn_owner=%'`, [sig]);
  assert.equal(acl.rows[0].n, 0, "no grant beyond the owner's own — an INTERNAL, granted to nobody");

  for (const role of ["clara_authenticated", "clara_runtime", "clara_agent_ro"]) {
    const has = await rootQuery(
      "select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok", [role, sig]);
    assert.equal(has.rows[0].ok, false, `${role} does NOT hold EXECUTE on the new core`);
  }
});

// ===========================================================================================
// 2 · BOTH RECUT BODIES, OFF THE CATALOG — the VACUITY check that this is a FOLD, not an
//     "add a call and keep the old copy too" patch.
// ===========================================================================================

test("p976.callers.recut both clara.complete_fixed_asset_particulars and clara._fa_complete_particulars_core now CALL clara._fa_assert_particulars_completable, and neither still carries either raw duplicated fragment", async (t) => {
  if (await gate(t)) return;

  const human = await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = "
    + "'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)'::regprocedure");
  const core = await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = "
    + "'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)'::regprocedure");
  assert.equal(human.rows.length, 1);
  assert.equal(core.rows.length, 1);

  // Normalized the SAME way the migration's own tail normalizes prosrc before comparing: line
  // comments stripped, lowercased, whitespace runs collapsed to one space.
  const normalize = (src) => src.replace(/--[^\n]*/g, "").toLowerCase().replace(/\s+/g, " ").trim();

  for (const [name, src] of [["clara.complete_fixed_asset_particulars", human.rows[0].src],
    ["clara._fa_complete_particulars_core", core.rows[0].src]]) {
    assert.ok(src.includes(PARTICULARS_WALL_CALL),
      `${name} calls ${PARTICULARS_WALL_CALL} (its body does not)`);
    const n = normalize(src);
    assert.ok(!n.includes(FRAG_CHANGE_CLASS),
      `${name} no longer carries the raw "first completion is not a change" fragment inline`);
    assert.ok(!n.includes(FRAG_ALREADY_COMPLETE),
      `${name} no longer carries the raw "already complete" fragment inline`);
  }

  // …and each fragment survives EXACTLY ONCE across the whole schema — inside the new core.
  for (const [label, frag] of [["change-class", FRAG_CHANGE_CLASS], ["already-complete", FRAG_ALREADY_COMPLETE]]) {
    const carriers = await rootQuery(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara'
          and position($1 in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\\s+', ' ', 'g'))) <> 0`,
      [frag]);
    assert.deepEqual(carriers.rows.map((r) => r.proname), ["_fa_assert_particulars_completable"],
      `exactly one clara function carries the ${label} fragment now (got ${JSON.stringify(carriers.rows)})`);
  }
});

// ===========================================================================================
// 3 · THE BEHAVIOURAL PROOF, at the public seam — the "already complete" refusal, through BOTH
//     doors, which NOTHING in this repo's existing suite ever drove before this file (measured:
//     `grep -rln fa_particulars_already_complete *.test.mjs` under packages/db/tests returns
//     nothing before this ticket).
// ===========================================================================================

test("p976.behaviour.already_complete_both_doors a SECOND completion attempt on an already-completed asset is refused fa_particulars_already_complete through BOTH doors, with the SAME code and detail shape", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();
  const client = await p651Client("976_already_complete");
  const start = mon(-3);

  // HUMAN DOOR: complete once (succeeds), then complete again (refused).
  const a = await buyAsset({ client, cents: 100_000, postingDate: dayIn(start, 1) });
  const particulars = SL(start.start);
  await completeWith(w.users.bob, { client, asset: a.asset.id, particulars });
  assert.equal((await faRow(a.asset.id)).depreciation_method, "straight_line",
    "mandatory setup: the first completion really wrote the method");

  const humanErr = await refuses(() => completeWith(w.users.bob, {
    client, asset: a.asset.id, particulars,
  }), "fa_particulars_already_complete", "already_complete.human");
  assert.equal(humanErr.code, "CLR37");
  assert.equal(JSON.parse(String(humanErr.detail)).asset_id, a.asset.id,
    "…and the detail names the SAME asset");

  // RUNTIME DOOR: a DIFFERENT asset, completed once through the runtime twin, then refused the
  // same way on a second attempt through the SAME door.
  const b = await buyAsset({ client, cents: 130_000, postingDate: dayIn(start, 2) });
  await completeForWith({ client, asset: b.asset.id, obo: w.users.bob, particulars });
  assert.equal((await faRow(b.asset.id)).depreciation_method, "straight_line",
    "mandatory setup: the runtime door's first completion really wrote the method");

  const forErr = await caught(() => completeForWith({
    client, asset: b.asset.id, obo: w.users.bob, particulars,
  }));
  assert.ok(forErr, "already_complete.for: the runtime twin refuses too");
  assert.equal(reasonToken(forErr), "fa_particulars_already_complete",
    `already_complete.for: 0216's shared core carries the SAME wall (got ${forErr.code}: ${forErr.message})`);
  assert.equal(forErr.code, "CLR37", "…the SAME error code as the human door");
  assert.equal(JSON.parse(String(forErr.detail)).asset_id, b.asset.id, "…and the detail names the SAME asset");
});
