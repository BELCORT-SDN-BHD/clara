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

function fakeClient(
  response: VerifyResponse,
  calls: Array<{ type: "email"; token_hash: string }>,
  sealed: Response[],
  sessionCookie?: string,
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
      if (sessionCookie) result.headers.append("Set-Cookie", sessionCookie);
      return result;
    },
  };
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

const refusalCases: Array<{
  name: string;
  headers: Record<string, string>;
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
];

for (const refusal of refusalCases) {
  test(`NEW-1: ${refusal.name} refuses before body parsing or auth`, async () => {
    let bodyReads = 0;
    let clientCreations = 0;
    const calls: Array<{ type: "email"; token_hash: string }> = [];
    const request = {
      headers: new Headers(refusal.headers),
      url: "https://app.clarabook.example/auth/confirm/verify",
      async formData() {
        bodyReads += 1;
        const form = new FormData();
        form.set("token_hash", "attacker-token");
        return form;
      },
    } as unknown as Request;

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
  });
}

test("NEW-5: the confirmation response cookie drives the next /signup request", async () => {
  const sessionCookie = "__Host-clara-auth=confirmed-session; Path=/; HttpOnly; Secure; SameSite=Lax";
  const calls: Array<{ type: "email"; token_hash: string }> = [];
  const sealed: Response[] = [];
  const response = await handleEmailConfirmationPost(
    postRequest([["token_hash", "token-hash-2"]]),
    async () => fakeClient(validResponse(), calls, sealed, sessionCookie),
  );
  assert.equal(response.headers.get("location"), "https://app.clarabook.example/signup");
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie ?? "", /^__Host-clara-auth=confirmed-session;/);

  const sessionFor = (request: Request) =>
    request.headers.get("cookie")?.includes("__Host-clara-auth=confirmed-session")
      ? { subject: SUBJECT, accessToken: "cookie-session-token" }
      : null;
  const signupRequest = new Request("https://app.clarabook.example/signup", {
    headers: { cookie: (setCookie as string).split(";", 1)[0] as string },
  });
  const createSignupClient = async () => ({
    auth: {
      getUser: async (jwt: string) => ({
        data: {
          user: jwt === "cookie-session-token"
            ? { id: SUBJECT, email_confirmed_at: "2026-08-31T01:02:03Z" }
            : null,
        },
        error: null,
      }),
    },
  });
  const step = await renderSignupRoute(
    async () => sessionFor(signupRequest),
    createSignupClient,
  );
  assert.equal(step.type, SignupFirmForm, "the cookie-backed /signup visit did not render the firm step");

  const noCookieStep = await renderSignupRoute(
    async () => sessionFor(new Request("https://app.clarabook.example/signup")),
    createSignupClient,
  );
  assert.equal(noCookieStep.type, SignupAccountForm, "a cookieless /signup request reached the firm step");

  // Production must use the request-cookie SSR client. The injected route
  // double above proves the HTTP round trip; this source pin makes replacing
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
