// FS-4 checkout gate, PR C-6 (apps/web). Design of record:
// docs/plan/active/checkout-gate-design{,-part2,-part3}.md.
//
// C-6's own migration is small and purely additive: one CHECK-bounded column on
// clara.billing_plans, and the TWO read doors `apps/web` cannot render the entry
// faces truthfully without — `get_current_checkout_plan()` and
// `get_own_checkout_progress(uuid)`. Every cell gates on the LIVE catalog,
// never on the migration number.
//
// WHY THESE DOORS ARE JUDGEMENT LOGIC, and therefore celled rather than trusted:
// `get_own_checkout_progress` decides WHOSE registration a caller may read, on a
// PRE-FIRM surface where there is no `jwt_firm()` to catch a mistake, and
// `get_current_checkout_plan` supplies the flag that decides whether a real beta
// customer is asked for a card. Both refusals below are walls.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool, humanQuery, insertUser, roleActor, rootQuery, runAs } from "./rig-fixtures.mjs";

const EXPECTED_CELLS = 8;

let live = false;
let executed = 0;

async function cohortApplied() {
  const rows = await rootQuery(
    `select
       to_regprocedure('clara.get_current_checkout_plan()') is not null as plan_door,
       to_regprocedure('clara.get_own_checkout_progress(uuid)') is not null as progress_door,
       exists (select 1 from information_schema.columns
                where table_schema='clara' and table_name='billing_plans'
                  and column_name='payment_method_collection') as pmc_column`,
  );
  const { plan_door, progress_door, pmc_column } = rows.rows[0];
  const present = [plan_door, progress_door, pmc_column].filter(Boolean).length;
  if (present !== 0 && present !== 3) {
    throw new Error(
      `checkout C-6 cohort is PARTIAL: plan_door=${plan_door} progress_door=${progress_door} pmc_column=${pmc_column}`,
    );
  }
  return present === 3;
}

before(async () => { live = await cohortApplied(); });
after(async () => { await endPool(); });

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C6 === "1") {
    console.warn("SKIP checkout-gate-c6: the C-6 cohort is not applied (explicit unnumbered/pre-integration run).");
    t.skip("checkout-gate C-6 cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "checkout-gate C-6 is required for a focused run: apply UNNUMBERED_checkout_gate_c6_web_reads.sql (or its numbered suite copy)",
  );
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

async function insertRegistration(applicant, tag = "c6") {
  const row = await rootQuery(
    `insert into clara.firm_registration_requests(applicant, firm_name, note, op_key)
     values ($1,$2,$3,$4) returning id`,
    [applicant, `${tag}_${randomUUID().slice(0, 8)}`, "checkout C-6 rig", `${tag}_${randomUUID()}`],
  );
  return row.rows[0].id;
}

async function expectCode(code, action, label) {
  let caught = null;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, `${label}: expected ${code}, but it succeeded`);
  assert.equal(caught.code, code, `${label}: expected ${code}, got ${caught.code}: ${caught.message}`);
  return caught;
}

cell("c6.1 catalog -- the collection-mode column is NOT NULL, defaulted and CHECK-bounded", async () => {
  const col = await rootQuery(
    `select is_nullable, data_type, column_default from information_schema.columns
      where table_schema='clara' and table_name='billing_plans'
        and column_name='payment_method_collection'`,
  );
  assert.equal(col.rowCount, 1);
  assert.equal(col.rows[0].is_nullable, "NO");
  assert.equal(col.rows[0].data_type, "text");
  assert.match(col.rows[0].column_default, /if_required/);

  // The CHECK is what stops an unknown token reaching Stripe. `apps/web`'s own
  // reader refuses anything but the two, but the DB is the wall.
  const check = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.billing_plans'::regclass
        and conname='ck_billing_plans_payment_method_collection'`,
  );
  assert.equal(check.rowCount, 1, "the collection-mode CHECK is absent");
  assert.match(check.rows[0].def, /if_required/);
  assert.match(check.rows[0].def, /always/);
});

cell("c6.2 the CHECK REFUSES a third token -- both polarities", async () => {
  await expectCode(
    "23514",
    () => rootQuery(
      `insert into clara.billing_plans(local_key,name,payment_method_collection,is_current)
       values ($1,'c6 reject','sometimes',false)`,
      [`c6_reject_${randomUUID().slice(0, 8)}`],
    ),
    "an unknown collection mode",
  );
  // POSITIVE CONTROL: both real tokens insert, so the refusal above is the
  // CHECK discriminating rather than the insert being broken outright.
  for (const mode of ["if_required", "always"]) {
    const key = `c6_ok_${mode}_${randomUUID().slice(0, 8)}`;
    await rootQuery(
      `insert into clara.billing_plans(local_key,name,payment_method_collection,is_current)
       values ($1,'c6 accept',$2,false)`,
      [key, mode],
    );
    await rootQuery(`delete from clara.billing_plans where local_key=$1`, [key]);
  }
});

cell("c6.3 the seeded value is DERIVED from the amount columns on every row", async () => {
  // Hard constraint 2: no model-chosen token on a money surface. The migration's
  // backfill is the design's own rule as a CASE over `amounts_ruled` and
  // `amount_cents`, and this re-derives it rather than trusting the UPDATE ran.
  const drift = await rootQuery(
    `select count(*)::int as n from clara.billing_plans b
      where b.payment_method_collection is distinct from
            (case when b.amounts_ruled and b.amount_cents>0 then 'always' else 'if_required' end)`,
  );
  assert.equal(drift.rows[0].n, 0, "a plan row disagrees with the amount-derived mode");
  // VACUITY CONTROL: there IS a plan row to have derived anything from.
  const current = await rootQuery(`select local_key, payment_method_collection, amount_cents, amounts_ruled
                                     from clara.billing_plans where is_current`);
  assert.equal(current.rowCount, 1, "there is not exactly one current plan");
  assert.equal(current.rows[0].payment_method_collection, "if_required",
    "the beta plan is at amount 0 with amounts unruled, so G13's arm is if_required");
});

cell("c6.4 both doors are clara_authenticated-ONLY, stable definers, PUBLIC refused", async () => {
  for (const sig of ["clara.get_current_checkout_plan()", "clara.get_own_checkout_progress(uuid)"]) {
    const row = (await rootQuery(
      `select p.prosecdef, p.provolatile, pg_get_userbyid(p.proowner) as owner,
              coalesce((select array_agg(distinct g.grantee::regrole::text order by g.grantee::regrole::text)
                          from (select (aclexplode(p.proacl)).grantee) g
                         where g.grantee::regrole::text <> 'clara_fn_owner'), '{}') as grantees,
              has_function_privilege('public', p.oid, 'execute') as public_can
         from pg_proc p where p.oid = $1::regprocedure`,
      [sig],
    )).rows[0];
    assert.equal(row.prosecdef, true, `${sig} is not SECURITY DEFINER`);
    assert.equal(row.provolatile, "s", `${sig} is not STABLE`);
    assert.equal(row.owner, "clara_fn_owner", `${sig} owner`);
    assert.deepEqual(row.grantees, ["clara_authenticated"], `${sig} EXECUTE set`);
    assert.equal(row.public_can, false, `${sig} is executable by PUBLIC`);
  }
});

cell("c6.5 THE SELF-SCOPE WALL -- a foreign registration is CLR04, its own read is not", async () => {
  const mine = await insertUser("c6a");
  const theirs = await insertUser("c6b");
  const myRegistration = await insertRegistration(mine, "c6mine");
  const theirRegistration = await insertRegistration(theirs, "c6theirs");

  // THE REFUSE ARM. `not your registration request` — the same sentence
  // `open_checkout_intent` gives for the same wrong, so a caller never learns
  // a spelling difference between the two doors.
  const err = await expectCode(
    "CLR04",
    () => humanQuery(mine, `select * from clara.get_own_checkout_progress($1)`, [theirRegistration]),
    "somebody else's registration",
  );
  assert.match(err.message, /not your registration request/);

  // THE POSITIVE CONTROL, without which the refusal above could be the door
  // being broken for everyone.
  const own = await humanQuery(mine, `select * from clara.get_own_checkout_progress($1)`, [myRegistration]);
  assert.equal(own.rowCount, 1);
  assert.equal(own.rows[0].checkout_open, false);
  assert.equal(own.rows[0].paid_unconsumed, false);
});

cell("c6.6 an ANONYMOUS caller and an UNKNOWN registration each refuse, distinctly", async () => {
  const mine = await insertUser("c6c");
  // No jwt claims at all: the door reads jwt_sub() and refuses before touching
  // a row, so an unauthenticated reader learns nothing about which ids exist.
  // Driven through the rig's own role persona rather than a hand-rolled
  // `set role …; select …` — that spelling is TWO commands and Postgres
  // refuses it in a prepared statement (42601), which is a test bug wearing a
  // refusal's clothes: the first cut of this cell "passed a refusal" that had
  // nothing to do with the wall.
  await expectCode(
    "CLR04",
    () => runAs(roleActor("clara_authenticated"),
      `select * from clara.get_own_checkout_progress($1)`, [randomUUID()]),
    "no authenticated actor",
  );
  // A registration nobody owns is CLR10, not CLR04 — a different fact, and the
  // caller is entitled to it because it names no other person's row.
  await expectCode(
    "CLR10",
    () => humanQuery(mine, `select * from clara.get_own_checkout_progress($1)`, [randomUUID()]),
    "an unknown registration",
  );
  await expectCode(
    "CLR10",
    () => humanQuery(mine, `select * from clara.get_own_checkout_progress(null)`),
    "a null registration",
  );
});

cell("c6.7 BOTH FACTS are read positively, and each moves on its own evidence", async () => {
  const applicant = await insertUser("c6d");
  const registration = await insertRegistration(applicant, "c6prog");
  const read = () => humanQuery(applicant, `select * from clara.get_own_checkout_progress($1)`, [registration]);

  assert.deepEqual(
    { ...(await read()).rows[0] },
    { checkout_open: false, paid_unconsumed: false },
    "a bare registration must show no progress",
  );

  // An UNSTAMPED intent is not "checkout open" — the fact is a non-null
  // session_id, never the mere existence of an intent row.
  await rootQuery(
    `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version)
     values ($1,$2,'clara-beta-2026','clara-beta-2026-08-a')`,
    [registration, applicant],
  );
  assert.equal((await read()).rows[0].checkout_open, false, "an unstamped intent read as checkout_open");

  await rootQuery(
    `update clara.checkout_intents set session_id=$2 where registration_id=$1`,
    [registration, `cs_c6_${randomUUID().slice(0, 8)}`],
  );
  const stamped = (await read()).rows[0];
  assert.equal(stamped.checkout_open, true, "a stamped intent is checkout_open");
  assert.equal(stamped.paid_unconsumed, false, "a payment was inferred from a checkout session");
});

cell("c6.8 the plan door returns the CURRENT plan's key beside its mode", async () => {
  // The two travel together so the checkout route can prove they name the same
  // plan as `open_checkout_intent`'s own `price_local_key`; a rotation between
  // the two reads would otherwise build a Session at one plan's price with
  // another plan's collection mode.
  const applicant = await insertUser("c6e");

  // THE CELL COULD NOT REACH ITS OWN PREDICATE, and that is what this fixture
  // fixes (review M5). The seeded corpus holds exactly ONE plan row, so
  // deleting `where b.is_current` from the door left this cell green — measured
  // by the reviewer with the filter removed past the tail. A door that returned
  // every plan would hand `POST /checkout` an arbitrary collection mode the
  // moment the pricing sitting seeds a second one, which is exactly the event
  // this train is built around. `c6.2` already creates and deletes non-current
  // rows for the CHECK; this is the same three lines.
  const decoyKey = `c6_decoy_${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.billing_plans(local_key,name,amount_cents,amounts_ruled,
                                     payment_method_collection,is_current)
     values ($1,'c6 decoy plan',4900,true,'always',false)`,
    [decoyKey],
  );
  try {
    const rows = await humanQuery(applicant, `select * from clara.get_current_checkout_plan()`);
    assert.equal(rows.rowCount, 1, "the door returned more than the CURRENT plan");
    const current = (await rootQuery(`select local_key, payment_method_collection
                                        from clara.billing_plans where is_current`)).rows[0];
    assert.equal(rows.rows[0].local_key, current.local_key);
    assert.equal(rows.rows[0].payment_method_collection, current.payment_method_collection);
    // The decoy is DISCRIMINATING: it carries the other token and a non-zero
    // amount, so a door that ignored `is_current` would be caught by value as
    // well as by count.
    assert.notEqual(rows.rows[0].local_key, decoyKey);
    assert.notEqual(rows.rows[0].payment_method_collection, "always");
    // NO AMOUNT crosses this door. A money figure nothing reads is a figure a
    // later lane renders.
    assert.deepEqual(Object.keys(rows.rows[0]).sort(), ["local_key", "payment_method_collection"]);
  } finally {
    await rootQuery(`delete from clara.billing_plans where local_key=$1`, [decoyKey]);
  }
});

test("c6.VACUITY CONTROL -- every declared C-6 cell executed", (t) => {
  if (!live) {
    if (process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C6 === "1") {
      t.skip("checkout-gate C-6 cohort absent -- explicit pre-integration run");
      return;
    }
    assert.fail("checkout-gate C-6 cohort absent");
  }
  assert.equal(executed, EXPECTED_CELLS, `${EXPECTED_CELLS} C-6 cells executed before the control`);
});
