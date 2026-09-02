// FS-4 C-5 fold — the WEBHOOK DOOR's CLR census, the money-surface twin of `c5clr.1`.
//
// THE DEFECT THIS CLOSES (the #511 review's M-1). `record_stripe_event` raises six CLR10 arms;
// the route mapped none of them, so a signature-valid `checkout.session.completed` whose
// `clara_applicant` metadata was a present-but-malformed uuid produced a PERMANENT 500 — no
// `stripe_events` row, no `stripe_event_problems` row, and Stripe re-delivering for days against
// something that reads like an outage. Item 12 of this same PR closes exactly that class for the
// chat-turn route and says "map each, never a catch-all". The money surface had not had it.
//
// TWO WALLS, AND THIS FILE PROVES BOTH ARE POPULATED.
//   1. The PROJECTOR pre-empts every arm reachable through the route, so the door is never asked
//      to refuse. A malformed metadata uuid becomes NULL + a named entry, the event IS recorded,
//      and the applier files `metadata_missing` — the design's "recorded as a problem" outcome.
//   2. `webhookRefusal` maps CLR10 to a named 400 as the belt, for an arm a future migration
//      adds or a hole the projector grows.
//
// THE CENSUS IS OF THE LIVE CATALOG, in both directions (裁-107b): an arm the route can reach
// that nothing pre-empts is a 500 waiting to happen; a claim that an arm is unreachable, when it
// is, is an overclaim. Both fail here rather than in production.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { register } from "tsx/esm/api";
import * as rig from "./rig.mjs";
import { cohortGate } from "./c5-cohort-gate.mjs";
import {
  BOUNDED_STATUS_KEYS,
  MALFORMED_METADATA_KEY,
  METADATA_KEYS,
  STATUS_MAX_LENGTH,
  projectStripeEvent,
} from "../lib/stripe-projection.mjs";

register();
const { webhookRefusal, stripeWebhookRoutes } = await import("../src/stripeRoutes.ts");

const skip = await cohortGate(
  "the C-2 webhook doors (0160)",
  "select to_regprocedure('clara.record_stripe_event(text,text,jsonb)') is not null as ok",
);

after(async () => {
  await rig.endPool();
});

const RAISE_RE = /raise exception\s+'((?:[^']|'')*)'([\s\S]{0,300}?)errcode\s*=\s*'([A-Z0-9]+)'/g;

async function doorRaises() {
  const r = await rig.rootQuery(
    `select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='record_stripe_event'`,
  );
  assert.equal(r.rowCount, 1, "exactly one record_stripe_event body");
  return [...r.rows[0].prosrc.matchAll(RAISE_RE)].map((m) => ({ message: m[1], code: m[3] }));
}

/** A `checkout.session.completed` whose metadata — and, optionally, whose status fields — are
 *  whatever the caller says. */
function eventWithMetadata(metadata, objectOver = {}) {
  return {
    id: `evt_c5clr${Math.random().toString(16).slice(2)}`,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2026-08-27",
    created: 1_772_000_000,
    livemode: false,
    data: {
      object: {
        id: "cs_test_c5clr",
        object: "checkout.session",
        mode: "subscription",
        status: "complete",
        payment_status: "paid",
        amount_total: 0,
        currency: "myr",
        metadata,
        ...objectOver,
      },
    },
  };
}

test("c5sclr.0 N-1 — an over-limit body answers a TYPED 413, never Express's HTML page", { skip }, async () => {
  // The review measured the old behaviour: `express.raw`'s limit error was `next(err)`'d past
  // the handler into Express's default error page. Under `NODE_ENV=production` that page is a
  // bare "Payload Too Large"; WITHOUT it, it carries a full stack trace with absolute paths and
  // pinned dependency versions on an unauthenticated, internet-facing endpoint.
  //
  // The cell runs WITHOUT `NODE_ENV=production` on purpose — that is the arm that used to leak,
  // and pinning it here means the route does not depend on an env var being set correctly.
  const app = express();
  app.use(stripeWebhookRoutes());
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=dead" },
      body: Buffer.alloc(2 * 1024 * 1024, 0x20), // 2 MB against the 1 MB limit
    });
    assert.equal(res.status, 413);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: "payload_too_large" });
    // The two properties that make it a fix rather than a cosmetic status change.
    assert.equal(/<html|<pre|PayloadTooLargeError/i.test(text), false, "no HTML page, no error class name");
    assert.equal(/[A-Za-z]:[\\/]|node_modules|\bat\s/.test(text), false, "no filesystem path, no stack frame");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

/**
 * EVERYTHING THAT CAN REFUSE AN INSERT INTO `clara.stripe_events`, read from the catalog.
 *
 * THE INSTRUMENT HALF OF NEW-1, AND IT IS THE PART WORTH KEEPING. The first cut of this file
 * read `record_stripe_event`'s `prosrc` ONLY, while claiming "no bare 500". The table's three
 * CHECK constraints raise `23514` and were outside its scope entirely, so a 65-character
 * `payment_status` produced exactly the 500 the cell's name said could not happen. That is the
 * same lesson the chat-turn census in this PR already learned — its refusals lived in triggers,
 * invisible to a prosrc walk — and the fix is the same: read what can refuse, not one refuser.
 */
async function refusalSurface() {
  const checks = await rig.rootQuery(
    `select c.conname, pg_get_constraintdef(c.oid) as def
       from pg_constraint c
      where c.conrelid = 'clara.stripe_events'::regclass and c.contype = 'c'
      order by 1`,
  );
  const triggers = await rig.rootQuery(
    `select t.tgname, p.oid::regprocedure::text as fn
       from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where not t.tgisinternal and t.tgrelid = 'clara.stripe_events'::regclass
      order by 1`,
  );
  return { checks: checks.rows, triggers: triggers.rows };
}

test("c5sclr.1 every refuser is pre-empted or mapped — the function AND the table", { skip }, async () => {
  const raises = await doorRaises();
  assert.ok(raises.length >= 6, `the census read only ${raises.length} raises — the instrument is not reading prosrc`);
  const codes = [...new Set(raises.map((r) => r.code))];
  assert.deepEqual(codes, ["CLR10"], `the door raises codes beyond CLR10: ${JSON.stringify(codes)}`);

  // THE TABLE'S OWN REFUSERS. A CHECK raises 23514 and a trigger raises whatever it raises; both
  // are invisible to a prosrc walk over the function.
  const { checks, triggers } = await refusalSurface();
  assert.deepEqual(
    checks.map((c) => c.conname).sort(),
    ["ck_stripe_events_event_id_shape", "ck_stripe_events_no_pii", "ck_stripe_events_status_shape"],
    "the CHECK set on clara.stripe_events moved — a new constraint needs a projector pre-emption before this cell can pass",
  );
  // The two triggers are UPDATE/DELETE/TRUNCATE-only, so an INSERT path cannot reach them. Pinned
  // by NAME and by their tgtype's INSERT bit being clear, not by assertion.
  const insertTriggers = await rig.rootQuery(
    `select t.tgname from pg_trigger t
      where not t.tgisinternal and t.tgrelid = 'clara.stripe_events'::regclass
        and (t.tgtype & 4) <> 0`,
  );
  assert.deepEqual(insertTriggers.rows, [], `an INSERT-firing trigger appeared: ${JSON.stringify(triggers)}`);

  // The belt covers every code either refuser can produce. `webhookRefusal` is the SHIPPED
  // function, driven here rather than a copy of its predicate (裁-107).
  for (const code of [...codes, "23514"]) {
    const outcome = webhookRefusal(Object.assign(new Error("db refusal"), { code }));
    assert.equal(outcome.status, 400, `${code} must be a named 400, not a 500`);
    assert.notDeepEqual(outcome.body, { error: "internal" }, `${code} must not answer {"error":"internal"}`);
  }
  // And an UNKNOWN code still falls to 500 — the belt is a map, not a catch-all that swallows
  // everything into 400.
  assert.deepEqual(webhookRefusal(Object.assign(new Error("x"), { code: "CLR99" })), {
    status: 500,
    body: { error: "internal" },
  });
});

test("c5sclr.2 the three uuid arms are the reachable ones, and the projector pre-empts all three", { skip }, async () => {
  const raises = await doorRaises();
  const uuidArms = raises.filter((r) => /is not a valid uuid/.test(r.message)).map((r) => r.message);
  assert.equal(uuidArms.length, 3, `expected three uuid arms, read ${JSON.stringify(uuidArms)}`);
  // Each arm names one of OUR three metadata fields — the mapping from the door's own text to
  // this module's constants, read rather than assumed.
  for (const column of ["intent_id", "registration_id", "applicant"]) {
    assert.ok(uuidArms.some((m) => m.includes(column)), `no uuid arm for ${column}`);
  }

  // The projector pre-empts every one: a malformed value never reaches the door.
  const { projection, malformed } = projectStripeEvent(
    eventWithMetadata({
      [METADATA_KEYS.registration]: "not-a-uuid",
      [METADATA_KEYS.applicant]: "person@example.test",
      [METADATA_KEYS.intent]: "11111111-1111-4111-8111-111111111111",
    }),
  );
  assert.equal(projection.registration_id, null);
  assert.equal(projection.applicant, null);
  assert.equal(projection.intent_id, "11111111-1111-4111-8111-111111111111", "a WELL-FORMED value still passes");
  assert.deepEqual(malformed.sort(), [METADATA_KEYS.applicant, METADATA_KEYS.registration].sort());
  assert.deepEqual(projection[MALFORMED_METADATA_KEY].sort(), malformed.sort());
  // The malformed VALUE is not stored — only our own field NAME. An email typed into a metadata
  // slot must not land in an append-only table by the back door.
  assert.equal(JSON.stringify(projection).includes("person@example.test"), false);
  assert.equal(JSON.stringify(projection).includes("not-a-uuid"), false);
});

test("c5sclr.4 NEW-1 — the three CHECK-bounded status fields, both polarities per field", { skip }, async () => {
  const { recordStripeEvent } = await import("../lib/checkout-pools.mjs");
  const bad = {
    payment_status: "p".repeat(STATUS_MAX_LENGTH + 1), // over the 64-char bound
    mode: "subscription\ninjected", // a newline — outside `^[ -~]*$`
    status: "compléte", // non-ASCII
  };
  const good = { payment_status: "paid", mode: "subscription", status: "complete" };

  // POLARITY A, per field: each violating value alone is nulled and NAMED, and the other two
  // survive untouched — so the wall is per-field, not an all-or-nothing bail.
  for (const [key, projKey] of [["payment_status", "payment_status"], ["mode", "mode"], ["status", "session_status"]]) {
    const objectOver = { ...good, [key]: bad[key] };
    const { projection, malformed } = projectStripeEvent(eventWithMetadata({}, objectOver));
    assert.equal(projection[projKey], null, `${projKey} must be nulled`);
    assert.deepEqual(malformed, [projKey], `${projKey} must be the ONLY field named`);
    for (const other of BOUNDED_STATUS_KEYS.filter((k) => k !== projKey)) {
      assert.notEqual(projection[other], null, `${other} must survive a sibling's violation`);
    }
    // The offending VALUE never reaches the projection — only our own column name.
    assert.equal(JSON.stringify(projection).includes(bad[key]), false);
  }

  // POLARITY B: the ordinary values every real Stripe event carries pass through untouched. A
  // wall that nulled the happy path would satisfy polarity A and break the product.
  const ok = projectStripeEvent(eventWithMetadata({}, good));
  assert.equal(ok.projection.payment_status, "paid");
  assert.equal(ok.projection.mode, "subscription");
  assert.equal(ok.projection.session_status, "complete");
  assert.deepEqual(ok.malformed, []);
  // Exactly at the bound is INSIDE it — an off-by-one here would null a legitimate value.
  const edge = projectStripeEvent(eventWithMetadata({}, { ...good, payment_status: "p".repeat(STATUS_MAX_LENGTH) }));
  assert.equal(edge.projection.payment_status.length, STATUS_MAX_LENGTH);
  assert.deepEqual(edge.malformed, []);

  // LIVE: the pre-empted event RECORDS (this is the trip the reviewer measured as a 500)…
  const preempted = projectStripeEvent(eventWithMetadata({}, { ...good, payment_status: bad.payment_status }));
  const receipt = await recordStripeEvent(preempted);
  assert.equal(receipt.recorded, true, "the over-long status event must be RECORDED, not refused");
  const stored = await rig.rootQuery("select payment_status,projection from clara.stripe_events where event_id=$1", [
    preempted.eventId,
  ]);
  assert.equal(stored.rows[0].payment_status, null);
  assert.deepEqual(stored.rows[0].projection[MALFORMED_METADATA_KEY], ["payment_status"]);

  // …and the CHECK is still live, so the pre-emption is not vacuous: the same value sent past
  // the projector raises 23514, which the shipped map turns into the named 400.
  await assert.rejects(
    recordStripeEvent({
      eventId: `evt_c5bound${Math.random().toString(16).slice(2)}`,
      eventType: "checkout.session.completed",
      projection: { livemode: false, payment_status: bad.payment_status },
    }),
    (err) => {
      assert.equal(err.code, "23514", `expected a CHECK violation, got ${err.code}`);
      assert.deepEqual(webhookRefusal(err), { status: 400, body: { error: "event_refused_by_door" } });
      return true;
    },
  );
});

test("c5sclr.3 LIVE, both polarities: the malformed event records and becomes a problem row", { skip }, async () => {
  const { recordStripeEvent, applyStripeEvents } = await import("../lib/checkout-pools.mjs");

  // POLARITY A — malformed metadata. The door ACCEPTS the pre-empted projection (this is the
  // arm that used to be a permanent 500), the row exists, and the applier files the problem.
  const bad = projectStripeEvent(
    eventWithMetadata({
      [METADATA_KEYS.registration]: "not-a-uuid",
      [METADATA_KEYS.applicant]: "also-not-a-uuid",
      [METADATA_KEYS.intent]: "still-not-a-uuid",
    }),
  );
  const badReceipt = await recordStripeEvent(bad);
  assert.equal(badReceipt.recorded, true, "the malformed-metadata event must be RECORDED, not refused");
  const stored = await rig.rootQuery("select * from clara.stripe_events where event_id=$1", [bad.eventId]);
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].registration_id, null);
  assert.equal(stored.rows[0].applicant, null);
  assert.equal(stored.rows[0].intent_id, null);
  assert.deepEqual(stored.rows[0].projection[MALFORMED_METADATA_KEY].sort(), [
    METADATA_KEYS.applicant,
    METADATA_KEYS.intent,
    METADATA_KEYS.registration,
  ].sort());

  await applyStripeEvents(100);
  const problem = await rig.rootQuery(
    "select problem,detail from clara.stripe_event_problems where event_id=$1 and resolved_at is null",
    [bad.eventId],
  );
  assert.equal(problem.rowCount, 1, "the applier must file exactly one open problem for it");
  assert.equal(problem.rows[0].problem, "metadata_missing");
  assert.equal(problem.rows[0].detail.registration_id_present, false);

  // POLARITY B — the door STILL refuses a projection that bypasses the projector. This is what
  // makes the belt's mapping non-vacuous: the arms are live, not hypothetical.
  await assert.rejects(
    recordStripeEvent({
      eventId: `evt_c5clrraw${Math.random().toString(16).slice(2)}`,
      eventType: "checkout.session.completed",
      projection: { livemode: false, applicant: "not-a-uuid" },
    }),
    (err) => {
      assert.equal(err.code, "CLR10", `expected CLR10, got ${err.code}`);
      assert.match(err.message, /applicant is not a valid uuid/);
      // …and THAT error, through the shipped map, is a named 400.
      assert.deepEqual(webhookRefusal(err), { status: 400, body: { error: "event_refused_by_door" } });
      return true;
    },
  );
});
