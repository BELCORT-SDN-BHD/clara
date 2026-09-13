import "./next-runtime-globals";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handlePasswordRecovery, type PasswordRecoveryRouteClient } from "../app/(entry)/auth/recover/handler";

type Exchange = Awaited<ReturnType<PasswordRecoveryRouteClient["supabase"]["auth"]["exchangeCodeForSession"]>>;

function client(result: Exchange) {
  const codes: string[] = [];
  return {
    codes,
    create: async (): Promise<PasswordRecoveryRouteClient> => ({
      supabase: { auth: { exchangeCodeForSession: async (code) => { codes.push(code); return result; } } },
      sealResponse: (response) => response,
    }),
  };
}

describe("password recovery PKCE callback", () => {
  it("exchanges the code server-side and redirects only after a positive session", async () => {
    const stub = client({ data: { session: { access_token: "token" } }, error: null });
    const response = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=one-time-code"), stub.create);
    assert.deepEqual(stub.codes, ["one-time-code"]);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://internal.example/auth/recover/password");
  });

  it("fails closed to a fresh request for rejected or sessionless exchanges", async () => {
    for (const result of [
      { data: { session: null }, error: { message: "expired" } },
      { data: { session: null }, error: null },
    ]) {
      const stub = client(result);
      const response = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=bad"), stub.create);
      assert.equal(response.headers.get("location"), "https://internal.example/forgot-password?status=invalid");
    }
  });

  // #622 — GoTrue's PKCE exchange (`/token?grant_type=pkce`) distinguishes
  // FOUR failure shapes, verified against the current Supabase Auth error
  // catalog via Context7 (`/supabase/auth`, `internal/api/apierrors/
  // errorcode.go` + `_autodocs/api-reference/authentication.md`, 2026-09-13):
  // an unknown/already-consumed code is `flow_state_not_found` (404), an
  // aged-out one is `flow_state_expired` (422), a mismatched verifier is
  // `bad_code_verifier` (400), and the shared per-endpoint wall is
  // `over_request_rate_limit` (429). Collapsing all four to one "invalid"
  // status — the whole redirect vocabulary before this train — buries the
  // ONE actionable distinction each carries (wait, vs. ask again, vs. link
  // is simply dead), so each gets its own `status` and the copy at
  // `/forgot-password` answers with a continuable action for it.
  //
  // `code` is the primary signal (`AuthApiError#code`, the stable field
  // Context7's `errors.ts` snippet documents); `status` is read too, in the
  // same order the brief names them, so a future SDK that stops populating
  // `code` on some path still classifies correctly off the HTTP status GoTrue
  // itself returns for that exact failure.
  describe("#622 — the four PKCE failure shapes each redirect to their own status", () => {
    it("flow_state_expired (422) is `expired` — the code aged out before it was used", async () => {
      const stub = client({
        data: { session: null },
        error: { message: "invalid flow state, flow state has expired", code: "flow_state_expired", status: 422 },
      });
      const response = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=old"), stub.create);
      assert.equal(response.headers.get("location"), "https://internal.example/forgot-password?status=expired");
    });

    it("flow_state_not_found (404) is `used_or_unknown` — distinct from `expired`", async () => {
      const stub = client({
        data: { session: null },
        error: { message: "invalid flow state, no valid flow state found", code: "flow_state_not_found", status: 404 },
      });
      const response = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=gone"), stub.create);
      assert.equal(response.headers.get("location"), "https://internal.example/forgot-password?status=used_or_unknown");
      // The two must actually differ — a classifier that collapsed both codes
      // to the same bucket would still pass the two cells in isolation.
      const expiredStub = client({
        data: { session: null },
        error: { message: "invalid flow state, flow state has expired", code: "flow_state_expired", status: 422 },
      });
      const expiredResponse = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=old"), expiredStub.create);
      assert.notEqual(response.headers.get("location"), expiredResponse.headers.get("location"));
    });

    it("bad_code_verifier (400) is `refused`", async () => {
      const stub = client({
        data: { session: null },
        error: { message: "invalid request: code challenge does not match previously saved code verifier", code: "bad_code_verifier", status: 400 },
      });
      const response = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=wrong-verifier"), stub.create);
      assert.equal(response.headers.get("location"), "https://internal.example/forgot-password?status=refused");
    });

    it("over_request_rate_limit (429) yields a rate_limited-distinct redirect", async () => {
      const stub = client({
        data: { session: null },
        error: { message: "rate limit exceeded", code: "over_request_rate_limit", status: 429 },
      });
      const response = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=too-many"), stub.create);
      assert.equal(response.headers.get("location"), "https://internal.example/forgot-password?status=rate_limited");
    });

    it("an unrecognised code/status still falls back to the generic `invalid` bucket", async () => {
      const stub = client({
        data: { session: null },
        error: { message: "something this build does not recognise", code: "some_future_code", status: 451 },
      });
      const response = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=mystery"), stub.create);
      assert.equal(response.headers.get("location"), "https://internal.example/forgot-password?status=invalid");
    });

    it("falls back to `status` when `code` is absent — the documented shape for an error before a response was received", async () => {
      const stub = client({
        data: { session: null },
        error: { message: "flow state has expired", status: 422 },
      });
      const response = await handlePasswordRecovery(new Request("https://internal.example/auth/recover?code=old"), stub.create);
      assert.equal(response.headers.get("location"), "https://internal.example/forgot-password?status=expired");
    });
  });

  it("RED-BEFORE F1: keeps the callback on the requesting member of a multi-origin allowlist", async () => {
    const stub = client({ data: { session: { access_token: "token" } }, error: null });
    const response = await handlePasswordRecovery(
      new Request("https://second.example/auth/recover?code=one-time-code"),
      stub.create,
      { CLARA_PUBLIC_ORIGINS: "https://first.example, https://second.example" },
    );
    assert.deepEqual(stub.codes, ["one-time-code"]);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://second.example/auth/recover/password");
  });

  it("F1 proxy control: the internal hop lands on the allowlisted origin the Host header addressed", async () => {
    // Behind a front door `request.url` is the INTERNAL http authority. The
    // scheme of the answer comes from the matched allowlist entry — the
    // operator's own statement — not from `x-forwarded-proto`, which this
    // request deliberately does not send.
    const stub = client({ data: { session: { access_token: "token" } }, error: null });
    const response = await handlePasswordRecovery(
      new Request("http://internal.example/auth/recover?code=one-time-code", {
        headers: { host: "second.example" },
      }),
      stub.create,
      { CLARA_PUBLIC_ORIGINS: "https://first.example, https://second.example" },
    );
    assert.deepEqual(stub.codes, ["one-time-code"]);
    assert.equal(response.headers.get("location"), "https://second.example/auth/recover/password");
  });

  it("RED-BEFORE F1: refuses a request origin outside the configured allowlist before exchange", async () => {
    const stub = client({ data: { session: { access_token: "token" } }, error: null });
    const response = await handlePasswordRecovery(
      new Request("https://outside.example/auth/recover?code=one-time-code", {
        headers: { "x-forwarded-host": "first.example", "x-forwarded-proto": "https" },
      }),
      stub.create,
      { CLARA_PUBLIC_ORIGINS: "https://first.example, https://second.example" },
    );
    assert.deepEqual(stub.codes, []);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("location"), null);
    assert.deepEqual(await response.json(), { error: "recovery_origin_not_allowed" });
  });

  it("F1: a forged Host outside the allowlist is refused, and no forwarded header rescues it", async () => {
    // The two headers a caller can write — Host and the forwarded pair — agreeing
    // with each other is not two pieces of evidence (lib/same-origin.ts, N3).
    // Membership of the OPERATOR'S allowlist is the only thing that licenses a
    // redirect target, so this request cannot manufacture one.
    const stub = client({ data: { session: { access_token: "token" } }, error: null });
    const response = await handlePasswordRecovery(
      new Request("http://internal.example/auth/recover?code=one-time-code", {
        headers: {
          host: "outside.example",
          "x-forwarded-host": "second.example",
          "x-forwarded-proto": "https",
        },
      }),
      stub.create,
      { CLARA_PUBLIC_ORIGINS: "https://first.example, https://second.example" },
    );
    assert.deepEqual(stub.codes, []);
    assert.equal(response.status, 403);
  });
});
