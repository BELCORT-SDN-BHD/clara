// #690 DEAD-NAME GUARD. `db-tests.md` (and its old path, `.claude/rules/db-tests.md`) does not
// exist anywhere in this repository — a `find . -iname db-tests.md` from the repo root returns
// nothing. Before this file, 48 comments under packages/ and apps/ still cited it (0 anchored),
// which reads as authority a reader cannot check (the exact failure #612's C-38 -- "correct
// obsolete references when changing owning tests" -- exists to close). The owner's ruling
// (2026-09-13, #690) was to strip the citations rather than recreate the file or fold its rules
// into a README; where a citation carried the "why", that sentence is now stated inline at the
// citation site instead. This guard is the durable half: it fails the suite the moment the dead
// name reappears anywhere under packages/db.
//
// SCOPE: packages/db only (this package's own write set). The apps/ half of the same sweep is
// tracked separately (#690's apps/ half, and #755 for apps/web/AGENTS.md).
//
// FAST — no rig needed: every cell here is a file read plus a text scan, no database
// connection, no CLARA_RIG_ALLOW_* gate. Runs in the ordinary all-packages sweep.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const DEAD_NAME = /db-tests\.md/;

/** Every git-tracked file under `packages/db`, relative to `REPO_ROOT` (git, not grep/sed/awk --
 *  #707's userland-free discipline applies to new db-suite code too). */
function trackedDbFiles() {
  return execFileSync("git", ["ls-files", "--", "packages/db"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Independent, in-process scan for the dead name: reads each of `relFiles` under `rootDir` and
 * reports the ones whose text contains `db-tests.md`. No shell-out.
 * @param {string[]} relFiles
 * @param {string} rootDir
 * @returns {string[]}
 */
export function findDeadNameCitations(relFiles, rootDir) {
  const hits = [];
  for (const rel of relFiles) {
    let text;
    try {
      text = readFileSync(join(rootDir, rel), "utf8");
    } catch {
      continue; // deleted between listing and read — not this guard's concern
    }
    if (DEAD_NAME.test(text)) hits.push(rel);
  }
  return hits;
}

test("690g1 · positive control: the scanner is not vacuous and finds a planted citation", () => {
  const dir = mkdtempSync(join(tmpdir(), "db-tests-md-guard-positive-"));
  try {
    writeFileSync(join(dir, "fixture.mjs"), "// see db-tests.md for the rule\n");
    const hits = findDeadNameCitations(["fixture.mjs"], dir);
    assert.deepEqual(hits, ["fixture.mjs"], "the scanner must flag a fixture comment that cites the dead name");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("690g2 · negative control: a citation-free fixture scans clean", () => {
  const dir = mkdtempSync(join(tmpdir(), "db-tests-md-guard-negative-"));
  try {
    writeFileSync(join(dir, "fixture.mjs"), "// see packages/db/README.md for the rule\n");
    const hits = findDeadNameCitations(["fixture.mjs"], dir);
    assert.deepEqual(hits, [], "a fixture with no dead-name citation must not be flagged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("690g3 · no citation of the dead db-tests.md name remains anywhere under packages/db", () => {
  const hits = findDeadNameCitations(trackedDbFiles(), REPO_ROOT);
  assert.deepEqual(
    hits,
    [],
    `db-tests.md citation(s) reintroduced under packages/db: ${hits.join(", ")} -- ` +
      "state the rule inline instead of citing a file that does not exist (#690).",
  );
});
