// WAVE D-b SPLIT — DRILL 2 of 4: 0043 `wave_d_b1_staff_advances` DEPLOY-ONTO-EXISTING.
//
// D-b1's OWN deploy risk (census §6): FOUR new relations, and — uniquely among the four slices
// — a NEW TRIGGER ON A SHARED, HEAVILY-POPULATED TABLE (`t_je_adv_movement_belt` on
// clara.journal_entries). A trigger on the approve path of a database that already carries a
// book is the class of change that greens a fresh-CI apply and then breaks the first real
// approve. So this drill's headline claim is not "the tables exist" but "the book that existed
// before the apply can still be WRITTEN TO afterwards" — a depreciation run still posts, an
// ordinary bank settle still lives, and the belt admits the advance-free entries it must.
//
// It also pins the SPLIT-CREATED completion (errata E9): D-b1 re-creates `_acct_role_reserved`
// and `_acct_role_reserved_at` with their advance arms added. `create or replace` on an ABSENT
// body CREATES it silently, so the drill measures that the completion really happened (the FA
// disjunct still present, the advance disjunct now present) rather than trusting the apply.
//
// REGRESSION FLOOR: D-b0's whole post-state is re-asserted here (census §6).
//
// RESET-GATED (drops schema clara) — run ALONE, its own CI step, its own throwaway DB:
//   PGDATABASE=clara_x42_b1_upgrade_ci CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 \
//     CLARA_RIG_DB=1 node --test tests/x42-0043-b1-upgrade.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool, printLaneNotes, noteLane, rootQuery, humanQuery, namedCall, opk, upsertAccountClassed } from "./x41-fa-world.mjs";
import {
  MIG_DIR, skipUnlessReset, freshDb, buildPre0042Book,
  assertB0Floor, assertB1Floor, assertNoLaterSliceObjects, assertPreExistingSurfacesStillWork,
  tableExists, columnExists, appliedCount, strippedDef, triggerExists,
} from "./x42-split-upgrade-kit.mjs";

after(async () => { printLaneNotes("x42-0043-b1-upgrade"); await endPool(); });

const ADV_CODE = "185-U43";

test("D-b1 upgrade drill: 0042→0043 lands on a populated book — the four advance relations + the ea1955 seed arrive, the movement belt lands on the SHARED journal_entries without breaking the approve path, both reservation authorities are COMPLETED (not silently re-created), D-b3/D-b2 ship nothing, and the enrolment register really works", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();

  assert.equal(await appliedCount("^0041_"), 1, "the drill starts with 0041 applied");
  assert.equal(await appliedCount("^004[2-9]_"), 0, "…and NO D-b slice applied");
  assert.equal(await tableExists("staff_advance_accounts"), false, "the drill really starts pre-advances");

  const h = await buildPre0042Book();
  await upsertAccountClassed(h.sub, {
    client: h.client, code: ADV_CODE, name: "Staff advances (u43)", type: "asset", accountClass: null, opKey: opk("u43coa"),
  });
  const jeBefore = Number((await rootQuery("select count(*)::int as n from clara.journal_entries")).rows[0].n);

  // ===================== THE APPLY (the whole chain through this slice) =====================
  await migrate({ dir: MIG_DIR, log: () => {} });
  assert.equal(await appliedCount("^0042_"), 1, "0042 applied");
  assert.equal(await appliedCount("^0043_"), 1, "0043 applied onto the populated book");

  // (a) the regression floor — every D-b0 claim still true after a second slice landed.
  await assertB0Floor();
  // (b) D-b1's own post-state.
  await assertB1Floor();

  // (c) THE SHARED-TABLE TRIGGER, measured where it actually lands. A belt on journal_entries
  //     is the only new trigger this slice puts on a pre-existing relation; it must be there,
  //     and it must be CONSTRAINT-DEFERRED (the design's own posture — the belt reads rows the
  //     hook writes later in the same transaction).
  assert.equal(await triggerExists("journal_entries", "t_je_adv_movement_belt"), true, "the movement belt lands on clara.journal_entries");
  const tg = (await rootQuery(`select t.tgdeferrable, t.tginitdeferred, t.tgconstraint <> 0 as is_constraint
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='clara' and c.relname='journal_entries' and t.tgname='t_je_adv_movement_belt'`)).rows[0];
  assert.equal(tg.is_constraint, true, "…as a CONSTRAINT trigger");
  assert.equal(tg.tginitdeferred, true, "…INITIALLY DEFERRED (it reads what the approve hook writes later in the same txn)");

  // (d) THE SPLIT-CREATED COMPLETION (errata E9): both reservation authorities gained their
  //     advance arms, and did not lose the FA ones. Measured on the COMMENT-STRIPPED body (E19).
  for (const fn of ["_acct_role_reserved", "_acct_role_reserved_at"]) {
    const def = await strippedDef(fn);
    assert.ok(/staff_advance/.test(def), `clara.${fn} is COMPLETED at D-b1 — the advance arm is present`);
    assert.ok(/fa_account_profiles|_fa_reserved_roles|fixed_assets/.test(def), `…and clara.${fn} still carries its FA disjunct`);
  }

  // (e) 0043 minted no entries of its own, and auto_reversal_of is still dormant (D-b2 is its
  //     first writer — census §4 Option A).
  const arv = (await rootQuery("select count(*)::int as total, count(auto_reversal_of)::int as nonnull from clara.journal_entries")).rows[0];
  assert.equal(Number(arv.total), jeBefore, "0043 minted no journal entries of its own");
  assert.equal(Number(arv.nonnull), 0, "auto_reversal_of is still 100% NULL — D-b2 is its first writer");

  // (f) THE SPLIT'S OWN CLAIM: D-b3 and D-b2 shipped nothing.
  await assertNoLaterSliceObjects({ advances: false, af2: true, adjustments: true });
  assert.equal(await appliedCount("^004[4-9]_"), 0, "…and no later slice recorded itself as applied");
  assert.equal(await columnExists("bank_matches", "pending_resolution"), false, "bank_matches is untouched by this slice");

  // (g) pre-existing behaviour intact — the belt did NOT break the approve path.
  await assertPreExistingSurfacesStillWork(h, "D-b1");

  // (h) HEADLINE SMOKE: the enrolment register really works on the upgraded book.
  const enrol = (await humanQuery(h.w.users.hana, namedCall("enrol_staff_advance_account", [
    { name: "p_client" }, { name: "p_account_code" }, { name: "p_person_label" },
    { name: "p_confirm_dedicated", cast: "boolean" }, { name: "p_attestation" }, { name: "p_op_key" },
  ]), [h.client, ADV_CODE, `U43 Staff ${randomUUID().slice(0, 6)}`, true,
    "u43 drill: the code is dedicated to one person and carries no other traffic", opk("u43enrol")])).rows[0].result;
  assert.ok(enrol, "the enrolment verb answers on the upgraded book");
  const enrolled = (await rootQuery(
    "select account_code, active, person_label from clara.staff_advance_accounts where client_id=$1 and account_code=$2", [h.client, ADV_CODE])).rows;
  assert.equal(enrolled.length, 1, "…and the register carries exactly one row for the code");
  assert.equal(enrolled[0].active, true, "…active");
  noteLane("D-b1 drill: the enrolment register works on a book that pre-dates the slice");
});
