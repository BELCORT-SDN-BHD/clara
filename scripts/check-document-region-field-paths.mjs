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
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

/** The two, and only two, trees that ever write `clara.document_regions` RAW
 *  (outside `persist_document_extraction`) — #857's own census. */
export const SCAN_ROOTS = ["packages/db/tests", "packages/runtime/tests"];

const MIGRATION_REL = "packages/db/migrations/0191_document_capability_registry.sql";
const MIGRATIONS_DIR = "packages/db/migrations";

/**
 * WHICH FILE CARRIES THE GRAMMAR TODAY. 0191 MINTED `clara._assert_field_path`, and for a long
 * time it was also the only file that ever defined it — so this script read 0191 by name. #945's
 * `0296_payroll_summary_typed_facts.sql` is the first migration to RECUT it (one namespace,
 * `payroll`, joins the closed roster), and a lint still reading 0191 would refuse every lawful
 * `payroll.*` literal in the estate's own tests. The source of truth was never "0191" — it was
 * "whatever `clara._assert_field_path` is TODAY", and the chain's own order is what says which
 * file that is. So: scan the migration directory, take every file that defines the function in
 * the shape below, and read the HIGHEST-numbered one. 0191 stays the FLOOR (it must still be
 * there, in that shape, or this script is reasoning about the wrong thing) and is never edited.
 *
 * AND IT THROWS RATHER THAN FALLING BACK (fix round, finding ADV-08). A first cut of this
 * function filtered the CANDIDATE SET by BOTH the function name AND the roster shape, so a
 * future migration that recut `clara._assert_field_path` with a different roster mechanism
 * matched neither regex, was skipped in silence, and this lint went on reading an OLDER file's
 * namespace roster — exactly the stale-grammar failure the header above says the 0191-by-name
 * version was replaced to avoid, reintroduced one level down. The candidate set is now chosen by
 * the FUNCTION NAME alone, which is the thing that cannot move without the definition moving
 * with it; the roster shape is then REQUIRED of the file that wins, and its absence raises. Same
 * failure posture as the 0191 floor check below, and as role-census-reset.mjs's pinnedRoleCount
 * for 0154: a mismatch means this script is reasoning about the wrong thing, and a lint that
 * quietly reasons about the wrong thing is worse than no lint.
 * @param {string} repoRoot
 */
function grammarSourceFile(repoRoot) {
  const files = readdirSync(join(repoRoot, MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let latest = null;
  for (const name of files) {
    const text = readFileSync(join(repoRoot, MIGRATIONS_DIR, name), "utf8");
    if (/function\s+clara\._assert_field_path\s*\(/.test(text)) {
      latest = { rel: `${MIGRATIONS_DIR}/${name}`, text };
    }
  }
  if (latest && !/split_part\(p_path,\s*'\.',\s*1\)\s*not in\s*\(/.test(latest.text)) {
    throw new Error(
      `${latest.rel} is the LAST file to define clara._assert_field_path, but it does not carry ` +
        "the closed namespace roster check-document-region-field-paths.mjs reads — this lint " +
        "would otherwise fall back to an older file's roster and go on passing against a grammar " +
        "that no longer exists. If the roster mechanism really moved, update the three regexes " +
        "here; never let the lint read a stale file.",
    );
  }
  return latest;
}

/**
 * Reads `clara._assert_field_path`'s own grammar (length bound, syntax regex,
 * namespace roster) straight from the applied source text of the migration that
 * defines it LAST in chain order — never duplicated by hand. Throws if the shape
 * moves, the same failure posture role-census-reset.mjs's `pinnedRoleCount` uses
 * for 0154.
 * @param {string} repoRoot
 */
export function readFieldPathGrammar(repoRoot = REPO_ROOT) {
  const floor = readFileSync(join(repoRoot, MIGRATION_REL), "utf8");
  if (!/split_part\(p_path,\s*'\.',\s*1\)\s*not in\s*\(/.test(floor)) {
    throw new Error(
      `${MIGRATION_REL} no longer carries clara._assert_field_path in the shape ` +
        "check-document-region-field-paths.mjs expects — 0191 must never be edited; if this " +
        "is a false alarm, update the three regexes here, never the migration.",
    );
  }
  const source = grammarSourceFile(repoRoot);
  const text = source ? source.text : floor;
  const lengthMatch = text.match(/length\(p_path\)\s*=\s*0\s*or\s*length\(p_path\)\s*>\s*(\d+)/);
  const syntaxMatch = text.match(/p_path\s*!~\s*'(\^[^']+\$)'/);
  const namespaceMatch = text.match(/split_part\(p_path,\s*'\.',\s*1\)\s*not in\s*\(([^)]+)\)/s);
  if (!lengthMatch || !syntaxMatch || !namespaceMatch) {
    throw new Error(
      `${source ? source.rel : MIGRATION_REL} no longer carries clara._assert_field_path in the ` +
        "shape check-document-region-field-paths.mjs expects — if this is a false alarm, update " +
        "the three regexes here, never the migration.",
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

/** Every file under `SCAN_ROOTS`, relative to `repoRoot`, that git either already tracks OR
 *  would track the moment it is added (untracked, not `.gitignore`d). `--cached` alone (the
 *  INDEX only) left exactly one commit unpoliced by a local `pnpm lint`: the one that INTRODUCES
 *  a malformed fixture, before its author has run `git add` (L04B-SPEC-06) — AC1's own wording
 *  ("exits non-zero on a seeded malformed path") names no such exemption. `--others
 *  --exclude-standard` adds untracked-but-not-ignored files to the same listing; a file this repo's
 *  own `.gitignore` excludes (a build artifact, a `node_modules` entry) stays excluded, same as
 *  before. */
export function scanTargetFiles(repoRoot = REPO_ROOT, roots = SCAN_ROOTS) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...roots], {
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

/** Marks every character index that sits inside a JS string or template literal
 *  (single-, double-quoted or backtick, backslash-escaped) — used so the
 *  enclosing-object-literal scan below never miscounts a `{`/`}` that happens
 *  to appear inside a string's own text. Comments are not stripped (a brace
 *  inside a comment is rare enough in these two scan roots that treating it as
 *  structural is the safer default — it can only narrow a match, never widen
 *  one past the real object). */
function stringMask(text) {
  const mask = new Array(text.length).fill(false);
  let quote = null;
  let i = 0;
  while (i < text.length) {
    if (quote) {
      mask[i] = true;
      if (text[i] === "\\") { if (i + 1 < text.length) mask[i + 1] = true; i += 2; continue; }
      if (text[i] === quote) quote = null;
      i += 1;
      continue;
    }
    if (text[i] === "'" || text[i] === '"' || text[i] === "`") { quote = text[i]; mask[i] = true; }
    i += 1;
  }
  return mask;
}

/** The `[start, end)` span of the JS object literal that DIRECTLY encloses
 *  `index` — scanning back from it to its own unmatched `{`, then forward from
 *  there to the matching `}` — braces inside a string (per `mask`) never
 *  count. Replaces a fixed character window (L04-S10: a proximity window either
 *  reaches a sibling property that belongs to a DIFFERENT, nearby object
 *  literal — a false exclusion — or, on a densely-packed one-liner, is
 *  needlessly wide): structure, not distance, is what "the same object" means.
 *  Returns `null` if `index` is not inside any object literal (an object
 *  literal is exactly what `field_path\s*:` property syntax requires, so this
 *  is a shape the caller treats as "prove nothing", never "assume excluded"). */
function enclosingObjectLiteralSpan(text, index, mask) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i -= 1) {
    if (mask[i]) continue;
    if (text[i] === "}") depth += 1;
    else if (text[i] === "{") {
      if (depth === 0) { start = i; break; }
      depth -= 1;
    }
  }
  if (start === -1) return null;
  depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (mask[i]) continue;
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null; // unterminated — not this guard's business, the JS syntax check owns that
}

/** Every literal `field_path` value this file hands `clara.document_regions`,
 *  as `{ line, value }`. Two independent shapes (see the file header); a value
 *  that is not statically a literal (a bound `$N`, a bare identifier, a
 *  template literal carrying `${…}`) is skipped — this guard checks only what
 *  it can prove, never what it would have to guess. */
export function extractFieldPathLiterals(text) {
  const hits = [];

  // (a) `field_path: "…"` / `field_path: '…'` object-literal property — but
  // ONLY when it is not sitting in an evidence-CITATION object
  // (`{ region_idx, quote, field_path }`, wave-e-f9-testkit.mjs's own `cite()`
  // shape — the chat/prompt-tool schema that reuses the same property name
  // for an already-existing region's label, never for a NEW
  // clara.document_regions row). Excluded when the ENCLOSING object literal
  // (L04-S10: structural, not a proximity window — see
  // enclosingObjectLiteralSpan) carries either half of that shape's OTHER two
  // properties: `region_idx` itself, or a `quote:` property key (no
  // document_regions row object ever carries either — its own columns are
  // `text_content`/`locator_kind`/`extraction_id`/…). Both markers are
  // needed: wave-e-f9-chatturn-v10.test.mjs:156 deliberately constructs
  // `{ region_id: …, quote: "q", field_path: "p" }` (testing that a BARE
  // `region_id`, without `idx`, is refused by the real schema) — same
  // citation family, `region_idx` itself absent by design, caught instead by
  // its `quote:` sibling. Measured false positive without this guard:
  // packages/runtime/tests/f-a1-pr3a-consumers.test.mjs and
  // wave-e-f9-{autodraft-v7,chatturn-v10}.test.mjs, all evidence-citation
  // schema fixtures, none a document_regions insert.
  const CITATION_MARKER_RE = /\bregion_idx\b|\bquote\s*:/;
  const objectRe = /\bfield_path\s*:\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/g;
  const mask = stringMask(text);
  for (const m of text.matchAll(objectRe)) {
    const span = enclosingObjectLiteralSpan(text, m.index, mask);
    const scope = span ? text.slice(span.start, span.end) : "";
    if (CITATION_MARKER_RE.test(scope)) continue;
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
