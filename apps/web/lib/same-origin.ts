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
 * wall validated. Behind a proxy those two genuinely diverge: this wall
 * deliberately compares the Origin header against `x-forwarded-host` as well as
 * the request URL's authority (that is what makes it hold when the authority is
 * rewritten), so a request whose `request.url` reads
 * `http://internal.worker.local/api/invite` passes the wall on its forwarded
 * host and then hands the courier an INTERNAL, plain-HTTP authority to put in an
 * email nobody can un-send. So the proof now CARRIES the origin it proved —
 * scheme included, and therefore carrying this file's https/loopback ruling with
 * it — and the courier uses only that. One validated value, one consumer, no
 * second derivation.
 */

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
  const isLoopback = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
  if (originUrl.protocol !== "https:" && !(originUrl.protocol === "http:" && isLoopback)) {
    return { ok: false };
  }

  const originHost = originUrl.host;

  // The host the browser ADDRESSED. A cross-origin attacker's page can pick
  // the target host (so this equals ours) but cannot forge the Origin header,
  // which is why comparing the two is the check that works — including behind
  // a proxy that rewrites the request URL's authority. Every candidate must
  // be positively present to count.
  const candidates = new Set<string>();
  for (const header of ["host", "x-forwarded-host"]) {
    const value = headers.get(header);
    if (value) candidates.add(value);
  }
  try {
    candidates.add(new URL(requestUrl).host);
  } catch {
    // A request URL we cannot parse contributes no candidate — it does not
    // make the check pass.
  }

  if (!candidates.has(originHost)) return { ok: false };

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
export function isSameOriginRequest(headers: Headers, requestUrl: string): boolean {
  return proveSameOrigin(headers, requestUrl).ok;
}
