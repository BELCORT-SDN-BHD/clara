// Split out of email-confirmation.test.tsx (the estate's 500-line document
// gate, applied to a test file for the first time on this train): this half
// is the confirm→cookie→/signup INTEGRATION and the confirmed-user gate
// `SignupStep` itself enforces, as opposed to the confirm handler's own
// walls (proveSameOrigin, the C1/C2 attempt seam, the three refusal cards),
// which stay in email-confirmation.test.tsx.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { handleEmailConfirmationPost } from "../../app/(entry)/auth/confirm/verify/handler";
import type { ConfirmEmailCode } from "../../app/(entry)/auth/confirm/verify/confirmation-wall";
import {
  isConfirmedUser,
  UnreadableAuthUserError,
} from "../../lib/auth/confirmed-user";
import {
  createClient as createServerClient,
  createRouteClient,
  type ServerCookieStore,
} from "../../lib/supabase/server";
import { resolveServerSession } from "../../lib/supabase/server-session";
import { SignupAccountForm } from "./signup-account-form";
import { SignupDpaForm } from "./signup-dpa-form";
import {
  renderSignupRoute,
  type LoadSignupDpaDocument,
  type LoadSignupRegistration,
} from "./signup-route";
import { SignupStep } from "./signup-step";
import { SignupFirmForm } from "./signup-firm-form";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SUBJECT = "11111111-1111-1111-1111-111111111111";

/** The wall's VERIFIED answer, carrying the session the runtime obtained.
 *
 *  FS-4 C-6 Lane B: this used to be a claim stub whose "allowed" arm let the
 *  handler run `verifyOtp` itself. C-5's A-M3 fix put claim → verify → settle
 *  inside one runtime request (a caller that can settle — or that merely holds
 *  an attempt id — can zero out the rate wall), so what the handler receives
 *  now is the verdict AND the session, and what this cell proves is unchanged:
 *  a verified confirmation writes a cookie the NEXT /signup request can use. */
const verifiedWall = (accessToken: string, remaining = 5): ConfirmEmailCode => async () => ({
  kind: "verified",
  session: { accessToken, refreshToken: "refresh-token" },
  remaining,
});

function postRequest(fields: Array<[string, string]>): Request {
  const form = new FormData();
  for (const [key, value] of fields) form.append(key, value);
  return new Request("https://app.clarabook.example/auth/confirm/verify", {
    method: "POST",
    headers: {
      origin: "https://app.clarabook.example",
      host: "app.clarabook.example",
      "sec-fetch-site": "same-origin",
    },
    body: form,
  });
}

function confirmFields(email: string, token: string): Array<[string, string]> {
  return [["email", email], ["token", token]];
}

class MemoryCookieStore {
  readonly values = new Map<string, string>();

  static fromRequest(request: Request): MemoryCookieStore {
    const store = new MemoryCookieStore();
    for (const part of (request.headers.get("cookie") ?? "").split(";")) {
      const separator = part.indexOf("=");
      if (separator < 1) continue;
      store.values.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
    }
    return store;
  }

  getAll(): Array<{ name: string; value: string }> {
    return [...this.values].map(([name, value]) => ({ name, value }));
  }

  set(name: string, value: string): void {
    if (value === "") this.values.delete(name);
    else this.values.set(name, value);
  }
}

function testJwt(subject: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: subject,
    aud: "authenticated",
    role: "authenticated",
    exp: 4_102_444_800,
    iat: 1_788_112_800,
  })).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

test("NEW-5: the confirmation response cookie drives the next /signup request", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const testGlobal = globalThis as unknown as { window: unknown };
  const originalWindow = testGlobal.window;
  const originalWebSocket = globalThis.WebSocket;
  const accessToken = testJwt(SUBJECT);
  const routeCookies = new MemoryCookieStore();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
  // This cell drives the SERVER client. The shared React harness installs a
  // minimal `window`, which would otherwise make auth-js choose its browser
  // navigator-lock path even though this request is server-side.
  testGlobal.window = undefined;
  // Node 20 has no native WebSocket. Supabase constructs its dormant realtime
  // client eagerly even though this Auth-only cell never connects it; provide
  // the constructor check only, and let any accidental use fail immediately.
  globalThis.WebSocket = class AuthOnlyWebSocket {
    constructor() {
      throw new Error("the Auth-only SSR adapter must not open a WebSocket");
    }
  } as unknown as typeof WebSocket;
  // The handler no longer talks to GoTrue itself — the runtime did that. What
  // reaches the network here is whatever `setSession` needs to hydrate the
  // session it was handed (`/auth/v1/user`), and the assertion is that NOTHING
  // ELSE does: a request to `/auth/v1/verify` from this process would mean the
  // app was re-verifying a single-use OTP the runtime already consumed.
  const authCalls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    authCalls.push(new URL(url).pathname);
    assert.match(url, /\/auth\/v1\//);
    if (url.endsWith("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: SUBJECT, email_confirmed_at: "2026-08-31T01:02:03Z" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({
      access_token: accessToken,
      refresh_token: "refresh-token",
      token_type: "bearer",
      expires_in: 3_600,
      expires_at: 4_102_444_800,
      user: { id: SUBJECT, email_confirmed_at: "2026-08-31T01:02:03Z" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await handleEmailConfirmationPost(
      postRequest(confirmFields("aisyah@example.com", "654321")),
      async () => createRouteClient({
        cookieStore: routeCookies as unknown as ServerCookieStore,
      }),
      verifiedWall(accessToken),
    );
    assert.equal(response.headers.get("location"), "https://app.clarabook.example/signup");
    assert.deepEqual(
      authCalls.filter((path) => path.endsWith("/verify")),
      [],
      "apps/web re-verified a single-use OTP the runtime had already consumed",
    );
    const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = getSetCookie?.call(response.headers) ?? [response.headers.get("set-cookie") ?? ""];
    assert.ok(setCookies.some((value) => value.startsWith("__Host-clara-auth=")));

    const rawCookie = setCookies
      .filter(Boolean)
      .map((value) => value.split(";", 1)[0] as string)
      .join("; ");
    const signupRequest = new Request("https://app.clarabook.example/signup", {
      headers: { cookie: rawCookie },
    });
    const requestCookies = MemoryCookieStore.fromRequest(signupRequest);
    const serverClient = await createServerClient({
      cookieStore: requestCookies as unknown as ServerCookieStore,
    });
    serverClient.auth.getClaims = (async (jwt?: string) => ({
      data: { claims: jwt === accessToken ? { sub: SUBJECT } : null },
      error: jwt === accessToken ? null : { message: "wrong token" },
    })) as typeof serverClient.auth.getClaims;
    serverClient.auth.getUser = (async (jwt?: string) => ({
      data: {
        user: jwt === accessToken
          ? { id: SUBJECT, email_confirmed_at: "2026-08-31T01:02:03Z" }
          : null,
      },
      error: jwt === accessToken ? null : { message: "wrong token" },
    })) as typeof serverClient.auth.getUser;

    // M5, fix round 2026-09-01: the 3rd/4th args are STUBBED EXPLICITLY.
    // Before this fix they were omitted, so this cell passed only because
    // the REAL default loaders (`loadOwnRegistrationRequests` /
    // `loadCurrentDpaDocumentState`) throw under this test's stubbed
    // `fetch` (no live request scope for `next/headers`), get caught by
    // `renderSignupRoute`'s own try/catch, and degrade to `hasOpenRegistration
    // = false` — the SAME answer this stub gives, but for an unstated reason
    // that would have flipped this assertion's meaning silently if either
    // real loader ever started succeeding under a stubbed `fetch`. `dpaCalls`
    // proves the second read is never reached when the first says "no open
    // registration" — the two-step short-circuit `renderSignupRoute` itself
    // implements.
    let registrationCalls = 0;
    let dpaCalls = 0;
    const noOpenRegistration: LoadSignupRegistration = async () => {
      registrationCalls += 1;
      return { ok: false, reason: "no_session" };
    };
    const unreachableDpaDocument: LoadSignupDpaDocument = async () => {
      dpaCalls += 1;
      return { kind: "unavailable" };
    };

    const step = await renderSignupRoute(
      async () => resolveServerSession(async () => serverClient),
      async () => serverClient,
      noOpenRegistration,
      unreachableDpaDocument,
    );
    assert.equal(step.type, SignupFirmForm, "the cookie-backed /signup visit did not render the firm step");
    assert.equal(registrationCalls, 1, "the registration read was not reached exactly once");
    assert.equal(dpaCalls, 0, "the DPA read ran despite no open registration");

    const noCookieClient = await createServerClient({
      cookieStore: new MemoryCookieStore() as unknown as ServerCookieStore,
    });
    const noCookieStep = await renderSignupRoute(
      async () => resolveServerSession(async () => noCookieClient),
      async () => noCookieClient,
      noOpenRegistration,
      unreachableDpaDocument,
    );
    assert.equal(noCookieStep.type, SignupAccountForm, "a cookieless /signup request reached the firm step");
    // An unconfirmed/no-session caller must not even REACH the registration
    // read (M5's own header fix — the gate is `isUsableConfirmedSession`,
    // checked before either read runs).
    assert.equal(registrationCalls, 1, "an unconfirmed caller triggered the registration read");
  } finally {
    testGlobal.window = originalWindow;
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }

  // Production must use the request-cookie SSR client. The injected route
  // boundary above drives that exact adapter; this source pin makes replacing
  // that production wiring with the browser client red instead of invisible.
  const handlerSource = readFileSync(
    join(WEB_ROOT, "app/(entry)/auth/confirm/verify/handler.ts"),
    "utf8",
  );
  assert.match(handlerSource, /createRouteClient[\s\S]*from "@\/lib\/supabase\/server"/);
  assert.doesNotMatch(handlerSource, /@\/lib\/supabase\/client/);
});

test("NEW-2: a fresh /signup render refuses persisted unconfirmed or unreadable users", () => {
  const session = { subject: SUBJECT, accessToken: "placeholder", email: null };
  const refusedUsers: unknown[] = [
    { id: SUBJECT, email_confirmed_at: null },
    { id: SUBJECT, email_confirmed_at: "not-a-timestamp" },
    { id: SUBJECT, email_confirmed_at: "2026-02-30T01:02:03Z" },
  ];

  for (const user of refusedUsers) {
    const step = SignupStep({ session, user } as Parameters<typeof SignupStep>[0]);
    assert.equal(step.type, SignupAccountForm, "an unconfirmed persisted session reached the firm step");
  }
});

test("NEW-2 RESIDUAL: a direct hosted-Auth caller under autoconfirm drift reaches the firm step — held by the deploy gate, not by code", () => {
  const session = { subject: SUBJECT, accessToken: "autoconfirmed-token", email: null };
  const step = SignupStep({
    session,
    user: {
      id: SUBJECT,
      email_confirmed_at: "2026-08-31T01:02:03Z",
    },
  });
  assert.equal(
    step.type,
    SignupFirmForm,
    "the residual changed: update the deploy-gate claim and the booked server-receipt follow-up",
  );
});

test("R3, fix round 2026-09-01: a confirmed session with hasOpenRegistration:true renders SignupDpaForm, not the firm form again", () => {
  // The one line wiring the PR's central new routing predicate to its
  // component (signup-step.tsx: `if (hasOpenRegistration) return
  // <SignupDpaForm .../>`) had zero direct coverage before this cell — every
  // existing test either omitted the prop (defaulting to false) or exercised
  // it only indirectly through a full renderSignupRoute() integration that
  // never actually set it true. This is the POSITIVE arm.
  const session = { subject: SUBJECT, accessToken: "confirmed-token", email: null };
  const user = { id: SUBJECT, email_confirmed_at: "2026-08-31T01:02:03Z" };

  const step = SignupStep({
    session,
    user,
    hasOpenRegistration: true,
    dpaDocument: { kind: "ready", version: "clara-beta-2026-08-a", body: "Beta text.", bodySha256: "\\xabc" },
  });
  assert.equal(step.type, SignupDpaForm, "hasOpenRegistration:true did not route to the DPA step");
  // The document prop itself must reach the component unmodified — never
  // swapped for a default, and never dropped.
  assert.deepEqual(
    (step.props as { document: unknown }).document,
    { kind: "ready", version: "clara-beta-2026-08-a", body: "Beta text.", bodySha256: "\\xabc" },
  );

  // The discriminating negative, same session/user, only the flag differs:
  // false (or omitted) must still land on the firm form, exactly as the
  // cell above already proves — restated here so the two are read together.
  const stepWithoutRegistration = SignupStep({ session, user, hasOpenRegistration: false });
  assert.equal(stepWithoutRegistration.type, SignupFirmForm);
});

test("NEW: confirmed-user accepts strict timestamps and refuses malformed clock/calendar values", () => {
  for (const timestamp of [
    "2024-02-29T23:59:59Z",
    "2026-08-31T01:02:03.123456789+08:00",
  ]) {
    assert.equal(
      isConfirmedUser({ email_confirmed_at: timestamp }),
      true,
      `${timestamp} should be accepted`,
    );
  }

  for (const timestamp of [
    "2026-02-30T01:02:03Z",
    "2025-02-29T01:02:03Z",
    "2026-08-31",
    "2026",
    "2026-08-31T24:00:00Z",
    "2026-08-31T23:60:00Z",
    "2026-08-31T23:59:60Z",
  ]) {
    assert.throws(
      () => isConfirmedUser({ email_confirmed_at: timestamp }),
      UnreadableAuthUserError,
      `${timestamp} should be refused`,
    );
  }
});
