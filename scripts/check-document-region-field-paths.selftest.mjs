#!/usr/bin/env node
// Self-test for #857's field_path grammar gate ("a gate that has never been SEEN to go red
// is an assertion, not a control" — the same standard check-dead-citations.selftest.mjs and
// check-frozen-workflows.selftest.mjs hold themselves to).
//
//   node scripts/check-document-region-field-paths.selftest.mjs   # exit 0 green, 1 red
//
// Fixture cases drive the exported pure functions directly against a temp dir (never the
// real repo, never git); a LAST case runs the real gate's `findFieldPathViolations` against
// THIS repo's real scan roots and requires it green today, so the fixture cases can never
// diverge from what actually ships.
//
// No dependencies — Node built-ins only.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readFieldPathGrammar,
  fieldPathViolation,
  extractFieldPathLiterals,
  findFieldPathViolations,
  scanTargetFiles,
} from "./check-document-region-field-paths.mjs";

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

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}
function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

function write(root, relPath, content) {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}
function freshFixture() {
  return mkdtempSync(join(tmpdir(), "check-document-region-field-paths-selftest-"));
}
/** The repository root, found the way check-document-region-field-paths.mjs itself finds it. */
function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}
function rm(root) {
  rmSync(root, { recursive: true, force: true });
}

console.log("check-document-region-field-paths self-test");

const grammar = readFieldPathGrammar();

// ---------------------------------------------------------------------------
// The grammar itself, read from migration 0191's real source text.
// ---------------------------------------------------------------------------

// #945 — the roster is read from the migration that defines `clara._assert_field_path` LAST in
// chain order, not from 0191 by name. 0191 MINTED the function and was the only file that defined
// it until 0296 recut it (one namespace, `payroll`, joins the closed set), and a lint still
// reading 0191 would have refused every lawful `payroll.*` literal in the estate's own tests. The
// source of truth was never "0191" — it was "whatever the function is today".
//
// #948 — 0299 recut it again for `contract` (the agreement family's fact namespace, which names
// the FACT FAMILY and not the document kind, so #949's tenancy terms read the same one). The
// COUNT below re-bases with each such widening and is deliberately a literal rather than a
// derivation: this cell's whole job is to notice that the closed set changed, and a count read
// out of the same grammar it is checking would notice nothing.
testCase("grammar: reads the real maxLength (128) and the roster from the migration that defines it last", () => {
  assertEqual(grammar.maxLength, 128, "maxLength");
  for (const ns of ["invoice", "statement", "myinvois", "opening_tb", "prior_gl", "payroll",
    "contract", "pages", "tables", "rows", "sheets", "paragraphs"]) {
    if (!grammar.namespaces.has(ns)) throw new Error(`namespace roster missing "${ns}"`);
  }
  assertEqual(grammar.namespaces.size, 12, "exactly the twelve registered namespaces, no more");
});

// FIX ROUND (finding ADV-08) — THE GRAMMAR SOURCE FAILS LOUDLY, IT DOES NOT FALL BACK. The
// first cut of grammarSourceFile() filtered the candidate set by BOTH the function name and the
// roster shape, so a future migration that recut clara._assert_field_path with a different roster
// mechanism matched neither regex, was skipped in silence, and this lint went on reading an OLDER
// file's namespace roster — the stale-grammar failure the header says the 0191-by-name version
// was replaced to avoid, one level down. Driven here against a scratch migration directory rather
// than argued: the highest definer carries no roster, and readFieldPathGrammar must RAISE and
// NAME it.
testCase("grammar: a newer definer with no roster RAISES and names the file — never a silent fall back to an older one", () => {
  const root = freshFixture();
  try {
    write(root, "packages/db/migrations/0191_document_capability_registry.sql",
      readFileSync(join(repoRoot(), "packages/db/migrations/0191_document_capability_registry.sql"), "utf8"));
    write(root, "packages/db/migrations/9999_roster_moved.sql",
      "create or replace function clara._assert_field_path(p_path text) returns void\n"
      + "  language plpgsql as $$ begin null; end $$;\n");
    let raised = null;
    try { readFieldPathGrammar(root); } catch (e) { raised = e; }
    if (raised === null) {
      throw new Error("readFieldPathGrammar fell back to an older file's roster instead of raising");
    }
    if (!String(raised.message).includes("9999_roster_moved.sql")) {
      throw new Error("the raise must NAME the file it could not read: " + raised.message);
    }
  } finally {
    rm(root);
  }
});

testCase("fieldPathViolation: null passes (field_path is nullable by design)", () => {
  assertEqual(fieldPathViolation(null, grammar), null, "null");
});
testCase("fieldPathViolation: a canonical path in every shape 0191 documents passes", () => {
  for (const p of ["invoice.total", "pages.1.lines.0", "sheets.0.A1", "tables.0.cells.3", "opening_tb.line"]) {
    assertEqual(fieldPathViolation(p, grammar), null, `"${p}" must conform`);
  }
});
testCase("fieldPathViolation: too long -> field_path_length", () => {
  assertEqual(fieldPathViolation("invoice." + "a".repeat(128), grammar), "field_path_length");
});
testCase("fieldPathViolation: empty string -> field_path_length (not null)", () => {
  assertEqual(fieldPathViolation("", grammar), "field_path_length");
});
testCase("fieldPathViolation: malformed syntax (space, double dot, traversal) -> field_path_syntax", () => {
  for (const p of ["invoice total", "invoice..total", "invoice.", "../etc/passwd", "invoice.tot al"]) {
    assertEqual(fieldPathViolation(p, grammar), "field_path_syntax", `"${p}"`);
  }
});
testCase("fieldPathViolation: unregistered namespace -> field_path_namespace (#624's own two rogues)", () => {
  for (const p of ["rogue.company_ssm", "vendor.bank_account"]) {
    assertEqual(fieldPathViolation(p, grammar), "field_path_namespace", `"${p}"`);
  }
});

// ---------------------------------------------------------------------------
// Literal extraction — the two shapes, and the evidence-citation exclusion the real repo's
// f-a1-pr3a-consumers.test.mjs / wave-e-f9-{autodraft-v7,chatturn-v10}.test.mjs cells needed
// (measured false positives without it — see the checker's own file header).
// ---------------------------------------------------------------------------

testCase("extract: a document_regions object literal ({field_path, text_content, ...})", () => {
  const hits = extractFieldPathLiterals('const row = { field_path: "invoice.total", text_content: "RM 5.00" };');
  assertDeepEqual(hits, [{ line: 1, value: "invoice.total" }], "one literal extracted");
});
testCase("extract: an evidence-CITATION object ({region_idx, quote, field_path}) is EXCLUDED", () => {
  const hits = extractFieldPathLiterals('parse([{ region_idx: 1, quote: "q", field_path: "p" }]);');
  assertDeepEqual(hits, [], "region_idx marks this the citation schema, not a document_regions row");
});
testCase("extract: a citation object with region_id (no idx) is still excluded via its quote: sibling (real repo case)", () => {
  // The exact shape wave-e-f9-chatturn-v10.test.mjs:156 constructs on purpose (testing that a
  // BARE region_id, without idx, is refused by the real schema) — same citation family,
  // `region_idx` itself absent by design.
  const hits = extractFieldPathLiterals('assert.equal(parse([{ region_id: REGION_TOTAL, quote: "q", field_path: "p" }]).success, false);');
  assertDeepEqual(hits, [], "the quote: sibling alone is enough to mark this a citation object, not a document_regions row");
});
testCase("extract: L04-S10 — a genuine document_regions field_path is NOT excluded merely because " +
  "\"region_idx\" appears NEARBY in a DIFFERENT, sibling object literal (structural, not a 200-char window)", () => {
  // Reproduces the exact false-negative the fix-round review measured: a naive proximity window
  // reaches into an adjacent object literal's own region_idx and wrongly excludes an unrelated,
  // genuinely malformed document_regions field_path sitting a few characters away.
  const src =
    'const citation = { region_idx: 0, quote: "q", field_path: "invoice.total" };\n'
    + 'const region = { field_path: "rogue.company_ssm", locator_kind: "row_col" };\n';
  const hits = extractFieldPathLiterals(src);
  assertDeepEqual(
    hits,
    [{ line: 2, value: "rogue.company_ssm" }],
    "only the second (genuinely document_regions-shaped) literal is reported — the first is " +
      "excluded by its OWN region_idx/quote siblings, not by proximity to them",
  );
});
testCase("extract: a template-literal field_path (backtick, possibly interpolated) is not statically checkable", () => {
  const hits = extractFieldPathLiterals("const row = { field_path: `tables.0.cells.${i}`, text_content: t };");
  assertDeepEqual(hits, [], "backtick shape is never matched — cannot prove it is a literal");
});
testCase("extract: a raw SQL insert's field_path COLUMN, positionally, as a plain string literal", () => {
  const hits = extractFieldPathLiterals(
    "await rootQuery(\n" +
    "  `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)\n" +
    "   values($1,$2,'page_polygon','{}'::jsonb,'invoice.invoice_id',$3,1.0)`,\n" +
    "  [firm, ext, id],\n" +
    ");",
  );
  assertDeepEqual(hits, [{ line: 3, value: "invoice.invoice_id" }], "the literal at the field_path position, not any other column");
});
testCase("extract: a raw SQL insert's field_path bound to a $N placeholder is not a literal — skipped", () => {
  const hits = extractFieldPathLiterals(
    "`insert into clara.document_regions(firm_id,field_path,text_content) values($1,$2,$3)`",
  );
  assertDeepEqual(hits, [], "a bound parameter carries no literal to check statically");
});
testCase("extract: an insert naming NO field_path column at all is skipped entirely", () => {
  const hits = extractFieldPathLiterals(
    "`insert into clara.document_regions(firm_id,extraction_id) values($1,$2)`",
  );
  assertDeepEqual(hits, [], "nothing to check when the column is not even named");
});

// ---------------------------------------------------------------------------
// The full scan against a SEEDED fixture tree — the "exits non-zero on a seeded malformed
// path, naming file and path" acceptance criterion, proven directly rather than assumed.
// ---------------------------------------------------------------------------

testCase("findFieldPathViolations: a seeded malformed RAW insert is caught, naming file, line and path", () => {
  const root = freshFixture();
  try {
    write(root, "clean.mjs",
      "await rootQuery(`insert into clara.document_regions(firm_id,field_path) values($1,'invoice.total')`, [firm]);\n");
    write(root, "sub/bad.mjs",
      "// two lines of padding first, so the line number is provably not a coincidence\n" +
      "await rootQuery(\n" +
      "  `insert into clara.document_regions(firm_id,field_path) values($1,'rogue.company_ssm')`,\n" +
      "  [firm],\n" +
      ");\n");
    const violations = findFieldPathViolations(["clean.mjs", "sub/bad.mjs"], root, grammar);
    assertDeepEqual(
      violations,
      [{ file: "sub/bad.mjs", line: 3, path: "rogue.company_ssm", reason: "field_path_namespace" }],
      "exactly one violation, naming the bad file, the right line and the offending path",
    );
  } finally {
    rm(root);
  }
});

testCase("findFieldPathViolations: a seeded malformed OBJECT-literal path is caught the same way", () => {
  const root = freshFixture();
  try {
    write(root, "obj.mjs", "const fixture = {\n  field_path: \"nope..bad\",\n  text_content: \"x\",\n};\n");
    const violations = findFieldPathViolations(["obj.mjs"], root, grammar);
    assertDeepEqual(
      violations,
      [{ file: "obj.mjs", line: 2, path: "nope..bad", reason: "field_path_syntax" }],
      "the object-literal shape is caught too",
    );
  } finally {
    rm(root);
  }
});

testCase("findFieldPathViolations: a NULL path and a well-formed path together raise nothing", () => {
  const root = freshFixture();
  try {
    write(root, "ok.mjs",
      "const rows = [\n" +
      "  { field_path: \"invoice.total\", text_content: \"x\" },\n" +
      "  { field_path: null, text_content: \"y\" },\n" +
      "];\n" +
      "await rootQuery(`insert into clara.document_regions(firm_id,field_path) values($1,'opening_tb.line')`, [firm]);\n",
    );
    assertDeepEqual(findFieldPathViolations(["ok.mjs"], root, grammar), [], "nothing to refuse");
  } finally {
    rm(root);
  }
});

// ---------------------------------------------------------------------------
// Integration: the REAL two test trees, today, must be clean — the "77 distinct literal
// paths conform today" claim (#857's triage), re-verified rather than trusted.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// L04-S09: main()'s own exit-code wiring (AC1's literal wording — "exits
// non-zero on a seeded malformed path"). Every case above drives the exported
// PURE functions directly; none calls main() or spawns the script as a
// program, so nothing pinned that a violation actually reaches
// `process.exit(main())` at the bottom of the file — the exact refactor
// hazard named in this ticket's fix-round review (main() logging instead of
// returning 1, or the `process.exit(main())` line being dropped, would leave
// every case above green while the real lint chain stayed green over a live
// violation). This drives the REAL script as a REAL subprocess, in THIS
// worktree's own git index (an isolated checkout — nothing here touches any
// other worktree), the same idiom apps/web/scripts/check-ui-add-guard.selftest.mjs
// uses for its own entry-point wiring case.
// ---------------------------------------------------------------------------

const SELFTEST_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const SCRIPT_PATH = fileURLToPath(new URL("./check-document-region-field-paths.mjs", import.meta.url));
const DECOY_REL = "packages/db/tests/__check857_selftest_decoy.mjs";
const DECOY_ABS = join(SELFTEST_ROOT, ...DECOY_REL.split("/"));

testCase("main(): a REAL subprocess run exits non-zero on a seeded malformed path, naming file:line:path on stdout", () => {
  if (existsSync(DECOY_ABS)) throw new Error(`${DECOY_REL} already exists -- a previous run did not clean up`);
  try {
    writeFileSync(
      DECOY_ABS,
      "// L04-S09 self-test decoy -- staged and removed within one test case, never committed.\n"
      + "await rootQuery(\n"
      + "  `insert into clara.document_regions(firm_id,field_path) values($1,'rogue.company_ssm')`,\n"
      + "  [firm],\n"
      + ");\n",
      "utf8",
    );
    // Stages the decoy (index only, no commit) so this case proves the TRACKED path specifically
    // — scanTargetFiles() now also sees an untracked file (L04B-SPEC-06, the case right below this
    // one), so staging is no longer load-bearing for detection, but it still matches exactly what
    // a developer sees the moment they `git add` a new fixture.
    execFileSync("git", ["add", "--", DECOY_REL], { cwd: SELFTEST_ROOT });
    const out = spawnSync(process.execPath, [SCRIPT_PATH], { cwd: SELFTEST_ROOT, encoding: "utf8" });
    assertEqual(out.status, 1, `expected exit 1, got ${out.status} (signal ${out.signal}); stdout:\n${out.stdout}\nstderr:\n${out.stderr}`);
    const stdout = out.stdout ?? "";
    if (!stdout.includes(`${DECOY_REL}:3:`)) {
      throw new Error(`expected stdout to name "${DECOY_REL}:3:", got:\n${stdout}`);
    }
    if (!stdout.includes("rogue.company_ssm") || !stdout.includes("field_path_namespace")) {
      throw new Error(`expected stdout to name the path and reason, got:\n${stdout}`);
    }
  } finally {
    // Unstage (index only -- nothing was ever committed) and delete, so a failed assertion
    // above still leaves the worktree exactly as it found it.
    try { execFileSync("git", ["reset", "--quiet", "HEAD", "--", DECOY_REL], { cwd: SELFTEST_ROOT }); } catch { /* never staged */ }
    if (existsSync(DECOY_ABS)) rmSync(DECOY_ABS, { force: true });
  }
});

const DECOY2_REL = "packages/db/tests/__check857_selftest_decoy_untracked.mjs";
const DECOY2_ABS = join(SELFTEST_ROOT, ...DECOY2_REL.split("/"));

testCase("main(): a REAL subprocess run catches a malformed fixture that was never git-added (L04B-SPEC-06)", () => {
  // AC1's literal wording is unconditional ("exits non-zero on a seeded malformed path"), but the
  // case above proves this only once the fixture is STAGED. scanTargetFiles() used to read
  // `git ls-files` with no flags, which lists the INDEX alone -- so the one commit that introduces
  // a malformed fixture (before its author ever runs `git add`) was invisible to a local
  // `pnpm lint`. This case writes the decoy and deliberately does NOT stage it.
  if (existsSync(DECOY2_ABS)) throw new Error(`${DECOY2_REL} already exists -- a previous run did not clean up`);
  try {
    writeFileSync(
      DECOY2_ABS,
      "// L04B-SPEC-06 self-test decoy -- written and removed within one test case, NEVER staged.\n"
      + "await rootQuery(\n"
      + "  `insert into clara.document_regions(firm_id,field_path) values($1,'rogue.company_ssm')`,\n"
      + "  [firm],\n"
      + ");\n",
      "utf8",
    );
    const out = spawnSync(process.execPath, [SCRIPT_PATH], { cwd: SELFTEST_ROOT, encoding: "utf8" });
    assertEqual(out.status, 1, `expected exit 1 on an UNSTAGED malformed fixture, got ${out.status} (signal ${out.signal}); stdout:\n${out.stdout}\nstderr:\n${out.stderr}`);
    const stdout = out.stdout ?? "";
    if (!stdout.includes(`${DECOY2_REL}:3:`)) {
      throw new Error(`expected stdout to name "${DECOY2_REL}:3:", got:\n${stdout}`);
    }
  } finally {
    if (existsSync(DECOY2_ABS)) rmSync(DECOY2_ABS, { force: true });
  }
});

testCase("scanTargetFiles: sees an untracked, non-ignored file as well as a tracked one (L04B-SPEC-06)", () => {
  if (existsSync(DECOY2_ABS)) throw new Error(`${DECOY2_REL} already exists -- a previous run did not clean up`);
  try {
    writeFileSync(DECOY2_ABS, "// untracked probe\n", "utf8");
    const files = scanTargetFiles();
    if (!files.includes(DECOY2_REL)) {
      throw new Error(`expected scanTargetFiles() to list the untracked ${DECOY2_REL}, got ${files.length} file(s) without it`);
    }
  } finally {
    if (existsSync(DECOY2_ABS)) rmSync(DECOY2_ABS, { force: true });
  }
});

testCase("main(): a REAL subprocess run against this clean worktree exits 0", () => {
  const out = spawnSync(process.execPath, [SCRIPT_PATH], { cwd: SELFTEST_ROOT, encoding: "utf8" });
  assertEqual(out.status, 0, `expected exit 0 on a clean worktree, got ${out.status}; stdout:\n${out.stdout}`);
});

testCase("findFieldPathViolations: the real packages/db/tests + packages/runtime/tests are clean today", () => {
  const files = scanTargetFiles();
  if (files.length < 100) throw new Error(`suspiciously few files scanned (${files.length}) — SCAN_ROOTS may be wrong`);
  const violations = findFieldPathViolations(files, process.cwd(), grammar);
  assertDeepEqual(violations, [], `expected zero violations in the real repo today, got ${JSON.stringify(violations)}`);
});

if (failures > 0) {
  console.error(`\ncheck-document-region-field-paths self-test: ${failures} failure(s)`);
  process.exit(1);
}
console.log("check-document-region-field-paths self-test: OK");
