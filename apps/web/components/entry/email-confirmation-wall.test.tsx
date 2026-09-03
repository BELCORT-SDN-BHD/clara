import assert from "node:assert/strict";
import { test } from "node:test";

import {
  confirmEmailCodeWith,
} from "../../app/(entry)/auth/confirm/verify/confirmation-wall";
import { AUTH_WALL_CLIENT_IP_HEADER } from "../../lib/rate-wall-courier";

// THE CONFIRM WALL SEAM ITSELF — `confirmEmailCodeWith`, driven directly
// against C-5's `POST /api/auth-wall/confirm` contract with a substituted
// fetch. Split from `email-confirmation.test.tsx` (which owns the HANDLER's
// walls) under the estate's 500-line document gate.
//
// WHAT THESE CELLS ARE FOR. This seam is the only place in `apps/web` that
// decides what a runtime answer MEANS, and every wrong reading of it is a
// security defect rather than a cosmetic one: a 503 read as an allow is the
// rate wall bypassed; a "verified" with no session is a person sent onward
// with no cookie; a body field naming WHY a code failed, if it were ever
// read, is 裁-109's N3 oracle back. Each cell below drives the SHIPPED
// function, never a copy of its predicate (裁-107).

const ACCESS = "cookie-session-token";
const REFRESH = "cookie-refresh-token";

test("confirmEmailCode fails closed on every missing piece of configuration", async () => {
  const params = { email: "aisyah@example.com", token: "123456", clientIp: "203.0.113.7" };
  const never: typeof fetch = async () => {
    throw new Error("fetch must not be reached on a fail-closed arm");
  };
  // No runtime URL, no service token, and no client address — each on its own
  // is enough to refuse, and none of them is ever an "allow".
  for (const env of [
    { CLARA_AUTH_WALL_SERVICE_TOKEN: "t" },
    { CLARA_RUNTIME_URL: "https://runtime.example" },
    { CLARA_RUNTIME_URL: "   ", CLARA_AUTH_WALL_SERVICE_TOKEN: "t" },
    { CLARA_RUNTIME_URL: "https://runtime.example", CLARA_AUTH_WALL_SERVICE_TOKEN: "  " },
  ]) {
    assert.deepEqual(
      await confirmEmailCodeWith(params, { env, fetchImpl: never }),
      { kind: "unavailable" },
      JSON.stringify(env),
    );
  }
  // The M1 arm: no address means the C2 limb cannot be keyed, so the request
  // is not even sent. Proceeding would key C2 on a constant for the whole
  // deployment — the defect PR #488 already paid for once.
  assert.deepEqual(
    await confirmEmailCodeWith(
      { ...params, clientIp: null },
      {
        env: { CLARA_RUNTIME_URL: "https://runtime.example", CLARA_AUTH_WALL_SERVICE_TOKEN: "t" },
        fetchImpl: never,
      },
    ),
    { kind: "unavailable" },
  );
});

test("A-M3 — the request carries EXACTLY {email, token}; never attempt_id, attemptId or outcome", async () => {
  // The endpoint REFUSES 400 on any of those three, and this app must never be
  // the caller that discovers it. The outcome is the runtime's to derive from
  // its own verification and from nothing a caller sent: a settle this side
  // could reach would let anyone zero out a rate-wall budget (the measurement
  // is in `authWallRoutes.ts`'s header).
  let seen: { url: string; init: RequestInit } | null = null;
  const capture: typeof fetch = async (url, init) => {
    seen = { url: String(url), init: init as RequestInit };
    return new Response(
      JSON.stringify({ allowed: true, verified: true, remaining: 4, session: { access_token: ACCESS, refresh_token: REFRESH } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const outcome = await confirmEmailCodeWith(
    { email: "aisyah@example.com", token: "123456", clientIp: "203.0.113.7" },
    {
      env: { CLARA_RUNTIME_URL: "https://runtime.example/", CLARA_AUTH_WALL_SERVICE_TOKEN: "svc-token" },
      fetchImpl: capture,
    },
  );
  assert.deepEqual(outcome, {
    kind: "verified",
    session: { accessToken: ACCESS, refreshToken: REFRESH },
    remaining: 4,
  });
  const call = seen as unknown as { url: string; init: RequestInit };
  assert.ok(call, "no request was made");
  assert.equal(call.url, "https://runtime.example/api/auth-wall/confirm");
  assert.deepEqual(
    Object.keys(JSON.parse(String(call.init.body))).sort(),
    ["email", "token"],
    "the body must carry exactly the two fields the endpoint accepts",
  );
  const headers = new Headers(call.init.headers);
  assert.equal(headers.get("authorization"), "Bearer svc-token");
  assert.equal(
    headers.get(AUTH_WALL_CLIENT_IP_HEADER),
    "203.0.113.7",
    "the runtime computes the C2 digest from THIS header; without it the endpoint 503s",
  );
});

test("a 429 becomes locked with the door's OWN scope and wait, and neither is recomputed here", async () => {
  const refuse = (body: unknown): typeof fetch => async () =>
    new Response(JSON.stringify(body), { status: 429, headers: { "content-type": "application/json" } });
  const env = { CLARA_RUNTIME_URL: "https://runtime.example", CLARA_AUTH_WALL_SERVICE_TOKEN: "t" };
  const params = { email: "a@b.test", token: "123456", clientIp: "203.0.113.7" };

  assert.deepEqual(
    await confirmEmailCodeWith(params, {
      env,
      fetchImpl: refuse({ allowed: false, remaining: 0, scope: "origin", retry_after_seconds: 837 }),
    }),
    { kind: "locked", scope: "origin", retryAfterSeconds: 837 },
  );

  // OUT-OF-CONTRACT VALUES FAIL CLOSED rather than render. The door's own
  // clamps put `retry_after_seconds` in [0,900] and `scope` in
  // {email,origin}; anything else crossed two process boundaries wrong, and
  // an honest "not working" beats a card claiming a 9-hour lockout.
  for (const body of [
    { allowed: false, remaining: 0, scope: "origin", retry_after_seconds: 901 },
    { allowed: false, remaining: 0, scope: "origin", retry_after_seconds: -1 },
    { allowed: false, remaining: 0, scope: "origin", retry_after_seconds: 12.5 },
    { allowed: false, remaining: 0, scope: "elsewhere", retry_after_seconds: 60 },
    { allowed: false, remaining: 0, retry_after_seconds: 60 },
    { allowed: true, remaining: 0, scope: "origin", retry_after_seconds: 60 },
  ]) {
    assert.deepEqual(
      await confirmEmailCodeWith(params, { env, fetchImpl: refuse(body) }),
      { kind: "unavailable" },
      JSON.stringify(body),
    );
  }
});

test("N3 (裁-109) — every non-verified 200 collapses to `wrong`, whatever else the body says", async () => {
  // The flattening is now STRUCTURAL: the runtime reports a boolean, and this
  // module never reads a reason. This cell is the tripwire for a later lane
  // that starts: extra fields naming WHY are ignored, so a banned account, an
  // expired code and a plain wrong guess are indistinguishable here — which
  // is 裁-109's whole point (N3).
  const env = { CLARA_RUNTIME_URL: "https://runtime.example", CLARA_AUTH_WALL_SERVICE_TOKEN: "t" };
  const params = { email: "a@b.test", token: "123456", clientIp: "203.0.113.7" };
  for (const extra of [
    {},
    { error: "otp_expired" },
    { code: "user_banned" },
    { reason: "no such user", status: 403 },
  ]) {
    const body = { allowed: true, verified: false, remaining: 3, session: null, ...extra };
    assert.deepEqual(
      await confirmEmailCodeWith(params, {
        env,
        fetchImpl: async () =>
          new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
      }),
      { kind: "wrong", remaining: 3 },
      JSON.stringify(extra),
    );
  }
});

test("`verified: true` with no usable session pair is NOT a verification", async () => {
  // A positive check on both tokens, the same property `hasVerifiedSession`
  // enforced against `verifyOtp`'s own result before this hop existed. A
  // session this app cannot seal is not a session, and reporting it verified
  // would send the person to /signup with no cookie.
  const env = { CLARA_RUNTIME_URL: "https://runtime.example", CLARA_AUTH_WALL_SERVICE_TOKEN: "t" };
  const params = { email: "a@b.test", token: "123456", clientIp: "203.0.113.7" };
  for (const session of [
    null,
    {},
    { access_token: ACCESS },
    { refresh_token: REFRESH },
    { access_token: "", refresh_token: REFRESH },
    { access_token: ACCESS, refresh_token: "" },
    { access_token: 7, refresh_token: REFRESH },
  ]) {
    assert.deepEqual(
      await confirmEmailCodeWith(params, {
        env,
        fetchImpl: async () =>
          new Response(JSON.stringify({ allowed: true, verified: true, remaining: 4, session }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      }),
      { kind: "unavailable" },
      JSON.stringify(session),
    );
  }
});

test("a status other than 200/429 is never read as a verdict", async () => {
  const env = { CLARA_RUNTIME_URL: "https://runtime.example", CLARA_AUTH_WALL_SERVICE_TOKEN: "t" };
  const params = { email: "a@b.test", token: "123456", clientIp: "203.0.113.7" };
  // THE FIXTURE CARRIES A COMPLETE SESSION, and that is the whole cell.
  //
  // It did not, and the cell was VACUOUS (review M3): with no `session`, a body
  // that got PAST the status fence still fell to the missing-session branch and
  // returned `unavailable` anyway — so deleting the fence left the cell green.
  // The named gate has to be the ONLY thing that can produce the asserted
  // value (裁-107: a cell that proves a gate discriminates must EXECUTE THE
  // GATE). With both tokens present, only the status fence can.
  const body = {
    allowed: true,
    verified: true,
    remaining: 4,
    session: { access_token: ACCESS, refresh_token: REFRESH },
  };
  // POSITIVE CONTROL, so the six refusals below cannot be the fixture being
  // unusable: the SAME body at 200 is a verification.
  assert.deepEqual(
    await confirmEmailCodeWith(params, {
      env,
      fetchImpl: async () =>
        new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
    }),
    { kind: "verified", session: { accessToken: ACCESS, refreshToken: REFRESH }, remaining: 4 },
    "the fixture cannot verify at 200, so the status assertions below prove nothing",
  );
  for (const status of [400, 401, 403, 500, 502, 503]) {
    assert.deepEqual(
      await confirmEmailCodeWith(params, {
        env,
        fetchImpl: async () =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          }),
      }),
      { kind: "unavailable" },
      `status ${status}`,
    );
  }
  // A transport failure is not a verification either.
  assert.deepEqual(
    await confirmEmailCodeWith(params, {
      env,
      fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
    }),
    { kind: "unavailable" },
  );
});
