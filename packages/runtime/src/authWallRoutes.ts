// FS-4 C-5 item 8 (security pass A-M3) — THE ONE PRE-SESSION CONFIRM ENDPOINT.
//
// ONE ENDPOINT, AND THE SHAPE IS THE WALL. `POST /api/auth-wall/confirm` performs
// claim → `verifyOtp` → settle inside a SINGLE server request. There is no `/claim` route, no
// `/settle` route, and no request field that can name an attempt or choose an outcome.
//
// WHY, MEASURED. `clara.settle_confirmation_attempt(uuid,text)` takes a bare attempt id and
// proves NOTHING about who claimed it — structurally it cannot, because the whole lane is
// pre-session. Combined with the counting predicate in `claim_confirmation_attempt`
// (`a.outcome is distinct from 'accepted'`), an `'accepted'` stamp REMOVES the row from both
// limbs' windows. The security pass measured it: after settling every attempt as accepted, a
// fully exhausted email digest returned `{"allowed":true,"remaining":4}` — a full budget again.
// So a client-callable settle endpoint, or a claim endpoint that hands an attempt id to a
// browser, is not a smaller version of this wall. It is the wall deleted: anyone could reset
// any budget and the six-digit code becomes guessable at leisure.
//
// THE THREE PROPERTIES, EACH WITH ITS OWN CELL:
//   1. `attempt_id` NEVER crosses the wire. It exists in one local `const` in this file, is
//      passed to `settleConfirmationAttempt`, and is not in any response body on any arm.
//   2. A request carrying `attempt_id`/`attemptId`/`outcome` is REFUSED (400), not ignored. A
//      caller sending one has misunderstood the contract, and silently dropping the field is
//      how the next lane concludes it was accepted.
//   3. `outcome` is derived from `verifyOtp`'s OWN result — `verified ? "accepted" : "rejected"`
//      — and there is no code path in this file that reads an outcome from `req.body`.
//
// THE SERVICE-TOKEN GATE, AND WHY IT IS NOT OPTIONAL. The caller has no session — that is the
// point of the flow — so there is no user JWT to check. What DOES need proving is that the
// caller is `apps/web`'s server and not the open internet: this route reaches a DB role, and it
// TRUSTS the client-IP header its caller forwards (see below), which an anonymous caller could
// otherwise spoof to mint a fresh rate-wall budget per request. `CLARA_AUTH_WALL_SERVICE_TOKEN`
// is compared in constant time; unset ⇒ the route refuses EVERYTHING with 503. There is no
// "allow when unconfigured" arm.
//
// THE CLIENT IP IS THE CALLER'S TO FORWARD, AND THE DEPLOY NOTES SAY SO. `apps/web` sits between
// the browser and this route, so the address this process observes is `apps/web`'s. The courier
// reads `CLARA_TRUSTED_CLIENT_IP_HEADER`, and `apps/web` must set that header to the address ITS
// own proxy observed. Absent or unparseable ⇒ 503 and no claim (design part 3 §3: "absent ⇒
// checkout refuses"). Proceeding with a constant would key C2 on one value for the whole
// deployment — the M1 defect PR #488 already paid for once.
//
// WHY 429 FOR A RATE REFUSAL RATHER THAN 200 WITH A FLAG. The seam
// (`apps/web/.../confirmation-wall.ts`) branches on a typed outcome and reads `scope` +
// `retryAfterSeconds` off the body either way, so the status is free — and an honest 429 means a
// proxy, a log line or a metric can see a lockout without parsing JSON. Both arms carry the full
// body; the seam's `remaining ∈ [0,5]` and `retryAfterSeconds ∈ [0,900]` display bounds are the
// door's own (it clamps to 900 and to `greatest(0, …)`), passed through here UNTOUCHED — this
// route computes no number the DB owns.

import express from "express";
import { timingSafeEqual } from "node:crypto";
import {
  claimConfirmationAttempt,
  settleConfirmationAttempt,
  authWallLaneConfigured,
} from "../lib/checkout-pools.mjs";
import { emailDigestFor, originDigestFrom } from "../lib/rate-wall-courier.mjs";
import { verifySignupOtp, supabaseVerifyConfigured } from "../lib/supabase-verify.mjs";

export const CONFIRM_PATH = "/api/auth-wall/confirm";
export const SERVICE_TOKEN_VAR = "CLARA_AUTH_WALL_SERVICE_TOKEN";

/** Fields whose PRESENCE is a refusal, not an ignorable extra (property 2 above). */
export const FORBIDDEN_REQUEST_FIELDS = Object.freeze(["attempt_id", "attemptId", "outcome"]);

/** Constant-time bearer compare. Unequal lengths are unequal, compared away without
 *  `timingSafeEqual`, which throws on a length mismatch rather than returning false. */
function bearerMatches(header: string | undefined, expected: string): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(typeof header === "string" ? header.trim() : "");
  if (!m?.[1]) return false;
  const a = Buffer.from(m[1].trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/**
 * The refusal map for a malformed request, exported so a cell drives THIS function rather than a
 * copy of its predicate (裁-107: a cell that proves a gate discriminates must execute the gate).
 * Returns null when the body is acceptable.
 */
export function confirmRequestRefusal(body: unknown): { error: string; message: string } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "bad_request", message: "a JSON object body is required" };
  }
  for (const field of FORBIDDEN_REQUEST_FIELDS) {
    if (Object.hasOwn(body as object, field)) {
      // A-M3: naming the field is deliberate. This is a server-to-server contract, the caller is
      // ours, and a caller that sends one of these has to be told which one so it is fixed
      // rather than retried.
      return {
        error: "unexpected_field",
        message: `${field} is never accepted on this endpoint: the attempt is claimed, verified and settled inside this one request`,
      };
    }
  }
  const { email, token } = body as { email?: unknown; token?: unknown };
  if (typeof email !== "string" || email.trim() === "") {
    return { error: "bad_request", message: "an email is required" };
  }
  if (typeof token !== "string" || token.trim() === "") {
    return { error: "bad_request", message: "a token is required" };
  }
  return null;
}

export function authWallRoutes(): express.Router {
  const router = express.Router();

  // Its own tiny JSON parser, scoped to this path. The router is mounted beside the Stripe
  // webhook (before the global parser), so it cannot rely on `express.json()` having run.
  router.post(CONFIRM_PATH, express.json({ limit: "16kb" }), async (req, res) => {
    const expectedToken = process.env[SERVICE_TOKEN_VAR];
    if (typeof expectedToken !== "string" || expectedToken.trim() === "") {
      console.error(`[clara-runtime] auth wall REFUSED: ${SERVICE_TOKEN_VAR} is not configured`);
      res.status(503).json({ error: "auth_wall_unconfigured" });
      return;
    }
    if (!bearerMatches(req.header("authorization"), expectedToken)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    // N-3: BOTH configuration probes sit BELOW the bearer check, deliberately. They answer
    // distinct 503s, so before the reorder an anonymous caller could learn whether each lane was
    // wired by reading which one came back. Harmless in itself, but this endpoint is public and
    // a configuration oracle is free to remove. The `SERVICE_TOKEN` check above is the one probe
    // that cannot move below the bearer — it IS the bearer.
    if (!authWallLaneConfigured()) {
      console.error("[clara-runtime] auth wall REFUSED: the auth-wall lane DSN is not configured");
      res.status(503).json({ error: "auth_wall_lane_unconfigured" });
      return;
    }
    if (!supabaseVerifyConfigured()) {
      // Refused BEFORE the claim. Claiming an attempt we then cannot verify would spend one of
      // the applicant's five guesses on our own misconfiguration.
      console.error("[clara-runtime] auth wall REFUSED: the Supabase verify endpoint is not configured");
      res.status(503).json({ error: "verify_unconfigured" });
      return;
    }

    const refusal = confirmRequestRefusal(req.body);
    if (refusal) {
      res.status(400).json(refusal);
      return;
    }
    const { email, token } = req.body as { email: string; token: string };

    // THE TWO DIGESTS. Both must exist before anything is claimed; a missing pepper or an
    // unreadable client address refuses the request rather than keying the wall on a constant.
    const originDigest = originDigestFrom((name: string) => req.header(name));
    if (originDigest === null) {
      console.error("[clara-runtime] auth wall REFUSED: no trusted client-IP digest (header or pepper absent/unparseable)");
      res.status(503).json({ error: "origin_digest_unavailable" });
      return;
    }
    const emailDigest = emailDigestFor(email);
    if (emailDigest === null) {
      console.error("[clara-runtime] auth wall REFUSED: no email digest (the rate-wall pepper is absent)");
      res.status(503).json({ error: "origin_digest_unavailable" });
      return;
    }

    let claim: {
      attempt_id: string;
      allowed: boolean;
      remaining: number;
      scope: string | null;
      retry_after_seconds: number | null;
    };
    try {
      claim = (await claimConfirmationAttempt(emailDigest, originDigest)) as typeof claim;
    } catch (err) {
      console.error(`[clara-runtime] auth wall claim failed: ${(err as Error)?.message ?? err}`);
      res.status(500).json({ error: "internal" });
      return;
    }

    // THE REFUSED ARM. The door's own numbers, verbatim — `scope` and `retry_after_seconds` are
    // computed from DB-owned window state (裁-103) and this route never recomputes or clamps
    // them. `attempt_id` is NOT in this body.
    if (claim.allowed !== true) {
      res.status(429).json({
        allowed: false,
        remaining: claim.remaining,
        scope: claim.scope,
        retry_after_seconds: claim.retry_after_seconds,
      });
      return;
    }

    // THE VERIFICATION, inside this same request. `verifySignupOtp` never throws for a wrong
    // code; it throws only when the config is broken, which is 503 and NOT an acceptance.
    let verified = false;
    let session: Record<string, unknown> | null = null;
    try {
      const out = await verifySignupOtp({ email, token });
      verified = out.verified;
      session = out.session;
    } catch (err) {
      // The attempt is already claimed and MUST be settled honestly. It is settled 'rejected'
      // below, on the way out, exactly as a wrong code would be — an errored verification is
      // never an acceptance.
      console.error(`[clara-runtime] auth wall verify failed: ${(err as Error)?.message ?? err}`);
    }

    // THE SETTLE. `outcome` is derived HERE from `verified` and from nothing else.
    const outcome = verified ? "accepted" : "rejected";
    try {
      await settleConfirmationAttempt(claim.attempt_id, outcome);
    } catch (err) {
      // Loud, and NOT fatal to the caller's answer. An unsettled attempt stays `outcome IS NULL`
      // and counts against C1/C2 as if rejected (design part 3 §2.1) — the fail-closed reading —
      // so the applicant loses a guess rather than the wall losing a row.
      console.error(
        `[clara-runtime] auth wall settle(${outcome}) failed — the attempt stays unsettled and counts as rejected: ${(err as Error)?.message ?? err}`,
      );
    }

    // THE ALLOWED ARM. `remaining` is the door's own number. `session` is present only when
    // verified, and `apps/web` seals it into its own cookie — see `lib/supabase-verify.mjs`'s
    // header for why the tokens travel this hop rather than being re-verified downstream.
    // `attempt_id` is NOT in this body either.
    res.status(200).json({ allowed: true, remaining: claim.remaining, verified, session });
  });

  return router;
}
