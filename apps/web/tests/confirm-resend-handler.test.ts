import assert from "node:assert/strict";
import { test } from "node:test";

import { handleConfirmationResendPost } from "../app/(entry)/auth/confirm/resend/handler";
import {
  RESEND_ENDPOINT_PATH,
  RUNTIME_URL_VAR,
  SERVICE_TOKEN_VAR,
  resendConfirmationCodeWith,
  type ResendConfirmationCode,
  type ResendConfirmationCodeParams,
  type ResendOutcome,
} from "../app/(entry)/auth/confirm/resend/resend-wall";
import { confirmFlashCookie } from "../app/(entry)/auth/confirm/confirm-flash";
import { AUTH_WALL_CLIENT_IP_HEADER, TRUSTED_HEADER_VAR } from "../lib/rate-wall-courier";

/**
 * `POST /auth/confirm/resend` (#621) — the route and the seam behind it.
 *
 * Two layers, one file, because they are one contract: the HANDLER's walls
 * (same-origin, one well-formed address, the trusted client IP, the flash it
 * paints) and the SEAM's reading of the runtime's five answers. Driven directly
 * rather than through a live request scope, the same way
 * `email-confirmation.test.tsx` drives its sibling.
 */

const ORIGIN = "https://app.clarabook.example";

function postRequest(
  fields: Array<[string, string]>,
  extraHeaders: Record<string, string> = {},
): Request {
  const form = new FormData();
  for (const [key, value] of fields) form.append(key, value);
  return new Request(`${ORIGIN}/auth/confirm/resend`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      host: "app.clarabook.example",
      "sec-fetch-site": "same-origin",
      ...extraHeaders,
    },
    body: form,
  });
}

function recordingResend(
  outcome: ResendOutcome,
  seen: ResendConfirmationCodeParams[],
): ResendConfirmationCode {
  return async (params) => {
    seen.push(params);
    return outcome;
  };
}

function flashPayload(response: Response): Record<string, unknown> {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const name = confirmFlashCookie().name;
  const raw = /(?:^|,\s*)([^=;,]+)=([^;]*)/g;
  let match: RegExpExecArray | null;
  while ((match = raw.exec(setCookie)) !== null) {
    if (match[1]?.trim() === name) return JSON.parse(decodeURIComponent(match[2] ?? "")) as Record<string, unknown>;
  }
  throw new Error(`no flash cookie on the redirect (set-cookie: ${setCookie})`);
}

function flashNonce(response: Response): string {
  const location = response.headers.get("location") ?? "";
  const nonce = new URL(location).searchParams.get("flash");
  assert.ok(nonce && nonce.length > 0, `the redirect carries no flash marker (location: ${location})`);
  return nonce;
}

async function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  const originals = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    originals.set(key, env[key]);
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of originals) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
}

// ── THE HANDLER ────────────────────────────────────────────────────────────

test("CROSS-ORIGIN IS REFUSED BEFORE THE BODY IS READ, and never reaches the wall", async () => {
  const seen: ResendConfirmationCodeParams[] = [];
  const form = new FormData();
  form.set("email", "aisyah@example.com");
  const response = await handleConfirmationResendPost(
    new Request(`${ORIGIN}/auth/confirm/resend`, {
      method: "POST",
      headers: { origin: "https://evil.example", host: "app.clarabook.example", "sec-fetch-site": "cross-site" },
      body: form,
    }),
    recordingResend({ kind: "sent" }, seen),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: "cross-origin" });
  assert.deepEqual(seen, [], "a cross-origin POST spent an attempt against somebody else's budget");
  assert.equal(response.headers.get("set-cookie"), null, "a refused request wrote a flash cookie");
});

test("A MALFORMED ADDRESS never reaches the wall, and echoes nothing back", async () => {
  for (const fields of [
    [] as Array<[string, string]>,
    [["email", ""]] as Array<[string, string]>,
    [["email", "a@example.com"], ["email", "b@example.com"]] as Array<[string, string]>,
  ]) {
    const seen: ResendConfirmationCodeParams[] = [];
    const response = await handleConfirmationResendPost(
      postRequest(fields),
      recordingResend({ kind: "sent" }, seen),
    );
    assert.equal(response.status, 303);
    assert.deepEqual(seen, [], "a malformed submission spent a wall attempt");
    assert.deepEqual(flashPayload(response), { nonce: flashNonce(response), kind: "resend-invalid-email" });
  }
});

test("THE WALL IS FED THE TRUSTED-HEADER ADDRESS, never the Origin header", async () => {
  // The C2 limb keys on ONE VALUE PER ADDRESS. `proveSameOrigin`'s proof is the
  // browser's `Origin`, identical for every visitor to one deployment — keying
  // on it would let a handful of requests from anyone lock out every applicant.
  const seen: ResendConfirmationCodeParams[] = [];
  await withEnv({ [TRUSTED_HEADER_VAR]: "cf-connecting-ip" }, async () => {
    await handleConfirmationResendPost(
      postRequest([["email", "aisyah@example.com"]], { "cf-connecting-ip": "198.51.100.42" }),
      recordingResend({ kind: "sent" }, seen),
    );
  });
  assert.deepEqual(seen, [{ email: "aisyah@example.com", clientIp: "198.51.100.42" }]);
  assert.notEqual(seen[0]?.clientIp, ORIGIN);

  // With no configured header the courier produces nothing, and the seam's own
  // fail-closed arm is what refuses — never a placeholder address.
  const withoutHeader: ResendConfirmationCodeParams[] = [];
  await withEnv({ [TRUSTED_HEADER_VAR]: undefined }, async () => {
    await handleConfirmationResendPost(
      postRequest([["email", "aisyah@example.com"]]),
      recordingResend({ kind: "unavailable" }, withoutHeader),
    );
  });
  assert.equal(withoutHeader[0]?.clientIp, null);
});

test("EACH OF THE WALL'S FIVE ANSWERS PAINTS ITS OWN FLASH, with the address echoed back", async () => {
  const cases: Array<[ResendOutcome, Record<string, unknown>]> = [
    [{ kind: "sent" }, { kind: "resent" }],
    [{ kind: "locked", retryAfterSeconds: 300, atLeast: false }, { kind: "resend-locked", waitSeconds: 300, atLeast: false }],
    [{ kind: "rate_limited", retryAfterSeconds: 47, atLeast: false }, { kind: "resend-rate-limited", waitSeconds: 47, atLeast: false }],
    [{ kind: "invalid_email" }, { kind: "resend-invalid-email" }],
    [{ kind: "unavailable" }, { kind: "resend-unavailable" }],
  ];
  const painted = new Set<string>();
  for (const [outcome, expected] of cases) {
    const response = await handleConfirmationResendPost(
      postRequest([["email", "aisyah@example.com"]]),
      async () => outcome,
    );
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location") ?? "");
    assert.equal(location.origin, ORIGIN);
    assert.equal(location.pathname, "/auth/confirm");
    // N1 (裁-109) is unchanged: the URL carries ONLY an opaque marker.
    assert.deepEqual([...location.searchParams.keys()], ["flash"]);
    assert.doesNotMatch(location.search, /aisyah|locked|rate/i);
    assert.deepEqual(flashPayload(response), {
      nonce: flashNonce(response),
      email: "aisyah@example.com",
      ...expected,
    });
    painted.add(String(expected.kind));
  }
  assert.equal(painted.size, cases.length, "two of the wall's answers paint the same card");
});

test("THE FLASH COOKIE'S SECURITY ATTRIBUTES are the verify path's, not a second weaker copy", async () => {
  const response = await handleConfirmationResendPost(
    postRequest([["email", "aisyah@example.com"]]),
    async () => ({ kind: "locked", retryAfterSeconds: 300, atLeast: false }),
  );
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /HttpOnly/i, "the outcome cookie is readable by script");
  assert.match(setCookie, /SameSite=strict/i);
  assert.match(setCookie, /Path=\//i);
  // A LOCKED outcome must outlive the wait its own copy tells the person to
  // serve, or somebody who obeys it and reloads lands on a mystery `invalid`.
  const maxAge = /Max-Age=(\d+)/i.exec(setCookie);
  assert.ok(maxAge, `no Max-Age on the flash cookie (${setCookie})`);
  assert.ok(Number(maxAge[1]) > 300, "the locked flash expires before the wait it advertises");
});

// ── THE SEAM ───────────────────────────────────────────────────────────────

const ENDPOINT_ENV = {
  [RUNTIME_URL_VAR]: "https://runtime.example",
  [SERVICE_TOKEN_VAR]: "service-token",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("THE SEAM CALLS ONE ENDPOINT, with the bearer, the forwarded address, and EXACTLY one field", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const outcome = await resendConfirmationCodeWith(
    { email: "aisyah@example.com", clientIp: "198.51.100.42" },
    {
      env: ENDPOINT_ENV,
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse({ outcome: "sent" }, 200);
      }) as typeof fetch,
    },
  );
  assert.deepEqual(outcome, { kind: "sent" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `https://runtime.example${RESEND_ENDPOINT_PATH}`);
  const headers = new Headers(calls[0]?.init.headers);
  assert.equal(headers.get("authorization"), "Bearer service-token");
  assert.equal(headers.get(AUTH_WALL_CLIENT_IP_HEADER), "198.51.100.42");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { email: "aisyah@example.com" });
});

test("THE SEAM READS EACH STATUS FOR WHAT IT IS, and never invents a send", async () => {
  const cases: Array<[number, unknown, ResendOutcome]> = [
    [200, { outcome: "sent" }, { kind: "sent" }],
    [429, { outcome: "locked", retryAfterSeconds: 300 }, { kind: "locked", retryAfterSeconds: 300, atLeast: false }],
    [429, { outcome: "rate_limited", retryAfterSeconds: 47 }, { kind: "rate_limited", retryAfterSeconds: 47, atLeast: false }],
    [400, { outcome: "invalid_email" }, { kind: "invalid_email" }],
    [503, { outcome: "unavailable" }, { kind: "unavailable" }],
    // A 200 that does not SAY sent is not evidence a code went out.
    [200, { outcome: "queued" }, { kind: "unavailable" }],
    [200, {}, { kind: "unavailable" }],
    // A WAIT LONGER THAN THE CARD WILL PRINT IS STILL A WAIT (#621 review). The
    // runtime's `providerRetryAfterSeconds` is uncapped, so "wait an hour" is an
    // ordinary answer from a wall that worked perfectly. It used to become
    // `unavailable`, whose card says "we couldn't send a new code" — a plain
    // falsehood that also invites a retry against the budget that just refused.
    // It is CLAMPED to the display ceiling and FLAGGED instead.
    [429, { outcome: "locked", retryAfterSeconds: 3600 }, { kind: "locked", retryAfterSeconds: 900, atLeast: true }],
    [429, { outcome: "rate_limited", retryAfterSeconds: 3600 }, { kind: "rate_limited", retryAfterSeconds: 900, atLeast: true }],
    // NaN is a `number` to `typeof` and nothing to arithmetic — the one shape a
    // naive bound lets through as a wait. It carries no reading at all, so the
    // outcome STANDS and the per-outcome default is served: 15 minutes for the
    // C1/C2 attempt window, a minute for the provider's send cooldown.
    [429, { outcome: "locked", retryAfterSeconds: Number.NaN }, { kind: "locked", retryAfterSeconds: 900, atLeast: false }],
    [429, { outcome: "rate_limited", retryAfterSeconds: Number.NaN }, { kind: "rate_limited", retryAfterSeconds: 60, atLeast: false }],
    // ZERO IS A REAL ANSWER, not a missing one — "you may ask again now". It is
    // kept verbatim rather than replaced by a default the wall never said.
    [429, { outcome: "locked", retryAfterSeconds: 0 }, { kind: "locked", retryAfterSeconds: 0, atLeast: false }],
    [429, { outcome: "rate_limited", retryAfterSeconds: 0 }, { kind: "rate_limited", retryAfterSeconds: 0, atLeast: false }],
    // A negative or non-numeric wait has no honest reading either: the default.
    [429, { outcome: "locked", retryAfterSeconds: -5 }, { kind: "locked", retryAfterSeconds: 900, atLeast: false }],
    [429, { outcome: "rate_limited", retryAfterSeconds: "47" }, { kind: "rate_limited", retryAfterSeconds: 60, atLeast: false }],
    [429, { outcome: "locked" }, { kind: "locked", retryAfterSeconds: 900, atLeast: false }],
    // A fractional wait is rounded UP — never promise a shorter one.
    [429, { outcome: "rate_limited", retryAfterSeconds: 46.2 }, { kind: "rate_limited", retryAfterSeconds: 47, atLeast: false }],
    // AN OUTCOME THIS BUILD DOES NOT RECOGNISE is still `unavailable`: a shape
    // refusal, which is a different thing from a wait that could not be read.
    [429, { outcome: "something_else", retryAfterSeconds: 5 }, { kind: "unavailable" }],
    [500, { outcome: "sent" }, { kind: "unavailable" }],
  ];
  for (const [status, body, expected] of cases) {
    const outcome = await resendConfirmationCodeWith(
      { email: "aisyah@example.com", clientIp: "198.51.100.42" },
      { env: ENDPOINT_ENV, fetchImpl: (async () => jsonResponse(body, status)) as typeof fetch },
    );
    assert.deepEqual(outcome, expected, `${status} ${JSON.stringify(body)} was misread`);
  }
});

test("EVERY FAILURE CLASS LANDS ON `unavailable`, and NONE of them sends a request it cannot key", async () => {
  let sent = 0;
  const countingFetch = (async () => {
    sent += 1;
    return jsonResponse({ outcome: "sent" }, 200);
  }) as typeof fetch;

  // Unconfigured runtime, unconfigured token, and no client address: all three
  // refuse BEFORE the request is made.
  for (const env of [
    { [SERVICE_TOKEN_VAR]: "service-token" },
    { [RUNTIME_URL_VAR]: "https://runtime.example" },
  ]) {
    assert.deepEqual(
      await resendConfirmationCodeWith({ email: "a@example.com", clientIp: "198.51.100.42" }, { env, fetchImpl: countingFetch }),
      { kind: "unavailable" },
    );
  }
  assert.deepEqual(
    await resendConfirmationCodeWith({ email: "a@example.com", clientIp: null }, { env: ENDPOINT_ENV, fetchImpl: countingFetch }),
    { kind: "unavailable" },
  );
  assert.equal(sent, 0, "a request was sent with no runtime, no token, or no address to key the wall on");

  // A NETWORK FAILURE and a body that is not JSON are the same answer: nothing
  // was decided, so nothing may be claimed.
  assert.deepEqual(
    await resendConfirmationCodeWith(
      { email: "a@example.com", clientIp: "198.51.100.42" },
      { env: ENDPOINT_ENV, fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch },
    ),
    { kind: "unavailable" },
  );
  assert.deepEqual(
    await resendConfirmationCodeWith(
      { email: "a@example.com", clientIp: "198.51.100.42" },
      { env: ENDPOINT_ENV, fetchImpl: (async () => new Response("<html>gateway</html>", { status: 200 })) as typeof fetch },
    ),
    { kind: "unavailable" },
  );
});

test("THE PRODUCTION DEFAULT REFUSES rather than fakes a send when the runtime is unconfigured", async () => {
  const response = await withEnv(
    { [RUNTIME_URL_VAR]: undefined, [SERVICE_TOKEN_VAR]: undefined },
    () => handleConfirmationResendPost(postRequest([["email", "aisyah@example.com"]])),
    // No second argument: this exercises the REAL production seam.
  );
  assert.equal(response.status, 303);
  assert.equal(flashPayload(response).kind, "resend-unavailable");
});
