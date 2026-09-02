import assert from "node:assert/strict";
import { test } from "node:test";

import { NextResponse } from "next/server";

import {
  handleEmailConfirmationPost,
  type EmailConfirmationRouteClient,
} from "../../app/(entry)/auth/confirm/verify/handler";
import {
  confirmEmailCodeWith,
  type ConfirmEmailCode,
  type ConfirmEmailCodeParams,
  type ConfirmationOutcome,
} from "../../app/(entry)/auth/confirm/verify/confirmation-wall";
import { confirmFlashCookie } from "../../app/(entry)/auth/confirm/confirm-flash";
import {
  AUTH_WALL_CLIENT_IP_HEADER,
  PEPPER_VAR,
  TRUSTED_HEADER_VAR,
} from "../../lib/rate-wall/courier";

// This file stays scoped to the confirm POST handler's own walls —
// `proveSameOrigin`, the C1/C2 wall seam, and the refusal-flash mechanism
// (N1 CLOSED, 裁-109). Two SIBLING files split off the estate's 500-line
// document gate: `email-confirmation-page.test.tsx` (the GET page /
// `confirmCodeState` itself — W-H, the flash-marker bounds), and
// `email-confirmation-signup-route.test.tsx` (the confirm→cookie→/signup
// integration and the confirmed-user gate `SignupStep` enforces).
//
// FS-4 C-6 Lane B REPOINTED THE HARNESS, not the intent. The handler no
// longer calls `verifyOtp` itself: C-5's A-M3 fix does claim → verify →
// settle in ONE runtime request, so what this file drives is the ONE seam
// (`confirmEmailCode`) and what it asserts about "never reached the
// verification" is now "never reached the WALL" — the same property one
// boundary further out, and a stronger one, because a request that never
// reaches the wall also never spends an attempt.

const ACCESS = "cookie-session-token";
const REFRESH = "cookie-refresh-token";

type SetSessionResult = Awaited<
  ReturnType<EmailConfirmationRouteClient["supabase"]["auth"]["setSession"]>
>;

const sessionInstalled = (): SetSessionResult => ({
  data: { session: { access_token: ACCESS } },
  error: null,
});

/** The wall's own "verified" answer — every test that must reach the cookie
 *  seal passes this explicitly, because the production default refuses
 *  (`{kind:"unavailable"}`) whenever the runtime is unconfigured, which is
 *  what an un-deployed test process always is. */
const verifiedWall = (remaining = 5): ConfirmationOutcome => ({
  kind: "verified",
  session: { accessToken: ACCESS, refreshToken: REFRESH },
  remaining,
});

/** A wall stub that RECORDS what the handler asked it. The recording is the
 *  point: `params.clientIp` is the M1 field, and a cell that only checked the
 *  outcome would never notice the handler feeding it the `Origin` header. */
function recordingWall(
  outcome: ConfirmationOutcome,
  seen: ConfirmEmailCodeParams[],
): ConfirmEmailCode {
  return async (params) => {
    seen.push(params);
    return outcome;
  };
}

function postRequest(
  fields: Array<[string, string]>,
  extraHeaders: Record<string, string> = {},
): Request {
  const form = new FormData();
  for (const [key, value] of fields) form.append(key, value);
  return new Request("https://app.clarabook.example/auth/confirm/verify", {
    method: "POST",
    headers: {
      origin: "https://app.clarabook.example",
      host: "app.clarabook.example",
      "sec-fetch-site": "same-origin",
      ...extraHeaders,
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
    headers: { origin, host: "internal.worker.local", "sec-fetch-site": "same-origin" },
    body: form,
  });
}

async function withEnv<T>(
  patch: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
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

const withPublicOrigins = (value: string | undefined, run: () => Promise<unknown>) =>
  withEnv({ CLARA_PUBLIC_ORIGINS: value }, run);

/** Records every `setSession` call, so "did a session get installed" is a
 *  positive observation rather than an inference from the redirect target. */
function fakeClient(
  result: SetSessionResult,
  installs: Array<{ access_token: string; refresh_token: string }>,
  sealed: Response[],
): EmailConfirmationRouteClient {
  return {
    supabase: {
      auth: {
        setSession: async (params) => {
          installs.push(params);
          return result;
        },
      },
    },
    sealResponse(response) {
      sealed.push(response);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    },
  };
}

/**
 * N1 (裁-109) — every refusal redirects to `/auth/confirm?flash=<nonce>` with
 * the real outcome in an httpOnly cookie, not the URL. These two helpers are
 * the ONLY way this file reads either half, so every test below asserts
 * against the SAME instrument `page.tsx` itself uses (`confirmFlashCookie`'s
 * name), never a re-typed guess at the cookie's shape (review law 3).
 */
function locationFlashNonce(response: Response): string {
  const location = response.headers.get("location");
  assert.ok(location, "no redirect Location header");
  const url = new URL(location);
  assert.equal(url.origin, "https://app.clarabook.example");
  assert.equal(url.pathname, "/auth/confirm");
  assert.deepEqual(
    [...url.searchParams.keys()],
    ["flash"],
    "the redirect URL must carry ONLY the flash marker — no status, remaining, or wait",
  );
  const nonce = url.searchParams.get("flash");
  assert.ok(typeof nonce === "string" && nonce.length > 0, "the flash marker must be non-empty");
  return nonce;
}

function readFlashPayload(response: Response): unknown {
  const raw = (response as NextResponse).cookies.get(confirmFlashCookie().name)?.value;
  assert.ok(raw, "no flash cookie was set on the redirect");
  return JSON.parse(raw);
}

test("THE PRODUCTION SEAM REFUSES rather than fakes success when the runtime is unreachable", async () => {
  const installs: Array<{ access_token: string; refresh_token: string }> = [];
  const response = await withEnv(
    { CLARA_RUNTIME_URL: undefined, CLARA_AUTH_WALL_SERVICE_TOKEN: undefined },
    () =>
      handleEmailConfirmationPost(
        postRequest(confirmFields()),
        async () => fakeClient(sessionInstalled(), installs, []),
        // No third argument: exercises the REAL production seam.
      ),
  );
  assert.deepEqual(installs, [], "a session was installed with no wall verdict at all");
  assert.equal(response.status, 303);
  const nonce = locationFlashNonce(response);
  assert.deepEqual(readFlashPayload(response), { nonce, kind: "unavailable" });
});

test("M1 — the handler feeds the wall the TRUSTED-HEADER address, never the Origin header", async () => {
  // The defect this cell exists for: `proveSameOrigin`'s proof is the browser's
  // `Origin`, IDENTICAL for every visitor to one deployment. Keying C2 on it
  // means five rejected guesses from anyone lock out every applicant's signup.
  const seen: ConfirmEmailCodeParams[] = [];
  await withEnv({ [TRUSTED_HEADER_VAR]: "CF-Connecting-IP", [PEPPER_VAR]: "p" }, () =>
    handleEmailConfirmationPost(
      postRequest(confirmFields(), { "cf-connecting-ip": "198.51.100.42" }),
      async () => fakeClient(sessionInstalled(), [], []),
      recordingWall(verifiedWall(), seen),
    ),
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.clientIp, "198.51.100.42");
  assert.notEqual(seen[0]?.clientIp, "https://app.clarabook.example");
});

test("M1 — an absent or unparseable trusted header hands the wall `null`, never a stand-in", async () => {
  for (const [label, headers] of [
    ["absent", {}],
    ["blank", { "cf-connecting-ip": "" }],
    ["not an address", { "cf-connecting-ip": "app.clarabook.example" }],
  ] as const) {
    const seen: ConfirmEmailCodeParams[] = [];
    await withEnv({ [TRUSTED_HEADER_VAR]: "CF-Connecting-IP" }, () =>
      handleEmailConfirmationPost(
        postRequest(confirmFields(), headers),
        async () => fakeClient(sessionInstalled(), [], []),
        recordingWall({ kind: "unavailable" }, seen),
      ),
    );
    assert.equal(seen[0]?.clientIp, null, label);
  }
  // And with the header NAME unconfigured, likewise.
  const seen: ConfirmEmailCodeParams[] = [];
  await withEnv({ [TRUSTED_HEADER_VAR]: undefined }, () =>
    handleEmailConfirmationPost(
      postRequest(confirmFields(), { "cf-connecting-ip": "198.51.100.42" }),
      async () => fakeClient(sessionInstalled(), [], []),
      recordingWall({ kind: "unavailable" }, seen),
    ),
  );
  assert.equal(seen[0]?.clientIp, null, "unconfigured header name");
});

test("a VERIFIED wall installs exactly one session and redirects to the fixed /signup", async () => {
  const installs: Array<{ access_token: string; refresh_token: string }> = [];
  const sealed: Response[] = [];
  const seen: ConfirmEmailCodeParams[] = [];
  const response = await handleEmailConfirmationPost(
    // The extra field is hostile input: it must reach neither the wall nor the
    // session install.
    postRequest([...confirmFields(), ["extra", "hostile-value"]]),
    async () => fakeClient(sessionInstalled(), installs, sealed),
    recordingWall(verifiedWall(), seen),
  );

  assert.deepEqual(
    seen.map((p) => ({ email: p.email, token: p.token })),
    [{ email: "aisyah@example.com", token: "123456" }],
  );
  assert.deepEqual(installs, [{ access_token: ACCESS, refresh_token: REFRESH }]);
  assert.equal(sealed.length, 1, "the cookie-writing response was not sealed against caching");
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://app.clarabook.example/signup");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("a session the client could NOT install renders `unavailable`, never `wrong`", async () => {
  // The code is spent — a Supabase OTP is single use and the runtime already
  // settled the attempt `accepted`. "That code didn't work" would be false and
  // would send the person to burn another one; this failure is ours.
  for (const result of [
    { data: { session: null }, error: null },
    { data: { session: { access_token: "" } }, error: null },
    { data: { session: { access_token: ACCESS } }, error: { message: "cookie jar unavailable" } },
  ] as SetSessionResult[]) {
    const response = await handleEmailConfirmationPost(
      postRequest(confirmFields()),
      async () => fakeClient(result, [], []),
      async () => verifiedWall(),
    );
    const nonce = locationFlashNonce(response);
    assert.deepEqual(readFlashPayload(response), { nonce, kind: "unavailable" });
  }
});

test("`wrong` renders the wall's own remaining, and installs no session", async () => {
  const installs: Array<{ access_token: string; refresh_token: string }> = [];
  const response = await handleEmailConfirmationPost(
    postRequest(confirmFields()),
    async () => fakeClient(sessionInstalled(), installs, []),
    async () => ({ kind: "wrong", remaining: 3 }),
  );
  const nonce = locationFlashNonce(response);
  assert.deepEqual(readFlashPayload(response), { nonce, kind: "wrong", remaining: 3 });
  assert.deepEqual(installs, [], "a failed verification installed a session");
});

test("locked renders its own distinct flash and installs no session", async () => {
  for (const scope of ["email", "origin"] as const) {
    const installs: Array<{ access_token: string; refresh_token: string }> = [];
    const locked = await handleEmailConfirmationPost(
      postRequest(confirmFields()),
      async () => fakeClient(sessionInstalled(), installs, []),
      async () => ({ kind: "locked", scope, retryAfterSeconds: 300 }),
    );
    const nonce = locationFlashNonce(locked);
    assert.deepEqual(readFlashPayload(locked), { nonce, kind: "locked", waitSeconds: 300 });
    assert.deepEqual(installs, []);
  }
});

test("FOLD 4 + F1: the cookie's own SECURITY ATTRIBUTES are pinned, not just its lifetime", async () => {
  // F1, MEDIUM — the ENTIRE N1 unforgeability claim rests on httpOnly +
  // sameSite:"strict" + secure. Mutant-tested by the reviewer: delete
  // httpOnly, or set secure:false, and every OTHER test in this file stays
  // green. Without this cell the forgery wall could be deleted in silence —
  // and in production, secure:false with the __Host- name breaks
  // FUNCTIONALLY too (the browser rejects the cookie outright).
  // `secure: true` is a deliberate literal, not `confirmFlashCookie().secure`
  // (tautological) — true only because this process resolves the PROD branch
  // under NODE_ENV=test; red then reads "secure mismatch", not "wrong env".
  const response = await handleEmailConfirmationPost(
    postRequest(confirmFields()),
    async () => fakeClient(sessionInstalled(), [], []),
    async () => ({ kind: "locked", scope: "origin", retryAfterSeconds: 300 }),
  );
  const cookie = (response as NextResponse).cookies.get(confirmFlashCookie().name);
  assert.ok(cookie, "no flash cookie was set");
  assert.deepEqual(
    { httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, secure: cookie.secure, path: cookie.path, maxAge: cookie.maxAge },
    // min(300, 900) + 60 = 360 — see confirm-flash.ts's confirmFlashMaxAgeSeconds.
    { httpOnly: true, sameSite: "strict", secure: true, path: "/", maxAge: 360 },
  );
});

test("NEW-B: a proxied confirmation derives authority from CLARA_PUBLIC_ORIGINS and fails closed when unset", async () => {
  const seen: ConfirmEmailCodeParams[] = [];
  let clientCreations = 0;
  const createClient = async () => {
    clientCreations += 1;
    return fakeClient(sessionInstalled(), [], []);
  };

  await withPublicOrigins(undefined, async () => {
    const refused = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
      recordingWall(verifiedWall(), seen),
    );
    assert.equal(refused.status, 403, "unset must refuse instead of trusting the rewritten hop");
    assert.equal(clientCreations, 0, "the fail-closed arm must refuse before constructing the auth client");
    assert.deepEqual(seen, []);
  });

  await withPublicOrigins("https://app.clarabook.example", async () => {
    const allowed = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
      recordingWall(verifiedWall(), seen),
    );
    assert.equal(allowed.status, 303, "the operator-named public origin must remain usable behind the proxy");
    assert.equal(
      allowed.headers.get("location"),
      "https://app.clarabook.example/signup",
      "the redirect must be built from the PROVEN Origin, never request.url's authority (PR 455 MEDIUM-2)",
    );
    assert.equal(clientCreations, 1, "the configured positive control must reach the auth client exactly once");
    assert.equal(seen.length, 1);
  });
});

test("NEW-B: Origin null is 403 while a real allowlisted Origin succeeds", async () => {
  const seen: ConfirmEmailCodeParams[] = [];
  let clientCreations = 0;
  const createClient = async () => {
    clientCreations += 1;
    return fakeClient(sessionInstalled(), [], []);
  };

  await withPublicOrigins("https://app.clarabook.example", async () => {
    const refused = await handleEmailConfirmationPost(
      proxiedPostRequest("null"),
      createClient,
      recordingWall(verifiedWall(), seen),
    );
    assert.equal(refused.status, 403, "an opaque Origin must never enter the code-consuming route");
    assert.equal(clientCreations, 0, "Origin null must refuse before constructing the auth client");
    assert.deepEqual(seen, []);

    const allowed = await handleEmailConfirmationPost(
      proxiedPostRequest("https://app.clarabook.example"),
      createClient,
      recordingWall(verifiedWall(), seen),
    );
    assert.equal(allowed.status, 303, "the same configured wall must admit a real public Origin");
    assert.equal(clientCreations, 1, "the positive control must prove the observer can fire");
    assert.equal(seen.length, 1);
  });
});

test("N1: a malformed submission redirects to the invalid flash and never reaches the wall", async () => {
  const seen: ConfirmEmailCodeParams[] = [];
  const wall = recordingWall(verifiedWall(), seen);

  const missing = await handleEmailConfirmationPost(
    postRequest([["email", "aisyah@example.com"]]),
    async () => fakeClient(sessionInstalled(), [], []),
    wall,
  );
  const missingNonce = locationFlashNonce(missing);
  assert.deepEqual(readFlashPayload(missing), { nonce: missingNonce, kind: "invalid" });

  const duplicated = await handleEmailConfirmationPost(
    postRequest([...confirmFields(), ["token", "999999"]]),
    async () => fakeClient(sessionInstalled(), [], []),
    wall,
  );
  const duplicatedNonce = locationFlashNonce(duplicated);
  assert.deepEqual(readFlashPayload(duplicated), { nonce: duplicatedNonce, kind: "invalid" });

  assert.deepEqual(seen, [], "a malformed submission must not consume a wall attempt");
});
