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

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
function rm(root) {
  rmSync(root, { recursive: true, force: true });
}

console.log("check-document-region-field-paths self-test");

const grammar = readFieldPathGrammar();

// ---------------------------------------------------------------------------
// The grammar itself, read from migration 0191's real source text.
// ---------------------------------------------------------------------------

testCase("grammar: reads the real maxLength (128) and namespace roster from 0191", () => {
  assertEqual(grammar.maxLength, 128, "maxLength");
  for (const ns of ["invoice", "statement", "myinvois", "opening_tb", "prior_gl",
    "pages", "tables", "rows", "sheets", "paragraphs"]) {
    if (!grammar.namespaces.has(ns)) throw new Error(`namespace roster missing "${ns}"`);
  }
  assertEqual(grammar.namespaces.size, 10, "exactly the ten registered namespaces, no more");
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
