import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  readInviteVerification,
  type VerifyOtpLikeResponse,
} from "../lib/invite-verification";

/**
 * Finding 2 (HIGH) — OTP-purpose laundering into an admin account takeover.
 *
 * Two arms are tested here:
 *   a) the fail-closed reading of every verifyOtp result shape, and
 *   b) the STRUCTURAL fact that the invite surface hard-codes `type:
 *      "invite"` and reads no OTP purpose from the request at all. (b) is a
 *      source assertion because the alternative — rendering the client
 *      component and stubbing the SDK — would prove the stub's behaviour,
 *      not the shipped call's.
 */

const SUBJECT = "11111111-2222-3333-4444-555555555555";
const OTHER_SUBJECT = "99999999-8888-7777-6666-555555555555";

function complete(): VerifyOtpLikeResponse {
  return {
    data: {
      user: { id: SUBJECT },
      session: { access_token: "access-token-value", user: { id: SUBJECT } },
    },
    error: null,
  };
}

describe("readInviteVerification — fail-closed arms", () => {
  it("accepts a complete verification and reports the verified subject", () => {
    const result = readInviteVerification(complete());
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.subject, SUBJECT);
    assert.equal(result.ok && result.accessToken, "access-token-value");
  });

  it("rejects the email_change shape: no error, NULL user and NULL session", () => {
    // The reviewer's exploit: this is what a single-confirmation email_change
    // verification returns. The old code saw `error === null` and called it a
    // confirmed invite, leaving the logged-in admin's session in place.
    const result = readInviteVerification({
      data: { user: null, session: null },
      error: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "no-session");
  });

  it("rejects a session without a user", () => {
    const result = readInviteVerification({
      data: {
        user: null,
        session: { access_token: "t", user: { id: SUBJECT } },
      },
      error: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "no-user");
  });

  it("rejects a session with no access token", () => {
    const result = readInviteVerification({
      data: {
        user: { id: SUBJECT },
        session: { access_token: "", user: { id: SUBJECT } },
      },
      error: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "no-access-token");
  });

  it("rejects a user/session subject disagreement", () => {
    const result = readInviteVerification({
      data: {
        user: { id: SUBJECT },
        session: { access_token: "t", user: { id: OTHER_SUBJECT } },
      },
      error: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "subject-mismatch");
  });

  it("rejects an explicit error", () => {
    const result = readInviteVerification({
      data: { user: null, session: null },
      error: { message: "Token has expired or is invalid" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "rejected");
  });

  it("rejects absence — null, undefined and an empty envelope", () => {
    for (const input of [null, undefined, {}, { data: null }]) {
      const result = readInviteVerification(input);
      assert.equal(result.ok, false, `${JSON.stringify(input)} must not verify`);
    }
  });
});

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));

function source(relative: string): string {
  // path.resolve, not `new URL(...)`: the invite route's directory is
  // literally named `[token]`, and brackets are percent-encoded in a URL.
  return readFileSync(resolve(TESTS_DIR, relative), "utf8");
}

describe("the OTP purpose is not caller-controlled", () => {
  const form = source("../components/invite-accept-form.tsx");
  const page = source("../app/invite/[token]/page.tsx");

  it("verifyOtp is called with a hard-coded type: \"invite\"", () => {
    assert.match(form, /type:\s*"invite"/);
  });

  it("no OTP purpose is threaded through the form's props", () => {
    // The old signature was `InviteAcceptForm({ token, type })`, with `type`
    // flowing straight into verifyOtp.
    assert.match(form, /export function InviteAcceptForm\(\{ token \}/);
    assert.doesNotMatch(form, /EmailOtpType/);
  });

  it("the route reads no `type` search param at all", () => {
    assert.doesNotMatch(page, /searchParams/);
    assert.doesNotMatch(page, /EmailOtpType/);
    for (const laundered of ["signup", "recovery", "email_change", "magiclink"]) {
      assert.doesNotMatch(
        page,
        new RegExp(`"${laundered}"`),
        `${laundered} must not be an accepted OTP purpose`,
      );
    }
  });

  it("the password continuation is bound to the verified subject", () => {
    assert.match(form, /verifiedSubject/);
    assert.match(form, /getClaims\(\)/);
    // The refusal branch must sit BEFORE the updateUser CALL in source order
    // (`indexOf("updateUser")` alone would find the prose in this file's own
    // header comment — the call site is what has to be ordered).
    const guardAt = form.indexOf("activeSubject !== verifiedSubject");
    const updateAt = form.indexOf("auth.updateUser(");
    assert.ok(guardAt > -1, "subject binding guard must exist");
    assert.ok(updateAt > -1, "updateUser call must exist");
    assert.ok(
      guardAt < updateAt,
      "the subject check must run before updateUser",
    );
  });

  it("the invite is not consumed without an explicit human act", () => {
    // finding 9: verifying inside useEffect let a link scanner burn the
    // token. The CALL is what must be gone — the header comment explains the
    // history and legitimately names the hook.
    assert.doesNotMatch(form, /useEffect\(/);
    assert.match(form, /onClick=\{\(\) => void handleAcceptInvite\(\)\}/);
    assert.match(form, /confirmSubmit/);
  });
});
