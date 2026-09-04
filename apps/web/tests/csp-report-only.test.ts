// C-07 / 裁-175 ROW B — the Content-Security-Policy header, pinned.
//
// Two things are worth a test here and they are different things: the POLICY
// (what the value says) and the DELIVERY (that `proxy()` actually writes it onto
// the response it returns, on both of its branches). A policy constant nobody
// sets is the classic "the gate exists but nothing calls it" shape, so the
// delivery half drives the REAL exported `proxy` function against a real
// `NextRequest`, not a re-declaration of what it is supposed to do.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// MUST come before anything that loads a Next server module.
import "./next-runtime-globals";

import { NextRequest, NextResponse } from "next/server";

import {
  CSP_HEADER_NAME,
  contentSecurityPolicyReportOnly,
  supabaseOrigin,
} from "../lib/security/csp";

function directives(value: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(" ");
    if (space === -1) out.set(trimmed, "");
    else out.set(trimmed.slice(0, space), trimmed.slice(space + 1).trim());
  }
  return out;
}

describe("the policy is REPORT-ONLY, and says so in its own header name", () => {
  it("names the report-only header, never the enforcing one", () => {
    // THE most consequential single edit in lib/security/csp.ts: dropping
    // `-Report-Only` turns an unmeasured candidate policy into an enforcing one
    // over the whole app. This cell is what goes red when someone does.
    assert.equal(CSP_HEADER_NAME, "Content-Security-Policy-Report-Only");
    assert.notEqual(
      CSP_HEADER_NAME,
      "Content-Security-Policy",
      "enforcing this policy is a SEPARATE row and a separate PR — the measurement has to come first",
    );
  });
});

describe("the directives that answer C-07 are present and closed", () => {
  const value = contentSecurityPolicyReportOnly("https://project.supabase.co");
  const d = directives(value);

  it("object-src is 'none' — an <object>/<embed> is the other way hostile bytes execute in this origin", () => {
    assert.equal(d.get("object-src"), "'none'");
  });

  it("frame-ancestors is 'none' — the modern X-Frame-Options, and the app is never framed", () => {
    assert.equal(d.get("frame-ancestors"), "'none'");
  });

  it("default-src is 'self' — every unnamed destination falls to the same origin", () => {
    assert.equal(d.get("default-src"), "'self'");
  });

  it("base-uri and form-action are 'self' — a <base> or form injection cannot re-point this page", () => {
    assert.equal(d.get("base-uri"), "'self'");
    assert.equal(d.get("form-action"), "'self'");
  });
});

describe("THE MEASUREMENT: the candidate ships strict, so the browser's reports mean something", () => {
  const d = directives(contentSecurityPolicyReportOnly("https://project.supabase.co"));

  it("script-src carries no 'unsafe-inline' and no nonce — a report-only pass that already contains the escape hatch measures nothing", () => {
    assert.equal(d.get("script-src"), "'self'");
    assert.doesNotMatch(d.get("script-src") ?? "", /unsafe-inline|nonce-/);
  });

  it("style-src is strict for the same reason", () => {
    assert.equal(d.get("style-src"), "'self'");
  });

  it("…and 'unsafe-eval' appears nowhere in the whole policy", () => {
    assert.doesNotMatch(contentSecurityPolicyReportOnly(undefined), /unsafe-eval/);
  });
});

describe("the sources the app genuinely needs are admitted, or the report is all noise", () => {
  it("img-src admits blob: — the page-overlay viewer renders a raster page from an object URL", () => {
    const d = directives(contentSecurityPolicyReportOnly(undefined));
    assert.equal(d.get("img-src"), "'self' data: blob:");
  });

  it("worker-src admits 'self' and blob: — pdfjs-dist's worker ships from public/, never a CDN", () => {
    const d = directives(contentSecurityPolicyReportOnly(undefined));
    assert.equal(d.get("worker-src"), "'self' blob:");
  });

  it("connect-src carries the Supabase ORIGIN — the browser client calls that host directly for auth and every read", () => {
    const d = directives(contentSecurityPolicyReportOnly("https://project.supabase.co/rest/v1?apikey=x"));
    assert.equal(d.get("connect-src"), "'self' https://project.supabase.co");
  });

  it("…and NEVER the path or query of that URL — a CSP source is an origin", () => {
    const value = contentSecurityPolicyReportOnly("https://project.supabase.co/rest/v1?apikey=secret-shaped");
    assert.doesNotMatch(value, /rest\/v1/);
    assert.doesNotMatch(value, /apikey/);
    assert.doesNotMatch(value, /secret-shaped/);
  });

  it("falls back to 'self' alone when the env value is absent or unparseable — never a literal 'undefined' in a header", () => {
    assert.equal(directives(contentSecurityPolicyReportOnly(undefined)).get("connect-src"), "'self'");
    assert.equal(directives(contentSecurityPolicyReportOnly("")).get("connect-src"), "'self'");
    assert.equal(directives(contentSecurityPolicyReportOnly("not a url")).get("connect-src"), "'self'");
    assert.doesNotMatch(contentSecurityPolicyReportOnly(undefined), /undefined|null/);
  });

  it("supabaseOrigin answers BOTH ways — the vacuity control on the fallback above", () => {
    assert.equal(supabaseOrigin("https://project.supabase.co"), "https://project.supabase.co");
    assert.equal(supabaseOrigin("nonsense"), null);
  });
});

describe("DELIVERY: proxy() actually writes the header onto the response it returns", () => {
  // The policy above is a string. This is the half that proves something SETS
  // it — measured by calling the REAL exported `proxy` with a real
  // `NextRequest` and reading the response it returns. Nothing about
  // `updateSession` is stubbed: with no cookie there is no token to verify, so
  // the gate reaches its decision without a network call. If `proxy()` ever
  // returns `updateSession(request)` directly again, both cells go red.
  const SUPABASE_URL = "https://project.supabase.co";

  /** `createServerClient` constructs a `RealtimeClient` eagerly, which asks for
   *  a WebSocket constructor — absent on Node 20 (native `WebSocket` landed in
   *  22), so the client throws before `updateSession` can build any response.
   *  This is a HARNESS shim in exactly the spirit of `next-runtime-globals.ts`
   *  above: nothing under test ever opens a realtime channel, so an inert
   *  constructor changes no decision. Installed locally rather than in the
   *  shared shim so this file owns its own environment. */
  function withWebSocketShim<T>(run: () => Promise<T>): Promise<T> {
    const target = globalThis as unknown as { WebSocket?: unknown };
    if (target.WebSocket !== undefined) return run();
    target.WebSocket = class {};
    return run().finally(() => { delete target.WebSocket; });
  }

  async function runProxy(pathname: string): Promise<Response> {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    try {
      const { proxy } = await import("../proxy");
      // No cookie at all, so `supabase.auth.getClaims()` has no token to verify
      // and never reaches the network — the gate falls to its unauthenticated
      // branch on a protected path, and to pass-through on a public one. Both
      // branches are exercised below, which is the point: the header must not
      // depend on which one ran.
      return await withWebSocketShim(() => proxy(new NextRequest(new URL(pathname, "https://app.example"))));
    } finally {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    }
  }

  it("sets it on the PASS-THROUGH branch (a public path)", async () => {
    const response = await runProxy("/login");
    assert.equal(response.status, 200, "control: /login must not redirect — otherwise this cell is measuring the other branch");
    assert.equal(response.headers.get(CSP_HEADER_NAME), contentSecurityPolicyReportOnly(SUPABASE_URL));
  });

  it("sets it on the REDIRECT branch too (a protected path with no session)", async () => {
    const response = await runProxy("/clients");
    assert.equal(response.status, 307, "control: an unauthenticated /clients must redirect — otherwise this cell is measuring the other branch");
    assert.equal(
      response.headers.get(CSP_HEADER_NAME),
      contentSecurityPolicyReportOnly(SUPABASE_URL),
      "there must be no path through proxy() that forgets the header",
    );
  });

  it("VACUITY CONTROL: a bare NextResponse does NOT carry the header — proxy() is what puts it there", async () => {
    // Without this, both cells above would pass against a framework that set
    // the header itself, and would keep passing after `proxy()` stopped.
    assert.equal(NextResponse.next().headers.get(CSP_HEADER_NAME), null);
  });
});
