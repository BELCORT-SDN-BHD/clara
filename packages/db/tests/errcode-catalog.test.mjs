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

/**
 * Does this source BIND the `CLR` identifier to a fresh object of its own? A binding is a
 * declaration whether or not it is exported on the same line, whether it is written with `const`,
 * `let` or `var`, and whether the object is a bare literal or wrapped in `Object.freeze(...)` —
 * all four shapes re-create the shadowing #1149 removes. A RE-EXPORT is not a binding: neither
 * `export { CLR } from "./x.mjs"` nor a bare `export { CLR };` of an imported one introduces an
 * object, so neither matches.
 *
 * Pure, so the cell can hand it each evading form directly instead of planting files in the tree
 * (`waveK-lane02-review-adversarial.json` ADV-05: the previous detector tested only the one
 * syntactic shape its own control planted). Worded here without any of the literal token
 * sequences, so this docstring is not mistaken for a site of its own.
 */
function declaresClrMap(src) {
  return /(?:^|[;{}\s])(?:export\s+)?(?:const|let|var)\s+CLR\s*=\s*(?:Object\s*\.\s*freeze\s*\(\s*)?\{/
    .test(src);
}

/** Every path under `packages/db/tests` whose source binds `CLR` to an object of its own. */
function clrMapDeclarationSites() {
  return testTreeMjsFiles()
    .filter((rel) => declaresClrMap(readFileSync(join(DB_DIR, "tests", rel), "utf8")));
}

test("p1149.catalog.one_declaration -- exactly one CLR map is declared under packages/db/tests, in rig-helpers.mjs; a second declaration anywhere in the tree fails by name", () => {
  const sites = clrMapDeclarationSites();
  assert.deepEqual(sites, ["rig-helpers.mjs"],
    `exactly one CLR map declaration is allowed, in rig-helpers.mjs; found declared in: ${sites.join(", ") || "(none)"}`);

  // THE DETECTOR ITSELF, against every shape a second catalog can take — otherwise a clean scan
  // means only "no second catalog written the ONE way this cell can see".
  const declaration = (kw, wrap) =>
    `export ${kw} CLR = ${wrap ? "Object.freeze({" : "{"} fake: "CLR98" }${wrap ? ")" : ""};\n`;
  for (const [label, src] of [
    ["the plain form", declaration("const", false)],
    ["a frozen object", declaration("const", true)],
    ["a let binding", declaration("let", false)],
    ["a var binding", declaration("var", false)],
    // The keyword is interpolated rather than written out, so this file does not become a
    // declaration site of its own when the scanner above walks it.
    ["an unexported binding exported further down",
      `${"const"} CLR = { fake: "CLR98" };\nexport { CLR };\n`],
  ]) {
    assert.equal(declaresClrMap(src), true, `a second catalog written as ${label} goes unseen`);
  }
  for (const [label, src] of [
    ["a re-export by name", `import { CLR } from "./rig-helpers.mjs";\nexport { CLR };\n`],
    ["a re-export from a path", `export { CLR } from "./rig-helpers.mjs";\n`],
    ["a local named CLRS", `export const CLRS = { fake: "CLR98" };\n`],
    ["a property access", `const x = { CLR: { fake: "CLR98" } };\n`],
  ]) {
    assert.equal(declaresClrMap(src), false, `${label} is not a declaration and must not be flagged`);
  }
});

test("p1149.catalog.one_object -- work-journal-fixtures.mjs's CLR is rig-helpers.mjs's own object, not a second copy that can drift", () => {
  assert.equal(CLR_VIA_WORK_JOURNAL, CLR,
    "work-journal-fixtures.mjs must re-export rig-helpers.mjs's CLR by reference, or the two can still silently disagree");
});

/** Every CLRxx code `packages/db/migrations` raises, derived off the SQL sources themselves —
 *  never off this catalog, and never off the live `pg_proc` catalog, per the ticket's own
 *  premise ("the migration set ... is the source of truth for both the code list and each
 *  meaning"). Matches `errcode` followed by a `CLRnn` token inside one or two quotes, so it
 *  catches both a plain `using errcode = 'CLR44'` and a doubled-quote form built for dynamic
 *  SQL (`using errcode=''CLR10''`), case-insensitively — a handful of migrations' own tail
 *  self-checks re-assert an already-known code in lowercase inside a `position(...)` probe,
 *  and those must count for the same code rather than be missed. */
function codesRaisedByMigrations() {
  const found = new Set();
  const re = /errcode\s*=+\s*'{1,2}(CLR\d{2})'{0,2}/gi;
  for (const file of readdirSync(join(DB_DIR, "migrations")).sort()) {
    if (!file.endsWith(".sql")) continue;
    const src = readFileSync(join(DB_DIR, "migrations", file), "utf8");
    let m;
    while ((m = re.exec(src))) found.add(m[1].toUpperCase());
  }
  return found;
}

test("p1149.catalog.every_raised_code_has_a_meaning -- every CLRxx code packages/db/migrations raises carries exactly one catalog entry", () => {
  const raised = codesRaisedByMigrations();
  const cataloged = new Set(Object.values(CLR));
  const missing = [...raised].filter((code) => !cataloged.has(code)).sort();
  assert.deepEqual(missing, [],
    `codes packages/db/migrations raises with no catalog entry: ${missing.join(", ") || "(none)"}`);
});

test("p1149.catalog.exactly_one_entry_per_code -- no CLRxx code is carried by two catalog keys; a second key on one code fails by naming the code and both keys", () => {
  const byCode = new Map();
  for (const [key, code] of Object.entries(CLR)) {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(key);
  }
  const doubled = [...byCode.entries()].filter(([, keys]) => keys.length > 1)
    .map(([code, keys]) => `${code} is carried by ${keys.sort().join(" and ")}`).sort();
  assert.deepEqual(doubled, [],
    `AC2 asks for EXACTLY ONE catalog entry per raised code; codes carried by more than one key: ${doubled.join("; ") || "(none)"}`);
  // …and the membership cells above compare SETS, which dedupe, so this is the only cell that can
  // see it: with a duplicate present they all stay green.
  assert.equal(Object.keys(CLR).length, new Set(Object.values(CLR)).size,
    `the catalog has ${Object.keys(CLR).length} keys for ${new Set(Object.values(CLR)).size} distinct codes`);
});

/** The `CLR` object literal in `rig-helpers.mjs`, as SOURCE LINES: from the line that opens it to
 *  the line that closes it. Read as text rather than through the import, because the half of AC2
 *  this measures — "with a written meaning" — is a comment, and a comment does not survive being
 *  parsed. */
function clrSourceLines() {
  const src = readFileSync(join(DB_DIR, "tests", "rig-helpers.mjs"), "utf8").split(/\r?\n/);
  const open = src.findIndex((l) => /\bCLR\s*=\s*\{\s*$/.test(l));
  assert.ok(open >= 0, "rig-helpers.mjs no longer opens its CLR map on a line of its own");
  const close = src.findIndex((l, i) => i > open && /^\};\s*$/.test(l));
  assert.ok(close > open, "rig-helpers.mjs's CLR map has no closing line");
  return src.slice(open + 1, close);
}

test("p1149.catalog.every_entry_has_a_written_meaning -- every catalog key carries a // comment of its own, on its line or immediately above it", () => {
  const lines = clrSourceLines();
  const entry = /^\s*([A-Za-z_$][\w$]*)\s*:\s*"CLR\d{2}"\s*,/;
  const mute = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = entry.exec(lines[i]);
    if (!m) continue;
    // A meaning is written EITHER after the value on the same line, or as the comment block
    // directly above it (which is the shape a long one takes — `callerContract` is written that
    // way). A trailing continuation of the PREVIOUS key's comment also sits directly above, so the
    // rule is deliberately lenient in that one direction: it catches a key with no prose anywhere
    // near it, which is the silence AC2 is about.
    const own = lines[i].slice(m[0].length).includes("//");
    const above = i > 0 && /^\s*\/\//.test(lines[i - 1]);
    if (!own && !above) mute.push(m[1]);
  }
  assert.deepEqual(mute.sort(), [],
    `AC2 asks for a WRITTEN MEANING per entry; catalog keys with no comment of their own: ${mute.join(", ") || "(none)"}`);
  assert.equal(
    lines.filter((l) => entry.test(l)).length, Object.keys(CLR).length,
    "the source scan and the imported object disagree on how many entries the catalog has -- the scanner, not the catalog, is what moved");
});

test("p1149.catalog.no_stale_entry -- every catalog entry names a code something in packages/db/migrations actually raises", () => {
  const raised = codesRaisedByMigrations();
  const stale = Object.entries(CLR).filter(([, code]) => !raised.has(code)).map(([key]) => key).sort();
  assert.deepEqual(stale, [],
    `catalog entries naming a code nothing in packages/db/migrations raises: ${stale.join(", ") || "(none)"}`);
});

test("p1149.catalog.census_is_exact -- the raised set and the catalog's value set are the SAME 46 codes (CLR00-CLR44, CLR99)", () => {
  const raised = [...codesRaisedByMigrations()].sort();
  const cataloged = [...new Set(Object.values(CLR))].sort();
  assert.deepEqual(cataloged, raised, "the catalog's codes and the migrations' raised codes must be exactly the same set");
  assert.equal(raised.length, 46, "the estate raises 46 distinct CLRxx codes today (CLR00-CLR44 plus CLR99) -- a change here is real news, not this cell drifting");
});
