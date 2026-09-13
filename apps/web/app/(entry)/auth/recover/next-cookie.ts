/**
 * THE RETURN-TARGET COOKIE — how the validated same-origin `next` a person
 * was blocked at (#698: `/login?next=…`) survives their FORGOT-PASSWORD trip
 * so they land back there after resetting, rather than on Home.
 *
 * ============================================================================
 * WHY A COOKIE AND NOT THE SUPABASE `redirectTo` URL
 * ============================================================================
 * `password-recovery-form.tsx` calls `resetPasswordForEmail(email,
 * {redirectTo: `${origin}/auth/recover`})`. That URL is checked against the
 * Supabase project's own configured redirect-URL allow list, which this repo
 * does not own or control the exact matching rules of — appending `?next=…`
 * to it would make the value's SURVIVAL depend on how that allow list matches
 * query strings, a fact this codebase cannot verify or pin a test against.
 * The journey is carried instead through THIS APP'S OWN cookie and its OWN
 * internal redirect, never through the provider-facing URL.
 *
 * ============================================================================
 * THE JOURNEY, END TO END
 * ============================================================================
 *   1. `login-form.tsx`'s "Forgot password?" link forwards `next` as a query
 *      param: `/forgot-password?next=<encoded>`.
 *   2. `lib/supabase/proxy.ts`'s `updateSession` SETS this cookie on the
 *      pass-through response, reading `next` off `request.nextUrl` — the
 *      ONLY point in the app that can write a cookie on this GET (a Server
 *      Component render, which `forgot-password/page.tsx` is, cannot: Next.js
 *      permits `cookies().set()` only from a Server Action or Route Handler).
 *      The RAW value is stored, unvalidated — `resolveSameOriginPath` is the
 *      one wall this value crosses, and it runs at the far end (3), not here;
 *      storing a value this hop has not yet proven safe is fine precisely
 *      because nothing downstream trusts it without that proof.
 *   3. The person leaves the browser, receives the email, and clicks the
 *      link — a CROSS-SITE TOP-LEVEL GET NAVIGATION (their mail client is a
 *      different site), landing on `/auth/recover?code=…`. `handler.ts`
 *      (`handlePasswordRecovery`, a REAL Route Handler — the one place after
 *      step 2 that can also read AND clear a cookie) reads this cookie off
 *      the request's own `Cookie` header, and — ONLY on a successful code
 *      exchange — clears it and forwards its raw value onward as its OWN
 *      redirect's `?next=` query param (`/auth/recover/password?next=…`): an
 *      internal, server-constructed redirect, never the provider-facing URL.
 *      A FAILED exchange leaves the cookie untouched, so a retry after
 *      requesting a fresh link still has it (bounded by its own max-age).
 *   4. `password-reset-route.tsx` reads that query param and passes it to
 *      `PasswordResetForm` as a plain, still-unvalidated string prop.
 *   5. `PasswordResetForm` is the ACTUAL wall: it resolves the prop through
 *      `lib/safe-redirect.ts`'s `resolveSameOriginPath` — the SAME function
 *      `login-form.tsx` itself reads `?next=` through — before ever using it
 *      as an `href`, exactly once, at the point it is about to be rendered.
 *      Anything malformed, foreign-origin, or absent falls back to `/`.
 *
 * ============================================================================
 * WHY `SameSite=Lax`, NOT `Strict` — cookie-options.ts's OWN reasoning,
 * restated for a second cookie that needs it for the identical structural
 * reason
 * ============================================================================
 * `lib/supabase/cookie-options.ts` already carries this exact argument for
 * the SESSION cookie: "the invite-accept link in an email is a cross-site
 * top-level GET navigation, and 'strict' would withhold the session cookie on
 * that first hop." Step 3 above is the SAME shape — a link clicked from an
 * email client is a cross-site top-level navigation to THIS cookie's reader
 * — so `Strict` (the confirm lane's `confirm-flash.ts` cookie, whose only
 * consumer is a SAME-SITE POST's own redirect, correctly uses `Strict`) would
 * silently withhold this cookie at the one hop that matters. `Lax` withholds
 * it only from cross-site POSTs, which nothing in this journey needs.
 *
 * ============================================================================
 * WHY NO NONCE/HMAC (confirm-flash.ts's OWN apparatus, deliberately NOT
 * copied)
 * ============================================================================
 * `confirm-flash.ts`'s nonce exists because ITS cookie carries AUTHORITATIVE
 * data (attempt counts, lockout waits) that a forged or cross-tab-crossed
 * value could paint as a false lockout/success card — a card-authenticity
 * concern. This cookie carries a bare PATH, and the one thing anyone could do
 * with a forged or stale value is request a same-origin redirect — which
 * `resolveSameOriginPath` (step 5) already reduces to "prove it is
 * same-origin or fall back to `/`" regardless of where the value came from.
 * There is no card to forge and no count to spoof, so the wall lives entirely
 * at the READ side, same-origin-validated on every use — the cookie itself
 * needs no integrity apparatus beyond `httpOnly` (denies a same-origin script
 * a cheap read/write, though `resolveSameOriginPath` makes even a
 * script-written value harmless) and a bounded lifetime.
 */

import type { NextResponse } from "next/server";

const PROD_COOKIE_NAME = "__Host-clara-recovery-next";
const DEV_COOKIE_NAME = "clara-recovery-next";

/** An hour: generous enough that a person who does not check their inbox
 *  immediately still gets their destination back, bounded so an abandoned
 *  cookie does not linger indefinitely. Independent of however long GoTrue's
 *  own PKCE flow-state validity is configured — a code that outlives this
 *  cookie still resolves to a correct `expired`/`used_or_unknown` card
 *  either way; this bound is purely about how long THIS APP remembers the
 *  intent, not about the code's own validity. */
export const RECOVERY_NEXT_MAX_AGE_SECONDS = 3600;

/** The longest value this cookie will ever store. A `next` this long was
 *  never a plausible in-app path in the first place — bounding it keeps a
 *  malformed or hostile value from growing the cookie into a storage channel,
 *  the same discipline `confirm-flash.ts`'s own `EMAIL_MAX_CHARS` applies to
 *  its echoed address. `resolveSameOriginPath` still owns the actual safety
 *  proof; this is only a size floor. */
const NEXT_MAX_CHARS = 2048;

/** Mirrors `lib/same-origin.ts`'s `readSameOriginConfig` dev/loopback
 *  carve-out exactly (same three conditions), the same copy
 *  `confirm-flash.ts` keeps rather than importing — cookie naming and
 *  CSRF-origin config are unrelated facts that happen to share one guard. */
function insecureLoopbackAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env.NODE_ENV !== "production" &&
    (env.NODE_ENV === "development" || env.CLARA_ALLOW_INSECURE_LOOPBACK === "1")
  );
}

/** The cookie name AND whether it may carry `Secure` are the SAME decision —
 *  `__Host-` is rejected by the browser outright without `Secure`+HTTPS. */
export function recoveryNextCookie(
  env: Record<string, string | undefined> = process.env,
): { readonly name: string; readonly secure: boolean } {
  if (insecureLoopbackAllowed(env)) return { name: DEV_COOKIE_NAME, secure: false };
  return { name: PROD_COOKIE_NAME, secure: true };
}

/**
 * THE WRITE SIDE — called from `lib/supabase/proxy.ts`'s pass-through
 * branch. Overwrites any earlier pending value (the latest `/forgot-password
 * ?next=` visit wins), and does NOTHING when `rawNext` is absent or
 * over-long — an ordinary revisit to `/forgot-password` with no `next` must
 * not clobber a still-pending value from a moment ago in the same journey
 * step 2 describes above.
 */
export function setRecoveryNextCookie(
  response: NextResponse,
  rawNext: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (rawNext.length === 0 || rawNext.length > NEXT_MAX_CHARS) return;
  const { name, secure } = recoveryNextCookie(env);
  // NOT pre-encoded here — `@edge-runtime/cookies` (the engine behind
  // `NextResponse.cookies`) already `encodeURIComponent`s a cookie's value
  // when it serializes the actual `Set-Cookie` response header, MEASURED
  // rather than assumed: an earlier version of this function called
  // `encodeURIComponent(rawNext)` itself, producing a header that read
  // `%252Fwork%253F…` — the `%` from THIS call's own encoding encoded a
  // SECOND time by the library's, which `readRecoveryNextCookie`'s single
  // `decodeURIComponent` could not reverse. Passing the raw value lets the
  // library's own ONE layer of encoding be the only one, matching what
  // `decodeURIComponent` on the read side actually undoes.
  response.cookies.set(name, rawNext, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: RECOVERY_NEXT_MAX_AGE_SECONDS,
  });
}

/**
 * THE CLEAR SIDE — called from `handler.ts` only on a successful code
 * exchange (step 3 above). An expired `Set-Cookie` overwrites the earlier
 * one regardless of which `secure`/name variant wrote it, since both are
 * scoped to `path: "/"` on the same host.
 */
export function clearRecoveryNextCookie(
  response: NextResponse,
  env: Record<string, string | undefined> = process.env,
): void {
  const { name, secure } = recoveryNextCookie(env);
  response.cookies.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

/**
 * THE READ SIDE — a bare `Request`'s own `Cookie` header, parsed by hand
 * rather than through `next/headers`' `cookies()`: `handlePasswordRecovery`
 * takes a plain Web `Request` deliberately (so `tests/
 * password-recovery-handler.test.ts` can drive it with `new Request(...)`
 * outside any Next.js request context), and `cookies()` requires that
 * context to exist at all. `null` for a missing or empty value — never an
 * empty string, so a caller's `!== null` check is the one thing it needs.
 */
export function readRecoveryNextCookie(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;
  const { name } = recoveryNextCookie(env);
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const value = part.slice(eq + 1).trim();
    if (value.length === 0) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}
