#!/usr/bin/env node
/**
 * scripts/check-dead-citations.mjs — the repo-wide DEAD-NAME GUARD for #755 and #690.
 *
 * WHY THIS IS ROOT-LEVEL, NOT PER-PACKAGE. #755 ("apps/web/AGENTS.md is cited as the
 * governing standard by dozens of web modules but does not exist") and #690 ("bare
 * db-tests.md citations remain in code comments") are the SAME failure mode for two
 * different dead file names: a comment cites a doc that does not exist anywhere in this
 * repository, so the rule it invokes cannot be spot-checked (AGENTS.md working protocol
 * §7: "claims need evidence"). The owner's ruling on both (2026-09-13) was to strip the
 * citations, recovering the substantive rule inline where the citation carried the
 * comment's "why", rather than recreate either file. This script is the durable half —
 * one check, one home, for both dead names, so neither can quietly return anywhere under
 * `packages/` or `apps/`. Before this file, #690's phase-1 half shipped a guard scoped to
 * `packages/db` only (`packages/db/tests/db-tests-md-citation-guard.test.mjs`); it is
 * retired by this script rather than kept alongside it — the task instruction is explicit
 * ("do not ship two checks for the same names"), and a package-scoped guard for one of two
 * dead names, chained nowhere near the other name's guard, is exactly the split source of
 * truth AGENTS.md working protocol §7.3 (single source of truth) exists to prevent.
 *
 * SCOPE: every git-tracked file under `packages/` and `apps/` (this repo's two source
 * trees; `node_modules`, `.next`, `.open-next`, `.wrangler` and `.git` are excluded
 * defensively even though `git ls-files` never returns gitignored paths). Chained into the
 * ROOT `lint` script (package.json), beside check-leaks.mjs, so it runs on every PR
 * regardless of which package changed.
 *
 * FAST — no rig needed: every cell here is `git ls-files` plus a file read plus a text
 * scan, no database connection, no CLARA_RIG_ALLOW_* gate.
 *
 * No dependencies — Node built-ins only.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

const EXCLUDE_DIR_SEGMENTS = new Set(["node_modules", ".next", ".open-next", ".wrangler", ".git"]);

/** The two dead names this guard refuses. Each `test` runs against a file's raw text. */
const DEAD_NAMES = [
  { id: "apps/web/AGENTS.md", test: (text) => text.includes("apps/web/AGENTS.md") },
  { id: "db-tests.md", test: (text) => /db-tests\.md/.test(text) },
];

/** Every git-tracked file under `packages/` and `apps/`, relative to `REPO_ROOT`,
 *  excluding any path with an EXCLUDE_DIR_SEGMENTS component (defensive — git ls-files
 *  already omits gitignored paths, but this keeps the scan honest if that ever changes).
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function trackedFiles(repoRoot) {
  return execFileSync("git", ["ls-files", "--", "packages", "apps"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((rel) => !rel.split("/").some((seg) => EXCLUDE_DIR_SEGMENTS.has(seg)));
}

/**
 * Independent, in-process scan for either dead name: reads each of `relFiles` under
 * `rootDir` and reports every (file, name) pair whose text still cites it. No shell-out.
 * @param {string[]} relFiles
 * @param {string} rootDir
 * @returns {Array<{ file: string, name: string }>}
 */
export function findDeadNameCitations(relFiles, rootDir) {
  const hits = [];
  for (const rel of relFiles) {
    let text;
    try {
      text = readFileSync(join(rootDir, rel), "utf8");
    } catch {
      continue; // deleted between listing and read, or not a text file — not this guard's concern
    }
    for (const { id, test } of DEAD_NAMES) {
      if (test(text)) hits.push({ file: rel, name: id });
    }
  }
  return hits;
}

export function main() {
  const hits = findDeadNameCitations(trackedFiles(REPO_ROOT), REPO_ROOT);

  if (hits.length === 0) {
    console.log("[check-dead-citations] clean — no citation of apps/web/AGENTS.md or db-tests.md under packages/ or apps/.");
    return 0;
  }

  console.log(`[check-dead-citations] ${hits.length} dead-name citation(s) found — neither file exists in this repository:`);
  for (const { file, name } of hits) console.log(`  - ${file}: cites "${name}"`);
  console.log("");
  console.log("[check-dead-citations] failing the build. State the rule inline (recovered from the citing comment's own wording), never cite a file that does not exist (#755, #690).");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
