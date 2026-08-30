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
    body: form,
  });
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

test("N1: a verified cookie session reaches /signup's firm step", async () => {
  let cookieSession: { subject: string; accessToken: string } | null = null;
  const calls: Array<{ type: "email"; token_hash: string }> = [];
  const sealed: Response[] = [];
  const client = fakeClient(validResponse(), calls, sealed);
  const originalVerify = client.supabase.auth.verifyOtp;
  client.supabase.auth.verifyOtp = async (params) => {
    const response = await originalVerify(params);
    cookieSession = { subject: SUBJECT, accessToken: response.data.session!.access_token };
    return response;
  };

  const response = await handleEmailConfirmationPost(
    postRequest([["token_hash", "token-hash-2"]]),
    async () => client,
  );
  assert.equal(response.headers.get("location"), "https://app.clarabook.example/signup");
  assert.ok(cookieSession, "verifyOtp did not establish the server session represented by the cookie");
  const step = SignupStep({ session: cookieSession });
  assert.equal(step.type, SignupFirmForm, "the cookie-backed /signup visit did not render the firm step");
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
