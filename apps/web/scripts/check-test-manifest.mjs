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
 * FOLD (Codex round-3, LOW manifest ordering drift): also flags an ADJACENT
 * pair that violates the manifest's own documented contract (the file's own
 * header: "One path per line, alphabetical by directory then name"). Before
 * this fold the header was prose only — a directory-name PREFIX collision
 * (`firm/` sorting after `firm-admin/`, since `/` is U+002F and `-` is
 * U+002D) or an uppercase-leading filename (`EnrolAccountDialog.test.ts`
 * sorting before every lowercase name in its directory) could silently drift
 * the file out of order with nothing catching it — this check makes that
 * mechanical. Comparison is a PLAIN STRING COMPARE, the same default
 * `Array.prototype.sort()` semantics `listTestFilesOnDisk` above already
 * uses, not a "directory first, then name" human reading.
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
 * @returns {{ missing: string[], duplicates: string[], outOfOrder: Array<{before: string, after: string}> }}
 *   `missing` — on disk, absent from the manifest (the gate's core job, sorted).
 *   `duplicates` — listed more than once in the manifest (sorted).
 *   `outOfOrder` — adjacent LISTED pairs (in file order) where the later line
 *   sorts BEFORE the earlier one — each entry names both lines involved.
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

  const outOfOrder = [];
  for (let i = 1; i < listed.length; i++) {
    if (listed[i] < listed[i - 1]) {
      outOfOrder.push({ before: listed[i - 1], after: listed[i] });
    }
  }

  return { missing, duplicates, outOfOrder };
}

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(WEB_ROOT, "test", "manifest.txt");

export function main() {
  const manifestText = readFileSync(MANIFEST_PATH, "utf8");
  const { missing, duplicates, outOfOrder } = checkTestManifest(WEB_ROOT, manifestText);

  if (missing.length === 0 && duplicates.length === 0 && outOfOrder.length === 0) {
    const listedCount = parseManifest(manifestText).length;
    console.log(`[check-test-manifest] ${listedCount} test file(s) listed in test/manifest.txt — every real test file on disk is present, exactly once, in alphabetical order.`);
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
  if (outOfOrder.length > 0) {
    console.log(`[check-test-manifest] ${outOfOrder.length} adjacent pair(s) out of alphabetical order in test/manifest.txt:`);
    for (const { before, after } of outOfOrder) console.log(`  - "${after}" is listed AFTER "${before}" but sorts before it`);
  }
  console.log("");
  console.log("[check-test-manifest] failing the build. Add the missing line(s), remove the duplicate(s), and/or reorder the listed line(s) in apps/web/test/manifest.txt (one path per line, alphabetical — a plain string compare, not a directory-first human reading).");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
