import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import ConfirmEmailPage from "../../app/(entry)/auth/confirm/page";
import {
  handleEmailConfirmationPost,
  type EmailConfirmationRouteClient,
} from "../../app/(entry)/auth/confirm/verify/handler";
import EntryLayout from "../../app/(entry)/layout";
import messages from "../../messages/en.json";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent, textOf } from "../../test/hookHarness";
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
import { renderSignupRoute } from "./signup-route";
import { SignupStep } from "./signup-step";
import { SignupFirmForm } from "./signup-firm-form";

enableDomInspection();

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SUBJECT = "11111111-1111-1111-1111-111111111111";

type VerifyResponse = Awaited<
  ReturnType<EmailConfirmationRouteClient["supabase"]["auth"]["verifyOtp"]>
>;

const validResponse = (): VerifyResponse => ({
  data: {
    user: { id: SUBJECT },
    session: { access_token: "cookie-session-token", user: { id: SUBJECT } },
  },
  error: null,
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

function proxiedPostRequest(origin: string): Request {
  const form = new FormData();
  form.set("token_hash", "token-hash-proxied");
  return new Request("https://internal.worker.local/auth/confirm/verify", {
    method: "POST",
    headers: {
      origin,
      host: "internal.worker.local",
      "sec-fetch-site": "same-origin",
    },
    body: form,
  });
}

async function withPublicOrigins<T>(
  value: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  const original = env.CLARA_PUBLIC_ORIGINS;
  if (value === undefined) delete env.CLARA_PUBLIC_ORIGINS;
  else env.CLARA_PUBLIC_ORIGINS = value;
  try {
    return await run();
  } finally {
    if (original === undefined) delete env.CLARA_PUBLIC_ORIGINS;
    else env.CLARA_PUBLIC_ORIGINS = original;
  }
}

function fakeClient(
  response: VerifyResponse,
  calls: Array<{ type: "email"; token_hash: string }>,
  sealed: Response[],
): EmailConfirmationRouteClient {
  return {
    supabase: {
      auth: {
        verifyOtp: async (params) => {
          calls.push(params);
          return response;
        },
      },
    },
    sealResponse(result) {
      sealed.push(result);
      result.headers.set("Cache-Control", "private, no-store");
      return result;
    },
  };
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

test("N1: two scanner GETs paint the explicit button and make zero verifyOtp calls", async () => {
  const search = {
    token_hash: "token-hash-1",
    type: "recovery",
    next: "https://evil.example/take-session",
  };
  const first = await ConfirmEmailPage({ searchParams: Promise.resolve(search) });
  const second = await ConfirmEmailPage({ searchParams: Promise.resolve(search) });

  assert.deepEqual(first.props.state, { kind: "ready", tokenHash: "token-hash-1" });
  assert.deepEqual(second.props.state, { kind: "ready", tokenHash: "token-hash-1" });

  const pageSource = readFileSync(
    join(WEB_ROOT, "app/(entry)/auth/confirm/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(pageSource, /\.auth\.|verifyOtp\s*\(/, "GET contains a token-consuming call");

  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(EntryLayout, null, first),
    }),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    assert.match(textOf(h.container as never), /Confirm my email/);
    const headings = (h.container as unknown as { querySelectorAll(selector: string): unknown[] })
      .querySelectorAll("h1");
    assert.equal(headings.length, 1, "the confirmation face must own exactly one h1");
  } finally {
    await h.unmount();
  }
});

test("N1: one click makes exactly one hard-coded email verification and ignores hostile fields", async () => {
  const calls: Array<{ type: "email"; token_hash: string }> = [];
  const sealed: Response[] = [];
  const response = await handleEmailConfirmationPost(
    postRequest([
      ["token_hash", "token-hash-1"],
      ["type", "recovery"],
      ["next", "https://evil.example/take-session"],
    ]),
    async () => fakeClient(validResponse(), calls, sealed),
  );

  assert.deepEqual(calls, [{ type: "email", token_hash: "token-hash-1" }]);
  assert.equal(sealed.length, 1, "the cookie-writing response was not sealed against caching");
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://app.clarabook.example/signup");
  assert.doesNotMatch(response.headers.get("location") ?? "", /token_hash|evil\.example/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("NEW-B: a proxied confirmation derives authority from CLARA_PUBLIC_ORIGINS and fails closed when unset", async () => {
  const calls: Array<{ type: "email"; token_hash: string }> = [];
  let clientCreations = 0;
  const createClient = async () => {
    clientCreations += 1;
    return fakeClient(validResponse(), calls, []);
  };

  await withPublicOrigins(undefined, async () => {
    const refused = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
    );
    assert.equal(refused.status, 403, "unset must refuse instead of trusting the rewritten hop");
    assert.equal(clientCreations, 0, "the fail-closed arm must refuse before constructing the auth client");
    assert.deepEqual(calls, []);
  });

  await withPublicOrigins("https://app.clarabook.example", async () => {
    const allowed = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
    );
    assert.equal(allowed.status, 303, "the operator-named public origin must remain usable behind the proxy");
    assert.equal(allowed.headers.get("location"), "https://internal.worker.local/signup");
    assert.equal(clientCreations, 1, "the configured positive control must reach the auth client exactly once");
    assert.deepEqual(calls, [{ type: "email", token_hash: "token-hash-proxied" }]);
  });
});

test("NEW-B: Origin null is 403 while a real allowlisted Origin succeeds", async () => {
  const calls: Array<{ type: "email"; token_hash: string }> = [];
  let clientCreations = 0;
  const createClient = async () => {
    clientCreations += 1;
    return fakeClient(validResponse(), calls, []);
  };

  await withPublicOrigins("https://app.clarabook.example", async () => {
    const refused = await handleEmailConfirmationPost(
      proxiedPostRequest("null"),
      createClient,
    );
    assert.equal(refused.status, 403, "an opaque Origin must never enter the token-consuming route");
    assert.equal(clientCreations, 0, "Origin null must refuse before constructing the auth client");
    assert.deepEqual(calls, []);

    const allowed = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
    );
    assert.equal(allowed.status, 303, "the same configured wall must admit a real public Origin");
    assert.equal(clientCreations, 1, "the positive control must prove the observer can fire");
    assert.deepEqual(calls, [{ type: "email", token_hash: "token-hash-proxied" }]);
  });
});

const refusalCases: Array<{
  name: string;
  headers: Record<string, string>;
  requestUrl?: string;
  nodeEnv?: string;
}> = [
  {
    name: "cross-origin",
    headers: {
      origin: "https://evil.example",
      host: "app.clarabook.example",
    },
  },
  {
    name: "same-site sibling",
    headers: {
      origin: "https://evil.clarabook.example",
      host: "app.clarabook.example",
      "sec-fetch-site": "same-site",
    },
  },
  {
    name: "missing Origin",
    headers: {
      host: "app.clarabook.example",
    },
  },
  {
    name: "cross-site Fetch Metadata",
    headers: {
      origin: "https://app.clarabook.example",
      host: "app.clarabook.example",
      "sec-fetch-site": "cross-site",
    },
  },
  {
    name: "production localhost loopback",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    requestUrl: "http://localhost:3000/auth/confirm/verify",
    nodeEnv: "production",
  },
  {
    name: "production 127.0.0.1 loopback",
    headers: {
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
    },
    requestUrl: "http://127.0.0.1:3000/auth/confirm/verify",
    nodeEnv: "production",
  },
];

for (const refusal of refusalCases) {
  test(`NEW-1: ${refusal.name} refuses before body parsing or auth`, async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = process.env.NODE_ENV;
    if (refusal.nodeEnv) mutableEnv.NODE_ENV = refusal.nodeEnv;
    let bodyReads = 0;
    let clientCreations = 0;
    const calls: Array<{ type: "email"; token_hash: string }> = [];
    const request = {
      headers: new Headers(refusal.headers),
      url: refusal.requestUrl ?? "https://app.clarabook.example/auth/confirm/verify",
      async formData() {
        bodyReads += 1;
        const form = new FormData();
        form.set("token_hash", "attacker-token");
        return form;
      },
    } as unknown as Request;

    try {
      const response = await handleEmailConfirmationPost(request, async () => {
        clientCreations += 1;
        return fakeClient(validResponse(), calls, []);
      });

      assert.equal(response.status, 403, `${refusal.name} was not refused`);
      assert.deepEqual(await response.json(), { ok: false, error: "cross-origin" });
      assert.equal(bodyReads, 0, `${refusal.name} was parsed before the wall`);
      assert.equal(clientCreations, 0, `${refusal.name} created an auth client`);
      assert.deepEqual(calls, [], `${refusal.name} reached verifyOtp`);
      assert.equal(response.headers.get("set-cookie"), null, `${refusal.name} wrote a cookie`);
      assert.equal(response.headers.get("location"), null, `${refusal.name} redirected`);
    } finally {
      if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = originalNodeEnv;
    }
  });
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
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    assert.match(url, /\/auth\/v1\/verify$/);
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
      postRequest([["token_hash", "token-hash-2"]]),
      async () => createRouteClient({
        cookieStore: routeCookies as unknown as ServerCookieStore,
      }),
    );
    assert.equal(response.headers.get("location"), "https://app.clarabook.example/signup");
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

    const step = await renderSignupRoute(
      async () => resolveServerSession(async () => serverClient),
      async () => serverClient,
    );
    assert.equal(step.type, SignupFirmForm, "the cookie-backed /signup visit did not render the firm step");

    const noCookieClient = await createServerClient({
      cookieStore: new MemoryCookieStore() as unknown as ServerCookieStore,
    });
    const noCookieStep = await renderSignupRoute(
      async () => resolveServerSession(async () => noCookieClient),
      async () => noCookieClient,
    );
    assert.equal(noCookieStep.type, SignupAccountForm, "a cookieless /signup request reached the firm step");
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
  const session = { subject: SUBJECT, accessToken: "placeholder" };
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
  const session = { subject: SUBJECT, accessToken: "autoconfirmed-token" };
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

test("N1: invalid, replayed, and sessionless tokens refuse on a clean URL", async () => {
  const failures: VerifyResponse[] = [
    { data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } },
    { data: { user: { id: SUBJECT }, session: null }, error: null },
  ];

  for (const failure of failures) {
    const calls: Array<{ type: "email"; token_hash: string }> = [];
    const response = await handleEmailConfirmationPost(
      postRequest([["token_hash", "spent-token"]]),
      async () => fakeClient(failure, calls, []),
    );
    assert.equal(calls.length, 1);
    assert.equal(
      response.headers.get("location"),
      "https://app.clarabook.example/auth/confirm?status=invalid",
    );
    assert.doesNotMatch(response.headers.get("location") ?? "", /token_hash|spent-token/);
  }
});

test("N1: repeated token_hash fields fail closed without choosing one", async () => {
  const calls: Array<{ type: "email"; token_hash: string }> = [];
  const response = await handleEmailConfirmationPost(
    postRequest([
      ["token_hash", "first"],
      ["token_hash", "second"],
    ]),
    async () => fakeClient(validResponse(), calls, []),
  );
  assert.deepEqual(calls, []);
  assert.equal(
    response.headers.get("location"),
    "https://app.clarabook.example/auth/confirm?status=invalid",
  );
});
