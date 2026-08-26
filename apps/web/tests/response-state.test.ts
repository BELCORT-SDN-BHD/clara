import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// MUST come before anything that loads a Next server module.
import "./next-runtime-globals";

import { NextResponse } from "next/server";

import { AUTH_COOKIE_OPTIONS } from "../lib/supabase/cookie-options";
import {
  applyAuthState,
  emptyAuthState,
} from "../lib/supabase/response-state";

/**
 * Findings 1 (HIGH — dropped anti-cache headers) and 12 (LOW — redirects lose
 * cookie mutations), exercised against a REAL `NextResponse` on both branches
 * the proxy can return.
 *
 * These are the exact headers pinned @supabase/ssr 0.12.5 documents itself as
 * passing to `setAll`'s second argument
 * (node_modules/@supabase/ssr/dist/main/types.d.ts, `SetAllCookies`).
 */
const SDK_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

function passthrough(): NextResponse {
  return NextResponse.next();
}

function redirect(): NextResponse {
  return NextResponse.redirect("https://app.clara.example/login?next=%2Fclients");
}

describe("finding 1 — the SDK's anti-cache headers reach the response", () => {
  for (const [label, make] of [
    ["pass-through", passthrough],
    ["redirect", redirect],
  ] as const) {
    it(`applies every supplied header to the ${label} response`, () => {
      const response = applyAuthState(make(), {
        cookies: [],
        headers: { ...SDK_HEADERS },
      });

      for (const [key, value] of Object.entries(SDK_HEADERS)) {
        assert.equal(response.headers.get(key), value, `${key} must be set`);
      }
    });
  }

  it("sets a private, no-store floor even when the SDK supplied nothing", () => {
    const response = applyAuthState(passthrough(), emptyAuthState());
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });

  it("lets the SDK's stricter Cache-Control win over the floor", () => {
    const response = applyAuthState(passthrough(), {
      cookies: [],
      headers: { "Cache-Control": SDK_HEADERS["Cache-Control"] },
    });
    assert.equal(
      response.headers.get("Cache-Control"),
      SDK_HEADERS["Cache-Control"],
    );
  });
});

describe("finding 12 — queued cookies survive the redirect branch", () => {
  it("writes the queued cookie onto a REDIRECT response", () => {
    const response = applyAuthState(redirect(), {
      cookies: [
        {
          name: AUTH_COOKIE_OPTIONS.name!,
          value: "",
          options: { ...AUTH_COOKIE_OPTIONS, maxAge: 0 },
        },
      ],
      headers: { ...SDK_HEADERS },
    });

    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie, "the redirect must carry Set-Cookie");
    assert.match(setCookie, /__Host-clara-auth=/);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /Max-Age=0/);
    assert.doesNotMatch(setCookie, /Domain=/);
    // Still a redirect, not a rewritten pass-through.
    assert.equal(response.status, 307);
  });

  it("keeps the cookie's own options rather than defaulting them", () => {
    const response = applyAuthState(passthrough(), {
      cookies: [
        {
          name: AUTH_COOKIE_OPTIONS.name!,
          value: "session-value",
          options: AUTH_COOKIE_OPTIONS,
        },
      ],
      headers: {},
    });

    const cookie = response.cookies.get(AUTH_COOKIE_OPTIONS.name!);
    assert.equal(cookie?.value, "session-value");
    assert.equal(cookie?.secure, true);
    assert.equal(cookie?.path, "/");
    assert.equal(cookie?.sameSite, "lax");
    assert.equal(cookie?.domain, undefined);
    // httpOnly must stay FALSE — the browser client reads this cookie.
    assert.equal(cookie?.httpOnly, false);
  });
});

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), "../lib");

describe("both setAll implementations take the headers argument", () => {
  const proxySource = readFileSync(resolve(LIB, "supabase/proxy.ts"), "utf8");
  const serverSource = readFileSync(resolve(LIB, "supabase/server.ts"), "utf8");

  for (const [label, source] of [
    ["proxy", proxySource],
    ["server", serverSource],
  ] as const) {
    it(`${label} declares setAll(cookiesToSet, headers)`, () => {
      assert.match(source, /setAll\(cookiesToSet, headers\)/);
      assert.match(source, /Object\.entries\(headers \?\? \{\}\)/);
    });

    it(`${label} passes the shared cookieOptions`, () => {
      assert.match(source, /cookieOptions: AUTH_COOKIE_OPTIONS/);
    });
  }

  it("the proxy applies the queued state ONCE, after the branch", () => {
    const applyAt = proxySource.indexOf("applyAuthState(response, queued)");
    const branchAt = proxySource.indexOf("NextResponse.redirect(url)");
    assert.ok(applyAt > -1, "the proxy must apply the queued state");
    assert.ok(branchAt > -1 && branchAt < applyAt);
    assert.equal(
      proxySource.split("applyAuthState(response, queued)").length - 1,
      1,
      "exactly one application point",
    );
  });
});
