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
  /** Named fail-closed diagnostics. A target census must reject every diagnostic
   * that could synthesize that target instead of answering from incomplete text. */
  readonly unresolvedDynamicSql: readonly string[];
};

type SqlPair = Pick<SqlViews, "withoutComments" | "statements">;

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

type SqlToken = {
  readonly kind: "word" | "quoted" | "symbol";
  readonly value: string;
  readonly start: number;
  readonly end: number;
};

type LocalFunction = {
  readonly identity: readonly string[];
  readonly body: string;
  readonly bodyStart: number;
  exposed: boolean;
};

function sqlTokens(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  for (let i = 0; i < sql.length;) {
    const point = String.fromCodePoint(sql.codePointAt(i) as number);
    if (/\s/u.test(point)) {
      i += point.length;
      continue;
    }
    if (sql[i] === '"') {
      const start = i;
      i += 1;
      let value = "";
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (sql[i] === '"') {
          i += 1;
          break;
        } else {
          const next = String.fromCodePoint(sql.codePointAt(i) as number);
          value += next;
          i += next.length;
        }
      }
      tokens.push({ kind: "quoted", value, start, end: i });
      continue;
    }
    if (/[A-Za-z_\u0080-\u{10ffff}]/u.test(point)) {
      const start = i;
      let value = point;
      i += point.length;
      while (i < sql.length) {
        const next = String.fromCodePoint(sql.codePointAt(i) as number);
        if (!/[A-Za-z0-9_$\u0080-\u{10ffff}]/u.test(next)) break;
        value += next;
        i += next.length;
      }
      tokens.push({ kind: "word", value: value.toLocaleLowerCase("en-US"), start, end: i });
      continue;
    }
    tokens.push({ kind: "symbol", value: point, start: i, end: i + point.length });
    i += point.length;
  }
  return tokens;
}

const isKeyword = (token: SqlToken | undefined, keyword: string): boolean =>
  token?.kind === "word" && token.value === keyword;

function qualifiedIdentifier(tokens: readonly SqlToken[], start: number): { identity: string[]; next: number } | null {
  const first = tokens[start];
  if (first === undefined || (first.kind !== "word" && first.kind !== "quoted")) return null;
  const identity = [first.value];
  let next = start + 1;
  if (tokens[next]?.kind === "symbol" && tokens[next]?.value === ".") {
    const second = tokens[next + 1];
    if (second === undefined || (second.kind !== "word" && second.kind !== "quoted")) return null;
    identity.push(second.value);
    next += 2;
  }
  return { identity, next };
}

function currentStatement(text: string): { text: string; start: number } {
  const start = text.lastIndexOf(";") + 1;
  return { text: text.slice(start), start };
}

/** The masked executable prefix must end in the DO grammar immediately before
 * the delimiter. Semicolons delimit statements; BEGIN before a nested DO is fine. */
function attachedToDo(statements: string): boolean {
  const current = statements.slice(statements.lastIndexOf(";") + 1);
  return /(?:^|\s)do(?:\s+language\s+(?:"(?:[^"]|"")+"|[A-Za-z_\u0080-\u{10ffff}][A-Za-z0-9_$\u0080-\u{10ffff}]*))?\s*$/iu.test(current);
}

function attachedExecuteStart(statements: string): number | null {
  const current = currentStatement(statements);
  const match = /\bexecute\s*$/iu.exec(current.text);
  return match === null ? null : current.start + match.index;
}

type SqlStringLiteral = { readonly value: string; readonly end: number };

function sqlStringLiteral(sql: string, start: number): SqlStringLiteral | null {
  const escaped = (sql[start] === "E" || sql[start] === "e") && sql[start + 1] === "'";
  if (sql[start] === "'" || escaped) {
    let i = start + (escaped ? 2 : 1);
    let value = "";
    while (i < sql.length) {
      if (escaped && sql[i] === "\\" && i + 1 < sql.length) {
        value += sql[i + 1] as string;
        i += 2;
      } else if (sql[i] === "'" && sql[i + 1] === "'") {
        value += "'";
        i += 2;
      } else if (sql[i] === "'") {
        return { value, end: i + 1 };
      } else {
        value += sql[i] as string;
        i += 1;
      }
    }
    return null;
  }
  if (sql[start] === "$") {
    const tag = dollarDelimiter(sql, start);
    if (tag === null) return null;
    const close = sql.indexOf(tag, start + tag.length);
    if (close < 0) return null;
    return { value: sql.slice(start + tag.length, close), end: close + tag.length };
  }
  return null;
}

function foldLiteralExecute(sql: string, start: number): SqlStringLiteral | null {
  let cursor = start;
  let value = "";
  while (true) {
    const literal = sqlStringLiteral(sql, cursor);
    if (literal === null) return null;
    value += literal.value;
    cursor = literal.end;
    while (/\s/u.test(sql[cursor] ?? "")) cursor += 1;
    if (sql.slice(cursor, cursor + 2) !== "||") break;
    cursor += 2;
    while (/\s/u.test(sql[cursor] ?? "")) cursor += 1;
  }
  const tail = sql.slice(cursor);
  if (tail.length > 0 && tail[0] !== ";" && !/^(?:into|using)\b/iu.test(tail)) return null;
  return { value, end: cursor };
}

function executableProjection(raw: string, executable: string): string {
  const projected = blankPreservingLines(raw).split("");
  for (let i = 0; i < executable.length && i < projected.length; i += 1) projected[i] = executable[i] as string;
  return projected.join("");
}

function attachedFunctionIdentity(statements: string): readonly string[] | null {
  const current = currentStatement(statements).text;
  if (!/\bas\s*$/iu.test(current)) return null;
  const tokens = sqlTokens(current);
  let i = 0;
  if (!isKeyword(tokens[i], "create")) return null;
  i += 1;
  if (isKeyword(tokens[i], "or") && isKeyword(tokens[i + 1], "replace")) i += 2;
  if (!isKeyword(tokens[i], "function") && !isKeyword(tokens[i], "procedure")) return null;
  const parsed = qualifiedIdentifier(tokens, i + 1);
  return parsed?.identity ?? null;
}

function lineLocation(sql: string, offset: number, sourceName: string): string {
  const before = sql.slice(0, Math.max(0, offset));
  const line = before.split(/\r?\n/).length;
  const lastNewline = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
  return `${sourceName}:${line}:${offset - lastNewline}`;
}

type LexContext = {
  readonly rootSql: string;
  readonly sourceName: string;
  readonly functions: LocalFunction[];
  readonly resolvedExecutes: Set<number>;
  readonly reportedExecutes: Set<number>;
  readonly dynamicHazards: string[];
};

function lexExecutable(sql: string, baseOffset: number, context: LexContext): SqlPair {
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

    if (sql[i] === '"') {
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') {
          i += 1;
          break;
        } else i += 1;
      }
      const raw = sql.slice(start, i);
      emit(raw, raw);
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
      const inner = raw.slice(lead, raw.length - tail.length);
      const executeAt = attachedExecuteStart(statements);
      const functionIdentity = attachedFunctionIdentity(statements);
      if (executeAt !== null) {
        const folded = foldLiteralExecute(sql, start);
        if (folded !== null) {
          context.resolvedExecutes.add(baseOffset + executeAt);
          const lexed = lexExecutable(folded.value, baseOffset + start, context);
          const expression = sql.slice(start, folded.end);
          emit(
            executableProjection(expression, lexed.withoutComments),
            executableProjection(expression, lexed.statements),
          );
          i = folded.end;
          continue;
        }
      }
      if (attachedToDo(statements)) {
        const lexed = lexExecutable(inner, baseOffset + start + lead, context);
        emit(`${raw.slice(0, lead)}${lexed.withoutComments}${tail}`, `${raw.slice(0, lead)}${lexed.statements}${tail}`);
      } else if (functionIdentity !== null) {
        context.functions.push({ identity: functionIdentity, body: inner, bodyStart: baseOffset + start + lead, exposed: false });
        const masked = blankPreservingLines(inner);
        emit(`${raw.slice(0, lead)}${masked}${tail}`, `${raw.slice(0, lead)}${masked}${tail}`);
      } else emit(raw, `${raw.slice(0, lead)}${blankPreservingLines(inner)}${tail}`);
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
        const executeAt = attachedExecuteStart(statements);
        const functionIdentity = attachedFunctionIdentity(statements);
        if (executeAt !== null) {
          const folded = foldLiteralExecute(sql, i);
          if (folded !== null) {
            context.resolvedExecutes.add(baseOffset + executeAt);
            const lexed = lexExecutable(folded.value, baseOffset + i, context);
            const expression = sql.slice(i, folded.end);
            emit(
              executableProjection(expression, lexed.withoutComments),
              executableProjection(expression, lexed.statements),
            );
            i = folded.end;
            continue;
          }
        }
        if (attachedToDo(statements)) {
          const lexed = lexExecutable(inner, baseOffset + i + tag.length, context);
          const delimiterMask = blank(tag.length);
          emit(`${delimiterMask}${lexed.withoutComments}${delimiterMask}`, `${delimiterMask}${lexed.statements}${delimiterMask}`);
        } else if (functionIdentity !== null) {
          context.functions.push({
            identity: functionIdentity,
            body: inner,
            bodyStart: baseOffset + i + tag.length,
            exposed: false,
          });
          const masked = blankPreservingLines(inner);
          emit(`${tag}${masked}${tag}`, `${tag}${masked}${tag}`);
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
  const tokens = sqlTokens(statements);
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex] as SqlToken;
    const absolute = baseOffset + token.start;
    if (isKeyword(token, "execute") && !context.resolvedExecutes.has(absolute)
        && !context.reportedExecutes.has(absolute)) {
      if (isKeyword(tokens[tokenIndex + 1], "function") || isKeyword(tokens[tokenIndex + 1], "procedure")
          || isKeyword(tokens[tokenIndex + 1], "on")) continue;
      context.reportedExecutes.add(absolute);
      const statementEnd = sql.indexOf(";", token.end);
      const statement = sql.slice(token.start, statementEnd < 0 ? sql.length : statementEnd).trim();
      context.dynamicHazards.push(
        `unmodelled: unresolved dynamic SQL at ${lineLocation(context.rootSql, absolute, context.sourceName)} — ${statement.slice(0, 200)}`,
      );
    }
  }
  return { withoutComments, statements };
}

function invokedIdentities(statements: string): readonly string[][] {
  const tokens = sqlTokens(statements);
  const invoked: string[][] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (!isKeyword(tokens[i], "select") && !isKeyword(tokens[i], "perform") && !isKeyword(tokens[i], "call")) continue;
    const parsed = qualifiedIdentifier(tokens, i + 1);
    if (parsed !== null && tokens[parsed.next]?.kind === "symbol" && tokens[parsed.next]?.value === "(") {
      invoked.push(parsed.identity);
    }
  }
  return invoked;
}

function sameFunction(definition: readonly string[], invocation: readonly string[]): boolean {
  if (definition.join(".") === invocation.join(".")) return true;
  return invocation.length === 1 && definition.at(-1) === invocation[0];
}

function replaceRange(text: string, start: number, replacement: string): string {
  return `${text.slice(0, start)}${replacement}${text.slice(start + replacement.length)}`;
}

/** `depth` is retained only for source compatibility with the old helper. Every
 * public call starts in executable SQL; recursive DO/function/EXECUTE bodies use
 * the same fail-closed scanner. */
export function lexSql(sql: string, depth = 0, sourceName = "sql-oracle.sql"): SqlViews {
  void depth;
  const context: LexContext = {
    rootSql: sql,
    sourceName,
    functions: [],
    resolvedExecutes: new Set(),
    reportedExecutes: new Set(),
    dynamicHazards: [],
  };
  let views = lexExecutable(sql, 0, context);
  let changed = true;
  while (changed) {
    changed = false;
    const invocations = invokedIdentities(views.statements);
    for (const definition of context.functions) {
      if (definition.exposed || !invocations.some((identity) => sameFunction(definition.identity, identity))) continue;
      const body = lexExecutable(definition.body, definition.bodyStart, context);
      views = {
        withoutComments: replaceRange(views.withoutComments, definition.bodyStart, body.withoutComments),
        statements: replaceRange(views.statements, definition.bodyStart, body.statements),
      };
      definition.exposed = true;
      changed = true;
    }
  }
  return { ...views, unresolvedDynamicSql: context.dynamicHazards };
}

/** Every statement-level definition offset for one Clara view. Optional
 * RECURSIVE belongs before VIEW in PostgreSQL's CREATE VIEW grammar. */
export function viewDefinitionOffsets(sql: string, view: string, sourceName = "sql-oracle.sql"): number[] {
  const views = lexSql(sql, 0, sourceName);
  const tokens = sqlTokens(views.statements);
  const offsets: number[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (!isKeyword(tokens[i], "create")) continue;
    let next = i + 1;
    if (isKeyword(tokens[next], "or") && isKeyword(tokens[next + 1], "replace")) next += 2;
    if (isKeyword(tokens[next], "recursive")) next += 1;
    if (!isKeyword(tokens[next], "view")) continue;
    const relation = qualifiedIdentifier(tokens, next + 1);
    if (relation === null || relation.identity.length !== 2) continue;
    if (relation.identity[0] === "clara" && relation.identity[1] === view.toLocaleLowerCase("en-US")) {
      offsets.push(tokens[i]?.start ?? -1);
    }
  }
  const unresolved = views.unresolvedDynamicSql[0];
  if (unresolved !== undefined) throw new Error(unresolved);
  return offsets;
}
