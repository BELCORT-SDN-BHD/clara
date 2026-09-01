import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  confirmFlashCookie,
  confirmFlashMaxAgeSeconds,
  parseConfirmFlash,
} from "../app/(entry)/auth/confirm/confirm-flash";

/**
 * N1, fix round 2026-09-01 (裁-109) — the pure-function layer of the
 * confirm-page forgery fix. `handler.ts`'s own tests (`email-confirmation.
 * test.tsx`) prove the WRITE side end to end; `email-confirmation-page.
 * test.tsx` proves the READ side end to end through `ConfirmEmailPage`.
 * This file is the direct, minimal instrument for `parseConfirmFlash`
 * itself — no HTTP, no React, no cookies() — so a defect here fails fast
 * and specifically rather than only through a slower integration test.
 */

describe("parseConfirmFlash — the single validated read", () => {
  it("FOLD 1: a cookie for a DIFFERENT redirect's nonce never validates — the cross-tab overwrite case", () => {
    const payloadForTabB = JSON.stringify({ nonce: "nonce-b", kind: "locked", waitSeconds: 300 });
    assert.equal(
      parseConfirmFlash(payloadForTabB, "nonce-a"),
      null,
      "tab A's marker must never validate against tab B's cookie",
    );
  });

  it("accepts a well-formed payload whose nonce matches the marker, for every outcome kind", () => {
    assert.deepEqual(
      parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "wrong", remaining: 3 }), "n1"),
      { nonce: "n1", kind: "wrong", remaining: 3 },
    );
    assert.deepEqual(
      parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "locked", waitSeconds: 900 }), "n1"),
      { nonce: "n1", kind: "locked", waitSeconds: 900 },
    );
    assert.deepEqual(
      parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "unavailable" }), "n1"),
      { nonce: "n1", kind: "unavailable" },
    );
    assert.deepEqual(
      parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "invalid" }), "n1"),
      { nonce: "n1", kind: "invalid" },
    );
  });

  it("refuses an absent marker, an absent cookie, or either one empty", () => {
    assert.equal(parseConfirmFlash(undefined, "n1"), null, "no cookie at all");
    assert.equal(parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "unavailable" }), undefined), null, "no marker at all");
    assert.equal(parseConfirmFlash("", "n1"), null, "empty cookie");
    assert.equal(parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "unavailable" }), ""), null, "empty marker");
  });

  it("refuses malformed JSON, a non-object payload, and a payload with no nonce field", () => {
    assert.equal(parseConfirmFlash("not json at all", "n1"), null);
    assert.equal(parseConfirmFlash(JSON.stringify("just a string"), "n1"), null);
    assert.equal(parseConfirmFlash(JSON.stringify(42), "n1"), null);
    assert.equal(parseConfirmFlash(JSON.stringify({ kind: "wrong", remaining: 3 }), "n1"), null);
  });

  it("refuses an unknown `kind` — deploy-skew defense, not just forgery defense (confirm-flash.ts's own header)", () => {
    assert.equal(parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "expired" }), "n1"), null, "the removed N3 kind must not resurrect itself");
    assert.equal(parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "mystery" }), "n1"), null);
  });

  it("clamps `remaining` and `waitSeconds` to the same C1/C2 ceilings the pre-N1 query-string clamp used", () => {
    const outOfRange = [
      { nonce: "n1", kind: "wrong", remaining: 6 },
      { nonce: "n1", kind: "wrong", remaining: -1 },
      { nonce: "n1", kind: "wrong", remaining: 5.5 },
      { nonce: "n1", kind: "locked", waitSeconds: 901 },
      { nonce: "n1", kind: "locked", waitSeconds: -1 },
    ];
    for (const payload of outOfRange) {
      assert.equal(
        parseConfirmFlash(JSON.stringify(payload), "n1"),
        null,
        `${JSON.stringify(payload)} did not fall to null`,
      );
    }
    // At-ceiling values are the real value, not clamped to the edge.
    assert.deepEqual(
      parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "wrong", remaining: 5 }), "n1"),
      { nonce: "n1", kind: "wrong", remaining: 5 },
    );
    assert.deepEqual(
      parseConfirmFlash(JSON.stringify({ nonce: "n1", kind: "locked", waitSeconds: 900 }), "n1"),
      { nonce: "n1", kind: "locked", waitSeconds: 900 },
    );
  });
});

describe("confirmFlashMaxAgeSeconds — FOLD 4, per-variant lifetime", () => {
  it("gives every non-locked outcome the same short 120s life", () => {
    assert.equal(confirmFlashMaxAgeSeconds({ kind: "wrong", remaining: 3 }), 120);
    assert.equal(confirmFlashMaxAgeSeconds({ kind: "unavailable" }), 120);
    assert.equal(confirmFlashMaxAgeSeconds({ kind: "invalid" }), 120);
  });

  it("gives `locked` min(waitSeconds, 900) + 60 — the copy's own promise, padded", () => {
    assert.equal(confirmFlashMaxAgeSeconds({ kind: "locked", waitSeconds: 300 }), 360);
    assert.equal(confirmFlashMaxAgeSeconds({ kind: "locked", waitSeconds: 900 }), 960);
    // A future door bug returning something absurd is bounded by the min(),
    // not trusted verbatim.
    assert.equal(confirmFlashMaxAgeSeconds({ kind: "locked", waitSeconds: 999999 }), 960);
  });
});

describe("confirmFlashCookie — FOLD 3/the __Host- correction", () => {
  it("uses the __Host- prefixed, Secure name in production", () => {
    assert.deepEqual(confirmFlashCookie({ NODE_ENV: "production" }), {
      name: "__Host-clara-confirm-flash",
      secure: true,
    });
  });

  it("drops the prefix (and Secure) only under the SAME dev/loopback carve-out same-origin.ts uses", () => {
    assert.deepEqual(confirmFlashCookie({ NODE_ENV: "development" }), {
      name: "clara-confirm-flash",
      secure: false,
    });
    assert.deepEqual(confirmFlashCookie({ NODE_ENV: "test", CLARA_ALLOW_INSECURE_LOOPBACK: "1" }), {
      name: "clara-confirm-flash",
      secure: false,
    });
  });

  it("defaults to the production name under an unset/unrecognised NODE_ENV — fail-closed, never fail-open", () => {
    assert.deepEqual(confirmFlashCookie({}), {
      name: "__Host-clara-confirm-flash",
      secure: true,
    });
    assert.deepEqual(confirmFlashCookie({ NODE_ENV: "test" }), {
      name: "__Host-clara-confirm-flash",
      secure: true,
    });
  });

  it("never allows __Host- without Secure, or Secure:false with the __Host- name — the pairing that made the prior design spec-invalid", () => {
    for (const env of [{}, { NODE_ENV: "production" }, { NODE_ENV: "test" }]) {
      const cookie = confirmFlashCookie(env);
      if (cookie.name.startsWith("__Host-")) assert.equal(cookie.secure, true);
    }
    for (const env of [{ NODE_ENV: "development" }, { CLARA_ALLOW_INSECURE_LOOPBACK: "1" }]) {
      const cookie = confirmFlashCookie(env);
      if (!cookie.secure) assert.equal(cookie.name.startsWith("__Host-"), false);
    }
  });
});
