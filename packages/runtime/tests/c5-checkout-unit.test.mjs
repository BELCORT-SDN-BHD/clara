// FS-4 C-5 — the PURE half of the battery: what the four walls decide, with no rig and no
// network. Every cell here names the mutant that reddens it; the mutant panel in the PR body
// quotes the run.
//
// The db half (`c5-checkout-db.test.mjs`) proves what Postgres does with the output of these
// functions; this file proves the functions themselves, because a captured HTTP status cannot
// show that a deny-listed key was never COPIED, only that it did not arrive.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  DEFAULT_TOLERANCE_SECONDS,
  StripeSignatureError,
  computeStripeSignature,
  generateTestHeaderString,
  parseStripeSignatureHeader,
  verifyStripeSignature,
} from "../lib/stripe-signature.mjs";
import {
  APPLIED_EVENT_TYPE,
  DENIED_PROJECTION_KEYS,
  PROJECTION_COLUMN_KEYS,
  StripeProjectionError,
  projectStripeEvent,
} from "../lib/stripe-projection.mjs";
import { LIVEMODE_VAR, StripeLivemodeError, assertLivemodeMatches, expectedLivemode } from "../lib/stripe-livemode.mjs";
import {
  DIGEST_BYTES,
  PEPPER_VAR,
  TRUSTED_HEADER_VAR,
  emailDigestFor,
  originDigestFrom,
  pepperedDigest,
  proxyObservedClientIp,
  trustedClientIpHeaderName,
} from "../lib/rate-wall-courier.mjs";
import {
  BELT_VAR,
  STRIPE_APPLY_MS,
  reconcileStripeEvents,
  stripeApplierBeltEnabled,
  stripeApplyDue,
  _resetStripeApplierProbeForTest,
} from "../lib/stripe-applier.mjs";
import { STRIPE_WEBHOOK_DSN_VAR } from "../lib/checkout-pools.mjs";
import { CHECKOUT_POOL_SQL_TEXTS } from "../lib/checkout-pools.mjs";
import { logSafe } from "../lib/log-safe.mjs";

// Locally minted fixtures shaped like a Stripe endpoint secret. Deliberately NOT read from the
// environment and deliberately not real: this file must be readable by anyone and runnable with
// no configuration at all, and a signing key that verifies only against itself proves the
// arithmetic without depending on a live endpoint.
const WHSEC_A = "whsec_c5unitfixture0000000000000000000";
const WHSEC_B = "whsec_c5unitfixture1111111111111111111";

const session = (over = {}) => ({
  id: "cs_test_c5fixture",
  object: "checkout.session",
  mode: "subscription",
  status: "complete",
  payment_status: "paid",
  amount_total: 0,
  currency: "myr",
  customer: "cus_c5fixture",
  subscription: "sub_c5fixture",
  metadata: {
    clara_registration_id: "11111111-1111-4111-8111-111111111111",
    clara_applicant: "22222222-2222-4222-8222-222222222222",
    clara_intent_id: "33333333-3333-4333-8333-333333333333",
  },
  ...over,
});

const event = (over = {}, objectOver = {}) => ({
  id: "evt_c5fixture",
  object: "event",
  type: APPLIED_EVENT_TYPE,
  api_version: "2026-08-27",
  created: 1_772_000_000,
  livemode: false,
  data: { object: session(objectOver) },
  ...over,
});

// ---------------------------------------------------------------------------
// W-A1 / W-A2 — the signature.
// ---------------------------------------------------------------------------

test("c5.sig.1 a correctly signed payload verifies, and one changed byte does not", () => {
  const body = Buffer.from(JSON.stringify(event()), "utf8");
  const ts = Math.floor(Date.now() / 1000);
  const header = generateTestHeaderString({ payload: body, secret: WHSEC_A, timestamp: ts });

  assert.deepEqual(verifyStripeSignature({ rawBody: body, header, secret: WHSEC_A }), { timestamp: ts });

  // THE POSITIVE CONTROL'S MIRROR: the same header over a body that differs by ONE byte. This
  // is the cell that proves the signature is over the BYTES and not over something derived
  // from them — a verifier that hashed `JSON.stringify(JSON.parse(body))` would pass both.
  const tampered = Buffer.from(body.toString("utf8").replace('"paid"', '"unpd"'), "utf8");
  assert.equal(tampered.length, body.length, "the tamper must be byte-length neutral for this cell to bite");
  assert.throws(
    () => verifyStripeSignature({ rawBody: tampered, header, secret: WHSEC_A }),
    (e) => e instanceof StripeSignatureError && e.code === "signature_mismatch",
  );
});

test("c5.sig.2 a signature minted with a different key is refused", () => {
  const body = Buffer.from("{}", "utf8");
  const header = generateTestHeaderString({ payload: body, secret: WHSEC_B });
  assert.throws(
    () => verifyStripeSignature({ rawBody: body, header, secret: WHSEC_A }),
    (e) => e.code === "signature_mismatch",
  );
});

test("c5.sig.3 the DOWNGRADE wall — a v0-only header is refused, and v0 is never consulted", () => {
  const body = Buffer.from("{}", "utf8");
  const ts = Math.floor(Date.now() / 1000);
  // A `v0` carrying the CORRECT v1 arithmetic. If the parser collected any scheme it recognised
  // rather than the literal `v1`, this would verify — which is exactly the downgrade Stripe's
  // own documentation says to refuse ("ignore all schemes that aren't v1").
  const correct = computeStripeSignature(WHSEC_A, ts, body);
  assert.throws(
    () => verifyStripeSignature({ rawBody: body, header: `t=${ts},v0=${correct}`, secret: WHSEC_A }),
    (e) => e.code === "signature_v1_absent",
  );
  // And the parser drops it even when a real v1 is present alongside.
  const parsed = parseStripeSignatureHeader(`t=${ts},v1=${correct},v0=deadbeef`);
  assert.deepEqual(parsed.signatures, [correct]);
});

test("c5.sig.4 a rolled key — several v1 values, any one of which may match", () => {
  const body = Buffer.from("{}", "utf8");
  const ts = Math.floor(Date.now() / 1000);
  const old = computeStripeSignature(WHSEC_B, ts, body);
  const fresh = computeStripeSignature(WHSEC_A, ts, body);
  // The retiring key's signature comes FIRST, so a verifier that returned on the first mismatch
  // instead of scanning every candidate would reject a legitimate event for the whole 24-hour
  // roll window.
  assert.deepEqual(
    verifyStripeSignature({ rawBody: body, header: `t=${ts},v1=${old},v1=${fresh}`, secret: WHSEC_A }),
    { timestamp: ts },
  );
});

test("c5.sig.5 the tolerance is one-sided: stale is refused, future is not", () => {
  const body = Buffer.from("{}", "utf8");
  const now = Date.now();
  const stale = Math.floor(now / 1000) - DEFAULT_TOLERANCE_SECONDS - 1;
  assert.throws(
    () =>
      verifyStripeSignature({
        rawBody: body,
        header: generateTestHeaderString({ payload: body, secret: WHSEC_A, timestamp: stale }),
        secret: WHSEC_A,
        nowMs: now,
      }),
    (e) => e.code === "signature_timestamp_stale",
  );
  // Documented SDK parity, asserted so nobody "fixes" it into a symmetric window and starts
  // dropping legitimate events on forward clock skew. See the module header.
  const future = Math.floor(now / 1000) + DEFAULT_TOLERANCE_SECONDS + 1;
  assert.equal(
    verifyStripeSignature({
      rawBody: body,
      header: generateTestHeaderString({ payload: body, secret: WHSEC_A, timestamp: future }),
      secret: WHSEC_A,
      nowMs: now,
    }).timestamp,
    future,
  );
});

test("c5.sig.6 an absent header, an absent t, and an unconfigured key each refuse distinctly", () => {
  const body = Buffer.from("{}", "utf8");
  const ts = Math.floor(Date.now() / 1000);
  const sig = computeStripeSignature(WHSEC_A, ts, body);
  for (const [header, code] of [
    [undefined, "signature_header_absent"],
    ["", "signature_header_absent"],
    [`v1=${sig}`, "signature_timestamp_absent"],
    [`t=notanumber,v1=${sig}`, "signature_timestamp_absent"],
    [`t=${ts}`, "signature_v1_absent"],
  ]) {
    assert.throws(
      () => verifyStripeSignature({ rawBody: body, header, secret: WHSEC_A }),
      (e) => e.code === code,
      `header ${JSON.stringify(header)} should refuse ${code}`,
    );
  }
  // FAIL CLOSED on an unconfigured signing key — never "skip verification when there is none",
  // which is the shape Stripe's own quickstart sample ships and which would accept forged
  // events that mint firms.
  assert.throws(
    () => verifyStripeSignature({ rawBody: body, header: `t=${ts},v1=${sig}`, secret: undefined }),
    (e) => e.code === "signing_secret_absent",
  );
});

// ---------------------------------------------------------------------------
// 裁-91 — the projector: the allow-list and the nested-PII strip wall.
// ---------------------------------------------------------------------------

test("c5.proj.1 the ALLOW-LIST: an unknown field is dropped, and every denied key with it", () => {
  const { projection } = projectStripeEvent(
    event(
      {},
      {
        // The five keys `ck_stripe_events_no_pii` names…
        customer_details: { email: "person@example.test", name: "A Person", address: { line1: "1 Road" } },
        customer_email: "person@example.test",
        billing_details: { name: "A Person" },
        shipping_details: { name: "A Person" },
        payment_method_details: { card: { last4: "4242" } },
        // …and arbitrary fields Stripe could add tomorrow.
        some_future_field: "whatever",
        customer_tax_ids: [{ type: "my_itn", value: "IG12345" }],
      },
    ),
  );
  for (const denied of DENIED_PROJECTION_KEYS) assert.equal(Object.hasOwn(projection, denied), false, denied);
  assert.equal(Object.hasOwn(projection, "some_future_field"), false);
  assert.equal(Object.hasOwn(projection, "customer_tax_ids"), false);
  // Nothing anywhere in the serialised projection carries the person either — the strongest
  // form of the claim, and the one a nested field would break.
  assert.equal(JSON.stringify(projection).includes("person@example.test"), false);
  assert.equal(JSON.stringify(projection).includes("A Person"), false);
});

test("c5.proj.2 the NESTED-PII STRIP WALL: an EXPANDED customer becomes null and is named", () => {
  // `session.customer` is an id string normally and a full Customer OBJECT the moment anyone
  // adds `expand:['customer']`. An allow-list of KEYS alone would copy that object whole.
  const { projection, dropped } = projectStripeEvent(
    event({}, { customer: { id: "cus_x", email: "leak@example.test", name: "Leak", phone: "+60123" } }),
  );
  assert.equal(projection.customer_id, null);
  assert.ok(dropped.includes("customer"), `expected 'customer' in dropped, got ${JSON.stringify(dropped)}`);
  assert.equal(JSON.stringify(projection).includes("leak@example.test"), false);
  // The scalar arm still works — the wall drops objects, not values.
  assert.equal(projectStripeEvent(event()).projection.customer_id, "cus_c5fixture");
});

test("c5.proj.3 the recognised type carries every key record_stripe_event reads", () => {
  const { projection, recognised, eventType } = projectStripeEvent(event());
  assert.equal(recognised, true);
  assert.equal(eventType, APPLIED_EVENT_TYPE);
  for (const key of PROJECTION_COLUMN_KEYS) {
    assert.equal(Object.hasOwn(projection, key), true, `the projection must carry ${key}`);
  }
  assert.equal(projection.session_id, "cs_test_c5fixture");
  assert.equal(projection.registration_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(projection.applicant, "22222222-2222-4222-8222-222222222222");
  assert.equal(projection.intent_id, "33333333-3333-4333-8333-333333333333");
  assert.equal(projection.livemode, false);
});

test("c5.proj.4 an UNRECOGNISED type is recorded as an envelope, with nothing from data.object", () => {
  const { projection, recognised } = projectStripeEvent(
    event({ type: "invoice.paid", data: { object: { id: "in_x", customer_email: "leak@example.test" } } }),
  );
  assert.equal(recognised, false);
  // No `type` key: the event type is its own NOT NULL column, written from the door's own
  // `p_type` argument. A second copy inside the jsonb is a value that can disagree with it.
  assert.deepEqual(Object.keys(projection).sort(), ["api_version", "created", "livemode"]);
  assert.equal(JSON.stringify(projection).includes("leak@example.test"), false);
});

test("c5.proj.5 malformed envelopes refuse by name, before any door could be called", () => {
  for (const [ev, code] of [
    [event({ id: "not_an_evt_id" }), "event_id_shape"],
    [event({ id: "" }), "event_id_shape"],
    [event({ type: "" }), "event_type_absent"],
    [event({ livemode: "false" }), "livemode_absent"],
    [event({ livemode: undefined }), "livemode_absent"],
    [event({ data: { object: null } }), "object_absent"],
    ["not an object", "event_not_object"],
  ]) {
    assert.throws(
      () => projectStripeEvent(ev),
      (e) => e instanceof StripeProjectionError && e.code === code,
      `expected ${code}`,
    );
  }
});

test("c5.proj.6 non-string metadata is stripped rather than coerced", () => {
  // The three metadata fields are uuid-typed at the door, so the surviving arm must carry a real
  // uuid — a bare `"ok"` is now nulled and NAMED by the M-1 wall, which is the point of it.
  const good = "44444444-4444-4444-8444-444444444444";
  const { projection, dropped, malformed } = projectStripeEvent(
    event(
      {},
      { metadata: { clara_registration_id: { nested: "object" }, clara_applicant: good, clara_intent_id: null } },
    ),
  );
  assert.equal(projection.registration_id, null);
  assert.equal(projection.applicant, good);
  assert.equal(projection.intent_id, null);
  assert.ok(dropped.includes("metadata.clara_registration_id"));
  // An OBJECT is dropped by the strip wall, not named as malformed: it never became a string to
  // be a bad uuid. Absent (`null`) is likewise neither. The two lists mean different things.
  assert.deepEqual(malformed, []);
  // A metadata bag that is itself an array is dropped whole.
  assert.equal(projectStripeEvent(event({}, { metadata: ["x"] })).projection.applicant, null);
});

// ---------------------------------------------------------------------------
// A-M5 — the livemode gate, both polarities.
// ---------------------------------------------------------------------------

test("c5.livemode.1 unset or unparseable FAILS CLOSED — every event refused", () => {
  for (const raw of [undefined, "", "  ", "yes", "TEST_MODE", "2"]) {
    const env = raw === undefined ? {} : { [LIVEMODE_VAR]: raw };
    assert.equal(expectedLivemode(env), null, JSON.stringify(raw));
    for (const livemode of [true, false]) {
      assert.throws(
        () => assertLivemodeMatches(livemode, env),
        (e) => e instanceof StripeLivemodeError && e.code === "livemode_not_configured",
      );
    }
  }
});

test("c5.livemode.2 both polarities: a mismatched event is refused, a matching one passes", () => {
  for (const [raw, expected] of [
    ["1", true],
    ["true", true],
    ["live", true],
    ["0", false],
    ["false", false],
    ["test", false],
    ["TEST", false],
  ]) {
    const env = { [LIVEMODE_VAR]: raw };
    assert.equal(expectedLivemode(env), expected, raw);
    assert.doesNotThrow(() => assertLivemodeMatches(expected, env));
    assert.throws(
      () => assertLivemodeMatches(!expected, env),
      (e) => e.code === "livemode_mismatch",
      `${raw} must refuse livemode=${!expected}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 裁-64① / M1 — the trusted-IP courier.
// ---------------------------------------------------------------------------

const COURIER_ENV = { [TRUSTED_HEADER_VAR]: "fly-client-ip", [PEPPER_VAR]: "c5-unit-pepper" };
const headersOf = (bag) => (name) => bag[String(name).toLowerCase()];

test("c5.courier.1 M1 — the Origin header is NEVER a source, at any name", () => {
  // The whole finding: `Origin` is identical for every visitor to one deployment, so keying C2
  // on it locks out every applicant together. With no trusted header configured there is NO
  // digest, however many origin-ish headers the request carries.
  const bag = {
    origin: "https://app.clarabook.test",
    referer: "https://app.clarabook.test/x",
    host: "app.clarabook.test",
  };
  assert.equal(originDigestFrom(headersOf(bag), { [PEPPER_VAR]: "p" }), null);
  assert.equal(trustedClientIpHeaderName({}), null);
  assert.equal(trustedClientIpHeaderName({ [TRUSTED_HEADER_VAR]: "   " }), null);
  // And even fully configured, the Origin value is not what gets digested.
  const configured = originDigestFrom(headersOf({ ...bag, "fly-client-ip": "203.0.113.7" }), COURIER_ENV);
  assert.deepEqual(configured, pepperedDigest("203.0.113.7", COURIER_ENV));
});

test("c5.courier.2 FAIL CLOSED on a missing pepper, a missing header, or a non-IP value", () => {
  assert.equal(
    originDigestFrom(headersOf({ "fly-client-ip": "203.0.113.7" }), { [TRUSTED_HEADER_VAR]: "fly-client-ip" }),
    null,
  );
  assert.equal(originDigestFrom(headersOf({}), COURIER_ENV), null);
  assert.equal(originDigestFrom(headersOf({ "fly-client-ip": "   " }), COURIER_ENV), null);
  for (const junk of ["not-an-ip", "999.999.999.999", "<script>", "203.0.113.7/24"]) {
    assert.equal(proxyObservedClientIp(headersOf({ "fly-client-ip": junk }), COURIER_ENV), null, junk);
  }
  assert.equal(emailDigestFor("a@b.test", { [TRUSTED_HEADER_VAR]: "x" }), null, "no pepper ⇒ no email digest");
});

test("c5.courier.3 a multi-valued header takes the LAST entry — the proxy-observed one", () => {
  // The FIRST entry of an X-Forwarded-For is whatever the client claimed. Taking it would hand
  // an attacker a fresh rate-wall budget per forged address, i.e. the C2 limb deleted.
  const env = { ...COURIER_ENV, [TRUSTED_HEADER_VAR]: "x-forwarded-for" };
  const spoofed = "1.2.3.4";
  const observed = "203.0.113.9";
  assert.equal(proxyObservedClientIp(headersOf({ "x-forwarded-for": `${spoofed}, ${observed}` }), env), observed);
  assert.notDeepEqual(pepperedDigest(observed, env), pepperedDigest(spoofed, env));
  // Ports and bracketed IPv6 are handled; the colons of a bare IPv6 are not a port.
  assert.equal(proxyObservedClientIp(headersOf({ "x-forwarded-for": "203.0.113.9:4711" }), env), "203.0.113.9");
  assert.equal(proxyObservedClientIp(headersOf({ "x-forwarded-for": "[2001:db8::1]:4711" }), env), "2001:db8::1");
  assert.equal(proxyObservedClientIp(headersOf({ "x-forwarded-for": "2001:db8::1" }), env), "2001:db8::1");
});

test("c5.courier.4 the digest is 32 bytes, stable per address and different across addresses", () => {
  const a = pepperedDigest("203.0.113.7", COURIER_ENV);
  const b = pepperedDigest("203.0.113.7", COURIER_ENV);
  const c = pepperedDigest("203.0.113.8", COURIER_ENV);
  assert.equal(a.length, DIGEST_BYTES);
  assert.deepEqual(a, b, "stable per address — otherwise no window can accumulate");
  assert.notDeepEqual(a, c, "different per address — otherwise C2 is one shared budget (M1)");
  // The pepper is load-bearing: the same address under a different pepper is a different key.
  assert.notDeepEqual(a, pepperedDigest("203.0.113.7", { ...COURIER_ENV, [PEPPER_VAR]: "other" }));
  // It is the documented construction, sha256(pepper then value) — pinned so a silent switch to
  // a bare sha256(value), or to a different concatenation order, reddens here rather than
  // splitting the wall in two against apps/web's own courier.
  assert.deepEqual(a, createHash("sha256").update("c5-unit-pepper", "utf8").update("203.0.113.7", "utf8").digest());
});

test("c5.courier.5 the email limb is case- and whitespace-insensitive", () => {
  const base = emailDigestFor("Person@Example.Test", COURIER_ENV);
  assert.equal(base.length, DIGEST_BYTES);
  assert.deepEqual(base, emailDigestFor("  person@example.test  ", COURIER_ENV));
  // A caller who could split one address into several budgets by casing would get five guesses
  // per spelling.
  assert.notDeepEqual(base, emailDigestFor("person2@example.test", COURIER_ENV));
  assert.equal(emailDigestFor("", COURIER_ENV), null);
  assert.equal(emailDigestFor(null, COURIER_ENV), null);
});

// ---------------------------------------------------------------------------
// The belt's cadence, and the pool module's frozen statement census.
// ---------------------------------------------------------------------------

test("c5.belt.1 the applier sweep is due on the first cycle after boot, then every minute", () => {
  assert.equal(STRIPE_APPLY_MS, 60_000, "design part 3 §1 step 6 says every minute");
  // The predicate itself is pure and unchanged; what changed at the B-2 fold is what the LEADER
  // seeds it with (see c5.belt.3). A `0` still reads as due — this is the arithmetic, not the
  // policy.
  assert.equal(stripeApplyDue(0, Date.now()), true);
  assert.equal(stripeApplyDue(1_000_000, 1_000_000 + STRIPE_APPLY_MS - 1), false);
  assert.equal(stripeApplyDue(1_000_000, 1_000_000 + STRIPE_APPLY_MS), true);
});

test("c5.log.1 N-7 — an attacker-shaped event type cannot forge a log line", () => {
  // The whole finding: `type` is read RAW in the catch arm, before the projector runs, and used
  // to be sliced without a character class.
  const forged = "checkout.session.completed\n[clara-runtime] stripe webhook: evt_fake ACCEPTED";
  const safe = logSafe(forged);
  assert.equal(safe.includes("\n"), false, "a newline must never survive into a log line");
  assert.equal(safe.includes("\r"), false);
  assert.match(safe, /^checkout\.session\.completed\.\[clara-runtime\]/);
  // Every other non-printable goes the same way, and the clamp still clamps.
  assert.equal(logSafe("a\u0000b\u001Bc\u0007"), "a.b.c.");
  assert.equal(logSafe("x".repeat(400)).length, 255);
  // An ordinary value is untouched — the fix must not mangle the 99.99% case.
  assert.equal(logSafe("checkout.session.completed"), "checkout.session.completed");
});

test("c5.belt.2 B-2 — the belt reads a CREDENTIAL, never RELAY_TEST_MODE", async () => {
  // The exact environment `tests/intake-e2e.mjs` builds at its line 30: test mode, no DSN. The
  // first cut of the belt gated on `stripeWebhookLaneConfigured()`, which is true here, so a
  // seventh pool connected and two queries ran inside a cell that times a chat round trip.
  const e2eEnv = { RELAY_TEST_MODE: "1" };
  assert.equal(stripeApplierBeltEnabled(e2eEnv), false, "a test-mode process with no DSN must NOT run the belt");

  // A real credential turns it on…
  assert.equal(stripeApplierBeltEnabled({ [STRIPE_WEBHOOK_DSN_VAR]: "postgres://x/y" }), true);
  // …and an explicit override decides either way, for a rig that means to exercise it.
  assert.equal(stripeApplierBeltEnabled({ RELAY_TEST_MODE: "1", [BELT_VAR]: "1" }), true);
  assert.equal(stripeApplierBeltEnabled({ [STRIPE_WEBHOOK_DSN_VAR]: "postgres://x/y", [BELT_VAR]: "0" }), false);
  assert.equal(stripeApplierBeltEnabled({}), false, "nothing configured ⇒ no belt");

  // AND IT ISSUES NO QUERY. The predicate could be right while the belt still probed the
  // catalog before consulting it, which is the whole cost this fix removes — so the client is a
  // spy that THROWS if touched, rather than one that counts.
  _resetStripeApplierProbeForTest();
  const refuseAnyQuery = {
    query() {
      throw new Error("the dormant belt must issue NO query at all");
    },
  };
  const out = await reconcileStripeEvents(refuseAnyQuery, { log: () => {}, env: e2eEnv });
  assert.deepEqual(out, { stripeApplyOk: true, receipt: null });
  // `true`, so the leader STAMPS and the dormant belt costs one evaluation per interval rather
  // than a `to_regprocedure` every ~2 s forever (the review's N-4).
});

test("c5.belt.3 B-2 — the leader does not sweep on its first cycle after boot", async () => {
  // The sentinel changed from `0` to `Date.now()` at loop entry. Read the SHIPPED source rather
  // than re-implementing the arithmetic: a cell that recomputed `stripeApplyDue(Date.now(), …)`
  // would pass even if the leader still declared `0`.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/leader.mjs", import.meta.url), "utf8");
  assert.match(src, /let lastStripeApplyRun = Date\.now\(\);/, "the leader must stamp at loop entry, not use a 0 sentinel");
  assert.equal(src.includes("let lastStripeApplyRun = 0"), false, "the 0 sentinel must be gone");
  // And the arithmetic that follows from it: a belt stamped at boot is not due until an interval
  // has passed.
  const boot = Date.now();
  assert.equal(stripeApplyDue(boot, boot), false, "the first cycle must NOT sweep");
  assert.equal(stripeApplyDue(boot, boot + STRIPE_APPLY_MS - 1), false);
  assert.equal(stripeApplyDue(boot, boot + STRIPE_APPLY_MS), true, "…and the next interval must");
});

test("c5.pool.1 the checkout lanes can issue exactly four statements, all of them door calls", () => {
  assert.equal(CHECKOUT_POOL_SQL_TEXTS.length, 4);
  for (const sql of CHECKOUT_POOL_SQL_TEXTS) {
    assert.match(sql, /^select clara\.[a-z_]+\(/, `not a bare door call: ${sql}`);
  }
  assert.deepEqual(
    CHECKOUT_POOL_SQL_TEXTS.map((s) => /clara\.([a-z_]+)\(/.exec(s)[1]).sort(),
    ["apply_stripe_events", "claim_confirmation_attempt", "record_stripe_event", "settle_confirmation_attempt"],
  );
});
