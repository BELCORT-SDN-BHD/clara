// THE CONFIRM WALL — WIRED FOR REAL by FS-4 C-6 Lane B. Lane A's honest stub
// (`{kind:"unavailable"}` on every call, never a fabricated "allowed") retires
// here, and so does its two-function claim/settle shape.
//
// ============================================================================
// WHY THIS IS NOW ONE FUNCTION AND NOT TWO — the completion contract CHANGED
// ============================================================================
// Lane A's contract said: "Replace `claimConfirmationAttempt` and
// `settleConfirmationAttempt` below with real calls to the runtime route C-5
// adds." C-5 shipped ONE route, deliberately, as the security pass's A-M3 fix,
// and the two-call shape it anticipated is not merely unavailable — it is the
// shape that was found to be unsafe. `packages/runtime/src/authWallRoutes.ts`
// measured it: `clara.settle_confirmation_attempt(uuid,text)` takes a bare
// attempt id and proves NOTHING about who claimed it (structurally it cannot —
// the whole lane is pre-session), and `claim_confirmation_attempt`'s counting
// predicate is `a.outcome is distinct from 'accepted'`, so an `'accepted'`
// stamp REMOVES the row from both limbs' windows. After settling every attempt
// as accepted, an exhausted email digest measured `{"allowed":true,
// "remaining":4}` — a full budget again. A caller that can settle, or that
// merely HOLDS an attempt id, can reset any budget at will and the six-digit
// code becomes guessable at leisure.
//
// So `POST /api/auth-wall/confirm` performs claim → verifyOtp → settle inside
// one server request; `attempt_id` never crosses the wire; a request carrying
// `attempt_id`, `attemptId` or `outcome` is REFUSED 400 rather than ignored;
// and there is no `/claim` and no `/settle` route to call. This module's
// single function is the shape that contract admits. M2's concern (an attempt
// id threaded to the wrong settlement) is answered better than M2 asked: the
// id exists only in one local `const` inside the runtime process.
//
// ============================================================================
// WHAT THIS APP STILL OWES THE WALL: THE ADDRESS
// ============================================================================
// M1's finding stands and is honoured here. C2 keys on
// `sha256(pepper ‖ proxy-observed client IP)` — one value PER ADDRESS — and
// NEVER the browser's `Origin` header, which is identical for every visitor to
// one deployment (five rejected guesses from anyone would lock out every
// applicant's signup). Lane A could not supply a real value and correctly
// refused to fabricate one.
//
// It can now, and the DIVISION OF LABOUR is C-5's deploy note, not a choice
// made here: `apps/web` sits between the browser and the runtime, so the
// address the runtime observes on its own socket is `apps/web`'s. This app
// reads the address ITS edge observed (`CLARA_TRUSTED_CLIENT_IP_HEADER`, i.e.
// Cloudflare's `CF-Connecting-IP`) and forwards it under
// `AUTH_WALL_CLIENT_IP_HEADER`; the runtime computes the digest with its own
// copy of the shared pepper. So the digest is never computed here, the pepper
// is not needed here for this limb, and the ADDRESS makes exactly one
// server-to-server hop and is never stored, rendered or returned.
//
// The branded `OriginDigest` type Lane A minted has no subject any more —
// nothing on this side of the wall handles a digest for the confirm limb — so
// it is gone rather than kept as a type nobody can construct. The digest type
// that DOES exist now lives with its computation, in `lib/rate-wall-courier.ts`,
// which the checkout route uses because `open_checkout_intent` is a
// `clara_authenticated` door only `apps/web` can call.
//
// ============================================================================
// THE DISPLAY BOUNDS, RECONCILED — AND THEY ARE NOW MEASURED, NOT GUESSED
// ============================================================================
// Lane A recorded a RECONCILIATION OWED: `../confirm-flash.ts`'s
// `LOCKED_MAX_WAIT_SECONDS = 900` and `REMAINING_MAX = 5` rode the assumption
// that C1/C2's window is 15 minutes and its ceiling 5, and warned that a
// genuine lockout outside those bounds would render as a mystery "invalid".
// That is discharged, against `0161`'s shipped body rather than against the
// design prose:
//
//   · `retry_after_seconds` — the door computes each limb's own wait and
//     advertises the MAX, each wrapped in `least(900, greatest(0, …))`. So the
//     value is an integer in [0, 900] BY THE DOOR'S OWN CLAMP.
//   · `remaining` — `greatest(0, 4 - greatest(email_count, origin_count))`, so
//     an integer in [0, 4], inside the clamp's [0, 5].
//   · `scope` — `'email' | 'origin'`, the exact two tokens Lane A chose. Its
//     MEANING is the limb the caller must outlast (the one that clears last),
//     not the limb that happened to fire.
//
// The runtime passes all three through UNTOUCHED (`authWallRoutes.ts`: "this
// route computes no number the DB owns"), and nothing here recomputes or
// re-clamps them either. The clamps in `confirm-flash.ts` therefore stop being
// a guess about the door and become what they should be: a fail-closed check
// on a value that crossed two process boundaries.

import { AUTH_WALL_CLIENT_IP_HEADER } from "@/lib/rate-wall-courier";

/** What the wall decided, told apart from "the wall was not reachable". */
export type ConfirmationOutcome =
  | {
      readonly kind: "verified";
      /** The GoTrue session the runtime obtained. `apps/web` seals it into its
       *  own cookie: a Supabase OTP is single use, so this app cannot re-verify
       *  and the tokens have to travel this one hop. */
      readonly session: VerifiedSession;
      readonly remaining: number;
    }
  /** The wall allowed the attempt and the code was wrong (or expired, or the
   *  address has no pending signup, or the account is banned — 裁-109 flattens
   *  every verification failure into this one outcome deliberately, so a
   *  banned and an unknown address are indistinguishable, N3). */
  | { readonly kind: "wrong"; readonly remaining: number }
  /** C1 or C2 refused BEFORE any verification happened. */
  | { readonly kind: "locked"; readonly scope: "email" | "origin"; readonly retryAfterSeconds: number }
  /** The wall could not be reached or is not configured. Never a bypass. */
  | { readonly kind: "unavailable" };

/** The fields this app needs to seal a cookie session, positively checked. */
export type VerifiedSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
};

export type ConfirmEmailCodeParams = {
  readonly email: string;
  readonly token: string;
  /** The proxy-observed client address this app's OWN edge saw, forwarded to
   *  the runtime so IT can compute the C2 digest. `null` when the courier
   *  could not produce one — see `confirmEmailCode`'s fail-closed arm. */
  readonly clientIp: string | null;
};

export type ConfirmEmailCode = (params: ConfirmEmailCodeParams) => Promise<ConfirmationOutcome>;

export const CONFIRM_ENDPOINT_PATH = "/api/auth-wall/confirm";
export const RUNTIME_URL_VAR = "CLARA_RUNTIME_URL";
export const SERVICE_TOKEN_VAR = "CLARA_AUTH_WALL_SERVICE_TOKEN";
/** The runtime's own timeout is its business; this is the wall this app puts
 *  on a hop that a person is waiting behind. Exceeded ⇒ `unavailable`, never
 *  an acceptance and never a hang. */
export const CONFIRM_TIMEOUT_MS = 10_000;

export type ConfirmEmailCodeDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly env?: Record<string, string | undefined>;
};

/** An integer inside the door's own clamp, or null. Nothing here recomputes a
 *  bound the DB owns; this only refuses a value that could not have come from
 *  the shipped door, which is deploy-skew evidence rather than a policy. */
function boundedInt(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

const REMAINING_MAX = 5;
const RETRY_AFTER_MAX = 900;

/**
 * The ONE call. Every failure class — unconfigured, unauthorised, 503, a
 * timeout, a network error, a body this build will not act on — lands on
 * `unavailable`, which the confirm page renders as an honest "this is not
 * working right now". None of them is ever an acceptance.
 *
 * FAIL CLOSED ON A MISSING ADDRESS, HERE RATHER THAN THERE. With no client IP
 * the runtime would answer 503 `origin_digest_unavailable` anyway; refusing
 * before the request is sent means the applicant does not spend a round trip,
 * and — more importantly — this app never sends a confirm request whose C2
 * limb it knows cannot be keyed. Proceeding with a placeholder address would
 * key C2 on one value for the whole deployment, which is M1 in a new costume.
 */
export const confirmEmailCode: ConfirmEmailCode = async (params) => {
  return confirmEmailCodeWith(params, {});
};

export async function confirmEmailCodeWith(
  params: ConfirmEmailCodeParams,
  deps: ConfirmEmailCodeDeps,
): Promise<ConfirmationOutcome> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const base = env[RUNTIME_URL_VAR];
  const serviceToken = env[SERVICE_TOKEN_VAR];
  if (typeof base !== "string" || base.trim() === "") return { kind: "unavailable" };
  if (typeof serviceToken !== "string" || serviceToken.trim() === "") return { kind: "unavailable" };
  if (params.clientIp === null) return { kind: "unavailable" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIRM_TIMEOUT_MS);
  let response: Response;
  try {
    response = await doFetch(`${base.replace(/\/+$/, "")}${CONFIRM_ENDPOINT_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken.trim()}`,
        "Content-Type": "application/json",
        [AUTH_WALL_CLIENT_IP_HEADER]: params.clientIp,
      },
      // EXACTLY two fields. The endpoint refuses 400 on `attempt_id`,
      // `attemptId` or `outcome`, and this app must never be the caller that
      // discovers that: the outcome is the runtime's to derive from its own
      // `verifyOtp` result and from nothing a client sent.
      body: JSON.stringify({ email: params.email, token: params.token }),
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }

  if (response.status !== 200 && response.status !== 429) return { kind: "unavailable" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "unavailable" };
  }
  if (typeof body !== "object" || body === null) return { kind: "unavailable" };
  const answer = body as Record<string, unknown>;

  if (response.status === 429) {
    if (answer.allowed !== false) return { kind: "unavailable" };
    const retryAfterSeconds = boundedInt(answer.retry_after_seconds, RETRY_AFTER_MAX);
    const scope = answer.scope;
    if (retryAfterSeconds === null || (scope !== "email" && scope !== "origin")) {
      return { kind: "unavailable" };
    }
    return { kind: "locked", scope, retryAfterSeconds };
  }

  if (answer.allowed !== true) return { kind: "unavailable" };
  const remaining = boundedInt(answer.remaining, REMAINING_MAX);
  if (remaining === null) return { kind: "unavailable" };
  if (answer.verified !== true) return { kind: "wrong", remaining };

  // POSITIVELY CHECKED, both tokens. `verified: true` with no usable session is
  // not evidence that a cookie session can be sealed — the same discipline
  // `hasVerifiedSession` applied to `verifyOtp`'s own result before this hop
  // existed, kept verbatim in spirit across the new boundary.
  const session = answer.session;
  if (typeof session !== "object" || session === null) return { kind: "unavailable" };
  const s = session as Record<string, unknown>;
  const accessToken = s.access_token;
  const refreshToken = s.refresh_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) return { kind: "unavailable" };
  if (typeof refreshToken !== "string" || refreshToken.length === 0) return { kind: "unavailable" };
  return { kind: "verified", session: { accessToken, refreshToken }, remaining };
}
