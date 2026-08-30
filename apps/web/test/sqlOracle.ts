// SQL ORACLE — the lexer the migration pins read the corpus through.
//
// WHY A LEXER AND NOT A REGEX. Every shortcut here has already been exploited in
// review:
//   - A raw regex read SQL COMMENTS as evidence, so a commented decoy tuple or a
//     commented `CREATE OR REPLACE VIEW` counted (#451 Codex LOW-5).
//   - Stripping comments only at the top level left them live inside `do $$ … $$`
//     bodies, which is exactly where the migrations' column contracts live.
//   - Retaining NESTED dollar-string payloads let a contract-shaped decoy inside
//     `$inner$…$inner$` satisfy the contract match (#451 Codex round 2, item 4).
//   - Treating `'…''…'` as the only string form missed PostgreSQL's escape
//     strings, `E'…\'…'`, which the corpus really contains
//     (`packages/db/migrations/0111_f_a5_reporting_agency_pr1.sql:606`).
//
// MASKING IS LENGTH-PRESERVING, deliberately. Every view returned here has the
// SAME length as the input, so a match offset found in one view addresses the same
// bytes in another. That is what lets a caller prove a construct is at STATEMENT
// level (found in `statements`) and then read its literal VALUES from the same
// offsets in `withoutComments` — without which "is this CHECK real?" and "what
// does it say?" cannot both be answered soundly.

export type SqlViews = {
  /** Comments blanked. Top-level dollar-quoted bodies are KEPT and lexed (a
   *  `do $$ … $$` body is executable SQL, and the column contracts live in one),
   *  but a dollar string NESTED inside such a body is a literal and is masked.
   *  Single-quoted strings keep their contents — the contracts' values are
   *  strings. */
  readonly withoutComments: string;
  /** Comments blanked AND every literal payload masked — single-quoted strings,
   *  escape strings and all dollar payloads. What remains is statement-level SQL,
   *  where a `create view` is a real definition rather than text inside a body, a
   *  notice message or a decoy. */
  readonly statements: string;
};

const blank = (n: number): string => " ".repeat(Math.max(n, 0));

/** Keep newlines when blanking a run, so line numbers in a failure still mean
 *  something to whoever reads the diff. */
function blankPreservingLines(text: string): string {
  let out = "";
  for (const ch of text) out += ch === "\n" ? "\n" : " ";
  return out;
}

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

/**
 * Lex one migration into the two views above.
 *
 * `depth` is the dollar-quote nesting level and is not a caller's concern: at
 * depth 0 a dollar block is a body to lex, at depth ≥1 it is a string literal to
 * mask. PostgreSQL permits both, distinguished only by tag, which is why the
 * distinction has to be positional rather than textual.
 */
export function lexSql(sql: string, depth = 0): SqlViews {
  let withoutComments = "";
  let statements = "";
  const emit = (kept: string, masked: string) => {
    withoutComments += kept;
    statements += masked;
  };

  for (let i = 0; i < sql.length; ) {
    const two = sql.slice(i, i + 2);

    if (two === "--") {
      const start = i;
      while (i < sql.length && sql[i] !== "\n") i += 1;
      const run = blankPreservingLines(sql.slice(start, i));
      emit(run, run);
      continue;
    }

    if (two === "/*") {
      const start = i;
      let nest = 0;
      while (i < sql.length) {
        if (sql.slice(i, i + 2) === "/*") {
          nest += 1;
          i += 2;
        } else if (sql.slice(i, i + 2) === "*/") {
          nest -= 1;
          i += 2;
          if (nest === 0) break;
        } else i += 1;
      }
      const run = blankPreservingLines(sql.slice(start, i));
      emit(run, run);
      continue;
    }

    // A single-quoted string, or PostgreSQL's escape-string form `E'…'` / `e'…'`
    // in which a BACKSLASH escapes the next character. The `E` must not be the
    // tail of an identifier (`someE'x'` is not an escape string).
    const isEscapeString =
      (sql[i] === "E" || sql[i] === "e") && sql[i + 1] === "'" && !isIdentChar(sql[i - 1]);
    if (sql[i] === "'" || isEscapeString) {
      const start = i;
      if (isEscapeString) i += 1;
      i += 1; // the opening quote
      while (i < sql.length) {
        if (isEscapeString && sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      const raw = sql.slice(start, i);
      const lead = isEscapeString ? 2 : 1;
      emit(raw, `${raw.slice(0, lead)}${blank(raw.length - lead - 1)}'`);
      continue;
    }

    const dollar = /^\$[A-Za-z_]?[\w]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      const innerEnd = close < 0 ? sql.length : close;
      const inner = sql.slice(i + tag.length, innerEnd);
      const closer = close < 0 ? "" : tag;
      if (depth === 0) {
        // A `do $$ … $$` / function body: executable SQL. Lex it, so comments
        // inside it are blanked and any dollar string nested WITHIN it is masked.
        emit(`${tag}${lexSql(inner, depth + 1).withoutComments}${closer}`,
             `${tag}${blankPreservingLines(inner)}${closer}`);
      } else {
        // Nested: a string literal, whatever it looks like. Masked in BOTH views —
        // a contract tuple or a CREATE VIEW in here is text, not evidence.
        const masked = blankPreservingLines(inner);
        emit(`${tag}${masked}${closer}`, `${tag}${masked}${closer}`);
      }
      i = close < 0 ? sql.length : close + tag.length;
      continue;
    }

    emit(sql[i] as string, sql[i] as string);
    i += 1;
  }

  return { withoutComments, statements };
}
