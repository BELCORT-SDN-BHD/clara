// OPERATION-CONTRACT CENSUS — SOURCE LEXING AND READING.
//
// Everything in this module answers one question about a byte of JS/TS source: is it CODE,
// a STRING or a COMMENT? Every reader below (string literals, object keys, generic argument
// lists, bracket matching, enclosing-call stacks) is built on that classification, and none
// of them knows anything about Clara's operation boundary — which is why they live apart
// from the caller census that uses them.
//
// Split out of scripts/operation-census.mjs at this repository's 500-line ceiling. Behaviour
// is byte-identical to the code it replaced.

import { readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SOURCE_EXTENSIONS, SKIP_DIRS, TEST_FILE } from "./scope.mjs";
// ---------------------------------------------------------------------------------------
// Source scanning — a JS/TS lexer that classifies every byte as CODE, STRING or COMMENT.
//
// This is the load-bearing part of the caller census. `clara.<fn>(` appears ~300 times in
// apps/web and ~200 times in packages/runtime COMMENTS (door docstrings quote the signature
// they call); a naive grep reports every one of them as a call site. Only text inside a
// string literal can reach the database, so only STRING spans are scanned for SQL, and only
// CODE spans for `callDoor(`/`pgrestRpc(`/`.rpc(`.
//
// A file whose scan does not end in CODE state is REPORTED (scan_errors), never silently
// half-scanned: an unbalanced quote means the lexer lost the file and the caller census for
// it is not trustworthy.
// ---------------------------------------------------------------------------------------

export const CODE = 0;
export const STRING = 1;
export const COMMENT = 2;

/**
 * @param {string} text
 * @returns {{mask: Uint8Array, ok: boolean, endState: string}}
 */
export function lexSource(text) {
  const mask = new Uint8Array(text.length);
  const tplBrace = []; // brace depth at which each open `${` returns to its template
  let braceDepth = 0;
  let state = "code";
  let i = 0;
  const fill = (from, to, kind) => {
    for (let k = from; k < to && k < mask.length; k += 1) mask[k] = kind;
  };
  while (i < text.length) {
    const c = text[i];
    if (state === "code") {
      if (c === "/" && text[i + 1] === "/") {
        let j = text.indexOf("\n", i);
        if (j === -1) j = text.length;
        fill(i, j, COMMENT);
        i = j;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        let j = text.indexOf("*/", i + 2);
        j = j === -1 ? text.length : j + 2;
        fill(i, j, COMMENT);
        i = j;
        continue;
      }
      if (c === "'" || c === '"') {
        const quote = c;
        let j = i + 1;
        while (j < text.length) {
          if (text[j] === "\\") { j += 2; continue; }
          if (text[j] === quote) { j += 1; break; }
          if (text[j] === "\n") break; // an unterminated literal — stop at the line end
          j += 1;
        }
        fill(i, j, STRING);
        i = j;
        continue;
      }
      if (c === "`") {
        mask[i] = STRING;
        state = "template";
        i += 1;
        continue;
      }
      if (c === "{") { braceDepth += 1; mask[i] = CODE; i += 1; continue; }
      if (c === "}") {
        if (tplBrace.length && braceDepth === tplBrace[tplBrace.length - 1]) {
          tplBrace.pop();
          mask[i] = CODE;
          state = "template";
          i += 1;
          continue;
        }
        braceDepth -= 1;
        mask[i] = CODE;
        i += 1;
        continue;
      }
      mask[i] = CODE;
      i += 1;
      continue;
    }
    // template literal body
    if (c === "\\") { mask[i] = STRING; mask[i + 1] = STRING; i += 2; continue; }
    if (c === "`") { mask[i] = STRING; state = "code"; i += 1; continue; }
    if (c === "$" && text[i + 1] === "{") {
      mask[i] = STRING;
      mask[i + 1] = CODE;
      tplBrace.push(braceDepth);
      state = "code";
      i += 2;
      continue;
    }
    mask[i] = STRING;
    i += 1;
  }
  return { mask, ok: state === "code" && tplBrace.length === 0, endState: state };
}

/** 1-based line number of `offset`. */
function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

/** Skip whitespace and comments forward from `i` using the mask. */
function skipTrivia(text, mask, i) {
  let j = i;
  while (j < text.length && (/\s/.test(text[j]) || mask[j] === COMMENT)) j += 1;
  return j;
}

/**
 * Enclosing-call stack at `offset`: the callee identifiers of every call expression whose
 * parentheses are still open there. Parentheses inside strings and comments do not count.
 * @returns {string[]} innermost last
 */
function enclosingCalls(text, mask, offset) {
  const stack = [];
  for (let i = 0; i < offset; i += 1) {
    if (mask[i] !== CODE) continue;
    const c = text[i];
    if (c === "(") {
      let j = i - 1;
      while (j >= 0 && mask[j] === CODE && /\s/.test(text[j])) j -= 1;
      let end = j + 1;
      while (j >= 0 && mask[j] === CODE && /[A-Za-z0-9_$]/.test(text[j])) j -= 1;
      const name = end > j + 1 ? text.slice(j + 1, end) : "";
      stack.push(name);
    } else if (c === ")") {
      stack.pop();
    }
  }
  return stack;
}

/** Every source file under `root` (repo-relative), sorted, tests excluded. */
function listSourceFiles(repoRoot, root) {
  const abs = join(repoRoot, root);
  const out = [];
  if (!existsSync(abs)) return out;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      if (TEST_FILE.test(entry.name)) continue;
      out.push(full);
    }
  };
  if (statSync(abs).isDirectory()) walk(abs);
  return out.map((f) => relative(repoRoot, f).split(sep).join("/")).sort();
}

/**
 * Skip a balanced `<…>` type-argument list starting at `i` (must point at `<`).
 * `callDoor<Record<string, unknown>>(…)` and `callDoor<{ resolution_id?: string }>(…)` both
 * occur in apps/web, so the nesting matters. Returns -1 when the list does not close before a
 * statement boundary — an unclosed `<` is a comparison, not a type argument.
 */
function skipGenerics(text, i) {
  let depth = 0;
  for (let j = i; j < text.length && j < i + 400; j += 1) {
    const c = text[j];
    if (c === "<") depth += 1;
    else if (c === ">") {
      depth -= 1;
      if (depth === 0) return j + 1;
    } else if (c === ";") return -1;
  }
  return -1;
}

/** Read a single/double-quoted string literal starting at `i`; null when `i` is not one. */
function readStringLiteral(text, i) {
  const quote = text[i];
  if (quote !== "'" && quote !== '"') return null;
  let out = "";
  for (let j = i + 1; j < text.length; j += 1) {
    if (text[j] === "\\") { out += text[j + 1] ?? ""; j += 1; continue; }
    if (text[j] === quote) return { value: out, end: j + 1 };
    if (text[j] === "\n") return null;
    out += text[j];
  }
  return null;
}

/**
 * Top-level keys of the object literal starting at `i` (must point at `{`).
 *
 * KEY POSITION IS TRACKED, NOT GUESSED. `{ p_entry: entryId, p_op_key: opKey() }` must yield
 * two keys, not four: an identifier only counts when it sits at a key position (right after
 * the opening brace or a top-level comma). Reading values as keys is exactly how an argument
 * census turns into 179 imaginary parameter mismatches.
 *
 * Spread/computed entries make the key list INCOMPLETE, which is reported as such so a
 * `named_arg_mismatch` is never claimed from a partially-read argument object.
 * @returns {{keys: string[], complete: boolean, end: number} | null}
 */
function readObjectKeys(text, mask, i) {
  if (text[i] !== "{") return null;
  const keys = [];
  let complete = true;
  let depth = 0;
  let expectKey = false;
  let j = i;
  for (; j < text.length; j += 1) {
    if (mask[j] !== CODE) continue;
    const c = text[j];
    if (c === "{" || c === "[" || c === "(") {
      depth += 1;
      if (depth === 1) expectKey = true;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      depth -= 1;
      if (depth === 0) return { keys, complete, end: j + 1 };
      continue;
    }
    if (depth !== 1) continue;
    if (c === ",") { expectKey = true; continue; }
    if (c === ":") { expectKey = false; continue; }
    if (!expectKey) continue;
    if (c === "." && text[j + 1] === "." && text[j + 2] === ".") { complete = false; expectKey = false; continue; }
    if (c === "[") { complete = false; expectKey = false; continue; } // a computed key
    if (/[A-Za-z_$]/.test(c)) {
      let k = j;
      while (k < text.length && /[A-Za-z0-9_$]/.test(text[k])) k += 1;
      const name = text.slice(j, k);
      const after = skipTrivia(text, mask, k);
      if (text[after] === ":" || text[after] === "," || text[after] === "}") keys.push(name);
      else complete = false; // something this reader does not understand sits in key position
      expectKey = false;
      j = k - 1;
      continue;
    }
    if (c === "'" || c === '"') {
      const lit = readStringLiteral(text, j);
      if (lit) {
        const after = skipTrivia(text, mask, lit.end);
        if (text[after] === ":") keys.push(lit.value);
        else complete = false;
        expectKey = false;
        j = lit.end - 1;
      }
      continue;
    }
    if (!/\s/.test(c)) { complete = false; expectKey = false; }
  }
  return { keys, complete: false, end: j };
}

/** The contiguous run of STRING bytes around `pos` (a template chunk ends at `${`). */
function stringRunAround(text, mask, pos) {
  let start = pos;
  while (start > 0 && mask[start - 1] === STRING) start -= 1;
  let end = pos;
  while (end < text.length && mask[end] === STRING) end += 1;
  if ("'\"`".includes(text[start])) start += 1;
  return { start, end };
}

/** End of an expression-bodied arrow: the first `;`/`,` at bracket depth 0, or a closing
 *  bracket that unbalances — whichever comes first within a bounded window. */
function expressionEnd(text, mask, from) {
  let depth = 0;
  for (let i = from; i < text.length && i < from + 4000; i += 1) {
    if (mask[i] !== CODE) continue;
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      if (depth < 0) return i;
    } else if ((c === ";" || c === ",") && depth === 0) return i;
  }
  return Math.min(text.length, from + 4000);
}

/** Index of the bracket closing the one at `open`, counting only CODE bytes. */
function matchBracket(text, mask, open, openCh, closeCh) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (mask[i] !== CODE) continue;
    if (text[i] === openCh) depth += 1;
    else if (text[i] === closeCh) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the `)` closing the `(` at `open`, or -1 when it does not balance nearby. */
function balancedParenSpan(text, open) {
  let depth = 0;
  const limit = Math.min(text.length, open + 6000);
  for (let i = open; i < limit; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The lowercase word immediately before `offset` (used only for relation disambiguation). */
function precedingWord(text, offset) {
  let j = offset - 1;
  while (j >= 0 && /\s/.test(text[j])) j -= 1;
  const end = j + 1;
  while (j >= 0 && /[A-Za-z_]/.test(text[j])) j -= 1;
  return text.slice(j + 1, end).toLowerCase();
}

export {
  balancedParenSpan,
  enclosingCalls,
  expressionEnd,
  lineOf,
  listSourceFiles,
  matchBracket,
  precedingWord,
  readObjectKeys,
  readStringLiteral,
  skipGenerics,
  skipTrivia,
  stringRunAround,
};
