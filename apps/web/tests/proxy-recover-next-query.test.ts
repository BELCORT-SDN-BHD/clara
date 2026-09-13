// #698 — the auth wall used to drop the query string from `?next=`, so a
// signed-out saved-view link (`/work?view=needs-you`) landed on the bare
// destination after sign-in. `lib/supabase/proxy.ts`'s `updateSession`
// redirect used to build `next` from `request.nextUrl.pathname` ALONE:
//
//     url.search = "";
//     url.searchParams.set("next", request.nextUrl.pathname);
//
// dropping `?view=needs-you` (and any register `?tab=`) on the floor before
// the person even reaches the sign-in form. The fix is one line: `next`
// carries `pathname + search`, never the hash — which is moot in practice
// (a browser never sends the fragment to the server at all), but the point
// is asserted here rather than assumed, by constructing a request whose
// `NextURL` DOES carry one.
//
// THE DELIVERY IS WHAT THIS FILE MEASURES, exactly like
// `csp-report-only.test.ts`'s own "DELIVERY" describe block: the REAL
// exported `proxy()` is driven against a REAL `NextRequest`, with no
// session cookie, so `updateSession` reaches its unauthenticated branch
// without a network call — `supabase.auth.getClaims()` has no token to
// verify. A test that re-typed `updateSession`'s redirect logic would be
// asserting its own spelling (review law 3), not this gate's behaviour.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// MUST come before anything that loads a Next server module.
import "./next-runtime-globals";

import { NextRequest } from "next/server";

const SUPABASE_URL = "https://project.supabase.co";

/** `createServerClient` constructs a `RealtimeClient` eagerly, which asks for
 *  a WebSocket constructor — see `csp-report-only.test.ts`'s identical shim
 *  for the full measurement. Nothing under test here ever opens a realtime
 *  channel, so an inert constructor changes no decision. */
function withWebSocketShim<T>(run: () => Promise<T>): Promise<T> {
  const target = globalThis as unknown as { WebSocket?: unknown };
  if (target.WebSocket !== undefined) return run();
  target.WebSocket = class {};
  return run().finally(() => {
    delete target.WebSocket;
  });
}

async function runProxy(pathnameAndSearch: string): Promise<Response> {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  try {
    const { proxy } = await import("../proxy");
    // No cookie at all, so `getClaims()` never reaches the network and the
    // gate falls straight to its unauthenticated redirect branch.
    return await withWebSocketShim(() =>
      proxy(new NextRequest(new URL(pathnameAndSearch, "https://app.example"))),
    );
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
}

function nextParam(response: Response): string | null {
  const location = response.headers.get("location");
  assert.ok(location, "the redirect must carry a Location header");
  return new URL(location!).searchParams.get("next");
}

describe("#698 — the unauthenticated redirect's `next` carries pathname + search", () => {
  it("preserves a saved-view query string", async () => {
    const response = await runProxy("/work?view=needs-you");
    assert.equal(response.status, 307, "control: an unauthenticated protected path must redirect");
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.pathname, "/login");
    assert.equal(nextParam(response), "/work?view=needs-you");
  });

  it("preserves a register tab query string the same way", async () => {
    const response = await runProxy("/clients/rome-properties?tab=documents");
    assert.equal(nextParam(response), "/clients/rome-properties?tab=documents");
  });

  it("keeps the no-query case exactly as before — pathname alone", async () => {
    const response = await runProxy("/clients");
    assert.equal(nextParam(response), "/clients");
  });

  it("never forwards a hash, even when the incoming NextURL carries one", async () => {
    // A real browser never sends the fragment to the server at all — this
    // is a defensive, not a reachable-in-production, assertion: it proves
    // the fix reads only `pathname + search`, so a future refactor that
    // started concatenating `request.nextUrl.href` (which DOES include a
    // hash when one is present on the URL object) would go red here first.
    const response = await runProxy("/work?view=needs-you#top");
    assert.equal(nextParam(response), "/work?view=needs-you");
  });

  it("round-trips through the open-redirect wall unchanged — a multi-segment path with several params", async () => {
    const response = await runProxy("/clients/rome-properties/bank?account=main&period=2026-09");
    assert.equal(nextParam(response), "/clients/rome-properties/bank?account=main&period=2026-09");
  });

  it("the blocked URL's own query string does NOT also ride into /login's query string unescaped", async () => {
    // The regression this cell exists to catch: `url` is CLONED from
    // `request.nextUrl` above the fix, so it still carries the blocked
    // destination's own `?view=needs-you` until `url.search = ""` clears it.
    // Dropping that reset (folding `next`'s new value in without it) makes
    // `searchParams.set("next", …)` APPEND onto the surviving query string
    // instead of replacing it — the exact leak the surrounding comment
    // describes refusing, and something `nextParam()` alone (which reads
    // only the `next` key) cannot see.
    const response = await runProxy("/work?view=needs-you");
    const location = new URL(response.headers.get("location")!);
    assert.deepEqual([...location.searchParams.keys()], ["next"], "the login redirect's query string must carry `next` and nothing else");
  });
});
