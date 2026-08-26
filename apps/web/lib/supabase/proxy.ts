import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * updateSession() — the session-refresh + route-gate logic behind the root
 * `proxy.ts`. Split into its own file (current @supabase/ssr + Next.js
 * convention, verified via context7 2026-08-27) so the auth logic is
 * testable independent of the file Next.js requires at the app root.
 *
 * Gate: EVERY route is protected EXCEPT /login and /invite/:token (the
 * invite-accept flow, which must work before a session exists) and the
 * framework/static paths the exported `config.matcher` below already
 * excludes. There is no public marketing root in this app — "/" is the
 * firm-altitude home and is gated like everything else
 * (docs/plan/active/mohe-grill-rulings-2026-08-27.md Q3; §0.4 of the
 * handoff — Supabase Auth cookie sessions, invite-only).
 */

const PUBLIC_PATH_PREFIXES = ["/login", "/invite"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users
  // being randomly logged out (current @supabase/ssr Next.js guidance).
  //
  // getClaims(), never getSession(), for this gate: getClaims() verifies the
  // JWT signature on every call, while getSession() reads the session as
  // stored and is not guaranteed to revalidate it — trusting it here would
  // let a spoofed cookie masquerade as a live session.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // IMPORTANT: you *must* return the supabaseResponse object as-is (or a copy
  // that carries its cookies forward) — creating a fresh NextResponse without
  // copying supabaseResponse's cookies desyncs the browser and server session
  // state and can terminate the user's session prematurely.
  return supabaseResponse;
}
