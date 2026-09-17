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

/** #795 — every frozen file (the ~120 workflow bodies + their relative import closure) is
 *  permanently exempt from the "ARCHITECTURE Appendix A" entry below: those bodies are
 *  byte-immutable (check-frozen-workflows.mjs), so a citation baked into one of them can
 *  never be repointed in place. Read from frozen-workflows.json rather than hand-listed —
 *  the manifest is the single source of truth for what is frozen, and re-baselining it
 *  already keeps this set current. */
function frozenManifestPaths(repoRoot) {
  try {
    const manifest = JSON.parse(readFileSync(join(repoRoot, "frozen-workflows.json"), "utf8"));
    return new Set(Object.keys(manifest.workflows ?? {}));
  } catch {
    return new Set();
  }
}

/** #795 — the explicit, deliberate allowlist for "ARCHITECTURE Appendix A": files that are
 *  not frozen (not in frozen-workflows.json) but still legitimately name the dead phrase —
 *  an immutable applied migration, the historical plan record, ARCHITECTURE.md's own
 *  supersession sentence (which names the dead phrase on purpose), and the editable
 *  freeze-lint / registry modules whose mentions this ticket does not repoint. */
const APPENDIX_A_ALLOWLIST = new Set([
  "packages/db/migrations/0006_runtime_core.sql",
  "docs/ARCHITECTURE.md",
  "docs/plan/active/refresh-wave-2026-09-14/brief-637.md",
  "docs/plan/active/refresh-wave-2026-09-14/reports/637-review-closure.md",
  "docs/plan/active/refresh-wave-2026-09-14/reports/followups-filed.md",
  "packages/runtime/workflows/registry.ts",
  "packages/runtime/nitro.config.ts",
  "scripts/freeze-lint-checks.mjs",
  "scripts/freeze-lint-enqueue.mjs",
]);

const FROZEN_MANIFEST_PATHS = frozenManifestPaths(REPO_ROOT);

/** The three dead names this guard refuses. Each `test` runs against a file's raw text and
 *  its repo-relative path — the path is needed so the third entry (#795) can exempt the
 *  frozen manifest and its explicit allowlist above; the first two entries ignore it. */
/** #795 — the two halves of the dead name, matched per LINE (see the entry below). Neither
 *  carries the `g` flag: a sticky `lastIndex` across calls would make this guard's answer
 *  depend on how many files it had already read. */
const APPENDIX_A = /appendix[^\S\n]+a\b/i;
const NAMES_ARCHITECTURE = /architecture/i;

const DEAD_NAMES = [
  { id: "apps/web/AGENTS.md", test: (text) => text.includes("apps/web/AGENTS.md") },
  { id: "db-tests.md", test: (text) => /db-tests\.md/.test(text) },
  {
    // #795 — THE DEAD NAME IS "ARCHITECTURE Appendix A", not "Appendix A". A bare
    // /appendix a/i anywhere in any tracked file would red a future document that
    // legitimately has an Appendix A of ITS OWN — and would red it with a message naming a
    // phrase that document never used, which is the worst kind of false positive: one whose
    // diagnosis is also wrong. So this entry is scoped to the NAME, the way the two entries
    // above are: a LINE that names `Appendix A` AND names ARCHITECTURE. That admits the
    // anchored phrase ("ARCHITECTURE Appendix A"), every citation shape around it
    // ("docs/ARCHITECTURE.md's Appendix A", "see ARCHITECTURE, Appendix A", "ARCHITECTURE.md
    // 的 Appendix A"), and nothing else. Somebody else's appendix is none of this guard's
    // business.
    id: "ARCHITECTURE Appendix A",
    test: (text, relPath) => {
      if (!APPENDIX_A.test(text)) return false;   // cheap whole-file reject before the line walk
      if (FROZEN_MANIFEST_PATHS.has(relPath) || APPENDIX_A_ALLOWLIST.has(relPath)) return false;
      return text.split("\n").some((line) => APPENDIX_A.test(line) && NAMES_ARCHITECTURE.test(line));
    },
  },
];

/** The guard's own two files name both dead names by necessity; they are the ONLY paths
 *  skipped by name, so moving or symlinking the guard elsewhere would make it fail against
 *  itself rather than silently widen the skip (review 2026-09-14). */
const SELF_PATHS = new Set(["scripts/check-dead-citations.mjs", "scripts/check-dead-citations.selftest.mjs"]);

/** Every git-tracked file in the repository (docs/, scripts/, .github/ and the root docs
 *  included — a dead name in a governing document is exactly what #755 was about), relative
 *  to `REPO_ROOT`, excluding the guard's own two files and any path with an
 *  EXCLUDE_DIR_SEGMENTS component (defensive — git ls-files already omits gitignored paths,
 *  but this keeps the scan honest if that ever changes).
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function trackedFiles(repoRoot) {
  return execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((rel) => !SELF_PATHS.has(rel))
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
      if (test(text, rel)) hits.push({ file: rel, name: id });
    }
  }
  return hits;
}

export function main() {
  const hits = findDeadNameCitations(trackedFiles(REPO_ROOT), REPO_ROOT);

  if (hits.length === 0) {
    console.log("[check-dead-citations] clean — no citation of apps/web/AGENTS.md, db-tests.md or ARCHITECTURE Appendix A anywhere in the repository (outside the frozen manifest and its explicit allowlist).");
    return 0;
  }

  console.log(`[check-dead-citations] ${hits.length} dead-name citation(s) found — none of these exist in this repository:`);
  for (const { file, name } of hits) console.log(`  - ${file}: cites "${name}"`);
  console.log("");
  console.log("[check-dead-citations] failing the build. State the rule inline (recovered from the citing comment's own wording), never cite a file that does not exist (#755, #690, #795).");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
