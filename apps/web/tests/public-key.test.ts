import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyPublicKey as classifyRaw, readEnv as readEnvRaw } from "../scripts/check-public-key.mjs";

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

function readEnv(name: string, envDir?: string): string | undefined {
  return readEnvRaw(name, envDir) as string | undefined;
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

describe("readEnv — Next's own production dotenv precedence (reviewer note 1)", () => {
  // A unique, never-real env var name — never the app's actual
  // NEXT_PUBLIC_SUPABASE_ANON_KEY — so this arm cannot collide with, or be
  // masked by, a real value the ambient environment happens to carry.
  const NAME = "CLARA_TEST_DOTENV_PRECEDENCE_PROBE";

  function withFixtureDir(files: Record<string, string>, run: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "clara-dotenv-precedence-"));
    try {
      for (const [file, contents] of Object.entries(files)) {
        writeFileSync(join(dir, file), contents, "utf8");
      }
      run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it(".env.production.local WINS over .env.local (the exact gap the note names)", () => {
    withFixtureDir(
      {
        ".env.production.local": `${NAME}=from-production-local\n`,
        ".env.local": `${NAME}=from-local\n`,
      },
      (dir) => {
        assert.equal(readEnv(NAME, dir), "from-production-local");
      },
    );
  });

  it(".env.local wins over .env.production and .env when .env.production.local is absent", () => {
    withFixtureDir(
      {
        ".env.local": `${NAME}=from-local\n`,
        ".env.production": `${NAME}=from-production\n`,
        ".env": `${NAME}=from-plain\n`,
      },
      (dir) => {
        assert.equal(readEnv(NAME, dir), "from-local");
      },
    );
  });

  it(".env.production wins over .env when neither .local file sets it", () => {
    withFixtureDir(
      {
        ".env.production": `${NAME}=from-production\n`,
        ".env": `${NAME}=from-plain\n`,
      },
      (dir) => {
        assert.equal(readEnv(NAME, dir), "from-production");
      },
    );
  });

  it("falls back to .env when none of the more specific files set it", () => {
    withFixtureDir({ ".env": `${NAME}=from-plain\n` }, (dir) => {
      assert.equal(readEnv(NAME, dir), "from-plain");
    });
  });

  it("the process environment still outranks every dotenv file", () => {
    withFixtureDir({ ".env.production.local": `${NAME}=from-production-local\n` }, (dir) => {
      process.env[NAME] = "from-process-env";
      try {
        assert.equal(readEnv(NAME, dir), "from-process-env");
      } finally {
        delete process.env[NAME];
      }
    });
  });

  it("resolves undefined when no file sets it and no directory has a match", () => {
    withFixtureDir({}, (dir) => {
      assert.equal(readEnv(NAME, dir), undefined);
    });
  });
});
