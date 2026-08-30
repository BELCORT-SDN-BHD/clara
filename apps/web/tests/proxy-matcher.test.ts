import assert from "node:assert/strict";
import { describe, it } from "node:test";

// MUST come before anything that loads a Next server module.
import "./next-runtime-globals";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config } from "../proxy";
import { isPublicPath } from "../lib/supabase/proxy";

/**
 * Finding 3 (MEDIUM) — the static-extension matcher bypass.
 *
 * `proxy()` is the app's ONLY auth gate: no layout re-checks it. A path the
 * matcher excludes therefore reaches the page with NO authentication check at
 * all. The old pattern excluded `.*\.(svg|png|jpg|jpeg|gif|webp)$` — an
 * extension anywhere in the path — and Next.js dynamic segments accept dots,
 * so `/clients/anything.png` resolved to the protected `[clientId]` route
 * with the gate skipped.
 *
 * Instrument note (review law 3 — spelling is not identity): the Next.js
 * canary docs name this helper `unstable_doesProxyMatch`, but the export that
 * actually exists in the PINNED next@16.3.3 is `unstable_doesMiddlewareMatch`
 * (node_modules/next/dist/experimental/testing/server/middleware-testing-utils.d.ts).
 * The `matches()` helper below asserts the import is a function before using
 * it, so a rename in a future Next cannot turn this file into a vacuous pass.
 */

assert.equal(
  typeof unstable_doesMiddlewareMatch,
  "function",
  "the matcher instrument must be a real function, not an undefined import",
);

function matches(pathname: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url: pathname });
}

describe("the proxy gate runs on every protected route", () => {
  const gated = [
    "/",
    "/needs-you",
    "/clients",
    "/clients/rome-properties",
    "/clients/rome-properties/bank",
    // The reviewer's bypass: a dotted client id resolving to [clientId].
    "/clients/anything.png",
    "/clients/a.png",
    "/clients/x.svg/bank",
    "/clients/logo.webp",
    "/activity",
    "/admin",
    // Public PAGES are still matched — the proxy runs and allows them
    // (lib/supabase/proxy.ts's PUBLIC_PATH_PREFIXES), which is what refreshes
    // the session cookie on the login page.
    "/login",
    "/invite/some-token-hash",
    "/signup",
    "/auth/confirm?token_hash=example",
    "/auth/confirm/verify",
    // NOT public — it needs a session — but still MATCHED, so the proxy runs
    // and redirects an unauthenticated caller to /login.
    "/pending",
    "/logout",
  ];

  for (const pathname of gated) {
    it(`matches ${pathname}`, () => {
      assert.equal(matches(pathname), true);
    });
  }
});

describe("only real framework/static namespaces are exempt", () => {
  const exempt = [
    "/_next/static/chunks/main.js",
    "/_next/static/media/font.woff2",
    "/_next/image",
    "/_next/image?url=%2Flogo.png&w=64&q=75",
    "/favicon.ico",
    "/brand/fonts/SourceSans3-Regular.ttf",
    "/brand/fonts/Source-Sans-3-LICENSE.md",
  ];

  for (const pathname of exempt) {
    it(`does not match ${pathname}`, () => {
      assert.equal(matches(pathname), false);
    });
  }

  it("does not exempt a namespace name that merely appears mid-path", () => {
    // The exclusions are anchored at the start of the path — a route that
    // happens to contain "brand/" deeper in is still gated.
    assert.equal(matches("/clients/acme/brand/assets.png"), true);
    assert.equal(matches("/clients/_next/static"), true);
  });
});

/**
 * P4-3 — THE PUBLIC ALLOWLIST, BOTH WAYS.
 *
 * The matcher above decides whether `proxy()` RUNS. This block decides what it
 * does once it has: `isPublicPath` is the predicate that lets a request through
 * with no session at all, so a path wrongly in it is an unauthenticated read of
 * a protected surface, and a path wrongly out of it is a redirect loop for a
 * page that must render before a session exists.
 *
 * IT DRIVES THE REAL FUNCTION, exported from `lib/supabase/proxy.ts` for exactly
 * this. A test that re-declared the prefix list would be asserting its own
 * spelling rather than the gate's behaviour (review law 3), and would keep
 * passing after the real list changed underneath it.
 *
 * `tests/firm-scope-surfaces.test.ts` closes the other half of the loop: it
 * matches the declared prefixes against `SCOPE_UNSCOPED_SURFACES`'s `public`
 * entries both ways, so a page cannot be public here and unregistered there.
 */
describe("P4-3 — signup confirmation is public, and the holding route deliberately is not", () => {
  it("all public entries resolve public, exactly and as ancestors", () => {
    for (const pathname of [
      "/login",
      "/invite",
      "/invite/some-token-hash",
      "/signup",
      "/auth/confirm",
      "/auth/confirm/verify",
    ]) {
      assert.equal(isPublicPath(pathname), true, `${pathname} must be public`);
    }
  });

  it("/pending is NOT public — its content is a report on the caller's own registration", () => {
    // If this ever flips, an unauthenticated stranger can load the holding page.
    // It is the one (entry) leaf that needs a session, and the single most
    // consequential line in this file.
    assert.equal(isPublicPath("/pending"), false);
  });

  it("nothing else the app serves is public", () => {
    for (const pathname of [
      "/",
      "/needs-you",
      "/clients",
      "/clients/rome-properties/bank",
      "/admin",
      "/admin/members",
      "/logout",
      "/api/runtime/threads",
    ]) {
      assert.equal(isPublicPath(pathname), false, `${pathname} must NOT be public`);
    }
  });

  it("a prefix matches only on a SEGMENT boundary — /signupsomething is not /signup", () => {
    // The `${prefix}/` guard, asserted rather than assumed. Without it a plain
    // `startsWith` would open every route whose name merely begins with an
    // allowlisted one, and `/loginsomething` would be an ungated surface.
    for (const pathname of [
      "/signupsomething",
      "/signup-old",
      "/loginx",
      "/invitees",
      "/auth/confirmation",
      "/pendingx",
    ]) {
      assert.equal(isPublicPath(pathname), false, `${pathname} must NOT be public`);
    }
    // …while a genuine child segment IS public.
    assert.equal(isPublicPath("/signup/step-2"), true);
    assert.equal(isPublicPath("/auth/confirm/verify"), true);
  });

  it("VACUITY CONTROL: the predicate is a real function that can answer BOTH ways", () => {
    // Otherwise every cell above passes against a stub that always returns
    // false, and the four public paths would be silently unreachable.
    assert.equal(typeof isPublicPath, "function");
    assert.notEqual(
      isPublicPath("/signup"),
      isPublicPath("/pending"),
      "the predicate answers identically for a public and a non-public path",
    );
  });
});
