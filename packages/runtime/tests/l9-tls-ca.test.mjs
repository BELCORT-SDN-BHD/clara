// H-43 — the pooler CA in the image, the ported structural+fingerprint validation, and the
// boot assert. PURE UNIT: no DB, no network. Fixtures are the REAL committed CA (read from the
// repo, not from the image path) plus files this suite writes into a scratch directory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_CA_FINGERPRINT_SHA256,
  IN_IMAGE_CA_PATH,
  TLS_CHECKED_DSN_VARS,
  assertLaneDsnTlsPosture,
  readDsnTlsPosture,
  validateCa,
} from "../lib/tls-ca.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_CA_PATH = join(REPO_ROOT, "ops", "tls", "pooler-ca.crt");

// Fixture DSNs are ASSEMBLED PIECEWISE, never written as a literal: a
// scheme-user-password-host string in a source file trips this repo's own secret-shape guard,
// and rightly so — the guard cannot tell a fixture from a leak, and "it is only a test" is
// exactly how one ships. Nothing here ever connects; the assert reads query parameters only.
const U = "fixture";
const H = "pooler.invalid";
const fixtureDsn = (db, params = "") => ["postgres:/", "/", U, ":", U, "@", H, "/", db, params].join("");

function scratch() {
  return mkdtempSync(join(process.env.CLARA_TEST_TMP_ROOT || tmpdir(), "clara-l9-tls-"));
}

// ---------------------------------------------------------------------------
// 1. The image actually carries the file (the whole defect).
// ---------------------------------------------------------------------------

test("H-43 drift guard: the RUNNER stage COPYs the pooler CA to the pinned in-image path", () => {
  const dockerfile = readFileSync(join(RUNTIME_ROOT, "Dockerfile"), "utf8");
  const runnerIdx = dockerfile.indexOf("FROM node:20-bookworm-slim AS runner");
  assert.ok(runnerIdx > 0, "mandatory setup: the runner stage was located");
  const runnerStage = dockerfile.slice(runnerIdx);
  assert.match(
    runnerStage,
    /^COPY ops\/tls\/pooler-ca\.crt \/app\/ops\/tls\/pooler-ca\.crt$/m,
    "the runner stage must COPY the CA — without it sslmode=verify-full cannot resolve at all",
  );
  // "Spelling is not identity": the Dockerfile's destination and the module's constant must be
  // the SAME path, because that path is baked into every lane DSN secret.
  assert.match(
    runnerStage,
    new RegExp(`^COPY \\S+ ${IN_IMAGE_CA_PATH.replace(/\//g, "\\/")}$`, "m"),
    `the COPY destination must be IN_IMAGE_CA_PATH (${IN_IMAGE_CA_PATH})`,
  );
  // A builder-stage-only COPY would be invisible in the SERVED image — the exact class of the
  // H-01 stale-image finding. Assert the line is not merely present earlier in the file.
  assert.ok(
    !dockerfile.slice(0, runnerIdx).includes("pooler-ca.crt"),
    "the CA must be copied in the RUNNER stage, not only the builder",
  );
});

test("CB-AE2E-035 drift guard: the runner stage declares the build-sha ARG/ENV pair", () => {
  const dockerfile = readFileSync(join(RUNTIME_ROOT, "Dockerfile"), "utf8");
  const runnerStage = dockerfile.slice(dockerfile.indexOf("FROM node:20-bookworm-slim AS runner"));
  assert.match(runnerStage, /^ARG CLARA_BUILD_SHA=""$/m, "the build arg is declared, defaulting to empty");
  assert.match(runnerStage, /^ENV CLARA_BUILD_SHA=\$CLARA_BUILD_SHA$/m, "and promoted to an ENV the route can read");
});

// ---------------------------------------------------------------------------
// 2. The fingerprint is pinned in TWO places by necessity — they must agree.
// ---------------------------------------------------------------------------

test("H-43: the runtime's CA fingerprint pin is byte-equal to the ceremony bridge's", () => {
  // scripts/ops/ is NOT in the image (the Dockerfile copies packages/runtime/scripts, not the
  // repo-root scripts/), so the runtime must carry its own copy. This cell is the coupling: a
  // rotation that moves one constant and not the other reds here, in CI, rather than at a
  // ceremony. Read from the bridge's SOURCE rather than imported, because importing it would
  // prove only that two modules resolve one binding — the hazard is two LITERALS drifting.
  const bridge = readFileSync(join(REPO_ROOT, "scripts", "ops", "dsn-pipe.mjs"), "utf8");
  const m = bridge.match(/EXPECTED_CA_FINGERPRINT_SHA256\s*=\s*\n?\s*"([0-9A-F:]+)"/);
  assert.ok(m, "mandatory setup: the bridge's pinned fingerprint literal was located");
  assert.equal(
    EXPECTED_CA_FINGERPRINT_SHA256,
    m[1],
    "the two pins MUST move in the same PR as the .crt file (docs/ops/dsn-bridge.md, 'Rotation')",
  );
});

test("H-43: the COMMITTED CA validates against the pin, today", () => {
  const cert = validateCa(REPO_CA_PATH);
  assert.equal(cert.ca, true, "it is a CA certificate");
  assert.equal(cert.fingerprint256, EXPECTED_CA_FINGERPRINT_SHA256);
});

// ---------------------------------------------------------------------------
// 3. validateCa fails CLOSED on every degraded input.
// ---------------------------------------------------------------------------

test("H-43: validateCa refuses an unreadable path", () => {
  const dir = scratch();
  try {
    assert.throws(() => validateCa(join(dir, "absent.crt")), /FAIL-CLOSED — could not read the pinned CA/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("H-43: validateCa refuses a file with no PEM CERTIFICATE block", () => {
  const dir = scratch();
  try {
    const p = join(dir, "empty.crt");
    writeFileSync(p, "");
    assert.throws(() => validateCa(p), /does not contain a PEM CERTIFICATE block/);
    const q = join(dir, "prose.crt");
    writeFileSync(q, "this is not a certificate\n");
    assert.throws(() => validateCa(q), /does not contain a PEM CERTIFICATE block/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("H-43: validateCa refuses a TRUNCATED certificate (existence is not proof)", () => {
  // The precise reason existsSync is not enough: this file carries the PEM header and passes
  // any "does it exist / is it non-empty" check, while providing no trust anchor at all.
  const dir = scratch();
  try {
    const full = readFileSync(REPO_CA_PATH, "utf8");
    const p = join(dir, "truncated.crt");
    writeFileSync(p, full.slice(0, Math.floor(full.length / 2)));
    assert.throws(() => validateCa(p), /did not parse as a valid X\.509 certificate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("H-43: validateCa refuses a certificate outside its own validity window", () => {
  const cert = validateCa(REPO_CA_PATH);
  assert.throws(() => validateCa(REPO_CA_PATH, { now: Date.parse(cert.validTo) + 1000 }), /outside its validity window/);
  assert.throws(() => validateCa(REPO_CA_PATH, { now: Date.parse(cert.validFrom) - 1000 }), /outside its validity window/);
});

test("H-43: validateCa refuses a SWAPPED certificate (the fingerprint moved)", () => {
  assert.throws(
    () => validateCa(REPO_CA_PATH, { expectedFingerprint: `${"00:".repeat(31)}00` }),
    /fingerprint does not match the pinned expectation/,
  );
});

// ---------------------------------------------------------------------------
// 4. readDsnTlsPosture — reads the posture, returns nothing else.
// ---------------------------------------------------------------------------

test("H-43: readDsnTlsPosture reports sslmode + sslrootcert and NOTHING else", () => {
  const p = readDsnTlsPosture(fixtureDsn("db", `?sslmode=verify-full&sslrootcert=${IN_IMAGE_CA_PATH}`));
  assert.deepEqual(p, { parsed: true, sslmode: "verify-full", sslrootcert: IN_IMAGE_CA_PATH });
  const s = JSON.stringify(p);
  assert.ok(!s.includes(U) && !s.includes(H), "no credential or host leaves the reader");
  assert.deepEqual(readDsnTlsPosture("not a dsn"), { parsed: false, sslmode: null, sslrootcert: null });
  assert.deepEqual(readDsnTlsPosture(fixtureDsn("db")), { parsed: true, sslmode: null, sslrootcert: null });
});

// ---------------------------------------------------------------------------
// 5. The boot assert.
// ---------------------------------------------------------------------------

test("H-43 boot assert: a DSN pinning a MISSING CA refuses to start, by name", () => {
  const dir = scratch();
  try {
    const missing = join(dir, "not-there.crt");
    assert.throws(
      () =>
        assertLaneDsnTlsPosture({
          env: { CLARA_RUNTIME_DATABASE_URL: fixtureDsn("db", `?sslmode=verify-full&sslrootcert=${missing}`) },
          testMode: false,
          log: () => {},
        }),
      /FAIL-CLOSED — could not read the pinned CA/,
      "a pinned-but-absent CA is the one condition where booting is worse than not booting",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("H-43 boot assert: a DSN pinning the REAL CA passes and validates it exactly once", () => {
  const pinned = (db) => fixtureDsn(db, `?sslmode=verify-full&sslrootcert=${REPO_CA_PATH}`);
  const logged = [];
  const out = assertLaneDsnTlsPosture({
    env: {
      CLARA_RUNTIME_DATABASE_URL: pinned("a"),
      CLARA_READ_DATABASE_URL: pinned("b"),
      CLARA_WRITE_DATABASE_URL: pinned("c"),
    },
    testMode: false,
    log: (m) => logged.push(m),
  });
  assert.deepEqual(out.pinned.sort(), ["CLARA_READ_DATABASE_URL", "CLARA_RUNTIME_DATABASE_URL", "CLARA_WRITE_DATABASE_URL"]);
  assert.deepEqual(out.validated, [REPO_CA_PATH], "one distinct path -> one parse, not three");
  assert.deepEqual(out.weakMode, [], "verify-full is a verifying mode");
  assert.deepEqual(logged, [], "a correctly-pinned deployment warns about nothing");
});

test("H-43 boot assert: a production deployment that pins NOTHING warns and still boots", () => {
  // The deliberate scoping decision: refusing here would brick the very deploy that PUTS the CA
  // in the image, which the ceremony ordering requires to come FIRST.
  const logged = [];
  const out = assertLaneDsnTlsPosture({
    env: { CLARA_RUNTIME_DATABASE_URL: fixtureDsn("db") },
    testMode: false,
    log: (m) => logged.push(m),
  });
  assert.deepEqual(out.pinned, []);
  assert.deepEqual(out.unpinned, ["CLARA_RUNTIME_DATABASE_URL"]);
  assert.ok(logged.some((m) => /no configured DSN carries sslrootcert=/.test(m)), "the unpinned WARN fires");
  assert.ok(logged.some((m) => m.includes("runtime-tls-verify-full-ceremony.md")), "and names the ceremony recipe");
  assert.ok(logged.every((m) => !m.includes(H) && !m.includes(U)), "no warning ever echoes a DSN");
});

test("H-43 boot assert: a NON-verifying sslmode warns and names the variables", () => {
  const logged = [];
  const out = assertLaneDsnTlsPosture({
    env: {
      CLARA_RUNTIME_DATABASE_URL: fixtureDsn("a", `?sslmode=no-verify&sslrootcert=${REPO_CA_PATH}`),
      CLARA_READ_DATABASE_URL: fixtureDsn("b", `?sslmode=require&sslrootcert=${REPO_CA_PATH}`),
      CLARA_WRITE_DATABASE_URL: fixtureDsn("c", `?sslmode=verify-ca&sslrootcert=${REPO_CA_PATH}`),
    },
    testMode: false,
    log: (m) => logged.push(m),
  });
  assert.deepEqual(out.weakMode.sort(), ["CLARA_READ_DATABASE_URL", "CLARA_RUNTIME_DATABASE_URL"]);
  assert.ok(!out.weakMode.includes("CLARA_WRITE_DATABASE_URL"), "verify-ca authenticates the server and is not weak");
  assert.ok(logged.some((m) => /do not request a VERIFYING sslmode/.test(m)));
});

test("H-43 boot assert: test mode is silent, but STILL fails closed on a broken pin", () => {
  const logged = [];
  const out = assertLaneDsnTlsPosture({ env: { CLARA_RUNTIME_DATABASE_URL: fixtureDsn("db") }, testMode: true, log: (m) => logged.push(m) });
  assert.deepEqual(logged, [], "a local rig is not nagged about a ceremony it will never run");
  assert.deepEqual(out.pinned, []);
  // The discriminating half: test mode suppresses the WARNINGS, never the fail-closed branch.
  assert.throws(
    () =>
      assertLaneDsnTlsPosture({
        env: { CLARA_RUNTIME_DATABASE_URL: fixtureDsn("db", "?sslrootcert=/definitely/not/here.crt") },
        testMode: true,
        log: () => {},
      }),
    /FAIL-CLOSED/,
  );
});

test("H-43: an unparseable DSN is left to the connect path, not turned into a boot failure here", () => {
  const out = assertLaneDsnTlsPosture({ env: { CLARA_RUNTIME_DATABASE_URL: "garbage" }, testMode: true, log: () => {} });
  assert.deepEqual(out, { pinned: [], unpinned: [], weakMode: [], validated: [] });
});

test("H-43: TLS_CHECKED_DSN_VARS covers every lane DSN plus both base sources", () => {
  const expected = [
    "CLARA_RUNTIME_DATABASE_URL",
    "CLARA_READ_DATABASE_URL",
    "CLARA_WRITE_DATABASE_URL",
    "CLARA_FREEFORM_DATABASE_URL",
    "CLARA_BANK_DATABASE_URL",
    "CLARA_STRIPE_WEBHOOK_DATABASE_URL",
    "CLARA_AUTH_WALL_DATABASE_URL",
    "WORKFLOW_POSTGRES_URL",
    "DATABASE_URL",
  ];
  for (const name of expected) assert.ok(TLS_CHECKED_DSN_VARS.includes(name), `${name} must be TLS-checked`);
  assert.equal(TLS_CHECKED_DSN_VARS.length, expected.length);
});

test("H-43: the ONE boot door calls the assert", () => {
  const pools = readFileSync(join(RUNTIME_ROOT, "lib", "pools.mjs"), "utf8");
  const start = pools.indexOf("export function assertProductionPoolConfig()");
  assert.ok(start > 0, "mandatory setup: the boot door was located");
  const end = pools.indexOf("\nfunction loginConfig", start);
  assert.ok(end > start, "mandatory setup: the function body was bounded");
  assert.match(pools.slice(start, end), /assertLaneDsnTlsPosture\(\);/, "the TLS assert runs at boot, beside the presence loop");
});
