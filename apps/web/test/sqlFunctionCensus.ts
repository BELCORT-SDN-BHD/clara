import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type SqlFunctionOperation = {
  readonly file: string;
  readonly kind: "define" | "drop";
  readonly offset: number;
};

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let quote = false;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "'") {
      if (quote && source[i + 1] === "'") i += 1;
      else quote = !quote;
      continue;
    }
    if (quote) continue;
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

function evaluate(expression: string, variables: ReadonlyMap<string, string>): string | null {
  const expr = expression.trim().replace(/^\((.*)\)$/s, "$1");
  const concatenated = splitTopLevel(expr, "||");
  if (concatenated.length > 1) {
    const values = concatenated.map((part) => evaluate(part, variables));
    return values.every((value): value is string => value !== null) ? values.join("") : null;
  }
  if (/^'(?:[^']|'')*'$/.test(expr)) return expr.slice(1, -1).replace(/''/g, "'");
  if (/^[A-Za-z_]\w*$/.test(expr)) return variables.get(expr) ?? null;

  const call = /^(format|replace)\s*\(([\s\S]*)\)$/i.exec(expr);
  if (!call) return null;
  const args = splitTopLevel(call[2] as string, ",").map((arg) => evaluate(arg, variables));
  if (args.some((arg) => arg === null)) return null;
  const values = args as string[];
  if (call[1]?.toLowerCase() === "replace") {
    return values.length === 3 ? values[0]!.split(values[1]!).join(values[2]!) : null;
  }
  let index = 1;
  return values[0]!.replace(/%%|%[sIL]/g, (token) => {
    if (token === "%%") return "%";
    const value = values[index++] ?? "";
    if (token === "%L") return `'${value.replace(/'/g, "''")}'`;
    return value;
  });
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

function operationsInSql(sql: string, fn: string, file: string, baseOffset = 0): SqlFunctionOperation[] {
  const escaped = fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b(create\\s+(?:or\\s+replace\\s+)?function|drop\\s+function(?:\\s+if\\s+exists)?)\\s+clara\\.\"?${escaped}\"?\\s*\\(`,
    "gi",
  );
  return [...maskQuotedAndCommented(sql).matchAll(pattern)].map((match) => ({
    file,
    kind: /^drop/i.test(match[1] as string) ? "drop" : "define",
    offset: baseOffset + (match.index ?? 0),
  }));
}

function dynamicOperations(sql: string, fn: string, file: string): SqlFunctionOperation[] {
  const found: SqlFunctionOperation[] = [];
  for (const block of sql.matchAll(/\bdo\s+\$([A-Za-z_0-9]*)\$([\s\S]*?)\$\1\$\s*;/gi)) {
    const body = block[2] as string;
    const variables = new Map<string, string>();
    for (let statement of splitTopLevel(body, ";")) {
      statement = statement.trim().replace(/^declare\s+/i, "").replace(/^begin\s+/i, "");
      const assignment = /^(?:([A-Za-z_]\w*)\s+(?:text|name)\s*:=|([A-Za-z_]\w*)\s*:=)\s*([\s\S]+)$/i.exec(statement);
      if (assignment) {
        const value = evaluate(assignment[3] as string, variables);
        if (value !== null) variables.set((assignment[1] ?? assignment[2]) as string, value);
        continue;
      }
      const execution = /^execute\s+([\s\S]+)$/i.exec(statement);
      if (!execution) continue;
      const rendered = evaluate(execution[1] as string, variables);
      if (rendered !== null) found.push(...operationsInSql(rendered, fn, file, (block.index ?? 0)));
    }
  }
  return found;
}

/** Literal and constant-built semantic operations on one exact clara function. */
export function semanticFunctionOperations(dir: string, fn: string): SqlFunctionOperation[] {
  const operations: SqlFunctionOperation[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    operations.push(...operationsInSql(sql, fn, file), ...dynamicOperations(sql, fn, file));
  }
  return operations.sort((a, b) => a.file.localeCompare(b.file) || a.offset - b.offset);
}
