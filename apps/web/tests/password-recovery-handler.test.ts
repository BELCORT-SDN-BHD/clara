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
});
