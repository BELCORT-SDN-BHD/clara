// SQL ORACLE — length-preserving lexical views for migration census tests.
//
// Dollar strings are data by default. Only a delimiter syntactically attached to
// an executable DO statement is unwrapped and recursively lexed. This keeps an
// ordinary SELECT literal and an uninvoked CREATE FUNCTION body from becoming
// evidence while still seeing DDL executed by nested DO blocks.

export type SqlViews = {
  /** Comments and non-DO dollar payloads blanked; single-quoted values kept. */
  readonly withoutComments: string;
  /** Comments and every literal payload blanked; executable DO bodies unwrapped. */
  readonly statements: string;
};

const blank = (n: number): string => " ".repeat(Math.max(0, n));

/** Blank by UTF-16 code unit, not code point. Offsets therefore stay equal even
 * when a comment or literal contains an astral character. */
function blankPreservingLines(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) out += text[i] === "\n" || text[i] === "\r" ? text[i] : " ";
  return out;
}

function previousCodePoint(text: string, offset: number): string | undefined {
  if (offset <= 0) return undefined;
  const low = text.charCodeAt(offset - 1);
  if (low >= 0xdc00 && low <= 0xdfff && offset >= 2) return text.slice(offset - 2, offset);
  return text[offset - 1];
}

/** PostgreSQL's measured tag rule from migration 0045: non-ASCII code points are
 * admitted, digits are non-initial, and a `$tag$` following identifier text is
 * part of that identifier rather than a delimiter. */
function dollarDelimiter(sql: string, offset: number): string | null {
  const previous = previousCodePoint(sql, offset);
  if (previous !== undefined && /[A-Za-z0-9_$\u0080-\u{10ffff}]/u.test(previous)) return null;
  const match = /^\$(?:[A-Za-z_\u0080-\u{10ffff}][A-Za-z0-9_\u0080-\u{10ffff}]*)?\$/u.exec(sql.slice(offset));
  return match?.[0] ?? null;
}

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$\u0080-\u{10ffff}]/u.test(ch);
}

/** The masked executable prefix must end in the DO grammar immediately before
 * the delimiter. Semicolons delimit statements; BEGIN before a nested DO is fine. */
function attachedToDo(statements: string): boolean {
  const current = statements.slice(statements.lastIndexOf(";") + 1);
  return /(?:^|\s)do(?:\s+language\s+(?:"(?:[^"]|"")+"|[A-Za-z_\u0080-\u{10ffff}][A-Za-z0-9_$\u0080-\u{10ffff}]*))?\s*$/iu.test(current);
}

function lexExecutable(sql: string): SqlViews {
  let withoutComments = "";
  let statements = "";
  const emit = (kept: string, masked: string): void => {
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
      const run = blankPreservingLines(sql.slice(start, i));
      emit(run, run);
      continue;
    }

    const isEscapeString = (sql[i] === "E" || sql[i] === "e") && sql[i + 1] === "'"
      && !isIdentChar(previousCodePoint(sql, i));
    if (sql[i] === "'" || isEscapeString) {
      const start = i;
      if (isEscapeString) i += 1;
      i += 1;
      let closed = false;
      while (i < sql.length) {
        if (isEscapeString && sql[i] === "\\") {
          i = Math.min(sql.length, i + 2);
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

    if (sql[i] === "$") {
      const tag = dollarDelimiter(sql, i);
      if (tag !== null) {
        const close = sql.indexOf(tag, i + tag.length);
        if (close < 0) {
          // Invalid SQL must not make the remaining migration invisible.
          emit("$", "$");
          i += 1;
          continue;
        }
        const inner = sql.slice(i + tag.length, close);
        if (attachedToDo(statements)) {
          const lexed = lexExecutable(inner);
          emit(`${tag}${lexed.withoutComments}${tag}`, `${tag}${lexed.statements}${tag}`);
        } else {
          const masked = blankPreservingLines(inner);
          emit(`${tag}${masked}${tag}`, `${tag}${masked}${tag}`);
        }
        i = close + tag.length;
        continue;
      }
    }

    emit(sql[i] as string, sql[i] as string);
    i += 1;
  }
  return { withoutComments, statements };
}

/** `depth` is retained only for source compatibility with the old helper. Every
 * public call starts in executable SQL; recursive DO bodies use the same rule. */
export function lexSql(sql: string, depth = 0): SqlViews {
  void depth;
  return lexExecutable(sql);
}

/** Every statement-level definition offset for one Clara view. Optional
 * RECURSIVE belongs before VIEW in PostgreSQL's CREATE VIEW grammar. */
export function viewDefinitionOffsets(sql: string, view: string): number[] {
  const escaped = view.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?(?:recursive\\s+)?view\\s+"?clara"?\\s*\\.\\s*"?${escaped}\\b"?`,
    "gi",
  );
  return [...lexSql(sql).statements.matchAll(re)].map((match) => match.index ?? -1);
}
