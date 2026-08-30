#!/usr/bin/env node
// Deploy preflight: the pinned chatTurn declarer must not outrun the apps/web reader.
//
// This is deliberately a source/AST check. The declarer's exported constant is read from its
// declaration, and the reader kinds are reached from the ClaraPart union through its referenced
// aliases. A comment or an unrelated type alias therefore cannot stand in for either identity.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DEFAULT_DECLARER = "packages/runtime/workflows/chatTurn.v16.parts.ts";
const DEFAULT_READER = "apps/web/lib/parts/types.ts";

function sourceFile(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const errors = file.parseDiagnostics ?? [];
  if (errors.length > 0) {
    const detail = errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ");
    throw new Error(`${path}: TypeScript parse failed: ${detail}`);
  }
  return file;
}

function exported(node) {
  return node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function unwrapExpression(node) {
  let current = node;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

export function declarerPartKinds(source, path = DEFAULT_DECLARER) {
  const file = sourceFile(path, source);
  const matches = [];
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) || !exported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "CHATTURN_V16_PART_KINDS") continue;
      matches.push(declaration);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`${path}: expected exactly one exported CHATTURN_V16_PART_KINDS declaration, found ${matches.length}`);
  }
  const initializer = matches[0].initializer && unwrapExpression(matches[0].initializer);
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`${path}: CHATTURN_V16_PART_KINDS must be an array literal (optionally as const)`);
  }
  const kinds = initializer.elements.map((element) => {
    const item = unwrapExpression(element);
    if (!ts.isStringLiteral(item)) throw new Error(`${path}: every CHATTURN_V16_PART_KINDS member must be a string literal`);
    return item.text;
  });
  if (kinds.length === 0 || new Set(kinds).size !== kinds.length) {
    throw new Error(`${path}: CHATTURN_V16_PART_KINDS must be non-empty and duplicate-free`);
  }
  return kinds;
}

function propertyNameText(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

export function readerPartKinds(source, path = DEFAULT_READER) {
  const file = sourceFile(path, source);
  const aliases = new Map();
  for (const statement of file.statements) {
    if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement.type);
  }
  const root = file.statements.filter(
    (statement) => ts.isTypeAliasDeclaration(statement) && exported(statement) && statement.name.text === "ClaraPart",
  );
  if (root.length !== 1) throw new Error(`${path}: expected exactly one exported ClaraPart type alias, found ${root.length}`);

  const kinds = new Set();
  const visiting = new Set();
  const visit = (node) => {
    if (ts.isUnionTypeNode(node)) {
      for (const member of node.types) visit(member);
      return;
    }
    if (ts.isParenthesizedTypeNode(node)) {
      visit(node.type);
      return;
    }
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const name = node.typeName.text;
      const target = aliases.get(name);
      if (!target) throw new Error(`${path}: ClaraPart references unknown local type alias ${name}`);
      if (visiting.has(name)) throw new Error(`${path}: ClaraPart type-alias cycle reaches ${name}`);
      visiting.add(name);
      visit(target);
      visiting.delete(name);
      return;
    }
    if (!ts.isTypeLiteralNode(node)) {
      throw new Error(`${path}: ClaraPart contains an unsupported member kind ${ts.SyntaxKind[node.kind]}`);
    }
    const typeProperties = node.members.filter(
      (member) => ts.isPropertySignature(member) && propertyNameText(member.name) === "type",
    );
    if (typeProperties.length !== 1) throw new Error(`${path}: every ClaraPart member must declare exactly one type discriminant`);
    const typeNode = typeProperties[0].type;
    if (!typeNode || !ts.isLiteralTypeNode(typeNode) || !ts.isStringLiteral(typeNode.literal)) {
      throw new Error(`${path}: every ClaraPart type discriminant must be a string literal`);
    }
    const kind = typeNode.literal.text;
    if (kinds.has(kind)) throw new Error(`${path}: ClaraPart declares duplicate discriminant ${kind}`);
    kinds.add(kind);
  };
  visit(root[0].type);
  return [...kinds];
}

export function checkPartsParity({ declarerSource, readerSource, declarerPath = DEFAULT_DECLARER, readerPath = DEFAULT_READER }) {
  const declared = declarerPartKinds(declarerSource, declarerPath);
  const reader = readerPartKinds(readerSource, readerPath);
  const readerSet = new Set(reader);
  const missing = declared.filter((kind) => !readerSet.has(kind));
  return { ok: missing.length === 0, declared, reader, missing };
}

function main() {
  const declarerPath = resolve(DEFAULT_DECLARER);
  const readerPath = resolve(DEFAULT_READER);
  try {
    const result = checkPartsParity({
      declarerSource: readFileSync(declarerPath, "utf8"),
      readerSource: readFileSync(readerPath, "utf8"),
      declarerPath: DEFAULT_DECLARER,
      readerPath: DEFAULT_READER,
    });
    if (!result.ok) {
      console.error(
        `parts-parity: REFUSED — the pinned v16 declarer can emit ${result.missing.join(", ")}, ` +
          `but apps/web's ${result.reader.length}-kind ClaraPart reader cannot read them. Merge the reader bump before deploy.`,
      );
      return 1;
    }
    console.log(
      `parts-parity: OK — apps/web's ${result.reader.length}-kind ClaraPart reader covers all ` +
        `${result.declared.length} CHATTURN_V16_PART_KINDS.`,
    );
    return 0;
  } catch (error) {
    console.error(`parts-parity: REFUSED — ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(main());
