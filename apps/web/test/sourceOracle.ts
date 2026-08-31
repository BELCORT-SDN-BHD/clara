// SOURCE ORACLE — AST-backed instruments for the scope-spine suites.
//
// These helpers are judgement logic: they decide whether a request entrance
// executes a guard, whether a route registration carries a capability check, and
// whether module state can outlive a request. Keep them in test code. Product code
// must never take a dependency on the TypeScript compiler.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";

export type SourceUnit = {
  readonly path: string;
  readonly code: string;
};

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

function scriptKind(path: string): ts.ScriptKind {
  const extension = /(?:\.([^.\\/]+))$/u.exec(path)?.[1]?.toLowerCase();
  if (extension === "ts" || extension === "mts" || extension === "cts") return ts.ScriptKind.TS;
  if (extension === "tsx") return ts.ScriptKind.TSX;
  if (extension === "js" || extension === "mjs" || extension === "cjs") return ts.ScriptKind.JS;
  if (extension === "jsx") return ts.ScriptKind.JSX;
  throw new Error(`unmodelled: unsupported source extension at ${path}`);
}

function sourceFile(unit: SourceUnit): ts.SourceFile {
  const kind = scriptKind(unit.path);
  const file = ts.createSourceFile(unit.path, unit.code, ts.ScriptTarget.Latest, true, kind);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    jsx: ts.JsxEmit.Preserve,
    allowJs: kind === ts.ScriptKind.JS || kind === ts.ScriptKind.JSX,
    noLib: true,
    noResolve: true,
  };
  const host = ts.createCompilerHost(options, true);
  host.getSourceFile = (fileName) => fileName === file.fileName ? file : undefined;
  host.fileExists = (fileName) => fileName === file.fileName;
  host.readFile = (fileName) => fileName === file.fileName ? unit.code : undefined;
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
  const validated = (binding: ImportBinding): ImportBinding => {
    if (SPINE_NAMES.has(binding.importedName) && binding.importedFrom !== SPINE_IMPORT) {
      throw new Error(`unmodelled: unresolvable spine import identity at ${diagnosticLocation(file, identifier.getStart(file))}`);
    }
    return binding;
  };
  for (const declaration of symbol?.declarations ?? []) {
    if (ts.isImportSpecifier(declaration)) {
      const importDeclaration = declaration.parent.parent.parent;
      if (!ts.isImportDeclaration(importDeclaration) || !ts.isStringLiteral(importDeclaration.moduleSpecifier)) continue;
      if (declaration.isTypeOnly || importDeclaration.importClause?.isTypeOnly === true) {
        throw new Error(`unmodelled: type-only import of the spine at ${diagnosticLocation(file, declaration.getStart(file))}`);
      }
      return validated({
        importedFrom: importDeclaration.moduleSpecifier.text,
        importedName: declaration.propertyName?.text ?? declaration.name.text,
      });
    }
    if (ts.isImportClause(declaration) && declaration.name?.text === identifier.text) {
      const importDeclaration = declaration.parent;
      if (!ts.isStringLiteral(importDeclaration.moduleSpecifier)) continue;
      if (declaration.isTypeOnly) {
        throw new Error(`unmodelled: type-only import of the spine at ${diagnosticLocation(file, declaration.getStart(file))}`);
      }
      return validated({ importedFrom: importDeclaration.moduleSpecifier.text, importedName: "default" });
    }
    if (ts.isNamespaceImport(declaration)) {
      const importDeclaration = declaration.parent.parent;
      if (!ts.isImportDeclaration(importDeclaration) || !ts.isStringLiteral(importDeclaration.moduleSpecifier)) continue;
      if (importDeclaration.importClause?.isTypeOnly === true) {
        throw new Error(`unmodelled: type-only import of the spine at ${diagnosticLocation(file, declaration.getStart(file))}`);
      }
      return validated({ importedFrom: importDeclaration.moduleSpecifier.text, importedName: "*" });
    }
  }
  const dynamicBinding = (symbol?.declarations ?? []).some((declaration) => {
    if (!ts.isBindingElement(declaration)) return false;
    const variable = declaration.parent.parent;
    if (!ts.isVariableDeclaration(variable) || variable.initializer === undefined) return false;
    let initializer = variable.initializer;
    if (ts.isAwaitExpression(initializer)) initializer = initializer.expression;
    return ts.isCallExpression(initializer) && initializer.expression.kind === ts.SyntaxKind.ImportKeyword;
  });
  if (dynamicBinding || (symbol === undefined && SPINE_NAMES.has(identifier.text))) {
    throw new Error(`unmodelled: unresolvable spine import identity at ${diagnosticLocation(file, identifier.getStart(file))}`);
  }
  return null;
}

const SPINE_IMPORT = "@/lib/require-firm-scope";
const SPINE_NAMES = new Set(["requireFirmScope", "firmScopeGuard", "resolveFirmScope"]);

function spineBinding(identifier: ts.Identifier, file: ts.SourceFile): ImportBinding | null {
  const binding = importBinding(identifier, file);
  if (binding?.importedFrom === SPINE_IMPORT && SPINE_NAMES.has(binding.importedName)) return binding;
  return null;
}

function unwrappedExpression(expression: ts.Expression): ts.Expression {
  let value = expression;
  while (ts.isParenthesizedExpression(value) || ts.isAsExpression(value)
      || ts.isSatisfiesExpression(value) || ts.isNonNullExpression(value)
      || ts.isTypeAssertionExpression(value)) value = value.expression;
  return value;
}

type MemberAccess = { readonly receiver: ts.Expression; readonly member: string | null };

function memberAccess(expression: ts.Expression): MemberAccess | null {
  const value = unwrappedExpression(expression);
  if (ts.isPropertyAccessExpression(value)) return { receiver: value.expression, member: value.name.text };
  if (!ts.isElementAccessExpression(value)) return null;
  return {
    receiver: value.expression,
    member: value.argumentExpression !== undefined && ts.isStringLiteralLike(value.argumentExpression)
      ? value.argumentExpression.text
      : null,
  };
}

function dynamicImportSource(expression: ts.Expression): string | null {
  let value = unwrappedExpression(expression);
  if (ts.isAwaitExpression(value)) value = unwrappedExpression(value.expression);
  return ts.isCallExpression(value) && value.expression.kind === ts.SyntaxKind.ImportKeyword
      && value.arguments.length === 1 && ts.isStringLiteralLike(value.arguments[0] as ts.Expression)
    ? (value.arguments[0] as ts.StringLiteralLike).text
    : null;
}

function namespaceSource(identifier: ts.Identifier, file: ts.SourceFile): string | null {
  const binding = importBinding(identifier, file);
  if (binding?.importedName === "*") return binding.importedFrom;
  const symbol = checkerFor(file).getSymbolAtLocation(identifier);
  for (const declaration of symbol?.declarations ?? []) {
    if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) continue;
    const source = dynamicImportSource(declaration.initializer);
    if (source !== null) return source;
  }
  return null;
}

function assertResolvableSpineCallee(expression: ts.Expression, file: ts.SourceFile): void {
  const value = unwrappedExpression(expression);
  const access = memberAccess(value);
  if (access === null) return;
  const root = unwrappedExpression(access.receiver);
  const source = ts.isIdentifier(root) ? namespaceSource(root, file) : dynamicImportSource(root);
  if (source === SPINE_IMPORT && (access.member === null || SPINE_NAMES.has(access.member))) {
    throw new Error(`unmodelled: unresolvable spine import identity at ${diagnosticLocation(file, value.getStart(file))}`);
  }
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
export function stripComments(unit: SourceUnit, opts: StripOptions = {}): SourceUnit {
  const src = unit.code;
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const kind = scriptKind(unit.path);
  const variant = kind === ts.ScriptKind.TSX || kind === ts.ScriptKind.JSX ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, variant, src);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const start = scanner.getTokenPos();
      const end = scanner.getTextPos();
      replacements.push({ start, end, text: blankPreservingLines(src.slice(start, end)) });
    }
  }

  if (opts.blankStrings === true) {
    const file = sourceFile(unit);
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
  return { ...unit, code: chars.join("") };
}

export function readCode(path: string, opts: StripOptions = {}): SourceUnit {
  return stripComments({ path, code: readFileSync(path, "utf8") }, opts);
}

/** A `page`/`route` leaf the App Router serves. FS-4's design (`checkout-gate-design-part3.md`
 *  §4.2, W-R-1) requires this regex to be importable from here rather than living
 *  unexported inside the census test module — a second suite (its own transport
 *  cell) needs the identical definition, and re-declaring it would let the two
 *  drift. Route Handlers and pages are the only two LEAF kinds; every other
 *  App-Router special file (`layout`, `template`, `default`, `loading`, `error`,
 *  `global-error`, `not-found`) is deliberately NOT a LEAF — a request runs one
 *  execution root per LEAF, but those special files run ALONGSIDE it, which is
 *  exactly the fourth-entrance gap this file's own callers close. */
export const LEAF = /^(page|route)\.(ts|tsx|js|jsx)$/;

export type RouteLeaf = { readonly file: string; readonly url: string };

/**
 * Every LEAF file under `dir`, each paired with the URL path segments it answers
 * on. `file` is reported relative to `webRoot` (forward-slash separated, matching
 * every caller's own path convention).
 *
 * Route groups `(x)`, parallel slots `@x`, and private folders `_x` contribute NO
 * URL segment — that is what makes a group a group, and it is exactly why a check
 * in one group's layout does not cover a sibling's.
 */
export function routeLeaves(
  webRoot: string,
  dir: string = webRoot,
  segments: readonly string[] = [],
  out: RouteLeaf[] = [],
): RouteLeaf[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) continue;
      const isGroup = (entry.name.startsWith("(") && entry.name.endsWith(")")) || entry.name.startsWith("@");
      routeLeaves(webRoot, abs, isGroup ? segments : [...segments, entry.name], out);
    } else if (entry.isFile() && LEAF.test(entry.name)) {
      out.push({ file: relative(webRoot, abs).split(sep).join("/"), url: `/${segments.join("/")}` });
    }
  }
  return out;
}

/** Index after the syntactic construct that opens at `{`, `(` or `[`. The AST
 * supplies the range when possible; the fallback balances a literal-masked view. */
export function matchBlock(unit: SourceUnit, open: number): number {
  const src = unit.code;
  const opener = src[open];
  const closer = opener === "{" ? "}" : opener === "(" ? ")" : opener === "[" ? "]" : null;
  if (closer === null) return -1;
  const file = sourceFile(unit);
  let best: ts.Node | null = null;
  const visit = (node: ts.Node): void => {
    const start = node.getStart(file);
    if (start === open && src[node.end - 1] === closer && (best === null || node.end < best.end)) best = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  const matched = best as ts.Node | null;
  if (matched !== null) return matched.end;

  const code = stripComments(unit, { blankStrings: true }).code;
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

function collectDeclarations(unit: SourceUnit): { file: ts.SourceFile; declarations: InternalDecl[] } {
  const file = sourceFile(unit);
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
export function moduleLevelDeclarations(unit: SourceUnit): Decl[] {
  const collected = collectDeclarations(unit);
  return collected.declarations
    .filter((decl) => decl.scopeStart === 0 && decl.scopeEnd === collected.file.end)
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

function exportTargets(unit: SourceUnit): Map<string, ExportTarget> {
  const file = sourceFile(unit);
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

  const exportsObject = (expression: ts.Expression): boolean => {
    const value = unwrappedExpression(expression);
    if (ts.isIdentifier(value)) return value.text === "exports";
    if (ts.isPropertyAccessExpression(value)) {
      return ts.isIdentifier(value.expression) && value.expression.text === "module"
        && value.name.text === "exports";
    }
    return ts.isElementAccessExpression(value) && ts.isIdentifier(value.expression)
      && value.expression.text === "module" && value.argumentExpression !== undefined
      && ts.isStringLiteralLike(value.argumentExpression) && value.argumentExpression.text === "exports";
  };
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (exportsObject(node.left as ts.Expression)
          || ((ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
            && exportsObject(node.left.expression))) {
        uninspectable(node, ts.isElementAccessExpression(node.left)
          ? "computed CommonJS export assignment"
          : "CommonJS export assignment");
        return;
      }
    }
    const callee = ts.isCallExpression(node) ? memberAccess(node.expression) : null;
    if (ts.isCallExpression(node) && callee !== null
        && ts.isIdentifier(unwrappedExpression(callee.receiver))
        && (unwrappedExpression(callee.receiver) as ts.Identifier).text === "Object"
        && callee.member === "defineProperty" && node.arguments[0] !== undefined
        && exportsObject(node.arguments[0] as ts.Expression)) {
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
function assertInspectableExports(targets: ReadonlyMap<string, ExportTarget>): void {
  const reason = [...targets.values()].find((target) => target.reason !== null)?.reason;
  if (reason !== null && reason !== undefined) throw new Error(reason);
}

export function exportClauseAliases(unit: SourceUnit): Map<string, string> {
  const aliases = new Map<string, string>();
  const targets = exportTargets(unit);
  assertInspectableExports(targets);
  for (const [name, target] of targets) aliases.set(name, target.local ?? "");
  return aliases;
}

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export function exportedHttpMethods(unit: SourceUnit): string[] {
  const methods = new Set<string>(HTTP_METHODS);
  const found: Array<{ name: string; start: number }> = [];
  for (const decl of collectDeclarations(unit).declarations) {
    if (decl.exported && !decl.isDefault && methods.has(decl.name)) found.push({ name: decl.name, start: decl.start });
  }
  const targets = exportTargets(unit);
  assertInspectableExports(targets);
  for (const [name] of targets) if (methods.has(name)) found.push({ name, start: Number.MAX_SAFE_INTEGER });
  return [...new Set(found.sort((a, b) => a.start - b.start).map((item) => item.name))];
}

export function defaultExportName(unit: SourceUnit): string | null {
  const declarations = collectDeclarations(unit).declarations;
  const targets = exportTargets(unit);
  assertInspectableExports(targets);
  const direct = declarations.find((decl) => decl.isDefault);
  if (direct !== undefined) return direct.name;
  return targets.get("default")?.local ?? null;
}

function resolveName(declarations: InternalDecl[], name: string, at: number): InternalDecl | null {
  const candidates = declarations.filter(
    (decl) => decl.name === name && decl.scopeStart <= at && decl.scopeEnd >= at,
  );
  return candidates.sort((a, b) => (a.scopeEnd - a.scopeStart) - (b.scopeEnd - b.scopeStart) || b.start - a.start)[0] ?? null;
}

function resolveRoot(unit: SourceUnit, rootName: string): { file: ts.SourceFile; declarations: InternalDecl[]; root: InternalDecl | null; reason: string | null } {
  const collected = collectDeclarations(unit);
  const targets = exportTargets(unit);
  assertInspectableExports(targets);
  const target = targets.get(rootName);
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

function calleeIdentifier(expression: ts.Expression, file: ts.SourceFile): ts.Identifier | null {
  assertResolvableSpineCallee(expression, file);
  const value = unwrappedExpression(expression);
  if (ts.isIdentifier(value)) return value;
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

function reachableGraph(unit: SourceUnit, rootName: string): { texts: string[]; calls: ReachableCall[]; reason: string | null } {
  const resolved = resolveRoot(unit, rootName);
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
        const identifier = calleeIdentifier(node.expression, resolved.file);
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
export function reachableFrom(unit: SourceUnit, rootName: string): string | null {
  const graph = reachableGraph(unit, rootName);
  return graph.reason === null
    ? stripComments({ path: unit.path, code: graph.texts.join("\n") }, { blankStrings: true }).code
    : null;
}

export function reachableCallsFrom(unit: SourceUnit, rootName: string): readonly ReachableCall[] {
  return reachableGraph(unit, rootName).calls;
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
  if (!ts.isCallExpression(call) || call.arguments.length !== 0) return null;
  const identifier = calleeIdentifier(call.expression, file);
  if (identifier === null) return null;
  const binding = spineBinding(identifier, file);
  return binding?.importedFrom === "@/lib/require-firm-scope"
      && (binding.importedName === "requireFirmScope" || binding.importedName === "firmScopeGuard")
    ? binding.importedName
    : null;
}

function hasAbruptCompletion(block: ts.Block): boolean {
  let abrupt = false;
  const transferEscapes = (node: ts.BreakStatement | ts.ContinueStatement): boolean => {
    const label = node.label?.text;
    for (let current = node.parent; current !== undefined; current = current.parent) {
      if (current === block) return true;
      if (label !== undefined && ts.isLabeledStatement(current) && current.label.text === label) return false;
      if (label === undefined) {
        const loop = ts.isForStatement(current) || ts.isForInStatement(current)
          || ts.isForOfStatement(current) || ts.isWhileStatement(current) || ts.isDoStatement(current);
        if (loop || (ts.isBreakStatement(node) && ts.isSwitchStatement(current))) return false;
      }
    }
    return true;
  };
  const visit = (node: ts.Node): void => {
    if (node !== block && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
      abrupt = true;
      return;
    }
    if ((ts.isBreakStatement(node) || ts.isContinueStatement(node)) && transferEscapes(node)) {
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
export function spineGuardProof(unit: SourceUnit, rootName: string): SpineGuardProof {
  const resolved = resolveRoot(unit, rootName);
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

/** Prove a returned API refusal is the `.response` of the exact value produced by
 * the canonical `firmScopeGuard` import. Variable spelling is deliberately not
 * evidence: both the import and bound result are resolved by symbol identity. */
export function spineGuardResponseIsReturned(unit: SourceUnit, rootName: string): boolean {
  const resolved = resolveRoot(unit, rootName);
  const body = resolved.root?.callable?.body;
  if (body === undefined || !ts.isBlock(body)) return false;
  const checker = checkerFor(resolved.file);
  let resultSymbol: ts.Symbol | undefined;
  for (const statement of body.statements) {
    if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) continue;
    const declaration = statement.declarationList.declarations[0];
    if (declaration === undefined || !ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
    const initializer = unwrappedExpression(declaration.initializer);
    if (!ts.isAwaitExpression(initializer)) continue;
    const call = unwrappedExpression(initializer.expression);
    if (!ts.isCallExpression(call) || call.arguments.length !== 0) continue;
    const identifier = calleeIdentifier(call.expression, resolved.file);
    if (identifier === null || spineBinding(identifier, resolved.file)?.importedName !== "firmScopeGuard") continue;
    resultSymbol = checker.getSymbolAtLocation(declaration.name);
    break;
  }
  if (resultSymbol === undefined) return false;
  const boundProperty = (expression: ts.Expression, property: string): boolean => {
    const value = unwrappedExpression(expression);
    if (!ts.isPropertyAccessExpression(value) || value.name.text !== property) return false;
    const receiver = unwrappedExpression(value.expression);
    return ts.isIdentifier(receiver) && checker.getSymbolAtLocation(receiver) === resultSymbol;
  };
  const returnsResponse = (statement: ts.Statement): boolean => {
    if (ts.isReturnStatement(statement)) {
      return statement.expression !== undefined && boundProperty(statement.expression, "response");
    }
    return ts.isBlock(statement) && statement.statements.some(returnsResponse);
  };
  return body.statements.some((statement) => ts.isIfStatement(statement)
    && ts.isPrefixUnaryExpression(statement.expression)
    && statement.expression.operator === ts.SyntaxKind.ExclamationToken
    && boundProperty(statement.expression.operand, "ok")
    && returnsResponse(statement.thenStatement));
}

/** Ranges of try blocks whose catch can swallow a throw. Finally-only tries are
 * deliberately absent. */
export function tryBlockRanges(unit: SourceUnit): [number, number][] {
  const file = sourceFile(unit);
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
    const value = unwrappedExpression(expression);
    if (ts.isIdentifier(value)) return value.text;
    if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) return rootIdentifier(value.expression);
    return null;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const name = rootIdentifier(node.left as ts.Expression);
      if (name !== null) names.add(name);
    } else if (ts.isCallExpression(node)) {
      const access = memberAccess(node.expression);
      const name = access === null ? null : rootIdentifier(access.receiver);
      if (name !== null && access !== null
          && (access.member === null || MUTATING_METHODS.has(access.member))) names.add(name);
      const receiver = access === null ? null : unwrappedExpression(access.receiver);
      if (receiver !== null && ts.isIdentifier(receiver) && receiver.text === "Object"
          && access?.member === "assign" && node.arguments[0] !== undefined) {
        const assigned = rootIdentifier(node.arguments[0]);
        if (assigned !== null) names.add(assigned);
      }
    } else if (ts.isDeleteExpression(node)) {
      const name = rootIdentifier(node.expression);
      if (name !== null) names.add(name);
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
export function moduleStateHazards(unit: SourceUnit, allowlist: ReadonlyMap<string, string> = new Map()): string[] {
  const collected = collectDeclarations(unit);
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
    const unit = { path: `${webRoot}/${file}`, code: readFileSync(`${webRoot}/${file}`, "utf8") };
    return {
      file,
      declarationCount: moduleLevelDeclarations(unit).length,
      hazards: moduleStateHazards(unit, SCOPE_SPINE_ALLOWLISTS.get(file)),
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
const RESPONSE_HELPER_NAMES = new Set(["sendError"]);
const RESPONSE_TERMINAL_METHODS = new Set(["download", "end", "json", "redirect", "send", "sendFile", "sendStatus"]);
const RESPONSE_CHAIN_METHODS = new Set(["attachment", "cookie", "header", "links", "location", "set", "setHeader", "status", "type", "vary"]);

function responseValue(expression: ts.Expression): boolean {
  const value = unwrappedExpression(expression);
  if (ts.isIdentifier(value) || ts.isLiteralExpression(value)
      || ts.isNoSubstitutionTemplateLiteral(value)
      || value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword
      || value.kind === ts.SyntaxKind.NullKeyword) return true;
  const propertyRead = (candidate: ts.Expression): boolean => {
    const target = unwrappedExpression(candidate);
    if (ts.isIdentifier(target)) return true;
    if (ts.isPropertyAccessExpression(target)) return propertyRead(target.expression);
    return ts.isElementAccessExpression(target) && target.argumentExpression !== undefined
      && (ts.isStringLiteralLike(target.argumentExpression) || ts.isNumericLiteral(target.argumentExpression))
      && propertyRead(target.expression);
  };
  if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) return propertyRead(value);
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.every((element) => ts.isOmittedExpression(element)
      || (!ts.isSpreadElement(element) && responseValue(element as ts.Expression)));
  }
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.every((property) => {
      if (ts.isShorthandPropertyAssignment(property)) return true;
      return ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)
        && responseValue(property.initializer);
    });
  }
  return false;
}

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

function isFalseLiteral(expression: ts.Expression): boolean {
  return expression.kind === ts.SyntaxKind.FalseKeyword
    || (ts.isParenthesizedExpression(expression) && isFalseLiteral(expression.expression));
}

function isTrueLiteral(expression: ts.Expression): boolean {
  return expression.kind === ts.SyntaxKind.TrueKeyword
    || (ts.isParenthesizedExpression(expression) && isTrueLiteral(expression.expression));
}

function passiveExpression(expression: ts.Expression, file: ts.SourceFile): boolean {
  const value = unwrappedExpression(expression);
  if (ts.isIdentifier(value) || ts.isLiteralExpression(value)
      || value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword
      || value.kind === ts.SyntaxKind.NullKeyword || value.kind === ts.SyntaxKind.RegularExpressionLiteral) return true;
  if (ts.isPropertyAccessExpression(value)) return passiveExpression(value.expression, file);
  if (ts.isElementAccessExpression(value)) {
    return passiveExpression(value.expression, file)
      && (value.argumentExpression === undefined || passiveExpression(value.argumentExpression, file));
  }
  if (ts.isPrefixUnaryExpression(value)) {
    return value.operator !== ts.SyntaxKind.PlusPlusToken && value.operator !== ts.SyntaxKind.MinusMinusToken
      && passiveExpression(value.operand, file);
  }
  if (ts.isTypeOfExpression(value)) return passiveExpression(value.expression, file);
  if (ts.isBinaryExpression(value)) {
    if (value.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && value.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return false;
    return passiveExpression(value.left, file) && passiveExpression(value.right, file);
  }
  if (!ts.isCallExpression(value)) return false;
  if (!value.arguments.every((argument) => passiveExpression(argument, file))) return false;
  if (ts.isIdentifier(value.expression)) {
    const symbol = checkerFor(file).getSymbolAtLocation(value.expression);
    if (symbol === undefined && ["Boolean", "Number", "String"].includes(value.expression.text)) return true;
    const declaration = symbol?.declarations?.find(ts.isFunctionDeclaration);
    if (declaration?.body === undefined) return false;
    let active = false;
    const inspect = (node: ts.Node): void => {
      if (node !== declaration.body && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
      if (ts.isAwaitExpression(node) || ts.isNewExpression(node)
          || ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)
          || (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
            && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment)) active = true;
      if (ts.isCallExpression(node)) {
        if (!ts.isIdentifier(node.expression)) active = true;
        else {
          const called = checkerFor(file).getSymbolAtLocation(node.expression);
          if (called !== undefined || !["Boolean", "Number", "String"].includes(node.expression.text)) active = true;
        }
      }
      ts.forEachChild(node, inspect);
    };
    inspect(declaration.body);
    return !active;
  }
  if (!ts.isPropertyAccessExpression(value.expression)) return false;
  const receiver = value.expression.expression;
  const method = value.expression.name.text;
  if (["toLowerCase", "replace", "trim"].includes(method)) return passiveExpression(receiver, file);
  if (method === "header" && ts.isIdentifier(receiver)) {
    return (checkerFor(file).getSymbolAtLocation(receiver)?.declarations ?? []).some(ts.isParameter);
  }
  if (method === "test" && ts.isIdentifier(receiver)) {
    const symbol = checkerFor(file).getSymbolAtLocation(receiver);
    return (symbol?.declarations ?? []).some((declaration) => {
      if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined
          || declaration.initializer.kind !== ts.SyntaxKind.RegularExpressionLiteral) return false;
      const raw = declaration.initializer.getText(file);
      const flags = raw.slice(raw.lastIndexOf("/") + 1);
      return !flags.includes("g") && !flags.includes("y");
    });
  }
  return false;
}

function statementDefinitelyTerminates(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some(statementDefinitelyTerminates);
  if (ts.isIfStatement(statement)) {
    if (isTrueLiteral(statement.expression)) return statementDefinitelyTerminates(statement.thenStatement);
    if (isFalseLiteral(statement.expression)) {
      return statement.elseStatement !== undefined && statementDefinitelyTerminates(statement.elseStatement);
    }
    return statement.elseStatement !== undefined
      && statementDefinitelyTerminates(statement.thenStatement)
      && statementDefinitelyTerminates(statement.elseStatement);
  }
  if (ts.isTryStatement(statement)) {
    if (statement.finallyBlock !== undefined && statementDefinitelyTerminates(statement.finallyBlock)) return true;
    const tryTerminates = statementDefinitelyTerminates(statement.tryBlock);
    return statement.catchClause === undefined
      ? tryTerminates
      : tryTerminates && statementDefinitelyTerminates(statement.catchClause.block);
  }
  return false;
}

/** A refusal-only conditional can precede the capability on the surviving path:
 * its taken path leaves the handler, and its fallthrough path has done no work. */
function terminatingPrelude(statement: ts.Statement, file: ts.SourceFile): boolean {
  return ts.isIfStatement(statement) && statement.elseStatement === undefined
    && passiveExpression(statement.expression, file)
    && statementDefinitelyTerminates(statement.thenStatement);
}

function passiveBindingPrelude(statement: ts.Statement, file: ts.SourceFile): boolean {
  if (!ts.isVariableStatement(statement)
      || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) return false;
  return statement.declarationList.declarations.every((declaration) =>
    declaration.initializer === undefined || passiveExpression(declaration.initializer, file));
}

function directBearerExpression(expression: ts.Expression, file: ts.SourceFile): boolean {
  let value = unwrappedExpression(expression);
  if (ts.isAwaitExpression(value)) value = unwrappedExpression(value.expression);
  if (!ts.isCallExpression(value)) return false;
  const identifier = calleeIdentifier(value.expression, file);
  if (identifier === null) return false;
  const binding = importBinding(identifier, file);
  return binding?.importedFrom === CAPABILITY_IMPORT && binding.importedName === "bearerCapability";
}

function directBearerStatement(statement: ts.Statement, file: ts.SourceFile): boolean {
  if (ts.isExpressionStatement(statement)) return directBearerExpression(statement.expression, file);
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) return false;
  const declaration = statement.declarationList.declarations[0];
  return declaration?.initializer !== undefined && directBearerExpression(declaration.initializer, file);
}

function responseOnlyCatch(
  catchClause: ts.CatchClause,
  handler: ts.ArrowFunction | ts.FunctionExpression,
  file: ts.SourceFile,
): boolean {
  const responseName = handler.parameters[1]?.name;
  if (responseName === undefined || !ts.isIdentifier(responseName) || catchClause.block.statements.length === 0) return false;
  const checker = checkerFor(file);
  const responseSymbol = checker.getSymbolAtLocation(responseName);
  if (responseSymbol === undefined) return false;
  const helperDeclarationRanges = new Set(file.statements
    .filter((statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name !== undefined
        && RESPONSE_HELPER_NAMES.has(statement.name.text))
    .map((declaration) => `${declaration.getStart(file)}:${declaration.end}`));
  const directResponse = (expression: ts.Expression, symbol = responseSymbol): boolean => {
    const value = unwrappedExpression(expression);
    return ts.isIdentifier(value) && checker.getSymbolAtLocation(value) === symbol;
  };
  const responseChain = (expression: ts.Expression, symbol: ts.Symbol): boolean => {
    const value = unwrappedExpression(expression);
    if (directResponse(value, symbol)) return true;
    if (!ts.isCallExpression(value)) return false;
    const access = memberAccess(value.expression);
    return access !== null && access.member !== null && RESPONSE_CHAIN_METHODS.has(access.member)
      && value.arguments.every(responseValue) && responseChain(access.receiver, symbol);
  };
  const terminalResponseCall = (call: ts.CallExpression, symbol: ts.Symbol): boolean => {
    const access = memberAccess(unwrappedExpression(call.expression));
    return access !== null && access.member !== null && RESPONSE_TERMINAL_METHODS.has(access.member)
      && call.arguments.every(responseValue) && responseChain(access.receiver, symbol);
  };
  // Response helpers are intentionally one hop: their own body may contain only
  // terminal response calls. A helper call from that body is active work.
  const responseHelperBody = (declaration: ts.FunctionDeclaration): boolean => {
    const helperResponse = declaration.parameters[0]?.name;
    if (declaration.body === undefined || helperResponse === undefined || !ts.isIdentifier(helperResponse)
        || declaration.body.statements.length === 0) return false;
    const helperResponseSymbol = checker.getSymbolAtLocation(helperResponse);
    if (helperResponseSymbol === undefined) return false;
    return declaration.body.statements.every((statement) => {
      const expression = ts.isExpressionStatement(statement)
        ? statement.expression
        : ts.isReturnStatement(statement) ? statement.expression : undefined;
      const value = expression === undefined ? undefined : unwrappedExpression(expression);
      return value !== undefined && ts.isCallExpression(value)
        && terminalResponseCall(value, helperResponseSymbol);
    });
  };
  const responseCall = (call: ts.CallExpression): boolean => {
    const callee = unwrappedExpression(call.expression);
    if (ts.isIdentifier(callee)) {
      const symbol = checker.getSymbolAtLocation(callee);
      const helper = (symbol?.declarations ?? []).find((declaration): declaration is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(declaration)
          && helperDeclarationRanges.has(`${declaration.getStart(declaration.getSourceFile())}:${declaration.end}`));
      return helper !== undefined && call.arguments[0] !== undefined
        && directResponse(call.arguments[0]) && call.arguments.every(responseValue)
        && responseHelperBody(helper);
    }
    return terminalResponseCall(call, responseSymbol);
  };
  return catchClause.block.statements.every((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(unwrappedExpression(statement.expression))
    && responseCall(unwrappedExpression(statement.expression) as ts.CallExpression));
}

function containsDominatingBearer(handler: ts.Expression, file: ts.SourceFile): boolean {
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return false;
  if (!ts.isBlock(handler.body)) return directBearerExpression(handler.body, file);
  const statements = handler.body.statements;
  let candidate = 0;
  while (candidate < statements.length
      && (terminatingPrelude(statements[candidate] as ts.Statement, file)
        || passiveBindingPrelude(statements[candidate] as ts.Statement, file))) candidate += 1;
  const first = statements[candidate];
  if (first === undefined) return false;
  if (ts.isTryStatement(first)) {
    const inTry = first.tryBlock.statements[0];
    if (inTry === undefined || !directBearerStatement(inTry, file)) return false;
    if (first.finallyBlock !== undefined && first.finallyBlock.statements.length > 0) return false;
    if (first.catchClause !== undefined && !responseOnlyCatch(first.catchClause, handler, file)) return false;
    // A caught denial may answer the request, but no fallthrough statement may do
    // work after the catch. The real intake handlers end at this try/catch.
    return statements.slice(candidate + 1).length === 0;
  }
  return directBearerStatement(first, file);
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
  const capabilityAt = handlers.findIndex((handler) => containsDominatingBearer(handler, file));
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
export function runtimeRouteRegistrations(unit: SourceUnit): RuntimeRouteRegistration[] {
  const file = sourceFile(unit);
  const routes: RuntimeRouteRegistration[] = [];
  const fail = (node: ts.CallExpression, shape: string): never => {
    throw new Error(`unmodelled: registration ${shape} at ${diagnosticLocation(file, node.getStart(file))}`);
  };
  const checker = checkerFor(file);
  const declarations = collectDeclarations(unit).declarations;
  const builders: Array<{ readonly declaration: InternalDecl; readonly routerSymbol: ts.Symbol }> = [];
  for (const declaration of declarations) {
    if (!declaration.exported || declaration.callable?.body === undefined || !ts.isBlock(declaration.callable.body)) continue;
    const body = declaration.callable.body;
    let candidateSymbol: ts.Symbol | undefined;
    const visitRouter = (node: ts.Node): void => {
      if (candidateSymbol !== undefined || (node !== body && (ts.isFunctionLike(node) || ts.isClassLike(node)))) return;
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined
          && ts.isCallExpression(node.initializer) && ts.isPropertyAccessExpression(node.initializer.expression)
          && node.initializer.expression.name.text === "Router" && ts.isIdentifier(node.initializer.expression.expression)) {
        const binding = importBinding(node.initializer.expression.expression, file);
        if (binding?.importedFrom === "express" && (binding.importedName === "default" || binding.importedName === "*")) {
          candidateSymbol = checker.getSymbolAtLocation(node.name);
          return;
        }
      }
      ts.forEachChild(node, visitRouter);
    };
    visitRouter(body);
    if (candidateSymbol !== undefined) builders.push({ declaration, routerSymbol: candidateSymbol });
  }
  if (builders.length !== 1) {
    const shape = builders.length === 0 ? "missing" : "ambiguous";
    throw new Error(`unmodelled: ${shape} exported route builder at ${diagnosticLocation(file)}`);
  }
  const selected = builders[0] as { readonly declaration: InternalDecl; readonly routerSymbol: ts.Symbol };
  const selectedBuilder = selected.declaration;
  const selectedRouterSymbol = selected.routerSymbol;
  if (selectedBuilder.callable?.body === undefined || !ts.isBlock(selectedBuilder.callable.body)) {
    throw new Error(`unmodelled: missing exported route builder at ${diagnosticLocation(file)}`);
  }
  const builderBody = selectedBuilder.callable.body;

  const isRealRouter = (expression: ts.Expression): boolean =>
    ts.isIdentifier(expression) && checker.getSymbolAtLocation(expression) === selectedRouterSymbol;
  const recognisedMiddleware = (expression: ts.Expression): boolean => {
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return true;
    if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)
        || !ts.isIdentifier(expression.expression.expression)) return false;
    const binding = importBinding(expression.expression.expression, file);
    return binding?.importedFrom === "express" && expression.expression.name.text === "json";
  };
  const mountedChild = (node: ts.CallExpression, argumentsToCheck: readonly ts.Expression[]): void => {
    const child = argumentsToCheck.find((argument) =>
      (ts.isIdentifier(argument) || ts.isCallExpression(argument)) && !recognisedMiddleware(argument));
    if (child !== undefined) {
      throw new Error(`unmodelled: mounted child router at ${diagnosticLocation(file, node.getStart(file))}`);
    }
  };

  const inspectCall = (node: ts.CallExpression): boolean => {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      const method = node.expression.name.text.toLowerCase();
      const literalPath = node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0]);
      if (method === "use") {
        mountedChild(node, literalPath ? node.arguments.slice(1) : node.arguments);
        if (isRealRouter(receiver)) return true;
      }
      if (isRealRouter(receiver)) {
        if (method === "route") fail(node, "router.route(...)");
        if (!ROUTE_METHODS.has(method)) fail(node, `router.${method}(...)`);
        const path = stringArgument(node.arguments[0], `router.${method}`, file);
        if (node.arguments.length < 2) fail(node, `router.${method}("${path}") without a handler`);
        routes.push({
          call: routeCall(method, path),
          capability: capabilityProof(node.arguments.slice(1), file, node),
          shape: "router-method",
        });
        return true;
      }
      if (ROUTE_METHODS.has(method) && literalPath) {
        if (ts.isIdentifier(receiver) && receiver.text === "router") return true;
        fail(node, `${receiver.getText(file)}.${method}(...)`);
      }
    }
    if (ts.isIdentifier(node.expression) && node.arguments[0] !== undefined
        && ts.isIdentifier(node.arguments[0]) && !isRealRouter(node.arguments[0])
        && node.arguments[1] !== undefined && ts.isStringLiteralLike(node.arguments[1])
        && ROUTE_METHODS.has(node.arguments[1].text.toLowerCase())
        && node.arguments[2] !== undefined && ts.isStringLiteralLike(node.arguments[2])) {
      fail(node, `${node.expression.text}(${node.arguments[0].text}, ...)`);
    }
    const routerArg = node.arguments.find((argument) => isRealRouter(argument));
    if (routerArg !== undefined) {
      if (!ts.isIdentifier(node.expression) || node.expression.text !== "register" || node.arguments[0] !== routerArg) {
        fail(node, `${node.expression.getText(file)}(router, ...)`);
      }
      const method = stringArgument(node.arguments[1], "register(router, method)", file).toLowerCase();
      if (!ROUTE_METHODS.has(method)) fail(node, `register(router, "${method}", ...)`);
      const path = stringArgument(node.arguments[2], `register(router, "${method}", path)`, file);
      if (node.arguments.length < 4) fail(node, `register(router, "${method}", "${path}") without a handler`);
      routes.push({
        call: routeCall(method, path),
        capability: capabilityProof(node.arguments.slice(3), file, node),
        shape: "register-helper",
      });
      return true;
    }
    return false;
  };

  const inspectNode = (node: ts.Node): void => {
    if (node !== builderBody && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
    if (ts.isCallExpression(node) && inspectCall(node)) return;
    ts.forEachChild(node, inspectNode);
  };
  const inspectStatement = (statement: ts.Statement): boolean => {
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
      if (statement.expression !== undefined) inspectNode(statement.expression);
      return false;
    }
    if (ts.isBlock(statement)) {
      for (const child of statement.statements) if (!inspectStatement(child)) return false;
      return true;
    }
    if (ts.isIfStatement(statement)) {
      inspectNode(statement.expression);
      if (isTrueLiteral(statement.expression)) return inspectStatement(statement.thenStatement);
      if (isFalseLiteral(statement.expression)) {
        return statement.elseStatement === undefined || inspectStatement(statement.elseStatement);
      }
      const thenContinues = inspectStatement(statement.thenStatement);
      const elseContinues = statement.elseStatement === undefined || inspectStatement(statement.elseStatement);
      return thenContinues || elseContinues;
    }
    if (ts.isTryStatement(statement)) {
      const tryContinues = inspectStatement(statement.tryBlock);
      const catchContinues = statement.catchClause === undefined
        ? false
        : inspectStatement(statement.catchClause.block);
      const finallyContinues = statement.finallyBlock === undefined || inspectStatement(statement.finallyBlock);
      if (!finallyContinues) return false;
      return statement.catchClause === undefined ? tryContinues : tryContinues || catchContinues;
    }
    inspectNode(statement);
    return true;
  };
  for (const statement of builderBody.statements) if (!inspectStatement(statement)) break;
  return routes;
}
