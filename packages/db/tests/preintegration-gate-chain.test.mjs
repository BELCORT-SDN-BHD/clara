// THE PRE-INTEGRATION GATE CHAIN, pinned as a CLASS rather than one token at a time.
//
// Absorbed sibling obligation (conductor's call, 2026-08-30): #425 shipped
// tests/promotion-dup-open-wall-preintegration-gate.mjs and never added its `--import` token to
// packages/db/package.json's test script. That is a one-token mistake whose consequence is
// invisible where it is made — the battery FAILS instead of skipping on every chain that predates
// its migration, which is the frontier legs and the closed-wave drills, and those run on the
// weekly sweep far from the PR that caused it (.claude/rules/db-tests.md names this class). The
// token is added in this PR; this file is what stops the NEXT one.
//
// NO DATABASE. Deliberately: it reads package.json and this directory and nothing else, so it
// runs on every leg including the pre-migration chains where the very batteries it protects are
// skipping. A gate-chain guard that itself needed the migrated schema would be unable to run in
// exactly the situation it exists to describe.
//
// THE INSTRUMENT IS SHARED, NOT COPIED. The checking function lives in
// preintegration-gate-chain.mjs and is imported here, so the positive controls below drive the
// SAME code the real assertion drives. A re-typed copy would let the two drift and would prove
// only that the copy still works (the vacuity this battery's own ci-11 header calls out).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditGateChain, describeGateChainFindings, importedTestFiles, isGateFile } from "./preintegration-gate-chain.mjs";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const PKG = fileURLToPath(new URL("../package.json", import.meta.url));

const readScript = () => JSON.parse(readFileSync(PKG, "utf8")).scripts.test;
const readFiles = () => readdirSync(TESTS_DIR);

test("gate-chain · every pre-integration gate on disk is PRELOADED, and every --import names a real file", () => {
  const script = readScript();
  const filesOnDisk = readFiles();
  const findings = auditGateChain({ script, filesOnDisk });
  assert.equal(describeGateChainFindings(findings), "", describeGateChainFindings(findings));
});

test("gate-chain · the corpus is NON-EMPTY on both sides, so a green above cannot be vacuous", () => {
  // A findings-empty result over zero gates or zero imports would be a pass that proves nothing —
  // exactly how this guard would rot if the naming convention ever changed under it.
  const filesOnDisk = readFiles();
  const gates = filesOnDisk.filter(isGateFile);
  const imported = importedTestFiles(readScript());
  assert.ok(gates.length >= 8,
    `gate-chain: expected the wave gates to still be discoverable by the -preintegration-gate.mjs name contract, found ${gates.length}`);
  assert.ok(imported.length >= gates.length,
    `gate-chain: the chain preloads ${imported.length} file(s) but ${gates.length} gate(s) exist on disk`);
  // ...and the specific one this PR absorbed is really in both halves, by name.
  assert.ok(gates.includes("promotion-dup-open-wall-preintegration-gate.mjs"),
    "gate-chain: #425's gate must still be on disk");
  assert.ok(imported.includes("promotion-dup-open-wall-preintegration-gate.mjs"),
    "gate-chain: ...and preloaded — this is the sibling obligation this PR absorbed");
  assert.ok(imported.includes("client-identifiers-unique-preintegration-gate.mjs"),
    "gate-chain: and this PR's own gate is preloaded");
});

test("gate-chain · POSITIVE CONTROL: a gate that is not preloaded is NAMED", () => {
  const filesOnDisk = readFiles();
  const script = readScript();
  const victim = "promotion-dup-open-wall-preintegration-gate.mjs";
  // Drop exactly one token — the shape #425 shipped and main still carries.
  const mutated = script.replace(`--import ./tests/${victim} `, "");
  assert.notEqual(mutated, script, "positive control: the token must actually have been removed");
  const findings = auditGateChain({ script: mutated, filesOnDisk });
  assert.deepEqual(findings.notPreloaded, [victim],
    "positive control: the audit must name exactly the un-preloaded gate, and only it");
  assert.match(describeGateChainFindings(findings), /FAIL rather than skip/,
    "positive control: ...and say what the consequence is, not merely that something is missing");
});

test("gate-chain · POSITIVE CONTROL: a token naming a file that does not exist is NAMED", () => {
  const findings = auditGateChain({
    script: "node --test --import ./tests/does-not-exist-preintegration-gate.mjs tests/",
    filesOnDisk: readFiles(),
  });
  assert.deepEqual(findings.danglingImports, ["does-not-exist-preintegration-gate.mjs"]);
  assert.match(describeGateChainFindings(findings), /breaks the whole/,
    "a dangling --import is a hard startup error, and the finding must say so");
});

test("gate-chain · POSITIVE CONTROL: a duplicated token is NAMED", () => {
  const dup = "delta-preintegration-gate.mjs";
  const findings = auditGateChain({
    script: `node --test --import ./tests/${dup} --import ./tests/${dup} tests/`,
    filesOnDisk: readFiles(),
  });
  assert.deepEqual(findings.duplicates, [dup]);
});
