// SOURCE ORACLE — AST-backed instruments for the scope-spine suites.
//
// These helpers are judgement logic: they decide whether a request entrance
// executes a guard, whether a route registration carries a capability check, and
// whether module state can outlive a request. Keep them in test code. Product code
// must never take a dependency on the TypeScript compiler.

import { readFileSync } from "node:fs";

import ts from "typescript";

export type StripOptions = {
  /** Blank string/template/regex payloads as well as comments. Delimiters and
   * newlines remain, so offsets and parse structure stay stable. */
  readonly blankStrings?: boolean;
};

const blankPreservingLines = (text: string): string => {
  let out = "";
  for (let i = 0; i < text.length; i += 1) out += text[i] === "\n" || text[i] === "\r" ? text[i] : " ";
  return out;
};

function sourceFile(code: string): ts.SourceFile {
  return ts.createSourceFile("source-oracle.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function literalMask(text: string): string {
  if (text.length < 2) return blankPreservingLines(text);
  const first = text[0] as string;
  const last = text[text.length - 1] as string;
  if ((first === '"' || first === "'" || first === "`") && last === first) {
    return `${first}${blankPreservingLines(text.slice(1, -1))}${last}`;
  }
  if (first === "/") {
    const close = text.lastIndexOf("/");
    if (close > 0) return `/${blankPreservingLines(text.slice(1, close))}/${text.slice(close + 1)}`;
  }
  return blankPreservingLines(text);
}

/**
 * Blank real comments using TypeScript's scanner. Unlike deletion, masking keeps
 * `export/**\/const` token-separated. When requested, parsed literal ranges are
 * masked too, including regex literals — a `/}/` can never close a block scan.
 */
export function stripComments(src: string, opts: StripOptions = {}): string {
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, src);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const start = scanner.getTokenPos();
      const end = scanner.getTextPos();
      replacements.push({ start, end, text: blankPreservingLines(src.slice(start, end)) });
    }
  }

  if (opts.blankStrings === true) {
    const file = sourceFile(src);
    const visit = (node: ts.Node): void => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        node.kind === ts.SyntaxKind.RegularExpressionLiteral
      ) {
        const start = node.getStart(file);
        replacements.push({ start, end: node.end, text: literalMask(src.slice(start, node.end)) });
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  const chars = src.split("");
  for (const replacement of replacements) {
    const masked = replacement.text.split("");
    for (let i = replacement.start; i < replacement.end; i += 1) chars[i] = masked[i - replacement.start] ?? " ";
  }
  return chars.join("");
}

export function readCode(path: string, opts: StripOptions = {}): string {
  return stripComments(readFileSync(path, "utf8"), opts);
}

/** Index after the syntactic construct that opens at `{`, `(` or `[`. The AST
 * supplies the range when possible; the fallback balances a literal-masked view. */
export function matchBlock(src: string, open: number): number {
  const opener = src[open];
  const closer = opener === "{" ? "}" : opener === "(" ? ")" : opener === "[" ? "]" : null;
  if (closer === null) return -1;
  const file = sourceFile(src);
  let best: ts.Node | null = null;
  const visit = (node: ts.Node): void => {
    const start = node.getStart(file);
    if (start === open && src[node.end - 1] === closer && (best === null || node.end < best.end)) best = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  const matched = best as ts.Node | null;
  if (matched !== null) return matched.end;

  const code = stripComments(src, { blankStrings: true });
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === opener) depth += 1;
    else if (code[i] === closer && --depth === 0) return i + 1;
  }
  return -1;
}

export type DeclKind = "function" | "const" | "let" | "var" | "class" | "static-field" | "static-block";

export type Decl = {
  readonly name: string;
  readonly kind: DeclKind;
  readonly exported: boolean;
  readonly isDefault: boolean;
  readonly body: string;
  readonly start: number;
  readonly end: number;
};

type InternalDecl = Decl & {
  readonly node: ts.Node;
  readonly callable: ts.FunctionLikeDeclaration | null;
  readonly alias: string | null;
  readonly scopeStart: number;
  readonly scopeEnd: number;
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));

function localScope(node: ts.Node, file: ts.SourceFile): { scopeStart: number; scopeEnd: number } {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isFunctionLike(parent) || ts.isClassStaticBlockDeclaration(parent)) {
      return { scopeStart: parent.getStart(file), scopeEnd: parent.end };
    }
  }
  return { scopeStart: 0, scopeEnd: file.end };
}

function variableStatementOf(node: ts.Node): ts.VariableStatement | null {
  for (let parent: ts.Node | undefined = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isVariableStatement(parent)) return parent;
    if (!ts.isVariableDeclarationList(parent) && !ts.isVariableDeclaration(parent)) return null;
  }
  return null;
}

function declarationKind(list: ts.VariableDeclarationList): "const" | "let" | "var" {
  if ((list.flags & ts.NodeFlags.Const) !== 0) return "const";
  if ((list.flags & ts.NodeFlags.Let) !== 0) return "let";
  return "var";
}

function collectDeclarations(code: string): { file: ts.SourceFile; declarations: InternalDecl[] } {
  const file = sourceFile(code);
  const declarations: InternalDecl[] = [];

  const add = (decl: Omit<InternalDecl, "scopeStart" | "scopeEnd">): void => {
    declarations.push({ ...decl, ...localScope(decl.node, file) });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node)) {
      const name = node.name?.text ?? `__default_function_${node.pos}`;
      add({
        name,
        kind: "function",
        exported: hasModifier(node, ts.SyntaxKind.ExportKeyword) || hasModifier(node, ts.SyntaxKind.DefaultKeyword),
        isDefault: hasModifier(node, ts.SyntaxKind.DefaultKeyword),
        body: node.body?.getText(file) ?? "",
        start: node.getStart(file),
        end: node.end,
        node,
        callable: node.body === undefined ? null : node,
        alias: null,
      });
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const statement = variableStatementOf(node);
      const list = node.parent;
      if (!ts.isVariableDeclarationList(list)) return;
      const initializer = node.initializer;
      add({
        name: node.name.text,
        kind: declarationKind(list),
        exported: statement !== null && hasModifier(statement, ts.SyntaxKind.ExportKeyword),
        isDefault: false,
        body: initializer?.getText(file) ?? "",
        start: node.getStart(file),
        end: node.end,
        node,
        callable: initializer !== undefined && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
          ? initializer
          : null,
        alias: initializer !== undefined && ts.isIdentifier(initializer) ? initializer.text : null,
      });
    } else if (ts.isClassDeclaration(node)) {
      const className = node.name?.text ?? `__default_class_${node.pos}`;
      add({
        name: className,
        kind: "class",
        exported: hasModifier(node, ts.SyntaxKind.ExportKeyword) || hasModifier(node, ts.SyntaxKind.DefaultKeyword),
        isDefault: hasModifier(node, ts.SyntaxKind.DefaultKeyword),
        body: node.getText(file),
        start: node.getStart(file),
        end: node.end,
        node,
        callable: null,
        alias: null,
      });
      let staticIndex = 0;
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) && hasModifier(member, ts.SyntaxKind.StaticKeyword)) {
          const memberName = member.name !== undefined && ts.isIdentifier(member.name) ? member.name.text : `<field-${staticIndex}>`;
          add({
            name: `${className}.${memberName}`,
            kind: "static-field",
            exported: false,
            isDefault: false,
            body: member.initializer?.getText(file) ?? "",
            start: member.getStart(file),
            end: member.end,
            node: member,
            callable: null,
            alias: null,
          });
          staticIndex += 1;
        } else if (ts.isClassStaticBlockDeclaration(member)) {
          add({
            name: `${className}.<static-${staticIndex}>`,
            kind: "static-block",
            exported: false,
            isDefault: false,
            body: member.body.getText(file),
            start: member.getStart(file),
            end: member.end,
            node: member,
            callable: null,
            alias: null,
          });
          staticIndex += 1;
        }
      }
    } else if (ts.isExportAssignment(node) && !node.isExportEquals && (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression))) {
      const name = `__default_expression_${node.pos}`;
      add({
        name,
        kind: "function",
        exported: true,
        isDefault: true,
        body: node.expression.body.getText(file),
        start: node.getStart(file),
        end: node.end,
        node,
        callable: node.expression,
        alias: null,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  declarations.sort((a, b) => a.start - b.start || a.end - b.end);
  return { file, declarations };
}

/** Module-lifetime declarations. Function/arrow/class-method/static-block locals
 * are excluded; module blocks and class static state remain visible. */
export function moduleLevelDeclarations(code: string): Decl[] {
  return collectDeclarations(code).declarations
    .filter((decl) => decl.scopeStart === 0 && decl.scopeEnd === sourceFile(code).end)
    .map((decl) => ({
      name: decl.name,
      kind: decl.kind,
      exported: decl.exported,
      isDefault: decl.isDefault,
      body: decl.body,
      start: decl.start,
      end: decl.end,
    }));
}

type ExportTarget = { readonly local: string | null; readonly reason: string | null };

function exportTargets(code: string): Map<string, ExportTarget> {
  const file = sourceFile(code);
  const targets = new Map<string, ExportTarget>();
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (statement.exportClause === undefined) {
        targets.set("*", { local: null, reason: "has no locally inspectable/provable spine call: export * re-export" });
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const exported = element.name.text;
        const local = element.propertyName?.text ?? element.name.text;
        targets.set(exported, statement.moduleSpecifier === undefined
          ? { local, reason: null }
          : { local: null, reason: `has no locally inspectable/provable spine call: ${exported} is re-exported from another module` });
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      targets.set("default", ts.isIdentifier(statement.expression)
        ? { local: statement.expression.text, reason: null }
        : { local: `__default_expression_${statement.pos}`, reason: null });
    }
  }
  return targets;
}

/** `export { raw as "DELETE" }` maps DELETE to raw. Re-exports are present with
 * an empty local target so callers fail closed rather than inventing a body. */
export function exportClauseAliases(code: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const [name, target] of exportTargets(code)) aliases.set(name, target.local ?? "");
  return aliases;
}

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export function uninspectableExportReasons(code: string): string[] {
  return [...exportTargets(code).values()].flatMap((target) => target.reason === null ? [] : [target.reason]);
}

export function exportedHttpMethods(code: string): string[] {
  const methods = new Set<string>(HTTP_METHODS);
  const found: Array<{ name: string; start: number }> = [];
  for (const decl of collectDeclarations(code).declarations) {
    if (decl.exported && methods.has(decl.name)) found.push({ name: decl.name, start: decl.start });
  }
  const targets = exportTargets(code);
  for (const [name] of targets) if (methods.has(name)) found.push({ name, start: Number.MAX_SAFE_INTEGER });
  return [...new Set(found.sort((a, b) => a.start - b.start).map((item) => item.name))];
}

export function defaultExportName(code: string): string | null {
  const declarations = collectDeclarations(code).declarations;
  const direct = declarations.find((decl) => decl.isDefault);
  if (direct !== undefined) return direct.name;
  return exportTargets(code).get("default")?.local ?? null;
}

function resolveName(declarations: InternalDecl[], name: string, at: number): InternalDecl | null {
  const candidates = declarations.filter(
    (decl) => decl.name === name && decl.scopeStart <= at && decl.scopeEnd >= at,
  );
  return candidates.sort((a, b) => (a.scopeEnd - a.scopeStart) - (b.scopeEnd - b.scopeStart) || b.start - a.start)[0] ?? null;
}

function resolveRoot(code: string, rootName: string): { file: ts.SourceFile; declarations: InternalDecl[]; root: InternalDecl | null; reason: string | null } {
  const collected = collectDeclarations(code);
  const target = exportTargets(code).get(rootName);
  if (target?.reason !== null && target?.reason !== undefined) return { ...collected, root: null, reason: target.reason };
  const local = target?.local || rootName;
  let root = collected.declarations.find((decl) => decl.name === local && (decl.exported || local !== rootName))
    ?? collected.declarations.find((decl) => decl.name === local)
    ?? null;
  const seen = new Set<string>();
  while (root !== null && root.callable === null && root.alias !== null && !seen.has(root.name)) {
    seen.add(root.name);
    root = resolveName(collected.declarations, root.alias, root.start);
  }
  if (root?.callable === null) return { ...collected, root: null, reason: "has no locally inspectable/provable spine call" };
  return { ...collected, root, reason: root === null ? "has no locally inspectable/provable spine call" : null };
}

export type ReachableCall = {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly awaited: boolean;
  readonly argumentCount: number;
};

function calleeIdentifier(expression: ts.Expression): ts.Identifier | null {
  if (ts.isIdentifier(expression)) return expression;
  if (ts.isParenthesizedExpression(expression)) return calleeIdentifier(expression.expression);
  return null;
}

function callName(call: ts.CallExpression): string {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return call.expression.getText();
}

function reachableGraph(code: string, rootName: string): { texts: string[]; calls: ReachableCall[]; reason: string | null } {
  const resolved = resolveRoot(code, rootName);
  if (resolved.root === null) return { texts: [], calls: [], reason: resolved.reason };
  const queue: InternalDecl[] = [resolved.root];
  const reached = new Set<string>();
  const texts: string[] = [];
  const calls: ReachableCall[] = [];

  while (queue.length > 0) {
    const decl = queue.shift() as InternalDecl;
    const key = `${decl.start}:${decl.end}`;
    if (reached.has(key)) continue;
    const callable = decl.callable;
    if (callable === null || callable.body === undefined) continue;
    const callableBody = callable.body;
    reached.add(key);
    texts.push(callableBody.getText(resolved.file));

    const visit = (node: ts.Node): void => {
      if (node !== callableBody && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
      if (ts.isCallExpression(node)) {
        calls.push({
          name: callName(node),
          start: node.getStart(resolved.file),
          end: node.end,
          awaited: ts.isAwaitExpression(node.parent),
          argumentCount: node.arguments.length,
        });
        const identifier = calleeIdentifier(node.expression);
        if (identifier !== null) {
          let target = resolveName(resolved.declarations, identifier.text, node.getStart(resolved.file));
          const aliases = new Set<string>();
          while (target !== null && target.callable === null && target.alias !== null && !aliases.has(target.name)) {
            aliases.add(target.name);
            target = resolveName(resolved.declarations, target.alias, target.start);
          }
          if (target?.callable !== null && target !== null) queue.push(target);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(callableBody);
  }
  return { texts, calls, reason: null };
}

/** Code from the root plus locally INVOKED declarations only. Merely mentioning a
 * helper, or declaring an uninvoked local arrow, creates no call-graph edge. */
export function reachableFrom(code: string, rootName: string): string | null {
  const graph = reachableGraph(code, rootName);
  return graph.reason === null ? stripComments(graph.texts.join("\n"), { blankStrings: true }) : null;
}

export function reachableCallsFrom(code: string, rootName: string): readonly ReachableCall[] {
  return reachableGraph(code, rootName).calls;
}

export type SpineGuardProof = {
  readonly inspectable: boolean;
  readonly call: "requireFirmScope" | "firmScopeGuard" | null;
  readonly dominates: boolean;
  readonly reason: string;
};

function awaitedBareSpineCall(statement: ts.Statement): "requireFirmScope" | "firmScopeGuard" | null {
  let expression: ts.Expression | undefined;
  if (ts.isExpressionStatement(statement)) expression = statement.expression;
  else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    expression = statement.declarationList.declarations[0]?.initializer;
  }
  if (expression === undefined || !ts.isAwaitExpression(expression)) return null;
  const call = expression.expression;
  if (!ts.isCallExpression(call) || call.arguments.length !== 0 || !ts.isIdentifier(call.expression)) return null;
  return call.expression.text === "requireFirmScope" || call.expression.text === "firmScopeGuard"
    ? call.expression.text
    : null;
}

/** Prove the guard executes before every branch, closure call, proxy, or render.
 * The accepted form is the root's first statement, or the first statement of a
 * top-level try with NO catch. A finally-only wrapper is safe because it cannot
 * swallow redirect's throw. */
export function spineGuardProof(code: string, rootName: string): SpineGuardProof {
  const resolved = resolveRoot(code, rootName);
  if (resolved.root === null || resolved.root.callable === null) {
    return { inspectable: false, call: null, dominates: false, reason: resolved.reason ?? "has no locally inspectable/provable spine call" };
  }
  const body = resolved.root.callable.body;
  if (body === undefined || !ts.isBlock(body) || body.statements.length === 0) {
    return { inspectable: true, call: null, dominates: false, reason: "the root has no top-level guard statement" };
  }
  const first = body.statements[0] as ts.Statement;
  const direct = awaitedBareSpineCall(first);
  if (direct !== null) return { inspectable: true, call: direct, dominates: true, reason: "proved" };
  if (ts.isTryStatement(first) && first.catchClause === undefined && first.tryBlock.statements.length > 0) {
    const inTry = awaitedBareSpineCall(first.tryBlock.statements[0] as ts.Statement);
    if (inTry !== null) return { inspectable: true, call: inTry, dominates: true, reason: "proved through a non-swallowing try/finally" };
  }
  return {
    inspectable: true,
    call: null,
    dominates: false,
    reason: "the awaited spine call is not the first dominating statement of the locally inspectable root",
  };
}

/** Ranges of try blocks whose catch can swallow a throw. Finally-only tries are
 * deliberately absent. */
export function tryBlockRanges(code: string): [number, number][] {
  const file = sourceFile(code);
  const ranges: [number, number][] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTryStatement(node) && node.catchClause !== undefined) {
      ranges.push([node.tryBlock.getStart(file), node.tryBlock.end]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return ranges;
}

const MUTATING_METHODS = new Set(["add", "clear", "copyWithin", "delete", "fill", "pop", "push", "reverse", "set", "shift", "sort", "splice", "unshift"]);

function immutableInitializer(initializer: ts.Expression, file: ts.SourceFile): boolean {
  if (/\bas\s+const\s*$/.test(initializer.getText(file))) return true;
  return ts.isCallExpression(initializer)
    && ts.isPropertyAccessExpression(initializer.expression)
    && ts.isIdentifier(initializer.expression.expression)
    && initializer.expression.expression.text === "Object"
    && initializer.expression.name.text === "freeze";
}

function mutableInitializer(initializer: ts.Expression, file: ts.SourceFile): string | null {
  if (immutableInitializer(initializer, file)) return null;
  let value = initializer;
  while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression;
  if (ts.isNewExpression(value) && ts.isIdentifier(value.expression) && ["Map", "Set", "WeakMap", "WeakSet", "Array"].includes(value.expression.text)) {
    return `constructs mutable ${value.expression.text}`;
  }
  if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)
      && ts.isIdentifier(value.expression.expression) && value.expression.expression.text === "Object"
      && value.expression.name.text === "create") return "constructs a mutable Object.create container";
  if (ts.isObjectLiteralExpression(value) && value.properties.length > 0) return "holds a populated mutable object literal";
  if (ts.isArrayLiteralExpression(value) && value.elements.length > 0) return "holds a populated mutable array literal";
  if (value.kind === ts.SyntaxKind.RegularExpressionLiteral) {
    const flags = value.getText(file).slice(value.getText(file).lastIndexOf("/") + 1);
    if (flags.includes("g") || flags.includes("y")) return `holds a stateful /${flags} regex`;
  }
  return null;
}

function mutatedNames(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const rootIdentifier = (expression: ts.Expression): string | null => {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) return rootIdentifier(expression.expression);
    return null;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const name = rootIdentifier(node.left as ts.Expression);
      if (name !== null) names.add(name);
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = rootIdentifier(node.expression.expression);
      if (name !== null && MUTATING_METHODS.has(node.expression.name.text)) names.add(name);
      if (ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object"
          && node.expression.name.text === "assign" && node.arguments[0] !== undefined) {
        const assigned = rootIdentifier(node.arguments[0]);
        if (assigned !== null) names.add(assigned);
      }
    } else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
      const name = rootIdentifier(node.operand);
      if (name !== null) names.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

/** Return every unallowlisted module-lifetime store. Allowlist entries must carry
 * a substantial reason; a bare name is not evidence. */
export function moduleStateHazards(code: string, allowlist: ReadonlyMap<string, string> = new Map()): string[] {
  const collected = collectDeclarations(code);
  const mutated = mutatedNames(collected.file);
  const hazards: string[] = [];
  const moduleDecls = collected.declarations.filter((decl) => decl.scopeStart === 0 && decl.scopeEnd === collected.file.end);
  for (const decl of moduleDecls) {
    const reason = allowlist.get(decl.name);
    if (reason !== undefined) {
      if (reason.trim().length < 40) hazards.push(`${decl.name}: allowlist reason is too thin to prove safety`);
      continue;
    }
    if (decl.kind === "let" || decl.kind === "var") hazards.push(`${decl.kind} ${decl.name}: mutable module binding`);
    else if (decl.kind === "static-field") hazards.push(`${decl.name}: class static field outlives requests`);
    else if (decl.kind === "static-block") {
      if (/\b(?:this|[A-Za-z_$][\w$]*)\s*(?:\.|\[)/.test(decl.body) || /=/.test(decl.body)) hazards.push(`${decl.name}: class static block writes module state`);
    } else if (decl.kind === "const" && ts.isVariableDeclaration(decl.node) && decl.node.initializer !== undefined) {
      const hazard = mutableInitializer(decl.node.initializer, collected.file);
      if (hazard !== null) hazards.push(`${decl.name}: ${hazard}`);
      else if (mutated.has(decl.name)) hazards.push(`${decl.name}: module container is mutated after declaration`);
    }
  }
  return hazards;
}

const SCOPE_SPINE_MODULES = [
  "lib/supabase/server-session.ts",
  "lib/require-firm-scope.ts",
  "lib/runtime/outbound.ts",
  "lib/firm/caller-context.ts",
] as const;

const SCOPE_SPINE_ALLOWLISTS = new Map<string, ReadonlyMap<string, string>>([
  ["lib/require-firm-scope.ts", new Map([
    ["SCOPE_ENTRANCES", "Static entrance registry, read by the census and never mutated after module initialization."],
    ["SCOPE_UNSCOPED_SURFACES", "Static unscoped-surface registry, read by the census and never mutated after module initialization."],
    ["SCOPE_EXEMPT_SURFACES", "Static exemption registry, read by the census and never mutated after module initialization."],
  ])],
  ["lib/runtime/outbound.ts", new Map([
    ["CAPABILITY_LEGS", "Static method-and-path capability contract, read for classification and never mutated."],
  ])],
]);

/** Read the exact four modules that decide or carry firm scope. Kept beside the
 * hazard logic so the live gate and its mutant controls cannot drift. */
export function scopeSpineModuleStateReport(webRoot: string): ReadonlyArray<{
  readonly file: string;
  readonly declarationCount: number;
  readonly hazards: readonly string[];
}> {
  return SCOPE_SPINE_MODULES.map((file) => {
    const code = readFileSync(`${webRoot}/${file}`, "utf8");
    return {
      file,
      declarationCount: moduleLevelDeclarations(code).length,
      hazards: moduleStateHazards(code, SCOPE_SPINE_ALLOWLISTS.get(file)),
    };
  });
}

export type RuntimeRouteRegistration = {
  readonly call: string;
  readonly capability: boolean;
  readonly shape: "router-method" | "register-helper";
};

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

function stringArgument(expression: ts.Expression | undefined, context: string): string {
  if (expression !== undefined && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) return expression.text;
  throw new Error(`${context}: unrecognised route registration shape — method/path must be a static string`);
}

function containsCall(nodes: readonly ts.Node[], wanted: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === wanted) found = true;
    ts.forEachChild(node, visit);
  };
  for (const node of nodes) visit(node);
  return found;
}

function routeCall(method: string, path: string): string {
  const segments = path.replace(/^\/api\//, "").split("/").map((segment) => segment.startsWith(":") ? "*" : segment);
  return `${method.toUpperCase()} ${segments.join("/")}`;
}

/** Parse direct `router.<method>(path, ...handlers)` calls and the one explicit
 * helper shape `register(router, "put", path, ...handlers)`. A call that handles a
 * router through any other shape throws with its name instead of disappearing. */
export function runtimeRouteRegistrations(code: string): RuntimeRouteRegistration[] {
  const file = sourceFile(code);
  const routes: RuntimeRouteRegistration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
          && node.expression.expression.text === "router") {
        const method = node.expression.name.text.toLowerCase();
        if (method === "use") {
          ts.forEachChild(node, visit);
          return;
        }
        if (!ROUTE_METHODS.has(method)) throw new Error(`router.${method}: unrecognised route registration shape`);
        const path = stringArgument(node.arguments[0], `router.${method}`);
        if (node.arguments.length < 2) throw new Error(`router.${method}("${path}"): unrecognised route registration shape — no handler`);
        routes.push({
          call: routeCall(method, path),
          capability: containsCall(node.arguments.slice(1), "bearerCapability"),
          shape: "router-method",
        });
      } else {
        const routerArg = node.arguments.find((argument) => ts.isIdentifier(argument) && argument.text === "router");
        if (routerArg !== undefined) {
          if (!ts.isIdentifier(node.expression) || node.expression.text !== "register" || node.arguments[0] !== routerArg) {
            throw new Error(`${node.expression.getText(file)}(router, ...): unrecognised route registration shape`);
          }
          const method = stringArgument(node.arguments[1], "register(router, method)").toLowerCase();
          if (!ROUTE_METHODS.has(method)) throw new Error(`register(router, "${method}"): unrecognised route registration method`);
          const path = stringArgument(node.arguments[2], `register(router, "${method}", path)`);
          if (node.arguments.length < 4) throw new Error(`register(router, "${method}", "${path}"): unrecognised route registration shape — no handler`);
          routes.push({
            call: routeCall(method, path),
            capability: containsCall(node.arguments.slice(3), "bearerCapability"),
            shape: "register-helper",
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return routes;
}
