import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSameOriginPath } from "../lib/safe-redirect";

/**
 * The open-redirect wall (security review finding 4, MEDIUM). The
 * control-character strings below are the reviewer's own exploit inputs,
 * written here already URL-DECODED — i.e. exactly what
 * `searchParams.get("next")` hands the login form for
 * `?next=/%09/evil.example` and friends.
 */

const ORIGIN = "https://app.clara.example";

describe("resolveSameOriginPath — the reviewer's control-character exploits", () => {
  const exploits: [label: string, raw: string][] = [
    ["%09 (tab)", "/\t/evil.example"],
    ["%0A (LF)", "/\n/evil.example"],
    ["%0D (CR)", "/\r/evil.example"],
    ["%09%5C (tab + backslash)", "/\t\\evil.example"],
  ];

  for (const [label, raw] of exploits) {
    it(`rejects ${label}`, () => {
      // Proof the exploit is real: WHATWG parsing of the raw value against
      // this origin lands OFF-origin. If this assertion ever fails, the
      // exploit has changed shape and the wall's test below is vacuous.
      assert.notEqual(
        new URL(raw, ORIGIN).origin,
        ORIGIN,
        `${label} should parse to an external origin`,
      );
      assert.equal(resolveSameOriginPath(raw, ORIGIN), "/");
    });
  }
});

describe("resolveSameOriginPath — other off-origin shapes", () => {
  const rejected: [label: string, raw: string | null | undefined][] = [
    ["absent", undefined],
    ["null", null],
    ["empty", ""],
    ["absolute external", "https://evil.example/x"],
    ["protocol-relative", "//evil.example"],
    ["backslash-escaped", "/\\evil.example"],
    ["scheme-relative backslashes", "\\\\evil.example"],
    ["javascript: URL", "javascript:alert(1)"],
    ["data: URL", "data:text/html,<script>alert(1)</script>"],
    ["same host, wrong scheme", "http://app.clara.example/x"],
    ["same host, wrong port", "https://app.clara.example:8443/x"],
    ["sibling host", "https://evil.app.clara.example/x"],
    ["host prefix trick", "https://app.clara.example.evil.test/x"],
    ["same-origin absolute with // path", "https://app.clara.example//evil.example"],
    ["triple slash", "///evil.example"],
    ["leading space + protocol-relative", " //evil.example"],
  ];

  for (const [label, raw] of rejected) {
    it(`rejects ${label}`, () => {
      assert.equal(resolveSameOriginPath(raw, ORIGIN), "/");
    });
  }
});

describe("resolveSameOriginPath — same-origin destinations survive", () => {
  it("keeps a plain path", () => {
    assert.equal(resolveSameOriginPath("/clients/abc", ORIGIN), "/clients/abc");
  });

  it("keeps query and hash", () => {
    assert.equal(
      resolveSameOriginPath("/clients/abc?tab=bank#row-3", ORIGIN),
      "/clients/abc?tab=bank#row-3",
    );
  });

  it("canonicalises an absolute same-origin URL to its path", () => {
    assert.equal(
      resolveSameOriginPath(`${ORIGIN}/needs-you?x=1`, ORIGIN),
      "/needs-you?x=1",
    );
  });

  it("resolves dot segments rather than passing them through", () => {
    assert.equal(resolveSameOriginPath("/a/b/../c", ORIGIN), "/a/c");
  });

  it("keeps an ENCODED slash in the path — it stays same-origin", () => {
    // %2F is not decoded into a path separator by WHATWG parsing, so this is
    // an ordinary same-origin path, not a protocol-relative destination.
    // Recorded so the wall's behaviour here is deliberate, not accidental.
    assert.equal(
      resolveSameOriginPath("/%2f/evil.example", ORIGIN),
      "/%2f/evil.example",
    );
  });

  it("falls back to / when the caller's own origin is unusable", () => {
    assert.equal(resolveSameOriginPath("/clients/abc", "not-an-origin"), "/");
  });
});
