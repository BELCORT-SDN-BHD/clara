// #1041 — the x41 rig's FRONTIER COMPAT SWITCHES agree with the doors they stand in front of.
//
// `db-slice-frontiers` replays this package's CURRENT tests against a chain that stops at
// 0042/0043/0044/0045, so every x41 fixture has to speak the door grammar of BOTH frontiers.
// `fa-authority-sign-compat.mjs` already carries that job for the authority signature (0227 moved
// its arity, and `signTakesAuthorityRef()` feature-detects it off `to_regprocedure`). 0227 ALSO
// made `revise_fixed_asset_particulars` take the classification INSIDE `p_particulars`
// (`change_class` / `change_reason`), and the x41 rig started sending those keys unconditionally
// — so on the d-b0 leg every revising cell died with
//
//     CLR37 particulars carries an unknown key "change_class"
//
// 26 of d-b0's 27 red cells in dispatch run 35893727271, and the D-b3 upgrade drill with them.
// A key is not an arity, so there is nothing for `to_regprocedure` to see: the switch asks
// APPLIED HISTORY instead (`clara.schema_migrations ~ 'depreciation_history$'`), the same stable
// stem #651's own preintegration gate is keyed on.
//
// THE CELL BELOW IS THE CROSS-CHECK, and the two sides are independent: the switch reads the
// CHAIN, the assertion reads the live DOOR's own body. Both arms are real — at the estate
// frontier the stem is applied and the door knows the key; below 0227 neither is true. MEASURED
// on both (lane 07, 2026-09-24): `clara_l07` at 0295 and `clara_fr_b0_ci` at 0042.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool } from "./rig-helpers.mjs";
import {
  reviseTakesChangeClass, DEPRECIATION_HISTORY_STEM, restoreAuthorityWindowAfterApply,
} from "./fa-authority-sign-compat.mjs";
import { faWorld, freshFaClient, proposeAuthority, signAuthority, idOf } from "./x41-fa-world.mjs";

after(async () => { await endPool(); });

test("p1041.compat.change_class the x41 rig's classification-key switch says what the LIVE revise door says", async () => {
  const chain = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [DEPRECIATION_HISTORY_STEM]);
  const applied = chain.rows[0].n > 0;

  const door = await rootQuery(
    "select prosrc from pg_proc where pronamespace = 'clara'::regnamespace and proname = $1",
    ["revise_fixed_asset_particulars"]);
  assert.equal(door.rowCount, 1,
    "clara.revise_fixed_asset_particulars must exist at every frontier this rig runs at — 0041 creates it");
  const doorKnowsKey = door.rows[0].prosrc.includes("change_class");

  assert.equal(await reviseTakesChangeClass(), doorKnowsKey,
    `the rig's compat switch and the live door disagree about the classification keys `
    + `(switch=${await reviseTakesChangeClass()}, door body mentions change_class=${doorKnowsKey}) — `
    + "a revising x41 cell will either be refused CLR37 for an unknown key or be refused for a missing one");
  assert.equal(doorKnowsKey, applied,
    `the door's own body and the applied chain disagree: ${DEPRECIATION_HISTORY_STEM} `
    + `${applied ? "IS" : "is NOT"} applied but the door ${doorKnowsKey ? "knows" : "does not know"} `
    + "the classification keys — the stem is not a safe proxy for this grammar any more");
});

// THE SECOND SWITCH IN THAT MODULE IS NOT A GRAMMAR SWITCH — it is a fixture premise a MIGRATION
// moves. 0227 D8 stamps `authority_from` at the first day of the SIGNING month and freezes it, and
// a period is due only once it has ENDED, so a rig that signs by the clock is floored out of its
// own arrears. Every x41 cell dodges that by back-dating at SIGN time (`liveAuthority()`); the
// Wave-D-b upgrade drills cannot, because they sign at the 0041 frontier and 0227's backfill
// stamps the row inside the `migrate()` call the drill is measuring — which is how
// `closed-wave-drills` went red at its last drill on dispatch 35957081528 with
// `[D-b2] mandatory setup: a depreciation period is still due after the apply`.
//
// `restoreAuthorityWindowAfterApply()` is the post-apply twin, and the cell below drives it
// through its public interface on a client whose authority really was signed by the clock. Its
// SECOND half is the non-vacuity arm: once the window is no longer the backfill's own stamp the
// helper must refuse, because a helper that back-dates whatever it finds would hide a broken
// backfill instead of standing one down.
test("p1041.compat.authority_window the post-apply floor restorer asserts 0227's stamp before it moves it", async () => {
  const windowed = (await rootQuery(
    "select 1 from information_schema.columns where table_schema = 'clara' "
    + "and table_name = 'fa_depreciation_authorities' and column_name = 'authority_from'")).rowCount > 0;
  if (!windowed) {
    assert.deepEqual(
      await restoreAuthorityWindowAfterApply(randomUUID(), { firstPeriodStart: "2020-01-01", label: "p1041" }),
      { windowed: false, authorityFrom: null },
      "below 0227 there is no window to restore and the helper must be a no-op, not a red");
    return;
  }

  const w = await faWorld();
  const client = await freshFaClient("p1041window", { enrol: false });
  const proposed = await proposeAuthority(w.users.bob, { client, cadence: "monthly" });
  await signAuthority(w.users.hana, { client, authority: idOf(proposed, "authority_id", "id") });

  const floor = (await rootQuery(
    "select to_char(date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')::date "
    + "- interval '12 months'), 'YYYY-MM-DD') as d")).rows[0].d;
  const thisMonth = (await rootQuery(
    "select to_char(date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')::date), 'YYYY-MM-DD') as d"
  )).rows[0].d;
  const windowOf = async () => (await rootQuery(
    "select to_char(authority_from, 'YYYY-MM-DD') as d from clara.fa_depreciation_authorities "
    + "where client_id = $1 and status = 'live'", [client])).rows[0].d;

  assert.equal(await windowOf(), thisMonth,
    "a signature by the rig clock floors the authority at THIS month — the state the drills meet after the apply");
  assert.deepEqual(
    await restoreAuthorityWindowAfterApply(client, { firstPeriodStart: floor, label: "p1041" }),
    { windowed: true, authorityFrom: thisMonth },
    "the helper reports the window it found, which is the one 0227's own rule stamps");
  assert.equal(await windowOf(), floor,
    "…and the live authority now carries the floor a genuinely pre-0227 authority would");

  await assert.rejects(
    () => restoreAuthorityWindowAfterApply(client, { firstPeriodStart: floor, label: "p1041" }),
    /first day of its SIGNING month/,
    "a window that is NOT the backfill's own stamp must be refused, never back-dated again");
});
