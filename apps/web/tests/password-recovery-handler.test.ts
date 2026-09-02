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
