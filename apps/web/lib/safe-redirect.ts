/**
 * lib/safe-redirect.ts — the open-redirect wall for every caller-supplied
 * destination (today: `/login?next=…`, read by components/login-form.tsx).
 *
 * WHY NOT LEXICAL CHECKS. The first version of this wall was a set of
 * `startsWith` tests: accept a value that starts with "/", reject "//" and
 * "/\". A cross-model security review (2026-08-27, finding 4, MEDIUM) broke
 * it with ASCII control characters:
 *
 *     ?next=/%09/evil.example      → "/\t/evil.example"
 *     ?next=/%0A/evil.example      → "/\n/evil.example"
 *     ?next=/%0D/evil.example      → "/\r/evil.example"
 *     ?next=/%09%5Cevil.example    → "/\t\\evil.example"
 *
 * Every one of those starts with a single "/" and passes the lexical tests —
 * but WHATWG URL parsing (which is what `router.push()` and the browser
 * ultimately do) STRIPS ASCII tab, CR and LF before interpreting the URL, and
 * treats "\" as "/" in special schemes. The stripped result is
 * `//evil.example`: protocol-relative, i.e. an EXTERNAL navigation.
 *
 * The fix is to stop enumerating separators and instead parse the value the
 * same way the browser will, then demand exact origin equality:
 *
 *   1. `new URL(rawNext, origin)` — the same normalization the browser
 *      applies (control-character stripping, backslash folding, dot-segment
 *      resolution, percent-decoding of the path).
 *   2. Require `parsed.origin === origin` EXACTLY. A non-special scheme
 *      (`javascript:`, `data:`) yields the opaque origin "null" and is
 *      rejected by the same comparison.
 *   3. Navigate only to the canonical `pathname + search + hash` of the
 *      parsed URL — never to the raw input.
 *   4. Reject a pathname that itself begins with "//": an absolute
 *      same-origin input like `https://app.example//evil.example` passes the
 *      origin check but leaves a protocol-relative PATH, and handing that to
 *      `router.push()` would navigate off-origin all the same.
 *
 * Anything malformed, cross-origin or missing falls back to "/". The wall is
 * fail-closed: it returns a destination it PROVED is same-origin, never the
 * caller's string.
 */

export const DEFAULT_REDIRECT = "/";

export function resolveSameOriginPath(
  rawNext: string | null | undefined,
  origin: string,
): string {
  if (!rawNext) return DEFAULT_REDIRECT;

  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    // A caller with no usable origin cannot prove same-origin — fail closed.
    return DEFAULT_REDIRECT;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawNext, base);
  } catch {
    return DEFAULT_REDIRECT;
  }

  // Exact origin equality — scheme, host AND port. `URL.origin` is "null" for
  // opaque-origin schemes (javascript:, data:, blob: of those), so those are
  // rejected here too rather than by a scheme allowlist.
  if (parsed.origin !== base.origin) return DEFAULT_REDIRECT;

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;

  // A single leading slash, and never a protocol-relative "//host" path.
  if (!path.startsWith("/") || path.startsWith("//")) return DEFAULT_REDIRECT;

  return path;
}
