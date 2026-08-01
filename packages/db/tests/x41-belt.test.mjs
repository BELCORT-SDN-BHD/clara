// 0041 Wave D-a — the FA REGISTER battery, part 1b: THE REMAINING BELT/ENROLMENT
// CELLS (design §1.2 / §2.4 / §5.6). Split out of x41-wave-d-a-fa.test.mjs only
// because the repo enforces a 500-line file ceiling; `node --test tests/` discovers
// both automatically.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header): authored from the D-a design of
// record + the pinned 0041 interface, never from 0041's SQL. Refusals are asserted by
// their pinned REASON TOKEN (contract §4).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41, refuses,
  refusesOneOf, humanCall, T, COST, COST2, ACCUM2, EXPENSE, EXPENSE2, LAND, BANK, mon, dayIn,
  upsertFaProfile, retireFaProfile, faWorld, faRow, profileRows, freshFaClient, approvedEntry,
  buyAsset,
} from "./x41-fa-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-belt");
  printSkipCount("x41-belt");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a enrolment/belt battery");

test("x41.b6 re-typing or re-classing a COA account that backs an ACTIVE profile is refused by name — the §5.6 guard on the account door", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("b6");
  const sub = w.users.alice;

  // [ASSEMBLY · adjudication A3] MEASURED: no deactivation door exists on coa_accounts
  // anywhere in the chain — `upsert_account` is the ONLY writer and it upserts is_active=true.
  // Deactivation is therefore a FORWARD guard, and the §5.6 rule that is reachable today is
  // the one over the RESULTING row: an actively-enrolled account cannot be re-typed or
  // re-classed out from under its profile. The lane's raw `is_active=false` fallback is VOID
  // (the ACL denies raw table writes to every non-owner role in any case).
  const args = (await rootQuery(
    `select pg_get_function_identity_arguments(p.oid) as a from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='upsert_account'`,
  )).rows.map((x) => x.a).join(" | ");
  assert.ok(!/(p_active|p_is_active)\b/.test(args),
    `upsert_account still carries NO active flag — deactivation is a forward guard (args: ${args})`);
  assert.equal((await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname ~ '^(deactivate|retire|archive)_.*_account$'
        and p.proname not like '%bank%'`,
  )).rowCount, 0, "…and no COA deactivation verb exists to route around it");

  const upsert = (type, klass) => humanCall(sub, "upsert_account", [
    { name: "p_client" }, { name: "p_code" }, { name: "p_name" }, { name: "p_type" },
    { name: "p_special_acc_type" }, { name: "p_op_key" }, { name: "p_account_class" },
  ], [client, COST, "Plant & Machinery (x41)", type, null, opk("x41deact"), klass]);

  await refuses(() => upsert("expense", null), T.enrolledDeactivation,
    `re-TYPING ${COST} (asset → expense) while an active FA profile backs it`);
  await refuses(() => upsert("asset", "receivable"), T.enrolledDeactivation,
    `re-CLASSING ${COST} into a control class while an active FA profile backs it`);
  const row = (await rootQuery(
    "select account_type, account_class, is_active from clara.coa_accounts where client_id=$1 and account_code=$2",
    [client, COST])).rows[0];
  assert.equal(row.account_type, "asset", "every refusal left the account untouched");
  assert.equal(row.account_class, null, "…including its (absent) class");
  assert.equal(row.is_active, true, "…and it is still active");

  // Retiring the ENROLMENT is the stated route: once the profile is inactive the account
  // door opens again (the guard is scoped to ACTIVE profiles, design §1.2/§5.6).
  await retireFaProfile(sub, { client, assetAccount: COST });
  await upsert("expense", null);
  assert.equal((await rootQuery(
    "select account_type from clara.coa_accounts where client_id=$1 and account_code=$2",
    [client, COST])).rows[0].account_type, "expense",
  "retire_fa_account_profile is the named remedy — the account door opens once the enrolment is retired");
});

test("x41.b7 profile validation: pairwise-distinct codes, typed roles, the both-or-neither land shape, and reactivation on re-enrolment", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("b7", { enrol: false });
  const sub = w.users.alice;

  await refuses(() => upsertFaProfile(sub, { client, assetAccount: COST2, accumAccount: COST2, expenseAccount: EXPENSE2 }),
    T.profileInvalid, "a profile whose cost and accum codes are the SAME (pairwise distinctness)");
  await refuses(() => upsertFaProfile(sub, { client, assetAccount: COST2, accumAccount: ACCUM2, expenseAccount: BANK }),
    T.profileInvalid, "a profile whose expense role points at an ASSET account");
  await refuses(() => upsertFaProfile(sub, { client, assetAccount: EXPENSE2, accumAccount: ACCUM2, expenseAccount: EXPENSE }),
    T.profileInvalid, "a profile whose cost role points at an EXPENSE account");
  await refuses(() => upsertFaProfile(sub, { client, assetAccount: COST2, accumAccount: ACCUM2, expenseAccount: null }),
    T.profileInvalid, "a HALF-null pair (accum set, expense null) — both-or-neither is the land shape");
  await refuses(() => upsertFaProfile(sub, { client, assetAccount: COST2, accumAccount: null, expenseAccount: EXPENSE2 }),
    T.profileInvalid, "a HALF-null pair (expense set, accum null)");

  await upsertFaProfile(sub, { client, assetAccount: LAND, accumAccount: null, expenseAccount: null });
  const { asset } = await buyAsset({
    client, cents: 5_000_000, postingDate: dayIn(mon(-2), 7), account: LAND, memo: "x41 land",
  });
  assert.equal(asset.depreciation_method, "none", "an asset born on a NON-DEPRECIABLE profile takes method 'none' (MPERS 17.16, WD-R3)");
  assert.equal(asset.accum_depr_account_code, null, "…with no accum account");
  assert.equal(asset.depr_expense_account_code, null, "…and no expense account");
  assert.equal((await faRow(asset.id)).depreciation_rate_bps, null, "…and no rate (the 'none' driver trio: neither life nor rate)");

  await retireFaProfile(sub, { client, assetAccount: LAND });
  assert.equal((await profileRows(client)).filter((p) => p.asset_account_code === LAND && p.active).length, 0,
    "retire_fa_account_profile deactivated the row");
  await upsertFaProfile(sub, { client, assetAccount: LAND, accumAccount: null, expenseAccount: null });
  const activeLand = (await profileRows(client)).filter((p) => p.asset_account_code === LAND && p.active);
  assert.equal(activeLand.length, 1, "re-enrolment leaves EXACTLY one active profile for the account (unique WHERE active)");
  assert.ok(activeLand[0].enrolled_at, "the reactivated row carries a FRESH enrolled_at watermark (contract §2)");
});

test("x41.b8 the cost-adjustment deferral: a hand supplier credit/rebate against an enrolled cost account is refused by a name that states the reverse-and-rebook remedy", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("b8");
  await buyAsset({ client, cents: 200_000, postingDate: dayIn(mon(-2), 2) });
  // A rebate reduces the enrolled cost account with no register act. The v1 remedy is
  // reverse + re-book, and the refusal must SAY so (design §2.4, contract §4).
  const err = await refusesOneOf(
    () => approvedEntry(w.users.alice, {
      client, memo: "x41 supplier rebate on capitalised cost", postingDate: dayIn(mon(-1), 4),
      lines: [
        { account_code: BANK, debit_cents: 5_000, credit_cents: 0, description: "rebate received" },
        { account_code: COST, debit_cents: 0, credit_cents: 5_000, description: "cost adjustment" },
      ],
    }),
    [T.costAdjDeferred, T.beltUnregistered],
    "a hand cost adjustment (supplier rebate) on an enrolled cost account",
  );
  const blob = `${err.detail ?? ""} ${err.message ?? ""} ${err.hint ?? ""}`;
  assert.ok(/revers/i.test(blob), `the refusal names the reverse-and-rebook remedy (got: ${blob})`);
});

test("x41.b9 the belt is scoped to ENROLLED accounts only: an ordinary hand journal on an UN-enrolled account is untouched", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("b9");
  // COST2/ACCUM2/EXPENSE2 exist on the chart but were never enrolled — the belt must
  // not generalise from "looks like an FA account" to "is one" (enrolment is the law).
  const entry = await approvedEntry(w.users.alice, {
    client, memo: "x41 un-enrolled asset purchase", postingDate: dayIn(mon(-1), 11),
    lines: [
      { account_code: COST2, debit_cents: 88_000, credit_cents: 0, description: "unenrolled asset" },
      { account_code: BANK, debit_cents: 0, credit_cents: 88_000, description: "paid" },
    ],
  });
  assert.ok(entry, "an ordinary entry on an UN-enrolled account approves normally");
  const rows = await rootQuery("select count(*)::int as n from clara.fixed_assets where client_id=$1", [client]);
  assert.equal(rows.rows[0].n, 0, "…and births NO register row (detection is enrolment-scoped, design §1.2)");
});
