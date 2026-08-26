import assert from "node:assert/strict";
import { describe, it } from "node:test";

// MUST come before anything that loads a Next server module.
import "./next-runtime-globals";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config } from "../proxy";

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
