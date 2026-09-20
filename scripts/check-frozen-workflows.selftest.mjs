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

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  checkManifestPaths,
  checkRegistryMonotonicity,
  checkRegistryViewIntegrity,
  checkEnqueueSites,
  parseRegistrySource,
} from "./freeze-lint-checks.mjs";
import { computeFrozenClosures, formatClosureReport, scannedSourceFiles } from "./freeze-lint-closure.mjs";
import { compareFrozenManifestText } from "./frozen-manifest-compare.mjs";
import { retireFrozenEntry, checkRetiredRecords } from "./freeze-lint-retire.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
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

// round-7 (native adversarial leg, MUST #11) — the ACCEPTANCE half of the closed-world census
// (resolving a bare re-export's local name back to its real import) still ran on the regex-based
// parseImportBindings, over a blank that PRESERVES string literals — a decoy string shaped like
// an import statement could be trusted as a real one. D1-D4: the four decoy shapes reproduced
// live against the exported checker (D2) plus three more of the same class.
testCase("round-7 D1 (control): a decoy import-shaped string BEFORE the real import for the same name -> OK, safe by construction not by ordering luck", () => {
  expectClean(checkRegistryViewIntegrity(fixture("registry-view-import-decoy-before.ts.txt")));
});

testCase("round-7 D2 (live-reproduced finding): a decoy import-shaped STRING for a locally-declared function, positioned AFTER it -> REJECT, the decoy must never be trusted as a real binding (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-decoy-after.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-7 D3: the same decoy inside a REGEX LITERAL (blankSource's own documented blind spot for regex literals) -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-decoy-regex.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-7 D4: the same decoy inside an Error() diagnostic message string -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-decoy-error-message.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

// round-8 (native adversarial leg, MUST B) — round-7 pinned the EXPORT side's identity
// (`item.aliased`) but never checked what the SOURCE MODULE calls the thing being re-exported —
// an import-side alias, a namespace import, or a default import all sail through a perfectly
// plain `export { x };`. P-A..P-F, the six proof shapes the leg named.
testCase("round-8 P-A: import-side alias of a foreign binding (`import { real as alias }` then `export { alias }`) -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-alias-p-a.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-8 P-D: import-side alias of a REAL frozen export renamed to impersonate another version (chatTurn_v13 as chatTurn_v14) -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-alias-p-d.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-8 P-B: namespace import (`import * as X`) then `export { X }` -> REJECT, the direct asymmetry with round-6's unconditional `export * as ns` rejection (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-alias-p-b.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-8 P-C: default import bare-re-exported as a named export -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-alias-p-c.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-8 P-F: combined default+named import in one statement, the DEFAULT half smuggled out -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-alias-p-f.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-8 P-E (lowest severity, typecheck backstops): two imports claim the same local name, the SAFE unaliased one last -> OK, last-write-wins lands on the safe binding (never a false reject on a shape tsc itself would refuse to compile)", () => {
  expectClean(checkRegistryViewIntegrity(fixture("registry-view-import-alias-p-e.ts.txt")));
});

// round-9 (native adversarial leg, MUST) — round-8's own P-series pin (`b.imported ===
// item.exported`) was itself bypassable: an ES2022 STRING-LITERAL import alias
// (`import { "evil" as x }`) makes `propertyName` a StringLiteral, not an Identifier — the old
// `ts.isIdentifier(propertyName)` ternary guard failed on exactly this shape and silently fell
// back to the local name, never detecting an alias at all. N2/N5, the two proof shapes the leg
// reproduced live.
testCase("round-9 N2: an ES2022 STRING-LITERAL import alias (`import { \"evil\" as chatTurn_v1 }`) -> REJECT, propertyName being a StringLiteral must not defeat the round-8 pin (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-alias-n2.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

testCase("round-9 N5: P-D's own defeat (chatTurn_v13 impersonating chatTurn_v1) re-reached via a STRING-LITERAL import alias (`import { \"chatTurn_v13\" as chatTurn_v1 }`) -> REJECT (REGISTRY-EXPORTS-CLOSED-WORLD)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-import-alias-n5.ts.txt")), ["REGISTRY-EXPORTS-CLOSED-WORLD"]);
});

// --- (g) #637 — the PROVENANCE exports' shape --------------------------------
// `workflowBodies` / `workflowPins` are the registry's answer to "which bodies does this image
// carry, and which one does each class dispatch to". They are read by the boot line, by
// /api/build-info and by the rollback preflight, so they must be INERT, IMMUTABLE DATA: a frozen
// literal of string literals and nothing else. The shape rule is what keeps them from quietly
// becoming a second dynamic-dispatch view — which the enqueue-provenance law (e) would then
// trust by import source alone, exactly the hazard MUST D was minted against.
console.log("provenance-export shape (#637):");

testCase("#637 correctly-shaped workflowBodies + workflowPins (frozen literals of STRING literals) -> OK", () => {
  expectClean(checkRegistryViewIntegrity(fixture("registry-view-provenance-good.ts.txt")));
});

testCase("#637 provenance exports absent entirely (a pre-#637 registry shape) -> OK (genuinely N/A, not a skip)", () => {
  expectClean(checkRegistryViewIntegrity(fixture("registry-view-good.ts.txt")));
});

testCase("#637 workflowBodies as a BARE (unfrozen) array literal -> REJECT (REGISTRY-PROVENANCE-EXPORTS)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-provenance-unfrozen.ts.txt")), ["REGISTRY-PROVENANCE-EXPORTS"]);
});

testCase("#637 workflowPins whose values are IDENTIFIERS (a second frozen dispatch table of real workflow functions) -> REJECT (REGISTRY-PROVENANCE-EXPORTS)", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-provenance-nonliteral.ts.txt")), ["REGISTRY-PROVENANCE-EXPORTS"]);
});

testCase("#637 workflowBodies smuggled in as an ALIASED RE-EXPORT of a local array -> REJECT, never silently ignored because the const scanner cannot see it", () => {
  expectCodes(checkRegistryViewIntegrity(fixture("registry-view-provenance-aliased.ts.txt")), [
    "REGISTRY-PROVENANCE-EXPORTS",
    "REGISTRY-EXPORTS-CLOSED-WORLD",
  ]);
});

testCase("#637 REAL repo registry declares BOTH provenance exports, correctly shaped (canary — a deletion fails HERE, not in a rollback six weeks later)", () => {
  const real = readFileSync(join(HERE, "..", "packages", "runtime", "workflows", "registry.ts"), "utf8");
  expectClean(checkRegistryViewIntegrity(real, "registry@working-tree"));
  for (const name of ["workflowBodies", "workflowPins"]) {
    if (!/Object\.freeze\(/.test(real.slice(real.indexOf(`export const ${name}`)).split("\n")[0])) {
      throw new Error(`the real registry.ts must declare \`export const ${name} = Object.freeze(...)\``);
    }
  }
});

// --- (h) C77.2 — a frozen-manifest key under a TEST path is REFUSED ----------
// The manifest is the golden-hash ledger of DEPLOYED, immutable bodies. A `tests/` key registers
// a file that ships in no image and that no parked run can ever resume into, and it would then
// be hash-locked forever by the append-only rule — a permanent, unremovable entry minted by a
// typo or a careless `--update`. `isTestPath` already existed; until #637 it was consulted only
// for the enqueue-site scan, never for the manifest's own keys.
console.log("manifest-key hygiene (C77.2):");

testCase("C77.2 a manifest key under packages/runtime/tests/ -> REFUSED, naming the offending key (MANIFEST-TEST-PATH)", () => {
  const violations = checkManifestPaths(["packages/runtime/tests/foo.test.mjs"]);
  expectCodes(violations, ["MANIFEST-TEST-PATH"]);
  if (!violations[0].includes("packages/runtime/tests/foo.test.mjs")) {
    throw new Error(`the violation must NAME the offending key; got: ${violations[0]}`);
  }
});

testCase("C77.2 the other test-ish shapes isTestPath recognises (a __tests__ directory, a .spec.ts file) -> REFUSED too", () => {
  expectCodes(
    checkManifestPaths(["packages/runtime/__tests__/x.ts", "packages/runtime/workflows/x.spec.ts"]),
    ["MANIFEST-TEST-PATH"],
  );
});

testCase("C77.2 POSITIVE CONTROL: a valid production registration is clean — the rule must not reject the real thing", () => {
  expectClean(
    checkManifestPaths([
      "packages/runtime/workflows/claraWork.v2.ts",
      "packages/runtime/workflows/claraWork.v2.impl.ts",
      "packages/runtime/workflows/chatTurn.v18.ts",
    ]),
  );
});

testCase("C77.2 POSITIVE CONTROL: the REAL frozen manifest's every key passes (canary)", () => {
  const manifest = JSON.parse(readFileSync(join(HERE, "..", "frozen-workflows.json"), "utf8"));
  expectClean(checkManifestPaths(Object.keys(manifest.workflows ?? {})));
});

// --- (#810) THE RETIREMENT PATH ---------------------------------------------
// Owner ruling 2026-09-15 (#810): during beta a superseded body may leave the tree without a
// drain proof. The manifest stays append-only IN SPIRIT rather than in letter — an entry is MOVED
// to a `retired` record (path, last hash, ruling reference), never deleted — so the ledger still
// answers "what was this file's last frozen hash, and under whose ruling did it go". The two
// rules that gate a removal, MISSING (check-frozen-workflows.mjs) and REMOVED-VS-BASE /
// REMOVED-ENTRY (here), accept a retired entry and nothing else.
console.log("frozen-entry retirement (#810):");

const RETIRED_PATH = "packages/runtime/workflows/chatTurn.v1.ts";
const RETIRED_SHA = "a".repeat(64);
const RULING = "#810 owner ruling 2026-09-15";
const manifestText = (workflows, retired) =>
  JSON.stringify({ version: 1, workflows, ...(retired ? { retired } : {}) }, null, 2) + "\n";
const BASE_WITH_ENTRY = manifestText({ [RETIRED_PATH]: { sha256: RETIRED_SHA, note: "", deployed: true } });

testCase("#810 an entry MOVED to a `retired` record (same last hash, ruling cited) -> OK, never REMOVED-ENTRY", () => {
  const current = manifestText({}, { [RETIRED_PATH]: { sha256: RETIRED_SHA, ruling: RULING } });
  expectClean(compareFrozenManifestText(BASE_WITH_ENTRY, current, "base", "current").violations);
});

testCase("#810 an entry simply DROPPED with no retired record -> still REMOVED-ENTRY (the rule is relaxed for a recorded retirement, not abolished)", () => {
  expectCodes(compareFrozenManifestText(BASE_WITH_ENTRY, manifestText({}), "base", "current").violations, [
    "REMOVED-ENTRY",
  ]);
});

testCase("#810 a retired record whose sha256 is NOT the entry's last frozen hash -> REJECT (RETIRED-HASH-MISMATCH) — a retirement records history, it never rewrites it", () => {
  const current = manifestText({}, { [RETIRED_PATH]: { sha256: "b".repeat(64), ruling: RULING } });
  expectCodes(compareFrozenManifestText(BASE_WITH_ENTRY, current, "base", "current").violations, [
    "RETIRED-HASH-MISMATCH",
  ]);
});

testCase("#810 a retired record with no ruling reference -> REJECT (RETIRED-NO-RULING) — the citation is the whole authority for the removal", () => {
  const current = manifestText({}, { [RETIRED_PATH]: { sha256: RETIRED_SHA } });
  expectCodes(compareFrozenManifestText(BASE_WITH_ENTRY, current, "base", "current").violations, [
    "RETIRED-NO-RULING",
  ]);
});

testCase("#810 a retirement is MONOTONIC: an entry retired on the base cannot return to `workflows` -> REJECT (UNRETIRED-ENTRY)", () => {
  const base = manifestText({}, { [RETIRED_PATH]: { sha256: RETIRED_SHA, ruling: RULING } });
  const current = manifestText({ [RETIRED_PATH]: { sha256: RETIRED_SHA, note: "", deployed: true } });
  expectCodes(compareFrozenManifestText(base, current, "base", "current").violations, ["UNRETIRED-ENTRY"]);
});

testCase("#810 POSITIVE CONTROL: the REAL manifest's retired records each cite a ruling and carry a 64-hex last hash (canary)", () => {
  const real = JSON.parse(readFileSync(join(HERE, "..", "frozen-workflows.json"), "utf8"));
  for (const [path, record] of Object.entries(real.retired ?? {})) {
    if (!/^[0-9a-f]{64}$/.test(String(record.sha256))) throw new Error(`${path}: retired record has no 64-hex last hash`);
    if (!String(record.ruling ?? "").trim()) throw new Error(`${path}: retired record cites no ruling`);
    if (Object.hasOwn(real.workflows ?? {}, path)) throw new Error(`${path}: present in BOTH workflows and retired`);
  }
});

// --- (#815) PER-ENTRY CLOSURE ATTRIBUTION -----------------------------------
// The manifest is a FLAT set: it says a module is frozen, never which frozen entry reaches it.
// Four modules newly reached by chatTurn_v19 / claraWork_v3 carry hand-written `note` prose
// naming their reaching version, which is maintained by hand for four entries and can drift from
// the real import graph. `--print-closure` computes the attribution instead; these cells are its
// canary, run against the REAL repository tree (no fixtures — the property under test is the
// actual import graph, and a fixture of it would be the same prose by another name).
console.log("per-entry closure attribution (#815):");

const closureFiles = scannedSourceFiles(REPO_ROOT);
const closure = computeFrozenClosures(REPO_ROOT, closureFiles);
/** Entry files (sorted) whose own closure locks `rel`. */
const reachedBy = (rel) =>
  [...closure.byEntry.entries()].filter(([, mods]) => mods.includes(rel)).map(([entry]) => entry).sort();

const W = "packages/runtime/workflows/";
// THESE ROSTERS GROW WHEN A SUCCESSOR IS CUT, and that is the point of the cell rather than a
// nuisance: the wave 2026-09-15 cut (chatTurn_v20, claraWork_v4, clientOnboarding_v5) re-reached
// all four modules and this canary is what said so out loud. Every name below was MEASURED with
// `computeFrozenClosures` on the merged tree, not inferred from the successor's imports.
const ATTRIBUTION = [
  // #815 acceptance: knowledge.mjs under the 4 reaching chatTurn_v19 entry files — and, since the
  // wave 2026-09-15 cut, chatTurn_v20's four, claraWork_v4's two (its knowledge-context step) and
  // clientOnboarding_v5's two (interview.v4.known.ts's pre-read of the same pack). Since the wave
  // 2026-09-18 cut, chatTurn_v21's four and claraWork_v5's two as well. 18.
  //
  // NEITHER NEW PAIR REACHES IT DIRECTLY, AND THAT IS WORTH SAYING BECAUSE IT LOOKS LIKE A
  // CONTRADICTION. chatTurn_v21 and claraWork_v5 both REPOINTED their knowledge read away from
  // `clara.get_knowledge_pack` onto `clara.retrieve_knowledge`, through the new sibling
  // `lib/knowledge-retrieval.mjs` — which does not import `knowledge.mjs` at all. They still reach
  // it TRANSITIVELY, because v21's prompt re-exports v19's knowledge-context helpers and v5's impl
  // imports v4's, and a closure is reachability rather than intent. The repoint is about which
  // DOOR the running code calls; the old module stays in the graph as long as a predecessor's
  // exports are carried forward.
  ["packages/runtime/lib/knowledge.mjs", [
    `${W}chatTurn.v19.impl.ts`, `${W}chatTurn.v19.prompt.ts`, `${W}chatTurn.v19.tools.ts`, `${W}chatTurn.v19.ts`,
    `${W}chatTurn.v20.impl.ts`, `${W}chatTurn.v20.prompt.ts`, `${W}chatTurn.v20.tools.ts`, `${W}chatTurn.v20.ts`,
    `${W}chatTurn.v21.impl.ts`, `${W}chatTurn.v21.prompt.ts`, `${W}chatTurn.v21.tools.ts`, `${W}chatTurn.v21.ts`,
    `${W}claraWork.v4.impl.ts`, `${W}claraWork.v4.ts`,
    `${W}claraWork.v5.impl.ts`, `${W}claraWork.v5.ts`,
    `${W}clientOnboarding.v5.ts`, `${W}interview.v4.known.ts`,
  ]],
  // ... periodic-adjustment-basis.ts under the 5 reaching chatTurn_v19 entry files plus
  // chatTurn_v20's four and chatTurn_v21's four. Each successor carries its predecessor's tool map
  // forward, so each reaches this module too; neither v20 nor v21 has a `parts.ts` of its own (v19
  // stays the declarer), which is why this roster is 13 and not 15.
  ["packages/runtime/lib/periodic-adjustment-basis.ts", [
    `${W}chatTurn.v19.impl.ts`, `${W}chatTurn.v19.parts.ts`, `${W}chatTurn.v19.prompt.ts`, `${W}chatTurn.v19.tools.ts`, `${W}chatTurn.v19.ts`,
    `${W}chatTurn.v20.impl.ts`, `${W}chatTurn.v20.prompt.ts`, `${W}chatTurn.v20.tools.ts`, `${W}chatTurn.v20.ts`,
    `${W}chatTurn.v21.impl.ts`, `${W}chatTurn.v21.prompt.ts`, `${W}chatTurn.v21.tools.ts`, `${W}chatTurn.v21.ts`,
  ]],
  // ... capability-registry.mjs (reached ONLY transitively, through work-trace.mjs) and
  // work-trace.mjs (reached ONLY through a DYNAMIC import) under claraWork_v3's 2 entry files,
  // claraWork_v4's 2 and — since the wave 2026-09-18 cut — claraWork_v5's 2.
  // `lib/capability-registry.mjs:30` still says it is reached from the FROZEN claraWork_v3 body;
  // v4 and v5 reach it too, and that file is deploy-locked, so the sentence cannot be corrected in
  // place — this roster is where the true attribution is recorded.
  //
  // v5 REACHES capability-registry.mjs BY TWO PATHS NOW, not one. The transitive one through
  // work-trace.mjs is v3's and is unchanged; the second is `lib/capability-registry-v2.mjs`, which
  // v5's impl imports DIRECTLY and which carries v1's five entries by reference. That is the
  // sibling pattern #658 chose over editing a hash-locked module, and the attribution shows it
  // working: v1 is still reached, still unedited, and now reached on purpose.
  ["packages/runtime/lib/capability-registry.mjs", [
    `${W}claraWork.v3.impl.ts`, `${W}claraWork.v3.ts`,
    `${W}claraWork.v4.impl.ts`, `${W}claraWork.v4.ts`,
    `${W}claraWork.v5.impl.ts`, `${W}claraWork.v5.ts`,
  ]],
  ["packages/runtime/lib/work-trace.mjs", [
    `${W}claraWork.v3.impl.ts`, `${W}claraWork.v3.ts`,
    `${W}claraWork.v4.impl.ts`, `${W}claraWork.v4.ts`,
    `${W}claraWork.v5.impl.ts`, `${W}claraWork.v5.ts`,
  ]],
  // ... and the three modules this cut introduced, recorded here at their birth so the NEXT
  // successor's roster growth is measured against a written baseline rather than against nothing.
  // `work-trace-bounds.mjs` is #847's writer-side mirror, `capability-registry-v2.mjs` is #658's
  // registry sibling, and `knowledge-retrieval.mjs` is the bounded read both lanes now use — which
  // is why it alone is reached by BOTH classes.
  ["packages/runtime/lib/work-trace-bounds.mjs", [`${W}claraWork.v5.impl.ts`, `${W}claraWork.v5.ts`]],
  ["packages/runtime/lib/capability-registry-v2.mjs", [`${W}claraWork.v5.impl.ts`, `${W}claraWork.v5.ts`]],
  ["packages/runtime/lib/knowledge-retrieval.mjs", [
    `${W}chatTurn.v21.impl.ts`, `${W}chatTurn.v21.ts`,
    `${W}claraWork.v5.impl.ts`, `${W}claraWork.v5.ts`,
  ]],
];

for (const [rel, expected] of ATTRIBUTION) {
  testCase(`#815 ${rel} is attributed to exactly its ${expected.length} reaching frozen entr(ies)`, () => {
    const actual = reachedBy(rel);
    if (actual.join("\n") !== expected.join("\n")) {
      throw new Error(`expected:\n  ${expected.join("\n  ")}\ngot:\n  ${actual.join("\n  ") || "(none)"}`);
    }
  });
}

testCase("#815 the UNION of every per-entry closure equals the flat set the tool freezes (the report re-partitions, it never changes what is frozen)", () => {
  const union = new Set();
  for (const mods of closure.byEntry.values()) for (const m of mods) union.add(m);
  const flat = [...union].sort();
  if (flat.join("\n") !== closure.frozenRel.join("\n")) {
    const missing = closure.frozenRel.filter((r) => !union.has(r));
    const extra = flat.filter((r) => !closure.frozenRel.includes(r));
    throw new Error(`union != flat set; missing from union: ${missing.join(", ") || "(none)"}; extra: ${extra.join(", ") || "(none)"}`);
  }
});

testCase("#815 the flat set matches the manifest's registered entry count (the union is the manifest)", () => {
  const manifest = JSON.parse(readFileSync(join(HERE, "..", "frozen-workflows.json"), "utf8"));
  const registered = Object.keys(manifest.workflows ?? {}).length;
  if (closure.frozenRel.length !== registered) {
    throw new Error(`closure locks ${closure.frozenRel.length} module(s) but the manifest registers ${registered}`);
  }
});

// --- (#849) targeted `--print-closure <module>` + the `--retire` command ----
// #815 gave the closure report a per-entry PARTITION; the question an author actually asks is
// the INVERSE ("which entries lock module X"), and until now that meant grepping the full report
// by hand. `formatClosureReport`'s optional second argument filters to exactly that. `--retire`
// (#810's manifest shape, but no command to write it) is a pure function so this selftest can
// exercise every refusal without touching git, the real manifest file, or process.exit.
console.log("print-closure targeting + retire command (#849):");

testCase("#849 formatClosureReport(closure, module) prints only the entry files whose closure includes that module", () => {
  const closure = {
    frozenRel: ["packages/x/a.ts", "packages/x/b.ts"],
    byEntry: new Map([
      ["packages/x/entryOne.ts", ["packages/x/a.ts"]],
      ["packages/x/entryTwo.ts", ["packages/x/a.ts", "packages/x/b.ts"]],
      ["packages/x/entryThree.ts", ["packages/x/b.ts"]],
    ]),
  };
  const report = formatClosureReport(closure, "packages/x/a.ts");
  if (!report.includes("packages/x/entryOne.ts")) throw new Error(`expected entryOne (reaches a.ts) in:\n${report}`);
  if (!report.includes("packages/x/entryTwo.ts")) throw new Error(`expected entryTwo (reaches a.ts) in:\n${report}`);
  if (report.includes("packages/x/entryThree.ts")) throw new Error(`entryThree does NOT reach a.ts — must not appear:\n${report}`);
});

testCase("#849 targeted print-closure on a module NO entry reaches -> says so, lists nothing", () => {
  const closure = {
    frozenRel: ["packages/x/a.ts"],
    byEntry: new Map([["packages/x/entryOne.ts", ["packages/x/a.ts"]]]),
  };
  const report = formatClosureReport(closure, "packages/x/unreached.ts");
  if (report.includes("entryOne")) throw new Error(`entryOne does not reach the queried module:\n${report}`);
});

testCase("#849 REAL repo canary: filtering the real closure to lib/work-trace.mjs matches the #815 unfiltered attribution exactly", () => {
  const filtered = formatClosureReport(closure /* the module-level real closure computed above for #815 */, "packages/runtime/lib/work-trace.mjs");
  const reaching = new Set(reachedBy("packages/runtime/lib/work-trace.mjs"));
  for (const entry of reaching) {
    if (!filtered.includes(entry)) throw new Error(`expected ${entry} in filtered report:\n${filtered}`);
  }
  // L05-S03 (fix round): the inclusion loop above would still pass a filter that is a complete
  // no-op (one that ignores its argument and returns the FULL, unfiltered report) — it never
  // checks that anything is EXCLUDED. Assert the other half against the same real tree: at least
  // one real @frozen entry that does NOT reach this module must be ABSENT from the filtered report.
  const nonReaching = [...closure.byEntry.keys()].filter((entry) => !reaching.has(entry));
  if (nonReaching.length === 0) throw new Error("test fixture assumption broken: every real entry reaches this module, so exclusion cannot be proven here");
  for (const entry of nonReaching) {
    if (filtered.includes(entry)) throw new Error(`${entry} does NOT reach lib/work-trace.mjs and must be EXCLUDED from the filtered report:\n${filtered}`);
  }
});

const RETIRE_PATH_849 = "packages/runtime/workflows/chatTurn.v1.ts";
const RETIRE_SHA_849 = "c".repeat(64);
const RETIRE_RULING_849 = "#810 owner ruling 2026-09-15";
const manifestWithOneEntry = () => ({
  version: 1,
  workflows: { [RETIRE_PATH_849]: { sha256: RETIRE_SHA_849, note: "" } },
  retired: {},
});

testCase("#849 retireFrozenEntry moves the entry from workflows to retired, keeping its last hash and citing the ruling", () => {
  const result = retireFrozenEntry(manifestWithOneEntry(), RETIRE_PATH_849, RETIRE_RULING_849, false);
  if (!result.ok) throw new Error(`expected ok:true, got error: ${result.error}`);
  if (Object.hasOwn(result.manifest.workflows, RETIRE_PATH_849)) throw new Error("entry must be REMOVED from workflows");
  const record = result.manifest.retired[RETIRE_PATH_849];
  if (!record) throw new Error("entry must be PRESENT in retired");
  if (record.sha256 !== RETIRE_SHA_849) throw new Error(`retired sha256 must be the entry's last frozen hash; got ${record.sha256}`);
  if (record.ruling !== RETIRE_RULING_849) throw new Error(`retired ruling must be the given citation; got ${record.ruling}`);
});

testCase("#849 retireFrozenEntry's output leaves a subsequent verify (compareFrozenManifestText) clean — no RETIRED-* violation", () => {
  const base = manifestWithOneEntry();
  const baseText = JSON.stringify(base, null, 2) + "\n";
  const result = retireFrozenEntry(base, RETIRE_PATH_849, RETIRE_RULING_849, false);
  if (!result.ok) throw new Error(`expected ok:true, got error: ${result.error}`);
  const currentText = JSON.stringify(result.manifest, null, 2) + "\n";
  expectClean(compareFrozenManifestText(baseText, currentText, "base", "current").violations);
});

testCase("#849 fix round (L05B-S04): retireFrozenEntry's output is clean against check-frozen-workflows.mjs's OWN four retired-record invariants — RETIRED-DUPLICATE / RETIRED-NO-HASH / RETIRED-NO-RULING / RETIRED-PRESENT, not just compareFrozenManifestText's append-only comparison", () => {
  const result = retireFrozenEntry(manifestWithOneEntry(), RETIRE_PATH_849, RETIRE_RULING_849, false);
  if (!result.ok) throw new Error(`expected ok:true, got error: ${result.error}`);
  // fileExistsInTree: false for every path — mirrors the refusal-checked precondition
  // (retireFrozenEntry already refused if the file were still present at retire time).
  expectClean(checkRetiredRecords(result.manifest, () => false));
});

testCase("#849 fix round (L05B-S04): checkRetiredRecords DOES fire all four codes on a deliberately broken retired record — the AC2 cell above is not vacuously clean", () => {
  const broken = {
    workflows: { [RETIRE_PATH_849]: { sha256: RETIRE_SHA_849 } }, // RETIRED-DUPLICATE: also still in workflows
    retired: { [RETIRE_PATH_849]: { sha256: "not-a-hash", ruling: "" } }, // RETIRED-NO-HASH + RETIRED-NO-RULING
  };
  expectCodes(checkRetiredRecords(broken, () => true /* RETIRED-PRESENT */), [
    "RETIRED-DUPLICATE",
    "RETIRED-NO-HASH",
    "RETIRED-NO-RULING",
    "RETIRED-PRESENT",
  ]);
});

testCase("#849 retireFrozenEntry refuses, with NO manifest write, when the target file is still present in the tree", () => {
  const manifest = manifestWithOneEntry();
  const result = retireFrozenEntry(manifest, RETIRE_PATH_849, RETIRE_RULING_849, /* fileExistsInTree */ true);
  if (result.ok) throw new Error("expected ok:false — the file is still in the tree");
  if (!Object.hasOwn(manifest.workflows, RETIRE_PATH_849)) throw new Error("the ORIGINAL manifest object must be untouched on refusal");
});

testCase("#849 retireFrozenEntry refuses, with NO manifest write, when the target has no current manifest entry", () => {
  const manifest = { version: 1, workflows: {}, retired: {} };
  const result = retireFrozenEntry(manifest, "packages/runtime/workflows/never-registered.ts", RETIRE_RULING_849, false);
  if (result.ok) throw new Error("expected ok:false — no current entry to retire");
});

testCase("#849 retireFrozenEntry refuses when --ruling is missing or blank", () => {
  const manifest = manifestWithOneEntry();
  const withoutRuling = retireFrozenEntry(manifest, RETIRE_PATH_849, "", false);
  if (withoutRuling.ok) throw new Error("expected ok:false — no ruling cited");
  const withUndefinedRuling = retireFrozenEntry(manifest, RETIRE_PATH_849, undefined, false);
  if (withUndefinedRuling.ok) throw new Error("expected ok:false — no ruling cited");
});

// L05-S02 (fix round): every refusal above is exercised through the pure retireFrozenEntry, but
// the "no path given at all" case lives in check-frozen-workflows.mjs's OWN argv wiring (the
// `if (RETIRE_PATH)` gate around the whole retire block), which retireFrozenEntry never sees and
// which this file cannot import directly (`process.exit(main())` runs at module load). Spawn the
// real CLI instead, the same through-the-CLI pattern scripts/ops/dsn-pipe.selftest.mjs uses.
testCase("#849 `--retire` with NO path argument REFUSES (exit 1) instead of silently falling through to an ordinary verify", () => {
  const manifestPath = join(REPO_ROOT, "frozen-workflows.json");
  const before = readFileSync(manifestPath, "utf8");
  const result = spawnSync(process.execPath, [join(HERE, "check-frozen-workflows.mjs"), "--retire"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const after = readFileSync(manifestPath, "utf8");
  if (after !== before) throw new Error("--retire with no path argument must not write the manifest");
  if (result.status === 0) {
    throw new Error(`--retire with no path argument must REFUSE (exit 1); got exit 0 with stdout:\n${result.stdout}`);
  }
  if (!/--retire requires a path argument/i.test(result.stderr)) {
    throw new Error(`expected a usage message naming the missing path argument; got stderr:\n${result.stderr}`);
  }
});

testCase("#849 fix round (L05B-S04): a SUCCESSFUL --retire, through the REAL CLI against a temp manifest, actually writes — not just the refusal paths above", () => {
  // Every other #849 CLI cell in this file drives only a REFUSAL against the real repo tree
  // (safe: a refusal never writes). A successful --retire DOES write, so it needs its own
  // throwaway repo: a fresh temp dir, `git init`'d so REPO_ROOT (`git rev-parse --show-toplevel`)
  // resolves there, with its own frozen-workflows.json and no "packages" dir at all — the
  // closure/scanned-files walk above the --retire branch then trivially finds nothing, and
  // never touches this repo's own real manifest.
  const root = mkdtempSync(join(tmpdir(), "freeze-lint-retire-cli-"));
  try {
    const initGit = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
    if (initGit.status !== 0) throw new Error(`git init failed in ${root}: ${initGit.stderr}`);
    const beforeManifest = { version: 1, workflows: { [RETIRE_PATH_849]: { sha256: RETIRE_SHA_849, note: "" } }, retired: {} };
    const manifestPath = join(root, "frozen-workflows.json");
    writeFileSync(manifestPath, JSON.stringify(beforeManifest, null, 2) + "\n", "utf8");
    const result = spawnSync(
      process.execPath,
      [join(HERE, "check-frozen-workflows.mjs"), "--retire", RETIRE_PATH_849, "--ruling", RETIRE_RULING_849],
      { cwd: root, encoding: "utf8", env: { ...process.env, CI: "", GITHUB_ACTIONS: "" } },
    );
    if (result.status !== 0) {
      throw new Error(`expected exit 0 for a successful --retire; got ${result.status}, stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    }
    if (!result.stdout.includes(`retired "${RETIRE_PATH_849}"`)) {
      throw new Error(`expected the retire success message naming the path; got stdout:\n${result.stdout}`);
    }
    const afterText = readFileSync(manifestPath, "utf8");
    const after = JSON.parse(afterText);
    if (Object.hasOwn(after.workflows, RETIRE_PATH_849)) throw new Error("the written manifest must no longer carry the entry under workflows");
    const record = after.retired?.[RETIRE_PATH_849];
    if (!record || record.sha256 !== RETIRE_SHA_849 || record.ruling !== RETIRE_RULING_849) {
      throw new Error(`the written manifest's retired record is wrong: ${JSON.stringify(after.retired)}`);
    }
    // The write itself must be exactly what retireFrozenEntry (already unit-tested above) would
    // produce, byte for byte — proving the CLI's writeFileSync call did not reshape it.
    const expected = JSON.stringify({ version: 1, workflows: {}, retired: { [RETIRE_PATH_849]: { sha256: RETIRE_SHA_849, ruling: RETIRE_RULING_849 } } }, null, 2) + "\n";
    if (afterText !== expected) throw new Error(`written manifest text does not byte-match the expected retireFrozenEntry output:\nexpected:\n${expected}\ngot:\n${afterText}`);
    // And it must pass the SAME retired-record verifier AC2 names (the retired file was never
    // created in this throwaway repo, so fileExistsInTree is always false here).
    expectClean(checkRetiredRecords(after, () => false));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

testCase("#849 `--retire --ruling <ref>` (the path slot holding the NEXT flag, not a path) also REFUSES rather than treating \"--ruling\" as the path", () => {
  const manifestPath = join(REPO_ROOT, "frozen-workflows.json");
  const before = readFileSync(manifestPath, "utf8");
  const result = spawnSync(process.execPath, [join(HERE, "check-frozen-workflows.mjs"), "--retire", "--ruling", "#810 owner ruling 2026-09-15"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const after = readFileSync(manifestPath, "utf8");
  if (after !== before) throw new Error("--retire with a flag (not a path) in the path slot must not write the manifest");
  if (result.status === 0) {
    throw new Error(`--retire with no real path must REFUSE (exit 1); got exit 0 with stdout:\n${result.stdout}`);
  }
});

testCase("(L05-STD-02 fix round) `--ruling` followed by another flag (not a ruling citation) is treated as NO ruling given, the same guard --print-closure's module and --retire's path already apply — not swallowed as the literal ruling text", () => {
  const manifestPath = join(REPO_ROOT, "frozen-workflows.json");
  const before = readFileSync(manifestPath, "utf8");
  // A path that does not even exist in the real manifest — safe, because the missing-ruling
  // refusal must fire BEFORE retireFrozenEntry ever looks the path up (see its own ruling-first
  // check), so this cell never depends on the real repo's manifest contents.
  const result = spawnSync(
    process.execPath,
    [join(HERE, "check-frozen-workflows.mjs"), "--retire", "packages/runtime/workflows/does-not-exist-in-manifest.ts", "--ruling", "--child-os"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  const after = readFileSync(manifestPath, "utf8");
  if (after !== before) throw new Error("must not write the manifest when --ruling's value is actually another flag");
  if (result.status === 0) throw new Error(`expected a refusal (exit 1); got exit 0 with stdout:\n${result.stdout}`);
  if (!/requires --ruling/i.test(result.stderr)) {
    throw new Error(`expected the MISSING-RULING refusal specifically (proving "--child-os" was not accepted as the ruling text); got stderr:\n${result.stderr}`);
  }
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
