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
//   - EXPORT SHAPE: `function DELETE()` and `const DELETE =` were the only two
//     shapes the method census knew, so `export { rawDelete as DELETE }` and
//     `export let DELETE = …` — both routable, Next dispatches on the module's
//     export RECORD — were invisible to it, and an unguarded DELETE on the API
//     entrance passed every per-root cell (#451 round-3 review, MED-1).
//   - SWALLOWED THROWS: `redirect()` signals by THROWING, so a spine call inside
//     a `try { … } catch {}` is disarmed while every textual pin, tsc and
//     `no-floating-promises` stay green (MED-2). `tryBlockRanges` is the
//     instrument that sees it.

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
export function matchBlock(src: string, open: number): number {
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

export type DeclKind = "function" | "const" | "let" | "var";

export type Decl = {
  readonly name: string;
  /** How it was bound. `let`/`var` at MODULE level is mutable state that outlives
   *  a request — the shape `tests/require-firm-scope.test.ts`'s cache-safety cell
   *  bans, and the reason this field exists rather than a whole-file regex (a
   *  function-local `let` is per-call and perfectly legitimate). */
  readonly kind: DeclKind;
  readonly exported: boolean;
  readonly isDefault: boolean;
  /** For a function, the `{…}` block. For a binding, the initialiser text after
   *  the `=`. */
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
      kind: "function",
      exported: Boolean(m[1]) || Boolean(m[2]),
      isDefault: Boolean(m[2]),
      body: code.slice(bodyOpen, bodyEnd),
      start: m.index,
      end: bodyEnd,
    });
  }

  // `let` and `var` as well as `const` (#451 round-3 review, MED-1). `export let
  // DELETE = rawDelete` is a real, routable Route Handler export; reading only
  // `const` meant the method census could not see it at all.
  const constRe = /(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=/g;
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
      name: m[3] as string,
      kind: m[2] as DeclKind,
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

/**
 * The module's top-level declarations — nothing nested inside another one.
 *
 * Exposed because "is this binding MODULE-level?" is a question a whole-file regex
 * cannot answer: `/^\s*let\s/m` reds on a function-local `let` (which is per-call
 * state and entirely legitimate) as readily as on a module-level one.
 */
export function moduleLevelDeclarations(code: string): Decl[] {
  return declarations(code);
}

/**
 * `export { a as B, c }` → `Map(B → a, c → c)`.
 *
 * A named export clause is a REAL export — Next dispatches a Route Handler off the
 * module's export record (`handlers[method]`), not off how the binding was spelled
 * — so `export { rawDelete as DELETE }` routes exactly as `export function
 * DELETE()` does (#451 round-3 review, MED-1).
 *
 * `export type { … }` is erased at runtime and exports nothing, so it is skipped.
 * A specifier this cannot parse (a string-literal export name, `export { x } from
 * "./y"` whose local binding lives in another module) is deliberately NOT resolved:
 * `reachableFrom` then finds no body and returns `null`, and the caller's cell reds.
 * Fail-closed — an export whose code this instrument cannot see is never "guarded".
 */
export function exportClauseAliases(code: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of code.matchAll(/\bexport\s*(type\s+)?\{([^}]*)\}/g)) {
    if (m[1]) continue;
    for (const spec of (m[2] as string).split(",")) {
      const parsed = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(spec.trim());
      if (!parsed) continue;
      const local = parsed[1] as string;
      out.set(parsed[2] ?? local, local);
    }
  }
  return out;
}

/**
 * The `[start, end)` ranges of every `try { … }` block in `code`, brace-matched
 * and quote-aware.
 *
 * WHY THIS IS AN INSTRUMENT AND NOT A REGEX. `redirect()` signals by THROWING
 * `NEXT_REDIRECT`, so `try { await requireFirmScope(); } catch {}` disarms an
 * entrance completely — and it satisfies the textual `await` pin, `tsc`, and
 * `@typescript-eslint/no-floating-promises` all at once. Nothing already in this
 * suite could see it (#451 round-3 review, MED-2). Knowing WHERE the try blocks
 * are is what lets a cell ask whether the spine call sits inside one.
 */
export function tryBlockRanges(code: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of code.matchAll(/\btry\s*\{/g)) {
    const open = code.indexOf("{", m.index);
    if (open < 0) continue;
    const end = matchBlock(code, open);
    if (end > 0) out.push([m.index, end]);
  }
  return out;
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
  // An EXPORT NAME need not be the name of the declaration behind it: with
  // `export { rawDelete as DELETE }` the root Next dispatches is `DELETE` and the
  // code that runs is `rawDelete`'s. Resolve the alias, so a genuinely guarded
  // aliased handler is seen as guarded and an unguarded one reds on its body
  // rather than on the instrument's blindness.
  const start = byName.has(rootName) ? rootName : exportClauseAliases(code).get(rootName);
  if (start === undefined || !byName.has(start)) return null;

  const reached = new Set<string>([start]);
  const queue: string[] = [start];
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

/**
 * The HTTP methods this module exports as handlers, in declaration order.
 *
 * ALL THREE EXPORT SHAPES, not just the two that are easy to see (#451 round-3
 * review, MED-1). Next 16 dispatches off the module's export RECORD — it looks up
 * `handlers[method]` / `method in userland` — so how the binding was SPELLED is
 * irrelevant to whether a request reaches it. Reading only `function DELETE(` and
 * `const DELETE =` meant `export { rawDelete as DELETE }` and `export let DELETE
 * = rawDelete` were both invisible: an unguarded DELETE added to the API entrance
 * in either shape passed BOTH per-root cells, because the census never named it as
 * a root at all. Review law 3, in its exact form — the instrument was reading a
 * SPELLING and calling it the export.
 */
export function exportedHttpMethods(code: string): string[] {
  const methods = new Set<string>(HTTP_METHODS);
  const found: string[] = [];
  for (const d of declarations(code)) {
    if (d.exported && methods.has(d.name) && !found.includes(d.name)) found.push(d.name);
  }
  for (const exported of exportClauseAliases(code).keys()) {
    if (methods.has(exported) && !found.includes(exported)) found.push(exported);
  }
  return found;
}
