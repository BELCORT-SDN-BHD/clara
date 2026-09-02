// FS-4 C-6's half of the mock backend, split out of `serve-built.mjs` (that
// file is at the estate's 500-line document gate).
//
// WHAT THIS MOCK IS, AND — more importantly — WHAT IT IS NOT.
//
// It stands in for TWO things the browser walk cannot reach on a laptop: the
// C-3/C-6 doors behind PostgREST, and C-5's `POST /api/auth-wall/confirm`.
// Everything BETWEEN the browser and those two is the real, built application:
// the three route.ts handlers, `proveSameOrigin`, the trusted-IP courier, the
// flash cookies, the redirects, the forms and every card. That is exactly the
// layer a browser leg is for.
//
// STRIPE IS NOT STOOD IN FOR, AND THAT IS DELIBERATE. An earlier cut of this
// module served `/v1/checkout/sessions` and a hosted-page stand-in, reached
// through a base override in `lib/checkout/stripe-session.ts`. That override
// is gone — its own dev/loopback fence correctly ignores it under `next start`,
// and loosening the fence to make a walk pass is what hard constraint 14
// forbids — so the handlers are gone with it rather than left as dead code a
// reader would mistake for coverage. `POST /checkout` runs for real up to and
// including the Stripe attempt, and the walk asserts the honest refusal card
// and the unstamped intent that follow.
//
// IT PROVES NOTHING ABOUT THE DOORS' OWN REFUSALS. `open_checkout_intent`'s
// rate wall, `claim_paid_firm`'s `FOR UPDATE` serialization, the DPA-version
// pin — those are DB properties and they are celled in
// `packages/db/tests/checkout-gate-c6.test.mjs` and (for C-3's own objects)
// in #493's battery, against a real Postgres. The PR body says so rather than
// letting a green browser run imply more than it measured.
//
// THE JOURNEY IS STATEFUL, and it advances only on the acts that advance it in
// production: `sign_dpa` sets `dpaSigned`, `record_checkout_session` sets
// `checkoutOpen`, the synthetic "payment applied" step sets `paidUnconsumed`,
// `claim_paid_firm` sets `firmOpened` and clears the payment. A spec that
// skipped a step therefore reads the state a person who skipped it would.

import { createHash } from "node:crypto";

/** A REAL body/hash pair — the hash is sha256 of the exact bytes served.
 *  裁-90's byte-identity law is that `sign_dpa` compares the SUBMITTED hash
 *  against the document's own, so a fixture whose hash could not fail that
 *  check would prove nothing about the app forwarding it verbatim. */
export const E2E_DPA_VERSION = "e2e-beta-2026-09-a";
export const E2E_DPA_BODY =
  "This is Clara's beta data-processing agreement, pending review by the owner's lawyer before launch.";
export const E2E_DPA_SHA = `\\x${createHash("sha256").update(E2E_DPA_BODY, "utf8").digest("hex")}`;

export const E2E_INTENT_ID = "44444444-4444-4444-8444-444444444444";
export const E2E_PLAN_KEY = "e2e-beta-plan";
export const E2E_STRIPE_PRICE = "price_e2e_fixture";

/** The control endpoint a spec drives to script the auth wall's verdict and to
 *  advance the synthetic payment. It is on the MOCK's own prefix, never a path
 *  the app serves, so nothing in the built app can reach it. */
export const CONTROL_PATH = "/e2e-control";

/**
 * Handle a request that belongs to FS-4's mocked backend.
 * @returns {Promise<boolean>} true when handled.
 */
export async function handleCheckoutMock(ctx) {
  const { request, response, path, cors, state, sendJson, readJson, registrationId } = ctx;

  // ── the spec's control surface ────────────────────────────────────────────
  if (request.method === "POST" && path === CONTROL_PATH) {
    const body = await readJson(request);
    if (body.authWall) state.authWall = body.authWall;
    if (typeof body.paidUnconsumed === "boolean") state.paidUnconsumed = body.paidUnconsumed;
    if (typeof body.checkoutOpen === "boolean") state.checkoutOpen = body.checkoutOpen;
    if (typeof body.dpaSigned === "boolean") state.dpaSigned = body.dpaSigned;
    if (body.reset) {
      // The registration is part of the journey state: leaving it open made a
      // later test land on the DPA step instead of the firm form, which read
      // as "no session" and cost a debugging round.
      state.registrationOpen = false;
      state.dpaSigned = false;
      state.checkoutOpen = false;
      state.paidUnconsumed = false;
      state.firmOpened = false;
      state.authWall = { mode: "verify" };
      state.authWallRequests = [];
      state.doorCalls = [];
    }
    sendJson(response, 200, {
      authWallRequests: state.authWallRequests,
      doorCalls: state.doorCalls,
      dpaSigned: state.dpaSigned,
      checkoutOpen: state.checkoutOpen,
      paidUnconsumed: state.paidUnconsumed,
      firmOpened: state.firmOpened,
    }, cors);
    return true;
  }

  // ── C-5's ONE confirm endpoint (A-M3) ─────────────────────────────────────
  if (request.method === "POST" && path === "/api/auth-wall/confirm") {
    const body = await readJson(request);
    // Recorded so the spec can assert what `apps/web` SENT — the two fields
    // and the forwarded client address — rather than only what came back.
    state.authWallRequests.push({
      body,
      authorization: request.headers.authorization ?? null,
      clientIp: request.headers["x-clara-client-ip"] ?? null,
    });
    const wall = state.authWall ?? { mode: "verify" };
    if (wall.mode === "locked") {
      sendJson(response, 429, {
        allowed: false,
        remaining: wall.remaining ?? 0,
        scope: wall.scope ?? "email",
        retry_after_seconds: wall.retryAfterSeconds ?? 300,
      }, cors);
      return true;
    }
    if (wall.mode === "unconfigured") {
      sendJson(response, 503, { error: "auth_wall_unconfigured" }, cors);
      return true;
    }
    const verified = body?.token === ctx.signupCode && body?.email === state.email;
    sendJson(response, 200, {
      allowed: true,
      remaining: wall.remaining ?? 4,
      verified,
      session: verified
        ? { access_token: ctx.accessToken(), refresh_token: "e2e-refresh-token", token_type: "bearer" }
        : null,
    }, cors);
    return true;
  }

  return handleCheckoutDoors(ctx, { registrationId });
}

/** The five C-3 doors plus C-6's two, behind PostgREST's `/rest/v1/rpc/…`. */
async function handleCheckoutDoors(ctx, { registrationId }) {
  const { request, response, path, cors, state, sendJson, readJson } = ctx;
  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const fn = path.slice("/rest/v1/rpc/".length);
  // Every door the app calls, in order. This is what lets a cell assert that a
  // refused request reached NO door — the property a status check alone cannot
  // give, and the one that matters on a surface that spends rate-wall budget
  // and creates tenants.
  (state.doorCalls ??= []).push(fn);

  if (fn === "get_current_dpa_document") {
    sendJson(response, 200, [{
      version: E2E_DPA_VERSION,
      body: E2E_DPA_BODY,
      body_sha256: E2E_DPA_SHA,
      published_at: "2026-09-01T00:00:00.000Z",
    }], cors);
    return true;
  }

  if (fn === "sign_dpa") {
    const body = await readJson(request);
    // 裁-90 IS ENFORCED HERE, not waved through: a hash that is not the
    // document's refuses CLR10, exactly as the real door does. This is what
    // makes the walk's happy arm evidence that the app forwarded the served
    // bytes' own hash rather than something it recomputed.
    if (body.p_body_sha256 !== E2E_DPA_SHA) {
      sendJson(response, 400, {
        code: "CLR10",
        message: "the signed text does not match the current agreement",
      }, cors);
      return true;
    }
    if (body.p_version !== E2E_DPA_VERSION) {
      sendJson(response, 400, { code: "CLR10", message: "unknown dpa version" }, cors);
      return true;
    }
    const replay = state.dpaSigned;
    state.dpaSigned = true;
    sendJson(response, 200, {
      signature_id: "55555555-5555-4555-8555-555555555555",
      signed_at: "2026-09-02T00:00:00.000Z",
      ...(replay ? { replay: true } : {}),
    }, cors);
    return true;
  }

  if (fn === "open_checkout_intent") {
    const body = await readJson(request);
    // The DPA wall, and the digest length wall, both as the real door has
    // them — a walk that could open a checkout without a signature, or with a
    // short digest, would be walking a different product.
    if (!state.dpaSigned) {
      sendJson(response, 400, {
        code: "CLR09",
        message: "the data processing agreement is not signed",
      }, cors);
      return true;
    }
    const digest = String(body.p_origin_digest ?? "");
    if (!/^\\x[0-9a-f]{64}$/.test(digest)) {
      sendJson(response, 400, { code: "CLR10", message: "an origin digest is required" }, cors);
      return true;
    }
    sendJson(response, 200, {
      intent_id: E2E_INTENT_ID,
      price_local_key: E2E_PLAN_KEY,
      stripe_price_id: E2E_STRIPE_PRICE,
    }, cors);
    return true;
  }

  if (fn === "get_current_checkout_plan") {
    sendJson(response, 200, [{
      local_key: E2E_PLAN_KEY,
      payment_method_collection: state.planCollection ?? "if_required",
    }], cors);
    return true;
  }

  if (fn === "record_checkout_session") {
    const body = await readJson(request);
    state.checkoutOpen = true;
    sendJson(response, 200, { intent_id: body.p_intent, recorded: true }, cors);
    return true;
  }

  if (fn === "get_own_checkout_progress") {
    const body = await readJson(request);
    if (body.p_registration !== registrationId) {
      sendJson(response, 400, { code: "CLR04", message: "not your registration request" }, cors);
      return true;
    }
    sendJson(response, 200, [{
      checkout_open: state.checkoutOpen,
      paid_unconsumed: state.paidUnconsumed,
    }], cors);
    return true;
  }

  if (fn === "claim_paid_firm") {
    const body = await readJson(request);
    if (!state.paidUnconsumed && !state.firmOpened) {
      sendJson(response, 400, {
        code: "CLR09",
        message: "no completed payment for this registration",
      }, cors);
      return true;
    }
    const replay = state.firmOpened;
    state.firmOpened = true;
    state.paidUnconsumed = false;
    sendJson(response, 200, {
      firm_id: ctx.firmId,
      plan_id: "66666666-6666-4666-8666-666666666666",
      registration_id: body.p_registration,
      ...(replay ? { replay: true } : {}),
    }, cors);
    return true;
  }

  return false;
}
