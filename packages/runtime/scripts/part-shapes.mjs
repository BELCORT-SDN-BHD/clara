// Shared TypeScript-AST instrument for P6-1's declared-part census. Only real exported type
// aliases are visible to the parser: declaration-looking text in comments and strings is inert.

import ts from "typescript";

const DEFAULT_PATH = "packages/runtime/workflows/chatTurn.v16.parts.ts";

export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function parseSource(src, path) {
  const file = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const errors = file.parseDiagnostics ?? [];
  if (errors.length > 0) {
    const detail = errors
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
      .join("; ");
    throw new Error(`${path}: TypeScript parse failed: ${detail}`);
  }
  return file;
}

function exported(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function computedPropertyNameText(name) {
  if (!ts.isComputedPropertyName(name)) return null;
  const expression = name.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  return null;
}

function literalTypeDiscriminant(member) {
  if (!ts.isPropertySignature(member) || !member.name) return null;
  const name = propertyNameText(member.name) ?? computedPropertyNameText(member.name);
  const type = member.type;
  if (name !== "type" || !type || !ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) return null;
  return { computed: ts.isComputedPropertyName(member.name), kind: type.literal.text };
}

function typeContainsLiteralDiscriminant(node) {
  if (ts.isTypeLiteralNode(node)) return node.members.some((member) => literalTypeDiscriminant(member) !== null);
  if (ts.isParenthesizedTypeNode(node)) return typeContainsLiteralDiscriminant(node.type);
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    return node.types.some(typeContainsLiteralDiscriminant);
  }
  return false;
}

/** Return kind -> ordered field names for exported object-type declarations. */
export function declaredPartShapes(src, path = DEFAULT_PATH) {
  const file = parseSource(src, path);
  const shapes = new Map();

  const recordTypeLiteral = (node) => {
    const namedTypeMembers = node.members.filter(
      (member) => member.name
        && (propertyNameText(member.name) === "type" || computedPropertyNameText(member.name) === "type"),
    );
    if (namedTypeMembers.length === 0) return;
    if (namedTypeMembers.length !== 1 || !ts.isPropertySignature(namedTypeMembers[0])) {
      throw new Error(`${path}: unsupported type discriminant shape`);
    }
    if (ts.isComputedPropertyName(namedTypeMembers[0].name)) {
      throw new Error(`${path}: unsupported computed part declaration`);
    }

    const discriminant = namedTypeMembers[0].type;
    if (!discriminant || !ts.isLiteralTypeNode(discriminant) || !ts.isStringLiteral(discriminant.literal)) {
      throw new Error(`${path}: unsupported type discriminant shape`);
    }

    const fields = [];
    for (const member of node.members) {
      if (!ts.isPropertySignature(member) || !member.name) {
        throw new Error(`${path}: unsupported member in part discriminant ${discriminant.literal.text}`);
      }
      const field = propertyNameText(member.name);
      if (field === null) {
        throw new Error(`${path}: unsupported computed member in part discriminant ${discriminant.literal.text}`);
      }
      fields.push(field);
    }

    const kind = discriminant.literal.text;
    if (shapes.has(kind)) throw new Error(`${path}: duplicate discriminant ${kind}`);
    shapes.set(kind, fields);
  };

  const visitAliasType = (node) => {
    if (ts.isTypeLiteralNode(node)) {
      recordTypeLiteral(node);
      return;
    }
    if (ts.isUnionTypeNode(node)) {
      for (const member of node.types) visitAliasType(member);
      return;
    }
    if (ts.isParenthesizedTypeNode(node)) visitAliasType(node.type);
    if (ts.isIntersectionTypeNode(node) && typeContainsLiteralDiscriminant(node)) {
      throw new Error(`${path}: unsupported intersection part declaration`);
    }
    // Type references are intentionally not followed: each referenced exported alias is parsed
    // at its own declaration, so a union roster does not double-count its discriminants.
  };

  for (const statement of file.statements) {
    if (ts.isTypeAliasDeclaration(statement) && exported(statement)) visitAliasType(statement.type);
    if (ts.isInterfaceDeclaration(statement) && exported(statement)
      && statement.members.some((member) => literalTypeDiscriminant(member) !== null)) {
      throw new Error(`${path}: unsupported interface part declaration`);
    }
  }
  return shapes;
}
