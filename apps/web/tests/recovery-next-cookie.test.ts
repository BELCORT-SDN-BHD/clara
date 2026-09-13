// #622 review round — the return-target cookie's own unit coverage,
// independent of the proxy.ts/handler.ts wiring that uses it (each pinned in
// their own test files). See `app/(entry)/auth/recover/next-cookie.ts`'s own
// header for the full journey and the SameSite=Lax / no-nonce reasoning.

import "./next-runtime-globals";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NextResponse } from "next/server";

import {
  RECOVERY_NEXT_MAX_AGE_SECONDS,
  clearRecoveryNextCookie,
  readRecoveryNextCookie,
  recoveryNextCookie,
  setRecoveryNextCookie,
} from "../app/(entry)/auth/recover/next-cookie";

const PROD_ENV = { NODE_ENV: "production" };
const DEV_ENV = { NODE_ENV: "development" };

function setCookieFor(name: string, response: NextResponse): string | undefined {
  return response.cookies.get(name)?.value;
}

describe("recoveryNextCookie — name/secure split mirrors confirm-flash.ts's own", () => {
  it("production: __Host- prefixed, secure", () => {
    assert.deepEqual(recoveryNextCookie(PROD_ENV), { name: "__Host-clara-recovery-next", secure: true });
  });

  it("development: unprefixed, insecure", () => {
    assert.deepEqual(recoveryNextCookie(DEV_ENV), { name: "clara-recovery-next", secure: false });
  });
});

describe("setRecoveryNextCookie — the write side", () => {
  it("sets an httpOnly, SameSite=Lax cookie carrying the RAW value in the structured jar", () => {
    // `response.cookies.get(...).value` reflects exactly what THIS call
    // passed in — `@edge-runtime/cookies` (the engine behind
    // `NextResponse.cookies`) does its OWN `encodeURIComponent` only when it
    // serializes the actual wire `Set-Cookie` header text, which the
    // "actually reaches the wire" describe block below asserts against
    // directly rather than through this structured accessor.
    const response = NextResponse.next();
    setRecoveryNextCookie(response, "/work?view=needs-you", PROD_ENV);
    const cookie = response.cookies.get("__Host-clara-recovery-next");
    assert.ok(cookie, "the cookie must be set");
    assert.equal(cookie!.value, "/work?view=needs-you");
    assert.equal(cookie!.httpOnly, true);
    // `edge-runtime`'s cookie serializer lower-cases the same-site token.
    assert.equal(String(cookie!.sameSite).toLowerCase(), "lax");
    assert.equal(cookie!.secure, true);
    assert.equal(cookie!.path, "/");
    assert.equal(cookie!.maxAge, RECOVERY_NEXT_MAX_AGE_SECONDS);
  });

  it("uses the dev cookie name and secure:false under the loopback carve-out", () => {
    const response = NextResponse.next();
    setRecoveryNextCookie(response, "/clients", DEV_ENV);
    const cookie = response.cookies.get("clara-recovery-next");
    assert.ok(cookie);
    assert.equal(cookie!.secure, false);
  });

  it("does nothing for an empty value — no Set-Cookie at all", () => {
    const response = NextResponse.next();
    setRecoveryNextCookie(response, "", PROD_ENV);
    assert.equal(setCookieFor("__Host-clara-recovery-next", response), undefined);
  });

  it("does nothing for a value past the length bound — refuses to grow the cookie into a storage channel", () => {
    const response = NextResponse.next();
    setRecoveryNextCookie(response, `/${"a".repeat(3000)}`, PROD_ENV);
    assert.equal(setCookieFor("__Host-clara-recovery-next", response), undefined);
  });

  it("the LATEST call wins — a second /forgot-password?next= visit overwrites the first", () => {
    const response = NextResponse.next();
    setRecoveryNextCookie(response, "/first", PROD_ENV);
    setRecoveryNextCookie(response, "/second", PROD_ENV);
    assert.equal(response.cookies.get("__Host-clara-recovery-next")?.value, "/second");
  });
});

describe("setRecoveryNextCookie — the value AS IT ACTUALLY REACHES THE WIRE", () => {
  it("is encoded EXACTLY ONCE in the real Set-Cookie header — MEASURED, not assumed", () => {
    // The regression this cell exists to catch: an earlier version of
    // `setRecoveryNextCookie` called `encodeURIComponent(rawNext)` itself,
    // ON TOP OF `@edge-runtime/cookies`'s own encoding when it serializes
    // the header — producing `%252Fwork…` (the `%` from the first encoding
    // encoded a second time), which `readRecoveryNextCookie`'s single
    // `decodeURIComponent` cannot reverse. `response.cookies.get(...).value`
    // (the cell above) would NOT have caught this: it reflects the
    // structured jar's pre-serialization value, not the header text a real
    // browser receives and replays.
    const response = NextResponse.next();
    setRecoveryNextCookie(response, "/work?view=needs-you", PROD_ENV);
    const setCookieHeader = response.headers.get("set-cookie") ?? "";
    assert.match(setCookieHeader, /^__Host-clara-recovery-next=%2Fwork%3Fview%3Dneeds-you;/, "exactly one layer of percent-encoding");
    assert.doesNotMatch(setCookieHeader, /%25/, "no double-encoded '%' anywhere in the header");
  });
});

describe("clearRecoveryNextCookie — the clear side", () => {
  it("overwrites with an immediately-expired cookie, same name/attributes", () => {
    const response = NextResponse.next();
    clearRecoveryNextCookie(response, PROD_ENV);
    const cookie = response.cookies.get("__Host-clara-recovery-next");
    assert.ok(cookie);
    assert.equal(cookie!.value, "");
    assert.equal(cookie!.maxAge, 0);
    assert.equal(cookie!.httpOnly, true);
  });
});

describe("readRecoveryNextCookie — the read side (a bare Request's Cookie header)", () => {
  it("reads and decodes the value", () => {
    const request = new Request("https://internal.example/auth/recover?code=x", {
      headers: { cookie: `__Host-clara-recovery-next=${encodeURIComponent("/work?view=needs-you")}` },
    });
    assert.equal(readRecoveryNextCookie(request, PROD_ENV), "/work?view=needs-you");
  });

  it("finds the right cookie among several", () => {
    const request = new Request("https://internal.example/auth/recover?code=x", {
      headers: { cookie: `other=1; __Host-clara-recovery-next=${encodeURIComponent("/clients")}; third=2` },
    });
    assert.equal(readRecoveryNextCookie(request, PROD_ENV), "/clients");
  });

  it("returns null when the header is absent", () => {
    const request = new Request("https://internal.example/auth/recover?code=x");
    assert.equal(readRecoveryNextCookie(request, PROD_ENV), null);
  });

  it("returns null when the cookie is simply not present among others", () => {
    const request = new Request("https://internal.example/auth/recover?code=x", {
      headers: { cookie: "unrelated=1" },
    });
    assert.equal(readRecoveryNextCookie(request, PROD_ENV), null);
  });

  it("returns null for an empty value rather than an empty string", () => {
    const request = new Request("https://internal.example/auth/recover?code=x", {
      headers: { cookie: "__Host-clara-recovery-next=" },
    });
    assert.equal(readRecoveryNextCookie(request, PROD_ENV), null);
  });

  it("respects the env split — a dev cookie is not read under the prod name and vice versa", () => {
    const request = new Request("https://internal.example/auth/recover?code=x", {
      headers: { cookie: `clara-recovery-next=${encodeURIComponent("/dev-only")}` },
    });
    assert.equal(readRecoveryNextCookie(request, PROD_ENV), null, "the prod reader must not see the dev-named cookie");
    assert.equal(readRecoveryNextCookie(request, DEV_ENV), "/dev-only");
  });

  it("round-trips through set -> the REAL Set-Cookie header text -> read, for every character class a real `next` carries", () => {
    // Exercises the full write->read pair together (rather than each in
    // isolation, as the cells above do) for a value with a path segment,
    // several query params and an `&`, reading the cookie off the ACTUAL
    // serialized `Set-Cookie` header — what a real browser receives and
    // later replays as a `Cookie` request header — rather than the
    // structured jar accessor, which reflects the pre-serialization value
    // and would not have caught the double-encoding regression the describe
    // block above pins directly.
    const response = NextResponse.next();
    setRecoveryNextCookie(response, "/work?view=needs-you&tab=documents", PROD_ENV);
    const setCookieHeader = response.headers.get("set-cookie");
    assert.ok(setCookieHeader, "a Set-Cookie header must have been written");
    const nameValue = setCookieHeader!.split(";")[0]!;
    const request = new Request("https://internal.example/auth/recover?code=x", {
      headers: { cookie: nameValue },
    });
    assert.equal(readRecoveryNextCookie(request, PROD_ENV), "/work?view=needs-you&tab=documents");
  });
});
