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
  const doors = source("../lib/identity/doors.ts");

  it("verifyOtp is called with a hard-coded type: \"invite\"", () => {
    // NOTE (P4-1): this file-wide match is satisfied by the component's own
    // HEADER PROSE as well as by the call, so on its own it is weak. The cell
    // that actually holds the line is "verifyOtp's OTP purpose is a LITERAL in
    // the call" below, which anchors on `auth.verifyOtp(` and is proven RED
    // under a variable-purpose mutant. Kept as the cheap smoke check it is.
    assert.match(form, /type:\s*"invite"/);
  });

  it("no OTP purpose is threaded through the form's props", () => {
    // The old signature was `InviteAcceptForm({ token, type })`, with `type`
    // flowing straight into verifyOtp.
    //
    // TIGHTENED AT P4-1, NOT RELAXED. This assertion used to be a literal
    // match on the one-prop signature text, `InviteAcceptForm({ token }`.
    // That pinned the SPELLING of a signature as a proxy for the invariant,
    // and spelling is not identity (review law 3): it broke the moment a prop
    // was added for an unrelated reason, and — the half that actually
    // matters — it would have passed a signature that re-introduced `otpType`
    // on a second line, because the prefix still matched. The invariant is
    // now asserted directly, as a CLOSED-WORLD census of the props: a new
    // prop of any name fails this cell until someone states it here.
    const destructured = form.match(/export function InviteAcceptForm\(\{([^}]*)\}/);
    assert.ok(destructured, "the component must destructure its props inline, so this census can read them");
    const props = destructured[1]!
      .split(",")
      .map((entry) => entry.split("=")[0]!.trim())
      .filter((name) => name.length > 0);
    assert.deepEqual(
      [...props].sort(),
      ["createSupabaseClient", "inviteToken", "token"],
      "closed world: `token` is Supabase's token_hash, `inviteToken` is Clara's invite token, "
        + "`createSupabaseClient` is the transport seam — and NO OTP purpose is among them",
    );
    assert.doesNotMatch(form, /EmailOtpType/);
  });

  it("verifyOtp's OTP purpose is a LITERAL in the call, never an identifier", () => {
    // The direct form of the invariant the props census guards from the other
    // side: whatever the props are, the SHIPPED CALL cannot be handed a
    // caller-controlled purpose, because the argument is not a variable.
    //
    // ANCHORED ON `auth.verifyOtp(`, NOT ON `verifyOtp(` — and that distinction
    // is load-bearing, not cosmetic. The component's own header prose contains
    // the string `verifyOtp({ token_hash, type: "invite" })` as documentation
    // (its line 87), which is what a bare-name match finds FIRST. The first
    // round of this cell did exactly that: it read the COMMENT, and stayed
    // GREEN under a mutant that changed the real call at line 227 to
    // `type: otpPurpose`. The mutant is what caught it. This is the same trap
    // the `updateUser` ordering cell below already documents by name, and it
    // is why the call-site count is asserted rather than assumed.
    const calls = [...form.matchAll(/auth\.verifyOtp\(\{([\s\S]*?)\}\)/g)];
    assert.equal(calls.length, 1, "there must be exactly ONE verifyOtp call site to reason about");
    const args = calls[0]![1]!;
    assert.match(args, /type:\s*"invite"/, "the shipped call's purpose is the literal");
    assert.doesNotMatch(
      args,
      /type:\s*[A-Za-z_$]/,
      "the OTP purpose must never be an identifier — that is the laundering hole",
    );
  });

  it("the route accepts NO OTP purpose from the request", () => {
    // TIGHTENED AT P4-1, NOT RELAXED. This used to ban the WORD `searchParams`
    // outright. That was a proxy for the real invariant, and the proxy stopped
    // matching the code once the route began reading ONE search param that is
    // not a purpose at all: CLARA's invite token, the second bearer secret
    // `clara.accept_invite` needs (the two-token note in the page's own
    // header). Banning the word would now force that token into the path
    // segment or a header — neither of which makes an OTP purpose any less
    // reachable. So the invariant is asserted directly instead, and more
    // strictly than the ban was: a CLOSED-WORLD census of every search param
    // the route reads, plus a check on what that one param may be named.
    assert.doesNotMatch(page, /EmailOtpType/);
    for (const laundered of ["signup", "recovery", "email_change", "magiclink"]) {
      assert.doesNotMatch(
        page,
        new RegExp(`"${laundered}"`),
        `${laundered} must not be an accepted OTP purpose`,
      );
    }

    const reads = [...page.matchAll(/query\[([^\]]+)\]/g)].map((m) => m[1]!.trim());
    assert.deepEqual(
      reads,
      ["INVITE_CLARA_TOKEN_PARAM"],
      "exactly ONE search param may be read, and only through its named constant",
    );

    // The constant lives in lib/identity/doors.ts (ruling 2026-08-30: ONE
    // declaration, imported by both the reader here and P4-4's courier), so
    // the census reads its value THERE — following the identifier to its
    // definition rather than trusting the page's spelling of it.
    const declared = doors.match(/export const INVITE_CLARA_TOKEN_PARAM = "([^"]+)"/);
    assert.ok(declared, "the param name must be a single exported constant, so this census can read its value");
    assert.equal(declared[1], "ct", "the ruled parameter name");
    assert.doesNotMatch(
      declared[1]!,
      /^(type|otp|otp_type|signup|recovery|email_change|magiclink|token_hash)$/,
      "the one readable param must not be an OTP purpose (or Supabase's own token_hash) under another name",
    );
    assert.match(
      page,
      /import \{ INVITE_CLARA_TOKEN_PARAM \} from "@\/lib\/identity\/doors"/,
      "the page must IMPORT the constant, never re-type the string (spelling is not identity)",
    );

    // And what the route hands the form is exactly the two tokens — the
    // closing half of the census, so a purpose cannot arrive as a prop either.
    assert.match(
      page,
      /<InviteAcceptForm token=\{token\} inviteToken=\{inviteToken\} \/>/,
      "the form is handed the two tokens and nothing else",
    );
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

  it("accept_invite is reached ONLY after the subject binding and the password write — never before, never in parallel", () => {
    // Ruling 2026-08-30, requirement 1, pinned in SOURCE ORDER as the belt to
    // the two behavioural cells in components/invite-accept-form.test.tsx
    // (a subject mismatch and an incomplete verification each assert the door
    // was never called). Anchored on CALL SITES, not bare names — this file's
    // own `updateUser` cell already documents why: the header prose names all
    // three of these, and a bare-name indexOf finds the comment first.
    const guardAt = form.indexOf("activeSubject !== verifiedSubject");
    const updateAt = form.indexOf("auth.updateUser(");
    const doorAt = form.indexOf("await acceptInvite({");
    assert.ok(guardAt > -1 && updateAt > -1 && doorAt > -1, "all three sites must exist");
    assert.ok(guardAt < doorAt, "the subject binding must run BEFORE the door");
    assert.ok(updateAt < doorAt, "the password write must run BEFORE the door");

    // NOT IN PARALLEL. The door call is awaited, and it is the only
    // `acceptInvite(` call site — a `Promise.all` racing it against the auth
    // calls would satisfy source order while destroying the ordering the
    // ruling is actually about.
    assert.equal(
      [...form.matchAll(/acceptInvite\(\{/g)].length, 1,
      "exactly one accept_invite call site",
    );
    assert.doesNotMatch(form, /Promise\.(all|allSettled|race|any)/, "no branch races the door against anything");

    // And the consumed token is scrubbed only AFTER the door returns.
    const stripAt = form.indexOf("stripInviteTokenFromUrl();");
    assert.ok(stripAt > doorAt, "the URL is scrubbed only after the token has actually been consumed");
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
