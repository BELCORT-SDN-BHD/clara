// 0042 Wave D-b — the STAFF-ADVANCE battery, part 7: A REFUSAL MAY NOT PROMISE WHAT ANOTHER
// VERB WILL NOT DO.
//
// WHY THIS FILE EXISTS. The as-built ladder has now caught the SAME defect class three rounds
// running — a refusal whose named remedy is itself refused. Round 1: `enrolment_closed` claimed
// the code's balance "is what it was when the enrolment was retired", which nothing enforces.
// Round 2 replaced the claim with a MEASUREMENT — of ONE gate, the GL balance — and promised
// "its approved balance is zero, so enrolment will admit it". Round 3 measured that
// `enrol_staff_advance_account` runs THREE gates BEFORE the balance test (chart typing, the bank
// door, the shared reservation union), and proved BOTH extra routes reachable on a retired code
// that design §3.1 explicitly blesses re-using.
//
// SO THE FIX WAS STRUCTURAL, AND THESE CELLS TEST THE STRUCTURE, NOT THE SYMPTOM. There is now
// ONE admission body; the enrolment verb ENFORCES it and the hook's refusal CONSULTS it. The
// property below is therefore stated ONCE and asked of EVERY gate, including the ones no round
// of this ladder walked:
//
//     the refusal's `reenrolment_admitted` is TRUE  <=>  enrol_staff_advance_account SUCCEEDS
//     and when it is FALSE, `reenrolment_axis` is the axis the enrolment verb ACTUALLY refuses on
//
// A cell that only walked the balance corridor is exactly what let round 2 ship; this one calls
// the enrolment door for real on every route and compares its answer with the promise.
//
// AND ONE MEASURED THING THE BUILD DELIBERATELY DOES NOT FIX (x42v.w7f): `_fa_reserved_roles`
// (0041's body, live in production) reads `clara.fixed_assets` with NO status test, so a code the
// fixed-asset REGISTER holds is reserved permanently — disposal included. 0042 does not gate a
// live 0041 body it does not own; what it does is stop promising a re-enrolment that can never
// happen, and name the act that still works instead.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane,
  x42EnsureReady, skip42, refusesWith, caught, axisToken, reasonToken, detailOf, T, E,
  ADV1, BANKV, OTHERV, FAACCUM, FAEXP, mon, dayIn, today, uniqTag, rootQuery, getPool,
  advWorld, freshAdvClient, enrolAdvance, retireAdvance, approvedEntry, disburse, applyToAdvance,
  advanceTie, rowsBy, numOf, glNet, outstandingAt,
  reverseAndSettle, upsertFaProfile, retireFaProfile, addBankAccount,
} from "./x42-adv-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-advances-admission");
  printSkipCount("x42-advances-admission");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b enrolment-admission battery");
const acctNumber = () => `5${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

/** The corridor every route needs: an enrolled code, a disbursement, its full repayment, and a
 *  retirement — after which the repayment's reversal is the act that consults the enrolment
 *  door. Returns {client, enrolment, advance, appEntry}. */
async function corridor(label, { cents = 100_000 } = {}) {
  const { client, enrolment } = await freshAdvClient(label);
  const a = (await disburse({ client, cents, postingDate: dayIn(mon(-4), 5) })).advance;
  const app = await applyToAdvance(w.users.bob, {
    client, advance: a.id, cents, postingDate: dayIn(mon(-3), 5), counter: BANKV, kind: "bank_return",
  });
  assert.equal(await outstandingAt(a.id, today()), 0, `${label}: mandatory setup — the advance is fully repaid`);
  await retireAdvance(w.users.hana, { client, enrolment, reason: `x42 ${label} the staff member left`, opKey: opk(`x42${label}r`) });
  assert.equal(await glNet(client, ADV1), 0, `${label}: mandatory setup — the retired code is clean`);
  return { client, enrolment, advance: a, appEntry: app.entryId };
}

/** THE PROPERTY, asked once per route: the promise the refusal makes and the answer the
 *  enrolment door actually gives must be the same answer. Returns the refusal detail. */
async function assertPromiseMatchesDoor(c, label, { axis, remedy, reason = null }) {
  const err = await refusesWith(() => reverseAndSettle(w.users.bob, {
    entry: c.appEntry, reason: `x42 ${label} the repayment never happened`, opKey: opk(`x42${label}rev`),
  }), E.belt, T.advanceMovementUnregistered, `${label}: reversing an application whose enrolment is retired`);
  assert.equal(axisToken(err), "enrolment_closed", `${label}: on the closed-enrolment axis`);
  const d = detailOf(err);
  // REMEDY AND AXIS FIRST, deliberately: on a build whose promise is composed from the balance
  // alone these are the assertions that fire, and the failure then NAMES the defect ("said
  // re_enrol, the door refuses on role_reserved") instead of reporting a missing key.
  assert.equal(d.remedy, remedy, `${label}: naming WHICH remedy applies (got ${JSON.stringify(d)})`);
  assert.equal(d.reenrolment_axis ?? null, axis, `${label}: …and WHICH gate is standing there`);
  assert.equal(typeof d.reenrolment_admitted, "boolean",
    `${label}: …and whether the chain it describes is executable at all, machine-readably`);

  // …AND THE DOOR IS ACTUALLY CALLED. This is the half round 2 never did.
  const enrolErr = await caught(() => enrolAdvance(w.users.alice, {
    client: c.client, accountCode: ADV1, personLabel: `x42 ${label} successor`, opKey: opk(`x42${label}e`),
  }));
  assert.equal(enrolErr === null, d.reenrolment_admitted,
    `${label}: the promise and the enforcement disagree — the refusal said admitted=${d.reenrolment_admitted}, the enrolment door ${enrolErr ? `REFUSED ${enrolErr.code} ${enrolErr.message}` : "ADMITTED"}`);
  if (enrolErr) {
    assert.equal(axisToken(enrolErr), d.reenrolment_axis,
      `${label}: the axis the refusal named is not the axis the door refuses on (door said '${axisToken(enrolErr)}')`);
    if (reason) assert.equal(reasonToken(enrolErr), reason, `${label}: …under the ABI §F token for that gate`);
    assert.equal(enrolErr.code, E.badRequest, `${label}: …at the enrolment door's own SQLSTATE`);
  }
  return { detail: d, enrolErr };
}

// ===========================================================================
// x42v.w7a..w7e — EVERY GATE, IN THE VERB'S OWN ORDER.
// ===========================================================================

test("x42v.w7a a CLEAN retired code: the refusal promises admission, and the enrolment door really does admit — then the reversal the corridor blocked lands and the register carries the debt again", async (t) => {
  if (skipHere(t)) return;
  const c = await corridor("w7a");
  const { detail } = await assertPromiseMatchesDoor(c, "w7a", { axis: null, remedy: "re_enrol" });
  assert.equal(detail.reenrolment_admitted, true, "…and this route is the admitted one");
  assert.equal(Number(detail.reenrolment_balance_cents), 0, "with the balance still reported unconditionally");

  await reverseAndSettle(w.users.bob, {
    entry: c.appEntry, reason: "x42 w7a the repayment never happened", opKey: opk("x42w7a2"),
  });
  assert.equal(await outstandingAt(c.advance.id, today()), 100_000,
    "the debt is back on the register — the whole promised chain executes");
});

test("x42v.w7b a retired code the FA register PROFILE claims: the refusal names the reservation, not the balance — and the enrolment door refuses on exactly that axis", async (t) => {
  if (skipHere(t)) return;
  const c = await corridor("w7b");
  // Design §3.1 blesses re-using a retired advance code, and residue R6 records that the FA
  // profile door cannot see advance enrolments at all — so this is ADMITTED, which is precisely
  // how the corridor gets built.
  await upsertFaProfile(w.users.alice, {
    client: c.client, assetAccount: ADV1, accumAccount: FAACCUM, expenseAccount: FAEXP, opKey: opk("x42w7bfa"),
  });
  const { detail } = await assertPromiseMatchesDoor(c, "w7b",
    { axis: "role_reserved", remedy: "retire_fa_profile_then_re_enrol", reason: "advance_enrolment_invalid" });
  assert.equal(Number(detail.reenrolment_balance_cents), 0,
    "the balance really IS zero here — which is exactly why a balance-only promise said 'enrolment will admit it' and was wrong");

  // THE NAMED REMEDY IS EXECUTABLE, WALKED IN FULL. A message may name a verb only if the verb
  // works from where the caller stands.
  await retireFaProfile(w.users.alice, { client: c.client, assetAccount: ADV1, opKey: opk("x42w7brp") });
  const gen2 = await enrolAdvance(w.users.alice, {
    client: c.client, accountCode: ADV1, personLabel: "x42 w7b successor", opKey: opk("x42w7be2"),
  });
  assert.equal(gen2.status, "active", "…retiring the profile really does free the code");
  await reverseAndSettle(w.users.bob, {
    entry: c.appEntry, reason: "x42 w7b the repayment never happened", opKey: opk("x42w7b2"),
  });
  assert.equal(await outstandingAt(c.advance.id, today()), 100_000, "…and the reversal then lands");
});

test("x42v.w7c a retired code bound to a BANK ACCOUNT: the refusal names the binding and the door refuses on the bank axis — the second route round 2's balance-only promise walked straight past", async (t) => {
  if (skipHere(t)) return;
  const c = await corridor("w7c");
  await addBankAccount(w.users.alice, {
    client: c.client, accountNumber: acctNumber(), coaAccountCode: ADV1, opKey: opk("x42w7cbk"),
  });
  const { detail } = await assertPromiseMatchesDoor(c, "w7c",
    { axis: "bank_account", remedy: "move_bank_binding_then_re_enrol", reason: "advance_enrolment_invalid" });
  assert.equal(Number(detail.reenrolment_balance_cents), 0,
    "…again with a zero balance, and again the door refuses");
});

test("x42v.w7d a retired code whose CHART entry no longer types as a staff-advance account: the typing gate — the first of the four, and the one no round of this ladder had ever reached", async (t) => {
  if (skipHere(t)) return;
  const c = await corridor("w7d");
  // A FIXTURE, and deliberately a root one: no verb deactivates a chart account today, and
  // `upsert_account` refuses to re-type an account that has lines ("cannot change type/class of
  // an account that has lines" — measured). The state is therefore unreachable through the
  // product right now, which is exactly why it needs a cell: the gate exists in the verb, so
  // the promise must cover it, and a gate nothing exercises is a gate that drifts.
  await rootQuery("update clara.coa_accounts set is_active=false where client_id=$1 and account_code=$2",
    [c.client, ADV1]);
  const { detail } = await assertPromiseMatchesDoor(c, "w7d",
    { axis: "account_type", remedy: "fix_chart_account_then_re_enrol", reason: "advance_enrolment_invalid" });
  assert.equal(Number(detail.reenrolment_balance_cents), 0, "…balance zero, door shut, promise honest");
  noteLane("x42v.w7d: the account_type gate is reachable only by fixture today (no verb deactivates a chart account; upsert_account refuses to re-type a posted one) — recorded so the next author does not read the cell as describing a live lane");
});

test("x42v.w7e a retired code carrying a FOREIGN BALANCE still reports the two-step remedy — round 2's own route, re-asked through the shared door so it cannot drift away from the other four", async (t) => {
  if (skipHere(t)) return;
  const c = await corridor("w7e");
  await approvedEntry(w.users.alice, {
    client: c.client, memo: "x42 w7e the code is re-used for a supplier deposit", postingDate: dayIn(mon(-1), 5),
    lines: [
      { account_code: ADV1, debit_cents: 50_000, credit_cents: 0, description: "supplier deposit" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 50_000, description: "from bank" },
    ],
  });
  const { detail } = await assertPromiseMatchesDoor(c, "w7e",
    { axis: "balance", remedy: "clear_balance_then_re_enrol", reason: "enrolment_balance_nonzero" });
  assert.equal(Number(detail.reenrolment_balance_cents), 50_000,
    "the measured balance EXCLUDES the in-flight mirror that is about to roll back — it is the balance the caller will actually face at the door");
});

// ===========================================================================
// x42v.w7f — A LIVE REGISTER ROW OUTLASTS ITS PROFILE, AND A TERMINAL ONE LETS GO.
// ===========================================================================

test("x42v.w7f a code a LIVE fixed-asset register row holds is not freed by retiring the profile — the refusal names the act that does work (end the row) — and once the row is disposed the reservation RELEASES and the door's refusal moves to the balance gate", async (t) => {
  if (skipHere(t)) return;
  const c = await corridor("w7f");

  // (i) THE CATALOG FACT the message asserts, MEASURED rather than believed.
  //
  // WHAT THIS ARM USED TO ASSERT, AND WHY IT NO LONGER DOES. It pinned that the FA union's
  // three `clara.fixed_assets` reads carry NO status test — "which is what makes the
  // reservation permanent". That was a faithful description of the pre-0042 body and it was
  // the DEFECT: a code any register row had ever carried could never be re-enrolled, so this
  // very corridor's advance reversal was un-recordable forever. The owner ruled it fixed at
  // the root on 2026-08-03 (WDB-R1 item 2); 0042 S5.15 gates all three disjuncts on
  // clara._fa_status_holds_account_role. The arm now measures the gate instead of its absence.
  const src = (await rootQuery(
    `select lower(regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\\s+',' ','g')) as s
       from pg_proc p where p.oid='clara._fa_reserved_roles(uuid)'::regprocedure`)).rows[0].s;
  const reads = (src.match(/from clara\.fixed_assets/g) ?? []).length;
  assert.equal(reads, 3, `_fa_reserved_roles reads clara.fixed_assets three times (cost/accum/expense) — got ${reads}`);
  const gated = (src.match(/_fa_status_holds_account_role\(f\.status\)/g) ?? []).length;
  assert.equal(gated, 3,
    `…and EVERY ONE of those reads is lifecycle-gated, so a terminal row stops reserving (body: ${src.slice(0, 400)})`);

  // (ii) BUILD THE PERMANENT CLAIM the honest way: a profile, then a real acquisition, which
  // soft-births the clara.fixed_assets row that holds the code forever.
  await upsertFaProfile(w.users.alice, {
    client: c.client, assetAccount: ADV1, accumAccount: FAACCUM, expenseAccount: FAEXP, opKey: opk("x42w7ffa"),
  });
  await approvedEntry(w.users.alice, {
    client: c.client, memo: "x42 w7f a machine bought on the old advance code", postingDate: dayIn(mon(-1), 5),
    lines: [
      { account_code: ADV1, debit_cents: 50_000, credit_cents: 0, description: "machine" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 50_000, description: "paid" },
    ],
  });
  assert.equal((await rootQuery("select id from clara.fixed_assets where client_id=$1 and asset_account_code=$2",
    [c.client, ADV1])).rowCount, 1, "mandatory setup: the FA REGISTER now holds the code");

  await assertPromiseMatchesDoor(c, "w7f",
    { axis: "role_reserved", remedy: "release_fa_register_row_then_re_enrol", reason: "advance_enrolment_invalid" });

  // (iii) THE OBVIOUS REMEDY IS NOT THE ONE THAT WORKS, and the refusal must not name it.
  // Retiring the profile drops one disjunct; the LIVE register row still holds the code,
  // because a register row keeps the codes it was born with.
  await retireFaProfile(w.users.alice, { client: c.client, assetAccount: ADV1, opKey: opk("x42w7frp") });
  await assertPromiseMatchesDoor(c, "w7f-after-profile-retire",
    { axis: "role_reserved", remedy: "release_fa_register_row_then_re_enrol", reason: "advance_enrolment_invalid" });

  // …AND THE ACT THE MESSAGE DOES NAME REALLY RELEASES IT (owner ruling 2026-08-03). This is
  // the half that used to be impossible: ending the register row frees the code. The disposed
  // STATE is set as a fixture rather than through clara.dispose_fixed_asset because the
  // subject here is the READER — whether clara._fa_reserved_roles looks at the column at all —
  // and the lawful disposal path has its own cells in x41-disposal.
  await rootQuery("update clara.fixed_assets set status='disposed', disposed_at=now() where client_id=$1 and asset_account_code=$2",
    [c.client, ADV1]);
  assert.deepEqual((await rootQuery(
    "select domain, role from clara._acct_role_reserved($1::uuid, $2::text)", [c.client, ADV1])).rows, [],
  "a DISPOSED register row RELEASES its code — the shared union no longer reserves it, which is exactly what makes this corridor's unwind recordable at all");
  // …so the door's refusal MOVES: the reservation gate is gone and the enrol-clean-only gate
  // is what now stands there. A promise that still said 'role_reserved' would be describing a
  // claim that no longer exists — and assertPromiseMatchesDoor calls the real enrolment door,
  // so the message and the enforcement are checked against each other, not just against this
  // cell's expectation.
  const after = await assertPromiseMatchesDoor(c, "w7f-after-disposal",
    { axis: "balance", remedy: "clear_balance_then_re_enrol", reason: "enrolment_balance_nonzero" });
  assert.equal(after.detail.reenrolment_admitted, false,
    "…still not admitted, but now for a reason the professional can actually clear (the machine's 50,000 sen sitting on the code), not because the code is poisoned forever");
  assert.equal(Number(after.detail.reenrolment_balance_cents), 50_000,
    "…and the amount standing in the way is reported, so the remedy is a number rather than an instruction");

  // (iv) THE ACT THE MESSAGE NAMES INSTEAD IS EXECUTABLE, and leaves the surface honest. Nothing
  // guards a retired advance code, so an ordinary correcting entry posts — and staff_advance_tie
  // reports it in the column design §3.4 built for movement no window can hold.
  await approvedEntry(w.users.alice, {
    client: c.client, memo: "x42 w7f correct the repayment with an ordinary entry", postingDate: today(),
    lines: [
      { account_code: ADV1, debit_cents: 100_000, credit_cents: 0, description: "repayment reversed" },
      { account_code: OTHERV, debit_cents: 0, credit_cents: 100_000, description: "written back" },
    ],
  });
  const tie = await advanceTie(w.users.alice, c.client, today());
  const row = rowsBy(tie, "account_code", "staff_advance_tie after the named fallback").find((r) => r.account_code === ADV1);
  assert.ok(row, "the tie carries a row for the code");
  assert.equal(row.explained, true, "the tie is EXPLAINED — the fallback does not break the surface");
  assert.equal(numOf(row, /^difference_cents$/, "the tie row"), 0, "…in-window register and GL still agree to the sen");
  assert.equal(numOf(row, /^out_of_window_cents$/, "the tie row"), 150_000,
    "…and every cent that no enrolment window can hold (the machine + the correction) rides its own named column");

  // (v) FIXTURE TEARDOWN, AND WHY IT IS PART OF THE CELL. This cell deliberately builds an FA
  // world that does NOT tie — a disposed asset whose code still carries GL movement the FA
  // register has no row for — because that unbalanced world is the ONLY way to reach the
  // permanent-reservation branch at all. `x41.s4` sweeps `fa_register_tie` over the WHOLE
  // DATABASE, and would then report this fixture as an unexplained red belonging to no cell
  // (measured: it did, cost_diff −150000 on this very code). A fixture that makes another
  // lane's invariant sweep lie is a defect in THIS cell, so this cell removes what it built.
  //
  // IT TAKES `session_replication_role='replica'` BECAUSE THE BUILD DEFENDS ITSELF, and that
  // refusal is worth recording rather than routing around silently: `clara.fixed_assets` rows
  // are guarded by CLR13 "fixed assets are corrected by opening supersede, never deleted", so
  // there is no lawful delete — correct for a register, and exactly why the reservation those
  // rows create is permanent. The bypass is scoped to ONE transaction on ONE connection.
  const conn = await getPool().connect();
  try {
    await conn.query("begin");
    await conn.query("set local session_replication_role = 'replica'");
    await conn.query("delete from clara.fixed_assets where client_id=$1", [c.client]);
    await conn.query("delete from clara.fa_account_profiles where client_id=$1", [c.client]);
    await conn.query("commit");
  } finally {
    await conn.query("rollback").catch(() => {});
    await conn.query("reset all").catch(() => {});
    conn.release();
  }
  assert.equal((await rootQuery("select id from clara.fixed_assets where client_id=$1", [c.client])).rowCount, 0,
    "…and the teardown really did land, so the whole-DB FA sweep is left honest");
  noteLane(`x42v.w7f: the permanent FA reservation is 0041's law (design §3.1) and is NOT gated by 0042 — see s3-advances S3.9 for the ruling and its blast radius; residue for ADR-058 beside R6. FA fixture torn down so the whole-DB fa_register_tie sweep stays honest. uniq ${uniqTag()}`);
});
