import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";
import { CSP_HEADER_NAME, contentSecurityPolicyReportOnly } from "@/lib/security/csp";

/**
 * Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
 * (`export function middleware` → `export function proxy`); `middleware.ts`
 * is now deprecated in favour of this file, with an official codemod
 * (`npx @next/codemod@canary middleware-to-proxy .`) — verified via context7
 * against the Next.js 16.2.9 docs, 2026-08-27. apps/web is on Next 16.3.3, so
 * this repo uses the current convention rather than the deprecated one.
 *
 * This is the ONLY auth gate in the app: it runs before every matched
 * request, refreshes the Supabase session cookie, and redirects an
 * unauthenticated request to `/login` (see lib/supabase/proxy.ts for the
 * public-path allowlist and the session-refresh mechanics). Page and layout
 * code never re-implements this check — one authority, one place.
 *
 * C-07 / 裁-175, ROW B: it is also the ONE place a security header reaches every
 * document this app serves. The Content-Security-Policy is set HERE rather than
 * in `next.config.ts`'s `headers()` because `lib/supabase/proxy.ts`'s own
 * `Vary` comment records the measurement that Next 16.3.3 overwrites some
 * headers this app sets through `headers()` for dynamic routes, proven by e2e
 * AND by a bare curl — so the framework hook is the weaker of the two writers on
 * this stack. The matcher below exempts only `_next/static`, `_next/image`,
 * `favicon.ico` and `brand/`, none of which is an HTML document, so every page
 * that can execute script is covered. The header is REPORT-ONLY: it breaks
 * nothing and exists to measure what an enforcing policy would cost
 * (`lib/security/csp.ts` carries the full reasoning and the open question).
 */
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  // Applied to BOTH branches `updateSession` can return — the pass-through and
  // the redirect to /login. A redirect body is not a document, but setting it
  // unconditionally means there is no path through this function that forgets.
  response.headers.set(
    CSP_HEADER_NAME,
    contentSecurityPolicyReportOnly(process.env.NEXT_PUBLIC_SUPABASE_URL),
  );
  return response;
}

export const config = {
  matcher: [
    /*
     * Match every request path except these NAMESPACES, anchored at the start
     * of the path:
     * - _next/static  (framework build output)
     * - _next/image   (image optimizer)
     * - favicon.ico   (exact file)
     * - icon.png      (exact file — App Router `app/icon.png`, H-31)
     * - apple-icon.png (exact file — App Router `app/apple-icon.png`, H-31)
     * - brand/        (public/brand/** — the app's only static asset
     *                 namespace; fonts + their OFL licences)
     *
     * H-31, MEASURED, NOT ASSUMED. The two App Router icon routes were added
     * here because the browser leg caught them behind this gate: the emitted
     * `<link rel="icon" href="/icon.png?icon.<hash>.png">` fetched from an
     * UNAUTHENTICATED document (the login page, which is where a first-time
     * visitor forms an impression) matched the pattern below, ran `proxy()`,
     * and was redirected to /login — a 200 of `text/html` where the browser
     * wanted an image, so the tab showed no icon at all. `favicon.ico` was
     * already exempt, which is exactly why only the .ico half appeared to work.
     * These are brand assets with no session in them; the exemption is the
     * whole point of shipping them.
     *
     * NOT an extension list (cross-model security review 2026-08-27, finding
     * 3, MEDIUM). The previous pattern excluded `.*\.(svg|png|jpg|jpeg|gif|
     * webp)$` — an extension ANYWHERE in the path — while Next.js dynamic
     * segments happily accept dots. `/clients/anything.png` therefore
     * resolved to the protected `[clientId]` route with `proxy()` skipped
     * entirely, and this proxy is the app's ONLY auth gate (no layout
     * re-checks it). Exempt namespaces, never suffixes.
     *
     * Adding a new always-public static path means adding its NAMESPACE here
     * and extending tests/proxy-matcher.test.ts, which asserts both arms.
     */
    // THE THREE EXACT FILES ARE END-ANCHORED; the two NAMESPACES are not.
    // Without the `$` the lookahead exempts any path merely BEGINNING with the
    // name — `/icon.png.evil`, `/icon.png/anything`, `/favicon.ico/x` — which is
    // the shape of finding 3 all over again, one alternation later. It was not
    // exploitable on this tree (no root-level dynamic or catch-all segment, and
    // next.config.ts declares no rewrites), so it is a LATENT hole rather than an
    // open one; it is closed here because the comment above calls these "exact
    // file" and a matcher should mean what its comment says. `favicon.ico` gains
    // the anchor too — it never had one.
    "/((?!(?:favicon\\.ico|icon\\.png|apple-icon\\.png)$|_next/static|_next/image|brand/).*)",
  ],
};
