// #1149 — ONE ERRCODE CATALOG, held by a census.
//
// WHAT WAS WRONG. `rig-helpers.mjs` and `work-journal-fixtures.mjs` each declared their own
// `CLR` map. The two agreed on every key they shared, but `rig-helpers.mjs` carried nine keys
// `work-journal-fixtures.mjs` did not (`client`, `provenance`, `makerChecker`, `revision`,
// `lastOwner`, `stale` among them) and `work-journal-fixtures.mjs` carried two
// (`conflict`/CLR13, `period`/CLR19) `rig-helpers.mjs` did not — so `CLR.stale` or
// `CLR.conflict` resolved or read `undefined` depending on which of the 28 importing test
// modules under `packages/db/tests` a file happened to chain through, with no error either
// way. #1114 measured exactly that silence for `CLR.callerContract` before both maps were
// aligned by hand.
//
// Separately, `packages/db/migrations` raises 46 distinct CLRxx codes (CLR00 through CLR44
// plus CLR99, the migrations' own tail-probe-rollback sentinel) and the catalog wrote down a
// meaning for 15 of them. This file closes both gaps: `rig-helpers.mjs` keeps the one
// declaration, extended to the full 46-code roster with a meaning read off each code's own
// raise sites and migration header comments (never invented); `work-journal-fixtures.mjs`
// re-exports the SAME object.
//
// NO DATABASE. The census reads `packages/db/migrations`' own SQL text and the imported `CLR`
// object, nothing else — it runs on every leg, including a pre-migration chain, the same
// reason `collation-pin-scan.test.mjs` needs none.
//
// Serial discipline: --test-concurrency=1 (shared rig convention) — moot here (no shared
// state), kept for uniformity with the rest of the suite.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLR } from "./rig-helpers.mjs";
import { CLR as CLR_VIA_WORK_JOURNAL } from "./work-journal-fixtures.mjs";

const DB_DIR = fileURLToPath(new URL("..", import.meta.url));

/** Every `.mjs` file under `packages/db/tests`, recursively (the harness has three
 *  subdirectories today: `fixtures/`, `split-lists/`, `wave-b/`). */
function testTreeMjsFiles() {
  const out = [];
  (function walk(dir, rel) {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (statSync(abs).isDirectory()) {
        walk(abs, relPath);
      } else if (name.endsWith(".mjs")) {
        out.push(relPath);
      }
    }
  })(join(DB_DIR, "tests"), "");
  return out;
}

/** Every path under `packages/db/tests` that contains a fresh, top-level `const`-export
 *  binding of the `CLR` identifier to an object literal — a genuine SECOND declaration. A
 *  re-export (`export { CLR } from "./x.mjs"` or a bare `export { CLR };` of an imported
 *  binding) does not take this shape, so it is not counted. Worded here without the literal
 *  four-token sequence itself, so this docstring is not mistaken for a site of its own. */
function clrMapDeclarationSites() {
  const sites = [];
  for (const rel of testTreeMjsFiles()) {
    const src = readFileSync(join(DB_DIR, "tests", rel), "utf8");
    if (/\bexport\s+const\s+CLR\s*=\s*\{/.test(src)) sites.push(rel);
  }
  return sites;
}

test("p1149.catalog.one_declaration -- exactly one CLR map is declared under packages/db/tests, in rig-helpers.mjs; a second declaration anywhere in the tree fails by name", () => {
  const sites = clrMapDeclarationSites();
  assert.deepEqual(sites, ["rig-helpers.mjs"],
    `exactly one CLR map declaration is allowed, in rig-helpers.mjs; found declared in: ${sites.join(", ") || "(none)"}`);
});

test("p1149.catalog.one_object -- work-journal-fixtures.mjs's CLR is rig-helpers.mjs's own object, not a second copy that can drift", () => {
  assert.equal(CLR_VIA_WORK_JOURNAL, CLR,
    "work-journal-fixtures.mjs must re-export rig-helpers.mjs's CLR by reference, or the two can still silently disagree");
});
