#!/usr/bin/env node
// Self-test for the test-manifest count-control gate (T0 seam, port-wave plan
// §7.2's "T0 owes this gate a positive control — a deliberately unlisted test
// file must make CI red, proven, not asserted").
//
//   node scripts/check-test-manifest.selftest.mjs   # exit 0 green, 1 red
//
// Same shape as scripts/check-harness-links.selftest.mjs: builds a throwaway
// fixture tree under the OS temp dir (never the real repo) and drives
// checkTestManifest()/parseManifest() directly against it — a pure-function
// test, not a real `node --test` spawn (that half is proven separately by
// this file's LAST case, which runs the real gate CLI against THIS repo's
// real tree and asserts it is green today).
//
// No dependencies — Node built-ins only.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { checkTestManifest, parseManifest, listTestFilesOnDisk } from "./check-test-manifest.mjs";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  return mkdtempSync(join(tmpdir(), "check-test-manifest-selftest-"));
}
function rm(root) {
  rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// (1) parseManifest — blank lines and comments ignored, order preserved.
// ---------------------------------------------------------------------------
console.log("parseManifest:");
{
  const parsed = parseManifest("# a header comment\n\nlib/a.test.ts\n  lib/b.test.ts  \n\n# another comment\nlib/c.test.mjs\n");
  testCase("ignores blank lines and # comments, trims whitespace, keeps order", () => {
    const expected = ["lib/a.test.ts", "lib/b.test.ts", "lib/c.test.mjs"];
    if (JSON.stringify(parsed) !== JSON.stringify(expected)) {
      throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(parsed)}`);
    }
  });
}

// ---------------------------------------------------------------------------
// (2) listTestFilesOnDisk — finds every extension the gate claims to cover,
//     skips node_modules, does not match a non-test file of the same stem.
// ---------------------------------------------------------------------------
console.log("listTestFilesOnDisk:");
{
  const root = freshFixture();
  write(root, "lib/a.test.ts", "// t");
  write(root, "lib/b.test.tsx", "// t");
  write(root, "lib/c.test.js", "// t");
  write(root, "lib/d.test.jsx", "// t");
  write(root, "tests/e.test.mjs", "// t");
  write(root, "tests/f.test.cjs", "// t");
  write(root, "lib/not-a-test.ts", "// not a test file");
  write(root, "lib/helper.ts", "// a helper, not *.test.*");
  write(root, "node_modules/some-pkg/x.test.ts", "// must be excluded");
  write(root, ".next/cache/y.test.ts", "// must be excluded (build output)");

  const found = listTestFilesOnDisk(root);
  rm(root);

  testCase("finds all six real test extensions and excludes non-test/build-output files", () => {
    const expected = [
      "lib/a.test.ts", "lib/b.test.tsx", "lib/c.test.js", "lib/d.test.jsx",
      "tests/e.test.mjs", "tests/f.test.cjs",
    ].sort();
    if (JSON.stringify(found) !== JSON.stringify(expected)) {
      throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(found)}`);
    }
  });
}

// ---------------------------------------------------------------------------
// (3) THE POSITIVE CONTROL — port-wave plan §7.2's own ask: a deliberately
//     unlisted test file must make the gate RED. Proven by ACTUALLY calling
//     checkTestManifest() against a fixture that has one, and asserting the
//     finding names it — not merely asserting the code compiles.
// ---------------------------------------------------------------------------
console.log("checkTestManifest — THE POSITIVE CONTROL:");
{
  const root = freshFixture();
  write(root, "lib/a.test.ts", "// t");
  write(root, "lib/b.test.ts", "// t");
  write(root, "lib/UNLISTED.test.ts", "// deliberately absent from the manifest below");
  const manifestText = "lib/a.test.ts\nlib/b.test.ts\n";

  const { missing, duplicates } = checkTestManifest(root, manifestText);
  rm(root);

  testCase("a real on-disk test file missing from the manifest is caught by name (RED)", () => {
    if (missing.length !== 1 || missing[0] !== "lib/UNLISTED.test.ts") {
      throw new Error(`expected missing === ["lib/UNLISTED.test.ts"], got ${JSON.stringify(missing)}`);
    }
  });
  testCase("no false-positive duplicate finding on this fixture", () => {
    if (duplicates.length !== 0) throw new Error(`expected no duplicates, got ${JSON.stringify(duplicates)}`);
  });
}

// ---------------------------------------------------------------------------
// (4) The restored-green case — the SAME fixture, with the previously-missing
//     file added to the manifest. Proves the gate is not merely permissive
//     (finding nothing by construction) but tracks a real fix.
// ---------------------------------------------------------------------------
console.log("checkTestManifest — restored to green:");
{
  const root = freshFixture();
  write(root, "lib/a.test.ts", "// t");
  write(root, "lib/b.test.ts", "// t");
  write(root, "lib/UNLISTED.test.ts", "// now listed below");
  const manifestText = "lib/a.test.ts\nlib/b.test.ts\nlib/UNLISTED.test.ts\n";

  const { missing, duplicates } = checkTestManifest(root, manifestText);
  rm(root);

  testCase("adding the missing line clears the finding", () => {
    if (missing.length !== 0) throw new Error(`expected zero missing, got ${JSON.stringify(missing)}`);
    if (duplicates.length !== 0) throw new Error(`expected zero duplicates, got ${JSON.stringify(duplicates)}`);
  });
}

// ---------------------------------------------------------------------------
// (5) A path listed twice is flagged as a duplicate, not silently ignored.
// ---------------------------------------------------------------------------
console.log("checkTestManifest — duplicate line:");
{
  const root = freshFixture();
  write(root, "lib/a.test.ts", "// t");
  const manifestText = "lib/a.test.ts\nlib/a.test.ts\n";

  const { missing, duplicates } = checkTestManifest(root, manifestText);
  rm(root);

  testCase("a path listed twice is reported as a duplicate", () => {
    if (duplicates.length !== 1 || duplicates[0] !== "lib/a.test.ts") {
      throw new Error(`expected duplicates === ["lib/a.test.ts"], got ${JSON.stringify(duplicates)}`);
    }
  });
  testCase("a duplicate is not also reported as missing", () => {
    if (missing.length !== 0) throw new Error(`expected zero missing, got ${JSON.stringify(missing)}`);
  });
}

// ---------------------------------------------------------------------------
// (5b) FOLD (Codex round-3, LOW manifest ordering drift) — THE POSITIVE
//      CONTROL for ordering: a deliberately out-of-order fixture must make
//      the gate RED, proven by actually calling checkTestManifest() rather
//      than merely asserting the code compiles — the same discipline (3)
//      above already applies to the missing-file check.
// ---------------------------------------------------------------------------
console.log("checkTestManifest — ORDERING positive control:");
{
  const root = freshFixture();
  write(root, "lib/b.test.ts", "// t");
  write(root, "lib/a.test.ts", "// t");
  // Listed in the WRONG order — "b" before "a".
  const manifestText = "lib/b.test.ts\nlib/a.test.ts\n";

  const { outOfOrder } = checkTestManifest(root, manifestText);
  rm(root);

  testCase("an out-of-order adjacent pair is caught by name (RED)", () => {
    if (outOfOrder.length !== 1 || outOfOrder[0].before !== "lib/b.test.ts" || outOfOrder[0].after !== "lib/a.test.ts") {
      throw new Error(`expected one pair {before: "lib/b.test.ts", after: "lib/a.test.ts"}, got ${JSON.stringify(outOfOrder)}`);
    }
  });
}
{
  const root = freshFixture();
  write(root, "lib/a.test.ts", "// t");
  write(root, "lib/b.test.ts", "// t");
  // The SAME two files, correctly ordered this time.
  const manifestText = "lib/a.test.ts\nlib/b.test.ts\n";

  const { outOfOrder } = checkTestManifest(root, manifestText);
  rm(root);

  testCase("restoring alphabetical order clears the finding", () => {
    if (outOfOrder.length !== 0) throw new Error(`expected zero out-of-order pairs, got ${JSON.stringify(outOfOrder)}`);
  });
}
{
  // A directory-name PREFIX collision — the exact real-world shape this
  // fold exists for (`firm/` vs `firm-admin/`, `/` = U+002F > `-` = U+002D).
  const root = freshFixture();
  write(root, "components/firm/x.test.ts", "// t");
  write(root, "components/firm-admin/y.test.ts", "// t");
  const wrongOrder = "components/firm/x.test.ts\ncomponents/firm-admin/y.test.ts\n";
  const rightOrder = "components/firm-admin/y.test.ts\ncomponents/firm/x.test.ts\n";

  const wrong = checkTestManifest(root, wrongOrder);
  const right = checkTestManifest(root, rightOrder);
  rm(root);

  testCase("a directory-name prefix collision (firm/ after firm-admin/) is caught", () => {
    if (wrong.outOfOrder.length !== 1) throw new Error(`expected one out-of-order pair, got ${JSON.stringify(wrong.outOfOrder)}`);
  });
  testCase("the correctly-ordered prefix-collision fixture is clean", () => {
    if (right.outOfOrder.length !== 0) throw new Error(`expected zero out-of-order pairs, got ${JSON.stringify(right.outOfOrder)}`);
  });
}

// ---------------------------------------------------------------------------
// (6) THE REAL GATE, THE REAL CLI, THE REAL TREE — spawns
//     check-test-manifest.mjs exactly as `pnpm lint` does (not the pure
//     function) against apps/web's actual test/manifest.txt and actual test
//     files, and asserts it exits 0 today. This is the other half of the
//     positive control: (3)/(4) above prove the DETECTION logic against a
//     fixture; this proves the REAL manifest currently satisfies it end to
//     end, through the real CLI entry point.
// ---------------------------------------------------------------------------
console.log("the real gate against the real apps/web tree:");
{
  testCase("scripts/check-test-manifest.mjs exits 0 against the current repo tree", () => {
    execFileSync(process.execPath, ["./scripts/check-test-manifest.mjs"], {
      cwd: WEB_ROOT,
      stdio: "pipe",
    });
  });
}

console.log("");
if (failures > 0) {
  console.error(`[check-test-manifest.selftest] ${failures} case(s) FAILED.`);
  process.exit(1);
} else {
  console.log("[check-test-manifest.selftest] all cases passed.");
  process.exit(0);
}
