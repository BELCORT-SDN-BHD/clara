// #1041 — the closed-wave 0041 drill's own fixture obeys #899's client birth wall.
//
// THE DEFECT THIS CLOSES, measured (dispatch run 35893727271, the `closed-wave-drills` job).
// `x41-0041-upgrade.test.mjs` births four onboarding clients in ONE seeded firm through
// `wb.onboardingClient`, naming them `u41k_<label>_<hex6>`. `clara.name_family_token` (0103)
// normalises every non-alphanumeric run to a space and takes the LEADING token, so all four
// names are the family `u41k`; lane 07's #899 (`0287_client_birth_wall.sql`) made
// `begin_client_onboarding` delegate to `clara._client_birth_core`, whose wall refuses outright
// once TWO same-family parties already exist in the firm. The drill migrates to the REAL
// frontier partway through, so the wall is LIVE by the third seed:
//
//     CLR10 this name matches 2 existing clients or counterparties in your firm; decide which
//     business this is before another record is created
//
// …and the whole `closed-wave-drills` job stopped there, skipping the five drills after it.
//
// THE REMEDY IS THE ONE #899 ALREADY APPLIED THREE TIMES — `wb-fixtures.mjs`'s
// `onboardingClient()` default, `opening-ledger-source.test.mjs`'s `tiedScene`, and commit
// 26ada6131 for the wave-B interview battery: THE UNIQUE PART LEADS THE NAME. The label stays
// readable, it just stops being the family.
//
// Cell 1 drives the REAL door on the live database and proves both halves — the collision and
// the remedy — rather than reasoning about the token function. Cell 2 ties that proof to the
// drill's own source, so the drill cannot drift back to a shared leading token while this file
// stays green. `x41-0041-upgrade.test.mjs` itself is reset-gated and never runs on this rig
// (RIG.md), which is exactly why its fixture needs a proof that does.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { endPool, rootQuery } from "./rig-helpers.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";

const DRILL = "x41-0041-upgrade.test.mjs";

after(async () => { await endPool(); });

/** 0287's own cohort, by CATALOG (never by number): the wall is what this file is about, so a
 *  chain that predates it has nothing to prove and says so. */
async function birthWallLive() {
  const r = await rootQuery(
    "select (select position('_client_birth_core' in prosrc) > 0 from pg_proc "
    + "where oid = 'clara.begin_client_onboarding(text,text)'::regprocedure) as repointed");
  return Boolean(r.rows[0]?.repointed);
}

test("p1041.drill.name_family four sibling seeds in ONE firm: a shared leading token is refused by #899's wall, a leading unique token is not", async (t) => {
  if (!(await birthWallLive())) {
    t.skip("0287's birth wall is not on this chain (begin_client_onboarding does not delegate to _client_birth_core)");
    return;
  }
  const w = await wb.buildWaveBWorld();
  const LABELS = ["main", "rb", "zero", "none"];   // the drill's own four seeds

  // (a) THE SHAPE THAT BROKE — the drill's pre-fix spelling, `u41k_<label>_<hex6>`.
  const shared = `u41kx${randomUUID().slice(0, 6)}`;   // one family for all four, unique per run
  const born = [];
  let refusal = null;
  for (const label of LABELS) {
    try {
      born.push(await wb.onboardingClient(w.users.hana, `${shared}_${label}_${randomUUID().slice(0, 6)}`));
    } catch (e) { refusal = e; break; }
  }
  assert.ok(refusal, "four same-family births in one firm must NOT all be admitted — #899's wall is the thing under test");
  assert.equal(born.length, 2, `the wall bites on the THIRD sibling, not earlier or later (admitted ${born.length})`);
  assert.equal(refusal.code, "CLR10", `…as CLR10 (got ${refusal.code}: ${refusal.message})`);
  assert.match(String(refusal.message), /matches 2 existing clients or counterparties/,
    "…by the name-family message the drill died on, not some other refusal");

  // (b) THE REMEDY — the unique part LEADS, exactly as the drill now spells it.
  const led = [];
  for (const label of LABELS) {
    led.push(await wb.onboardingClient(w.users.hana, `u41k${randomUUID().slice(0, 8)}_${label}`));
  }
  assert.equal(led.length, LABELS.length,
    "all four seeds are admitted once the unique part leads — each name is its own family");
  assert.equal(new Set(led.map((r) => r.client)).size, LABELS.length, "…and they are four distinct clients");
});

test("p1041.drill.name_source the 0041 drill's own seed names still put the unique part in the LEADING token", () => {
  const src = readFileSync(new URL(DRILL, import.meta.url), "utf8");
  const call = /wb\.onboardingClient\([^,]+,\s*`([^`]*)`/.exec(src);
  assert.ok(call, `${DRILL} no longer names its onboarding clients with a template literal — re-aim this cell at what it does now`);
  const template = call[1];
  const firstInterp = template.indexOf("${");
  const firstBreak = template.search(/[^A-Za-z0-9$]/);
  assert.ok(firstInterp >= 0, `${DRILL}'s seed name "${template}" has no unique part at all — four seeds would share one name`);
  assert.ok(firstInterp <= firstBreak || firstBreak === -1,
    `${DRILL} names its seeds "${template}": clara.name_family_token takes the LEADING token, so every seed `
    + "shares the family and #899's wall refuses the third (dispatch 35893727271). Put the unique part in the "
    + "leading token, the remedy 26ada6131 applied for the same wall.");
});
