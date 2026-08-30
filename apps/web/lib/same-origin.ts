/**
 * lib/same-origin.ts — the CSRF wall for state-changing Route Handlers.
 *
 * Lives here rather than in `app/logout/route.ts` because a Next.js route
 * file may only export the route contract itself (the HTTP verbs and the
 * segment config), and because this judgement deserves its own tests
 * (tests/same-origin.test.ts).
 *
 * Cross-model security review 2026-08-27, finding 11 (LOW): `SameSite=Lax`
 * blocks cross-SITE POSTs but NOT a same-site cross-ORIGIN one. A hostile
 * sibling origin on the same registrable domain can therefore submit a form
 * to a mutation route and have the victim's cookies ride along.
 *
 * Reviewer note 2 (2026-08-27): the host-only comparison this wall used to run
 * accepted a plain-HTTP Origin against an HTTPS deployment — `Origin:
 * http://app.clara.example` matched `host: app.clara.example` even though the
 * real app never serves that origin over HTTP. A scheme check closes it,
 * checked against the ORIGIN'S OWN URL (never the request URL's authority —
 * this wall must hold behind a proxy that rewrites that authority too).
 *
 * INDEPENDENT REVIEW OF #455, MEDIUM-2 — WHY THIS SEAM RETURNS THE ORIGIN.
 * `lib/members/courier.ts` builds the invitation's own URL, and it used to build
 * it from `new URL(request.url).origin` — a DIFFERENT value from the one this
 * wall validated. Behind a proxy those two genuinely diverge: a request whose
 * `request.url` reads `http://internal.worker.local/api/invite` can pass the wall
 * and then hand the courier an INTERNAL, plain-HTTP authority to put in an email
 * nobody can un-send. So the proof now CARRIES the origin it proved — scheme
 * included, and therefore carrying this file's https/loopback ruling with it —
 * and the courier uses only that. One validated value, one consumer, no second
 * derivation.
 *
 * *(This paragraph originally went on to say the wall "deliberately compares the
 * Origin header against `x-forwarded-host`". That was true when it was written
 * and is NOT true now — round 3's N3 removed it. See the next block.)*
 */

/**
 * CODEX ROUND 2, N3 — WHY A FORWARDED HOST IS NOT EVIDENCE ON ITS OWN.
 *
 * The version above compared the `Origin` header against `x-forwarded-host` as an
 * independent PEER of `Host` and the request URL. A forwarded header is written by
 * whoever spoke to us; Cloudflare's own documentation is that it generally passes
 * incoming request headers through, and nothing in this repo established that this
 * one is stripped or overwritten. So a direct authenticated request could send
 * `Origin: https://attacker.example` AND `X-Forwarded-Host: attacker.example`,
 * satisfy the match against ITSELF, and walk away with a proof carrying the
 * attacker's origin — which the invite courier then puts in an email carrying BOTH
 * bearer factors. Two untrusted headers agreeing is not two pieces of evidence.
 *
 * THE FIX IS A CONFIGURED ALLOWLIST, `CLARA_PUBLIC_ORIGINS`. What a deployment's
 * own public origins are is a fact about the deployment, not something a request
 * can assert. When it is set, the proven origin must be a member — so a forwarded
 * host can no longer license anything the operator has not named. When it is NOT
 * set, `x-forwarded-host` is not consulted AT ALL: the wall falls back to `Host`
 * and the request URL, which is fail-closed (a proxied deployment with no
 * allowlist refuses rather than trusting the proxy blindly) and is visible
 * immediately rather than silently permissive.
 */
export type SameOriginConfig = {
  /** Exact serialized origins this deployment answers on, from
   *  `CLARA_PUBLIC_ORIGINS`. Empty means "not configured" — see above. */
  readonly publicOrigins: readonly string[];
  /** N5: `http://localhost` / `http://127.0.0.1` are accepted ONLY in explicit
   *  development mode or under the explicit insecure-loopback opt-in. */
  readonly allowInsecureLoopback: boolean;
};

/** Parse the allowlist. A value must ALREADY BE an exact canonical origin;
 *  `URL.origin` is a validator, never a repair tool that silently discards a
 *  path/query/credential or normalises a misspelling into authority. The sole
 *  tolerated spelling difference is an optional trailing slash. */
export function readSameOriginConfig(env: Record<string, string | undefined>): SameOriginConfig {
  const raw = env.CLARA_PUBLIC_ORIGINS ?? "";
  const publicOrigins: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    try {
      const parsed = new URL(trimmed);
      const inputWithSlash = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
      if (`${parsed.origin}/` !== inputWithSlash) continue;
      publicOrigins.push(parsed.origin);
    } catch {
      // An unparseable entry contributes nothing. It never widens the wall.
    }
  }
  return {
    publicOrigins,
    allowInsecureLoopback:
      env.NODE_ENV === "development" || env.CLARA_ALLOW_INSECURE_LOOPBACK === "1",
  };
}

/** What the wall PROVED, not merely whether it passed. `origin` is the
 *  serialized origin of the `Origin` header this function positively matched
 *  against a host the browser addressed — never the request URL's own authority,
 *  which a proxy may have rewritten. */
export type SameOriginProof = { ok: true; origin: string } | { ok: false };

/**
 * The wall, returning its own evidence. Every uncertain case — missing `Origin`,
 * an unparseable one, a `Sec-Fetch-Site` that is anything other than
 * `same-origin` — is `{ok: false}`.
 *
 * `isSameOriginRequest` below is EXACTLY this function's `ok`, so the boolean
 * callers (`app/logout/route.ts`) and the origin caller (the invite courier)
 * can never drift onto two different judgements.
 */
export function proveSameOrigin(
  headers: Headers,
  requestUrl: string,
  config: SameOriginConfig = readSameOriginConfig(process.env),
): SameOriginProof {
  // Sec-Fetch-Site is sent by every browser that implements Fetch Metadata.
  // "same-origin" is the only acceptable value; "same-site", "cross-site" and
  // "none" are all refused — "same-site" is precisely the sibling-origin case
  // this finding is about. A missing header is not by itself a refusal (older
  // browsers, non-browser callers); the Origin check below is the wall that
  // has to hold on its own.
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return { ok: false };

  // `fetch()` always sends Origin on a non-GET/HEAD request, same-origin
  // included (Fetch standard). Absence therefore means "not a browser request
  // this app's own page made" and is refused: absence is never evidence.
  const origin = headers.get("origin");
  if (!origin) return { ok: false };

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return { ok: false };
  }

  // Scheme check (reviewer note 2): a plain-HTTP Origin is refused unless it
  // is loopback (local dev only serves HTTP) — an HTTPS deployment's own
  // origin is never `http:`, so accepting one there would let a downgraded
  // or spoofed-scheme Origin pass a HOST-only match. Deployment-robust: this
  // checks the ORIGIN's own scheme, never the request URL's authority (which
  // a proxy may rewrite independently).
  //
  // N5: AND ONLY UNDER AN EXPLICIT MODE OR OPT-IN. Unknown/absent modes refuse;
  // fail-open mode inference could mail both bearer factors to whatever is
  // listening on the recipient's own loopback interface.
  const isLoopback = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
  const loopbackAllowed = isLoopback && config.allowInsecureLoopback;
  if (originUrl.protocol !== "https:" && !(originUrl.protocol === "http:" && loopbackAllowed)) {
    return { ok: false };
  }

  const originHost = originUrl.host;

  // The host the browser ADDRESSED. A cross-origin attacker's page can pick
  // the target host (so this equals ours) but cannot forge the Origin header,
  // which is why comparing the two is the check that works — including behind
  // a proxy that rewrites the request URL's authority. Every candidate must
  // be positively present to count.
  // `x-forwarded-host` IS NOT IN THIS LIST (N3). It is written by whoever spoke
  // to us and cannot corroborate an Origin that the same party also chose. The
  // allowlist below is what lets a proxied deployment work, and it is a fact the
  // OPERATOR states, not one a request asserts.
  const candidates = new Set<string>();
  const hostHeader = headers.get("host");
  if (hostHeader) candidates.add(hostHeader);
  try {
    candidates.add(new URL(requestUrl).host);
  } catch {
    // A request URL we cannot parse contributes no candidate — it does not
    // make the check pass.
  }

  // THE CONFIGURED ALLOWLIST IS ITS OWN, SUFFICIENT PROOF OF AUTHORITY, and it is
  // what makes this wall correct behind a proxy that rewrites the request URL:
  // the operator has named the origins this deployment answers on, so an `Origin`
  // that is one of them is addressing us however the hop was rewritten. It is a
  // WIDENING of the host match, never a replacement — an origin that matches the
  // host the browser addressed still passes with no allowlist configured at all.
  const allowlisted = config.publicOrigins.includes(originUrl.origin);
  if (!allowlisted && !candidates.has(originHost)) return { ok: false };

  // THE PROVEN ORIGIN, and it is the ORIGIN HEADER'S — not the request URL's.
  // `URL.origin` serializes scheme + host (+ non-default port), so what a
  // consumer receives has already passed the scheme ruling above and the host
  // match here. Nothing downstream needs to re-derive it, and nothing downstream
  // may substitute `request.url`'s authority for it.
  return { ok: true, origin: originUrl.origin };
}

/**
 * True only when the request POSITIVELY proves it came from this app's own
 * origin — `proveSameOrigin`'s `ok`, and nothing else. Kept as the name the
 * boolean callers already read (`app/logout/route.ts`), because a wall with two
 * implementations is a wall with two behaviours.
 */
export function isSameOriginRequest(
  headers: Headers,
  requestUrl: string,
  config: SameOriginConfig = readSameOriginConfig(process.env),
): boolean {
  return proveSameOrigin(headers, requestUrl, config).ok;
}
