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
import type {
  ClaimConfirmationAttempt,
  ConfirmationAttemptOutcome,
  ConfirmationAttemptSettlement,
  SettleConfirmationAttempt,
} from "../../app/(entry)/auth/confirm/verify/confirmation-wall";
import EntryLayout from "../../app/(entry)/layout";
import messages from "../../messages/en.json";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent, textOf } from "../../test/hookHarness";

// The confirm→cookie→/signup integration (NEW-5) and the confirmed-user gate
// `SignupStep` itself enforces (NEW-2, NEW-2 RESIDUAL, the confirmed-user
// timestamp cell) live in the SIBLING file `email-confirmation-signup-
// route.test.tsx` — the estate's 500-line document gate, applied to a test
// file. This file stays scoped to the confirm handler's own walls:
// `proveSameOrigin`, the C1/C2 attempt seam, and the three refusal cards.

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

/** The wall's own "allowed" answer — every test that must REACH `verifyOtp`
 *  passes this explicitly, because the production default
 *  (`confirmation-wall.ts`) always refuses `{kind:"unavailable"}` (this
 *  module's own dedicated section below proves that default). */
const allowWall = (remaining = 5): ClaimConfirmationAttempt => async () => ({
  kind: "allowed",
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

function confirmFields(email = "aisyah@example.com", token = "123456"): Array<[string, string]> {
  return [["email", email], ["token", token]];
}

function proxiedPostRequest(origin: string): Request {
  const form = new FormData();
  form.set("email", "aisyah@example.com");
  form.set("token", "123456");
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
  calls: Array<{ type: "signup"; email: string; token: string }>,
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

test("N1: the GET page renders the code form and makes zero verifyOtp calls", async () => {
  // W-H, positively: page.tsx never reads an email from the URL AT ALL — a
  // hostile query string carries no email field to ignore in the first
  // place.
  const search = { email: "victim@example.com", token: "999999" };
  const first = await ConfirmEmailPage({ searchParams: Promise.resolve(search) });
  const second = await ConfirmEmailPage({ searchParams: Promise.resolve(search) });

  assert.deepEqual(first.props.state, { kind: "form" });
  assert.deepEqual(second.props.state, { kind: "form" });

  const pageSource = readFileSync(
    join(WEB_ROOT, "app/(entry)/auth/confirm/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(pageSource, /\.auth\.|verifyOtp\s*\(/, "GET contains a token-consuming call");
  assert.doesNotMatch(pageSource, /searchParams\)\.email|query\.email/, "GET reads the address from the URL");

  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(EntryLayout, null, first),
    }),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    assert.match(textOf(h.container as never), /Enter your confirmation code/);
    // The hostile query values are nowhere on the page — not pre-filled, not
    // echoed anywhere.
    assert.doesNotMatch(textOf(h.container as never), /victim@example\.com|999999/);
    const headings = (h.container as unknown as { querySelectorAll(selector: string): unknown[] })
      .querySelectorAll("h1");
    assert.equal(headings.length, 1, "the confirmation face must own exactly one h1");
  } finally {
    await h.unmount();
  }
});

test("W-H: a query-string email is never accepted — the status vocabulary is closed", async () => {
  // Every unrecognised `status` value, including one that smuggles an email
  // shape, falls to the plain form — never a distinct rendering keyed on
  // caller-supplied content.
  const state = await ConfirmEmailPage({
    searchParams: Promise.resolve({ status: "victim@example.com" }),
  });
  assert.deepEqual(state.props.state, { kind: "form" });
});

test("THE WALL RUNS BEFORE verifyOtp, and the production seam REFUSES rather than fakes success", async () => {
  const calls: Array<{ type: "signup"; email: string; token: string }> = [];
  const response = await handleEmailConfirmationPost(
    postRequest(confirmFields()),
    async () => fakeClient(validResponse(), calls, []),
    // No third argument: exercises the REAL production default from
    // confirmation-wall.ts.
  );
  assert.deepEqual(calls, [], "verifyOtp was reached despite the wall being unwired");
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://app.clarabook.example/auth/confirm?status=unavailable",
  );
});

test("confirmation-wall.ts's own production default always answers unavailable", async () => {
  const { claimConfirmationAttempt, settleConfirmationAttempt } = await import(
    "../../app/(entry)/auth/confirm/verify/confirmation-wall"
  );
  const outcome: ConfirmationAttemptOutcome = await claimConfirmationAttempt({
    email: "aisyah@example.com",
    origin: "https://app.clarabook.example",
  });
  assert.deepEqual(outcome, { kind: "unavailable" });
  // Informational only; must not throw.
  await settleConfirmationAttempt("accepted");
  await settleConfirmationAttempt("rejected");
});

test("N1: an ALLOWED wall makes exactly one hard-coded signup verification and ignores extra fields", async () => {
  const calls: Array<{ type: "signup"; email: string; token: string }> = [];
  const sealed: Response[] = [];
  const settled: ConfirmationAttemptSettlement[] = [];
  const settle: SettleConfirmationAttempt = async (outcome) => { settled.push(outcome); };
  const response = await handleEmailConfirmationPost(
    postRequest([...confirmFields(), ["extra", "hostile-value"]]),
    async () => fakeClient(validResponse(), calls, sealed),
    allowWall(),
    settle,
  );

  assert.deepEqual(calls, [{ type: "signup", email: "aisyah@example.com", token: "123456" }]);
  assert.deepEqual(settled, ["accepted"]);
  assert.equal(sealed.length, 1, "the cookie-writing response was not sealed against caching");
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://app.clarabook.example/signup");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("W-H2: wrong code, expired, and locked render as three DISTINCT redirects", async () => {
  const wrong = await handleEmailConfirmationPost(
    postRequest(confirmFields()),
    async () => fakeClient(
      { data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } },
      [],
      [],
    ),
    allowWall(3),
  );
  assert.equal(
    wrong.headers.get("location"),
    "https://app.clarabook.example/auth/confirm?status=wrong&remaining=3",
  );

  const expired = await handleEmailConfirmationPost(
    postRequest(confirmFields()),
    async () => fakeClient(
      { data: { user: null, session: null }, error: { message: "Token has expired", code: "otp_expired" } },
      [],
      [],
    ),
    allowWall(2),
  );
  assert.equal(
    expired.headers.get("location"),
    "https://app.clarabook.example/auth/confirm?status=expired",
    "an otp_expired error must not render as a plain wrong code",
  );

  const locked = await handleEmailConfirmationPost(
    postRequest(confirmFields()),
    async () => fakeClient(validResponse(), [], []),
    async () => ({ kind: "rejected", scope: "address", retryAfterSeconds: 300 }),
  );
  assert.equal(
    locked.headers.get("location"),
    "https://app.clarabook.example/auth/confirm?status=locked&wait=300",
  );

  const redirects = [wrong, expired, locked].map((r) => r.headers.get("location"));
  assert.equal(new Set(redirects).size, 3, "the three refusals must not collapse onto one redirect");
});

test("a locked wall never reaches verifyOtp at all", async () => {
  const calls: Array<{ type: "signup"; email: string; token: string }> = [];
  const response = await handleEmailConfirmationPost(
    postRequest(confirmFields()),
    async () => fakeClient(validResponse(), calls, []),
    async () => ({ kind: "rejected", scope: "origin", retryAfterSeconds: 900 }),
  );
  assert.deepEqual(calls, [], "the C1/C2 wall did not gate verifyOtp");
  assert.match(response.headers.get("location") ?? "", /status=locked/);
});

test("a rejected verification is settled, not left dangling", async () => {
  const settled: ConfirmationAttemptSettlement[] = [];
  await handleEmailConfirmationPost(
    postRequest(confirmFields()),
    async () => fakeClient(
      { data: { user: null, session: null }, error: { message: "invalid" } },
      [],
      [],
    ),
    allowWall(1),
    async (outcome) => { settled.push(outcome); },
  );
  assert.deepEqual(settled, ["rejected"]);
});

test("NEW-B: a proxied confirmation derives authority from CLARA_PUBLIC_ORIGINS and fails closed when unset", async () => {
  const calls: Array<{ type: "signup"; email: string; token: string }> = [];
  let clientCreations = 0;
  const createClient = async () => {
    clientCreations += 1;
    return fakeClient(validResponse(), calls, []);
  };

  await withPublicOrigins(undefined, async () => {
    const refused = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
      allowWall(),
    );
    assert.equal(refused.status, 403, "unset must refuse instead of trusting the rewritten hop");
    assert.equal(clientCreations, 0, "the fail-closed arm must refuse before constructing the auth client");
    assert.deepEqual(calls, []);
  });

  await withPublicOrigins("https://app.clarabook.example", async () => {
    const allowed = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
      allowWall(),
    );
    assert.equal(allowed.status, 303, "the operator-named public origin must remain usable behind the proxy");
    assert.equal(
      allowed.headers.get("location"),
      "https://app.clarabook.example/signup",
      "the redirect must be built from the PROVEN Origin, never request.url's authority (PR 455 MEDIUM-2)",
    );
    assert.equal(clientCreations, 1, "the configured positive control must reach the auth client exactly once");
    assert.deepEqual(calls, [{ type: "signup", email: "aisyah@example.com", token: "123456" }]);
  });
});

test("NEW-B: Origin null is 403 while a real allowlisted Origin succeeds", async () => {
  const calls: Array<{ type: "signup"; email: string; token: string }> = [];
  let clientCreations = 0;
  const createClient = async () => {
    clientCreations += 1;
    return fakeClient(validResponse(), calls, []);
  };

  await withPublicOrigins("https://app.clarabook.example", async () => {
    const refused = await handleEmailConfirmationPost(
      proxiedPostRequest("null"),
      createClient,
      allowWall(),
    );
    assert.equal(refused.status, 403, "an opaque Origin must never enter the token-consuming route");
    assert.equal(clientCreations, 0, "Origin null must refuse before constructing the auth client");
    assert.deepEqual(calls, []);

    const allowed = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
      allowWall(),
    );
    assert.equal(allowed.status, 303, "the same configured wall must admit a real public Origin");
    assert.equal(clientCreations, 1, "the positive control must prove the observer can fire");
    assert.deepEqual(calls, [{ type: "signup", email: "aisyah@example.com", token: "123456" }]);
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
  test(`NEW-1: ${refusal.name} refuses before body parsing, the wall, or auth`, async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = process.env.NODE_ENV;
    if (refusal.nodeEnv) mutableEnv.NODE_ENV = refusal.nodeEnv;
    let bodyReads = 0;
    let clientCreations = 0;
    let wallCalls = 0;
    const calls: Array<{ type: "signup"; email: string; token: string }> = [];
    const request = {
      headers: new Headers(refusal.headers),
      url: refusal.requestUrl ?? "https://app.clarabook.example/auth/confirm/verify",
      async formData() {
        bodyReads += 1;
        const form = new FormData();
        form.set("email", "attacker@example.com");
        form.set("token", "000000");
        return form;
      },
    } as unknown as Request;

    try {
      const response = await handleEmailConfirmationPost(
        request,
        async () => {
          clientCreations += 1;
          return fakeClient(validResponse(), calls, []);
        },
        async () => {
          wallCalls += 1;
          return { kind: "allowed", remaining: 5 };
        },
      );

      assert.equal(response.status, 403, `${refusal.name} was not refused`);
      assert.deepEqual(await response.json(), { ok: false, error: "cross-origin" });
      assert.equal(bodyReads, 0, `${refusal.name} was parsed before the wall`);
      assert.equal(wallCalls, 0, `${refusal.name} reached the attempt wall`);
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

test("N1: a malformed submission (missing/duplicated field) redirects to a clean URL and never reaches the wall", async () => {
  let wallCalls = 0;
  const wall: ClaimConfirmationAttempt = async () => {
    wallCalls += 1;
    return { kind: "allowed", remaining: 5 };
  };

  const missing = await handleEmailConfirmationPost(
    postRequest([["email", "aisyah@example.com"]]),
    async () => fakeClient(validResponse(), [], []),
    wall,
  );
  assert.equal(
    missing.headers.get("location"),
    "https://app.clarabook.example/auth/confirm?status=invalid",
  );

  const duplicated = await handleEmailConfirmationPost(
    postRequest([...confirmFields(), ["token", "999999"]]),
    async () => fakeClient(validResponse(), [], []),
    wall,
  );
  assert.equal(
    duplicated.headers.get("location"),
    "https://app.clarabook.example/auth/confirm?status=invalid",
  );

  assert.equal(wallCalls, 0, "a malformed submission must not consume a wall attempt");
});
