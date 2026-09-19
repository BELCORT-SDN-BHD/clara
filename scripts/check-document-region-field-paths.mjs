#!/usr/bin/env node
/**
 * scripts/check-document-region-field-paths.mjs — #857: refuse a literal
 * `clara.document_regions.field_path` outside the canonical grammar, wherever a
 * fixture in the two test trees that write it RAW (never through
 * `clara.persist_document_extraction`, the one door that already calls
 * `clara._assert_field_path`) hands it one as a literal.
 *
 * WHY THIS EXISTS. `clara._assert_field_path` (migration 0191) is enforced at
 * `persist_document_extraction` alone — the table itself accepts anything (#857's
 * triage: "nothing validates a path written directly to the table"). A raw
 * fixture insert across `packages/db/tests/` or `packages/runtime/tests/` (71 of
 * them today, across 35 files — the ONLY two trees that ever write this table
 * outside the audited door) can therefore seed a path the real estate could never
 * produce. All of them conform today, which is exactly why a lint is preventive
 * rather than corrective (#857's triage comment).
 *
 * WHAT IS SCANNED, and why a naive dotted-literal regex is the WRONG shape (it
 * floods with false positives on relation names, event types and filenames,
 * #857's own triage finding): this walks each file's TEXT and extracts a
 * `field_path` value ONLY where it is unambiguously a literal AT that position —
 *   (a) a JS object-literal property `field_path: "…"` / `field_path: '…'`
 *       (single- or double-quoted, no `${` interpolation — an interpolated
 *       value is a variable, not a literal, and is not this guard's business);
 *   (b) the SQL VALUE bound to the `field_path` COLUMN in a raw
 *       `insert into clara.document_regions(<cols>) values(<vals>)`, when that
 *       value is a plain single-quoted SQL string literal (never a `$N`
 *       placeholder or an expression — those carry no literal to check here).
 * Every extracted literal is checked against `clara._assert_field_path`'s OWN
 * grammar, read from migration 0191's source text at run time (never a
 * hand-kept copy — the source of truth is one function, in one file, and this
 * script re-derives its regex, its length bound and its namespace roster from
 * it every run, so the two can never quietly drift apart).
 *
 * Registered in the ROOT `lint` script (package.json), beside
 * check-dead-citations.mjs and check-wiki-dynamic-sql.mjs — fast, no rig needed:
 * every cell here is a file read plus a text scan, no database connection.
 *
 * No dependencies — Node built-ins only.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

/** The two, and only two, trees that ever write `clara.document_regions` RAW
 *  (outside `persist_document_extraction`) — #857's own census. */
export const SCAN_ROOTS = ["packages/db/tests", "packages/runtime/tests"];

const MIGRATION_REL = "packages/db/migrations/0191_document_capability_registry.sql";

/**
 * Reads `clara._assert_field_path`'s own grammar (length bound, syntax regex,
 * namespace roster) straight from migration 0191's applied source text — never
 * duplicated by hand. Throws if the shape moves (0191 is applied and immutable;
 * a mismatch means this script is reasoning about the wrong thing, the same
 * failure posture role-census-reset.mjs's `pinnedRoleCount` uses for 0154).
 * @param {string} repoRoot
 */
export function readFieldPathGrammar(repoRoot = REPO_ROOT) {
  const text = readFileSync(join(repoRoot, MIGRATION_REL), "utf8");
  const lengthMatch = text.match(/length\(p_path\)\s*=\s*0\s*or\s*length\(p_path\)\s*>\s*(\d+)/);
  const syntaxMatch = text.match(/p_path\s*!~\s*'(\^[^']+\$)'/);
  const namespaceMatch = text.match(/split_part\(p_path,\s*'\.',\s*1\)\s*not in\s*\(([^)]+)\)/s);
  if (!lengthMatch || !syntaxMatch || !namespaceMatch) {
    throw new Error(
      `${MIGRATION_REL} no longer carries clara._assert_field_path in the shape ` +
        "check-document-region-field-paths.mjs expects — 0191 must never be edited; if this " +
        "is a false alarm, update the three regexes here, never the migration.",
    );
  }
  const maxLength = Number(lengthMatch[1]);
  const syntax = new RegExp(syntaxMatch[1]);
  const namespaces = new Set(
    [...namespaceMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
  );
  return { maxLength, syntax, namespaces };
}

/** `null` when `path` conforms (or is `null` — nullable by design, 0191's own
 *  first line); otherwise the SAME typed reason `_assert_field_path` raises. */
export function fieldPathViolation(path, grammar) {
  if (path == null) return null;
  if (path.length === 0 || path.length > grammar.maxLength) return "field_path_length";
  if (!grammar.syntax.test(path)) return "field_path_syntax";
  if (!grammar.namespaces.has(path.split(".", 1)[0])) return "field_path_namespace";
  return null;
}

/** Every git-tracked file under `SCAN_ROOTS`, relative to `repoRoot`. */
export function scanTargetFiles(repoRoot = REPO_ROOT, roots = SCAN_ROOTS) {
  return execFileSync("git", ["ls-files", ...roots], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter((rel) => rel.endsWith(".mjs") || rel.endsWith(".ts"));
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

/** A single-quoted SQL string literal starting at `text[start] === "'"`, SQL's
 *  own `''` escape honoured. Returns `{ value, end }` (`end` = index just past
 *  the closing quote) or `null` if `start` is not a quote. */
function readSqlStringLiteral(text, start) {
  if (text[start] !== "'") return null;
  let i = start + 1;
  let value = "";
  while (i < text.length) {
    if (text[i] === "'" && text[i + 1] === "'") { value += "'"; i += 2; continue; }
    if (text[i] === "'") return { value, end: i + 1 };
    value += text[i];
    i += 1;
  }
  return null; // unterminated — not this guard's business, the JS syntax check owns that
}

/** Splits a SQL column/value list on TOP-LEVEL commas, respecting `'…'` string
 *  literals (with `''` escapes) and nested `(`/`)`. Each element is trimmed. */
function splitSqlList(text) {
  const parts = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      const lit = readSqlStringLiteral(text, i);
      if (lit) { cur += text.slice(i, lit.end); i = lit.end; continue; }
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; i += 1; continue; }
    cur += ch;
    i += 1;
  }
  if (cur.trim().length > 0) parts.push(cur.trim());
  return parts;
}

/** The window (chars, each side) searched around a `field_path:` match for
 *  `region_idx` — see `extractFieldPathLiterals`'s (a) for why. Generous
 *  enough to span a multi-line object literal's other properties, small
 *  enough to never reach a SEPARATE object literal elsewhere in the file. */
const SIBLING_WINDOW = 200;

/** Every literal `field_path` value this file hands `clara.document_regions`,
 *  as `{ line, value }`. Two independent shapes (see the file header); a value
 *  that is not statically a literal (a bound `$N`, a bare identifier, a
 *  template literal carrying `${…}`) is skipped — this guard checks only what
 *  it can prove, never what it would have to guess. */
export function extractFieldPathLiterals(text) {
  const hits = [];

  // (a) `field_path: "…"` / `field_path: '…'` object-literal property — but
  // ONLY when it is not sitting in an evidence-CITATION object
  // (`{ region_idx, quote, field_path }`, the chat/prompt-tool shape that
  // reuses the same property name for an already-existing region's label,
  // never for a NEW clara.document_regions row: `region_idx` is the marker no
  // document_regions row object ever carries). Measured false positive
  // without this guard: packages/runtime/tests/f-a1-pr3a-consumers.test.mjs
  // and wave-e-f9-{autodraft-v7,chatturn-v10}.test.mjs, all evidence-citation
  // schema fixtures, none a document_regions insert.
  const objectRe = /\bfield_path\s*:\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const m of text.matchAll(objectRe)) {
    const windowStart = Math.max(0, m.index - SIBLING_WINDOW);
    const windowEnd = Math.min(text.length, m.index + m[0].length + SIBLING_WINDOW);
    if (/\bregion_idx\b/.test(text.slice(windowStart, windowEnd))) continue;
    hits.push({ line: lineAt(text, m.index), value: m[2] });
  }

  // (b) the positional SQL VALUE bound to the `field_path` COLUMN in a raw
  // `insert into clara.document_regions(<cols>) values(<vals>)`.
  const insertRe = /insert\s+into\s+clara\.document_regions\s*\(/gi;
  for (const im of text.matchAll(insertRe)) {
    const colsStart = im.index + im[0].length;
    const colsClose = text.indexOf(")", colsStart);
    if (colsClose === -1) continue;
    const cols = splitSqlList(text.slice(colsStart, colsClose)).map((c) => c.trim().toLowerCase());
    const fpIndex = cols.indexOf("field_path");
    if (fpIndex === -1) continue; // this insert names no field_path column at all — nothing to check

    const valuesRe = /values\s*\(/i;
    const rest = text.slice(colsClose);
    const vm = valuesRe.exec(rest);
    if (!vm) continue;
    const valuesStart = colsClose + vm.index + vm[0].length;
    // Scan forward for the matching top-level close paren (respecting quotes/nesting).
    let depth = 1;
    let i = valuesStart;
    while (i < text.length && depth > 0) {
      if (text[i] === "'") {
        const lit = readSqlStringLiteral(text, i);
        if (lit) { i = lit.end; continue; }
      }
      if (text[i] === "(") depth += 1;
      if (text[i] === ")") depth -= 1;
      i += 1;
    }
    const valuesClose = i - 1;
    const vals = splitSqlList(text.slice(valuesStart, valuesClose));
    const token = vals[fpIndex]?.trim();
    if (!token || !token.startsWith("'")) continue; // a $N placeholder or expression — not a literal
    const lit = readSqlStringLiteral(token, 0);
    if (!lit) continue;
    hits.push({ line: lineAt(text, valuesStart), value: lit.value });
  }

  return hits;
}

/**
 * The whole scan: every literal `field_path` in `files` (relative to
 * `repoRoot`), checked against `grammar`. Returns violations only.
 * @returns {Array<{ file: string, line: number, path: string, reason: string }>}
 */
export function findFieldPathViolations(files, repoRoot, grammar) {
  const violations = [];
  for (const rel of files) {
    let text;
    try {
      text = readFileSync(join(repoRoot, rel), "utf8");
    } catch {
      continue; // deleted between listing and read
    }
    for (const { line, value } of extractFieldPathLiterals(text)) {
      const reason = fieldPathViolation(value, grammar);
      if (reason) violations.push({ file: rel, line, path: value, reason });
    }
  }
  return violations;
}

export function main() {
  const grammar = readFieldPathGrammar(REPO_ROOT);
  const files = scanTargetFiles(REPO_ROOT);
  const violations = findFieldPathViolations(files, REPO_ROOT, grammar);

  if (violations.length === 0) {
    console.log(
      `[check-document-region-field-paths] clean — every literal field_path in ${files.length} ` +
        `file(s) under ${SCAN_ROOTS.join(", ")} conforms to clara._assert_field_path's grammar.`,
    );
    return 0;
  }

  console.log(`[check-document-region-field-paths] ${violations.length} non-canonical field_path literal(s) found:`);
  for (const v of violations) {
    console.log(`  - ${v.file}:${v.line}: ${JSON.stringify(v.path)} (${v.reason})`);
  }
  console.log("");
  console.log(
    "[check-document-region-field-paths] failing the build. A fixture may seed a document_regions " +
      "row directly, but its field_path must still conform to clara._assert_field_path's grammar " +
      "(migration 0191) — a raw insert is not exempt from the estate's own vocabulary (#857).",
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
