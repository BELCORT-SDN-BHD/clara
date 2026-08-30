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
 * The code a module can actually RUN when something imports it: every top-level
 * declaration reachable from an exported one, plus the module's own top-level
 * statements.
 *
 * A call that appears only outside this text — in an unexported helper nobody
 * invokes, or an exported one nothing reaches — is dead, and a dead guard guards
 * nothing (Codex review of #451, MEDIUM-3, attack B).
 */
export function reachableCode(code: string): string {
  const decls = declarations(code);
  const byName = new Map(decls.map((d) => [d.name, d]));

  // Top-level statements: whatever is left once every declaration — HEADER AND
  // BODY — is cut out. Cutting only bodies leaves `function unused() ` behind, and
  // the shell then reads as a reference to `unused`, making every declaration
  // reach itself. Imports and re-exports remain, which is what they are for.
  const covered = new Uint8Array(code.length);
  for (const d of decls) covered.fill(1, d.start, d.end);
  let shell = "";
  for (let i = 0; i < code.length; i += 1) if (covered[i] === 0) shell += code[i];

  const reached = new Set<string>();
  const queue: string[] = [];
  const consider = (text: string) => {
    for (const m of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = m[0];
      if (byName.has(name) && !reached.has(name)) {
        reached.add(name);
        queue.push(name);
      }
    }
  };

  for (const d of decls) if (d.exported && !reached.has(d.name)) {
    reached.add(d.name);
    queue.push(d.name);
  }
  consider(shell);
  while (queue.length > 0) {
    const next = byName.get(queue.pop() as string);
    if (next) consider(next.body);
  }

  return [shell, ...[...reached].map((n) => byName.get(n)?.body ?? "")].join("\n");
}

/* -------------------------------------------------------------------------- */
/* SQL                                                                         */
/* -------------------------------------------------------------------------- */

export type SqlViews = {
  /** Comments removed; strings and dollar-quoted bodies intact. The migrations'
   *  column contracts live INSIDE `do $$ … $$` blocks, so a view that blanked
   *  those would blank the very evidence. */
  readonly withoutComments: string;
  /** Also blanks the CONTENTS of single-quoted strings and dollar-quoted bodies —
   *  what remains is statement-level SQL, where a `create view` is a real
   *  definition rather than text inside a function body or a notice message. */
  readonly statements: string;
};

/**
 * Lex a migration into the two views the pins need (Codex review of #451, LOW-5:
 * the old regexes read SQL COMMENTS as evidence, so a commented decoy tuple or a
 * commented `CREATE OR REPLACE VIEW` counted).
 *
 * Handles `--` to end of line, `/* … *\/` (nesting, as Postgres does), single
 * quotes with the `''` escape, and dollar quoting with an arbitrary tag. A `--`
 * inside a string is not a comment: 0141's own tail notice contains several.
 */
export function lexSql(sql: string): SqlViews {
  let withoutComments = "";
  let statements = "";
  const emit = (text: string, masked: string) => {
    withoutComments += text;
    statements += masked;
  };

  for (let i = 0; i < sql.length; ) {
    const two = sql.slice(i, i + 2);

    if (two === "--") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (two === "/*") {
      let depth = 0;
      while (i < sql.length) {
        if (sql.slice(i, i + 2) === "/*") {
          depth += 1;
          i += 2;
        } else if (sql.slice(i, i + 2) === "*/") {
          depth -= 1;
          i += 2;
          if (depth === 0) break;
        } else i += 1;
      }
      continue;
    }
    if (sql[i] === "'") {
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i += 1;
          break;
        } else i += 1;
      }
      const raw = sql.slice(start, i);
      emit(raw, `'${" ".repeat(Math.max(raw.length - 2, 0))}'`);
      continue;
    }
    const dollar = /^\$[A-Za-z_]?[\w]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      const innerEnd = close < 0 ? sql.length : close;
      const inner = sql.slice(i + tag.length, innerEnd);
      // RECURSE for `withoutComments`: a `do $$ … $$` body is real PL/pgSQL with
      // real comments in it, and the migrations' column contracts live INSIDE such
      // a block (0141:605-668). Emitting the block raw would leave a commented
      // decoy tuple inside it counting as evidence — LOW-5's attack, one level
      // down. `statements` still blanks the body wholesale: a `create view` in
      // there is text, not a definition.
      emit(
        `${tag}${lexSql(inner).withoutComments}${tag}`,
        `${tag}${" ".repeat(inner.length)}${tag}`,
      );
      i = close < 0 ? sql.length : close + tag.length;
      continue;
    }

    emit(sql[i] as string, sql[i] as string);
    i += 1;
  }

  return { withoutComments, statements };
}
