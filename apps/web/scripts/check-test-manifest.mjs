#!/usr/bin/env node
/**
 * apps/web/scripts/check-test-manifest.mjs — the test-manifest count-control
 * GATE (T0 seam, port-wave plan §3.1 / §7.2's "T0 owes this gate a positive
 * control"). Rides apps/web's `lint` script (no pipeline edit —
 * apps/web/AGENTS.md constraint 3's uniform ladder still runs the lint job on
 * every PR), matching check-token-contrast.mjs's own house pattern.
 *
 * WHAT IT CHECKS: every REAL test file on disk — `*.test.{ts,tsx,js,jsx,mjs,
 * cjs}` — appears, verbatim, as its own line in apps/web/test/manifest.txt.
 * scripts/run-tests.mjs (the `test` script's real body) reads that manifest
 * and feeds it straight to `node --test`; a file present on disk but absent
 * from the manifest is a file `pnpm test` silently never runs — the Node 20
 * runner does not directory-scan for `.test.ts`/`.test.tsx` at all
 * (apps/web/AGENTS.md), and its `.mjs`/`.cjs`/`.js` directory-scan (which DOES
 * work) is exactly the implicit mechanism this seam retires — see
 * run-tests.mjs's header for the five `.test.mjs` files that rode it
 * invisibly before this gate existed. Deliberately WIDER than the port-wave
 * plan's own `*.test.ts*` shorthand for that reason: a gate that only watched
 * `.test.ts*` would leave every `.test.mjs`/`.test.cjs`/`.test.js` file in the
 * app unprotected by the exact mechanism meant to protect all of them.
 *
 * Also flags a path listed MORE THAN ONCE in the manifest — never fatal on
 * its own (node --test would just run it twice), but it is exactly the shape
 * a bad 3-way merge across two trains produces, so it is surfaced rather than
 * silently tolerated.
 *
 * Does NOT check the reverse direction (a manifest line naming a file that no
 * longer exists on disk) — verified empirically (2026-08-28) that `node --test`
 * itself exits 1 and prints "Could not find '<path>'" for a missing listed
 * file, so that failure mode is already loud without this gate's help; adding
 * a duplicate check for it would be scope this seam does not need.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_FILE_RE = /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/;
const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".open-next", ".wrangler", ".git"]);

/**
 * Recursively lists every real test file under `rootAbs`, as POSIX-style
 * paths relative to `rootAbs` (matching how they are written in the manifest
 * and passed to `node --test`, regardless of the host OS's own separator).
 * @param {string} rootAbs
 * @returns {string[]} sorted, de-duplicated by construction (one fs entry each)
 */
export function listTestFilesOnDisk(rootAbs) {
  const out = [];
  (function walk(dirAbs) {
    for (const ent of readdirSync(dirAbs, { withFileTypes: true })) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      const abs = join(dirAbs, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile() && TEST_FILE_RE.test(ent.name)) {
        out.push(relative(rootAbs, abs).split(sep).join("/"));
      }
    }
  })(rootAbs);
  return out.sort();
}

/** One path per line; blank lines and `#`-prefixed comment lines ignored.
 *  Duplicates are kept (checkTestManifest reports them separately) — this is
 *  a literal parse, not a dedup. */
export function parseManifest(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * @param {string} rootAbs directory the manifest's paths are relative to
 * @param {string} manifestText raw contents of test/manifest.txt
 * @returns {{ missing: string[], duplicates: string[] }}
 *   `missing` — on disk, absent from the manifest (the gate's core job, sorted).
 *   `duplicates` — listed more than once in the manifest (sorted).
 */
export function checkTestManifest(rootAbs, manifestText) {
  const onDisk = listTestFilesOnDisk(rootAbs);
  const listed = parseManifest(manifestText);

  const listedSet = new Set();
  const duplicateSet = new Set();
  for (const p of listed) {
    if (listedSet.has(p)) duplicateSet.add(p);
    listedSet.add(p);
  }

  const missing = onDisk.filter((p) => !listedSet.has(p)).sort();
  const duplicates = [...duplicateSet].sort();
  return { missing, duplicates };
}

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(WEB_ROOT, "test", "manifest.txt");

export function main() {
  const manifestText = readFileSync(MANIFEST_PATH, "utf8");
  const { missing, duplicates } = checkTestManifest(WEB_ROOT, manifestText);

  if (missing.length === 0 && duplicates.length === 0) {
    const listedCount = parseManifest(manifestText).length;
    console.log(`[check-test-manifest] ${listedCount} test file(s) listed in test/manifest.txt — every real test file on disk is present, exactly once.`);
    return 0;
  }

  if (missing.length > 0) {
    console.log(`[check-test-manifest] ${missing.length} test file(s) exist on disk but are MISSING from test/manifest.txt — pnpm test would silently never run them:`);
    for (const p of missing) console.log(`  - ${p}`);
  }
  if (duplicates.length > 0) {
    console.log(`[check-test-manifest] ${duplicates.length} path(s) listed more than once in test/manifest.txt (a likely bad-merge artifact):`);
    for (const p of duplicates) console.log(`  - ${p}`);
  }
  console.log("");
  console.log("[check-test-manifest] failing the build. Add the missing line(s) to apps/web/test/manifest.txt (one path per line, alphabetical), or remove the duplicate(s).");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
