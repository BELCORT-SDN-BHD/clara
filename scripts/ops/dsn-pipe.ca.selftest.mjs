#!/usr/bin/env node
// (C1) validateCa structural-validation battery for the ceremony DSN bridge, split out of
// dsn-pipe.selftest.mjs so neither file crosses the repo's file-size convention. HERMETIC —
// reads the committed CA and mints throwaway local fixtures only, never the real pooler.
//
//   node scripts/ops/dsn-pipe.ca.selftest.mjs   # exit 0 green, 1 red

import { X509Certificate } from "node:crypto";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, freshDir, opensslAvailableForCaFixtures, reportOpensslMissing, mintCert } from "./dsn-pipe.selftest-helpers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMITTED_CA = join(HERE, "..", "..", "ops", "tls", "pooler-ca.crt");

const { testCase, reportFail, reportSkip, summarize } = createHarness();

const { validateCa } = await import("./dsn-pipe.mjs");

console.log("(C1) validateCa -- structural CA validation:");

testCase("the COMMITTED CA passes validateCa (CA:TRUE, in-window, exact pinned fingerprint)", () => {
  const cert = validateCa(COMMITTED_CA);
  if (cert.ca !== true) throw new Error("committed CA must report ca===true");
});
testCase("an EMPTY file fails closed (existence alone is not enough)", () => {
  const dir = freshDir("dsnpipe-ca-empty-");
  const p = join(dir, "empty.crt");
  writeFileSync(p, "");
  let threw = null;
  try {
    validateCa(p);
  } catch (e) {
    threw = e;
  }
  rmSync(dir, { recursive: true, force: true });
  if (!threw) throw new Error("expected a throw for an empty file");
});
testCase("a TRUNCATED PEM block fails closed", () => {
  const dir = freshDir("dsnpipe-ca-trunc-");
  const p = join(dir, "trunc.crt");
  const full = readFileSync(COMMITTED_CA, "utf8");
  writeFileSync(p, full.slice(0, Math.floor(full.length / 2)));
  let threw = null;
  try {
    validateCa(p);
  } catch (e) {
    threw = e;
  }
  rmSync(dir, { recursive: true, force: true });
  if (!threw) throw new Error("expected a throw for a truncated PEM block");
});

// (F2) The 30-day rotation tripwire -- a monotonic direction, never a pinned date, so it cannot
// rot into a dated tripwire. Claimed as the mitigation in dsn-bridge.md "Rotation",
// fix-queue-design.md §6 item 3, and fix-queue-annexes.md R-3 -- a claimed-but-absent control is
// worse than no claim, so this cell exists independently of validateCa() (whose own job is
// narrower: is the cert valid RIGHT NOW, not "is it about to stop being valid").
testCase("(F2) the committed CA has at least 30 days remaining before notAfter", () => {
  const cert = new X509Certificate(readFileSync(COMMITTED_CA, "utf8"));
  const daysLeft = (Date.parse(cert.validTo) - Date.now()) / (24 * 60 * 60 * 1000);
  if (daysLeft < 30) throw new Error(`only ${daysLeft.toFixed(1)} days remain before ${cert.validTo} -- rotate the pinned CA (docs/ops/dsn-bridge.md "Rotation")`);
});

const harnessForOpenssl = { reportFail, reportSkip };
if (!opensslAvailableForCaFixtures()) {
  reportOpensslMissing(harnessForOpenssl, "validateCa negative fixtures (not-a-CA / wrong-fingerprint / expired)", 3);
} else {
  const fixDir = freshDir("dsnpipe-ca-fixtures-");

  testCase("a cert WITHOUT basicConstraints CA:TRUE fails closed (not a CA)", () => {
    const { crtPath } = mintCert(fixDir, "leaf-not-a-ca", { ca: false });
    let threw = null;
    try {
      validateCa(crtPath);
    } catch (e) {
      threw = e;
    }
    if (!threw) throw new Error("expected a throw for a non-CA certificate");
    if (!/CA:TRUE/.test(threw.message)) throw new Error(`expected the CA:TRUE reason, got: ${threw.message}`);
  });

  testCase("a DIFFERENT, currently-valid CA cert fails closed on FINGERPRINT MISMATCH", () => {
    const { crtPath } = mintCert(fixDir, "different-ca", { ca: true });
    let threw = null;
    try {
      validateCa(crtPath);
    } catch (e) {
      threw = e;
    }
    if (!threw) throw new Error("expected a throw for a fingerprint mismatch");
    if (!/fingerprint/i.test(threw.message)) throw new Error(`expected a fingerprint-shaped reason, got: ${threw.message}`);
  });

  testCase("an EXPIRED CA cert fails closed on the validity window", () => {
    const { crtPath } = mintCert(fixDir, "expired-ca", { ca: true, notBefore: "20200101000000Z", notAfter: "20200102000000Z" });
    let threw = null;
    try {
      validateCa(crtPath);
    } catch (e) {
      threw = e;
    }
    if (!threw) throw new Error("expected a throw for an expired certificate");
    if (!/validity window/i.test(threw.message)) throw new Error(`expected a validity-window reason, got: ${threw.message}`);
  });

  rmSync(fixDir, { recursive: true, force: true });
}

process.exit(summarize());
