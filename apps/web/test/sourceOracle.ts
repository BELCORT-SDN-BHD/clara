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

const checkerCache = new WeakMap<ts.SourceFile, ts.TypeChecker>();

function diagnosticLocation(file: ts.SourceFile, start = 0): string {
  const position = file.getLineAndCharacterOfPosition(Math.max(0, start));
  return `${file.fileName}:${position.line + 1}:${position.character + 1}`;
}

function sourceFile(code: string): ts.SourceFile {
  const file = ts.createSourceFile("source-oracle.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    jsx: ts.JsxEmit.Preserve,
    noLib: true,
    noResolve: true,
  };
  const host = ts.createCompilerHost(options, true);
  host.getSourceFile = (fileName) => fileName === file.fileName ? file : undefined;
  host.fileExists = (fileName) => fileName === file.fileName;
  host.readFile = (fileName) => fileName === file.fileName ? code : undefined;
  const program = ts.createProgram([file.fileName], options, host);
  const parseDiagnostics = (file as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  const diagnostics = [...parseDiagnostics, ...program.getSyntacticDiagnostics(file)];
  if (diagnostics.length > 0) {
    const first = diagnostics[0] as ts.Diagnostic;
    const start = first.start ?? 0;
    const message = ts.flattenDiagnosticMessageText(first.messageText, " ");
    throw new Error(`unmodelled: syntactically invalid source at ${diagnosticLocation(file, start)} — ${message}`);
  }
  checkerCache.set(file, program.getTypeChecker());
  return file;
}

function checkerFor(file: ts.SourceFile): ts.TypeChecker {
  const checker = checkerCache.get(file);
  if (checker === undefined) throw new Error(`unmodelled: source binding unavailable at ${diagnosticLocation(file)}`);
  return checker;
}

type ImportBinding = { readonly importedFrom: string; readonly importedName: string };

function importBinding(identifier: ts.Identifier, file: ts.SourceFile): ImportBinding | null {
  const symbol = checkerFor(file).getSymbolAtLocation(identifier);
  for (const declaration of symbol?.declarations ?? []) {
    if (!ts.isImportSpecifier(declaration)) continue;
    const importDeclaration = declaration.parent.parent.parent;
    if (!ts.isImportDeclaration(importDeclaration) || !ts.isStringLiteral(importDeclaration.moduleSpecifier)) continue;
    return {
      importedFrom: importDeclaration.moduleSpecifier.text,
      importedName: declaration.propertyName?.text ?? declaration.name.text,
    };
  }
  return null;
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
      if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        const start = node.getStart(file);
        const raw = src.slice(start, node.end);
        const lead = ts.isTemplateHead(node) ? "`" : "}";
        const tail = ts.isTemplateTail(node) ? "`" : "${";
        replacements.push({
          start,
          end: node.end,
          text: `${lead}${blankPreservingLines(raw.slice(lead.length, raw.length - tail.length))}${tail}`,
        });
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

  const addClassStatics = (node: ts.ClassLikeDeclarationBase, className: string): void => {
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
      addClassStatics(node, className);
    } else if (ts.isClassExpression(node)) {
      const className = node.name?.text
        ?? (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : `__class_expression_${node.pos}`);
      addClassStatics(node, className);
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
  const uninspectable = (node: ts.Node, shape: string): void => {
    targets.set(`__unmodelled_${node.getStart(file)}`, {
      local: null,
      reason: `unmodelled: uninspectable export mechanism at ${diagnosticLocation(file, node.getStart(file))} — ${shape}`,
    });
  };
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (statement.exportClause === undefined) {
        targets.set("*", {
          local: null,
          reason: `unmodelled: export-star re-export at ${diagnosticLocation(file, statement.getStart(file))} — has no locally inspectable/provable spine call`,
        });
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const exported = element.name.text;
        const local = element.propertyName?.text ?? element.name.text;
        targets.set(exported, statement.moduleSpecifier === undefined
          ? { local, reason: null }
          : {
              local: null,
              reason: `unmodelled: re-exported ${exported} at ${diagnosticLocation(file, statement.getStart(file))} — has no locally inspectable/provable spine call`,
            });
      }
    } else if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals) uninspectable(statement, "export =");
      else {
        targets.set("default", ts.isIdentifier(statement.expression)
          ? { local: statement.expression.text, reason: null }
          : { local: `__default_expression_${statement.pos}`, reason: null });
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression)
        && node.left.expression.text === "module" && node.left.name.text === "exports") {
      uninspectable(node, "module.exports assignment");
      return;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object"
        && node.expression.name.text === "defineProperty" && node.arguments[0] !== undefined
        && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === "exports") {
      uninspectable(node, "Object.defineProperty(exports, …)");
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
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
    if (decl.exported && !decl.isDefault && methods.has(decl.name)) found.push({ name: decl.name, start: decl.start });
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
  if (root?.callable === null) {
    return {
      ...collected,
      root: null,
      reason: `unmodelled: non-callable execution root at ${diagnosticLocation(collected.file, root.start)} — has no locally inspectable/provable spine call`,
    };
  }
  return {
    ...collected,
    root,
    reason: root === null
      ? `unmodelled: missing execution root at ${diagnosticLocation(collected.file)} — has no locally inspectable/provable spine call`
      : null,
  };
}

export type ReachableCall = {
  readonly name: string;
  readonly importedFrom: string | null;
  readonly importedName: string | null;
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

function callableTextWithoutNestedBodies(body: ts.ConciseBody, file: ts.SourceFile): string {
  const start = body.getStart(file);
  const raw = body.getText(file);
  const chars = raw.split("");
  const mask = (node: ts.Node): void => {
    if (node !== body && (ts.isFunctionLike(node) || ts.isClassLike(node))) {
      const from = Math.max(0, node.getStart(file) - start);
      const to = Math.min(chars.length, node.end - start);
      const blanked = blankPreservingLines(raw.slice(from, to));
      for (let i = from; i < to; i += 1) chars[i] = blanked[i - from] ?? " ";
      return;
    }
    ts.forEachChild(node, mask);
  };
  mask(body);
  return chars.join("");
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
    texts.push(callableTextWithoutNestedBodies(callableBody, resolved.file));

    const visit = (node: ts.Node): void => {
      if (node !== callableBody && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
      if (ts.isCallExpression(node)) {
        const identifier = calleeIdentifier(node.expression);
        const binding = identifier === null ? null : importBinding(identifier, resolved.file);
        calls.push({
          name: callName(node),
          importedFrom: binding?.importedFrom ?? null,
          importedName: binding?.importedName ?? null,
          start: node.getStart(resolved.file),
          end: node.end,
          awaited: ts.isAwaitExpression(node.parent),
          argumentCount: node.arguments.length,
        });
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

function awaitedBareSpineCall(
  statement: ts.Statement,
  file: ts.SourceFile,
): "requireFirmScope" | "firmScopeGuard" | null {
  let expression: ts.Expression | undefined;
  if (ts.isExpressionStatement(statement)) expression = statement.expression;
  else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    expression = statement.declarationList.declarations[0]?.initializer;
  }
  if (expression === undefined || !ts.isAwaitExpression(expression)) return null;
  const call = expression.expression;
  if (!ts.isCallExpression(call) || call.arguments.length !== 0 || !ts.isIdentifier(call.expression)) return null;
  const binding = importBinding(call.expression, file);
  return binding?.importedFrom === "@/lib/require-firm-scope"
      && (binding.importedName === "requireFirmScope" || binding.importedName === "firmScopeGuard")
    ? binding.importedName
    : null;
}

function hasAbruptCompletion(block: ts.Block): boolean {
  let abrupt = false;
  const visit = (node: ts.Node): void => {
    if (node !== block && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)
        || ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
      abrupt = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(block);
  return abrupt;
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
  const direct = awaitedBareSpineCall(first, resolved.file);
  if (direct !== null) return { inspectable: true, call: direct, dominates: true, reason: "proved" };
  if (ts.isTryStatement(first) && first.catchClause === undefined && first.tryBlock.statements.length > 0) {
    const inTry = awaitedBareSpineCall(first.tryBlock.statements[0] as ts.Statement, resolved.file);
    if (inTry !== null && (first.finallyBlock === undefined || !hasAbruptCompletion(first.finallyBlock))) {
      return { inspectable: true, call: inTry, dominates: true, reason: "proved through a non-swallowing try/finally" };
    }
    if (inTry !== null) {
      return {
        inspectable: true,
        call: inTry,
        dominates: false,
        reason: `unmodelled: abrupt finally can override the guard denial at ${diagnosticLocation(resolved.file, first.finallyBlock?.getStart(resolved.file) ?? first.getStart(resolved.file))}`,
      };
    }
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

function literalIsDeeplyImmutable(expression: ts.Expression): boolean {
  let value = expression;
  while (ts.isParenthesizedExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression;
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
      || ts.isNumericLiteral(value) || ts.isBigIntLiteral(value)
      || value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword
      || value.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isPrefixUnaryExpression(value)
      && (value.operator === ts.SyntaxKind.PlusToken || value.operator === ts.SyntaxKind.MinusToken)
      && ts.isNumericLiteral(value.operand)) return true;
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.every((element) => !ts.isSpreadElement(element) && literalIsDeeplyImmutable(element as ts.Expression));
  }
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.every((property) => ts.isPropertyAssignment(property)
      && !ts.isComputedPropertyName(property.name)
      && literalIsDeeplyImmutable(property.initializer));
  }
  return false;
}

function immutableInitializer(initializer: ts.Expression, file: ts.SourceFile): boolean {
  if (ts.isAsExpression(initializer) && /\bas\s+const\s*$/.test(initializer.getText(file))) {
    return literalIsDeeplyImmutable(initializer.expression);
  }
  return ts.isCallExpression(initializer)
    && ts.isPropertyAccessExpression(initializer.expression)
    && ts.isIdentifier(initializer.expression.expression)
    && initializer.expression.expression.text === "Object"
    && initializer.expression.name.text === "freeze"
    && initializer.arguments.length === 1
    && literalIsDeeplyImmutable(initializer.arguments[0] as ts.Expression);
}

function mutableInitializer(initializer: ts.Expression, file: ts.SourceFile): string | null {
  if (immutableInitializer(initializer, file)) return null;
  let value = initializer;
  while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression;
  if (ts.isNewExpression(value) && ts.isIdentifier(value.expression) && ["Map", "Set", "WeakMap", "WeakSet", "Array"].includes(value.expression.text)) {
    return `constructs mutable ${value.expression.text}`;
  }
  if (ts.isNewExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === "Proxy") {
    return "constructs mutable Proxy";
  }
  if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)
      && ts.isIdentifier(value.expression.expression) && value.expression.expression.text === "Object"
      && value.expression.name.text === "create") return "constructs a mutable Object.create container";
  if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)
      && ts.isIdentifier(value.expression.expression) && value.expression.expression.text === "Object"
      && value.expression.name.text === "freeze") return "uses shallow Object.freeze over an unproved nested value";
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.length > 0 ? "holds a populated mutable object literal" : "holds an empty mutable object literal";
  }
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.length > 0 ? "holds a populated mutable array literal" : "holds an empty mutable array literal";
  }
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
  const at = (node: ts.Node): string => diagnosticLocation(collected.file, node.getStart(collected.file));
  const globalRoot = (expression: ts.Expression): boolean => {
    let value = expression;
    while (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression;
    if (ts.isIdentifier(value)) return value.text === "globalThis";
    if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) return globalRoot(value.expression);
    return false;
  };
  const visitGlobals = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        && globalRoot(node.left as ts.Expression)) {
      hazards.push(`globalThis: durable global store at ${at(node)}`);
    }
    ts.forEachChild(node, visitGlobals);
  };
  visitGlobals(collected.file);
  const moduleDecls = collected.declarations.filter((decl) => decl.scopeStart === 0 && decl.scopeEnd === collected.file.end);
  for (const decl of moduleDecls) {
    const reason = allowlist.get(decl.name);
    if (reason !== undefined) {
      if (reason.trim().length < 40) hazards.push(`${decl.name}: allowlist reason is too thin to prove safety`);
      continue;
    }
    if (decl.kind === "let" || decl.kind === "var") hazards.push(`${decl.kind} ${decl.name}: mutable module binding at ${at(decl.node)}`);
    else if (decl.kind === "static-field") hazards.push(`${decl.name}: class static field outlives requests at ${at(decl.node)}`);
    else if (decl.kind === "static-block") {
      let hasCall = false;
      const findCall = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) hasCall = true;
        ts.forEachChild(node, findCall);
      };
      findCall(decl.node);
      if (hasCall) hazards.push(`${decl.name}: unmodelled call in class static block at ${at(decl.node)}`);
      else if (/\b(?:this|[A-Za-z_$][\w$]*)\s*(?:\.|\[)/.test(decl.body) || /=/.test(decl.body)) {
        hazards.push(`${decl.name}: class static block writes module state at ${at(decl.node)}`);
      }
    } else if (decl.kind === "const" && ts.isVariableDeclaration(decl.node) && decl.node.initializer !== undefined) {
      const hazard = mutableInitializer(decl.node.initializer, collected.file);
      if (hazard !== null) hazards.push(`${decl.name}: ${hazard} at ${at(decl.node)}`);
      else if (mutated.has(decl.name)) hazards.push(`${decl.name}: module container is mutated after declaration at ${at(decl.node)}`);
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

function stringArgument(expression: ts.Expression | undefined, context: string, file: ts.SourceFile): string {
  if (expression !== undefined && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) return expression.text;
  throw new Error(
    `unmodelled: dynamic method/path in ${context} at ${diagnosticLocation(file, expression?.getStart(file) ?? 0)}`,
  );
}

const CAPABILITY_IMPORT = "../lib/intake.mjs";

function flattenHandlers(nodes: readonly ts.Expression[], file: ts.SourceFile): ts.Expression[] {
  const handlers: ts.Expression[] = [];
  for (const node of nodes) {
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) {
          throw new Error(`unmodelled: spread handler array at ${diagnosticLocation(file, element.getStart(file))}`);
        }
        handlers.push(...flattenHandlers([element as ts.Expression], file));
      }
    } else if (ts.isSpreadElement(node)) {
      throw new Error(`unmodelled: spread handler array at ${diagnosticLocation(file, node.getStart(file))}`);
    } else handlers.push(node);
  }
  return handlers;
}

function containsImportedBearer(handler: ts.Expression, file: ts.SourceFile): boolean {
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return false;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (node !== handler && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const binding = importBinding(node.expression, file);
      if (binding?.importedFrom === CAPABILITY_IMPORT && binding.importedName === "bearerCapability") found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(handler);
  return found;
}

function recognisedNoOp(handler: ts.Expression): boolean {
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return false;
  const next = handler.parameters.at(-1)?.name;
  if (next === undefined || !ts.isIdentifier(next)) return false;
  const isNext = (expression: ts.Expression): boolean => ts.isCallExpression(expression)
    && expression.arguments.length === 0 && ts.isIdentifier(expression.expression)
    && expression.expression.text === next.text;
  if (!ts.isBlock(handler.body)) return isNext(handler.body);
  if (handler.body.statements.length !== 1) return false;
  const statement = handler.body.statements[0] as ts.Statement;
  return (ts.isExpressionStatement(statement) && isNext(statement.expression))
    || (ts.isReturnStatement(statement) && statement.expression !== undefined && isNext(statement.expression));
}

function capabilityProof(handlersRaw: readonly ts.Expression[], file: ts.SourceFile, site: ts.CallExpression): boolean {
  const handlers = flattenHandlers(handlersRaw, file);
  const capabilityAt = handlers.findIndex((handler) => containsImportedBearer(handler, file));
  if (capabilityAt < 0) return false;
  if (handlers.slice(0, capabilityAt).some((handler) => !recognisedNoOp(handler))) {
    throw new Error(`unmodelled: handler before capability at ${diagnosticLocation(file, site.getStart(file))}`);
  }
  return true;
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
  const unmodelledRegistration = (node: ts.CallExpression, shape: string): never => {
    throw new Error(`unmodelled: unmodelled registration ${shape} at ${diagnosticLocation(file, node.getStart(file))}`);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression;
        const method = node.expression.name.text.toLowerCase();
        const literalPath = node.arguments[0] !== undefined
          && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]));
        if (method === "route" && ts.isIdentifier(receiver) && receiver.text === "router") {
          unmodelledRegistration(node, "router.route(…)");
        }
        if (ROUTE_METHODS.has(method) && !(ts.isIdentifier(receiver) && receiver.text === "router")
            && (ts.isCallExpression(receiver) || literalPath)) {
          unmodelledRegistration(node, `${receiver.getText(file)}.${method}(…)`);
        }
        if (method === "use" && literalPath && node.arguments.slice(1).some((argument) => ts.isIdentifier(argument))) {
          unmodelledRegistration(node, `${receiver.getText(file)}.use(…, child)`);
        }
      } else if (ts.isIdentifier(node.expression) && node.arguments[0] !== undefined
          && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text !== "router"
          && node.arguments[1] !== undefined && ts.isStringLiteralLike(node.arguments[1])
          && ROUTE_METHODS.has(node.arguments[1].text.toLowerCase())
          && node.arguments[2] !== undefined && ts.isStringLiteralLike(node.arguments[2])) {
        unmodelledRegistration(node, `${node.expression.text}(${node.arguments[0].text}, …)`);
      }
      if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
          && node.expression.expression.text === "router") {
        const method = node.expression.name.text.toLowerCase();
        if (method === "use") {
          ts.forEachChild(node, visit);
          return;
        }
        if (!ROUTE_METHODS.has(method)) unmodelledRegistration(node, `router.${method}(…)`);
        const path = stringArgument(node.arguments[0], `router.${method}`, file);
        if (node.arguments.length < 2) unmodelledRegistration(node, `router.${method}("${path}") without a handler`);
        routes.push({
          call: routeCall(method, path),
          capability: capabilityProof(node.arguments.slice(1), file, node),
          shape: "router-method",
        });
      } else {
        const routerArg = node.arguments.find((argument) => ts.isIdentifier(argument) && argument.text === "router");
        if (routerArg !== undefined) {
          if (!ts.isIdentifier(node.expression) || node.expression.text !== "register" || node.arguments[0] !== routerArg) {
            unmodelledRegistration(node, `${node.expression.getText(file)}(router, …)`);
          }
          const method = stringArgument(node.arguments[1], "register(router, method)", file).toLowerCase();
          if (!ROUTE_METHODS.has(method)) unmodelledRegistration(node, `register(router, "${method}", …)`);
          const path = stringArgument(node.arguments[2], `register(router, "${method}", path)`, file);
          if (node.arguments.length < 4) unmodelledRegistration(node, `register(router, "${method}", "${path}") without a handler`);
          routes.push({
            call: routeCall(method, path),
            capability: capabilityProof(node.arguments.slice(3), file, node),
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
