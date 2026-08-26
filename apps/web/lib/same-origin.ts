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
 */

/**
 * True only when the request POSITIVELY proves it came from this app's own
 * origin. Every uncertain case — missing `Origin`, an unparseable one, a
 * `Sec-Fetch-Site` that is anything other than `same-origin` — is false.
 */
export function isSameOriginRequest(
  headers: Headers,
  requestUrl: string,
): boolean {
  // Sec-Fetch-Site is sent by every browser that implements Fetch Metadata.
  // "same-origin" is the only acceptable value; "same-site", "cross-site" and
  // "none" are all refused — "same-site" is precisely the sibling-origin case
  // this finding is about. A missing header is not by itself a refusal (older
  // browsers, non-browser callers); the Origin check below is the wall that
  // has to hold on its own.
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;

  // `fetch()` always sends Origin on a non-GET/HEAD request, same-origin
  // included (Fetch standard). Absence therefore means "not a browser request
  // this app's own page made" and is refused: absence is never evidence.
  const origin = headers.get("origin");
  if (!origin) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  // Scheme check (reviewer note 2): a plain-HTTP Origin is refused unless it
  // is loopback (local dev only serves HTTP) — an HTTPS deployment's own
  // origin is never `http:`, so accepting one there would let a downgraded
  // or spoofed-scheme Origin pass a HOST-only match. Deployment-robust: this
  // checks the ORIGIN's own scheme, never the request URL's authority (which
  // a proxy may rewrite independently).
  const isLoopback = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
  if (originUrl.protocol !== "https:" && !(originUrl.protocol === "http:" && isLoopback)) {
    return false;
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

  return candidates.has(originHost);
}
