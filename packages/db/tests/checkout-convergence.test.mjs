// #628 — CHECKOUT CONVERGENCE: ONE AUTHORITATIVE OUTCOME, AND AN HONEST WAITING PATH TO IT
// (parent spec #612 §2/§8; journey A1).
//
// The one claim this battery exists to prove: **A CHECKOUT HAS EXACTLY ONE STATE AT A TIME, THE
// DATABASE OWNS EVERY MOVE BETWEEN TWO STATES, AND MONEY IS THE AUTHORITY OVER ALL OF THEM.**
// Everything else here — the applier's four event types, the cancel door, the one-live-session
// wall, the capacity race — hangs off that.
//
// CONTRACT-BLIND against 0186's own tail census, frontier-gated on the `checkout_convergence$`
// stem. Nothing below reads the migration's success text: 0186's `raise notice ... OK` describes
// one attempt, and these cells describe the live catalog (packages/db/README.md, "Migration and
// deployment behavior").
//
// LEAST-PRIVILEGED EXECUTION, and where it is structurally impossible. Every DOOR is driven
// through `clara_authenticated` with real jwt claims, and every webhook verb through
// `clara_stripe_webhook` — never root. The RAW transition cells (cc.2-cc.4) are root by
// construction and not by convenience: `clara.checkout_intents` is `force row level security` with
// a single `clara_fn_owner` policy and ZERO application-role grants, permanently (checkout-gate
// design part 2 §1), so the trigger under test has no application-role reach at all. That is
// exactly how checkout-gate-c1's own c1.8 drives the 0158 wall it inherited.
//
// A REFUSAL MUST LEAVE NOTHING BEHIND: every refusal cell re-reads the row or the counter it
// could have moved, because an effect written by a call that then raised is precisely the failure
// this file is for.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ADMITTED_STATUS_WRITES, CLR, CONVERGENCE_REASON, EVENT, PG, PROBLEM, ROLES, STATUS,
  applicationFor, applyEvents, assertPair, assertRaises, backdateStatus, cancelIntent,
  claimPaidFirm, clearOperator, convergenceLaneReady, deliver, endPool, ensureOperatorOwner,
  gateConvergence, getCapacity, getPool, humanQuery, insertUser, intentState, intentsOf,
  liveCheckout, namedCall, openIntent, openedCheckout, opk, ordinaryFirm, ownIntentSession,
  ownProgress, paymentsFor, problemsFor, rawCapacity, recordEvent, releaseCapacity, resolveProblem,
  roleQuery, rootQuery, setCapacity, stampSession, stripeEventId, stripeSessionId,
  waitBlockedByOrThrow,
} from "./checkout-convergence-fixtures.mjs";
import { withTxn } from "./rig-txn.mjs";

const AGENT_USER_ID = "00000000-0000-4000-8000-000000c1a7a0";
const CAPACITY_KEY = "clara.admission-capacity";

let operator = null;
let executed = 0;
const EXPECTED_CELLS = 35;

before(async () => {
  if (!(await convergenceLaneReady())) return;
  operator = await ensureOperatorOwner();
});
after(async () => {
  if (operator) await releaseCapacity(operator.owner);
  await clearOperator();
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (await gateConvergence(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ===========================================================================================
// 1 · THE STATE ITSELF.
// ===========================================================================================

cell("cc.1 catalog -- the intent carries a CHECK-bounded state, its instant and its reason", async () => {
  const columns = await rootQuery(
    `select a.attname, format_type(a.atttypid,a.atttypmod) as type, a.attnotnull,
            pg_get_expr(d.adbin,d.adrelid) as expression
       from pg_attribute a
       left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid='clara.checkout_intents'::regclass
        and a.attname in ('status','status_at','status_reason') and not a.attisdropped
      order by a.attname`);
  assert.deepEqual(columns.rows, [
    { attname: "status", type: "text", attnotnull: true, expression: "'open'::text" },
    { attname: "status_at", type: "timestamp with time zone", attnotnull: true, expression: "now()" },
    { attname: "status_reason", type: "text", attnotnull: false, expression: null },
  ]);

  const checks = await rootQuery(
    `select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.checkout_intents'::regclass
        and conname in ('ck_checkout_intents_status','ck_checkout_intents_status_session',
                        'ck_checkout_intents_status_reason')
      order by conname`);
  assert.equal(checks.rowCount, 3, "all three named status constraints are present");
  const statusDef = checks.rows.find((r) => r.conname === "ck_checkout_intents_status").def;
  for (const value of STATUS) {
    assert.ok(statusDef.includes(`'${value}'`), `the status CHECK admits ${value}`);
  }
  // The CHECK is CLOSED, not merely inclusive. Probed on an INSERT rather than an UPDATE, and
  // that is the point: the BEFORE UPDATE trigger rules every move and would answer CLR09
  // `invalid_transition` first, so an UPDATE can never reach the constraint. An INSERT has no such
  // trigger, so a ninth spelling meets the CHECK itself.
  const world = await openedCheckout(operator.owner, { tag: "cc1" });
  await withTxn(async (c) => {
    const row = (await c.query(
      `select registration_id, applicant, price_local_key, dpa_version
         from clara.checkout_intents where id=$1`, [world.intent])).rows[0];
    // …and since #628 review S6 the CHECK is behind a BEFORE INSERT arm as well, which answers
    // CLR09 invalid_transition first (cc.18 drives THAT wall). It is disabled for the width of
    // this one rolled-back probe -- 0186 §A's own idiom -- so the question below is still the
    // CHECK's own closure and not the trigger's.
    await c.query("alter table clara.checkout_intents disable trigger t_checkout_intents_insert_stamp");
    await assertRaises(PG.checkViolation, () => c.query(
      `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version,status)
       values ($1,$2,$3,$4,'settled')`,
      [row.registration_id, row.applicant, row.price_local_key, row.dpa_version]),
    "a status outside the eight-value vocabulary");
  }, { commit: false });
  // …and the trigger, not the CHECK, is what an UPDATE meets first.
  await withTxn(async (c) => {
    const err = await assertRaises(CLR.lastOwner, () => c.query(
      "update clara.checkout_intents set status='settled' where id=$1", [world.intent]),
    "an UPDATE to an unknown status");
    assert.equal(JSON.parse(err.detail).reason, CONVERGENCE_REASON.invalidTransition);
  }, { commit: false });

  // A STAMPED SESSION AND AN `open` INTENT CANNOT BOTH BE TRUE -- the stamp IS the transition, and
  // the CHECK says so independently of the trigger that enforces it.
  const inconsistent = checks.rows.find((r) => r.conname === "ck_checkout_intents_status_session").def;
  assert.match(inconsistent, /session_id IS NULL/);
  assert.match(inconsistent, /'open'/);

  const index = await rootQuery(
    `select indexdef from pg_indexes
      where schemaname='clara' and indexname='ix_checkout_intents_registration_status'`);
  assert.equal(index.rowCount, 1, "the registration/status index the one-live-session wall reads");
});

cell("cc.2 THE TRANSITION MATRIX -- all 64 ordered pairs, each admitted or refused by name", async () => {
  // Built and torn down inside ONE rolled-back transaction: 64 attempts against 8 fixture intents
  // leave the estate byte-identical, and the trigger under test fires identically inside a
  // transaction (it is a BEFORE ROW trigger, not a deferred constraint).
  const outcomes = await withTxn(async (c) => {
    const user = (await c.query(
      `insert into clara.users(id,display_name,email,is_agent) values ($1,$2,$3,false) returning id`,
      [randomUUID(), `cc2_${randomUUID().slice(0, 8)}`, `cc2_${randomUUID()}@rig.test`])).rows[0].id;
    const registration = (await c.query(
      `insert into clara.firm_registration_requests(applicant,firm_name,note,op_key)
       values ($1,$2,'#628 matrix rig',$3) returning id`,
      [user, `cc2_${randomUUID().slice(0, 8)}`, `cc2_${randomUUID()}`])).rows[0].id;
    const dpa = (await c.query(
      "select version from clara.legal_documents where kind='dpa' order by version desc limit 1")).rows[0].version;
    const plan = (await c.query(
      "select local_key from clara.billing_plans where is_current")).rows[0].local_key;

    const mint = async () => (await c.query(
      `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version)
       values ($1,$2,$3,$4) returning id`, [registration, user, plan, dpa])).rows[0].id;

    // Walk each fixture to its state through ADMITTED moves only. A raise here is a real finding
    // about the table below, not a fixture accident -- so it is deliberately not caught.
    const fixtures = {};
    for (const state of STATUS) {
      const id = await mint();
      if (state !== "open") {
        if (state === "cancelled") {
          await c.query("update clara.checkout_intents set status='cancelled' where id=$1", [id]);
        } else {
          await c.query("update clara.checkout_intents set session_id=$2 where id=$1",
            [id, `cs_cc2_${randomUUID().replaceAll("-", "")}`]);
          const path = {
            session_created: [],
            processing: ["processing"],
            paid: ["paid"],
            consumed: ["paid", "consumed"],
            expired: ["expired"],
            payment_failed: ["processing", "payment_failed"],
          }[state];
          for (const step of path) {
            await c.query("update clara.checkout_intents set status=$2 where id=$1", [id, step]);
          }
        }
      }
      const live = (await c.query("select status from clara.checkout_intents where id=$1", [id])).rows[0].status;
      assert.equal(live, state, `the fixture for ${state} actually reached it`);
      fixtures[state] = id;
    }

    const seen = [];
    for (const from of STATUS) {
      for (const to of STATUS) {
        await c.query("savepoint m");
        let error = null;
        try {
          await c.query("update clara.checkout_intents set status=$2 where id=$1", [fixtures[from], to]);
        } catch (e) {
          error = e;
        }
        await c.query("rollback to savepoint m");
        seen.push({ from, to, code: error?.code ?? null, detail: error?.detail ?? null });
      }
    }
    return seen;
  }, { commit: false });

  const admitted = new Set(ADMITTED_STATUS_WRITES.map(([f, t]) => `${f}->${t}`));
  for (const row of outcomes) {
    const key = `${row.from}->${row.to}`;
    if (admitted.has(key)) {
      assert.equal(row.code, null, `${key} is a LAWFUL move and must be admitted (got ${row.code})`);
      continue;
    }
    if (row.from === row.to) {
      // Nothing moved: 0158's own shape refusal, kept byte-for-byte, not a transition question.
      assert.equal(row.code, CLR.badRequest, `${key} (a no-op write) must be 0158's CLR10`);
      continue;
    }
    assert.equal(row.code, CLR.lastOwner, `${key} must be refused CLR09 invalid_transition`);
    const detail = JSON.parse(row.detail);
    assert.deepEqual(
      { reason: detail.reason, from: detail.from, to: detail.to },
      { reason: CONVERGENCE_REASON.invalidTransition, from: row.from, to: row.to },
      `${key} names its own from/to`);
  }
  // …and the matrix is EXHAUSTIVE and the admitted set is EXACTLY the table: 64 ordered pairs
  // attempted, exactly the 14 declared lawful STATUS WRITES admitted and the other 50 refused.
  // The trigger's fifteenth lawful move, open -> session_created, is deliberately NOT among them:
  // it is reachable only through the session stamp (cc.3), and is refused as a bare write.
  assert.equal(outcomes.length, 64, "all 64 ordered pairs were attempted");
  assert.equal(admitted.size, 14);
  assert.equal(outcomes.filter((r) => r.code === null).length, 14);
  assert.equal(
    outcomes.find((r) => r.from === "open" && r.to === "session_created").code, CLR.lastOwner,
    "session_created is NOT reachable by a bare status write -- only a session stamp gets there");
});

cell("cc.3 the session stamp IS the transition -- the trigger writes it, no writer can skip it", async () => {
  const world = await openedCheckout(operator.owner, { tag: "cc3" });
  const before = await intentState(world.intent);
  assert.equal(before.status, "open");
  assert.equal(before.status_reason, null);

  // ONE UPDATE naming session_id and NOTHING else -- exactly what clara.record_checkout_session
  // issues (0163:504, uncut by 0186). The status and its instant are the trigger's.
  const session = await stampSession(world.intent, stripeSessionId("cc3"));
  const after = await intentState(world.intent);
  assert.equal(after.status, "session_created");
  assert.equal(after.session_id, session);
  assert.ok(after.status_at > before.status_at, "the transition moved status_at");

  // A stamp that also carries its own status is refused: the writer does not get a vote.
  const second = await openedCheckout(operator.owner, { tag: "cc3b" });
  await withTxn(async (c) => {
    const err = await assertRaises(CLR.lastOwner, () => c.query(
      "update clara.checkout_intents set session_id=$2, status='paid' where id=$1",
      [second.intent, stripeSessionId("cc3forge")]), "a session stamp carrying its own status");
    assert.equal(JSON.parse(err.detail).reason, CONVERGENCE_REASON.invalidTransition);
  }, { commit: false });

  // A cancelled intent cannot be handed a Stripe session: the wall is on `old.status`, so
  // clara.record_checkout_session refuses it without knowing anything about #628.
  await cancelIntent(second.sub, second.intent);
  await withTxn(async (c) => {
    const err = await assertRaises(CLR.lastOwner, () => c.query(
      "update clara.checkout_intents set session_id=$2 where id=$1",
      [second.intent, stripeSessionId("cc3late")]), "a session stamp on a cancelled intent");
    assert.equal(JSON.parse(err.detail).from, "cancelled");
    assert.equal(JSON.parse(err.detail).to, "session_created");
  }, { commit: false });
  assert.equal((await intentState(second.intent)).session_id, null,
    "the refused stamp left no session behind");

  // And the real door agrees, because it is the same wall: record_checkout_session on a cancelled
  // intent refuses without the door itself carrying a single word about status.
  await assertRaises(CLR.lastOwner, () => humanQuery(second.sub, namedCall(
    "record_checkout_session",
    [{ name: "p_intent", cast: "uuid" }, { name: "p_session_id", cast: "text" },
      { name: "p_op_key", cast: "text" }]),
  [second.intent, stripeSessionId("cc3door"), opk("cc3door")]),
  "the real session door on a cancelled intent");
});

cell("cc.4 status_at and status_reason belong to the transition, and the frozen identity still holds", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc4" });
  const stamped = await intentState(world.intent);

  // A reason rewrite with the status standing still is 0158's shape refusal, not a transition.
  // One aborted transaction per probe: a refusal poisons its own transaction, so sharing one would
  // make the SECOND assertion read 25P02 and call it a pass.
  await withTxn(async (c) => {
    await assertRaises(CLR.badRequest, () => c.query(
      "update clara.checkout_intents set status_reason='invented' where id=$1", [world.intent]),
    "a status_reason rewrite with the status unmoved");
  }, { commit: false });
  await withTxn(async (c) => {
    await assertRaises(CLR.badRequest, () => c.query(
      "update clara.checkout_intents set status_at=now() where id=$1", [world.intent]),
    "a status_at rewrite with the status unmoved");
  }, { commit: false });

  // status_at is the TRANSACTION's clock, written by the trigger: a caller's value is discarded.
  await rootQuery(
    `update clara.checkout_intents set status='processing', status_at='1999-01-01T00:00:00Z',
            status_reason='fpx_pending' where id=$1`, [world.intent]);
  const moved = await intentState(world.intent);
  assert.equal(moved.status, "processing");
  assert.equal(moved.status_reason, "fpx_pending");
  assert.ok(moved.status_at > stamped.status_at,
    "the trigger overwrote the caller's status_at with the transaction clock");

  // The frozen identity is 0158's, unchanged by two recuts.
  await withTxn(async (c) => {
    await assertRaises(CLR.badRequest, () => c.query(
      "update clara.checkout_intents set price_local_key='mutant', status='paid' where id=$1",
      [world.intent]), "an identity rewrite riding a lawful transition");
  }, { commit: false });
  assert.equal((await intentState(world.intent)).status, "processing",
    "the refused identity rewrite took its transition down with it");

  // The reason is bounded -- an untrusted provider string cannot become an unbounded column.
  await withTxn(async (c) => {
    await assertRaises(PG.checkViolation, () => c.query(
      "update clara.checkout_intents set status='paid', status_reason=$2 where id=$1",
      [world.intent, "x".repeat(201)]), "a 201-character status reason");
  }, { commit: false });
});

cell("cc.18 A CHECKOUT INTENT IS BORN OPEN -- the insert arm, not the CHECK, is the law", async () => {
  // #628 review S6. The transition wall was BEFORE UPDATE only, so on an INSERT the eight-value
  // CHECK was the whole law: a definer could mint an intent that was already `paid`, carrying a
  // status_at of its own choosing, and every surface downstream would believe it.
  const world = await openedCheckout(operator.owner, { tag: "cc18" });
  const row = (await rootQuery(
    `select registration_id, applicant, price_local_key, dpa_version
       from clara.checkout_intents where id=$1`, [world.intent])).rows[0];
  const args = [row.registration_id, row.applicant, row.price_local_key, row.dpa_version];

  // A DEFINER INSERTING A STATE is refused CLR09 invalid_transition, naming `from` null -- there
  // is no state to come from, which is exactly what the refusal says.
  for (const born of ["paid", "consumed", "processing", "cancelled"]) {
    await withTxn(async (c) => {
      const err = await assertRaises(CLR.lastOwner, () => c.query(
        `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version,status)
         values ($1,$2,$3,$4,$5)`, [...args, born]), `an intent inserted already ${born}`);
      const detail = JSON.parse(err.detail);
      assert.deepEqual({ reason: detail.reason, from: detail.from, to: detail.to },
        { reason: CONVERGENCE_REASON.invalidTransition, from: null, to: born },
        `${born}: the refusal names from=null`);
    }, { commit: false });
  }

  // …and a well-formed insert has its instant and its reason WRITTEN, not honoured: status_at is
  // the transaction clock and a newborn intent has no reason to carry.
  await withTxn(async (c) => {
    const born = (await c.query(
      `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version,
         status,status_at,status_reason)
       values ($1,$2,$3,$4,'open','1999-01-01T00:00:00Z','invented')
       returning status, status_at, status_reason`, args)).rows[0];
    assert.equal(born.status, "open");
    assert.equal(born.status_reason, null, "a newborn intent carries no reason");
    assert.ok(born.status_at > new Date("2020-01-01T00:00:00Z"),
      "status_at is the transaction clock, never the writer's");
  }, { commit: false });

  // The real door agrees because it is the same wall: open_checkout_intent names no status at all.
  assert.equal((await intentState(world.intent)).status, "open");
  assert.equal((await intentState(world.intent)).status_reason, null);

  // The arm is a SIBLING of the update wall, armed, and both are on the relation.
  const triggers = await rootQuery(
    `select tgname from pg_trigger where tgrelid='clara.checkout_intents'::regclass
       and not tgisinternal and tgenabled='O' order by tgname`);
  assert.deepEqual(triggers.rows.map((r) => r.tgname), [
    "t_checkout_intents_append_only", "t_checkout_intents_insert_stamp",
    "t_checkout_intents_no_truncate", "t_checkout_intents_session_stamp",
  ]);
});

// ===========================================================================================
// 2 · THE APPLIER.
// ===========================================================================================

cell("cc.5 async-unpaid completed is a STATE, not a problem -- and replays are inert", async () => {
  // `mode: "subscription"` is THE PRODUCTION SHAPE and is deliberate: every Clara Checkout Session
  // is created with it (apps/web/lib/checkout/stripe-session.ts:334), so this is the exact event
  // Stripe sends when an FPX customer leaves the page. cc.14 keeps the mode=payment control the
  // product never emits.
  const world = await liveCheckout(operator.owner, { tag: "cc5" });
  const { event, result } = await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  assert.deepEqual(result, { examined: 1, applied: 1, problems: 0 });
  const state = await intentState(world.intent);
  assert.equal(state.status, "processing");
  assert.equal(state.status_reason, "unpaid");
  assert.deepEqual(await problemsFor(event), [],
    "an asynchronous method's ordinary wait is never written into an operator queue");
  assert.deepEqual(await paymentsFor(world.registration), [], "an unsettled session bought nothing");
  assert.deepEqual(await applicationFor(event), { outcome: "processing", intent_id: world.intent });

  // REPLAY OF THE SAME EVENT ID: the recorder says so, and the sweep does nothing.
  const replay = await recordEvent(event, EVENT.completed, {
    livemode: false, session_id: world.session, intent_id: world.intent,
    registration_id: world.registration, applicant: world.sub,
    payment_status: "unpaid", mode: "subscription", session_status: "complete",
  });
  assert.deepEqual(replay, { event_id: event, recorded: false });
  assert.deepEqual(await applyEvents(), { examined: 0, applied: 0, problems: 0 },
    "an applied event is excluded before LIMIT, so it can never starve a fresh one");
  assert.equal((await intentState(world.intent)).status, "processing");
});

cell("cc.6 async_payment_succeeded settles -- one payment row, intent paid", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc6" });
  await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  assert.equal((await intentState(world.intent)).status, "processing");

  const { event, result } = await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "payment", session_status: "complete",
      customer_id: `cus_${randomUUID().replaceAll("-", "")}` },
  });
  assert.deepEqual(result, { examined: 1, applied: 1, problems: 0 });
  const state = await intentState(world.intent);
  assert.equal(state.status, "paid");
  assert.equal(state.status_reason, null, "settlement clears the waiting reason");
  const payments = await paymentsFor(world.registration);
  assert.equal(payments.length, 1, "exactly one payment row");
  assert.equal(payments[0].stripe_event_id, event);
  assert.equal(payments[0].stripe_session_id, world.session);
  assert.deepEqual(await problemsFor(event), []);
});

cell("cc.7 async_payment_failed carries the provider's own reason", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc7" });
  await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  const { event, result } = await deliver({
    type: EVENT.asyncFailed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", last_payment_error: "fpx_bank_declined" },
  });
  assert.deepEqual(result, { examined: 1, applied: 1, problems: 0 });
  const state = await intentState(world.intent);
  assert.equal(state.status, "payment_failed");
  assert.equal(state.status_reason, "fpx_bank_declined",
    "the applicant is told WHY, in the provider's own word");
  assert.deepEqual(await problemsFor(event), []);
  assert.deepEqual(await paymentsFor(world.registration), [], "a failed payment bought nothing");

  // With no projected error the arm still names itself rather than leaving the reason empty.
  const other = await liveCheckout(operator.owner, { tag: "cc7b" });
  await deliver({
    type: EVENT.asyncFailed, intent: other.intent, registration: other.registration,
    applicant: other.sub, session: other.session, projection: {},
  });
  assert.equal((await intentState(other.intent)).status_reason, "async_payment_failed");
});

cell("cc.8 a DELAYED completed event cannot lose the failure -- session_created still fails closed", async () => {
  // The `completed` event that would have recorded `processing` never arrived. The failure is
  // itself proof the payment was in flight, so the intent still reaches payment_failed -- and it
  // gets there through the lawful session_created -> processing -> payment_failed path rather than
  // by widening the transition table.
  const world = await liveCheckout(operator.owner, { tag: "cc8" });
  assert.equal((await intentState(world.intent)).status, "session_created");
  const { result } = await deliver({
    type: EVENT.asyncFailed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", last_payment_error: "fpx_timeout" },
  });
  assert.deepEqual(result, { examined: 1, applied: 1, problems: 0 });
  const state = await intentState(world.intent);
  assert.equal(state.status, "payment_failed");
  assert.equal(state.status_reason, "fpx_timeout");

  // …and a LATE completed-unpaid event arriving after the failure cannot walk it backwards.
  const { event: late, result: lateResult } = await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  assert.deepEqual(lateResult, { examined: 1, applied: 0, problems: 0 });
  assert.equal((await intentState(world.intent)).status, "payment_failed");
  assert.deepEqual(await applicationFor(late), { outcome: "no_change", intent_id: world.intent });
});

cell("cc.9 checkout.session.expired expires the intent, and a second one is inert", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc9" });
  const { event, result } = await deliver({
    type: EVENT.expired, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session, projection: { session_status: "expired" },
  });
  assert.deepEqual(result, { examined: 1, applied: 1, problems: 0 });
  const state = await intentState(world.intent);
  assert.equal(state.status, "expired");
  assert.equal(state.status_reason, "checkout_session_expired");
  assert.deepEqual(await applicationFor(event), { outcome: "expired", intent_id: world.intent });

  const { event: again, result: againResult } = await deliver({
    type: EVENT.expired, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session, projection: { session_status: "expired" },
  });
  assert.deepEqual(againResult, { examined: 1, applied: 0, problems: 0 },
    "a second expiry for one session is a no-op, not a second transition");
  assert.deepEqual(await applicationFor(again), { outcome: "no_change", intent_id: world.intent });
  assert.deepEqual(await problemsFor(again), []);
});

cell("cc.10 an expiry arriving AFTER the money is an operator problem, and moves nothing", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc10" });
  await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "payment", session_status: "complete" },
  });
  const paid = await intentState(world.intent);
  assert.equal(paid.status, "paid");

  const { event, result } = await deliver({
    type: EVENT.expired, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session, projection: { session_status: "expired" },
  });
  assert.deepEqual(result, { examined: 1, applied: 0, problems: 1 });
  const problems = await problemsFor(event);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].problem, PROBLEM.expiredAfterPaid);
  assert.equal(problems[0].detail.intent_status, "paid");
  assert.equal(problems[0].detail.intent_id, world.intent);
  const after = await intentState(world.intent);
  assert.deepEqual(
    { status: after.status, status_at: after.status_at.toISOString() },
    { status: "paid", status_at: paid.status_at.toISOString() },
    "the intent did not move, instant included");
  assert.deepEqual(await applicationFor(event), { outcome: "no_change", intent_id: world.intent },
    "#628 review S3: the problem is the OPERATOR's receipt and the application row is the applier's "
    + "own mark that it is DONE -- without it, resolving the problem handed the event straight back "
    + "to the next sweep, which filed the identical problem again, forever (cc.16)");
  assert.equal((await paymentsFor(world.registration)).length, 1);
});

cell("cc.11 money is the authority -- a payment after a CANCELLED intent still pays, with a receipt", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc11" });
  await cancelIntent(world.sub, world.intent);
  assert.equal((await intentState(world.intent)).status, "cancelled");

  const { event, result } = await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "payment", session_status: "complete" },
  });
  assert.deepEqual(result, { examined: 1, applied: 1, problems: 1 });
  assert.equal((await intentState(world.intent)).status, "paid",
    "a human decided this checkout was over and then paid for it anyway -- the money wins");
  const problems = await problemsFor(event);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].problem, PROBLEM.paidAfterTerminal);
  assert.equal(problems[0].detail.prior_status, "cancelled");
  const payments = await paymentsFor(world.registration);
  assert.equal(payments.length, 1, "and it is a REAL payment row, not merely a state");
  assert.equal(payments[0].stripe_event_id, event);
});

cell("cc.12 REORDER -- async_payment_succeeded BEFORE completed yields ONE payment and one intent", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc12" });
  // Stripe's two events for one asynchronous checkout, delivered in the wrong order and carrying
  // two DIFFERENT event ids. The first that settles buys the firm; the second must not buy a
  // second one, and must not be silently lost either.
  const first = await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "payment", session_status: "complete" },
  });
  assert.deepEqual(first.result, { examined: 1, applied: 1, problems: 0 });
  assert.equal((await intentState(world.intent)).status, "paid");

  const second = await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "payment", session_status: "complete" },
  });
  assert.notEqual(second.event, first.event, "two DIFFERENT event ids for one registration");
  assert.deepEqual(second.result, { examined: 1, applied: 0, problems: 1 });
  assert.deepEqual((await problemsFor(second.event)).map((p) => p.problem),
    [PROBLEM.duplicatePayment],
    "uq_frp_registration surfaces as duplicate_payment, never as a bare 23505");

  const payments = await paymentsFor(world.registration);
  assert.equal(payments.length, 1, "ONE payment row for one registration");
  assert.equal(payments[0].stripe_event_id, first.event);
  assert.equal((await intentState(world.intent)).status, "paid", "ONE authoritative outcome");

  // …and the UNSETTLED reorder is inert for the same reason: a late completed-unpaid event cannot
  // walk a paid intent back to processing.
  const third = await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  assert.deepEqual(third.result, { examined: 1, applied: 0, problems: 0 });
  assert.equal((await intentState(world.intent)).status, "paid");
  assert.deepEqual(await applicationFor(third.event), { outcome: "no_change", intent_id: world.intent });
});

cell("cc.13 payment_not_settled is unreachable, and the vocabulary still carries it", async () => {
  // The value stays in ck_stripe_event_problems_problem because the queue is append-only history
  // and a hosted estate already holds rows carrying it; what changed is that nothing can FILE one
  // any more. Proven the only honest way -- by driving the exact event shape that used to.
  const world = await liveCheckout(operator.owner, { tag: "cc13" });
  const before = await rootQuery(
    "select count(*)::int as n from clara.stripe_event_problems where problem=$1",
    [PROBLEM.paymentNotSettled]);
  // Three shapes that used to file `payment_not_settled` on the 0160 body. Under #628 review S1
  // the middle one SETTLES -- `no_payment_required` is Stripe's own "nothing is owed", and it is
  // exactly what the retired `mode='subscription'` disjunct was standing in for (cc.14) -- while
  // the other two are waits. None of the three is a problem row, which is the claim here.
  for (const projection of [
    { payment_status: "unpaid", mode: "payment", session_status: "open" },
    { payment_status: "no_payment_required", mode: "payment", session_status: "complete" },
    {},
  ]) {
    await deliver({
      type: EVENT.completed, intent: world.intent, registration: world.registration,
      applicant: world.sub, session: world.session, projection,
    });
  }
  const after = await rootQuery(
    "select count(*)::int as n from clara.stripe_event_problems where problem=$1",
    [PROBLEM.paymentNotSettled]);
  assert.equal(after.rows[0].n, before.rows[0].n,
    "no arm of the applier can file payment_not_settled any more");

  const def = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.stripe_event_problems'::regclass
        and conname='ck_stripe_event_problems_problem'`)).rows[0].def;
  for (const value of Object.values(PROBLEM)) {
    assert.ok(def.includes(`'${value}'`), `the problem vocabulary still admits ${value}`);
  }
});

cell("cc.14 SETTLEMENT IS THE PAYMENT STATUS -- an unpaid completed SUBSCRIPTION session buys nothing", async () => {
  // #628 review S1, and the production shape exactly: every Clara Checkout Session is created with
  // `mode: "subscription"` (apps/web/lib/checkout/stripe-session.ts:334), and Stripe sends
  // checkout.session.completed with status='complete', payment_status='unpaid' the moment a
  // delayed-notification customer (FPX) leaves the page. On the retired disjunct
  // (`mode='subscription' AND session_status='complete'`) that event was SETTLED.
  const world = await liveCheckout(operator.owner, { tag: "cc14" });
  const { event, result } = await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  assert.deepEqual(result, { examined: 1, applied: 1, problems: 0 });
  assert.equal((await intentState(world.intent)).status, "processing");
  assert.deepEqual(await paymentsFor(world.registration), [],
    "ZERO payment rows: nothing has been paid, whatever the session mode says");
  assert.deepEqual(await applicationFor(event), { outcome: "processing", intent_id: world.intent });

  // …AND THE FAILURE THAT FOLLOWS IS STILL HEARD. This is the half that made S1 a money defect:
  // with the intent already `paid`, async_payment_failed answered `no_change` and a REFUSED
  // payment had left a claimable firm behind.
  const failed = await deliver({
    type: EVENT.asyncFailed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", last_payment_error: "fpx_bank_declined" },
  });
  assert.deepEqual(failed.result, { examined: 1, applied: 1, problems: 0 });
  assert.equal((await intentState(world.intent)).status, "payment_failed");
  assert.deepEqual(await paymentsFor(world.registration), [], "a refused payment bought nothing");

  // THE mode='payment' CONTROL -- the shape the product never emits. The answer does not depend on
  // the mode at all any more, which is the whole point.
  const control = await liveCheckout(operator.owner, { tag: "cc14b" });
  await deliver({
    type: EVENT.completed, intent: control.intent, registration: control.registration,
    applicant: control.sub, session: control.session,
    projection: { payment_status: "unpaid", mode: "payment", session_status: "complete" },
  });
  assert.equal((await intentState(control.intent)).status, "processing");
  assert.deepEqual(await paymentsFor(control.registration), []);

  // …and `no_payment_required` -- the RM0 beta answer the mode clause was STANDING IN FOR -- is
  // settled, in subscription mode, with no amount owed.
  const free = await liveCheckout(operator.owner, { tag: "cc14c" });
  const settled = await deliver({
    type: EVENT.completed, intent: free.intent, registration: free.registration,
    applicant: free.sub, session: free.session,
    projection: { payment_status: "no_payment_required", mode: "subscription",
      session_status: "complete" },
  });
  assert.deepEqual(settled.result, { examined: 1, applied: 1, problems: 0 });
  assert.equal((await intentState(free.intent)).status, "paid");
  assert.equal((await paymentsFor(free.registration)).length, 1,
    "nothing owed is still a settlement, and it is the ONE disjunct that survives");
});

cell("cc.15 RED ON THE OLD DISJUNCT -- restoring it mints a payment for money that never landed", async () => {
  // The mutant panel, the way checkout-gate-c3's W-L cell drives one: the LIVE body, with exactly
  // one expression put back to its earlier cut, installed and driven inside a transaction that is
  // rolled back. Without it, cc.14 could be green because the applier is broken for everyone.
  const world = await liveCheckout(operator.owner, { tag: "cc15" });
  await applyEvents(500);
  const projection = {
    livemode: false, session_id: world.session, intent_id: world.intent,
    registration_id: world.registration, applicant: world.sub, currency: "myr", amount_total: 0,
    payment_status: "unpaid", mode: "subscription", session_status: "complete",
  };

  await withTxn(async (c) => {
    const body = (await c.query(
      "select prosrc from pg_proc where oid='clara.apply_stripe_events(integer)'::regprocedure"))
      .rows[0].prosrc;
    const needle = "v_settled := (e.payment_status in ('paid','no_payment_required')) is true;";
    assert.ok(body.includes(needle),
      "the S1 mutant anchor must match the live settlement test exactly");
    const mutant = body.replace(needle,
      "v_settled := (e.payment_status='paid' "
      + "or (e.mode='subscription' and e.session_status='complete')) is true;");
    await c.query(`create or replace function clara.apply_stripe_events(p_limit integer default 100)
      returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $mut$${mutant}$mut$`);

    await c.query("set role clara_stripe_webhook");
    await c.query("select clara.record_stripe_event($1,$2,$3::jsonb)",
      [stripeEventId("cc15mut"), EVENT.completed, JSON.stringify(projection)]);
    const swept = (await c.query("select clara.apply_stripe_events(100) as result")).rows[0].result;
    await c.query("reset role");
    assert.deepEqual(swept, { examined: 1, applied: 1, problems: 0 });
    assert.equal((await c.query(
      "select status from clara.checkout_intents where id=$1", [world.intent])).rows[0].status,
    "paid", "THE DEFECT, REPRODUCED: an UNPAID completed session was ruled settled");
    assert.equal((await c.query(
      "select count(*)::int as n from clara.firm_registration_payments where registration_id=$1",
      [world.registration])).rows[0].n, 1,
    "…and it minted a claimable payment row for money that never landed");
  }, { commit: false });

  // THE SAME EVENT SHAPE, against the body this file actually ships: a wait, and no money.
  const { result } = await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  assert.deepEqual(result, { examined: 1, applied: 1, problems: 0 });
  assert.equal((await intentState(world.intent)).status, "processing");
  assert.deepEqual(await paymentsFor(world.registration), []);
  const live = (await rootQuery(
    "select prosrc from pg_proc where oid='clara.apply_stripe_events(integer)'::regprocedure"))
    .rows[0].prosrc;
  assert.ok(!live.includes("e.mode="), "the mutant did not survive its own transaction");
});

cell("cc.16 an expired_after_paid problem RESOLVES ONCE -- the sweep never re-files it", async () => {
  // #628 review S3. The arm filed a problem and wrote no application row, so the open problem was
  // the only thing excluding the event: an operator resolving it handed the event straight back to
  // the next sweep, which filed the identical problem again. Forever, and un-clearable.
  const world = await liveCheckout(operator.owner, { tag: "cc16" });
  await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });
  const { event } = await deliver({
    type: EVENT.expired, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session, projection: { session_status: "expired" },
  });
  const filed = await problemsFor(event);
  assert.equal(filed.length, 1);
  assert.equal(filed[0].problem, PROBLEM.expiredAfterPaid);
  assert.deepEqual(await applicationFor(event), { outcome: "no_change", intent_id: world.intent });

  await resolveProblem(operator.owner, filed[0].id, "#628 cc.16 reconciled with Stripe");
  assert.ok((await problemsFor(event))[0].resolved_at, "the operator's resolution stands");

  // TWO further sweeps, because "it comes back" is a claim about the NEXT one and the one after.
  for (const pass of [1, 2]) {
    await applyEvents(500);
    const after = await problemsFor(event);
    assert.equal(after.length, 1, `pass ${pass}: no second expired_after_paid row for one event`);
    assert.ok(after[0].resolved_at, `pass ${pass}: the resolved problem stayed resolved`);
  }
  assert.equal((await intentState(world.intent)).status, "paid", "and nothing moved");
  assert.equal((await paymentsFor(world.registration)).length, 1);
});

cell("cc.17 a PROCESSING intent whose terminal webhook never comes expires, and releases the applicant", async () => {
  // #628 review S5. `processing` has exactly one exit -- a terminal asynchronous webhook -- and
  // until it arrives open_checkout_intent refuses checkout_in_progress and cancel_checkout_intent
  // refuses payment_in_flight. If it never arrives the applicant can never pay again.
  const world = await liveCheckout(operator.owner, { tag: "cc17" });
  const { event } = await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  assert.equal((await intentState(world.intent)).status, "processing");

  // The two doors are shut, which is what makes the timeout the ONLY exit.
  await assertPair(CLR.lastOwner, CONVERGENCE_REASON.paymentInFlight,
    () => cancelIntent(world.sub, world.intent), "cancelling while the payment is in flight");
  await assertPair(CLR.lastOwner, CONVERGENCE_REASON.checkoutInProgress,
    () => openIntent(world.sub, world.email, world.registration), "opening a second checkout");

  await applyEvents(500);
  // A sweep BEFORE the session could even have expired moves nothing: the timeout is a real
  // interval, not "any processing intent".
  const early = await applyEvents();
  assert.deepEqual(early, { examined: 0, applied: 0, problems: 0 },
    "a processing intent younger than a Checkout Session's lifetime is left alone");
  assert.equal((await intentState(world.intent)).status, "processing");

  // Aged past Stripe's own 24h Checkout Session lifetime (expires_at's default).
  await backdateStatus(world.intent, "25 hours");
  const swept = await applyEvents();
  assert.deepEqual(swept, { examined: 0, applied: 1, problems: 1 },
    "the timeout is an APPLIED effect and a filed problem, and it examined no event to do it");
  const expired = await intentState(world.intent);
  assert.equal(expired.status, "expired");
  assert.equal(expired.status_reason, "processing_timeout");

  // THE OPERATOR SEES IT, anchored on the very event that recorded `processing`.
  const problems = await problemsFor(event);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].problem, PROBLEM.processingTimeout);
  assert.equal(problems[0].detail.intent_id, world.intent);
  assert.equal(problems[0].detail.registration_id, world.registration);
  assert.ok(problems[0].detail.status_at, "…and WHEN the wait started");

  // THE APPLICANT IS RELEASED: a fresh intent, beside the expired one.
  const reopened = await openIntent(world.sub, world.email, world.registration);
  assert.notEqual(reopened.intent_id, world.intent);
  assert.equal((await intentsOf(world.registration)).length, 2);

  // …and a second sweep is inert -- the arm is idempotent by the state it just left behind.
  assert.deepEqual(await applyEvents(), { examined: 0, applied: 0, problems: 0 });
  assert.equal((await problemsFor(event)).length, 1);

  // MONEY IS STILL THE AUTHORITY: a payment landing afterwards is the paid_after_terminal path.
  const late = await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });
  assert.deepEqual(late.result, { examined: 1, applied: 1, problems: 1 });
  assert.equal((await intentState(world.intent)).status, "paid");
  assert.deepEqual((await problemsFor(late.event)).map((p) => p.problem), [PROBLEM.paidAfterTerminal]);
});

// ===========================================================================================
// 3 · THE CANCEL DOOR.
// ===========================================================================================

cell("cc.20 cancel entrance walls -- actor, agent, op_key, unknown intent, somebody else's intent", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc20" });
  const stranger = await insertUser("cc", "cc20_stranger");

  await assertPair(CLR.authz, CONVERGENCE_REASON.noActor, () => roleQuery(
    ROLES.authenticated, "select clara.cancel_checkout_intent($1,$2)", [world.intent, opk("cc20")]),
  "an unauthenticated caller");
  await assertPair(CLR.authz, CONVERGENCE_REASON.unknownActor, () => humanQuery(
    randomUUID(), "select clara.cancel_checkout_intent($1,$2)", [world.intent, opk("cc20")]),
  "an actor with no users row");
  await assertPair(CLR.authz, CONVERGENCE_REASON.agentActor, () => humanQuery(
    AGENT_USER_ID, "select clara.cancel_checkout_intent($1,$2)", [world.intent, opk("cc20")]),
  "the agent identity");
  await assertPair(CLR.badRequest, CONVERGENCE_REASON.invalidOpKey, () => humanQuery(
    world.sub, "select clara.cancel_checkout_intent($1,$2)", [world.intent, "   "]),
  "a blank op_key");
  await assertPair(CLR.badRequest, CONVERGENCE_REASON.invalidIntent, () => humanQuery(
    world.sub, "select clara.cancel_checkout_intent($1,$2)", [null, opk("cc20")]),
  "a null intent");
  // #628 review B7 · NO EXISTENCE ORACLE. An ABSENT intent and a FOREIGN one are ONE refusal --
  // the first cut answered CLR10 intent_not_found for the first and CLR04 not_your_intent for the
  // second, which let any caller sort ids into real and not-real. Asserted as a PAIR of identical
  // (errcode, reason) answers rather than twice over, because "identical" is the claim.
  const absent = await assertPair(CLR.authz, CONVERGENCE_REASON.notYourIntent, () => humanQuery(
    world.sub, "select clara.cancel_checkout_intent($1,$2)", [randomUUID(), opk("cc20")]),
  "an unknown intent");
  const foreign = await assertPair(CLR.authz, CONVERGENCE_REASON.notYourIntent, () => humanQuery(
    stranger, "select clara.cancel_checkout_intent($1,$2)", [world.intent, opk("cc20")]),
  "somebody else's checkout intent");
  assert.deepEqual(
    { code: absent.error.code, message: absent.error.message, detail: absent.error.detail },
    { code: foreign.error.code, message: foreign.error.message, detail: foreign.error.detail },
    "an absent intent and a foreign one are BYTE-IDENTICAL refusals -- nothing to probe with");

  assert.equal((await intentState(world.intent)).status, "session_created",
    "every refusal above left the intent exactly where it was");
});

cell("cc.21 cancel from open, session_created and payment_failed; and a terminal intent replays", async () => {
  // FROM `open` -- no Stripe session was ever created, so there is nothing for the web to expire.
  const fresh = await openedCheckout(operator.owner, { tag: "cc21a" });
  const fromOpen = await cancelIntent(fresh.sub, fresh.intent);
  assert.deepEqual(fromOpen,
    { status: "cancelled", intent_id: fresh.intent, session_id: null });
  assert.equal((await intentState(fresh.intent)).status_reason, "applicant_cancelled");

  // FROM `session_created` -- the receipt carries the session id, which is the whole reason the
  // web calls this door: it expires the Stripe session with what comes back.
  const live = await liveCheckout(operator.owner, { tag: "cc21b" });
  const fromLive = await cancelIntent(live.sub, live.intent);
  assert.deepEqual(fromLive,
    { status: "cancelled", intent_id: live.intent, session_id: live.session });

  // FROM `payment_failed` -- the retry path after a declined asynchronous payment.
  const failed = await liveCheckout(operator.owner, { tag: "cc21c" });
  await deliver({
    type: EVENT.asyncFailed, intent: failed.intent, registration: failed.registration,
    applicant: failed.sub, session: failed.session,
    projection: { last_payment_error: "fpx_declined" },
  });
  assert.equal((await intentState(failed.intent)).status, "payment_failed");
  assert.deepEqual(await cancelIntent(failed.sub, failed.intent),
    { status: "cancelled", intent_id: failed.intent, session_id: failed.session });

  // REPLAY, by the intent's own terminal state rather than by a stored key: a lost acknowledgement
  // retried under a DIFFERENT op_key is the same answer, which is the point (0163 §4 -- pre-firm
  // idempotency is structural, because op_receipts.firm_id is NOT NULL and there is no firm yet).
  const replay = await cancelIntent(live.sub, live.intent, opk("cc21-different-key"));
  assert.deepEqual(replay,
    { status: "cancelled", intent_id: live.intent, session_id: live.session, replay: true });

  // …and an EXPIRED intent replays as expired, never as cancelled: the estate does not rewrite
  // what happened to suit the verb that was called.
  const expired = await liveCheckout(operator.owner, { tag: "cc21d" });
  await deliver({
    type: EVENT.expired, intent: expired.intent, registration: expired.registration,
    applicant: expired.sub, session: expired.session, projection: { session_status: "expired" },
  });
  assert.deepEqual(await cancelIntent(expired.sub, expired.intent),
    { status: "expired", intent_id: expired.intent, session_id: expired.session, replay: true });
  assert.equal((await intentState(expired.intent)).status, "expired");
});

cell("cc.22 cancel refuses payment_in_flight and already_paid -- and neither refusal moves a thing", async () => {
  const inFlight = await liveCheckout(operator.owner, { tag: "cc22a" });
  await deliver({
    type: EVENT.completed, intent: inFlight.intent, registration: inFlight.registration,
    applicant: inFlight.sub, session: inFlight.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  const processing = await intentState(inFlight.intent);
  assert.equal(processing.status, "processing");
  const flight = await assertPair(CLR.lastOwner, CONVERGENCE_REASON.paymentInFlight,
    () => cancelIntent(inFlight.sub, inFlight.intent), "cancelling a payment in flight");
  assert.equal(flight.detail.intent_id, inFlight.intent);
  assert.equal(flight.detail.status, "processing");
  assert.deepEqual(
    { s: (await intentState(inFlight.intent)).status },
    { s: "processing" }, "the refusal left the in-flight payment alone");

  const paid = await liveCheckout(operator.owner, { tag: "cc22b" });
  await deliver({
    type: EVENT.asyncSucceeded, intent: paid.intent, registration: paid.registration,
    applicant: paid.sub, session: paid.session,
    projection: { payment_status: "paid", mode: "payment", session_status: "complete" },
  });
  const already = await assertPair(CLR.lastOwner, CONVERGENCE_REASON.alreadyPaid,
    () => cancelIntent(paid.sub, paid.intent), "cancelling a paid checkout");
  assert.equal(already.detail.status, "paid");
  assert.equal((await intentState(paid.intent)).status, "paid");

  // …and after the firm is claimed the intent is `consumed`, which answers the same way.
  await claimPaidFirm(paid.sub, paid.email, paid.registration);
  assert.equal((await intentState(paid.intent)).status, "consumed",
    "claiming the firm is what consumes the intent");
  await assertPair(CLR.lastOwner, CONVERGENCE_REASON.alreadyPaid,
    () => cancelIntent(paid.sub, paid.intent), "cancelling a consumed checkout");
});

// ===========================================================================================
// 4 · THE OPENING DOOR.
// ===========================================================================================

cell("cc.23 ONE LIVE SESSION per registration, and a terminal intent opens a fresh one", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc23" });

  const refusal = await assertPair(CLR.lastOwner, CONVERGENCE_REASON.checkoutInProgress,
    () => openIntent(world.sub, world.email, world.registration),
    "a second checkout against a live session");
  assert.equal(refusal.detail.intent_id, world.intent);
  assert.equal(refusal.detail.session_id, world.session);
  assert.equal(refusal.detail.status, "session_created");
  assert.ok(refusal.detail.status_at, "the refusal says WHEN the live session was created");
  assert.equal((await intentsOf(world.registration)).length, 1, "and it minted nothing");

  // `processing` is live too: the applicant's bank is deciding, and a second Stripe session would
  // be a second chance to take their money for one registration.
  await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  const inFlight = await assertPair(CLR.lastOwner, CONVERGENCE_REASON.checkoutInProgress,
    () => openIntent(world.sub, world.email, world.registration),
    "a second checkout while the payment is in flight");
  assert.equal(inFlight.detail.status, "processing");

  // …and every TERMINAL non-paid state opens a fresh intent beside the old one, which is what
  // makes retry after a failed, expired or abandoned payment work at all.
  const terminal = [];
  for (const [tag, finish] of [
    ["cc23fail", async (w) => deliver({
      type: EVENT.asyncFailed, intent: w.intent, registration: w.registration,
      applicant: w.sub, session: w.session, projection: { last_payment_error: "declined" } })],
    ["cc23exp", async (w) => deliver({
      type: EVENT.expired, intent: w.intent, registration: w.registration,
      applicant: w.sub, session: w.session, projection: { session_status: "expired" } })],
    ["cc23cancel", async (w) => cancelIntent(w.sub, w.intent)],
  ]) {
    const w = await liveCheckout(operator.owner, { tag });
    await finish(w);
    const reopened = await openIntent(w.sub, w.email, w.registration);
    assert.notEqual(reopened.intent_id, w.intent,
      `${tag}: a terminal intent is never reused -- a fresh one is minted`);
    const rows = await intentsOf(w.registration);
    assert.equal(rows.length, 2, `${tag}: the terminal intent is left exactly where it was`);
    terminal.push(rows.find((r) => r.id === w.intent).status);
  }
  assert.deepEqual(terminal, ["payment_failed", "expired", "cancelled"]);
});

cell("cc.24 a full estate refuses the OPENING door, before the origin rate wall", async () => {
  const world = await openedCheckout(operator.owner, { tag: "cc24pre" });
  await cancelIntent(world.sub, world.intent);           // clear the live session for the retry
  const { firms_count: count } = await rawCapacity();
  await setCapacity(operator.owner, { maxFirms: count, reason: "#628 cc.24 closed beta" });
  try {
    const before = await rootQuery(
      "select count(*)::int as n from clara.registration_rate_events where applicant=$1", [world.sub]);
    const refusal = await assertPair(CLR.lastOwner, CONVERGENCE_REASON.capacityReached,
      () => openIntent(world.sub, world.email, world.registration),
      "opening a checkout into a full estate");
    assert.equal(refusal.detail.max_firms, count);
    assert.equal(refusal.detail.firms_count, count);
    const after = await rootQuery(
      "select count(*)::int as n from clara.registration_rate_events where applicant=$1", [world.sub]);
    assert.equal(after.rows[0].n, before.rows[0].n,
      "an applicant the estate was never going to admit is not ALSO charged an origin slot");
    assert.equal((await intentsOf(world.registration)).length, 1, "…and no intent was minted");
  } finally {
    await releaseCapacity(operator.owner);
  }
  // The same call succeeds the moment the estate reopens -- the positive control, without which
  // the refusal above could be the door being broken for everyone.
  const reopened = await openIntent(world.sub, world.email, world.registration);
  assert.ok(reopened.intent_id);
});

// ===========================================================================================
// 5 · CAPACITY.
// ===========================================================================================

cell("cc.25 set_admission_capacity walls -- operator firm, owner rank, reason, op_key, sign", async () => {
  const outsider = await insertUser("cc", "cc25_outsider");
  await ordinaryFirm(outsider, "owner");
  await assertPair(CLR.authz, CONVERGENCE_REASON.notOperatorFirm,
    () => setCapacity(outsider, { maxFirms: 1 }), "an ordinary firm's owner");

  const bookkeeper = await insertUser("cc", "cc25_bookkeeper");
  await rootQuery("insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,'bookkeeper')",
    [operator.firm, bookkeeper]);
  await assertRaises(CLR.authz, () => setCapacity(bookkeeper, { maxFirms: 1 }),
    "an operator-firm bookkeeper is below the owner floor");

  await assertPair(CLR.badRequest, CONVERGENCE_REASON.invalidOpKey,
    () => setCapacity(operator.owner, { maxFirms: 1, opKey: "  " }), "a blank op_key");
  await assertPair(CLR.badRequest, CONVERGENCE_REASON.reasonRequired,
    () => setCapacity(operator.owner, { maxFirms: 1, reason: "   " }), "a blank reason");
  await assertPair(CLR.badRequest, CONVERGENCE_REASON.reasonTooLong,
    () => setCapacity(operator.owner, { maxFirms: 1, reason: "x".repeat(501) }), "a 501-character reason");
  await assertPair(CLR.badRequest, CONVERGENCE_REASON.invalidCapacity,
    () => setCapacity(operator.owner, { maxFirms: -1 }), "a negative capacity");

  const row = await rawCapacity();
  assert.equal(row.max_firms, null, "every refusal above left the estate unlimited");
});

cell("cc.26 a capacity change is receipted and op_key-idempotent", async () => {
  const key = opk("cc26");
  const first = await setCapacity(operator.owner, { maxFirms: 9999, reason: "#628 cc.26", opKey: key });
  try {
    assert.equal(first.status, "set");
    assert.equal(first.max_firms, 9999);
    assert.equal(first.reason, "#628 cc.26");
    assert.equal(first.full, false);
    assert.equal(typeof first.firms_count, "number");
    assert.ok(first.updated_at);

    // THE REPLAY IS THE ORIGINAL RECEIPT, byte-identical -- a lost acknowledgement retried.
    assert.deepEqual(
      await setCapacity(operator.owner, { maxFirms: 9999, reason: "#628 cc.26", opKey: key }),
      first, "the same op_key replays the original receipt");
    // …and the SAME key with different arguments is a typed conflict, never a second write.
    await assertPair(CLR.badRequest, CONVERGENCE_REASON.opKeyConflict,
      () => setCapacity(operator.owner, { maxFirms: 5, reason: "#628 cc.26", opKey: key }),
      "the same op_key for a different capacity");
    assert.equal((await rawCapacity()).max_firms, 9999, "the conflict wrote nothing");

    // THE RECEIPT, the way set_wake_source_enabled (0133) writes one: clara._audit, in the
    // operator firm's own trail, carrying what changed.
    const audit = await rootQuery(
      `select args from clara.audit_log
        where firm_id=$1 and fn='set_admission_capacity' order by at desc limit 1`,
      [operator.firm]);
    assert.equal(audit.rowCount, 1, "the capacity change left an audit receipt");
    assert.equal(audit.rows[0].args.max_firms, 9999);
    assert.equal(audit.rows[0].args.reason, "#628 cc.26");

    const stored = await rootQuery(
      "select max_firms, reason, updated_by from clara.admission_capacity where id");
    assert.equal(stored.rows[0].max_firms, 9999);
    assert.equal(stored.rows[0].updated_by, operator.owner, "…and the row names who changed it");
  } finally {
    await releaseCapacity(operator.owner);
  }
  assert.equal((await rawCapacity()).max_firms, null);
});

cell("cc.27 get_admission_capacity is the OPERATOR's read -- firms_count is not an applicant's business", async () => {
  // #628 review S4. The first cut answered any authenticated person, which handed every applicant
  // `firms_count`: how many firms this estate has sold. The door now carries
  // set_admission_capacity's own predicate, and the applicant's honest answer -- the BOOLEAN
  // capacity_full -- travels on get_own_checkout_progress instead (cc.30).
  const raw = await rawCapacity();
  const unlimited = await getCapacity(operator.owner);
  assert.deepEqual(unlimited,
    { max_firms: null, firms_count: raw.firms_count, full: false },
    "an unlimited estate is never full, however many firms it holds");

  await setCapacity(operator.owner, { maxFirms: raw.firms_count, reason: "#628 cc.27" });
  try {
    assert.deepEqual(await getCapacity(operator.owner),
      { max_firms: raw.firms_count, firms_count: raw.firms_count, full: true });
  } finally {
    await releaseCapacity(operator.owner);
  }

  // AN APPLICANT -- the person this door used to answer -- is refused, and an ordinary firm's
  // owner with it. Both by the operator predicate, not by rank alone.
  const applicant = await insertUser("cc", "cc27_applicant");
  await assertRaises(CLR.authz, () => getCapacity(applicant),
    "an authenticated person with no firm at all");
  const outsider = await insertUser("cc", "cc27_outsider");
  await ordinaryFirm(outsider, "owner");
  await assertPair(CLR.authz, CONVERGENCE_REASON.notOperatorFirm, () => getCapacity(outsider),
    "an ordinary firm's owner reading the estate's capacity");
  const bookkeeper = await insertUser("cc", "cc27_bookkeeper");
  await rootQuery("insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,'bookkeeper')",
    [operator.firm, bookkeeper]);
  await assertRaises(CLR.authz, () => getCapacity(bookkeeper),
    "an operator-firm bookkeeper is below the owner floor");

  await assertRaises(CLR.authz,
    () => roleQuery(ROLES.authenticated, "select clara.get_admission_capacity()"),
    "an unauthenticated capacity read");

  // The count is of NON-operator firms: the estate does not spend a beta slot on itself. Read
  // FRESH, because the refusal probes above minted an ordinary firm of their own.
  const operatorCounted = await rootQuery(
    "select count(*)::int as n from clara.firms where is_operator");
  assert.ok(operatorCounted.rows[0].n >= 1, "there IS an operator firm to exclude");
  const total = await rootQuery("select count(*)::int as n from clara.firms");
  assert.equal((await getCapacity(operator.owner)).firms_count,
    total.rows[0].n - operatorCounted.rows[0].n);
});

cell("cc.28 THE RACE -- two concurrent claims into the last slot yield exactly ONE firm", async () => {
  const a = await liveCheckout(operator.owner, { tag: "cc28a" });
  await deliver({
    type: EVENT.asyncSucceeded, intent: a.intent, registration: a.registration,
    applicant: a.sub, session: a.session,
    projection: { payment_status: "paid", mode: "payment", session_status: "complete" },
  });
  const b = await liveCheckout(operator.owner, { tag: "cc28b" });
  await deliver({
    type: EVENT.asyncSucceeded, intent: b.intent, registration: b.registration,
    applicant: b.sub, session: b.session,
    projection: { payment_status: "paid", mode: "payment", session_status: "complete" },
  });
  assert.equal((await paymentsFor(a.registration)).length, 1);
  assert.equal((await paymentsFor(b.registration)).length, 1);

  const winner = await getPool().connect();
  const loser = await getPool().connect();
  let wonFirm = null;
  try {
    // THE BARRIER IS THE DOOR'S OWN LOCK, and the whole scene is built INSIDE it. The winner takes
    // clara.admission-capacity as the session superuser first, so no concurrent claim anywhere in
    // the estate can slip between the count this cell pins and the firm it is about to create;
    // pg_advisory_xact_lock is re-entrant within one transaction, so the two doors called below
    // re-take the same key without deadlocking on the test's own hold.
    await winner.query("begin");
    await winner.query("select pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))", [CAPACITY_KEY]);
    const count = (await winner.query(
      "select count(*)::int as n from clara.firms where not is_operator")).rows[0].n;
    const winnerPid = Number((await winner.query("select pg_backend_pid() as pid")).rows[0].pid);
    await winner.query(`set role ${ROLES.authenticated}`);

    // ONE free slot, set from inside the barrier.
    await winner.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: operator.owner, role: "authenticated" })]);
    await winner.query(
      "select clara.set_admission_capacity(p_max_firms=>$1,p_reason=>$2,p_op_key=>$3)",
      [count + 1, "#628 cc.28 last slot", opk("cc28cap")]);

    // The winner takes it.
    await winner.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: a.sub, role: "authenticated", email: a.email })]);
    const won = await winner.query("select clara.claim_paid_firm($1,$2) as result",
      [a.registration, opk("cc28win")]);
    wonFirm = won.rows[0].result.firm_id;
    assert.ok(wonFirm, "the winner created a firm");

    // The loser blocks on the SAME advisory key -- proven from pg_stat_activity, never a sleep.
    const loserPid = await (async () => {
      await loser.query(`set role ${ROLES.authenticated}`);
      await loser.query("begin");
      await loser.query("select set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: b.sub, role: "authenticated", email: b.email })]);
      return Number((await loser.query("select pg_backend_pid() as pid")).rows[0].pid);
    })();
    const losing = loser.query("select clara.claim_paid_firm($1,$2) as result",
      [b.registration, opk("cc28lose")])
      .then(() => ({ error: null })).catch((error) => ({ error }));
    const waitEvent = await waitBlockedByOrThrow(loserPid, winnerPid);
    assert.equal(waitEvent, "advisory",
      "the loser waits on the ADMISSION lock specifically -- not on a row, not on a table");

    await winner.query("commit");
    const lost = await losing;
    assert.ok(lost.error, "the loser did not create a second firm");
    assert.equal(lost.error.code, CLR.lastOwner);
    const detail = JSON.parse(lost.error.detail);
    assert.equal(detail.reason, CONVERGENCE_REASON.capacityReached);
    assert.equal(detail.max_firms, count + 1);
    assert.equal(detail.firms_count, count + 1, "the loser read the count AFTER the winner's insert");
    await loser.query("rollback");

    // EXACTLY ONE FIRM, and the loser's money is still there to refund or admit later.
    const created = await rootQuery(
      "select count(*)::int as n from clara.firms where not is_operator");
    assert.equal(created.rows[0].n, count + 1, "one slot consumed, not two");
    const loserPayment = await paymentsFor(b.registration);
    assert.equal(loserPayment.length, 1);
    assert.equal(loserPayment[0].consumed_at, null, "the loser's payment stays UNCONSUMED");
    assert.equal((await intentState(b.intent)).status, "paid",
      "…and the loser's intent stays paid, not consumed");
    const loserRegistration = await rootQuery(
      "select status, firm_id from clara.firm_registration_requests where id=$1", [b.registration]);
    assert.deepEqual(loserRegistration.rows[0], { status: "open", firm_id: null },
      "the loser's registration is untouched and can be claimed when a slot opens");
    assert.equal((await intentState(a.intent)).status, "consumed");
  } finally {
    for (const c of [winner, loser]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
    await releaseCapacity(operator.owner);
  }

  // …and once the estate reopens, the loser claims the firm its payment already bought.
  const late = await claimPaidFirm(b.sub, b.email, b.registration);
  assert.ok(late.firm_id, "the loser is admitted the moment capacity allows");
  assert.notEqual(late.firm_id, wonFirm);
  assert.equal((await intentState(b.intent)).status, "consumed");
  assert.ok((await paymentsFor(b.registration))[0].consumed_at);
});

// ===========================================================================================
// 6 · THE APPLICANT-FACING READS.
// ===========================================================================================

cell("cc.30 get_own_checkout_progress carries the state, its instant, its reason and the estate's answer", async () => {
  const world = await openedCheckout(operator.owner, { tag: "cc30" });
  const opened = await ownProgress(world.sub, world.registration);
  assert.equal(opened.checkout_open, false, "0164's first fact is unmoved: an OPEN intent is not a session");
  assert.equal(opened.paid_unconsumed, false);
  assert.equal(opened.intent_status, "open");
  assert.equal(opened.intent_session_id, null);
  assert.equal(opened.intent_status_reason, null);
  assert.ok(opened.intent_status_at, "…and the state carries its instant");
  assert.equal(opened.capacity_full, false);

  const session = await stampSession(world.intent, stripeSessionId("cc30"));
  const live = await ownProgress(world.sub, world.registration);
  assert.deepEqual(
    { open: live.checkout_open, status: live.intent_status, session: live.intent_session_id },
    { open: true, status: "session_created", session });

  await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session, projection: { payment_status: "unpaid", mode: "subscription" },
  });
  const waiting = await ownProgress(world.sub, world.registration);
  assert.equal(waiting.intent_status, "processing");
  assert.equal(waiting.intent_status_reason, "unpaid",
    "THE HONEST WAIT: the applicant is told what they are waiting for, not just to wait");
  assert.equal(waiting.checkout_open, true, "…while 0164's own fact keeps its old meaning");

  // The estate's admission answer travels with the progress read, so the waiting page can say WHY
  // a retry will not help.
  await setCapacity(operator.owner, { maxFirms: (await rawCapacity()).firms_count, reason: "#628 cc.30" });
  try {
    assert.equal((await ownProgress(world.sub, world.registration)).capacity_full, true);
  } finally {
    await releaseCapacity(operator.owner);
  }

  // The MOST RECENT intent is the one reported -- the one a resume is about.
  await deliver({
    type: EVENT.expired, intent: world.intent, registration: world.registration,
    applicant: world.sub, session, projection: { session_status: "expired" },
  });
  const reopened = await openIntent(world.sub, world.email, world.registration);
  const latest = await ownProgress(world.sub, world.registration);
  assert.equal(latest.intent_status, "open");
  assert.equal(latest.intent_session_id, null);
  assert.equal((await intentsOf(world.registration)).find((r) => r.id === reopened.intent_id).status, "open");
  assert.equal(latest.checkout_open, true,
    "0164's checkout_open still answers about ANY stamped intent of the registration");
});

cell("cc.31 get_own_checkout_intent_session answers about the LIVE intent, and is no oracle", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc31" });
  assert.deepEqual(await ownIntentSession(world.sub, world.registration),
    [{ intent_id: world.intent, session_id: world.session, status: "session_created" }]);

  await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "unpaid", mode: "subscription", session_status: "complete" },
  });
  assert.deepEqual(await ownIntentSession(world.sub, world.registration),
    [{ intent_id: world.intent, session_id: world.session, status: "processing" }],
    "a payment in flight is still resumable -- the applicant may want to expire it");

  await deliver({
    type: EVENT.expired, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session, projection: { session_status: "expired" },
  });
  assert.deepEqual(await ownIntentSession(world.sub, world.registration), [],
    "a terminal intent is not a live session");

  // NO EXISTENCE ORACLE: a foreign registration and an absent one answer identically, so a caller
  // cannot enumerate other people's registrations through a resume control.
  const stranger = await insertUser("cc", "cc31_stranger");
  const live = await liveCheckout(operator.owner, { tag: "cc31b" });
  assert.deepEqual(await ownIntentSession(stranger, live.registration), [],
    "somebody else's LIVE registration answers no row");
  assert.deepEqual(await ownIntentSession(stranger, randomUUID()), [],
    "…exactly as an id that does not exist does");
  assert.deepEqual(await ownIntentSession(stranger, null), []);
  await assertRaises(CLR.authz, () => roleQuery(
    ROLES.authenticated, "select * from clara.get_own_checkout_intent_session($1)", [live.registration]),
  "an unauthenticated caller");
});

cell("cc.32 the four doors are clara_authenticated-ONLY definers with both plan pins, and the capacity predicate is nobody's", async () => {
  const doors = [
    "clara.cancel_checkout_intent(uuid,text)",
    "clara.set_admission_capacity(integer,text,text)",
    "clara.get_admission_capacity()",
    "clara.get_own_checkout_intent_session(uuid)",
    // Re-minted by 0186 (its OUT columns widened, which create-or-replace cannot do), so it is
    // held to the same standard as a new door -- including 0183's plan-cache rule, which 0164
    // predates. la.18 pins the two 0163 doors the other way, deliberately.
    "clara.get_own_checkout_progress(uuid)",
  ];
  for (const sig of doors) {
    const row = (await rootQuery(
      `select p.prosecdef, pg_get_userbyid(p.proowner) as owner,
              coalesce(p.proconfig,'{}'::text[]) as cfg,
              coalesce((select array_agg(distinct g.grantee::regrole::text order by g.grantee::regrole::text)
                          from (select (aclexplode(p.proacl)).grantee) g
                         where g.grantee::regrole::text <> 'clara_fn_owner'), '{}') as grantees,
              has_function_privilege('public', p.oid, 'execute') as public_can
         from pg_proc p where p.oid = $1::regprocedure`, [sig])).rows[0];
    assert.equal(row.prosecdef, true, `${sig} is not SECURITY DEFINER`);
    assert.equal(row.owner, "clara_fn_owner", `${sig} owner`);
    assert.deepEqual(row.grantees, ["clara_authenticated"], `${sig} EXECUTE set`);
    assert.equal(row.public_can, false, `${sig} is executable by PUBLIC`);
    assert.ok(row.cfg.includes("search_path=clara, pg_temp"), `${sig} search_path pin`);
    assert.ok(row.cfg.includes("plan_cache_mode=force_custom_plan"),
      `${sig} must pin plan_cache_mode=force_custom_plan -- a door re-shipped without it answers `
      + `CORRECTLY and slowly, which is the failure mode a correctness test cannot see`);
  }

  // 0164's first two OUT columns survive the re-mint, in order and by name: apps/web reads them.
  const outs = (await rootQuery(
    `select string_agg(t.nam||':'||format_type(t.typ,-1), ',' order by t.ord) as cols
       from pg_proc p, unnest(p.proallargtypes,p.proargmodes,p.proargnames)
              with ordinality t(typ,mode,nam,ord)
      where p.oid='clara.get_own_checkout_progress(uuid)'::regprocedure and t.mode='t'`)).rows[0].cols;
  assert.equal(outs,
    "checkout_open:boolean,paid_unconsumed:boolean,intent_status:text,"
    + "intent_status_at:timestamp with time zone,intent_status_reason:text,"
    + "intent_session_id:text,capacity_full:boolean");

  // THE CAPACITY PREDICATE IS ONE BODY AND NOBODY'S TO CALL. Every surface that asks "is the
  // estate full" asks it, so the opening door's advisory answer and the claim door's enforced wall
  // cannot drift apart.
  const state = (await rootQuery(
    `select coalesce((select array_agg(distinct g.grantee::regrole::text)
                        from (select (aclexplode(p.proacl)).grantee) g
                       where g.grantee::regrole::text <> 'clara_fn_owner'), '{}') as grantees,
            has_function_privilege('public', p.oid, 'execute') as public_can
       from pg_proc p where p.oid='clara._admission_capacity_state()'::regprocedure`)).rows[0];
  assert.deepEqual(state.grantees, [], "_admission_capacity_state is granted to nobody");
  assert.equal(state.public_can, false);
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(
    ROLES.authenticated, "select clara._admission_capacity_state()"),
  "an application role reaching the capacity predicate directly");

  const readers = (await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara'
        and position('clara._admission_capacity_state()' in p.prosrc) > 0
      order by p.proname`)).rows.map((r) => r.proname);
  assert.deepEqual(readers, [
    "claim_paid_firm", "get_admission_capacity", "get_own_checkout_progress",
    "open_checkout_intent", "set_admission_capacity",
  ], "exactly the five surfaces that need the predicate read it, and none has its own copy");

  // …and the webhook lane's blast radius is unchanged: it still reaches exactly its two verbs.
  for (const sig of doors) {
    assert.equal(
      (await rootQuery("select has_function_privilege('clara_stripe_webhook',$1,'execute') as can",
        [sig])).rows[0].can, false, `${sig} must not be reachable by the Stripe webhook lane`);
  }
});

// ===========================================================================================
// 7 · THE LOCK ORDER (#628 review S2). One order for the whole cohort: clara.checkout_intents
//     BEFORE clara.firm_registration_requests. The applier holds the intent `for update` and then
//     inserts a payment row whose fk_frp_registration_applicant (0163:231) takes KEY SHARE on the
//     registration; the claim door therefore resolves its intent WITHOUT a lock, locks the INTENT,
//     and only then the registration. The earlier cut locked the registration first, which is a
//     deadlock cycle on the one call that turns an applicant's money into a firm.
// ===========================================================================================

cell("cc.33 the two directions BLOCK, and neither deadlocks -- driven by a deterministic barrier", async () => {
  // DIRECTION 1 · a sweep is mid-arm holding the INTENT; the claim must WAIT for it.
  // The barrier is the applier's own row lock, held by a session that does nothing else, so the
  // scene is deterministic rather than a race that happens to be caught.
  const a = await liveCheckout(operator.owner, { tag: "cc33a" });
  await deliver({
    type: EVENT.asyncSucceeded, intent: a.intent, registration: a.registration,
    applicant: a.sub, session: a.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });
  const holder = await getPool().connect();
  const claimer = await getPool().connect();
  try {
    await holder.query("begin");
    await holder.query("select 1 from clara.checkout_intents where id=$1 for update", [a.intent]);
    const holderPid = Number((await holder.query("select pg_backend_pid() as pid")).rows[0].pid);

    await claimer.query(`set role ${ROLES.authenticated}`);
    await claimer.query("begin");
    await claimer.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: a.sub, role: "authenticated", email: a.email })]);
    const claimerPid = Number((await claimer.query("select pg_backend_pid() as pid")).rows[0].pid);
    const claiming = claimer.query("select clara.claim_paid_firm($1,$2) as result",
      [a.registration, opk("cc33a")])
      .then((r) => ({ result: r.rows[0].result })).catch((error) => ({ error }));

    const waitEvent = await waitBlockedByOrThrow(claimerPid, holderPid);
    assert.ok(["transactionid", "tuple"].includes(waitEvent),
      `the claim waits on the INTENT ROW held by the sweep (got ${waitEvent})`);

    await holder.query("commit");
    const claimed = await claiming;
    assert.equal(claimed.error, undefined,
      `the claim completed once the sweep let go -- it did not deadlock (${claimed.error?.code})`);
    assert.ok(claimed.result.firm_id);
    await claimer.query("commit");
    assert.equal((await intentState(a.intent)).status, "consumed");
  } finally {
    for (const c of [holder, claimer]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }

  // DIRECTION 2 · THE REVERSE. A claim is mid-flight holding the REGISTRATION; the sweep's payment
  // insert must WAIT for it on the foreign key's KEY SHARE, rather than deadlock against it.
  const b = await liveCheckout(operator.owner, { tag: "cc33b" });
  await applyEvents(500);
  const event = stripeEventId("cc33b");
  await recordEvent(event, EVENT.asyncSucceeded, {
    livemode: false, session_id: b.session, intent_id: b.intent, registration_id: b.registration,
    applicant: b.sub, currency: "myr", amount_total: 0, payment_status: "paid",
    mode: "subscription", session_status: "complete",
  });
  const regHolder = await getPool().connect();
  const sweeper = await getPool().connect();
  try {
    await regHolder.query("begin");
    await regHolder.query(
      "select 1 from clara.firm_registration_requests where id=$1 for update", [b.registration]);
    const regPid = Number((await regHolder.query("select pg_backend_pid() as pid")).rows[0].pid);

    await sweeper.query("set role clara_stripe_webhook");
    await sweeper.query("begin");
    const sweepPid = Number((await sweeper.query("select pg_backend_pid() as pid")).rows[0].pid);
    const sweeping = sweeper.query("select clara.apply_stripe_events(100) as result")
      .then((r) => ({ result: r.rows[0].result })).catch((error) => ({ error }));

    const waitEvent = await waitBlockedByOrThrow(sweepPid, regPid);
    assert.ok(["transactionid", "tuple"].includes(waitEvent),
      `the sweep waits on the REGISTRATION ROW its payment's foreign key needs (got ${waitEvent})`);

    await regHolder.query("commit");
    const swept = await sweeping;
    assert.equal(swept.error, undefined,
      `the sweep completed once the claim let go (${swept.error?.code})`);
    assert.deepEqual(swept.result, { examined: 1, applied: 1, problems: 0 });
    await sweeper.query("commit");
  } finally {
    for (const c of [regHolder, sweeper]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  assert.equal((await intentState(b.intent)).status, "paid");
  assert.equal((await paymentsFor(b.registration)).length, 1);
});

cell("cc.34 TWENTY interleavings of a sweep and a claim on ONE registration -- zero 40P01", async () => {
  // One registration, ONE payment, both bodies entering at the same instant, twenty times. Under
  // the earlier cut this is the deadlock: the claim held the registration and wanted the intent
  // while the applier held the intent and wanted the registration's KEY SHARE.
  const failures = [];
  for (let i = 0; i < 20; i += 1) {
    const w = await liveCheckout(operator.owner, { tag: `cc34x${i}` });
    await applyEvents(500);
    await recordEvent(stripeEventId("cc34"), EVENT.asyncSucceeded, {
      livemode: false, session_id: w.session, intent_id: w.intent, registration_id: w.registration,
      applicant: w.sub, currency: "myr", amount_total: 0, payment_status: "paid",
      mode: "subscription", session_status: "complete",
    });
    const [swept, claimed] = await Promise.all([
      applyEvents(100).then((result) => ({ result })).catch((error) => ({ error })),
      claimPaidFirm(w.sub, w.email, w.registration)
        .then((result) => ({ result })).catch((error) => ({ error })),
    ]);
    for (const outcome of [swept, claimed]) {
      if (outcome.error) failures.push({ pass: i, code: outcome.error.code });
    }
    // …AND THE PAIR CONVERGES. A claim that lost the race (its payment was not committed yet)
    // refuses CLR09 and the retry claims the firm the money already bought -- exactly one.
    const claim = claimed.result ?? await claimPaidFirm(w.sub, w.email, w.registration);
    assert.ok(claim.firm_id, `pass ${i}: the registration ends in a firm`);
    assert.equal((await intentState(w.intent)).status, "consumed", `pass ${i}: intent consumed`);
    assert.equal((await paymentsFor(w.registration)).length, 1, `pass ${i}: ONE payment row`);
  }
  assert.deepEqual(failures.filter((f) => f.code === "40P01" || f.code === "40001"), [],
    "not one interleaving deadlocked or serialization-failed -- the cohort takes ONE lock order");
  // The refusals that DID happen are the ordinary lost-race ones, never a transient the caller has
  // no way to interpret.
  for (const f of failures) {
    assert.equal(f.code, CLR.lastOwner, `pass ${f.pass}: an unexpected refusal ${f.code}`);
  }
});

// ===========================================================================================
// 8 · STRANDED-PAYMENT RECOVERY (spec row C-10). Every path by which money lands without a firm
//     ends in exactly ONE claim -- and an operator's own repair changes nothing twice.
// ===========================================================================================

cell("cc.35 RECOVERY (i) -- the capacity loser's payment claims ONE firm when the estate reopens", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc35" });
  await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });
  const { firms_count: count } = await rawCapacity();
  await setCapacity(operator.owner, { maxFirms: count, reason: "#628 cc.35 closed beta" });
  try {
    const refusal = await assertPair(CLR.lastOwner, CONVERGENCE_REASON.capacityReached,
      () => claimPaidFirm(world.sub, world.email, world.registration),
      "claiming into a full estate");
    assert.equal(refusal.detail.firms_count, count);
    // THE MONEY IS UNCONSUMED, THE REGISTRATION IS OPEN, and the applicant's own surface says so.
    assert.equal((await paymentsFor(world.registration))[0].consumed_at, null);
    assert.deepEqual((await rootQuery(
      "select status, firm_id from clara.firm_registration_requests where id=$1",
      [world.registration])).rows[0], { status: "open", firm_id: null });
    const waiting = await ownProgress(world.sub, world.registration);
    assert.equal(waiting.paid_unconsumed, true, "the applicant is told the money is waiting");
    assert.equal(waiting.capacity_full, true, "…and why -- by the BOOLEAN, not by firms_count");
    assert.equal(waiting.intent_status, "paid");
  } finally {
    await releaseCapacity(operator.owner);
  }

  const claimed = await claimPaidFirm(world.sub, world.email, world.registration);
  assert.ok(claimed.firm_id, "the loser is admitted the moment a slot exists");
  assert.equal((await intentState(world.intent)).status, "consumed");
  assert.ok((await paymentsFor(world.registration))[0].consumed_at);
  // ONE CLAIM: the retry is the SAME firm, replayed.
  const replay = await claimPaidFirm(world.sub, world.email, world.registration);
  assert.equal(replay.firm_id, claimed.firm_id);
  assert.equal(replay.replay, true);
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.firms where name=$1", [world.firmName])).rows[0].n, 1,
  "exactly one firm exists for this registration, after a refusal and two claims");
});

cell("cc.36 RECOVERY (ii) -- a payment on a CANCELLED intent reads as paid_unconsumed and claims ONE firm", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc36" });
  await cancelIntent(world.sub, world.intent);
  const { event } = await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });
  assert.deepEqual((await problemsFor(event)).map((p) => p.problem), [PROBLEM.paidAfterTerminal]);
  assert.deepEqual(await applicationFor(event), { outcome: "paid", intent_id: world.intent });

  // THE APPLICANT'S OWN SURFACE is what makes this recoverable rather than merely recorded.
  const stranded = await ownProgress(world.sub, world.registration);
  assert.equal(stranded.paid_unconsumed, true);
  assert.equal(stranded.intent_status, "paid");

  const claimed = await claimPaidFirm(world.sub, world.email, world.registration);
  assert.ok(claimed.firm_id);
  assert.equal((await intentState(world.intent)).status, "consumed",
    "the claim moved the intent through paid to consumed in its two admitted steps");
  assert.equal((await paymentsFor(world.registration)).length, 1);
  const replay = await claimPaidFirm(world.sub, world.email, world.registration);
  assert.equal(replay.firm_id, claimed.firm_id);
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.firms where name=$1", [world.firmName])).rows[0].n, 1);
});

cell("cc.37 RECOVERY (iii) -- an operator RESOLVING paid_after_terminal and re-sweeping changes nothing", async () => {
  const world = await liveCheckout(operator.owner, { tag: "cc37" });
  await cancelIntent(world.sub, world.intent);
  const { event } = await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });
  const filed = await problemsFor(event);
  assert.equal(filed.length, 1);
  assert.equal(filed[0].problem, PROBLEM.paidAfterTerminal);
  const before = {
    intent: (await intentState(world.intent)).status,
    payments: (await paymentsFor(world.registration)).map((r) => r.stripe_event_id),
    application: await applicationFor(event),
  };

  await resolveProblem(operator.owner, filed[0].id, "#628 cc.37 operator admitted the payment");
  for (const pass of [1, 2]) {
    await applyEvents(500);
    assert.equal((await problemsFor(event)).length, 1,
      `pass ${pass}: the resolved problem is not re-filed -- the application row already excludes it`);
  }
  assert.deepEqual({
    intent: (await intentState(world.intent)).status,
    payments: (await paymentsFor(world.registration)).map((r) => r.stripe_event_id),
    application: await applicationFor(event),
  }, before, "a resolution plus two sweeps moved nothing at all");

  // …and the firm is still claimable exactly once afterwards.
  const claimed = await claimPaidFirm(world.sub, world.email, world.registration);
  assert.ok(claimed.firm_id);
  assert.equal((await paymentsFor(world.registration)).length, 1);
});

test("cc.VACUITY CONTROL -- every declared #628 cell executed", async (t) => {
  if (await gateConvergence(t)) return;
  assert.equal(executed, EXPECTED_CELLS, `${EXPECTED_CELLS} #628 cells executed before the control`);
});
