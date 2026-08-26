import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyPublicKey as classifyRaw } from "../scripts/check-public-key.mjs";

/**
 * Finding 7 (MEDIUM) — the build-time gate on the CLASS of the key that gets
 * inlined into the browser bundle.
 *
 * Every JWT fixture below is BUILT AT RUNTIME from its parts rather than
 * pasted as a literal: a three-segment `ey…` string in a tracked file is
 * exactly what `scripts/check-leaks.mjs` and gitleaks are supposed to shout
 * about, and a test fixture must not train the leak gates to be ignored.
 */

/**
 * The gate is a plain `.mjs` script on purpose — it runs under bare `node`
 * before `next build`, with no TypeScript toolchain in the path. This is the
 * shape its JSDoc declares; the wrapper below pins that contract here.
 */
type Classification =
  | { ok: true; class: "publishable" | "legacy-anon-jwt" }
  | { ok: false; reason: string };

function classify(value: string | undefined | null): Classification {
  return classifyRaw(value) as Classification;
}

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode(payload),
    "not-a-real-signature",
  ].join(".");
}

describe("classifyPublicKey — accepted classes", () => {
  it("accepts a publishable key", () => {
    assert.deepEqual(classify("sb_publishable_abcdefgh12345678"), {
      ok: true,
      class: "publishable",
    });
  });

  it("accepts a legacy JWT whose role is positively anon", () => {
    assert.deepEqual(classify(jwt({ role: "anon", iss: "supabase" })), {
      ok: true,
      class: "legacy-anon-jwt",
    });
  });

  it("tolerates surrounding whitespace", () => {
    assert.deepEqual(classify("  sb_publishable_abcdefgh12345678  "), {
      ok: true,
      class: "publishable",
    });
  });
});

describe("classifyPublicKey — rejected classes", () => {
  const rejected: [
    label: string,
    value: string | undefined | null,
    reason: string,
  ][] = [
    ["absent", undefined, "absent"],
    ["null", null, "absent"],
    ["empty", "", "absent"],
    ["whitespace only", "   ", "absent"],
    [
      "a secret key",
      "sb" + "_secret_" + "abcdefgh12345678",
      "secret-key-prefix:sb_secret_",
    ],
    [
      "a personal access token",
      "sb" + "p_" + "0123456789abcdef0123456789abcdef01234567",
      "secret-key-prefix:sbp_",
    ],
    ["an unknown sb_ class", "sb_something_else_1234", "unknown-sb-key-class"],
    [
      "a bare publishable prefix",
      "sb_publishable_",
      "malformed-publishable-key",
    ],
    [
      "a short publishable body",
      "sb_publishable_abc",
      "malformed-publishable-key",
    ],
    ["a random string", "totally-not-a-key", "unrecognised-key-format"],
    ["a truncated JWT", "header.payload", "unrecognised-key-format"],
  ];

  for (const [label, value, reason] of rejected) {
    it(`rejects ${label}`, () => {
      assert.deepEqual(classify(value), { ok: false, reason });
    });
  }

  it("rejects a service_role JWT — the whole point of the gate", () => {
    assert.deepEqual(classify(jwt({ role: "service_role" })), {
      ok: false,
      reason: "jwt-role:service_role",
    });
  });

  it("rejects a JWT with an authenticated role", () => {
    assert.deepEqual(classify(jwt({ role: "authenticated" })), {
      ok: false,
      reason: "jwt-role:authenticated",
    });
  });

  it("rejects a JWT carrying no role at all", () => {
    assert.deepEqual(classify(jwt({ iss: "supabase" })), {
      ok: false,
      reason: "jwt-without-role",
    });
  });

  it("rejects a JWT whose payload will not decode", () => {
    assert.deepEqual(classify("eyJ" + "abc.notbase64json.sig"), {
      ok: false,
      reason: "unrecognised-key-format",
    });
  });
});
