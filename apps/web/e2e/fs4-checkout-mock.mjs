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
// #628 DID NOT CHANGE THAT, AND THE DECISION IS WORTH STATING. The resume and
// cancel routes each make a NEW Stripe call (`GET /v1/checkout/sessions/{id}`
// and `POST …/expire`), and standing either of them in would need the base
// override this module's next paragraph records as deliberately removed. So
// they are not stood in for either: with no `STRIPE_SECRET_KEY` the seam
// refuses `unconfigured` before any socket opens, and the walk asserts the
// honest outcome that follows — for CANCEL that is the full journey, because
// `cancel_checkout_intent` runs FIRST and the Stripe expiry is best effort by
// design, so a refused expiry leaves the intent cancelled and the person on
// `/pending` exactly as production would. For RESUME it is the configuration
// card plus the property that actually matters (no second Session was minted).
// The two calls' own wire shapes are pinned field by field in
// `lib/checkout/stripe-session.test.ts` against the shipped request.
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
// production: `accept_legal_document` records one acceptance per agreement,
// `record_checkout_session` sets
// `checkoutOpen`, the synthetic "payment applied" step sets `paidUnconsumed`,
// `claim_paid_firm` sets `firmOpened` and clears the payment. A spec that
// skipped a step therefore reads the state a person who skipped it would.

import { createHash } from "node:crypto";

/** REAL body/hash pairs — each hash is sha256 of the exact bytes served.
 *  裁-90's byte-identity law is that `accept_legal_document` compares the
 *  SUBMITTED hash against the document's own, so a fixture whose hash could not
 *  fail that check would prove nothing about the app forwarding it verbatim.
 *
 *  TWO DOCUMENTS, NOT ONE (#621). `dpa_documents` had no `kind` column, so the
 *  old fixture could only ever serve the one agreement the old step could show.
 *  `get_current_legal_documents()` returns one row per kind, each with its own
 *  version, publication status and per-caller acceptance — which is what makes
 *  the draft arm below expressible at all. */
/** PLAIN LOWERCASE HEX, no `\x` prefix — the shape migration 0185 actually
 *  stores. `legal_documents.body_sha256` is a `text` column whose CHECK is
 *  `body_sha256 = encode(sha256(convert_to(body,'UTF8')),'hex')`, so PostgREST
 *  serialises it as the 64 hex characters and nothing else. The `\x` prefix
 *  this used to mint is `bytea`'s wire form — the shape the RETIRED
 *  `dpa_documents` column had — and a fixture wearing it made the walk prove
 *  that the app forwards a hash the real door would never send. */
const sha = (body) => createHash("sha256").update(body, "utf8").digest("hex");

export const E2E_TERMS_VERSION = 2;
export const E2E_TERMS_TITLE = "ClaraBook Beta Terms of Service";
export const E2E_TERMS_BODY =
  "These are ClaraBook's beta terms of service, pending review by the owner's lawyer before launch.";
export const E2E_TERMS_SHA = sha(E2E_TERMS_BODY);

/** The DRAFT arm's own text. A DIFFERENT body and therefore a different hash,
 *  so a walk that somehow accepted it would not accidentally pass the published
 *  document's byte-identity check. */
export const E2E_TERMS_DRAFT_VERSION = 3;
export const E2E_TERMS_DRAFT_BODY =
  "DRAFT: these beta terms of service are still being written and have not been published.";
export const E2E_TERMS_DRAFT_SHA = sha(E2E_TERMS_DRAFT_BODY);

export const E2E_DPA_VERSION = 4;
export const E2E_DPA_TITLE = "ClaraBook Beta Data Processing Agreement";
export const E2E_DPA_BODY =
  "This is Clara's beta data-processing agreement, pending review by the owner's lawyer before launch.";
export const E2E_DPA_SHA = sha(E2E_DPA_BODY);

/** THE DRAFT ARM IS SELECTED BY THE SIGNUP ADDRESS, not by a control call the
 *  walk has to remember to make: an email beginning `e2e-draft-` reads a terms
 *  of service that is still unpublished. A spec can also force it through the
 *  control surface (`legalDraftTerms`), which is what the checkout walk does
 *  when it wants the draft face for an address it already signed up with. */
function termsIsDraft(state) {
  return state.legalDraftTerms === true || String(state.email ?? "").startsWith("e2e-draft-");
}

/** The two rows the door returns, shaped exactly as `0185` declares them. */
function legalDocuments(state) {
  const accepted = state.legalAccepted ?? { terms: null, dpa: null };
  const draft = termsIsDraft(state);
  const terms = draft
    ? {
        kind: "terms",
        version: E2E_TERMS_DRAFT_VERSION,
        status: "draft",
        title: E2E_TERMS_TITLE,
        body: E2E_TERMS_DRAFT_BODY,
        body_sha256: E2E_TERMS_DRAFT_SHA,
        effective_from: null,
        published_at: null,
      }
    : {
        kind: "terms",
        version: E2E_TERMS_VERSION,
        status: "published",
        title: E2E_TERMS_TITLE,
        body: E2E_TERMS_BODY,
        body_sha256: E2E_TERMS_SHA,
        effective_from: "2026-09-01T00:00:00.000Z",
        published_at: "2026-08-30T00:00:00.000Z",
      };
  const dpa = {
    kind: "dpa",
    version: E2E_DPA_VERSION,
    status: "published",
    title: E2E_DPA_TITLE,
    body: E2E_DPA_BODY,
    body_sha256: E2E_DPA_SHA,
    effective_from: "2026-09-01T00:00:00.000Z",
    published_at: "2026-08-30T00:00:00.000Z",
  };
  return [terms, dpa].map((row) => ({
    ...row,
    // The caller's acceptance of THAT version — version-exact, exactly as the
    // real door reports it.
    accepted_at: accepted[row.kind] === row.version ? "2026-09-02T04:30:00.000Z" : null,
    accepted_version: accepted[row.kind] === row.version ? row.version : null,
  }));
}

/** Which kinds are NOT accepted at their current version — the list
 *  `open_checkout_intent` carries in its own refusal detail. */
function missingLegalKinds(state) {
  return legalDocuments(state)
    .filter((row) => row.accepted_at === null)
    .map((row) => row.kind);
}

/** #628 — the statuses that mean a Stripe Session is still LIVE for this
 *  registration, and therefore that `open_checkout_intent` must refuse a second
 *  one. `paid`/`consumed`/`expired`/`payment_failed`/`cancelled` are terminal:
 *  a new checkout is exactly the right answer for those, which is what the
 *  "try again" and "start again" controls post. */
const LIVE_INTENT_STATUSES = new Set(["session_created", "processing"]);

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
    if (body.authWallResend) state.authWallResend = body.authWallResend;
    if (typeof body.paidUnconsumed === "boolean") state.paidUnconsumed = body.paidUnconsumed;
    if (typeof body.checkoutOpen === "boolean") state.checkoutOpen = body.checkoutOpen;
    // #628 — THE INTENT'S OWN LIFECYCLE, driven the way C-5's applier drives it
    // in production: `processing` for an async completed session, `paid` on
    // async success, `payment_failed` (with a reason) on async failure,
    // `expired` on session expiry. A spec moves an intent through those the way
    // the applier would, and the app reads the result through the same door.
    if (typeof body.intentStatus === "string") {
      state.intentStatus = body.intentStatus;
      state.intentStatusAt = "2026-09-12T04:30:00.000Z";
    }
    if ("intentStatusReason" in body) state.intentStatusReason = body.intentStatusReason ?? null;
    if ("intentSessionId" in body) state.intentSessionId = body.intentSessionId ?? null;
    if (typeof body.capacityFull === "boolean") state.capacityFull = body.capacityFull;
    if (typeof body.legalDraftTerms === "boolean") state.legalDraftTerms = body.legalDraftTerms;
    if (body.legalAccepted) state.legalAccepted = { ...state.legalAccepted, ...body.legalAccepted };
    if (body.reset) {
      // The registration is part of the journey state: leaving it open made a
      // later test land on the DPA step instead of the firm form, which read
      // as "no session" and cost a debugging round.
      state.registrationOpen = false;
      state.legalAccepted = { terms: null, dpa: null };
      state.legalDraftTerms = false;
      state.checkoutOpen = false;
      state.paidUnconsumed = false;
      state.firmOpened = false;
      state.intentStatus = null;
      state.intentStatusAt = null;
      state.intentStatusReason = null;
      state.intentSessionId = null;
      state.capacityFull = false;
      state.authWall = { mode: "verify" };
      state.authWallResend = { mode: "sent" };
      state.authWallRequests = [];
      state.doorCalls = [];
    }
    sendJson(response, 200, {
      authWallRequests: state.authWallRequests,
      doorCalls: state.doorCalls,
      legalAccepted: state.legalAccepted,
      missingLegal: missingLegalKinds(state),
      checkoutOpen: state.checkoutOpen,
      paidUnconsumed: state.paidUnconsumed,
      firmOpened: state.firmOpened,
      intentStatus: state.intentStatus ?? null,
      intentSessionId: state.intentSessionId ?? null,
      capacityFull: state.capacityFull === true,
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

  if (fn === "get_current_legal_documents") {
    sendJson(response, 200, legalDocuments(state), cors);
    return true;
  }

  if (fn === "accept_legal_document") {
    const body = await readJson(request);
    const current = legalDocuments(state).find((row) => row.kind === body.p_kind);
    // EVERY REFUSAL THE REAL DOOR RAISES, in the order it raises them, with the
    // DETAIL discriminant the app classifies on. A walk that could accept a
    // draft, a stale version or a mismatched hash would be walking a different
    // product.
    if (current === undefined) {
      sendJson(response, 400, {
        code: "CLR10",
        message: "unknown legal document kind",
        details: JSON.stringify({ reason: "invalid_kind" }),
      }, cors);
      return true;
    }
    if (current.status !== "published") {
      sendJson(response, 400, {
        code: "CLR09",
        message: "that legal document is not published",
        details: JSON.stringify({ reason: "not_published" }),
      }, cors);
      return true;
    }
    if (body.p_version !== current.version) {
      sendJson(response, 400, {
        code: "CLR09",
        message: "that version of the agreement is no longer current",
        details: JSON.stringify({ reason: "stale_version", current: current.version }),
      }, cors);
      return true;
    }
    // 裁-90 IS ENFORCED HERE, not waved through. This is what makes the walk's
    // happy arm evidence that the app forwarded the SERVED bytes' own hash
    // rather than something it recomputed on its way past.
    if (body.p_body_sha256 !== current.body_sha256) {
      sendJson(response, 400, {
        code: "CLR10",
        message: "the accepted text does not match the current agreement",
        details: JSON.stringify({ reason: "hash_mismatch" }),
      }, cors);
      return true;
    }
    const replay = state.legalAccepted[current.kind] === current.version;
    state.legalAccepted[current.kind] = current.version;
    sendJson(response, 200, {
      status: replay ? "already_accepted" : "accepted",
      kind: current.kind,
      version: current.version,
      body_sha256: current.body_sha256,
      accepted_at: "2026-09-02T04:30:00.000Z",
    }, cors);
    return true;
  }

  if (fn === "open_checkout_intent") {
    const body = await readJson(request);
    // The LEGAL wall, and the digest length wall, both as the real door has
    // them — a walk that could open a checkout with an unaccepted agreement, or
    // with a short digest, would be walking a different product. The refusal
    // carries its own reason AND the list of what is outstanding, which is what
    // `/pending`'s card renders.
    const missing = missingLegalKinds(state);
    if (missing.length > 0) {
      sendJson(response, 400, {
        code: "CLR09",
        message: "a required legal document is not accepted",
        details: JSON.stringify({ reason: "legal_not_accepted", missing }),
      }, cors);
      return true;
    }
    // #628 — ADMISSION IS FULL (0186). Refused BEFORE the origin rate wall, in the
    // door's own order, so a refused applicant is not also charged a rate-limit
    // slot for a checkout the estate was never going to admit.
    if (state.capacityFull === true) {
      sendJson(response, 400, {
        code: "CLR09",
        message: "admission is currently full",
        details: JSON.stringify({ reason: "capacity_reached", max_firms: 50, firms_count: 50 }),
      }, cors);
      return true;
    }
    const digest = String(body.p_origin_digest ?? "");
    if (!/^\\x[0-9a-f]{64}$/.test(digest)) {
      sendJson(response, 400, { code: "CLR10", message: "an origin digest is required" }, cors);
      return true;
    }
    // #628 — ONE LIVE SESSION PER REGISTRATION (0186). The refusal carries the
    // intent AND the session the app resumes from; the app never accepts either
    // from the request, so a mock that omitted them would let a broken resume
    // pass by inventing its own target.
    if (state.intentSessionId && LIVE_INTENT_STATUSES.has(state.intentStatus)) {
      sendJson(response, 400, {
        code: "CLR09",
        message: "a checkout is already in progress for this registration",
        details: JSON.stringify({
          reason: "checkout_in_progress",
          intent_id: E2E_INTENT_ID,
          session_id: state.intentSessionId,
          status: state.intentStatus,
          status_at: state.intentStatusAt,
        }),
      }, cors);
      return true;
    }
    // A fresh (or reused) intent. `open` is an intent with no Session yet —
    // exactly what the real door leaves behind until `record_checkout_session`
    // stamps one.
    state.intentStatus = "open";
    state.intentStatusAt = "2026-09-12T04:30:00.000Z";
    state.intentStatusReason = null;
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
    // #628 — the stamp is what moves an intent to `session_created`, which is
    // the status the waiting face and the cancel control both key on.
    state.intentStatus = "session_created";
    state.intentStatusAt = "2026-09-12T04:30:00.000Z";
    state.intentSessionId = body.p_session_id ?? null;
    sendJson(response, 200, { intent_id: body.p_intent, recorded: true }, cors);
    return true;
  }

  // #628 — the narrow read `POST /checkout/cancel` names its intent from. No
  // row when this registration has no intent at all, which is a STATE and not
  // a refusal.
  if (fn === "get_own_checkout_intent_session") {
    const body = await readJson(request);
    if (body.p_registration !== registrationId) {
      sendJson(response, 400, { code: "CLR04", message: "not your registration request" }, cors);
      return true;
    }
    // THE DOOR'S OWN FILTER, mirrored: `0186` selects only a `session_created`
    // or `processing` intent, so a terminal one is NO ROW and the cancel route
    // answers "nothing to cancel". A mock that returned every status would let
    // a UI that offered cancel on a failed payment pass this walk.
    if (!LIVE_INTENT_STATUSES.has(state.intentStatus)) {
      sendJson(response, 200, [], cors);
      return true;
    }
    sendJson(response, 200, [{
      intent_id: E2E_INTENT_ID,
      session_id: state.intentSessionId ?? null,
      status: state.intentStatus,
    }], cors);
    return true;
  }

  // #628 — THE DOOR THAT DECIDES A CANCELLATION, with the two refusals the real
  // one raises. A walk that could cancel a payment the bank was mid-way through
  // confirming would be walking a different product.
  if (fn === "cancel_checkout_intent") {
    if (state.intentStatus === "processing") {
      sendJson(response, 400, {
        code: "CLR09",
        message: "a payment is in flight for this checkout",
        details: JSON.stringify({ reason: "payment_in_flight" }),
      }, cors);
      return true;
    }
    if (state.paidUnconsumed || state.intentStatus === "paid") {
      sendJson(response, 400, {
        code: "CLR09",
        message: "this registration is already paid",
        details: JSON.stringify({ reason: "already_paid" }),
      }, cors);
      return true;
    }
    const replay = state.intentStatus === "cancelled";
    const sessionId = state.intentSessionId ?? null;
    state.intentStatus = "cancelled";
    state.intentStatusAt = "2026-09-12T04:30:00.000Z";
    state.checkoutOpen = false;
    state.intentSessionId = null;
    // A replay carries no session id — the real door has nothing to hand back
    // the second time, which is why the app keeps the one its own read saw.
    sendJson(response, 200, replay
      ? { status: "cancelled", replay: true }
      : { status: "cancelled", session_id: sessionId }, cors);
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
      // #628 — migration 0186's five additions, served EXACTLY as the door
      // declares them (snake_case, nullable text, one boolean). A fixture that
      // shaped them any other way would prove the app can read a shape the real
      // door never sends.
      intent_status: state.intentStatus ?? null,
      intent_status_at: state.intentStatusAt ?? null,
      intent_status_reason: state.intentStatusReason ?? null,
      intent_session_id: state.intentSessionId ?? null,
      capacity_full: state.capacityFull === true,
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

/**
 * C-5's ONE pre-session confirm endpoint (security pass A-M3), served on the
 * RUNTIME origin rather than the Supabase-mock prefix.
 *
 * WHY IT LIVES ON THE RUNTIME. `CLARA_RUNTIME_URL` names one origin, and
 * `serve-built.mjs` points it at the chat-parity lane's mock runtime. An
 * earlier cut of this file served the endpoint under the Supabase prefix and
 * pointed the variable there; merging `origin/main` silently took main's
 * override and every confirmation answered `unavailable`. One runtime, both
 * lanes' routes.
 *
 * @returns {Promise<boolean>} true when handled.
 */
export async function handleAuthWallMock(ctx) {
  const { request, response, path, cors, state, sendJson, readJson } = ctx;
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

  // #621 — THE RESEND LIMB, the same shape and the same wall as the confirm one
  // above. It is a SEPARATE endpoint because it is a separate act: asking for a
  // code spends an attempt of the same C1/C2 budget a guess does, and the
  // provider ALSO keeps its own per-address send cooldown, so the two waits a
  // person can hit are told apart on the wire rather than flattened here.
  if (request.method === "POST" && path === "/api/auth-wall/resend") {
    const body = await readJson(request);
    state.authWallRequests.push({
      body,
      authorization: request.headers.authorization ?? null,
      clientIp: request.headers["x-clara-client-ip"] ?? null,
    });
    const wall = state.authWallResend ?? { mode: "sent" };
    if (wall.mode === "locked") {
      sendJson(response, 429, {
        outcome: "locked",
        retryAfterSeconds: wall.retryAfterSeconds ?? 300,
      }, cors);
      return true;
    }
    if (wall.mode === "rate_limited") {
      sendJson(response, 429, {
        outcome: "rate_limited",
        retryAfterSeconds: wall.retryAfterSeconds ?? 47,
      }, cors);
      return true;
    }
    if (wall.mode === "invalid_email") {
      sendJson(response, 400, { outcome: "invalid_email" }, cors);
      return true;
    }
    if (wall.mode === "unavailable") {
      sendJson(response, 503, { outcome: "unavailable" }, cors);
      return true;
    }
    sendJson(response, 200, { outcome: "sent" }, cors);
    return true;
  }

  return false;
}
