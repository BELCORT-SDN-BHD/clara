// #628 — THE CHECKOUT CONVERGENCE BATTERY: the three Session outcomes that are not `completed`,
// against a real migrated Postgres and through the SHIPPED express router.
//
// WHAT #628 IS. A Checkout Session has four terminal outcomes, and until this ticket the webhook
// projected exactly one of them. The other three arrived, were recorded ENVELOPE-ONLY, and were
// applied by nothing: an applicant whose bank transfer failed, or whose session simply expired,
// sat on a checkout screen that never resolved and left no row anybody could read. The runtime
// half of the fix is two edits — the projector reads `data.object` for all four types, and the
// route's best-effort apply fires for all four — and this file is the evidence for both.
//
// WHY A SIBLING FILE RATHER THAN MORE CELLS IN `c5-stripe-webhook-db.test.mjs`. That file's
// subject is the ROUTE's response contract (signature, livemode, replay, redaction) and its cells
// are unchanged by #628. This file's subject is CONVERGENCE — what the intent looks like after
// each outcome — and half of it depends on migration 0186, which lands on its own schedule. Two
// gates in one file would make "green" mean two different things depending on the frontier.
//
// THE TWO GATES, AND WHY THE SECOND ONE IS A MIGRATION STEM. `skip` is the existing 0160/0161
// cohort probe. `skip186` additionally requires a `clara.schema_migrations` row whose version ends
// in `checkout_convergence` — the DB half of #628. The runtime half ships and is provable without
// it (an event of each type is recorded, projected and replay-safe whatever the applier does with
// it); the intent-state cells are not, and a cell that silently passed against an applier that
// ignores three of the four types would be worse than absent.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import { register } from "tsx/esm/api";

import * as rig from "./rig.mjs";
import { cohortGate } from "./c5-cohort-gate.mjs";
import { generateTestHeaderString } from "../lib/stripe-signature.mjs";
import {
  APPLIED_EVENT_TYPES,
  DENIED_PROJECTION_KEYS,
  FAILURE_EVENT_TYPE,
  FAILURE_REASON_KEY,
  PROJECTION_COLUMN_KEYS,
} from "../lib/stripe-projection.mjs";
import { endPools } from "../lib/pools.mjs";

register();

const WEBHOOK_SIGNING_FIXTURE = "whsec_c5cvfixture000000000000000000000";

const skip = await cohortGate(
  "the checkout gate cohort (0160/0161)",
  `select to_regprocedure('clara.record_stripe_event(text,text,jsonb)') is not null
      and to_regprocedure('clara.apply_stripe_events(integer)') is not null
      and to_regprocedure('clara.open_checkout_intent(uuid,bytea,text)') is not null as ok`,
);
const READY = skip === false;

// THE DB HALF'S OWN GATE. Read from `clara.schema_migrations` — the applied LEDGER — and never
// from the migrations directory: a file on disk that has not been applied to this database proves
// nothing about what `apply_stripe_events` will do with an event.
const skip186 =
  skip ||
  (await cohortGate(
    "#628's migration 0186 (…_checkout_convergence)",
    "select exists(select 1 from clara.schema_migrations where version ~ 'checkout_convergence$') as ok",
  ));

let server = null;
let base = "";
const priorEnv = {};
function setEnv(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in priorEnv)) priorEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

before(async () => {
  if (!READY) return;
  setEnv({
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SIGNING_FIXTURE,
    CLARA_STRIPE_LIVEMODE: "test",
    // `pepperedDigest` fails CLOSED to null without a pepper, and `open_checkout_intent` refuses
    // CLR10 `an origin digest is required` on a null — so the intent fixtures below need this set
    // even though nothing in this file measures the rate wall.
    CLARA_RATE_WALL_PEPPER: "c5cv-db-pepper",
  });
  const { stripeWebhookRoutes } = await import("../src/stripeRoutes.ts");
  const app = express();
  // The production composition: the router mounted whole, BEFORE any JSON parser.
  app.use(stripeWebhookRoutes());
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  setEnv(priorEnv);
  await endPools();
  await rig.endPool();
});

// --- fixtures ---------------------------------------------------------------

const eventId = (tag) => `evt_c5cv${tag}${randomUUID().replaceAll("-", "")}`;
const sessionId = (tag) => `cs_c5cv${tag}${randomUUID().replaceAll("-", "")}`;

/**
 * A Checkout Session event of ANY of the four applied types. The object is the SAME shape for all
 * four — that is Stripe's contract and the reason one projector cell serves them all — so the
 * caller varies only the type and the two fields the applier's arms read.
 */
function sessionEvent({
  id,
  type,
  session,
  intent = null,
  registration = null,
  applicant = null,
  paymentStatus = "paid",
  status = "complete",
  livemode = false,
  extra = {},
}) {
  return {
    id,
    object: "event",
    api_version: "2026-08-27",
    created: Math.floor(Date.now() / 1000),
    livemode,
    type,
    data: {
      object: {
        id: session,
        object: "checkout.session",
        mode: "subscription",
        status,
        payment_status: paymentStatus,
        amount_total: 0,
        currency: "myr",
        customer: `cus_${randomUUID().replaceAll("-", "")}`,
        subscription: `sub_${randomUUID().replaceAll("-", "")}`,
        metadata: {
          clara_registration_id: registration,
          clara_applicant: applicant,
          clara_intent_id: intent,
        },
        ...extra,
      },
    },
  };
}

async function deliver(event) {
  const body = Buffer.from(JSON.stringify(event), "utf8");
  const sig = generateTestHeaderString({ payload: body, secret: WEBHOOK_SIGNING_FIXTURE });
  const res = await fetch(`${base}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    body,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const storedEvent = (id) =>
  rig.rootQuery("select * from clara.stripe_events where event_id=$1", [id]).then((r) => r.rows[0] ?? null);

const readIntent = (id) =>
  rig.rootQuery("select * from clara.checkout_intents where id=$1", [id]).then((r) => r.rows[0] ?? null);

const openProblems = (id) =>
  rig
    .rootQuery(
      "select problem,detail from clara.stripe_event_problems where event_id=$1 and resolved_at is null order by problem",
      [id],
    )
    .then((r) => r.rows);

/** An authenticated human call carrying BOTH sub and email — the legal doors compare the email
 *  claim with `clara.users.email`, so the rig's default claim set is not enough. */
async function asApplicant(sub, email, sql, params = []) {
  const client = await rig.getPool().connect();
  try {
    await client.query("set role clara_authenticated");
    await client.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub, role: "authenticated", email }),
    ]);
    return await client.query(sql, params);
  } finally {
    await client.query("reset role").catch(() => {});
    await client.query("reset all").catch(() => {});
    client.release();
  }
}

/**
 * Publish one `terms` and one `dpa` fixture as root, superseding whatever is currently published.
 * 0185 made BOTH kinds a hard precondition of `open_checkout_intent`, and the repo deliberately
 * seeds no legal text, so every intent fixture needs this first. Done ONCE for the file: the
 * published pair is estate-wide state, and re-publishing per intent would only churn versions.
 */
let published = null;
async function publishLegalFixtures() {
  if (published) return published;
  const out = {};
  for (const kind of ["terms", "dpa"]) {
    await rig.rootQuery(
      "update clara.legal_documents set status='superseded' where kind=$1 and status='published'",
      [kind],
    );
    const doc = await rig.rootQuery(
      `insert into clara.legal_documents(
         kind,version,status,title,body,body_sha256,source_path,effective_from,published_at)
       select $1, coalesce(max(version),0)+1, 'published', $2, $3,
              encode(sha256(convert_to($3,'UTF8')),'hex'), 'tests/fixture', now(), now()
         from clara.legal_documents where kind=$1
       returning version, body_sha256`,
      [kind, `c5cv fixture ${kind}`, `c5cv convergence ${kind} body ${randomUUID()}`],
    );
    out[kind] = doc.rows[0];
  }
  published = out;
  return published;
}

/**
 * A fresh applicant with a stamped checkout intent — the state a real applicant is in the instant
 * Stripe redirects them to the hosted page, and therefore the ONLY honest starting point for
 * "what does the intent look like after outcome X".
 *
 * Every intent gets its OWN origin digest: `open_checkout_intent` takes a per-digest advisory lock
 * and reads a rolling rate window on it, so sharing one digest across cells would make them
 * serialise on each other and eventually trip the wall for reasons unrelated to what is measured.
 */
async function newIntent(tag) {
  const legal = await publishLegalFixtures();
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const applicant = await rig.insertUser("c5cv", suffix);
  const email = (await rig.rootQuery("select lower(email) as email from clara.users where id=$1", [applicant])).rows[0]
    .email;

  await rig.rootQuery(
    `insert into clara.stripe_object_map(object_kind,local_key,stripe_id)
       values ('price','clara-beta-2026',$1) on conflict (object_kind,local_key) do nothing`,
    [`price_${randomUUID().replaceAll("-", "")}`],
  );

  for (const kind of ["terms", "dpa"]) {
    await asApplicant(applicant, email, "select clara.accept_legal_document($1,$2,$3,$4) as r", [
      kind,
      legal[kind].version,
      legal[kind].body_sha256,
      `c5cv_${kind}_${suffix}`,
    ]);
  }

  const reg = await rig.rootQuery(
    `insert into clara.firm_registration_requests(applicant,firm_name,note,op_key)
       values ($1,$2,'#628 convergence',$3) returning id`,
    [applicant, `c5cv_${suffix}`, `c5cv_reg_${suffix}`],
  );
  const registration = reg.rows[0].id;

  const { pepperedDigest } = await import("../lib/rate-wall-courier.mjs");
  const originDigest = pepperedDigest(`c5cv-origin-${randomUUID()}`);
  assert.equal(originDigest?.length, 32, "the courier digest is 32 bytes — is CLARA_RATE_WALL_PEPPER set?");
  const opened = await asApplicant(applicant, email, "select clara.open_checkout_intent($1,$2,$3) as r", [
    registration,
    originDigest,
    `c5cv_open_${suffix}`,
  ]);
  const intent = opened.rows[0].r.intent_id;

  const session = sessionId(tag);
  await asApplicant(applicant, email, "select clara.record_checkout_session($1,$2,$3) as r", [
    intent,
    session,
    `c5cv_sess_${suffix}`,
  ]);

  return { applicant, email, registration, intent, session };
}

/** Poll until `read()` satisfies `done`, or give up. Used ONLY where the thing under test is the
 *  route's own fire-and-forget apply, which by design finishes after the 200 is written. */
async function eventually(read, done, { timeoutMs = 10_000, stepMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = await read();
    if (done(last)) return last;
    if (Date.now() >= deadline) return last;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

/** Call the applier explicitly so a cell never depends on the route's best-effort fire having
 *  won the race. `c5cv.9` is the one cell that deliberately does NOT do this. Returns the door's
 *  own `{examined,applied,problems}` receipt so a cell can assert on the sweep, not just its
 *  aftermath. */
const sweep = async () => {
  const { applyStripeEvents } = await import("../lib/checkout-pools.mjs");
  return await applyStripeEvents(200);
};

// --- the runtime half: provable without 0186 --------------------------------

test("c5cv.1 all four applied types are RECORDED with the full projected shape", { skip }, async () => {
  for (const type of APPLIED_EVENT_TYPES) {
    const id = eventId("shape");
    const session = sessionId("shape");
    const intent = randomUUID();
    const res = await deliver(
      sessionEvent({ id, type, session, intent, registration: randomUUID(), applicant: randomUUID() }),
    );
    assert.equal(res.status, 200, type);
    assert.deepEqual(res.json, { received: true, recorded: true }, type);

    const row = await storedEvent(id);
    assert.ok(row, `${type} must be recorded`);
    assert.equal(row.type, type, "the type is its own NOT NULL column, never a jsonb duplicate");
    assert.equal(Object.hasOwn(row.projection, "type"), false, `${type}: no duplicated type key`);
    // THE REGRESSION THIS CELL EXISTS FOR: before #628 the three non-completed types projected to
    // `{created, api_version, livemode}` and every typed column was NULL, so the applier had
    // nothing to match an intent on.
    assert.equal(row.session_id, session, `${type}: session_id`);
    assert.equal(row.intent_id, intent, `${type}: intent_id`);
    assert.equal(row.currency, "myr", `${type}: currency`);
    for (const key of PROJECTION_COLUMN_KEYS) {
      assert.equal(Object.hasOwn(row.projection, key), true, `${type}: the stored projection must carry ${key}`);
    }
  }
});

test("c5cv.2 裁-91 holds on every new type — the person never reaches the row", { skip }, async () => {
  // The redaction wall is per-CELL, not per-type, and #628 routed three more types through that
  // cell. If it had instead grown three near-copies, this is the cell that would find it.
  const sentinel = {
    email: `LEAKMAIL-${randomUUID()}@example.test`,
    name: `LEAKNAME-${randomUUID()}`,
    address: `LEAKADDR-${randomUUID()}`,
    card: `LEAKCARD-${randomUUID()}`,
    prose: `LEAKPROSE-${randomUUID()}`,
  };
  for (const type of APPLIED_EVENT_TYPES) {
    const id = eventId("pii");
    const res = await deliver(
      sessionEvent({
        id,
        type,
        session: sessionId("pii"),
        extra: {
          customer_details: { email: sentinel.email, name: sentinel.name, address: { line1: sentinel.address } },
          customer_email: sentinel.email,
          billing_details: { name: sentinel.name },
          shipping_details: { name: sentinel.name },
          payment_method_details: { card: { fingerprint: sentinel.card } },
          // An EXPANDED customer — a scalar today, an object the moment anyone adds
          // `expand:['customer']` — and the failure error's human message, which Stripe writes
          // for the cardholder and which #628's new read sits right beside.
          customer: { id: "cus_expanded", email: sentinel.email, name: sentinel.name },
          last_payment_error: { code: "card_declined", message: sentinel.prose },
        },
      }),
    );
    assert.equal(res.status, 200, type);
    const row = await storedEvent(id);
    assert.ok(row, type);
    for (const denied of DENIED_PROJECTION_KEYS) {
      assert.equal(Object.hasOwn(row.projection, denied), false, `${type}: ${denied} reached the row`);
    }
    assert.equal(row.customer_id, null, `${type}: an expanded customer must be stripped to null`);
    const whole = JSON.stringify(row);
    for (const [field, value] of Object.entries(sentinel)) {
      assert.equal(whole.includes(value), false, `${type}: the ${field} sentinel reached an append-only table`);
    }
  }
});

test("c5cv.3 the failure code is stored, and ONLY on async_payment_failed", { skip }, async () => {
  const failed = eventId("fail");
  const res = await deliver(
    sessionEvent({
      id: failed,
      type: FAILURE_EVENT_TYPE,
      session: sessionId("fail"),
      paymentStatus: "unpaid",
      status: "open",
      extra: { last_payment_error: { code: "card_declined", decline_code: "insufficient_funds" } },
    }),
  );
  assert.equal(res.status, 200);
  const row = await storedEvent(failed);
  // The ISSUER's reason, not the generic envelope around it — `apps/web/lib/checkout/
  // payment-failure.ts` has a sentence for `insufficient_funds` and only a generic one for
  // `card_declined`, so which of the two is stored decides what the applicant reads.
  assert.equal(row.projection[FAILURE_REASON_KEY], "insufficient_funds");
  assert.equal(row.payment_status, "unpaid");
  // It is NOT a typed column — `record_stripe_event` has no such argument — so a migration that
  // adds one would need this assertion revisited rather than silently double-storing.
  assert.equal(PROJECTION_COLUMN_KEYS.includes(FAILURE_REASON_KEY), false);

  // Absent on the wire is a stored NULL under a PRESENT key: "we looked" is recorded.
  const quiet = eventId("quiet");
  await deliver(
    sessionEvent({ id: quiet, type: FAILURE_EVENT_TYPE, session: sessionId("quiet"), paymentStatus: "unpaid" }),
  );
  const quietRow = await storedEvent(quiet);
  assert.equal(Object.hasOwn(quietRow.projection, FAILURE_REASON_KEY), true);
  assert.equal(quietRow.projection[FAILURE_REASON_KEY], null);

  // …and the other three never carry the key even when the session object does carry the field.
  for (const type of APPLIED_EVENT_TYPES.filter((t) => t !== FAILURE_EVENT_TYPE)) {
    const id = eventId("nofail");
    await deliver(
      sessionEvent({ id, type, session: sessionId("nofail"), extra: { last_payment_error: { code: "card_declined" } } }),
    );
    const other = await storedEvent(id);
    assert.equal(Object.hasOwn(other.projection, FAILURE_REASON_KEY), false, type);
    assert.equal(JSON.stringify(other.projection).includes("card_declined"), false, type);
  }
});

test("c5cv.4 replay is idempotent on every new type — one row, recorded:false", { skip }, async () => {
  for (const type of APPLIED_EVENT_TYPES) {
    const id = eventId("rp");
    const ev = sessionEvent({ id, type, session: sessionId("rp") });
    assert.deepEqual((await deliver(ev)).json, { received: true, recorded: true }, type);
    // The RETURN VALUE is load-bearing: a door whose `on conflict do nothing` became a plain
    // insert would RAISE here, and a row-count assertion alone would stay green.
    assert.deepEqual((await deliver(ev)).json, { received: true, recorded: false }, type);
    const n = await rig.rootQuery("select count(*)::int as n from clara.stripe_events where event_id=$1", [id]);
    assert.equal(n.rows[0].n, 1, type);
  }
});

test("c5cv.5 a malformed data.object on a NEW type is a 400 and records nothing", { skip }, async () => {
  // The widening's own hazard: three types that used to reach only the envelope cell now reach a
  // cell that dereferences `data.object`. The refusal must be the SAME typed 400 the completed
  // arm has always answered — never a 500, which reads like an outage while Stripe retries for
  // days with nothing stored.
  for (const type of APPLIED_EVENT_TYPES) {
    const id = eventId("malf");
    const ev = sessionEvent({ id, type, session: sessionId("malf") });
    ev.data = { object: null };
    const res = await deliver(ev);
    assert.equal(res.status, 400, type);
    assert.deepEqual(res.json, { error: "event_malformed" }, type);
    assert.equal(await storedEvent(id), null, `${type}: a refused event must not be recorded`);
  }
});

test("c5cv.6 an unrecognised checkout.session type is STILL envelope-only", { skip }, async () => {
  // The list is an allow-list of TYPES. A neighbour Stripe already sends —
  // `checkout.session.async_payment_pending` — must not acquire a projection by living in the
  // same namespace, or the next Stripe event kind arrives with a shape nobody reviewed.
  const id = eventId("env");
  const res = await deliver(
    sessionEvent({ id, type: "checkout.session.async_payment_pending", session: sessionId("env") }),
  );
  assert.equal(res.status, 200);
  const row = await storedEvent(id);
  assert.deepEqual(Object.keys(row.projection).sort(), ["api_version", "created", "livemode"]);
  assert.equal(row.session_id, null);
});

// --- the convergence half: gated on migration 0186 --------------------------
//
// ASSUMPTIONS THIS HALF STANDS ON, stated because 0186 is being written in parallel and these
// cells are the first thing that will notice a disagreement:
//   · `clara.checkout_intents` gains `status` and `status_reason`;
//   · the status vocabulary is `processing` / `paid` / `payment_failed` / `expired`;
//   · the failure reason reaches `status_reason` from the projection key of the same name
//     (`lib/stripe-projection.mjs`'s `FAILURE_REASON_KEY`) — this is the ONE name shared across
//     the runtime/DB boundary, and a mismatch surfaces here as a red cell rather than as a
//     column that is silently NULL on every failed checkout;
//   · the expired-after-paid problem is filed as `expired_after_paid`;
//   · when two settling events describe one session, the FIRST one applied owns the single
//     `firm_registration_payments` row (`c5cv.11`) — 0160's `on conflict (stripe_event_id) do
//     nothing` plus `uq_frp_registration` already give that shape, and nothing in #628 asks for
//     it to change.
//
// The `status` vocabulary above is not a guess: `apps/web/lib/registration/
// checkout-progress-reads.ts` (the web lane's half of #628) spells `clara.checkout_intents.
// status`'s closed set as open / session_created / processing / paid / consumed / expired /
// payment_failed / cancelled, and its `payment-failure.ts` consumes `status_reason` as a Stripe
// machine token. The ONE thing no other lane's source states is the PROJECTION key those tokens
// travel under, which is why `FAILURE_REASON_KEY` is named in the projector and asserted here.

test("c5cv.7 an UNPAID completed session leaves the intent processing, with no problem row", { skip: skip186 }, async () => {
  const fx = await newIntent("proc");
  const id = eventId("proc");
  const res = await deliver(
    sessionEvent({
      id,
      type: "checkout.session.completed",
      session: fx.session,
      intent: fx.intent,
      registration: fx.registration,
      applicant: fx.applicant,
      paymentStatus: "unpaid",
      status: "complete",
    }),
  );
  assert.equal(res.status, 200);
  await sweep();

  const intent = await readIntent(fx.intent);
  assert.equal(intent.status, "processing", "an unpaid completed session is in flight, not settled");
  // AND NO PROBLEM ROW. This is the half that matters: `processing` is a normal waypoint for an
  // async payment method, so filing `payment_not_settled` for it would fill an operator queue
  // with checkouts that are simply still running.
  assert.deepEqual(await openProblems(id), []);
  const payments = await rig.rootQuery(
    "select count(*)::int as n from clara.firm_registration_payments where registration_id=$1",
    [fx.registration],
  );
  assert.equal(payments.rows[0].n, 0, "nothing is paid yet, so no payment row");
});

test("c5cv.8 async_payment_succeeded settles the intent exactly like a paid completed", { skip: skip186 }, async () => {
  const fx = await newIntent("asok");
  const id = eventId("asok");
  assert.equal(
    (
      await deliver(
        sessionEvent({
          id,
          type: "checkout.session.async_payment_succeeded",
          session: fx.session,
          intent: fx.intent,
          registration: fx.registration,
          applicant: fx.applicant,
          paymentStatus: "paid",
        }),
      )
    ).status,
    200,
  );
  await sweep();

  assert.equal((await readIntent(fx.intent)).status, "paid");
  const payment = await rig.rootQuery(
    "select stripe_event_id,consumed_at from clara.firm_registration_payments where registration_id=$1",
    [fx.registration],
  );
  assert.equal(payment.rowCount, 1, "the late success must mint exactly one payment row");
  assert.equal(payment.rows[0].stripe_event_id, id, "…attributed to the event that carried it");
  assert.equal(payment.rows[0].consumed_at, null);
  assert.deepEqual(await openProblems(id), []);
});

test("c5cv.9 async_payment_failed fails the intent and carries the CODE, not the prose", { skip: skip186 }, async () => {
  const fx = await newIntent("asno");
  const id = eventId("asno");
  assert.equal(
    (
      await deliver(
        sessionEvent({
          id,
          type: FAILURE_EVENT_TYPE,
          session: fx.session,
          intent: fx.intent,
          registration: fx.registration,
          applicant: fx.applicant,
          paymentStatus: "unpaid",
          status: "open",
          extra: {
            last_payment_error: {
              code: "payment_intent_payment_attempt_failed",
              message: "The customer's bank declined the transfer.",
            },
          },
        }),
      )
    ).status,
    200,
  );
  await sweep();

  const intent = await readIntent(fx.intent);
  assert.equal(intent.status, "payment_failed");
  assert.equal(
    intent.status_reason,
    "payment_intent_payment_attempt_failed",
    `the intent's status_reason must come from the projection's '${FAILURE_REASON_KEY}' key — if this is ` +
      "NULL, the runtime and 0186 disagree on that ONE shared name; align them rather than relaxing this cell",
  );
  // No payment row, and the human prose is nowhere in the estate.
  const payments = await rig.rootQuery(
    "select count(*)::int as n from clara.firm_registration_payments where registration_id=$1",
    [fx.registration],
  );
  assert.equal(payments.rows[0].n, 0);
  assert.equal(JSON.stringify(await storedEvent(id)).includes("bank declined"), false);
});

test("c5cv.10 an expired session expires the intent", { skip: skip186 }, async () => {
  const fx = await newIntent("exp");
  const id = eventId("exp");
  assert.equal(
    (
      await deliver(
        sessionEvent({
          id,
          type: "checkout.session.expired",
          session: fx.session,
          intent: fx.intent,
          registration: fx.registration,
          applicant: fx.applicant,
          paymentStatus: "unpaid",
          status: "expired",
        }),
      )
    ).status,
    200,
  );
  await sweep();
  assert.equal((await readIntent(fx.intent)).status, "expired");
  const payments = await rig.rootQuery(
    "select count(*)::int as n from clara.firm_registration_payments where registration_id=$1",
    [fx.registration],
  );
  assert.equal(payments.rows[0].n, 0, "an expired checkout must never mint a payment row");
});

test("c5cv.11 THE REORDER PAIR — async_payment_succeeded BEFORE completed is ONE payment", { skip: skip186 }, async () => {
  // Stripe does not promise delivery order, and both of these events describe the SAME settled
  // session. The FIRST one to settle owns the one `firm_registration_payments` row; the SECOND is
  // not silently dropped -- `uq_frp_registration` surfaces it as a `duplicate_payment` problem for
  // an operator (0160 BLOCKER-4; db cell `cc.12` in `packages/db/tests/checkout-convergence.test
  // .mjs`), and the intent must not walk backwards off `paid` either.
  //
  // Both events go through the SHIPPED webhook route (`deliver`), and c5cv.13 is the proof that
  // route fires its OWN best-effort apply outside the response path for every one of these four
  // types. That means an explicit `sweep()` called right after `deliver()` races that background
  // fire: whichever side loses a given race legitimately sees `{applied:0,problems:0}` for an
  // event the OTHER side just finished -- not a bug, just two appliers reaching for the same row.
  // `eventually()` waits the race out on OBSERVABLE STATE; a sweep taken only once nothing is left
  // pending is the deterministic moment to assert its receipt is quiescent.
  const fx = await newIntent("reord");
  const late = eventId("late");
  const done = eventId("done");
  const common = {
    session: fx.session,
    intent: fx.intent,
    registration: fx.registration,
    applicant: fx.applicant,
    paymentStatus: "paid",
  };
  assert.equal((await deliver(sessionEvent({ id: late, type: "checkout.session.async_payment_succeeded", ...common }))).status, 200);
  await sweep();
  await eventually(() => readIntent(fx.intent), (row) => row?.status === "paid");
  assert.deepEqual(
    await sweep(),
    { examined: 0, applied: 0, problems: 0 },
    "the FIRST event is fully settled -- a later sweep finds nothing left to do",
  );

  assert.equal((await deliver(sessionEvent({ id: done, type: "checkout.session.completed", ...common }))).status, 200);
  await sweep();
  await eventually(() => openProblems(done), (probs) => probs.length > 0);
  assert.deepEqual(
    await sweep(),
    { examined: 0, applied: 0, problems: 0 },
    "the SECOND event is filed exactly once -- not re-examined by a later sweep",
  );

  const payments = await rig.rootQuery(
    "select stripe_event_id from clara.firm_registration_payments where registration_id=$1",
    [fx.registration],
  );
  assert.equal(payments.rowCount, 1, "the two events describe ONE settlement — a second row is a double charge on the books");
  assert.equal(payments.rows[0].stripe_event_id, late, "the FIRST event to settle owns the row");
  assert.equal((await readIntent(fx.intent)).status, "paid", "a filed duplicate does not walk the intent back off paid");
  // The second event IS a problem an operator must see -- uq_frp_registration, never a bare 23505.
  assert.deepEqual((await openProblems(done)).map((p) => p.problem), ["duplicate_payment"]);
});

test("c5cv.12 EXPIRED AFTER PAID is a problem an operator can see", { skip: skip186 }, async () => {
  // The one reordering that is NOT benign: an `expired` arriving after the session settled means
  // Stripe and this estate disagree about what happened, and money may already have moved. The
  // intent must not be walked back to `expired` silently, and somebody must be told.
  const fx = await newIntent("expaid");
  const paid = eventId("wasp");
  const expired = eventId("thenx");
  const common = { session: fx.session, intent: fx.intent, registration: fx.registration, applicant: fx.applicant };
  assert.equal((await deliver(sessionEvent({ id: paid, type: "checkout.session.completed", ...common }))).status, 200);
  await sweep();
  assert.equal((await readIntent(fx.intent)).status, "paid");

  assert.equal(
    (
      await deliver(
        sessionEvent({ id: expired, type: "checkout.session.expired", ...common, paymentStatus: "unpaid", status: "expired" }),
      )
    ).status,
    200,
  );
  await sweep();

  assert.deepEqual(
    (await openProblems(expired)).map((p) => p.problem),
    ["expired_after_paid"],
  );
  const payments = await rig.rootQuery(
    "select count(*)::int as n from clara.firm_registration_payments where registration_id=$1",
    [fx.registration],
  );
  assert.equal(payments.rows[0].n, 1, "the payment that already settled is not withdrawn by a late expiry");
});

test("c5cv.13 the ROUTE's best-effort apply fires for each of the four types", { skip: skip186 }, async () => {
  // ITEM 2 MEASURED WITHOUT A SPY. Nothing here calls `apply_stripe_events`: the only thing that
  // can move these intents is the route's own post-response fire, so convergence IS the evidence
  // that the trigger widened. A stub spy would have tested the stub; before #628 three of these
  // four would sit at their opening state until the 60 s sweep, which is the whole defect.
  const cases = [
    ["checkout.session.async_payment_succeeded", "paid", "paid"],
    [FAILURE_EVENT_TYPE, "unpaid", "payment_failed"],
    ["checkout.session.expired", "unpaid", "expired"],
    ["checkout.session.completed", "paid", "paid"],
  ];
  for (const [type, paymentStatus, expected] of cases) {
    const fx = await newIntent("fire");
    const id = eventId("fire");
    assert.equal(
      (
        await deliver(
          sessionEvent({
            id,
            type,
            session: fx.session,
            intent: fx.intent,
            registration: fx.registration,
            applicant: fx.applicant,
            paymentStatus,
            status: type === "checkout.session.expired" ? "expired" : "complete",
          }),
        )
      ).status,
      200,
    );
    const intent = await eventually(() => readIntent(fx.intent), (row) => row?.status === expected);
    assert.equal(
      intent.status,
      expected,
      `${type}: the route's best-effort apply never ran — the trigger is still narrower than APPLIED_EVENT_TYPES`,
    );
  }
});
