// THE ONE READER THIS DIRECTORY'S CENSUSES SHARE (#864 fix round, 2026-09-23).
//
// Two cells in this directory read every `*.spec.ts` as TEXT and assert something structural about
// it: `settle-before-scan-census.test.ts` (#1017 — every accessibility scan settles first) and
// `cell-budget-census.test.ts` (#864 — every cell's time budget is sized to its own work). Both
// need the same four primitives, and before this module they had two divergent copies of them:
// #1017's could strip comments but had no notion of a cell boundary, #864's could find a cell body
// but read comments as code and resolved no call at all — which is exactly how #864's rule-2
// detector came to key on the literal token `scan(` and miss `signup-confirm-pending.spec.ts`,
// a file in precisely the shape that rule exists for (review finding SPEC-864-A / STD-1).
//
// One copy, one set of vacuity controls. A census that wants a different RULE writes a different
// rule; it does not re-implement the reading.
//
// WHY TEXT AND NOT A REAL PARSER. The repo has no TypeScript AST dependency in its test path, and
// adding one to satisfy a lint would be a large dependency for a small job. Every function here is
// therefore a deliberate, documented approximation, and each carries a vacuity control in the census
// that uses it. The approximations are stated where they are made rather than left to be discovered.

import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = dirname(fileURLToPath(import.meta.url));

/** Every browser spec in this directory, read from disk rather than listed by hand — the same
 *  discipline `sign-in-census.test.ts` already argues for. */
export function specFiles(): string[] {
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".spec.ts"))
    .sort();
}

/**
 * Removes `//` line comments and block comments, leaving string and template-literal contents
 * untouched (a URL like `"https://x"` must never be read as a comment start) and every newline in
 * place, so a line number computed against the RETURNED text still names the same line in the
 * original file.
 *
 * WHY EVERY CENSUS HERE MUST STRIP FIRST. This suite's own prose regularly quotes the exact code
 * shapes these censuses grep for — `staff-expense-claim-walk.spec.ts`'s header says "one full-page
 * `AxeBuilder.analyze()` is 14.4 s alone" five lines above its one real, already-settled call, and
 * a comment-blind first cut of #1017's census read that prose as a second, uncovered scan.
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          out += source[i];
          i += 1;
          if (i < n) {
            out += source[i];
            i += 1;
          }
          continue;
        }
        out += source[i];
        i += 1;
      }
      if (i < n) {
        out += source[i];
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** 1-based line number of `index` in `source`. */
export function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

/** The index just past the `}` that closes the block opened at `openBrace`, or -1. */
function endOfBlock(source: string, openBrace: number): number {
  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Every `function NAME(...) { … }` declaration's own body, brace-balanced so a nested `{` (an `if`,
 * an object literal) does not end the extraction early. `async` and `export` are optional; an arrow
 * constant (`const f = async () => {}`) is deliberately NOT read — no file in this directory
 * declares a scan, settle or sign-in helper that way today, and a census that silently half-read
 * one shape would be worse than one that reads a single shape completely.
 */
export function functionBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const re = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const openBrace = source.indexOf("{", m.index + m[0].length);
    if (openBrace === -1) continue;
    const end = endOfBlock(source, openBrace);
    if (end === -1) continue;
    bodies.set(m[1]!, source.slice(openBrace + 1, end));
  }
  return bodies;
}

/** One named function's body, or null when no such declaration exists — the caller's job is to say
 *  whether that is a problem, not this one's. */
export function functionBody(source: string, name: string): string | null {
  return functionBodies(source).get(name) ?? null;
}

export type SpecCell = {
  /** The cell's own title, as written. */
  title: string;
  /** The cell's body INCLUDING its outermost braces. */
  body: string;
  /** 1-based line of the `test(` that opens it. */
  line: number;
};

/**
 * Every `test(...)`/`test.only(...)` CELL's own body, located by the arrow's `=> {` rather than by
 * the first `{` after `test(` — a destructured `async ({ page }) => {` parameter has its OWN brace,
 * and taking that one for the body's opener would end the walk at the parameter list's own close,
 * reading zero of the cell's real content.
 */
export function testCells(source: string): SpecCell[] {
  const cells: SpecCell[] = [];
  const re = /\btest(?:\.only)?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const window = source.slice(m.index, m.index + 4000);
    const arrow = /=>\s*\{/.exec(window);
    if (!arrow) continue;
    const bodyStart = m.index + arrow.index + arrow[0].length - 1;
    const end = endOfBlock(source, bodyStart);
    if (end === -1) continue;
    cells.push({ title: m[2]!, body: source.slice(bodyStart, end + 1), line: lineAt(source, m.index) });
    re.lastIndex = end;
  }
  return cells;
}

/** How many times `text` calls `name(` — the one call-counting spelling every census here shares. */
export function callCount(text: string, name: string): number {
  return (text.match(new RegExp(String.raw`\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*\(`, "g")) ?? []).length;
}

/**
 * How much of some measured quantity a piece of code is responsible for, counting what it does
 * ITSELF plus what every in-file function it calls does, once per call.
 *
 * WHY TRANSITIVE. A cell that calls a local `openAndWait(page)` three times, where that helper
 * awaits a 30 s fixture poll, waits up to 90 s — and a census that only read the cell's own text
 * would price it at zero. That under-reading is the same class of hole review finding SPEC-864-A
 * found in the literal-`scan(` detector, so it is closed here once for every rule built on top.
 *
 * `seen` breaks recursion (a helper that calls itself, or two that call each other) by pricing the
 * second entry at zero rather than looping forever.
 */
export function transitiveAmount(
  text: string,
  bodies: Map<string, string>,
  own: (body: string) => number,
  seen: ReadonlySet<string> = new Set(),
): number {
  let total = own(text);
  for (const [name, body] of bodies) {
    if (seen.has(name)) continue;
    const calls = callCount(text, name);
    if (calls === 0) continue;
    total += calls * transitiveAmount(body, bodies, own, new Set([...seen, name]));
  }
  return total;
}
