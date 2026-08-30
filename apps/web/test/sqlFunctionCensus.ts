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

function evaluate(expression: string, variables: ReadonlyMap<string, string>): string | null {
  const expr = expression.trim().replace(/^\((.*)\)$/s, "$1");
  const concatenated = splitTopLevel(expr, "||");
  if (concatenated.length > 1) {
    const values = concatenated.map((part) => evaluate(part, variables));
    return values.every((value): value is string => value !== null) ? values.join("") : null;
  }
  const adjacentLiterals: string[] = [];
  let literalOffset = 0;
  while (literalOffset < expr.length) {
    literalOffset += /^\s*/.exec(expr.slice(literalOffset))?.[0].length ?? 0;
    const literal = /^'(?:[^']|'')*'/.exec(expr.slice(literalOffset))?.[0];
    if (literal === undefined) break;
    adjacentLiterals.push(literal.slice(1, -1).replace(/''/g, "'"));
    literalOffset += literal.length;
  }
  literalOffset += /^\s*/.exec(expr.slice(literalOffset))?.[0].length ?? 0;
  if (adjacentLiterals.length > 0 && literalOffset === expr.length) return adjacentLiterals.join("");
  const dollar = /^\$([A-Za-z_0-9]*)\$([\s\S]*)\$\1\$$/.exec(expr);
  if (dollar !== null) return dollar[2] as string;
  if (/^[A-Za-z_]\w*$/.test(expr)) return variables.get(expr) ?? UNRESOLVED_SQL_VALUE;
  if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(expr)) return UNRESOLVED_SQL_VALUE;

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

function operationsInSql(sql: string, fn: string, file: string, baseOffset = 0): SqlFunctionOperation[] {
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
      offset: baseOffset + localOffset,
      definition: kind === "define" ? sqlStatementFrom(sql, localOffset) : null,
    };
  });
}

function dynamicOperations(sql: string, fn: string, file: string): SqlFunctionOperation[] {
  const found: SqlFunctionOperation[] = [];
  const provenCoreDerivers = new Set<string>();
  for (const helper of sql.matchAll(
    /create\s+function\s+pg_temp\.([A-Za-z_]\w*)\s*\(([^)]*)\)\s*returns\s+text\b[\s\S]*?\bas\s+\$([A-Za-z_0-9]*)\$([\s\S]*?)\$\3\$\s*;/gi,
  )) {
    if (/\bp_core_name\s+text\b/i.test(helper[2] as string) &&
        /return\s+format\s*\(\s*'create function clara\.%I[\s\S]*?\bp_core_name\b/i.test(helper[4] as string)) {
      provenCoreDerivers.add(`pg_temp.${helper[1] as string}`.toLowerCase());
    }
  }
  const hasProvenCm1DefinitionStore =
    /select\b[\s\S]*?pg_get_functiondef\s*\(\s*[A-Za-z_]\w*\.oid\s*\)[\s\S]*?where\s+[A-Za-z_]\w*\.oid\s*=\s*r\.sig\s*::\s*regprocedure/i.test(sql) &&
    /insert\s+into\s+_cm1_pre\s*\(\s*k\s*,\s*v\s*\)\s*values\s*\(\s*'def:'\s*\|\|\s*r\.sig\s*,\s*v_def\s*\)/i.test(sql) &&
    !/\b(?:update|delete\s+from)\s+_cm1_pre\b/i.test(maskQuotedAndCommented(sql));
  let fa9bAnchorTarget: string | null = null;
  const fa9bInsert = /insert\s+into\s+fa9b_anchors\s*\(\s*id\s*,\s*target\s*,\s*old\s*,\s*new\s*\)\s*values\b/i.exec(sql);
  if (fa9bInsert !== null) {
    const statement = sqlStatementFrom(sql, (fa9bInsert.index ?? 0) + fa9bInsert[0].length).replace(/;\s*$/, "");
    const names: string[] = [];
    let complete = true;
    for (let tuple of splitTopLevel(statement, ",")) {
      tuple = tuple.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "").trim();
      const fields = /^\(([\s\S]*)\)$/.exec(tuple)?.[1];
      const target = fields === undefined ? null : evaluate(splitTopLevel(fields, ",")[1] ?? "", new Map());
      const name = target === null ? null : functionNameFromSignature(target);
      if (name === null) { complete = false; break; }
      names.push(name);
    }
    if (complete && names.length > 0) {
      const unique = new Set(names);
      fa9bAnchorTarget = unique.has(fn) ? (unique.size === 1 ? fn : null) : PROVEN_OTHER_FUNCTION;
    }
  }
  for (const block of sql.matchAll(/\bdo\s+\$([A-Za-z_0-9]*)\$([\s\S]*?)\$\1\$\s*;/gi)) {
    const body = block[2] as string;
    const variables = new Map<string, string>();
    const targets = new Map<string, string>();
    for (let statement of splitTopLevel(body, ";")) {
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
        statement = statement.slice(foreach[0].length).trim();
        while (/^(?:--|\/\*)/.test(statement)) {
          if (statement.startsWith("--")) statement = statement.replace(/^--[^\n]*(?:\n|$)/, "").trimStart();
          else statement = statement.replace(/^\/\*[\s\S]*?\*\//, "").trimStart();
        }
        if (statement === "") continue;
      }
      const fa9bLoop = /^for\s+([A-Za-z_]\w*)\s+in\s+select\b[\s\S]*?\btarget\b[\s\S]*?\bfrom\s+fa9b_anchors\b[\s\S]*?\bloop\b/i.exec(statement);
      if (fa9bLoop !== null && fa9bAnchorTarget !== null) {
        targets.set(`${fa9bLoop[1] as string}.target`, fa9bAnchorTarget);
        statement = statement.slice(fa9bLoop[0].length).trim();
        if (statement === "") continue;
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
        }
        continue;
      }
      const sourceRead = /^select\s+pg_get_functiondef\s*\(\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure\s*\)\s+into\s+([A-Za-z_]\w*)$/i.exec(statement);
      if (sourceRead !== null) {
        const variable = sourceRead[2] as string;
        variables.set(variable, UNRESOLVED_SQL_VALUE);
        targets.set(variable, sourceRead[1] as string);
        continue;
      }
      const oidLiteralSourceRead = /^select\s+pg_get_functiondef\s*\(\s*[A-Za-z_]\w*\.oid\s*\)\s+into\s+([A-Za-z_]\w*)\s+from\s+(?:pg_catalog\.)?pg_proc\s+[A-Za-z_]\w*\s+where\s+[A-Za-z_]\w*\.oid\s*=\s*'clara\."?([A-Za-z_]\w*)"?\([^']*\)'\s*::\s*regprocedure$/i.exec(statement);
      if (oidLiteralSourceRead !== null) {
        const variable = oidLiteralSourceRead[1] as string;
        variables.set(variable, UNRESOLVED_SQL_VALUE);
        targets.set(variable, oidLiteralSourceRead[2] as string);
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
          continue;
        }
      }
      const assignment = /^(?:([A-Za-z_]\w*)\s+(?:text(?:\[\])?|name)\s*:=|([A-Za-z_]\w*)\s*:=)\s*([\s\S]+)$/i.exec(statement);
      if (assignment) {
        const variable = (assignment[1] ?? assignment[2]) as string;
        const expression = assignment[3] as string;
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
          const names = splitTopLevel(signatureArray[1] as string, ",").map((part) => {
            const item = evaluate(part, variables);
            return item === null ? null : functionNameFromSignature(item);
          });
          if (names.length > 0 && names.every((name): name is string => name !== null)) {
            const unique = new Set(names);
            enumeratedTarget = unique.has(fn)
              ? (unique.size === 1 ? fn : null)
              : PROVEN_OTHER_FUNCTION;
          }
        }
        const target = functionTargetFromExpression(expression, targets) ??
          extractedCore ??
          storedDefinition ??
          enumeratedTarget ??
          (value === null ? null : functionNameFromSignature(value));
        if (target === null) targets.delete(variable);
        else targets.set(variable, target);
        continue;
      }
      const execution = /^execute\s+([\s\S]+)$/i.exec(statement);
      if (!execution) continue;
      const expression = execution[1] as string;
      const rendered = evaluate(expression, variables);
      const exactSourceTarget = functionTargetFromExpression(expression, targets);
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
      found.push(...operationsInSql(rendered, fn, file, (block.index ?? 0)));
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
