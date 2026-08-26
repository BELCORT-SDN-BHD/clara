import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

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
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match every request path except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - common static image extensions
     * Adjust this pattern if a new always-public static path is added.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
