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
   *  escape strings, and every NESTED dollar payload. What remains is
   *  statement-level SQL, where a `create view` is a real definition rather than a
   *  notice message, a quoted decoy, or a nested literal.
   *
   *  A TOP-LEVEL `do $$ … $$` BODY IS NOT A LITERAL AND IS NOT MASKED. It is
   *  executable SQL that Postgres runs, so `do $$ begin create or replace view
   *  clara.x …; end $$;` really does define the view — masking it hid a live body
   *  from the one-definition census (#451 round-3, MED-3). What it CONTAINS is
   *  still masked by kind: a `raise notice '…'` decoy is a string, a `$q$ … $q$`
   *  payload is a nested dollar literal. */
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
      // Whether a CLOSING quote was actually consumed. A string left unterminated
      // at EOF has none, and re-emitting one anyway made `statements` one byte
      // LONGER than `withoutComments` — breaking the length-preserving property
      // every offset-based read in the pins relies on (#451 round-3, LOW-2).
      let closed = false;
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
          closed = true;
          break;
        }
        i += 1;
      }
      const raw = sql.slice(start, i);
      const lead = isEscapeString ? 2 : 1;
      const tail = closed ? "'" : "";
      emit(raw, `${raw.slice(0, lead)}${blank(raw.length - lead - tail.length)}${tail}`);
      continue;
    }

    // A DOLLAR-QUOTE TAG IS `$$` OR `$identifier$` — the tag body, when present,
    // must START with a letter or underscore. `$1$` is a positional PARAMETER
    // followed by a `$`, and PostgreSQL does not read it as a quote; the old
    // `[A-Za-z_]?[\w]*` accepted it, and since nothing closes it the lexer then
    // masked the entire rest of the file (#451 round-3, LOW-3).
    const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      if (close < 0) {
        // UNTERMINATED. PostgreSQL would reject the file outright, so this is not
        // a dollar quote — and masking to EOF is the FAIL-OPEN direction: every
        // statement after it would vanish from the census silently. Emit the `$`
        // as the literal it is and carry on, leaving what follows visible.
        emit("$", "$");
        i += 1;
        continue;
      }
      const inner = sql.slice(i + tag.length, close);
      const closer = tag;
      if (depth === 0) {
        // A `do $$ … $$` / function body: executable SQL. Lex it for BOTH views —
        // comments inside it are blanked, a dollar string nested WITHIN it is
        // masked, and a statement inside it is a STATEMENT. Blanking the whole
        // body in `statements` made `do $$ begin create or replace view
        // clara.caller_context …; end $$;` invisible to the one-live-body census,
        // which is precisely what that census exists to catch (#451 round-3,
        // MED-3). A `raise notice 'create view …'` decoy stays masked because it
        // is a string; a `$q$ … $q$` payload stays masked because it is depth 1.
        const lexed = lexSql(inner, depth + 1);
        emit(`${tag}${lexed.withoutComments}${closer}`, `${tag}${lexed.statements}${closer}`);
      } else {
        // Nested: a string literal, whatever it looks like. Masked in BOTH views —
        // a contract tuple or a CREATE VIEW in here is text, not evidence.
        const masked = blankPreservingLines(inner);
        emit(`${tag}${masked}${closer}`, `${tag}${masked}${closer}`);
      }
      i = close + tag.length;
      continue;
    }

    emit(sql[i] as string, sql[i] as string);
    i += 1;
  }

  return { withoutComments, statements };
}
