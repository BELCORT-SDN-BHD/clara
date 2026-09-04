// C-07 / 裁-175, ROW B — the Content-Security-Policy, shipped REPORT-ONLY.
//
// apps/web had no CSP of any kind: `next.config.ts` declares no `headers()`,
// `wrangler.jsonc` declares no headers, and the only header writers in the app
// are the runtime proxy's response allow-list and `lib/supabase/proxy.ts`'s
// Referrer-Policy / Cache-Control. So the blob-origin hole C-07 names (an
// uploaded XML executing script in apps/web's own origin) had no defence-in-depth
// behind the missing MIME gate.
//
// THIS IS NOT A SECOND WALL, and calling it one would be the overclaim the
// header below exists to avoid. `VIEWABLE_IN_NEW_TAB` (lib/documents/bytes.ts)
// is the wall, and it is the only thing enforcing anything today. A REPORT-ONLY
// policy stops nothing by definition: it is a MEASUREMENT of what an enforcing
// policy would cost, and the enforcing header is its own costed row.
//
// WHY REPORT-ONLY, AND WHAT IT IS MEASURING. `Content-Security-Policy-Report-
// Only` is evaluated and reported by the browser but never ENFORCED — nothing
// on any page can break. The value below is deliberately the STRICT CANDIDATE
// (`script-src 'self'`, `style-src 'self'` — no `'unsafe-inline'`, no nonce),
// because a report-only pass that already contains the escape hatch measures
// nothing. The browser's own violation reports are therefore the instrument
// that answers the open question the ruling left: does Next 16 on OpenNext /
// Workers need `'unsafe-inline'` or a nonce for its bootstrap? The e2e leg
// (`e2e/documents-viewer-walk.spec.ts`) collects those reports off the BUILT app and
// the PR body records the measurement. Turning this into an ENFORCING header is
// its own row and its own PR — do not flip the header name here without the
// measurement in hand.
//
// `connect-src` carries the Supabase ORIGIN, never the URL and never a key: the
// browser client (lib/supabase/client.ts) talks to that host directly for auth
// and for every RLS-scoped PostgREST read, so a policy of `'self'` alone would
// report a violation on literally every page load and drown the signal that
// this pass exists to collect. The origin is derived from
// `NEXT_PUBLIC_SUPABASE_URL` — already a public, build-time value.

/** The Supabase ORIGIN (scheme + host + port), or `null` when the env value is
 *  absent or unparseable. Never the path, never a query — a CSP source
 *  expression is an origin, and putting anything else there both fails to match
 *  and risks writing a secret-shaped string into a response header. */
export function supabaseOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

/**
 * The report-only policy, as a header value.
 *
 * Directive by directive, and why each is what it is:
 *
 *   default-src 'self'        the floor every unnamed fetch destination falls to.
 *   script-src 'self'         THE MEASUREMENT (see the header above). No
 *                             'unsafe-inline', no nonce, on purpose.
 *   style-src 'self'          same measurement, for Next's inlined critical CSS.
 *   img-src 'self' data: blob:
 *                             `blob:` is REQUIRED by the page-overlay evidence
 *                             viewer: a raster page renders from an object URL
 *                             minted by fetchDocumentBytes. `data:` covers
 *                             inlined icons.
 *   font-src 'self'           public/brand/fonts/** — the app's only font source.
 *   connect-src 'self' <supabase origin>
 *                             the same-origin runtime proxy plus the direct
 *                             Supabase auth/PostgREST calls.
 *   worker-src 'self' blob:   pdfjs-dist's page worker ships from public/ (same
 *                             origin, never a CDN); `blob:` is its own documented
 *                             fallback when a worker script is re-wrapped.
 *   object-src 'none'         no <object>/<embed> plugin surface, ever. This is
 *                             the directive that most directly answers C-07's
 *                             family: an embedded plugin document is the other
 *                             way hostile bytes execute in this origin.
 *   frame-ancestors 'none'    no one may frame this app — clickjacking, and the
 *                             modern replacement for X-Frame-Options.
 *   frame-src 'none'          the app embeds nothing; a future embed must widen
 *                             this deliberately.
 *   base-uri 'self'           a <base> injection cannot re-point relative URLs.
 *   form-action 'self'        a form cannot be made to POST a session elsewhere.
 *
 * NOT SET, deliberately: `report-uri`/`report-to`. There is no report collector
 * in this estate, and pointing one at a third party would egress page URLs. The
 * violation reports are read from the BROWSER (the e2e's
 * `securitypolicyviolation` listener), which is where this pass needs them.
 */
export function contentSecurityPolicyReportOnly(supabaseUrl: string | undefined): string {
  const supabase = supabaseOrigin(supabaseUrl);
  const connect = supabase ? `'self' ${supabase}` : "'self'";
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** The header NAME this policy is served under. Exported so a test can pin the
 *  report-only half explicitly: the single most consequential possible edit in
 *  this file is dropping `-Report-Only`, which would turn an unmeasured
 *  candidate policy into an enforcing one and could white-screen the app. */
export const CSP_HEADER_NAME = "Content-Security-Policy-Report-Only";
