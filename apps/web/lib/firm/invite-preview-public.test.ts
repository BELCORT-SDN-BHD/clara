// #871 — the SIGNED-OUT invite preview reader, unit-tested at its own seam.
//
// The seam is `readPublicInvitePreview({ token, clientIp }, deps)`: a SERVER-ONLY courier to the
// runtime's `POST /api/invite-preview`, on the same shape `app/(entry)/auth/confirm/verify/
// confirmation-wall.ts` already uses for the other pre-session hop. `fetchImpl` and `env` are the
// only seams; there is none for the outcome.
//
// WHAT THESE CELLS EXIST TO PIN. Everything that could turn "we could not read the invitation"
// into "this invitation is bad", and everything that could put a credential or a token somewhere
// it does not belong:
//   * a refusal from the runtime (404) is a DEFINITE `not_previewable`, and every other failure —
//     unconfigured, unauthorised, 5xx, a timeout, a body this build will not act on, a rate
//     refusal — is INDEFINITE, because a reader that could not read is not a verdict;
//   * the service token never reaches the browser and never reaches a URL: it is an
//     `Authorization` header on a server-to-server POST and nothing else;
//   * the invite token travels in the BODY, never in the path or the query.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INVITE_PREVIEW_ENDPOINT_PATH,
  RUNTIME_URL_VAR,
  SERVICE_TOKEN_VAR,
  readPublicInvitePreview,
} from "./invite-preview-public";
import { AUTH_WALL_CLIENT_IP_HEADER } from "@/lib/rate-wall-courier";

const ENV = {
  [RUNTIME_URL_VAR]: "https://runtime.test",
  [SERVICE_TOKEN_VAR]: "service-token-fixture",
};

const PREVIEW = {
  firm_name: "LARKIN & CO",
  role: "bookkeeper",
  status: "pending",
  masked_email: "n***@larkin.test",
};

/** A fetch stand-in that records the ONE call it was given and answers a canned response. */
function stubFetch(response: { status: number; body?: unknown; throws?: boolean }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (response.throws) throw new Error("network down");
    return new Response(response.body === undefined ? "" : JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("p871.web.preview: a 200 preview is a DEFINITE ok, and the request carries the token in the BODY with the service token as a header", async () => {
  const { impl, calls } = stubFetch({ status: 200, body: { outcome: "preview", preview: PREVIEW } });
  const outcome = await readPublicInvitePreview(
    { token: "clara-invite-token", clientIp: "203.0.113.7" },
    { fetchImpl: impl, env: ENV },
  );

  assert.deepEqual(outcome, { ok: true, preview: PREVIEW });
  assert.equal(calls.length, 1, "exactly one hop");
  const call = calls[0];
  assert.ok(call, "the one hop was recorded");
  assert.equal(call.url, `https://runtime.test${INVITE_PREVIEW_ENDPOINT_PATH}`);
  assert.equal(call.init.method, "POST");
  // THE TOKEN IS IN THE BODY. A token in the URL would land in the runtime's access log, in every
  // intermediary's, and in the `Referer` of anything the page links to.
  assert.equal(call.url.includes("clara-invite-token"), false, "the token is never in the URL");
  assert.deepEqual(JSON.parse(String(call.init.body)), { token: "clara-invite-token" });
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer service-token-fixture");
  assert.equal(headers[AUTH_WALL_CLIENT_IP_HEADER], "203.0.113.7", "this app forwards the address its OWN edge observed");
  assert.equal(call.init.cache, "no-store", "a preview is never served from a cache");
});

test("p871.web.preview: a 404 is the DEFINITE single refusal -- and it is the only status that is", async () => {
  const { impl } = stubFetch({ status: 404, body: { outcome: "not_previewable" } });
  const outcome = await readPublicInvitePreview(
    { token: "t", clientIp: "203.0.113.7" },
    { fetchImpl: impl, env: ENV },
  );
  assert.deepEqual(outcome, { ok: false, kind: "not_previewable" });
});

test("p871.web.preview: every OTHER failure is INDEFINITE -- a reader that could not read is not a verdict", async () => {
  // #1095 -- a rate refusal is INDEFINITE too, but it carries a `retryAfterSeconds` the other
  // reasons do not, so it has its own test group below rather than this shared-shape loop.
  const cases: [string, Parameters<typeof stubFetch>[0], string][] = [
    ["a dormant lane", { status: 503, body: { outcome: "unavailable" } }, "transport"],
    ["an unauthorised caller", { status: 401, body: { error: "unauthorized" } }, "transport"],
    ["a server error", { status: 500, body: { error: "boom" } }, "transport"],
    ["a thrown network", { status: 0, throws: true }, "transport"],
    ["a 200 whose body is not the door's", { status: 200, body: { outcome: "preview", preview: { firm_name: "x" } } }, "unreadable"],
    ["a 200 with no outcome at all", { status: 200, body: { hello: "world" } }, "unreadable"],
  ];
  for (const [label, response, reason] of cases) {
    const { impl } = stubFetch(response);
    const outcome = await readPublicInvitePreview(
      { token: "t", clientIp: "203.0.113.7" },
      { fetchImpl: impl, env: ENV },
    );
    assert.deepEqual(outcome, { ok: false, kind: "indefinite", reason }, label);
  }
});

// #1095 -- THE RATE-LIMITED WAIT, CARRIED THROUGH. The runtime route
// (`packages/runtime/src/invitePreviewRoutes.ts`) answers a 429 with `{outcome:"rate_limited",
// retryAfterSeconds}`, the door's OWN number from its 15-minute/5-reload wall
// (`0309_invite_preview_public_door.sql`), already clamped to [0,900]. This courier used to
// discard it entirely (`indefinite("rate_limited")`, no payload); the invite landing page could
// not have told a visitor how long to wait even though the runtime had already computed it.
// The clamp-and-flag rule is the ONE shared owner every pre-session wait on this app already
// uses -- `app/(entry)/auth/confirm/wait-seconds.ts`'s `waitSeconds` -- reused here rather than a
// second copy of "an over-long wait is clamped and flagged, never downgraded".
test("p871.web.preview: a rate refusal carries the door's own retryAfterSeconds through, verbatim", async () => {
  const { impl } = stubFetch({ status: 429, body: { outcome: "rate_limited", retryAfterSeconds: 47 } });
  const outcome = await readPublicInvitePreview(
    { token: "t", clientIp: "203.0.113.7" },
    { fetchImpl: impl, env: ENV },
  );
  assert.deepEqual(outcome, { ok: false, kind: "indefinite", reason: "rate_limited", retryAfterSeconds: 47 },
    "no atLeast key when the wait is inside the display ceiling");
});

test("p871.web.preview: a rate refusal's over-long wait is CLAMPED to the display ceiling and FLAGGED, never downgraded", async () => {
  const { impl } = stubFetch({ status: 429, body: { outcome: "rate_limited", retryAfterSeconds: 3600 } });
  const outcome = await readPublicInvitePreview(
    { token: "t", clientIp: "203.0.113.7" },
    { fetchImpl: impl, env: ENV },
  );
  assert.deepEqual(outcome,
    { ok: false, kind: "indefinite", reason: "rate_limited", retryAfterSeconds: 900, atLeast: true },
    "clamped to the 900s ceiling, never turned into a different outcome -- the wall answered perfectly");
});

test("p871.web.preview: a missing or unusable rate-limit wait still tells a true story -- the wall's own 900s ceiling", async () => {
  const cases: [string, Parameters<typeof stubFetch>[0]][] = [
    ["no retryAfterSeconds at all", { status: 429, body: { outcome: "rate_limited" } }],
    ["a non-number retryAfterSeconds", { status: 429, body: { outcome: "rate_limited", retryAfterSeconds: "47" } }],
    ["a negative retryAfterSeconds", { status: 429, body: { outcome: "rate_limited", retryAfterSeconds: -5 } }],
    ["an unparseable 429 body", { status: 429 }],
  ];
  for (const [label, response] of cases) {
    const { impl } = stubFetch(response);
    const outcome = await readPublicInvitePreview(
      { token: "t", clientIp: "203.0.113.7" },
      { fetchImpl: impl, env: ENV },
    );
    assert.deepEqual(outcome, { ok: false, kind: "indefinite", reason: "rate_limited", retryAfterSeconds: 900 },
      `${label}: the honest ceiling of the wall this route stands in front of, not a shorter guess`);
  }
});

test("p871.web.preview: an unknown role or status is UNREADABLE, never rendered -- this app denies rather than guessing", async () => {
  for (const bad of [
    { ...PREVIEW, role: "auditor" },
    { ...PREVIEW, status: "quarantined" },
    { ...PREVIEW, firm_name: "" },
    { ...PREVIEW, masked_email: "   " },
  ]) {
    const { impl } = stubFetch({ status: 200, body: { outcome: "preview", preview: bad } });
    const outcome = await readPublicInvitePreview(
      { token: "t", clientIp: "203.0.113.7" },
      { fetchImpl: impl, env: ENV },
    );
    assert.deepEqual(outcome, { ok: false, kind: "indefinite", reason: "unreadable" }, JSON.stringify(bad));
  }
});

test("p871.web.preview: with no runtime URL, no service token, no client address or no token, NOTHING is sent", async () => {
  const cases: [string, Record<string, string>, { token: string; clientIp: string | null }][] = [
    ["no runtime URL", { [SERVICE_TOKEN_VAR]: "s" }, { token: "t", clientIp: "203.0.113.7" }],
    ["no service token", { [RUNTIME_URL_VAR]: "https://runtime.test" }, { token: "t", clientIp: "203.0.113.7" }],
    ["no client address", ENV, { token: "t", clientIp: null }],
    ["no invite token", ENV, { token: "", clientIp: "203.0.113.7" }],
    ["a blank invite token", ENV, { token: "   ", clientIp: "203.0.113.7" }],
  ];
  for (const [label, env, params] of cases) {
    const { impl, calls } = stubFetch({ status: 200, body: { outcome: "preview", preview: PREVIEW } });
    const outcome = await readPublicInvitePreview(params, { fetchImpl: impl, env });
    assert.equal(outcome.ok, false, label);
    assert.equal(calls.length, 0, `${label}: the request is refused BEFORE the wire`);
  }
});
