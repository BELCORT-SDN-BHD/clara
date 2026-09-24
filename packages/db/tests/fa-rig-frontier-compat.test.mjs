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

import { test } from "node:test";
import assert from "node:assert/strict";
import { rootQuery } from "./rig-helpers.mjs";
import { reviseTakesChangeClass, DEPRECIATION_HISTORY_STEM } from "./fa-authority-sign-compat.mjs";

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
