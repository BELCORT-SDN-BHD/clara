#!/usr/bin/env node
// Self-test for the repo-wide dead-citation gate (#755, #690: "a gate that has never been
// SEEN to go red is an assertion, not a control").
//
//   node scripts/check-dead-citations.selftest.mjs   # exit 0 green, 1 red
//
// Same shape as scripts/check-frozen-workflows.selftest.mjs and
// apps/web/scripts/check-test-manifest.selftest.mjs: a fixture tree under the OS temp dir
// (never the real repo) drives the exported pure functions directly, plus a LAST case that
// runs the real gate's `findDeadNameCitations` against THIS repo's real tracked files and
// requires it green today — so the fixture cases can never diverge from what actually ships.
//
// No dependencies — Node built-ins only.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findDeadNameCitations, trackedFiles } from "./check-dead-citations.mjs";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPTS_DIR, "..");

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

function write(root, relPath, content) {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}
function freshFixture() {
  return mkdtempSync(join(tmpdir(), "check-dead-citations-selftest-"));
}
function rm(root) {
  rmSync(root, { recursive: true, force: true });
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

// ---------------------------------------------------------------------------
// (1) POSITIVE CONTROL — a planted citation of EACH dead name must be flagged.
// ---------------------------------------------------------------------------
console.log("findDeadNameCitations — positive controls:");
{
  const dir = freshFixture();
  try {
    write(dir, "packages/db/tests/fixture-a.mjs", "// see apps/web/AGENTS.md for the rule\n");
    write(dir, "apps/web/lib/fixture-b.ts", "// db-tests.md: some rule\n");
    const hits = findDeadNameCitations(["packages/db/tests/fixture-a.mjs", "apps/web/lib/fixture-b.ts"], dir);
    testCase("flags a planted apps/web/AGENTS.md citation under packages/", () => {
      assertDeepEqual(
        hits.filter((h) => h.file === "packages/db/tests/fixture-a.mjs"),
        [{ file: "packages/db/tests/fixture-a.mjs", name: "apps/web/AGENTS.md" }],
        "must flag the fixture citing apps/web/AGENTS.md",
      );
    });
    testCase("flags a planted db-tests.md citation under apps/", () => {
      assertDeepEqual(
        hits.filter((h) => h.file === "apps/web/lib/fixture-b.ts"),
        [{ file: "apps/web/lib/fixture-b.ts", name: "db-tests.md" }],
        "must flag the fixture citing db-tests.md",
      );
    });
  } finally {
    rm(dir);
  }
}

// ---------------------------------------------------------------------------
// (2) NEGATIVE CONTROL — a citation-free fixture, and a fixture citing the repo
//     ROOT's own `AGENTS.md` (which DOES exist — only `apps/web/AGENTS.md` and
//     `db-tests.md` are dead names), scan clean.
// ---------------------------------------------------------------------------
console.log("findDeadNameCitations — negative controls:");
{
  const dir = freshFixture();
  try {
    write(dir, "packages/db/tests/fixture-c.mjs", "// see AGENTS.md at the repo root for the rule\n");
    write(dir, "apps/web/lib/fixture-d.ts", "// see packages/db/README.md instead\n");
    const hits = findDeadNameCitations(["packages/db/tests/fixture-c.mjs", "apps/web/lib/fixture-d.ts"], dir);
    testCase("a citation of the repo-root AGENTS.md (which exists) is not flagged", () => {
      assertDeepEqual(hits, [], "must not flag a fixture that cites a file that actually exists");
    });
  } finally {
    rm(dir);
  }
}

// ---------------------------------------------------------------------------
// (3) THE REAL GATE, AGAINST THE REAL REPO — must be green today.
// ---------------------------------------------------------------------------
console.log("the real gate, against this repo's real tracked files:");
{
  testCase("packages/ and apps/ carry no citation of apps/web/AGENTS.md or db-tests.md today", () => {
    const hits = findDeadNameCitations(trackedFiles(REPO_ROOT), REPO_ROOT);
    if (hits.length > 0) {
      throw new Error(
        `expected zero dead-name citations, found ${hits.length}: ` +
          hits.map((h) => `${h.file} (${h.name})`).join(", "),
      );
    }
  });
}

console.log("");
if (failures > 0) {
  console.error(`[check-dead-citations.selftest] ${failures} case(s) FAILED.`);
  process.exit(1);
} else {
  console.log("[check-dead-citations.selftest] all cases passed.");
  process.exit(0);
}
