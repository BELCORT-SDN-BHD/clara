// FS-4 C-5 — the STRIPE WEBHOOK battery, against a real migrated Postgres and through the
// SHIPPED express router.
//
// EVERY CELL DRIVES THE ROUTER, NOT A COPY OF ITS PREDICATE (裁-107). The app is composed the
// way `src/index.ts` composes it — the exported router mounted whole, with its own raw parser —
// so a cell that asserts "a forged signature calls no door" is watching the real handler decide,
// not a re-implementation of the same `if`.
//
// THE ROW COUNT IS THE SPY (W-A2). The design's cell asks for a spy proving
// `record_stripe_event` was not called on a forged request. A stub spy would test the stub; the
// database is the honest instrument, so every refusal cell asserts BOTH the status AND that the
// event id is absent from `clara.stripe_events` afterwards.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import { register } from "tsx/esm/api";

import * as rig from "./rig.mjs";
import { cohortGate } from "./c5-cohort-gate.mjs";
import { generateTestHeaderString } from "../lib/stripe-signature.mjs";
import { PROJECTION_COLUMN_KEYS, DENIED_PROJECTION_KEYS } from "../lib/stripe-projection.mjs";
import { applyStripeEvents } from "../lib/checkout-pools.mjs";
import { endPools } from "../lib/pools.mjs";

register();

const WEBHOOK_SIGNING_FIXTURE = "whsec_c5dbfixture000000000000000000000";
const PEPPER_FIXTURE = "c5-db-pepper";
const TRUSTED_HEADER = "x-clara-test-client-ip";

const skip = await cohortGate(
  "the checkout gate cohort (0160/0161)",
  `select to_regprocedure('clara.record_stripe_event(text,text,jsonb)') is not null
      and to_regprocedure('clara.apply_stripe_events(integer)') is not null
      and to_regprocedure('clara.claim_paid_firm(uuid,text)') is not null as ok`,
);
const READY = skip === false;

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
    CLARA_RATE_WALL_PEPPER: PEPPER_FIXTURE,
    CLARA_TRUSTED_CLIENT_IP_HEADER: TRUSTED_HEADER,
  });
  const { stripeWebhookRoutes } = await import("../src/stripeRoutes.ts");
  const app = express();
  // The production composition: the router mounted whole, BEFORE any JSON parser.
  app.use(stripeWebhookRoutes());
  app.use(express.json({ limit: "1mb" }));
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

const eventId = (tag) => `evt_c5${tag}${randomUUID().replaceAll("-", "")}`;
const sessionId = (tag) => `cs_c5${tag}${randomUUID().replaceAll("-", "")}`;

function completedEvent({ id, session, intent, registration, applicant, livemode = false, extra = {} }) {
  return {
    id,
    object: "event",
    api_version: "2026-08-27",
    created: Math.floor(Date.now() / 1000),
    livemode,
    type: "checkout.session.completed",
    data: {
      object: {
        id: session,
        object: "checkout.session",
        mode: "subscription",
        status: "complete",
        payment_status: "paid",
        amount_total: 0,
        currency: "myr",
        customer: `cus_${randomUUID().replaceAll("-", "")}`,
        subscription: `sub_${randomUUID().replaceAll("-", "")}`,
        metadata: {
          clara_registration_id: registration ?? null,
          clara_applicant: applicant ?? null,
          clara_intent_id: intent ?? null,
        },
        ...extra,
      },
    },
  };
}

/** POST a payload through the shipped router. `sign:false` forges the signature. */
async function deliver(event, { sign = true, header = null, timestamp = null } = {}) {
  const body = Buffer.from(JSON.stringify(event), "utf8");
  const sig =
    header ??
    (sign
      ? generateTestHeaderString({
          payload: body,
          secret: WEBHOOK_SIGNING_FIXTURE,
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
        })
      : generateTestHeaderString({
          payload: body,
          secret: "whsec_forged_key_the_endpoint_does_not_hold",
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
        }));
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

/** An authenticated human call carrying BOTH sub and email — `claim_paid_firm` compares the
 *  email claim with `clara.users.email`, so the rig's default claim set is not enough. */
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

// ---------------------------------------------------------------------------

test("c5db.1 W-A1/W-A2 — a forged signature is 400 AND calls no door", { skip }, async () => {
  const id = eventId("forge");
  const res = await deliver(completedEvent({ id, session: sessionId("forge") }), { sign: false });
  assert.equal(res.status, 400);
  assert.deepEqual(res.json, { error: "signature_invalid" });
  assert.equal(await storedEvent(id), null, "a forged event must not reach clara.stripe_events");

  // An ABSENT header is its own arm — W-A2 exists because W-A1's mutant leaves this
  // unexercised.
  const id2 = eventId("nohdr");
  const body = Buffer.from(JSON.stringify(completedEvent({ id: id2, session: sessionId("nohdr") })), "utf8");
  const bare = await fetch(`${base}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(bare.status, 400);
  assert.equal(await storedEvent(id2), null);
});

test("c5db.2 W-B replay — the same event id twice is ONE row and recorded:false", { skip }, async () => {
  const id = eventId("replay");
  const ev = completedEvent({ id, session: sessionId("replay") });
  const first = await deliver(ev);
  assert.equal(first.status, 200);
  assert.deepEqual(first.json, { received: true, recorded: true });

  const second = await deliver(ev);
  assert.equal(second.status, 200);
  // THE RETURN VALUE IS LOAD-BEARING (the design says so): a mutant that turns the door's
  // `on conflict do nothing` into a plain insert makes the second call RAISE, so row counts
  // alone would be unchanged and this cell would stay green on the count assertion.
  assert.deepEqual(second.json, { received: true, recorded: false });

  const rows = await rig.rootQuery("select count(*)::int as n from clara.stripe_events where event_id=$1", [id]);
  assert.equal(rows.rows[0].n, 1);

  // Two DIFFERENT ids are two rows, both recorded:true — the positive control.
  const idA = eventId("ra");
  const idB = eventId("rb");
  assert.equal((await deliver(completedEvent({ id: idA, session: sessionId("ra") }))).json.recorded, true);
  assert.equal((await deliver(completedEvent({ id: idB, session: sessionId("rb") }))).json.recorded, true);
  assert.ok(await storedEvent(idA));
  assert.ok(await storedEvent(idB));
});

test("c5db.3 A-M5 the livemode gate, BOTH polarities, before the door", { skip }, async () => {
  // Configured for test mode (the `before` block): a livemode:true event is refused.
  const live = eventId("live");
  const refused = await deliver(completedEvent({ id: live, session: sessionId("live"), livemode: true }));
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.json, { error: "livemode_mismatch" });
  assert.equal(await storedEvent(live), null, "the gate must refuse BEFORE record_stripe_event");

  // The mirror: configured for LIVE mode, a test-mode event is refused. This is the polarity
  // that matters — it is the one that stops a free test card minting a real firm after the flip.
  setEnv({ CLARA_STRIPE_LIVEMODE: "live" });
  const test1 = eventId("tst");
  const refused2 = await deliver(completedEvent({ id: test1, session: sessionId("tst"), livemode: false }));
  assert.equal(refused2.status, 403);
  assert.equal(await storedEvent(test1), null);
  // …and the matching event passes, so the cell is not merely "everything is refused".
  const live2 = eventId("lv2");
  assert.equal((await deliver(completedEvent({ id: live2, session: sessionId("lv2"), livemode: true }))).status, 200);
  assert.ok(await storedEvent(live2));

  // UNCONFIGURED FAILS CLOSED — 503, and nothing recorded.
  setEnv({ CLARA_STRIPE_LIVEMODE: undefined });
  const unset = eventId("unset");
  const refused3 = await deliver(completedEvent({ id: unset, session: sessionId("unset") }));
  assert.equal(refused3.status, 503);
  assert.deepEqual(refused3.json, { error: "livemode_not_configured" });
  assert.equal(await storedEvent(unset), null);

  setEnv({ CLARA_STRIPE_LIVEMODE: "test" });
});

test("c5db.4 裁-91 — the stored row carries the keys and NONE of the person", { skip }, async () => {
  const id = eventId("pii");
  const session = sessionId("pii");
  const registration = randomUUID();
  const applicant = randomUUID();
  const intent = randomUUID();
  const res = await deliver(
    completedEvent({
      id,
      session,
      intent,
      registration,
      applicant,
      extra: {
        customer_details: { email: "leak@example.test", name: "Leak Person", address: { line1: "1 Road" } },
        customer_email: "leak@example.test",
        billing_details: { name: "Leak Person" },
        shipping_details: { name: "Leak Person" },
        payment_method_details: { card: { last4: "4242" } },
      },
    }),
  );
  assert.equal(res.status, 200);
  const row = await storedEvent(id);
  assert.ok(row, "the event must be recorded");
  assert.equal(row.session_id, session);
  assert.equal(row.registration_id, registration);
  assert.equal(row.applicant, applicant);
  assert.equal(row.intent_id, intent);
  assert.equal(row.payment_status, "paid");
  assert.equal(row.mode, "subscription");
  assert.equal(row.session_status, "complete");
  assert.equal(row.currency, "myr");
  assert.equal(row.livemode, false);
  for (const denied of DENIED_PROJECTION_KEYS) {
    assert.equal(Object.hasOwn(row.projection, denied), false, `${denied} reached the row`);
  }
  const wholeRow = JSON.stringify(row);
  assert.equal(wholeRow.includes("leak@example.test"), false, "an address reached an append-only table");
  assert.equal(wholeRow.includes("Leak Person"), false);
  assert.equal(wholeRow.includes("4242"), false);
});

test("c5db.5 the ACCEPTANCE WALK — signed event to a minted firm, end to end", { skip }, async () => {
  const tag = randomUUID().slice(0, 8);
  const applicant = await rig.insertUser("c5", tag);
  const emailRow = await rig.rootQuery("select lower(email) as email from clara.users where id=$1", [applicant]);
  const email = emailRow.rows[0].email;

  // The price map must resolve — `open_checkout_intent` refuses CLR10 without it. This is the
  // ops act the PR body names: the ids are written into `clara.stripe_object_map` from the
  // sandbox objects, never authored in code (裁-42).
  await rig.rootQuery(
    `insert into clara.stripe_object_map(object_kind,local_key,stripe_id)
       values ('price','clara-beta-2026',$1) on conflict (object_kind,local_key) do nothing`,
    [`price_${randomUUID().replaceAll("-", "")}`],
  );

  const dpa = await rig.rootQuery("select version,body_sha256 from clara.dpa_documents where effective_to is null");
  await asApplicant(applicant, email, "select clara.sign_dpa($1,$2,$3) as r", [
    dpa.rows[0].version,
    dpa.rows[0].body_sha256,
    `c5sign_${tag}`,
  ]);

  const reg = await rig.rootQuery(
    `insert into clara.firm_registration_requests(applicant,firm_name,note,op_key)
       values ($1,$2,'c5 acceptance walk',$3) returning id,firm_name`,
    [applicant, `c5_${tag}`, `c5reg_${tag}`],
  );
  const registration = reg.rows[0].id;

  // The COURIER's own digest — the same construction the auth wall uses, 32 bytes.
  const { pepperedDigest } = await import("../lib/rate-wall-courier.mjs");
  const originDigest = pepperedDigest(`203.0.113.${(parseInt(tag, 16) % 200) + 10}`);
  assert.equal(originDigest.length, 32);

  const opened = await asApplicant(applicant, email, "select clara.open_checkout_intent($1,$2,$3) as r", [
    registration,
    originDigest,
    `c5open_${tag}`,
  ]);
  const intent = opened.rows[0].r.intent_id;
  assert.ok(intent);
  assert.ok(opened.rows[0].r.stripe_price_id.startsWith("price_"), "the price id comes from stripe_object_map");

  const session = sessionId("walk");
  await asApplicant(applicant, email, "select clara.record_checkout_session($1,$2,$3) as r", [
    intent,
    session,
    `c5sess_${tag}`,
  ]);

  const id = eventId("walk");
  const delivered = await deliver(completedEvent({ id, session, intent, registration, applicant }));
  assert.equal(delivered.status, 200);
  assert.equal(delivered.json.recorded, true);

  // The applier — called explicitly rather than waiting on the route's best-effort fire, so
  // this cell measures the SWEEP (step 6, the real guarantee) and not a race with step 5.
  const swept = await applyStripeEvents(100);
  assert.ok(Number(swept.examined) >= 1, `the sweep examined nothing: ${JSON.stringify(swept)}`);

  const payment = await rig.rootQuery(
    "select id,stripe_event_id,consumed_at from clara.firm_registration_payments where registration_id=$1",
    [registration],
  );
  assert.equal(payment.rowCount, 1, "the applier must have written exactly one payment row");
  assert.equal(payment.rows[0].stripe_event_id, id);
  assert.equal(payment.rows[0].consumed_at, null);

  const claimed = await asApplicant(applicant, email, "select clara.claim_paid_firm($1,$2) as r", [
    registration,
    `c5claim_${tag}`,
  ]);
  const firmId = claimed.rows[0].r.firm_id;
  assert.ok(firmId, `no firm minted: ${JSON.stringify(claimed.rows[0].r)}`);
  const firm = await rig.rootQuery("select id,name from clara.firms where id=$1", [firmId]);
  assert.equal(firm.rowCount, 1);
  assert.equal(firm.rows[0].name, reg.rows[0].firm_name, "the firm name comes from the registration, not the wire");

  const consumed = await rig.rootQuery(
    "select consumed_at,consumed_firm_id from clara.firm_registration_payments where registration_id=$1",
    [registration],
  );
  assert.ok(consumed.rows[0].consumed_at, "the payment must be stamped consumed");
  assert.equal(consumed.rows[0].consumed_firm_id, firmId);
});

test("c5db.6 W-O — the webhook role reaches EXACTLY two routines and no relation", { skip }, async () => {
  const routines = await rig.rootQuery(
    `select p.oid::regprocedure::text as sig
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and has_function_privilege('clara_stripe_webhook',p.oid,'EXECUTE')
      order by 1`,
  );
  // SET EQUALITY, not a spot check — the design's own words.
  assert.deepEqual(
    routines.rows.map((r) => r.sig),
    ["clara.apply_stripe_events(integer)", "clara.record_stripe_event(text,text,jsonb)"],
  );

  const relations = await rig.rootQuery(
    `select c.relname
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relkind in ('r','v','m','p')
        and (has_table_privilege('clara_stripe_webhook',c.oid,'SELECT')
          or has_table_privilege('clara_stripe_webhook',c.oid,'INSERT')
          or has_table_privilege('clara_stripe_webhook',c.oid,'UPDATE')
          or has_table_privilege('clara_stripe_webhook',c.oid,'DELETE'))
      order by 1`,
  );
  assert.deepEqual(relations.rows.map((r) => r.relname), [], "the webhook role must hold ZERO relation privileges");

  // And the three the design names explicitly, executed rather than inferred from a catalog read.
  const client = await rig.getPool().connect();
  try {
    await client.query("set role clara_stripe_webhook");
    for (const [sql, params] of [
      ["select 1 from clara.firms limit 1", []],
      ["select clara.claim_paid_firm($1,$2)", [randomUUID(), "x"]],
      ["select clara.create_firm($1,$2,$3)", ["n", randomUUID(), "x"]],
    ]) {
      await assert.rejects(
        client.query(sql, params),
        (e) => e.code === "42501" || e.code === "42883",
        `clara_stripe_webhook must not reach: ${sql}`,
      );
      await client.query("rollback").catch(() => {});
    }
  } finally {
    await client.query("reset role").catch(() => {});
    client.release();
  }
});

test("c5db.9 both registered paths reach the same handler", { skip }, async () => {
  // Design part 3 §1 names `POST /webhooks/stripe`; the work order names
  // `POST /api/stripe/webhook` (and that is the URL the owner registers). Both are served so
  // whichever the owner enters works; this cell is what makes "both" a fact rather than a claim,
  // and it also pins that the alias is the SAME handler — a copy would drift.
  const { STRIPE_WEBHOOK_PATHS } = await import("../src/stripeRoutes.ts");
  assert.deepEqual([...STRIPE_WEBHOOK_PATHS], ["/api/stripe/webhook", "/webhooks/stripe"]);
  for (const path of STRIPE_WEBHOOK_PATHS) {
    const id = eventId("path");
    const ev = completedEvent({ id, session: sessionId("path") });
    const body = Buffer.from(JSON.stringify(ev), "utf8");
    const sig = generateTestHeaderString({ payload: body, secret: WEBHOOK_SIGNING_FIXTURE });
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": sig },
      body,
    });
    assert.equal(res.status, 200, path);
    assert.ok(await storedEvent(id), path);
    // The refusal arm too, so the alias is not merely a route that answers 200 to anything.
    const forged = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=dead" },
      body,
    });
    assert.equal(forged.status, 400, `${path} (forged)`);
  }
});

test("c5db.8 W-C — the SAME payload verifies before express.json() and fails after it", { skip }, async () => {
  // W-C HAS NO DISCRIMINATING MUTANT: the refuse arm and the mutant are the same edit, so the
  // design records the POSITIVE CONTROL as the whole cell. Both mountings are composed here and
  // the same signed bytes are delivered to each, so the difference measured is exactly the
  // middleware order and nothing else.
  const { stripeWebhookRoutes } = await import("../src/stripeRoutes.ts");
  const wrong = express();
  wrong.use(express.json({ limit: "1mb" })); // ← the mistake: the parser consumes the body first
  wrong.use(stripeWebhookRoutes());
  const wrongServer = http.createServer(wrong);
  await new Promise((resolve) => wrongServer.listen(0, "127.0.0.1", resolve));
  const wrongBase = `http://127.0.0.1:${wrongServer.address().port}`;
  try {
    const id = eventId("wc");
    const ev = completedEvent({ id, session: sessionId("wc") });
    const body = Buffer.from(JSON.stringify(ev), "utf8");
    const sig = generateTestHeaderString({ payload: body, secret: WEBHOOK_SIGNING_FIXTURE });
    const res = await fetch(`${wrongBase}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": sig },
      body,
    });
    assert.notEqual(res.status, 200, "a router mounted after express.json() must NOT accept the event");
    assert.equal(await storedEvent(id), null);

    // The positive control: the identical bytes and the identical signature, through the app
    // composed the way `src/index.ts` composes it.
    const good = await deliver(ev);
    assert.equal(good.status, 200);
    assert.ok(await storedEvent(id));
  } finally {
    await new Promise((resolve) => wrongServer.close(resolve));
  }
});

test("c5db.7 the projection's column keys match the live stripe_events table", { skip }, async () => {
  // Law 3: the module's `PROJECTION_COLUMN_KEYS` is a NAME list. This reads the catalog so a
  // column rename cannot leave a reconciliation key silently NULL on every future row.
  const cols = await rig.rootQuery(
    `select column_name from information_schema.columns
      where table_schema='clara' and table_name='stripe_events'`,
  );
  const live = new Set(cols.rows.map((r) => r.column_name));
  for (const key of PROJECTION_COLUMN_KEYS) {
    assert.equal(live.has(key), true, `the projector emits ${key} but clara.stripe_events has no such column`);
  }
});
