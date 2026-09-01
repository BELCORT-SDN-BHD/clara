// THE CONFIRM-PAGE FLASH — how an outcome crosses the POST→GET boundary
// without living in the URL. N1 fix (裁-109, beta-gating, most conservative
// option): the GET's status card used to be painted straight from
// unauthenticated query params (`?status=locked&wait=900`), so a hand-
// crafted link could paint a fully authoritative-looking lockout/wrong-code
// card that never happened. The fix moves the AUTHORITATIVE payload into a
// server-set httpOnly cookie; the URL keeps only a non-authoritative,
// single-use-shaped MARKER (`?flash=<nonce>`) whose sole job is telling the
// page "check the cookie", never what to render.
//
// WHY A COOKIE, NOT A SIGNED QUERY PARAM (HMAC): a signed param still LEAKS
// the outcome into the URL bar, server access logs, and browser history —
// this avoids that, and needs no new secret to provision/rotate across
// environments. Unforgeability comes from the browser's own same-origin
// Set-Cookie restriction: an attacker's link cannot also plant a cookie in
// the victim's browser for this domain, which is exactly the threat this
// fixes.
//
// THE NONCE (FOLD 1, design review): a single cookie jar with no per-
// redirect identity lets two concurrent confirm attempts (two tabs, two
// different addresses) cross-render — tab A's redirect could paint tab B's
// cookie if B's POST landed last, in either direction (an understating
// lockout OR an overstating one). Binding the marker to a fresh
// `crypto.randomUUID()` nonce carried in BOTH the cookie and the query,
// checked for an EXACT match before rendering, closes that: a mismatched
// or absent nonce takes the same fail-closed path as a missing cookie. This
// is NOT `attemptId` — a database identifier has no business riding in a
// URL or an access log; the nonce carries no meaning beyond matching.
//
// COOKIE ATTRIBUTES:
//  - `__Host-` prefixed in production (Secure implied, Path=/, no Domain —
//    the prefix itself blocks sibling-subdomain cookie planting, which
//    `__Secure-` does not). A dev/loopback carve-out drops the prefix
//    (browsers reject `__Host-` without HTTPS), mirroring `same-origin.ts`'s
//    `readSameOriginConfig` dev/loopback posture exactly — kept as its own
//    tiny check here rather than imported, since cookie naming and CSRF-
//    origin config are unrelated facts that happen to share one guard.
//  - `httpOnly`, `sameSite: "strict"` (FOLD 3 hardening — the only consumer
//    is the POST's own same-site 303 redirect, which Strict serves; Strict
//    additionally kills the class where a mailed link makes the victim's
//    browser attach its OWN jar's contents to a cross-site request, which
//    is also this finding's own remote-trigger shape).
//  - `maxAge`: 120s for every outcome except `locked`, which needs to
//    survive as long as the copy tells the person to wait (FOLD 4 —
//    `min(waitSeconds, 900) + 60`; the +60 pads a slow redirect/paint, the
//    `min` bounds a future door bug that returns something absurd).
//
// VALIDATION'S JOB HERE IS STALE/DEPLOY-SKEW DEFENSE, NOT ANTI-FORGERY.
// `parseConfirmFlash` below re-checks the payload's shape and numeric
// bounds on every read — but the FORGERY wall is `httpOnly` plus the
// same-origin Set-Cookie restriction, already closed before this function
// ever runs. A later reader must not "simplify away" this validation as
// redundant: its job is catching a payload a DIFFERENT build wrote in a
// shape THIS build no longer parses (a rolling deploy where the POST is
// served by build N and the GET by build N+1) — reusing the same numeric
// ceilings the values were always bound by, now defending against deploy
// skew instead of an attacker who was already shut out by `httpOnly`.
//
// THE ACCEPTED DEPLOY-SKEW BLIP: build N sets the cookie; build N+1 (a
// rolling deploy landed mid-flow) reads it and cannot parse a shape it does
// not recognise → renders the same `invalid` card a genuine tamper would.
// Bounded to the cookie's own lifetime and accepted — a person who
// resubmits gets a fresh, correctly-shaped flash from whichever build
// answers next. THAT BOUND IS NOT UNIFORMLY ≤120s (correction, fresh opus
// review, 2026-09-01): FOLD 4 gives `locked` up to `900 + 60 = 960` seconds
// — a ~16-minute window for that one variant, not the 120s every other
// outcome gets. The reasoning is unchanged; only the number was wrong.
//
// SAME-ORIGIN XSS STILL FORGES THE CARD — NAMED, NOT LEFT TO BE INFERRED
// (fresh opus review, 2026-09-01). `httpOnly` and the `__Host-` prefix
// defend against a THIRD PARTY's link; they do nothing against script
// already running on this origin, which can `fetch()` the confirm POST
// itself and observe/replay whatever it wants regardless of any cookie
// flag. This is not an incremental hole this fix opens: this estate's own
// session cookie is deliberately `httpOnly: false` (a separate, standing
// decision), so same-origin XSS is already terminal for reasons that have
// nothing to do with this page. Stated here so a reader does not credit
// this mechanism with XSS-resistance it was never designed to have.

const PROD_COOKIE_NAME = "__Host-clara-confirm-flash";
const DEV_COOKIE_NAME = "clara-confirm-flash";

const DEFAULT_MAX_AGE_SECONDS = 120;
const LOCKED_MAX_AGE_PADDING_SECONDS = 60;
/** C1/C2's own ceiling (part 1 §3.4) — the sole owner of this number now;
 *  `page.tsx` no longer keeps its own copy (it validated a query string
 *  before N1, and reads only this module's `parseConfirmFlash` now). */
const LOCKED_MAX_WAIT_SECONDS = 900;
/** C1/C2's own attempt ceiling (part 1 §3.4) — same ownership note. */
const REMAINING_MAX = 5;

export type ConfirmFlashOutcome =
  | { readonly kind: "wrong"; readonly remaining: number }
  | { readonly kind: "locked"; readonly waitSeconds: number }
  | { readonly kind: "unavailable" }
  | { readonly kind: "invalid" };

export type ConfirmFlashPayload = ConfirmFlashOutcome & { readonly nonce: string };

/** Mirrors `lib/same-origin.ts`'s `readSameOriginConfig` dev/loopback
 *  carve-out exactly (same three conditions) — see this module's header
 *  for why it's a separate copy rather than an import. */
function insecureLoopbackAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env.NODE_ENV !== "production" &&
    (env.NODE_ENV === "development" || env.CLARA_ALLOW_INSECURE_LOOPBACK === "1")
  );
}

/** The cookie name AND whether it may carry `Secure` are the SAME decision
 *  — `__Host-` is rejected by the browser outright without `Secure`+HTTPS,
 *  so the two must never be set independently of each other. */
export function confirmFlashCookie(
  env: Record<string, string | undefined> = process.env,
): { readonly name: string; readonly secure: boolean } {
  if (insecureLoopbackAllowed(env)) return { name: DEV_COOKIE_NAME, secure: false };
  return { name: PROD_COOKIE_NAME, secure: true };
}

/** FOLD 4: every outcome gets the same short life EXCEPT `locked`, whose
 *  own copy tells the person how long to wait — a cookie that outlives the
 *  copy's own promise would let someone who obeys it and reloads land on
 *  `invalid` instead of the same true card. */
export function confirmFlashMaxAgeSeconds(outcome: ConfirmFlashOutcome): number {
  if (outcome.kind === "locked") {
    return Math.min(outcome.waitSeconds, LOCKED_MAX_WAIT_SECONDS) + LOCKED_MAX_AGE_PADDING_SECONDS;
  }
  return DEFAULT_MAX_AGE_SECONDS;
}

/** `null` for anything that is not a plausible in-range integer — the same
 *  fail-closed discipline the pre-N1 `boundedInt` used against a query
 *  string, now guarding a JSON number against deploy skew instead. */
function boundedInt(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

/**
 * The single validated read. `null` for anything malformed, out-of-bounds,
 * mismatched, or absent — never a partial or best-guess result. `marker` is
 * the `flash` query value the page read alongside the cookie; a payload
 * whose `nonce` does not match it is treated identically to a missing
 * cookie (FOLD 1) — a mismatch is exactly as untrustworthy as no cookie at
 * all, never a value to render.
 */
export function parseConfirmFlash(
  raw: string | undefined,
  marker: string | undefined,
): ConfirmFlashPayload | null {
  if (typeof marker !== "string" || marker.length === 0) return null;
  if (typeof raw !== "string" || raw.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;

  if (typeof candidate.nonce !== "string" || candidate.nonce.length === 0) return null;
  if (candidate.nonce !== marker) return null;

  switch (candidate.kind) {
    case "wrong": {
      const remaining = boundedInt(candidate.remaining, REMAINING_MAX);
      return remaining === null ? null : { nonce: candidate.nonce, kind: "wrong", remaining };
    }
    case "locked": {
      const waitSeconds = boundedInt(candidate.waitSeconds, LOCKED_MAX_WAIT_SECONDS);
      return waitSeconds === null ? null : { nonce: candidate.nonce, kind: "locked", waitSeconds };
    }
    case "unavailable":
      return { nonce: candidate.nonce, kind: "unavailable" };
    case "invalid":
      return { nonce: candidate.nonce, kind: "invalid" };
    default:
      return null;
  }
}
