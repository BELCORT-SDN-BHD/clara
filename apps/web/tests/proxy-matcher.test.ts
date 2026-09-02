import assert from "node:assert/strict";
import { describe, it } from "node:test";

// MUST come before anything that loads a Next server module.
import "./next-runtime-globals";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config } from "../proxy";
import {
  confirmCacheHeadersForPath,
  isPublicPath,
  referrerPolicyForPath,
} from "../lib/supabase/proxy";

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
    "/forgot-password",
    "/auth/recover?code=example",
    "/auth/recover/password",
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
      "/forgot-password",
      "/auth/recover",
      "/auth/recover/password",
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
    // `/money-input-harness` is listed here because an ORDINARY build is the
    // production shape this cell exists to defend, and the build flag is unset
    // in every ordinary run of this suite. It is deliberately NOT hardcoded:
    // under `CLARA_E2E_MONEY_INPUT_HARNESS=1` the harness prefix is compiled
    // in on purpose, and a cell that reddened there would be asserting the
    // wrong thing about the opted-in build rather than catching a defect. The
    // dedicated P6-4 describe below measures BOTH states from real imports.
    const harnessBuild = process.env.CLARA_E2E_MONEY_INPUT_HARNESS === "1";
    for (const pathname of [
      "/",
      "/needs-you",
      "/clients",
      "/clients/rome-properties/bank",
      "/admin",
      "/admin/members",
      "/logout",
      "/api/runtime/threads",
      ...(harnessBuild ? [] : ["/money-input-harness"]),
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
      "/forgot-passwords",
      "/auth/recovery",
      "/pendingx",
    ]) {
      assert.equal(isPublicPath(pathname), false, `${pathname} must NOT be public`);
    }
    // …while a genuine child segment IS public.
    assert.equal(isPublicPath("/signup/step-2"), true);
    assert.equal(isPublicPath("/auth/confirm/verify"), true);
    assert.equal(isPublicPath("/auth/recover/password"), true);
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

describe("P6-4 harness: the test-only public wall is present only in opted-in builds", () => {
  async function importGateState(enabled: boolean, nonce: string) {
    const original = process.env.CLARA_E2E_MONEY_INPUT_HARNESS;
    if (enabled) process.env.CLARA_E2E_MONEY_INPUT_HARNESS = "1";
    else delete process.env.CLARA_E2E_MONEY_INPUT_HARNESS;
    try {
      const proxyModule = await import(`../lib/supabase/proxy.ts?harness-gate=${nonce}`) as {
        PUBLIC_PATH_PREFIXES?: readonly string[];
        isPublicPath: (pathname: string) => boolean;
      };
      const scopeModule = await import(`../lib/require-firm-scope.ts?harness-gate=${nonce}`) as {
        SCOPE_UNSCOPED_SURFACES: ReadonlyArray<{
          readonly url?: string;
          readonly public?: true;
        }>;
      };
      return { proxyModule, scopeModule };
    } finally {
      if (original === undefined) delete process.env.CLARA_E2E_MONEY_INPUT_HARNESS;
      else process.env.CLARA_E2E_MONEY_INPUT_HARNESS = original;
    }
  }

  it("imports both wall registries under flag-unset and flag-set states, cross-checked both ways", async () => {
    const off = await importGateState(false, `off-${Date.now()}`);
    const on = await importGateState(true, `on-${Date.now()}`);

    assert.ok(Array.isArray(off.proxyModule.PUBLIC_PATH_PREFIXES), "the proxy must export the actual prefix constant this test measures");
    assert.ok(Array.isArray(on.proxyModule.PUBLIC_PATH_PREFIXES), "the opted-in import must expose the same measured constant");

    const offPrefixes = [...off.proxyModule.PUBLIC_PATH_PREFIXES!].sort();
    const onPrefixes = [...on.proxyModule.PUBLIC_PATH_PREFIXES!].sort();
    const offRegistry = off.scopeModule.SCOPE_UNSCOPED_SURFACES
      .filter((surface) => surface.public)
      .map((surface) => surface.url)
      .sort();
    const onRegistry = on.scopeModule.SCOPE_UNSCOPED_SURFACES
      .filter((surface) => surface.public)
      .map((surface) => surface.url)
      .sort();

    assert.equal(offPrefixes.includes("/money-input-harness"), false);
    assert.equal(offRegistry.includes("/money-input-harness"), false);
    assert.equal(off.proxyModule.isPublicPath("/money-input-harness"), false);
    assert.deepEqual(offPrefixes, offRegistry, "flag-unset proxy and scope registries must match both ways");

    assert.equal(onPrefixes.includes("/money-input-harness"), true);
    assert.equal(onRegistry.includes("/money-input-harness"), true);
    assert.equal(on.proxyModule.isPublicPath("/money-input-harness"), true);
    assert.deepEqual(onPrefixes, onRegistry, "flag-set proxy and scope registries must match both ways");
  });
});

describe("NEW-A: token-bearing entry routes send only the referrer data their POST needs", () => {
  it("uses strict-origin on /auth/confirm so its real browser POST carries a non-null Origin", () => {
    assert.equal(referrerPolicyForPath("/auth/confirm"), "strict-origin");
    assert.equal(referrerPolicyForPath("/auth/confirm/verify"), "strict-origin");
  });

  it("keeps invite bearer URLs at no-referrer and leaves ordinary pages unchanged", () => {
    assert.equal(referrerPolicyForPath("/invite/token-hash"), "no-referrer");
    assert.equal(referrerPolicyForPath("/signup"), null);
  });

  it("uses strict-origin throughout recovery so the one-time code never enters a referrer", () => {
    assert.equal(referrerPolicyForPath("/auth/recover"), "strict-origin");
    assert.equal(referrerPolicyForPath("/auth/recover/password"), "strict-origin");
  });
});

describe("FOLD 2 (N1 fix, 裁-109): /auth/confirm asserts private, no-store + Vary: Cookie", () => {
  it("pins the exact cache headers on /auth/confirm and its subpaths", () => {
    assert.deepEqual(confirmCacheHeadersForPath("/auth/confirm"), {
      cacheControl: "private, no-store",
      vary: "Cookie",
    });
    assert.deepEqual(confirmCacheHeadersForPath("/auth/confirm/verify"), {
      cacheControl: "private, no-store",
      vary: "Cookie",
    });
  });

  it("asserts nothing on unrelated paths — a future change that widens this must widen the pin too", () => {
    assert.equal(confirmCacheHeadersForPath("/signup"), null);
    assert.equal(confirmCacheHeadersForPath("/invite/token-hash"), null);
    assert.equal(confirmCacheHeadersForPath("/pending"), null);
  });
});
