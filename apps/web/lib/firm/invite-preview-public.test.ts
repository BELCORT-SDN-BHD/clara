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
  const cases: [string, Parameters<typeof stubFetch>[0], string][] = [
    ["a rate refusal", { status: 429, body: { outcome: "rate_limited", retryAfterSeconds: 60 } }, "rate_limited"],
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

// #1095 FIX ROUND (ADV-L07-01) -- THE WAIT DOES NOT CROSS THIS SEAM, AND THAT IS THE POINT.
// The first cut of #1095 carried the door's `retryAfterSeconds` through to the page. Proved on
// clara_l09 inside a rolled-back transaction: plant five loads of one token under the INVITEE's
// origin digest, then call `clara.preview_invite_by_token` as a first-ever request from a cold
// address, and the door answers `{outcome: rate_limited, retry_after_seconds: 660}` while the
// caller's own origin holds ZERO rows. 0309:461-499 computes each limb's wait independently and
// advertises the MAXIMUM, so the number an anonymous caller would have been shown can belong
// entirely to somebody else's reloads of the same link -- and 900 minus that number is the
// second-resolution timestamp of that party's fifth-oldest load. 0309's own comment withholds the
// `scope` field for exactly this reason ("naming them would tell a prober which of two budgets it
// exhausted"); the wait is the same disclosure by arithmetic.
//
// So the courier keeps the rate refusal as its OWN reason -- the page still renders a distinct
// affordance for it, which is what the ticket asks for -- and carries no number at all. The
// absence is enforced HERE, by type and by this cell, rather than left to whoever next edits the
// component.
test("p871.web.preview: a rate refusal is its own reason and carries NO wait, whatever the door said", async () => {
  for (const body of [
    { outcome: "rate_limited", retryAfterSeconds: 47 },
    { outcome: "rate_limited", retryAfterSeconds: 3600 },
    { outcome: "rate_limited" },
  ]) {
    const { impl } = stubFetch({ status: 429, body });
    const outcome = await readPublicInvitePreview(
      { token: "t", clientIp: "203.0.113.7" },
      { fetchImpl: impl, env: ENV },
    );
    assert.deepEqual(
      outcome,
      { ok: false, kind: "indefinite", reason: "rate_limited" },
      "the rate refusal is distinguishable from transport/unreadable, and carries nothing a prober could read a "
        + "third party's activity out of",
    );
    assert.equal(
      JSON.stringify(outcome).includes("47") || JSON.stringify(outcome).includes("3600"),
      false,
      "no number from the door reaches this seam at all -- not clamped, not flagged, not present",
    );
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
