import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type SqlFunctionOperation = {
  readonly file: string;
  readonly kind: "define" | "drop";
  readonly offset: number;
  /** Exact rendered definition for a define; null for a drop. Dynamic EXECUTE
   * bodies carry the evaluated SQL, not the enclosing DO block. */
  readonly definition: string | null;
};

type OrderedSqlFunctionOperation = SqlFunctionOperation & {
  readonly blockOffset: number;
  readonly statementOffset: number;
  readonly renderedOffset: number;
};

const UNRESOLVED_SQL_VALUE = "__CLARA_SQL_CENSUS_UNRESOLVED__";
const PROVEN_OTHER_FUNCTION = "__CLARA_SQL_CENSUS_OTHER_FUNCTION__";

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let quote = false;
  let doubleQuote = false;
  let dollarTag: string | null = null;
  let lineComment = false;
  let blockComment = false;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (lineComment) {
      if (source[i] === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (source.startsWith("*/", i)) { blockComment = false; i += 1; }
      continue;
    }
    if (dollarTag !== null) {
      if (source.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    const char = source[i];
    if (char === "'") {
      if (quote && source[i + 1] === "'") i += 1;
      else quote = !quote;
      continue;
    }
    if (quote) continue;
    if (char === '"') {
      if (doubleQuote && source[i + 1] === '"') i += 1;
      else doubleQuote = !doubleQuote;
      continue;
    }
    if (doubleQuote) continue;
    if (source.startsWith("--", i)) { lineComment = true; i += 1; continue; }
    if (source.startsWith("/*", i)) { blockComment = true; i += 1; continue; }
    if (char === "$") {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(source.slice(i))?.[0];
      if (tag !== undefined) {
        dollarTag = tag;
        i += tag.length - 1;
        continue;
      }
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (depth === 0 && source.startsWith(separator, i)) {
      parts.push(source.slice(start, i));
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function splitTopLevelWithOffsets(source: string, separator: string): { text: string; start: number }[] {
  let cursor = 0;
  return splitTopLevel(source, separator).map((text) => {
    const part = { text, start: cursor };
    cursor += text.length + separator.length;
    return part;
  });
}

function sqlStatementFrom(source: string, start: number): string {
  let singleQuoted = false;
  let doubleQuoted = false;
  let dollarTag: string | null = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = start; i < source.length; i += 1) {
    if (lineComment) {
      if (source[i] === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (source.startsWith("*/", i)) { blockComment = false; i += 1; }
      continue;
    }
    if (dollarTag !== null) {
      if (source.startsWith(dollarTag, i)) { i += dollarTag.length - 1; dollarTag = null; }
      continue;
    }
    if (singleQuoted) {
      if (source[i] === "'" && source[i + 1] === "'") { i += 1; continue; }
      if (source[i] === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (source[i] === '"' && source[i + 1] === '"') { i += 1; continue; }
      if (source[i] === '"') doubleQuoted = false;
      continue;
    }
    if (source.startsWith("--", i)) { lineComment = true; i += 1; continue; }
    if (source.startsWith("/*", i)) { blockComment = true; i += 1; continue; }
    if (source[i] === "'") { singleQuoted = true; continue; }
    if (source[i] === '"') { doubleQuoted = true; continue; }
    if (source[i] === "$") {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(source.slice(i))?.[0];
      if (tag !== undefined) { dollarTag = tag; i += tag.length - 1; continue; }
    }
    if (source[i] === ";") return source.slice(start, i + 1);
  }
  if (!singleQuoted && !doubleQuoted && dollarTag === null && !blockComment) return source.slice(start).trim();
  throw new Error("sql_function_census_unterminated_statement");
}

function stripSqlComments(sql: string): string {
  let out = "";
  for (let i = 0; i < sql.length; ) {
    if (sql.startsWith("--", i)) {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      i += 2;
      while (i < sql.length && !sql.startsWith("*/", i)) {
        if (sql[i] === "\n") out += "\n";
        i += 1;
      }
      if (i < sql.length) i += 2;
      continue;
    }
    if (sql[i] === "'") {
      const escapeString = i > 0 && /[eE]/.test(sql[i - 1] as string) && !/[A-Za-z_0-9]/.test(sql[i - 2] ?? "");
      out += sql[i];
      i += 1;
      while (i < sql.length) {
        const character = sql[i] as string;
        out += character;
        i += 1;
        if (escapeString && character === "\\" && i < sql.length) {
          out += sql[i];
          i += 1;
          continue;
        }
        if (character !== "'") continue;
        if (sql[i] === "'") {
          out += sql[i];
          i += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (sql[i] === "$") {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];
      if (tag !== undefined) {
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end < 0 ? sql.length : end + tag.length;
        out += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

function evaluate(expression: string, variables: ReadonlyMap<string, string>): string | null {
  const expr = stripSqlComments(expression).trim().replace(/^\((.*)\)$/s, "$1");
  const concatenated = splitTopLevel(expr, "||");
  if (concatenated.length > 1) {
    const values = concatenated.map((part) => evaluate(part, variables));
    return values.every((value): value is string => value !== null) ? values.join("") : null;
  }
  const adjacentLiterals: string[] = [];
  let literalOffset = 0;
  while (literalOffset < expr.length) {
    literalOffset += /^\s*/.exec(expr.slice(literalOffset))?.[0].length ?? 0;
    const literal = /^(?:E'((?:''|\\.|[^'\\])*)'|'((?:''|[^'])*)')/i.exec(expr.slice(literalOffset));
    if (literal === null) break;
    let value = ((literal[1] ?? literal[2]) as string).replace(/''/g, "'");
    if (literal[1] !== undefined) {
      value = value.replace(/\\([\\'nrtbf])/g, (_match, escaped: string) => ({
        "\\": "\\",
        "'": "'",
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
      })[escaped] as string);
    }
    adjacentLiterals.push(value);
    literalOffset += (literal[0] as string).length;
  }
  literalOffset += /^\s*/.exec(expr.slice(literalOffset))?.[0].length ?? 0;
  if (adjacentLiterals.length > 0 && literalOffset === expr.length) return adjacentLiterals.join("");
  const dollar = /^\$([A-Za-z_0-9]*)\$([\s\S]*)\$\1\$$/.exec(expr);
  if (dollar !== null) return dollar[2] as string;
  if (/^\d+$/.test(expr)) return expr;
  if (/^[A-Za-z_]\w*$/.test(expr)) return variables.get(expr) ?? UNRESOLVED_SQL_VALUE;
  if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(expr)) return UNRESOLVED_SQL_VALUE;
  const chr = /^chr\s*\(\s*(\d+)\s*\)$/i.exec(expr);
  if (chr !== null) {
    const codePoint = Number(chr[1]);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : null;
  }

  const call = /^(format|replace)\s*\(([\s\S]*)\)$/i.exec(expr);
  if (!call) return /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\([\s\S]*\)$/.test(expr) ? UNRESOLVED_SQL_VALUE : null;
  const args = splitTopLevel(call[2] as string, ",").map((arg) => evaluate(arg, variables));
  if (call[1]?.toLowerCase() === "replace") {
    if (args.length !== 3) return null;
    if (args.some((arg) => arg === null)) return UNRESOLVED_SQL_VALUE;
    const values = args as string[];
    return values[0]!.split(values[1]!).join(values[2]!);
  }
  if (args[0] === null || args[0] === undefined) return null;
  const values = args.map((arg) => arg ?? UNRESOLVED_SQL_VALUE) as string[];
  let index = 1;
  return values[0]!.replace(/%%|%[sIL]/g, (token) => {
    if (token === "%%") return "%";
    const value = values[index++] ?? "";
    if (token === "%L") return `'${value.replace(/'/g, "''")}'`;
    return value;
  });
}

function functionTargetFromExpression(expression: string, targets: ReadonlyMap<string, string>): string | null {
  const expr = expression.trim().replace(/^\((.*)\)$/s, "$1");
  const directReads = new Set(
    [...expr.matchAll(/pg_get_functiondef\s*\(\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure\s*\)/gi)]
      .map((match) => match[1] as string),
  );
  if (directReads.size === 1) return [...directReads][0] as string;
  if (directReads.size > 1) return null;
  if (/^[A-Za-z_]\w*$/.test(expr)) return targets.get(expr) ?? null;
  if (/^[A-Za-z_]\w*\.[A-Za-z_]\w*$/.test(expr)) return targets.get(expr) ?? null;
  if (/^case\b[\s\S]*\bend$/i.test(expr)) {
    const found = new Set<string>();
    for (const match of expr.matchAll(/'clara\."?([A-Za-z_]\w*)"?\([^']*\)'/gi)) {
      found.add(match[1] as string);
    }
    for (const match of expr.matchAll(/\b[A-Za-z_]\w*\b/g)) {
      const target = targets.get(match[0]);
      if (target !== undefined) found.add(target);
    }
    return found.size === 1 ? [...found][0] as string : null;
  }
  const concatenated = splitTopLevel(expr, "||");
  if (concatenated.length > 1) {
    const found = new Set(concatenated.map((part) => functionTargetFromExpression(part, targets)).filter((v): v is string => v !== null));
    return found.size === 1 ? [...found][0] as string : null;
  }
  const sourceCall = /^pg_get_functiondef\s*\(\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*::\s*regprocedure\s*\)$/i.exec(expr);
  if (sourceCall !== null) return targets.get(sourceCall[1] as string) ?? null;
  const oidSourceCall = /^pg_get_functiondef\s*\(\s*([A-Za-z_]\w*)\s*\)$/i.exec(expr);
  if (oidSourceCall !== null) return targets.get(oidSourceCall[1] as string) ?? null;
  const literalOid = /^to_regprocedure\s*\(\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*\)$/i.exec(expr);
  if (literalOid !== null) return literalOid[1] as string;
  const call = /^(?:replace|regexp_replace|left|substr|substring|split_part|to_regprocedure)\s*\(([\s\S]*)\)$/i.exec(expr);
  if (call === null) return null;
  const first = splitTopLevel(call[1] as string, ",")[0];
  return first === undefined ? null : functionTargetFromExpression(first, targets);
}

function resolvedExpressionOptions(
  expression: string,
  resolvedValues: ReadonlyMap<string, string>,
  resolvedOptions: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const expr = expression.trim().replace(/^\((.*)\)$/s, "$1");
  const direct = resolvedOptions.get(expr);
  if (direct !== undefined) return [...direct];
  const splitPart = /^split_part\s*\(([\s\S]*)\)$/i.exec(expr);
  if (splitPart !== null) {
    const args = splitTopLevel(splitPart[1] as string, ",");
    if (args.length !== 3) return null;
    const sources = resolvedExpressionOptions(args[0] as string, resolvedValues, resolvedOptions);
    const delimiters = resolvedExpressionOptions(args[1] as string, resolvedValues, resolvedOptions);
    const positions = resolvedExpressionOptions(args[2] as string, resolvedValues, resolvedOptions);
    if (sources === null || delimiters?.length !== 1 || positions?.length !== 1) return null;
    const position = Number(positions[0]);
    if (!Number.isInteger(position) || position < 1) return null;
    return sources.map((source) => source.split(delimiters[0] as string)[position - 1] ?? "");
  }
  const concatenated = splitTopLevel(expr, "||");
  if (concatenated.length > 1) {
    let combinations = [""];
    for (const part of concatenated) {
      const values = resolvedExpressionOptions(part, resolvedValues, resolvedOptions);
      if (values === null || combinations.length * values.length > 128) return null;
      combinations = combinations.flatMap((prefix) => values.map((value) => prefix + value));
    }
    return combinations;
  }
  const value = evaluate(expr, resolvedValues);
  return value === null || value.includes(UNRESOLVED_SQL_VALUE) ? null : [value];
}

function caseResultTargets(
  expression: string,
  targets: ReadonlyMap<string, string>,
): string | null {
  const expr = stripSqlComments(expression).trim().replace(/^\((.*)\)$/s, "$1");
  if (!/^case\b[\s\S]*\bend$/i.test(expr)) return null;
  const resultVariables = [
    ...[...expr.matchAll(/\bthen\s+([A-Za-z_]\w*)\b/gi)].map((match) => match[1] as string),
    ...[...expr.matchAll(/\belse\s+([A-Za-z_]\w*)\s+end\s*$/gi)].map((match) => match[1] as string),
  ];
  if (resultVariables.length < 2) return null;
  const found = resultVariables.map((variable) => targets.get(variable) ?? null);
  if (found.some((target) => target === null)) return null;
  const unique = new Set(found as string[]);
  return unique.size === 1 ? [...unique][0] as string : null;
}

function safeBodyExpressionTarget(
  expression: string,
  safeBodyTargets: ReadonlyMap<string, string>,
  resolvedValues: ReadonlyMap<string, string>,
  resolvedOptions: ReadonlyMap<string, readonly string[]>,
): string | null {
  const expr = stripSqlComments(expression).trim().replace(/^\((.*)\)$/s, "$1");
  if (/^[A-Za-z_]\w*$/.test(expr)) return safeBodyTargets.get(expr) ?? null;
  const caseTarget = caseResultTargets(expr, safeBodyTargets);
  if (caseTarget !== null) return caseTarget;
  const replacement = /^replace\s*\(([\s\S]*)\)$/i.exec(expr);
  if (replacement === null) return null;
  const args = splitTopLevel(replacement[1] as string, ",");
  if (args.length !== 3) return null;
  const target = safeBodyExpressionTarget(args[0] as string, safeBodyTargets, resolvedValues, resolvedOptions);
  const oldTexts = resolvedExpressionOptions(args[1] as string, resolvedValues, resolvedOptions);
  const newTexts = resolvedExpressionOptions(args[2] as string, resolvedValues, resolvedOptions);
  return target !== null && oldTexts !== null && newTexts !== null && oldTexts.every((value) => value !== "")
    ? target
    : null;
}

/** A deliberately narrow proof that an unresolved expression is still exactly
 * one known function definition. Every transform operand must resolve. A
 * `replace` is trusted only when its search text cannot touch the function's
 * identity; opaque concatenands and identity-changing transforms fail closed. */
function targetPreservingDefinitionTarget(
  expression: string,
  safeTargets: ReadonlyMap<string, string>,
  safeSignatureTargets: ReadonlyMap<string, string>,
  safeBodyTargets: ReadonlyMap<string, string>,
  resolvedValues: ReadonlyMap<string, string>,
  resolvedOptions: ReadonlyMap<string, readonly string[]>,
): string | null {
  const expr = expression.trim().replace(/^\((.*)\)$/s, "$1");
  const directLiteral = /^pg_get_functiondef\s*\(\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure\s*\)$/i.exec(expr);
  if (directLiteral !== null) return directLiteral[1] as string;
  const signatureSource = /^pg_get_functiondef\s*\(\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*::\s*regprocedure\s*\)$/i.exec(expr);
  if (signatureSource !== null) {
    return safeSignatureTargets.get(signatureSource[1] as string) ??
      functionNameFromSignature(resolvedValues.get(signatureSource[1] as string) ?? "");
  }
  if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?$/.test(expr)) return safeTargets.get(expr) ?? null;
  const caseTarget = caseResultTargets(expr, safeTargets);
  if (caseTarget !== null) return caseTarget;

  const replaceCall = /^replace\s*\(([\s\S]*)\)$/i.exec(expr);
  if (replaceCall !== null) {
    const args = splitTopLevel(replaceCall[1] as string, ",");
    if (args.length !== 3) return null;
    const target = targetPreservingDefinitionTarget(args[0] as string, safeTargets, safeSignatureTargets, safeBodyTargets, resolvedValues, resolvedOptions);
    const oldTexts = resolvedExpressionOptions(args[1] as string, resolvedValues, resolvedOptions);
    const newTexts = resolvedExpressionOptions(args[2] as string, resolvedValues, resolvedOptions);
    const oldBodyTarget = /^[A-Za-z_]\w*$/.test((args[1] as string).trim())
      ? safeBodyTargets.get((args[1] as string).trim()) ?? null
      : null;
    const newBodyTarget = /^[A-Za-z_]\w*$/.test((args[2] as string).trim())
      ? safeBodyTargets.get((args[2] as string).trim()) ?? null
      : null;
    if (
      target !== null &&
      oldBodyTarget !== null &&
      newBodyTarget !== null
    ) return target;
    if (
      target === null ||
      oldTexts === null ||
      newTexts === null ||
      oldTexts.some((oldText) => oldText === "")
    ) return null;
    const identity = [
      target,
      `clara.${target}`,
      `function clara.${target}`,
      `function clara."${target}"`,
      `create function clara.${target}`,
      `create or replace function clara.${target}`,
    ];
    if (oldTexts.some((oldText) => identity.some((candidate) => candidate.toLowerCase().includes(oldText.toLowerCase())))) return null;
    if (newTexts.some((newText) => /\b(?:create\s+(?:or\s+replace\s+)?|drop\s+)function\s+clara\./i.test(newText))) return null;
    return target;
  }

  const formatCall = /^format\s*\(([\s\S]*)\)$/i.exec(expr);
  if (formatCall !== null) {
    const args = splitTopLevel(formatCall[1] as string, ",");
    const template = args[0] === undefined ? null : evaluate(args[0], resolvedValues);
    if (template === null || template.includes(UNRESOLVED_SQL_VALUE)) return null;
    let argumentIndex = 1;
    let target: string | null = null;
    const rendered = template.replace(/%%|%[sIL]/g, (token) => {
      if (token === "%%") return "%";
      const argument = args[argumentIndex++];
      if (argument === undefined) return UNRESOLVED_SQL_VALUE;
      const argumentTarget = targetPreservingDefinitionTarget(argument, safeTargets, safeSignatureTargets, safeBodyTargets, resolvedValues, resolvedOptions);
      if (argumentTarget !== null) {
        if (token !== "%s" || (target !== null && target !== argumentTarget)) return UNRESOLVED_SQL_VALUE;
        target = argumentTarget;
        return "__CLARA_SAFE_DEFINITION__";
      }
      const value = evaluate(argument, resolvedValues);
      if (value === null || value.includes(UNRESOLVED_SQL_VALUE)) return UNRESOLVED_SQL_VALUE;
      if (token === "%L") return `'${value.replace(/'/g, "''")}'`;
      return value;
    });
    return target !== null && rendered.replace("__CLARA_SAFE_DEFINITION__", "").trim() === ""
      ? target
      : null;
  }

  const concatenated = splitTopLevel(expr, "||");
  if (concatenated.length === 1) return null;
  const found = new Set<string>();
  for (const part of concatenated) {
    const target = targetPreservingDefinitionTarget(part, safeTargets, safeSignatureTargets, safeBodyTargets, resolvedValues, resolvedOptions);
    if (target !== null) {
      found.add(target);
      continue;
    }
    const literal = evaluate(part, resolvedValues);
    if (literal === null || literal.includes(UNRESOLVED_SQL_VALUE) || literal.trim() !== "") return null;
  }
  return found.size === 1 ? [...found][0] as string : null;
}

function functionNameFromSignature(value: string): string | null {
  return /^clara\."?([A-Za-z_]\w*)"?\s*\(/.exec(value)?.[1] ?? null;
}

function maskQuotedAndCommented(sql: string): string {
  let out = "";
  for (let i = 0; i < sql.length; ) {
    if (sql.startsWith("--", i)) {
      while (i < sql.length && sql[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (sql.startsWith("/*", i)) {
      out += "  "; i += 2;
      while (i < sql.length && !sql.startsWith("*/", i)) { out += sql[i] === "\n" ? "\n" : " "; i += 1; }
      if (i < sql.length) { out += "  "; i += 2; }
      continue;
    }
    if (sql[i] === "'") {
      out += " "; i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { out += "  "; i += 2; continue; }
        const end = sql[i] === "'";
        out += sql[i] === "\n" ? "\n" : " "; i += 1;
        if (end) break;
      }
      continue;
    }
    if (sql[i] === "$") {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];
      if (tag !== undefined) {
        out += " ".repeat(tag.length); i += tag.length;
        const end = sql.indexOf(tag, i);
        const stop = end < 0 ? sql.length : end + tag.length;
        while (i < stop) { out += sql[i] === "\n" ? "\n" : " "; i += 1; }
        continue;
      }
    }
    out += sql[i]; i += 1;
  }
  return out;
}

function operationsInSql(
  sql: string,
  fn: string,
  file: string,
  sourceOrder?: { readonly blockOffset: number; readonly statementOffset: number },
): OrderedSqlFunctionOperation[] {
  const escaped = fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b(create\\s+(?:or\\s+replace\\s+)?function|drop\\s+function(?:\\s+if\\s+exists)?)\\s+clara\\.\"?${escaped}\"?\\s*\\(`,
    "gi",
  );
  return [...maskQuotedAndCommented(sql).matchAll(pattern)].map((match) => {
    const kind = /^drop/i.test(match[1] as string) ? "drop" : "define";
    const localOffset = match.index ?? 0;
    return {
      file,
      kind,
      offset: sourceOrder === undefined
        ? localOffset
        : sourceOrder.blockOffset + sourceOrder.statementOffset,
      definition: kind === "define" ? sqlStatementFrom(sql, localOffset) : null,
      blockOffset: sourceOrder?.blockOffset ?? localOffset,
      statementOffset: sourceOrder?.statementOffset ?? 0,
      renderedOffset: sourceOrder === undefined ? 0 : localOffset,
    };
  });
}

type DoBlock = { readonly body: string; readonly index: number; readonly bodyOffset: number };

/** Discover top-level DO blocks from source bytes. Comments and quoted strings
 * are skipped lexically, so a commented-out or string-literal `DO` is not an
 * operation. The returned offsets remain positions in the original SQL. */
function doBlocks(sql: string): DoBlock[] {
  const blocks: DoBlock[] = [];
  for (let i = 0; i < sql.length; ) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) throw new Error("sql_function_census_unterminated_comment");
      i = end + 2;
      continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i] as string;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) { i += 2; continue; }
        if (sql[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }

    const word = /^[A-Za-z_]\w*/.exec(sql.slice(i))?.[0];
    if (word !== undefined) {
      const blockIndex = i;
      i += word.length;
      if (word.toLowerCase() !== "do") continue;
      let cursor = i;
      while (/\s/.test(sql[cursor] ?? "")) cursor += 1;
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(cursor))?.[0];
      if (tag === undefined) continue;
      const bodyOffset = cursor + tag.length;
      const end = sql.indexOf(tag, bodyOffset);
      if (end < 0) throw new Error("sql_function_census_unterminated_do_block");
      blocks.push({ body: sql.slice(bodyOffset, end), index: blockIndex, bodyOffset });
      i = end + tag.length;
      continue;
    }

    if (sql[i] === "$") {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];
      if (tag !== undefined) {
        const end = sql.indexOf(tag, i + tag.length);
        if (end < 0) throw new Error("sql_function_census_unterminated_dollar_quote");
        i = end + tag.length;
        continue;
      }
    }
    i += 1;
  }
  return blocks;
}

function dynamicOperations(sql: string, fn: string, file: string): OrderedSqlFunctionOperation[] {
  const found: OrderedSqlFunctionOperation[] = [];
  const provenCoreDerivers = new Set<string>();
  const provenDefinitionTransformers = new Map<string, { readonly oldTexts: readonly string[]; readonly newTexts: readonly string[] }>();
  const literalTempTables = new Map<string, ReadonlyMap<string, string>>();
  for (const tableDeclaration of sql.matchAll(/create\s+temp(?:orary)?\s+table\s+([A-Za-z_]\w*)\s*\(/gi)) {
    const tableName = tableDeclaration[1] as string;
    const escapedTable = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const insertPattern = new RegExp(`insert\\s+into\\s+${escapedTable}\\s*\\(([^)]*)\\)\\s+values\\s*`, "gi");
    const inserts = [...sql.matchAll(insertPattern)];
    if (
      inserts.length !== 1 ||
      new RegExp(`\\b(?:update|delete\\s+from)\\s+${escapedTable}\\b`, "i").test(maskQuotedAndCommented(sql))
    ) continue;
    const insert = inserts[0] as RegExpMatchArray;
    const columns = splitTopLevel(insert[1] as string, ",").map((column) => column.trim().toLowerCase());
    const valuesStatement = sqlStatementFrom(sql, (insert.index ?? 0) + insert[0].length).replace(/;\s*$/, "").trim();
    const fields = /^\(([\s\S]*)\)$/.exec(valuesStatement)?.[1];
    const values = fields === undefined
      ? []
      : splitTopLevel(fields, ",").map((field) => evaluate(field, new Map()));
    if (columns.length !== values.length || !values.every((value): value is string => value !== null && !value.includes(UNRESOLVED_SQL_VALUE))) continue;
    literalTempTables.set(tableName.toLowerCase(), new Map(columns.map((column, index) => [column, values[index] as string])));
  }
  for (const helper of sql.matchAll(
    /create(?:\s+or\s+replace)?\s+function\s+pg_temp\.([A-Za-z_]\w*)\s*\(([^)]*)\)\s*returns\s+text\b[\s\S]*?\bas\s+\$([A-Za-z_0-9]*)\$([\s\S]*?)\$\3\$\s*;/gi,
  )) {
    if (/\bp_core_name\s+text\b/i.test(helper[2] as string) &&
        /return\s+format\s*\(\s*'create function clara\.%I[\s\S]*?\bp_core_name\b/i.test(helper[4] as string)) {
      provenCoreDerivers.add(`pg_temp.${helper[1] as string}`.toLowerCase());
    }
    const firstParameter = /^\s*([A-Za-z_]\w*)\s+text\b/i.exec(helper[2] as string)?.[1];
    const deltaRead = /select\s+([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s+into\s+([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s+from\s+([A-Za-z_]\w*)/i.exec(helper[4] as string);
    if (
      firstParameter !== undefined &&
      deltaRead !== null &&
      new RegExp(`return\\s+replace\\s*\\(\\s*${firstParameter}\\s*,\\s*${deltaRead[3]}\\s*,\\s*${deltaRead[4]}\\s*\\)`, "i").test(helper[4] as string)
    ) {
      const table = (deltaRead[5] as string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const insert = new RegExp(`insert\\s+into\\s+${table}\\s*\\(\\s*${deltaRead[1]}\\s*,\\s*${deltaRead[2]}\\s*\\)\\s+values\\s*`, "i").exec(sql);
      if (insert !== null) {
        const valuesStatement = sqlStatementFrom(sql, (insert.index ?? 0) + insert[0].length).replace(/;\s*$/, "").trim();
        const fields = /^\(([\s\S]*)\)$/.exec(valuesStatement)?.[1];
        const values = fields === undefined
          ? []
          : splitTopLevel(fields, ",").map((field) => evaluate(field, new Map()));
        if (values.length === 2 && values.every((value): value is string => value !== null && !value.includes(UNRESOLVED_SQL_VALUE))) {
          provenDefinitionTransformers.set(`pg_temp.${helper[1] as string}`.toLowerCase(), {
            oldTexts: [values[0] as string],
            newTexts: [values[1] as string],
          });
        }
      }
    }
  }
  const hasProvenCm1DefinitionStore =
    /select\b[\s\S]*?pg_get_functiondef\s*\(\s*[A-Za-z_]\w*\.oid\s*\)[\s\S]*?where\s+[A-Za-z_]\w*\.oid\s*=\s*r\.sig\s*::\s*regprocedure/i.test(sql) &&
    /insert\s+into\s+_cm1_pre\s*\(\s*k\s*,\s*v\s*\)\s*values\s*\(\s*'def:'\s*\|\|\s*r\.sig\s*,\s*v_def\s*\)/i.test(sql) &&
    !/\b(?:update|delete\s+from)\s+_cm1_pre\b/i.test(maskQuotedAndCommented(sql));
  let fa9bAnchorTarget: string | null = null;
  let fa9bReplacementProof = false;
  const fa9bInsert = /insert\s+into\s+fa9b_anchors\s*\(\s*id\s*,\s*target\s*,\s*old\s*,\s*new\s*\)\s*values\b/i.exec(sql);
  if (fa9bInsert !== null) {
    const statement = sqlStatementFrom(sql, (fa9bInsert.index ?? 0) + fa9bInsert[0].length).replace(/;\s*$/, "");
    const names: string[] = [];
    let complete = true;
    let replacementsPreserveIdentity = true;
    for (let tuple of splitTopLevel(statement, ",")) {
      tuple = tuple.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "").trim();
      const fields = /^\(([\s\S]*)\)$/.exec(tuple)?.[1];
      const cells = fields === undefined ? [] : splitTopLevel(fields, ",");
      const target = evaluate(cells[1] ?? "", new Map());
      const name = target === null ? null : functionNameFromSignature(target);
      if (name === null) { complete = false; break; }
      names.push(name);
      const oldText = evaluate(cells[2] ?? "", new Map());
      const newText = evaluate(cells[3] ?? "", new Map());
      const identity = [name, `clara.${name}`, `function clara.${name}`, `create function clara.${name}`, `create or replace function clara.${name}`];
      if (
        oldText === null || oldText === "" || oldText.includes(UNRESOLVED_SQL_VALUE) ||
        newText === null || newText.includes(UNRESOLVED_SQL_VALUE) ||
        identity.some((candidate) => candidate.toLowerCase().includes(oldText.toLowerCase())) ||
        /\b(?:create\s+(?:or\s+replace\s+)?|drop\s+)function\s+clara\./i.test(newText)
      ) replacementsPreserveIdentity = false;
    }
    if (complete && names.length > 0) {
      const unique = new Set(names);
      fa9bAnchorTarget = unique.has(fn) ? (unique.size === 1 ? fn : null) : PROVEN_OTHER_FUNCTION;
      fa9bReplacementProof = replacementsPreserveIdentity;
    }
  }
  for (const block of doBlocks(sql)) {
    const body = block.body;
    const variables = new Map<string, string>();
    const targets = new Map<string, string>();
    const safeTargets = new Map<string, string>();
    const safeBodyTargets = new Map<string, string>();
    const safeHeaderTargets = new Map<string, string>();
    const safeSignatureTargets = new Map<string, string>();
    const safeOidTargets = new Map<string, string>();
    const safeCatalogText = new Set<string>();
    const provenDerivedTargets = new Map<string, string>();
    const resolvedOptions = new Map<string, readonly string[]>();
    for (const part of splitTopLevelWithOffsets(body, ";")) {
      const rawStatement = part.text;
      let statement = rawStatement;
      statement = statement.trim().replace(/^declare\s+/i, "").replace(/^begin\s+/i, "");
      while (/^(?:--|\/\*)/.test(statement.trimStart())) {
        statement = statement.trimStart();
        if (statement.startsWith("--")) statement = statement.replace(/^--[^\n]*(?:\n|$)/, "");
        else statement = statement.replace(/^\/\*[\s\S]*?\*\//, "");
      }
      statement = statement.trim();
      const foreach = /^foreach\s+([A-Za-z_]\w*)\s+in\s+array\s+([A-Za-z_]\w*)\s+loop\b/i.exec(statement);
      if (foreach !== null) {
        const target = targets.get(foreach[2] as string);
        if (target === undefined) targets.delete(foreach[1] as string);
        else targets.set(foreach[1] as string, target);
        const safeTarget = safeTargets.get(foreach[2] as string);
        if (safeTarget === undefined) safeTargets.delete(foreach[1] as string);
        else safeTargets.set(foreach[1] as string, safeTarget);
        const signatureTarget = safeSignatureTargets.get(foreach[2] as string);
        if (signatureTarget === undefined) safeSignatureTargets.delete(foreach[1] as string);
        else safeSignatureTargets.set(foreach[1] as string, signatureTarget);
        const options = resolvedOptions.get(foreach[2] as string);
        if (options === undefined) resolvedOptions.delete(foreach[1] as string);
        else resolvedOptions.set(foreach[1] as string, options);
        statement = statement.slice(foreach[0].length).trim();
        while (/^(?:--|\/\*)/.test(statement)) {
          if (statement.startsWith("--")) statement = statement.replace(/^--[^\n]*(?:\n|$)/, "").trimStart();
          else statement = statement.replace(/^\/\*[\s\S]*?\*\//, "").trimStart();
        }
        if (statement === "") continue;
      }
      const valuesLoop = /^for\s+([A-Za-z_]\w*)\s+in\s+select\s+\*\s+from\s+\(values\s+([\s\S]*?)\)\s+as\s+[A-Za-z_]\w*\s*\(([^)]*)\)\s+loop\b/i.exec(statement);
      if (valuesLoop !== null) {
        const rowVariable = valuesLoop[1] as string;
        const columns = splitTopLevel(valuesLoop[3] as string, ",").map((column) => column.trim());
        const tuples = splitTopLevel(valuesLoop[2] as string, ",").map((tuple) =>
          splitTopLevel(/^\(([\s\S]*)\)$/.exec(tuple.trim())?.[1] ?? "", ","));
        for (const [columnIndex, column] of columns.entries()) {
          const values = tuples.map((tuple) => {
            const cell = tuple[columnIndex];
            return cell === undefined ? null : evaluate(cell, variables);
          });
          const key = `${rowVariable}.${column}`;
          if (values.length > 0 && values.every((value): value is string => value !== null && !value.includes(UNRESOLVED_SQL_VALUE))) {
            resolvedOptions.set(key, values);
          } else {
            resolvedOptions.delete(key);
          }
        }
        statement = statement.slice(valuesLoop[0].length).trim();
        while (/^(?:--|\/\*)/.test(statement)) {
          if (statement.startsWith("--")) statement = statement.replace(/^--[^\n]*(?:\n|$)/, "").trimStart();
          else statement = statement.replace(/^\/\*[\s\S]*?\*\//, "").trimStart();
        }
        if (statement === "") continue;
      }
      const literalTableRead = /^select\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+into\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+from\s+([A-Za-z_]\w*)$/i.exec(statement);
      const literalTable = literalTableRead === null
        ? undefined
        : literalTempTables.get((literalTableRead[3] as string).toLowerCase());
      if (literalTableRead !== null && literalTable !== undefined) {
        const columns = (literalTableRead[1] as string).split(",").map((column) => column.trim().toLowerCase());
        const outputs = (literalTableRead[2] as string).split(",").map((output) => output.trim());
        const values = columns.map((column) => literalTable.get(column));
        if (columns.length === outputs.length && values.every((value): value is string => value !== undefined)) {
          for (const [index, output] of outputs.entries()) {
            const value = values[index] as string;
            variables.set(output, value);
            resolvedOptions.set(output, [value]);
            targets.delete(output);
            safeTargets.delete(output);
            safeBodyTargets.delete(output);
            safeSignatureTargets.delete(output);
            safeOidTargets.delete(output);
          }
          continue;
        }
      }
      const fa9bLoop = /^for\s+([A-Za-z_]\w*)\s+in\s+select\b[\s\S]*?\btarget\b[\s\S]*?\bfrom\s+fa9b_anchors\b[\s\S]*?\bloop\b/i.exec(statement);
      if (fa9bLoop !== null && fa9bAnchorTarget !== null) {
        targets.set(`${fa9bLoop[1] as string}.target`, fa9bAnchorTarget);
        safeSignatureTargets.set(`${fa9bLoop[1] as string}.target`, fa9bAnchorTarget);
        statement = statement.slice(fa9bLoop[0].length).trim();
        if (statement === "") continue;
      }
      const bodyAndArgsRead = /^select\s+[A-Za-z_]\w*\.prosrc\s*,\s*\(select\s+string_agg\([\s\S]*?\)\s*from\s+unnest\([A-Za-z_]\w*\.proargnames\)[\s\S]*?\)\s+into\s+([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s+from\s+(?:pg_catalog\.)?pg_proc\s+[A-Za-z_]\w*\s+where\s+[A-Za-z_]\w*\.oid\s*=\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure$/i.exec(statement);
      if (bodyAndArgsRead !== null) {
        const bodyOutput = bodyAndArgsRead[1] as string;
        const argsOutput = bodyAndArgsRead[2] as string;
        const target = bodyAndArgsRead[3] as string;
        variables.set(bodyOutput, UNRESOLVED_SQL_VALUE);
        safeBodyTargets.set(bodyOutput, target);
        targets.delete(bodyOutput);
        safeTargets.delete(bodyOutput);
        variables.set(argsOutput, UNRESOLVED_SQL_VALUE);
        safeCatalogText.add(argsOutput);
        targets.delete(argsOutput);
        safeTargets.delete(argsOutput);
        continue;
      }
      const mixedCatalogRead = /^select\s+[A-Za-z_]\w*\.prosrc\s*,\s*pg_get_functiondef\s*\(\s*[A-Za-z_]\w*\.oid\s*\)\s+into\s+([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s+from\s+(?:pg_catalog\.)?pg_proc\s+[A-Za-z_]\w*\s+where\s+[A-Za-z_]\w*\.oid\s*=\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure$/i.exec(statement);
      if (mixedCatalogRead !== null) {
        const bodyOutput = mixedCatalogRead[1] as string;
        const definitionOutput = mixedCatalogRead[2] as string;
        const target = mixedCatalogRead[3] as string;
        variables.set(bodyOutput, UNRESOLVED_SQL_VALUE);
        targets.delete(bodyOutput);
        safeTargets.delete(bodyOutput);
        safeBodyTargets.set(bodyOutput, target);
        variables.set(definitionOutput, UNRESOLVED_SQL_VALUE);
        targets.set(definitionOutput, target);
        safeTargets.set(definitionOutput, target);
        safeBodyTargets.delete(definitionOutput);
        continue;
      }
      const catalogSourceTarget = /\bpg_get_functiondef\b/i.test(statement)
        ? /'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure/i.exec(statement)?.[1] ?? null
        : null;
      const catalogSourceOutputs = /\binto\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?:from\b|$)/i.exec(statement)?.[1]
        ?.split(",").map((value) => value.trim()) ?? [];
      if (catalogSourceTarget !== null && catalogSourceOutputs.length > 0) {
        for (const variable of catalogSourceOutputs) {
          variables.set(variable, UNRESOLVED_SQL_VALUE);
          targets.set(variable, catalogSourceTarget);
          safeTargets.set(variable, catalogSourceTarget);
        }
        continue;
      }
      const catalogSignatureVariable = /\bwhere\b[\s\S]*?\b[A-Za-z_]\w*\.oid\s*=\s*([A-Za-z_]\w*)\s*::\s*regprocedure\b/i.exec(statement)?.[1];
      const catalogVariableTarget = catalogSignatureVariable === undefined
        ? null
        : targets.get(catalogSignatureVariable) ?? functionNameFromSignature(variables.get(catalogSignatureVariable) ?? "");
      if (/\bpg_get_functiondef\b/i.test(statement) && catalogVariableTarget !== null && catalogSourceOutputs.length > 0) {
        for (const variable of catalogSourceOutputs) {
          variables.set(variable, UNRESOLVED_SQL_VALUE);
          targets.set(variable, catalogVariableTarget);
          safeTargets.set(variable, catalogVariableTarget);
        }
        continue;
      }
      const catalogBodyRead = /^select\s+[A-Za-z_]\w*\.prosrc\s+into\s+([A-Za-z_]\w*)\s+from\s+(?:pg_catalog\.)?pg_proc\s+[A-Za-z_]\w*\s+where\s+[A-Za-z_]\w*\.oid\s*=\s*([A-Za-z_]\w*|'clara\."?[A-Za-z_]\w*"?\([^']*\)')\s*::\s*regprocedure$/i.exec(statement);
      if (catalogBodyRead !== null) {
        const outputVariable = catalogBodyRead[1] as string;
        const signatureExpression = catalogBodyRead[2] as string;
        const literalSignature = evaluate(signatureExpression, variables);
        const target = targets.get(signatureExpression) ??
          (literalSignature === null ? null : functionNameFromSignature(literalSignature));
        variables.set(outputVariable, UNRESOLVED_SQL_VALUE);
        targets.delete(outputVariable);
        safeTargets.delete(outputVariable);
        if (target === null) safeBodyTargets.delete(outputVariable);
        else safeBodyTargets.set(outputVariable, target);
        continue;
      }
      const oidCatalogBodyRead = /^select\s+[A-Za-z_]\w*\.prosrc\s+into\s+([A-Za-z_]\w*)\s+from\s+(?:pg_catalog\.)?pg_proc\s+(?:as\s+)?[A-Za-z_]\w*\s+where\s+[A-Za-z_]\w*\.oid\s*=\s*([A-Za-z_]\w*)$/i.exec(statement);
      if (oidCatalogBodyRead !== null) {
        const outputVariable = oidCatalogBodyRead[1] as string;
        const target = safeOidTargets.get(oidCatalogBodyRead[2] as string) ?? null;
        variables.set(outputVariable, UNRESOLVED_SQL_VALUE);
        targets.delete(outputVariable);
        safeTargets.delete(outputVariable);
        if (target === null) safeBodyTargets.delete(outputVariable);
        else safeBodyTargets.set(outputVariable, target);
        continue;
      }
      const sourceRead = /^select\s+pg_get_functiondef\s*\(\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure\s*\)\s+into\s+([A-Za-z_]\w*)$/i.exec(statement);
      if (sourceRead !== null) {
        const variable = sourceRead[2] as string;
        variables.set(variable, UNRESOLVED_SQL_VALUE);
        targets.set(variable, sourceRead[1] as string);
        safeTargets.set(variable, sourceRead[1] as string);
        continue;
      }
      const oidLiteralSourceRead = /^select\s+pg_get_functiondef\s*\(\s*[A-Za-z_]\w*\.oid\s*\)\s+into\s+([A-Za-z_]\w*)\s+from\s+(?:pg_catalog\.)?pg_proc\s+[A-Za-z_]\w*\s+where\s+[A-Za-z_]\w*\.oid\s*=\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure$/i.exec(statement);
      if (oidLiteralSourceRead !== null) {
        const variable = oidLiteralSourceRead[1] as string;
        variables.set(variable, UNRESOLVED_SQL_VALUE);
        targets.set(variable, oidLiteralSourceRead[2] as string);
        safeTargets.set(variable, oidLiteralSourceRead[2] as string);
        continue;
      }
      const directVariableSourceRead = /^select\s+pg_get_functiondef\s*\(\s*([A-Za-z_]\w*)\s*::\s*regprocedure\s*\)\s+into\s+([A-Za-z_]\w*)$/i.exec(statement);
      const oidVariableSourceRead = /^select\s+pg_get_functiondef\s*\(\s*[A-Za-z_]\w*\.oid\s*\)\s+into\s+([A-Za-z_]\w*)\s+from\s+pg_proc\s+[A-Za-z_]\w*\s+where\s+[A-Za-z_]\w*\.oid\s*=\s*([A-Za-z_]\w*)\s*::\s*regprocedure$/i.exec(statement);
      if (directVariableSourceRead !== null || oidVariableSourceRead !== null) {
        const signatureVariable = (directVariableSourceRead?.[1] ?? oidVariableSourceRead?.[2]) as string;
        const outputVariable = (directVariableSourceRead?.[2] ?? oidVariableSourceRead?.[1]) as string;
        const target = targets.get(signatureVariable) ?? functionNameFromSignature(variables.get(signatureVariable) ?? "");
        if (target !== null) {
          variables.set(outputVariable, UNRESOLVED_SQL_VALUE);
          targets.set(outputVariable, target);
          safeTargets.set(outputVariable, target);
          continue;
        }
      }
      const assignment = /^(?:([A-Za-z_]\w*)\s+(?:text(?:\[\])?|name)\s*:=|([A-Za-z_]\w*)\s*:=)\s*([\s\S]+)$/i.exec(statement);
      if (assignment) {
        const variable = (assignment[1] ?? assignment[2]) as string;
        const expression = assignment[3] as string;
        const safeBodyTarget = safeBodyExpressionTarget(expression, safeBodyTargets, variables, resolvedOptions);
        const fa9bReplacement = /^replace\s*\(\s*([A-Za-z_]\w*)\s*,\s*s\.old\s*,\s*s\.new\s*\)$/i.exec(expression);
        const fa9bReplacementTarget = fa9bReplacementProof && fa9bReplacement !== null
          ? safeTargets.get(fa9bReplacement[1] as string) ?? null
          : null;
        const headerSlice = /^left\s*\(\s*([A-Za-z_]\w*)\s*,\s*position\s*\(([\s\S]*)\s+in\s+\1\s*\)\s*\)$/i.exec(expression);
        let safeHeaderTarget: string | null = null;
        if (headerSlice !== null) {
          const source = headerSlice[1] as string;
          const markers = resolvedExpressionOptions(headerSlice[2] as string, variables, resolvedOptions);
          if (
            markers !== null &&
            markers.every((marker) => /^\s*\n?as\s+\$[A-Za-z_0-9]*\$$/i.test(marker))
          ) safeHeaderTarget = provenDerivedTargets.get(source) ?? safeTargets.get(source) ?? null;
        } else if (/^[A-Za-z_]\w*$/.test(expression.trim())) {
          safeHeaderTarget = safeHeaderTargets.get(expression.trim()) ?? null;
        }
        let expressionOptions = resolvedExpressionOptions(expression, variables, resolvedOptions);
        const value = evaluate(expression, variables);
        if (value !== null) variables.set(variable, value);
        const derivation = /^(pg_temp\.[A-Za-z_]\w*)\s*\(\s*'(?:[^']|'')*'\s*,\s*'([A-Za-z_]\w*)'/i.exec(expression);
        const extractedCore = derivation !== null && provenCoreDerivers.has((derivation[1] as string).toLowerCase())
          ? derivation[2] as string
          : null;
        const storedDefinition = hasProvenCm1DefinitionStore
          ? /select\s+v\s+from\s+_cm1_pre\s+where\s+k\s*=\s*'def:clara\."?([A-Za-z_]\w*)"?\([^']*\)'/i.exec(expression)?.[1] ?? null
          : null;
        const signatureArray = /^array\s*\[([\s\S]*)\]$/i.exec(expression);
        let enumeratedTarget: string | null = null;
        if (signatureArray !== null) {
          const signatureValues = splitTopLevel(signatureArray[1] as string, ",").map((part) => evaluate(part, variables));
          if (signatureValues.every((item): item is string => item !== null && !item.includes(UNRESOLVED_SQL_VALUE))) {
            expressionOptions = signatureValues;
          }
          const names = signatureValues.map((item) => {
            return item === null ? null : functionNameFromSignature(item);
          });
          if (names.length > 0 && names.every((name): name is string => name !== null)) {
            const unique = new Set(names);
            enumeratedTarget = unique.has(fn)
              ? (unique.size === 1 ? fn : null)
              : PROVEN_OTHER_FUNCTION;
          }
        }
        const oidSource = /^to_regprocedure\s*\(\s*([A-Za-z_]\w*)\s*\)$/i.exec(expression);
        const literalOidSource = /^to_regprocedure\s*\(\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*\)$/i.exec(expression);
        const safeOidTarget = literalOidSource?.[1] ?? (oidSource === null
          ? null
          : safeSignatureTargets.get(oidSource[1] as string) ?? null);
        const definitionOidSource = /^pg_get_functiondef\s*\(\s*([A-Za-z_]\w*)\s*\)$/i.exec(expression);
        const safeOidDefinitionTarget = definitionOidSource === null
          ? null
          : safeOidTargets.get(definitionOidSource[1] as string) ?? null;
        const target = functionTargetFromExpression(expression, targets) ??
          extractedCore ??
          storedDefinition ??
          enumeratedTarget ??
          safeOidTarget ??
            safeOidDefinitionTarget ??
          (value === null ? null : functionNameFromSignature(value));
        const optionNames = expressionOptions?.map(functionNameFromSignature) ?? null;
        let safeSignatureTarget: string | null = null;
        if (optionNames !== null && optionNames.length > 0 && optionNames.every((name): name is string => name !== null)) {
          const uniqueOptionNames = new Set(optionNames);
          safeSignatureTarget = uniqueOptionNames.size === 1
            ? [...uniqueOptionNames][0] as string
            : uniqueOptionNames.has(fn) ? null : PROVEN_OTHER_FUNCTION;
        }
        let provenDefinitionTarget: string | null = null;
        if (target === null) {
          targets.delete(variable);
          safeTargets.delete(variable);
        } else {
          targets.set(variable, target);
          const safeTarget = targetPreservingDefinitionTarget(expression, safeTargets, safeSignatureTargets, safeBodyTargets, variables, resolvedOptions) ??
            extractedCore ??
            storedDefinition ??
            safeOidDefinitionTarget ??
            fa9bReplacementTarget;
          if (safeTarget === target) {
            safeTargets.set(variable, target);
            provenDefinitionTarget = target;
          } else safeTargets.delete(variable);
        }
        if (safeBodyTarget === null) safeBodyTargets.delete(variable);
        else safeBodyTargets.set(variable, safeBodyTarget);
        if (safeSignatureTarget === null) safeSignatureTargets.delete(variable);
        else safeSignatureTargets.set(variable, safeSignatureTarget);
        if (safeOidTarget === null) safeOidTargets.delete(variable);
        else safeOidTargets.set(variable, safeOidTarget);
        if (safeHeaderTarget === null) safeHeaderTargets.delete(variable);
        else safeHeaderTargets.set(variable, safeHeaderTarget);
        if (!/^[A-Za-z_]\w*$/.test(expression.trim()) || !safeCatalogText.has(expression.trim())) safeCatalogText.delete(variable);
        else safeCatalogText.add(variable);
        if (provenDefinitionTarget === null) provenDerivedTargets.delete(variable);
        else provenDerivedTargets.set(variable, provenDefinitionTarget);
        if (expressionOptions === null) resolvedOptions.delete(variable);
        else resolvedOptions.set(variable, expressionOptions);
        continue;
      }
      const execution = /^execute\s+([\s\S]+)$/i.exec(statement);
      if (!execution) continue;
      const expression = execution[1] as string;
      const rendered = evaluate(expression, variables);
      let exactSourceTarget = targetPreservingDefinitionTarget(expression, safeTargets, safeSignatureTargets, safeBodyTargets, variables, resolvedOptions);
      if (exactSourceTarget === null && /^[A-Za-z_]\w*$/.test(expression.trim())) {
        exactSourceTarget = provenDerivedTargets.get(expression.trim()) ?? null;
      }
      const helperCall = /^(pg_temp\.[A-Za-z_]\w*)\s*\(([\s\S]*)\)$/i.exec(expression.trim());
      const helperProof = helperCall === null
        ? undefined
        : provenDefinitionTransformers.get((helperCall[1] as string).toLowerCase());
      if (exactSourceTarget === null && helperCall !== null && helperProof !== undefined) {
        const args = splitTopLevel(helperCall[2] as string, ",");
        const target = args[0] === undefined
          ? null
          : targetPreservingDefinitionTarget(args[0], safeTargets, safeSignatureTargets, safeBodyTargets, variables, resolvedOptions);
        const trailingArgsResolved = args.slice(1).every((arg) => resolvedExpressionOptions(arg, variables, resolvedOptions) !== null);
        const identity = target === null ? [] : [
          target,
          `clara.${target}`,
          `function clara.${target}`,
          `function clara."${target}"`,
          `create function clara.${target}`,
          `create or replace function clara.${target}`,
        ];
        const identityUntouched = helperProof.oldTexts.every((oldText) =>
          oldText !== "" && !identity.some((candidate) => candidate.toLowerCase().includes(oldText.toLowerCase())));
        const noNestedDdl = helperProof.newTexts.every((newText) =>
          !/\b(?:create\s+(?:or\s+replace\s+)?|drop\s+)function\s+clara\./i.test(newText));
        if (target !== null && trailingArgsResolved && identityUntouched && noNestedDdl) exactSourceTarget = target;
      }
      if (exactSourceTarget === null) {
        const parts = splitTopLevel(expression, "||");
        const rename = parts.length > 2 ? /^replace\s*\(([\s\S]*)\)$/i.exec((parts[0] as string).trim()) : null;
        if (rename === null) {
          // This proof applies only to an explicit header rename followed by a
          // dollar-delimited body. Other concatenations remain unresolved.
        } else {
        const renameArgs = rename === null ? [] : splitTopLevel(rename[1] as string, ",");
        const headerVariable = renameArgs[0]?.trim() ?? "";
        const sourceTarget = safeHeaderTargets.get(headerVariable) ?? null;
        const oldHeads = renameArgs[1] === undefined ? null : resolvedExpressionOptions(renameArgs[1], variables, resolvedOptions);
        const newHeads = renameArgs[2] === undefined ? null : resolvedExpressionOptions(renameArgs[2], variables, resolvedOptions);
        const oldTarget = oldHeads?.length === 1
          ? /^CREATE OR REPLACE FUNCTION clara\."?([A-Za-z_]\w*)"?\($/i.exec(oldHeads[0] as string)?.[1] ?? null
          : null;
        const newTarget = newHeads?.length === 1
          ? /^CREATE OR REPLACE FUNCTION clara\."?([A-Za-z_]\w*)"?\([^)]*$/i.exec(newHeads[0] as string)?.[1] ?? null
          : null;
        const opening = resolvedExpressionOptions(parts[1] as string, variables, resolvedOptions);
        const closing = resolvedExpressionOptions(parts[parts.length - 1] as string, variables, resolvedOptions);
        const openingTag = opening?.length === 1 ? /^AS\s+(\$[A-Za-z_0-9]*\$)$/i.exec((opening[0] as string).trim())?.[1] : undefined;
        const bodyPartsSafe = parts.slice(2, -1).every((part) =>
          safeBodyExpressionTarget(part, safeBodyTargets, variables, resolvedOptions) !== null ||
          resolvedExpressionOptions(part, variables, resolvedOptions) !== null);
        if (
          sourceTarget !== null &&
          oldTarget === sourceTarget &&
          newTarget !== null &&
          openingTag !== undefined &&
          closing?.length === 1 &&
          (closing[0] as string).trim() === openingTag &&
          bodyPartsSafe
        ) exactSourceTarget = newTarget;
        }
      }
      if (exactSourceTarget === null) {
        const parts = splitTopLevel(expression, "||");
        const headerTarget = safeHeaderTargets.get(parts[0]?.trim() ?? "") ?? null;
        const opening = parts[1] === undefined ? null : resolvedExpressionOptions(parts[1], variables, resolvedOptions);
        const closing = parts.length < 3 ? null : resolvedExpressionOptions(parts[parts.length - 1] as string, variables, resolvedOptions);
        const openingTag = opening?.length === 1 ? /^AS\s+(\$[A-Za-z_0-9]*\$)$/i.exec((opening[0] as string).trim())?.[1] : undefined;
        const safeBodyPart = (part: string): boolean => {
          if (safeBodyExpressionTarget(part, safeBodyTargets, variables, resolvedOptions) !== null) return true;
          if (resolvedExpressionOptions(part, variables, resolvedOptions) !== null) return true;
          const format = /^format\s*\(([\s\S]*)\)$/i.exec(part.trim());
          if (format === null) return false;
          const args = splitTopLevel(format[1] as string, ",");
          const template = args[0] === undefined ? null : resolvedExpressionOptions(args[0], variables, resolvedOptions);
          return template?.length === 1 && args.slice(1).every((arg) =>
            resolvedExpressionOptions(arg, variables, resolvedOptions) !== null || safeCatalogText.has(arg.trim()));
        };
        if (
          headerTarget !== null &&
          openingTag !== undefined &&
          closing?.length === 1 &&
          (closing[0] as string).trim() === openingTag &&
          parts.slice(2, -1).every(safeBodyPart)
        ) exactSourceTarget = headerTarget;
      }
      if (exactSourceTarget !== null && exactSourceTarget !== fn) continue;
      const unresolvedButProvablyNotFunctionDdl =
        rendered !== null &&
        rendered.includes(UNRESOLVED_SQL_VALUE) &&
        (
          /^(?:grant|revoke|alter\s+(?:role|table|default\s+privileges)|create\s+(?:role|policy|trigger|table|index)|drop\s+(?:role|policy|trigger|table|index))\b/i.test(rendered.trimStart()) ||
          /^alter\s+function\b[\s\S]*\bowner\s+to\b/i.test(rendered.trimStart())
        );
      if (unresolvedButProvablyNotFunctionDdl) continue;
      if (rendered === null || rendered.includes(UNRESOLVED_SQL_VALUE)) {
        const shape = expression.trim().replace(/\s+/g, " ").slice(0, 120);
        throw new Error(`sql_function_census_unresolved_execute:${file}:${shape}`);
      }
      const statementIndex = rawStatement.indexOf(statement);
      if (statementIndex < 0) {
        throw new Error(`sql_function_census_unclassified_execute_offset:${file}`);
      }
      found.push(...operationsInSql(rendered, fn, file, {
        blockOffset: block.index,
        statementOffset: block.bodyOffset - block.index + part.start + statementIndex,
      }));
    }
  }
  return found;
}

/** Literal and constant-built semantic operations on one exact clara function. */
export function semanticFunctionOperations(dir: string, fn: string): SqlFunctionOperation[] {
  const operations: OrderedSqlFunctionOperation[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    operations.push(...operationsInSql(sql, fn, file), ...dynamicOperations(sql, fn, file));
  }
  return operations
    .sort((a, b) =>
      a.file.localeCompare(b.file) ||
      a.blockOffset - b.blockOffset ||
      a.statementOffset - b.statementOffset ||
      a.renderedOffset - b.renderedOffset)
    .map((operation) => ({
      file: operation.file,
      kind: operation.kind,
      offset: operation.offset,
      definition: operation.definition,
    }));
}
