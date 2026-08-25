#!/usr/bin/env node
// Self-test for the freeze-lint Slice-4 hardening (contract §4.9):
// registry-version monotonicity (d) + enqueue-site provenance (e).
//
// Runs WITHOUT a git base: fixtures under scripts/freeze-lint-fixtures/
// simulate base/head registry pairs and enqueue-site files (stored as .ts.txt
// so the repo's eslint/tsc sweeps never parse fixture code — they are DATA).
// The checkers in freeze-lint-checks.mjs are pure (source strings in,
// violations out), so injecting fixtures exercises EXACTLY the code the CI
// gate runs — check-frozen-workflows.mjs wires the same functions to git.
//
//   node scripts/check-frozen-workflows.selftest.mjs   # exit 0 green, 1 red
//
// No dependencies — Node built-ins only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkRegistryMonotonicity,
  checkRegistryViewIntegrity,
  checkEnqueueSites,
  parseRegistrySource,
} from "./freeze-lint-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "freeze-lint-fixtures");
const fixture = (name) => readFileSync(join(FIXTURES, name), "utf8");

let failures = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}
/** Assert no violations. */
function expectClean(violations) {
  if (violations.length !== 0) {
    throw new Error(`expected NO violations, got ${violations.length}:\n${violations.join("\n")}`);
  }
}
/**
 * Assert every expected code fires AND no unexpected code fires (a REJECT for
 * the wrong reason is a bug too).
 */
function expectCodes(violations, codes) {
  for (const code of codes) {
    if (!violations.some((v) => v.includes(code))) {
      throw new Error(`expected a ${code} violation; got:\n${violations.join("\n") || "(none)"}`);
    }
  }
  const stray = violations.filter((v) => !codes.some((c) => v.includes(c)));
  if (stray.length > 0) {
    throw new Error(`unexpected extra violation(s):\n${stray.join("\n")}`);
  }
}

// --- (d) registry-version monotonicity --------------------------------------
console.log("registry-version monotonicity:");

const v1 = fixture("registry-v1.ts.txt");
const v2 = fixture("registry-v2.ts.txt");
const two = fixture("registry-two-classes.ts.txt");
const inlineAlias = fixture("registry-inline-alias.ts.txt");

testCase("equal version (no repoint) -> OK", () => {
  expectClean(checkRegistryMonotonicity(v1, v1, "simulated-base"));
});

testCase("monotonic repoint v1 -> v2 -> OK", () => {
  expectClean(checkRegistryMonotonicity(v1, v2, "simulated-base"));
});

testCase("new class added -> OK", () => {
  expectClean(checkRegistryMonotonicity(v1, two, "simulated-base"));
});

testCase("downgrade v2 -> v1 -> REJECT (REGISTRY-DOWNGRADE)", () => {
  expectCodes(checkRegistryMonotonicity(v2, v1, "simulated-base"), ["REGISTRY-DOWNGRADE"]);
});

testCase("class removed vs base -> REJECT (REGISTRY-CLASS-REMOVED)", () => {
  expectCodes(checkRegistryMonotonicity(two, v1, "simulated-base"), ["REGISTRY-CLASS-REMOVED"]);
});

testCase("whole registry deleted -> REJECT for every base class", () => {
  const violations = checkRegistryMonotonicity(two, null, "simulated-base");
  expectCodes(violations, ["REGISTRY-CLASS-REMOVED"]);
  const removed = violations.filter((v) => v.includes("REGISTRY-CLASS-REMOVED"));
  if (removed.length !== 2) throw new Error(`expected 2 removed-class violations, got ${removed.length}`);
});

testCase("inline-alias laundered repoint -> REJECT (REGISTRY-UNPARSEABLE, fail-closed)", () => {
  expectCodes(checkRegistryMonotonicity(null, inlineAlias, "simulated-base"), ["REGISTRY-UNPARSEABLE"]);
});

testCase("REAL repo registry parses structurally (canary)", () => {
  const real = readFileSync(join(HERE, "..", "packages", "runtime", "workflows", "registry.ts"), "utf8");
  const { classes, problems } = parseRegistrySource(real, "registry@working-tree");
  if (problems.length > 0) throw new Error(`real registry has parse problems:\n${problems.join("\n")}`);
  if (classes.size === 0) throw new Error("real registry parsed to zero classes");
  for (const [cls, info] of classes) {
    if (!Number.isInteger(info.version)) throw new Error(`class ${cls} has no structural version`);
  }
});

// --- (f) registry-view integrity (Gate G1 MUST D) ----------------------------
console.log("registry-view integrity:");

testCase("correctly-shaped workflowsByName + safe workflowNames derivation -> OK", () => {
  expectClean(checkRegistryViewIntegrity(fixture("registry-view-good.ts.txt")));
});

testCase("workflowsByName absent (pre-G1 registry shape) -> OK (not a skip; genuinely N/A)", () => {
  expectClean(checkRegistryViewIntegrity(v1));
});

testCase("workflowsByName as an unfrozen spread copy -> REJECT (REGISTRY-VIEW-INTEGRITY)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-mutated.ts.txt")), ["REGISTRY-VIEW-INTEGRITY"]);
});

testCase("a second unverified view export mentioning workflows -> REJECT (REGISTRY-VIEW-INTEGRITY)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-altview.ts.txt")), ["REGISTRY-VIEW-INTEGRITY"]);
});

testCase("M8(b) an ALIASED RE-EXPORT (`export { x as workflowsByName }`, a shape the export-const scanner never sees) -> REJECT, never a silent pass (REGISTRY-VIEW-INTEGRITY)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-aliased-reexport.ts.txt")), ["REGISTRY-VIEW-INTEGRITY"]);
});

testCase("REAL repo registry's workflowsByName + workflowNames -> OK (canary)", () => {
  const real = readFileSync(join(HERE, "..", "packages", "runtime", "workflows", "registry.ts"), "utf8");
  expectClean(checkRegistryViewIntegrity(real, "registry@working-tree"));
});

// #11 (round-4 review, REOPENED) — the closed-world exports census.
testCase("#11 aliased bare re-export of a LOCAL (non-imported) declaration -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-alternate-export-bypass.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("#11 bare re-export of a NON-RELATIVE (package) import -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-nonrelative-reexport.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("#11 a function declared and exported directly in registry.ts -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-function-export.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("#11 a second const export that never references `workflows` at all -> REJECT (REGISTRY-VIEW-INTEGRITY, the now-unconditional half)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-bare-const-no-ref.ts.txt")), ["REGISTRY-VIEW-INTEGRITY"]);
});

testCase("#11 control: a LEGITIMATE bare re-export of an actually-imported, relatively-sourced workflow -> OK, never a false positive", () => {
  expectClean(checkRegistryViewIntegrity(fixture("registry-view-legit-reexport.ts.txt")));
});

// SHOULD-2 (round-5, opus reviewer's own probes) — the closed-world census previously matched
// only an ENUMERATED set of shapes (reject-known); these five probes each proved a real shape
// invisible to it, matching nothing and reporting zero violations.
testCase("SHOULD-2 `export * from \"...\"` (unbounded wildcard re-export) -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-star-reexport.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("SHOULD-2 `export * as ns from \"...\"` (namespace wildcard re-export) -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-star-as-reexport.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("SHOULD-2 `export {x} from \"./rel\"` (direct re-export, relative source, x never locally bound) -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-brace-from-relative.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("SHOULD-2 `export {x} from \"pkg\"` (direct re-export, package source) -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-brace-from-package.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("SHOULD-2 `export let alternateView = {...}` (the const-only name regex's own blind spot) -> REJECT (REGISTRY-VIEW-INTEGRITY)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-export-let.ts.txt")), ["REGISTRY-VIEW-INTEGRITY"]);
});

// round-6 (Codex #11) — "stop regex-parsing TypeScript; parse it": three probes that beat
// round-5's own regex census, now on the real TypeScript compiler API. Plus one novel probe.
testCase("round-6 probe 1: `workflowsByName` declared with an escaped identifier (\\u0077orkflowsByName) -> REJECT, the escape trick does not hide it from a real parser (REGISTRY-VIEW-INTEGRITY)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-escaped-identifier.ts.txt")), ["REGISTRY-VIEW-INTEGRITY"]);
});

testCase("round-6 probe 2: `export const workflows = {...} as const, workflowsByName = {...}` (multi-declarator; the second declarator is invisible to a first-match regex) -> REJECT (REGISTRY-VIEW-INTEGRITY)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-multi-declarator.ts.txt")), ["REGISTRY-VIEW-INTEGRITY"]);
});

testCase("round-6 probe 3: bare re-export of a RELATIVE import that resolves OUTSIDE packages/runtime/workflows/ (`../../evil.js`) -> REJECT, relativity alone is not target verification (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-reexport-escapes-directory.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-6 novel probe (self-devised): TYPE-ONLY exports (`export type {...} from \"../outside.js\"` and `export { type X, real }`) carry zero runtime surface -> OK, never a false REGISTRY-EXPORTS-CLOSED-WORLD reject", () => {
  expectClean(checkRegistryViewIntegrity(fixture("registry-view-type-only-reexport.ts.txt")));
});

// --- (e) enqueue-site provenance --------------------------------------------
console.log("enqueue-site provenance:");

// Fixtures are given VIRTUAL repo-relative paths under packages/runtime/src/ so
// "../workflows/registry.js" resolves to the real registry location purely.
const entry = (name) => [{ rel: `packages/runtime/src/${name.replace(/\.txt$/, "")}`, src: fixture(name) }];

testCase("enqueue via registry export -> OK", () => {
  expectClean(checkEnqueueSites(entry("enqueue-via-registry.ts.txt")));
});

testCase("#11 (round-4 review, REOPENED) enqueue via a NON-CANONICAL name imported FROM registry.ts -> REJECT (ENQUEUE-BYPASS)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-noncanonical-name-from-registry.ts.txt")), ["ENQUEUE-BYPASS"]);
});

testCase("direct workflow-module import -> REJECT (ENQUEUE-BYPASS)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-direct-import.ts.txt")), ["ENQUEUE-BYPASS"]);
});

testCase("THE bypass: registry ALSO imported, direct import enqueued -> REJECT (ENQUEUE-BYPASS)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-bypass-with-registry.ts.txt")), ["ENQUEUE-BYPASS"]);
});

testCase("aliased `start as launch` + direct import -> REJECT (ENQUEUE-BYPASS)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-aliased-direct.ts.txt")), ["ENQUEUE-BYPASS"]);
});

testCase("namespace api.start with registry argument -> OK", () => {
  expectClean(checkEnqueueSites(entry("enqueue-namespace-registry.ts.txt")));
});

testCase("namespace api.start with direct import -> REJECT (ENQUEUE-BYPASS)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-namespace-direct.ts.txt")), ["ENQUEUE-BYPASS"]);
});

testCase("dynamic import of the enqueue API -> REJECT (ENQUEUE-DYNAMIC, fail-closed)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-dynamic-import.ts.txt")), ["ENQUEUE-DYNAMIC"]);
});

testCase("local-variable workflow argument -> REJECT (ENQUEUE-UNTRACEABLE, fail-closed)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-local-var.ts.txt")), ["ENQUEUE-UNTRACEABLE"]);
});

testCase("re-exporting the enqueue API -> REJECT (ENQUEUE-REEXPORT, fail-closed)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-reexport.ts.txt")), ["ENQUEUE-REEXPORT"]);
});

testCase("S4-AB9 computed literal api[\"start\"] + direct import -> REJECT (ENQUEUE-BYPASS)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-computed-literal.ts.txt")), ["ENQUEUE-BYPASS"]);
});

testCase("computed literal api[\"start\"] with registry argument -> OK", () => {
  expectClean(checkEnqueueSites(entry("enqueue-computed-literal-registry.ts.txt")));
});

testCase("computed NON-literal api[s] -> REJECT (ENQUEUE-UNTRACEABLE, fail-closed)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-computed-nonliteral.ts.txt")), ["ENQUEUE-UNTRACEABLE"]);
});

testCase("uncalled computed extraction const go = api[\"start\"] -> REJECT (ENQUEUE-UNTRACEABLE)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-computed-uncalled.ts.txt")), ["ENQUEUE-UNTRACEABLE"]);
});

testCase("uncalled dot extraction const go = api.start -> REJECT (ENQUEUE-UNTRACEABLE)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-member-uncalled.ts.txt")), ["ENQUEUE-UNTRACEABLE"]);
});

testCase("S4-FX6 plain destructure const {start} = api -> REJECT (ENQUEUE-UNTRACEABLE)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-destructure-plain.ts.txt")), ["ENQUEUE-UNTRACEABLE"]);
});

testCase("S4-FX6 renamed destructure const {start: launch} = api (the probe) -> REJECT (ENQUEUE-UNTRACEABLE)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-destructure-renamed.ts.txt")), ["ENQUEUE-UNTRACEABLE"]);
});

testCase("S4-FX6 namespace re-alias const alias = api -> REJECT (ENQUEUE-UNTRACEABLE)", () => {
  expectCodes(checkEnqueueSites(entry("enqueue-namespace-realias.ts.txt")), ["ENQUEUE-UNTRACEABLE"]);
});

testCase("world lifecycle getWorld().start?.() -> OK (no false positive)", () => {
  expectClean(checkEnqueueSites(entry("not-enqueue-world-start.ts.txt")));
});

testCase("local function named `start`, no enqueue import -> OK (no false positive)", () => {
  expectClean(checkEnqueueSites(entry("not-enqueue-local-start.ts.txt")));
});

// -----------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\nfreeze-lint selftest: FAIL — ${failures} case(s) failed.`);
  process.exit(1);
}
console.log("\nfreeze-lint selftest: OK — all cases passed.");
process.exit(0);
