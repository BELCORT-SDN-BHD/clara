// SOURCE ORACLE — the instruments the scope-spine suites read the tree with.
//
// Shared rather than duplicated because these ARE judgement logic: they decide
// whether a file calls something, and two drifting copies of that decision is the
// exact defect the spine's own "one implementation" law exists to prevent. Their
// own controls live in `tests/firm-scope-surfaces.test.ts`.
//
// WHY THEY EXIST AT ALL — each one is a defect that got past a weaker instrument:
//   - COMMENT STRIPPING: the first version of this suite regexed raw text, so
//     deleting a layout's real `await requireFirmScope();` left it GREEN — both
//     entrance files NAME the spine in their headers. Review law 3: a guard that
//     reads a NAME reads a projection of the thing.
//   - STRING BLANKING: with comments stripped, `const s = "requireFirmScope()"`
//     still matched (Codex review of #451, MEDIUM-3, attack B).
//   - REACHABILITY: so did an exported-but-never-invoked helper containing the
//     call. A guard that is never executed is not a guard.

import { readFileSync } from "node:fs";

/* -------------------------------------------------------------------------- */
/* TypeScript/JavaScript                                                       */
/* -------------------------------------------------------------------------- */

export type StripOptions = {
  /** Replace the CONTENTS of string and template literals with spaces, keeping
   *  the delimiters. Defeats a decoy in a string; keeps offsets stable. */
  readonly blankStrings?: boolean;
};

/**
 * Source with comments removed. String and template literals are preserved unless
 * `blankStrings` is set.
 *
 * Regex literals are not tokenised — none of the files these suites walk contains
 * one whose body could be mistaken for a comment or a quote, and the controls in
 * the suite fail loudly if that stops being true.
 */
export function stripComments(src: string, opts: StripOptions = {}): string {
  const blank = opts.blankStrings === true;
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; ) {
    const c = src[i] as string;
    const d = src[i + 1];
    if (quote !== null) {
      if (c === "\\") {
        out += blank ? "  " : c + (d ?? "");
        i += 2;
        continue;
      }
      if (c === quote) {
        out += c;
        quote = null;
        i += 1;
        continue;
      }
      out += blank && c !== "\n" ? " " : c;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

export function readCode(path: string, opts: StripOptions = {}): string {
  return stripComments(readFileSync(path, "utf8"), opts);
}

/** Index of the character after the block that opens at `open` (`{`, `(` or `[`),
 *  or -1. Quote-aware, so a brace inside a string cannot unbalance the scan. */
function matchBlock(src: string, open: number): number {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const closer = pairs[src[open] as string];
  if (!closer) return -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i] as string;
    if (quote !== null) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === src[open]) depth += 1;
    else if (c === closer) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

type Decl = {
  readonly name: string;
  readonly exported: boolean;
  readonly isDefault: boolean;
  readonly body: string;
  /** Range of the WHOLE declaration — header included. Cutting only the body
   *  leaves `function unused() ` in the module shell, and the shell is then read
   *  as a reference to `unused`, so every declaration reaches itself and nothing
   *  is ever dead. This suite's own vacuity control caught exactly that. */
  readonly start: number;
  readonly end: number;
};

/**
 * Top-level declarations of a module: `function NAME(...) {…}` and
 * `const NAME = …;`, each with whether it is exported.
 *
 * Deliberately shallow — it is a reachability aid, not a compiler. Its job is to
 * tell an EXECUTED call from a dead one, and the suite's mutants (dead helper,
 * string decoy, deleted call) are what prove it still does that job.
 */
function declarations(code: string): Decl[] {
  const out: Decl[] = [];

  const fnRe = /(export\s+)?(default\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (let m = fnRe.exec(code); m !== null; m = fnRe.exec(code)) {
    const parenOpen = code.indexOf("(", m.index + m[0].length - 1);
    const afterParams = matchBlock(code, parenOpen);
    if (afterParams < 0) continue;
    const bodyOpen = code.indexOf("{", afterParams);
    if (bodyOpen < 0) continue;
    const bodyEnd = matchBlock(code, bodyOpen);
    if (bodyEnd < 0) continue;
    out.push({
      name: m[4] as string,
      exported: Boolean(m[1]) || Boolean(m[2]),
      isDefault: Boolean(m[2]),
      body: code.slice(bodyOpen, bodyEnd),
      start: m.index,
      end: bodyEnd,
    });
  }

  const constRe = /(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=/g;
  for (let m = constRe.exec(code); m !== null; m = constRe.exec(code)) {
    const start = m.index + m[0].length;
    let end = start;
    let depth = 0;
    let quote: string | null = null;
    for (; end < code.length; end += 1) {
      const c = code[end] as string;
      if (quote !== null) {
        if (c === "\\") end += 1;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{" || c === "(" || c === "[") depth += 1;
      else if (c === "}" || c === ")" || c === "]") depth -= 1;
      else if (c === ";" && depth <= 0) break;
    }
    out.push({
      name: m[2] as string,
      exported: Boolean(m[1]),
      isDefault: false,
      body: code.slice(start, end),
      start: m.index,
      end,
    });
  }

  // Drop anything declared INSIDE another declaration — a `const` in a function
  // body is not a module-level name, and treating it as one would let a dead
  // function's local pull the function back into reachability.
  return out
    .filter((d) => !out.some((o) => o !== d && o.start <= d.start && o.end >= d.end && (o.start !== d.start || o.end !== d.end)))
    .sort((a, b) => a.start - b.start);
}

/** The HTTP methods a Next.js Route Handler may export. Each is a SEPARATE
 *  handler with its own execution path — a guard in `GET` does nothing for a
 *  request that arrives as `POST`. */
export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

/**
 * The code reachable FROM ONE ROOT — the transitive closure of top-level
 * declarations that root references. `null` when the module has no such
 * declaration.
 *
 * PER ROOT, NOT PER MODULE (#451 Codex round 2, item 1). The previous version
 * rooted EVERY export and returned their union, which answers a weaker question
 * than the one the guard cells ask. Under it:
 *   - a page whose DEFAULT render is unguarded passed if some other export —
 *     `generateStaticParams()`, which Next runs at BUILD time — called the guard;
 *   - a Route Handler with a guarded `GET` and an unguarded `POST` passed, because
 *     the union contained the guard from `GET`.
 * Both are "somewhere in this file there is a guard", which is not the claim.
 * The claim is that the path a REQUEST takes runs it.
 */
export function reachableFrom(code: string, rootName: string): string | null {
  const byName = new Map(declarations(code).map((d) => [d.name, d]));
  if (!byName.has(rootName)) return null;

  const reached = new Set<string>([rootName]);
  const queue: string[] = [rootName];
  while (queue.length > 0) {
    const decl = byName.get(queue.pop() as string);
    if (!decl) continue;
    for (const m of decl.body.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = m[0];
      if (byName.has(name) && !reached.has(name)) {
        reached.add(name);
        queue.push(name);
      }
    }
  }
  return [...reached].map((n) => byName.get(n)?.body ?? "").join("\n");
}

/** The name of the module's default export, or `null`. For a page or a layout
 *  this is the ONLY export a request renders through. */
export function defaultExportName(code: string): string | null {
  return declarations(code).find((d) => d.isDefault)?.name ?? null;
}

/** The HTTP methods this module exports as handlers, in declaration order. */
export function exportedHttpMethods(code: string): string[] {
  const methods = new Set<string>(HTTP_METHODS);
  return declarations(code)
    .filter((d) => d.exported && methods.has(d.name))
    .map((d) => d.name);
}
