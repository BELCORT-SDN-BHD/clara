// #622 review round — the writer/reader tie-together this file pins: every
// `/forgot-password?status=` value `handlePasswordRecovery` can actually
// redirect to must be accepted by `parseRecoveryLinkStatus`, the SAME guard
// `forgot-password/page.tsx` reads the query param through. A status the
// handler emits that the parser does not recognise would render NO banner
// at all — a silent failure this cell is what catches, rather than trusting
// the shared TypeScript union alone (a stray `as` cast, or a value read off
// `status` rather than `code`, would not show up as a type error).
//
// DRIVES THE REAL `handlePasswordRecovery`, never a re-typed copy of its
// classification (review law 3): each provider error shape below is exactly
// what `tests/password-recovery-handler.test.ts` already pins as producing
// a SPECIFIC status; this file's own job is only the second half — that
// whatever status comes out the other end is one `parseRecoveryLinkStatus`
// actually accepts.

import "./next-runtime-globals";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handlePasswordRecovery, type PasswordRecoveryRouteClient } from "../app/(entry)/auth/recover/handler";
import {
  RECOVERY_LINK_STATUSES,
  parseRecoveryLinkFailure,
  parseRecoveryLinkStatus,
} from "../lib/auth/recovery-link-status";

type Exchange = Awaited<ReturnType<PasswordRecoveryRouteClient["supabase"]["auth"]["exchangeCodeForSession"]>>;

function client(result: Exchange) {
  return {
    create: async (): Promise<PasswordRecoveryRouteClient> => ({
      supabase: { auth: { exchangeCodeForSession: async () => result } },
      sealResponse: (response) => response,
    }),
  };
}

async function statusFor(result: Exchange): Promise<string | null> {
  const response = await handlePasswordRecovery(
    new Request("https://internal.example/auth/recover?code=some-code"),
    client(result).create,
  );
  const location = response.headers.get("location");
  assert.ok(location, "every failure branch redirects somewhere");
  return new URL(location!).searchParams.get("status");
}

describe("every status handlePasswordRecovery can emit is accepted by parseRecoveryLinkStatus", () => {
  const cases: Array<{ readonly name: string; readonly result: Exchange }> = [
    { name: "flow_state_expired (422)", result: { data: { session: null }, error: { message: "x", code: "flow_state_expired", status: 422 } } },
    { name: "otp_expired", result: { data: { session: null }, error: { message: "x", code: "otp_expired" } } },
    { name: "flow_state_not_found (404)", result: { data: { session: null }, error: { message: "x", code: "flow_state_not_found", status: 404 } } },
    { name: "bad_code_verifier (400)", result: { data: { session: null }, error: { message: "x", code: "bad_code_verifier", status: 400 } } },
    { name: "over_request_rate_limit (429)", result: { data: { session: null }, error: { message: "x", code: "over_request_rate_limit", status: 429 } } },
    { name: "status-only fallback (422, no code)", result: { data: { session: null }, error: { message: "x", status: 422 } } },
    { name: "unrecognised code", result: { data: { session: null }, error: { message: "x", code: "something_new" } } },
    { name: "no error, no session", result: { data: { session: null }, error: null } },
  ];

  for (const { name, result } of cases) {
    it(`${name} produces a status the parser accepts`, async () => {
      const status = await statusFor(result);
      assert.notEqual(status, null, "the redirect must carry a status query param at all");
      assert.notEqual(
        parseRecoveryLinkStatus(status),
        null,
        `handlePasswordRecovery emitted status=${status}, which parseRecoveryLinkStatus does not recognise — the writer and the reader have drifted apart`,
      );
    });
  }

  it("VACUITY CONTROL: the parser genuinely rejects a status nobody emits", () => {
    assert.equal(parseRecoveryLinkStatus("something-nobody-emits"), null);
    assert.equal(parseRecoveryLinkStatus(undefined), null);
    assert.equal(parseRecoveryLinkStatus(null), null);
  });

  it("the four classified failures are also accepted by the narrower parseRecoveryLinkFailure — `invalid` is deliberately NOT", () => {
    for (const failure of RECOVERY_LINK_STATUSES) {
      if (failure === "invalid") {
        assert.equal(parseRecoveryLinkFailure(failure), null, "`invalid` is the generic bucket, not a classified link failure");
      } else {
        assert.equal(parseRecoveryLinkFailure(failure), failure);
      }
    }
  });
});
