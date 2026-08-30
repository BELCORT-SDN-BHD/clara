#!/usr/bin/env node
// Commit-parity gate: apps/web's reader must cover every part kind this runtime can emit.
// Declared-only kinds are exempt only through the explicit produced-elsewhere allowlist, and
// each exemption is invalidated by any object-literal construction site in packages/runtime.
// Scope is every non-test runtime package source file, across TS/JS module variants;
// tests and build/install outputs are not runtime sources. The census detects object-literal
// constructions: a literal discriminant is classified, while a non-literal discriminant throws
// unless its non-part file is explicitly reviewed below. Unknown never means safe.

import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { declaredPartShapes } from "./part-shapes.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DEFAULT_DECLARER = "packages/runtime/workflows/chatTurn.v16.parts.ts";
const DEFAULT_READER = "apps/web/lib/parts/types.ts";
const DEFAULT_RUNTIME_ROOT = "packages/runtime";

const RUNTIME_SCRIPT_KINDS = new Map([
  [".ts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".mts", ts.ScriptKind.TS],
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
]);

export const PRODUCED_ELSEWHERE_PART_KINDS = [
  "agent_receipt",
  "firm_question",
  "close_proposal",
];

export const UNCLASSIFIABLE_DISCRIMINANT_EXEMPTIONS = [
  {
    path: "packages/runtime/workflows/chatTurn.v14.bankSchemas.ts",
    reason: "Zod input schema field for a bank account class; it does not construct a chat part",
  },
  {
    path: "packages/runtime/lib/myinvois-ubl.mjs",
    reason: "MyInvois UBL tax-category projection field; it does not construct a chat part",
  },
];

function scriptKindForPath(path) {
  const kind = RUNTIME_SCRIPT_KINDS.get(extname(path).toLowerCase());
  if (kind === undefined) throw new Error(`parts-parity: unsupported runtime source extension at ${path}`);
  return kind;
}

function sourceFile(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKindForPath(path));
  const errors = file.parseDiagnostics ?? [];
  if (errors.length > 0) {
    const detail = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")).join("; ");
    throw new Error(`${path}: TypeScript parse failed: ${detail}`);
  }
  return file;
}

function exported(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function unwrapExpression(node) {
  let current = node;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
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

export function readRuntimeSources(runtimeRoot = resolve(REPO_ROOT, DEFAULT_RUNTIME_ROOT)) {
  const sources = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "tests" || entry.name === ".output" || entry.name === ".nitro") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && RUNTIME_SCRIPT_KINDS.has(extname(entry.name).toLowerCase())) {
        sources.push({
          path: relative(REPO_ROOT, path).replaceAll("\\", "/"),
          source: readFileSync(path, "utf8"),
        });
      }
    }
  };
  walk(runtimeRoot);
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

function constructionSiteCensus(runtimeSources, declared) {
  if (!Array.isArray(runtimeSources) || runtimeSources.length === 0) {
    throw new Error("runtime construction-site census requires at least one runtime source");
  }
  const exemptions = new Map();
  for (const exemption of UNCLASSIFIABLE_DISCRIMINANT_EXEMPTIONS) {
    if (!exemption || typeof exemption.path !== "string" || typeof exemption.reason !== "string" || exemption.reason.trim() === "") {
      throw new Error("unclassifiable-discriminant exemptions require path and reason strings");
    }
    if (exemptions.has(exemption.path)) throw new Error(`duplicate unclassifiable-discriminant exemption ${exemption.path}`);
    exemptions.set(exemption.path, exemption.reason);
  }
  const sites = new Map(declared.map((kind) => [kind, []]));
  const paths = new Set();
  for (const entry of runtimeSources) {
    if (!entry || typeof entry.path !== "string" || typeof entry.source !== "string") {
      throw new Error("every runtime census entry must carry string path and source fields");
    }
    if (paths.has(entry.path)) throw new Error(`runtime construction-site census contains duplicate path ${entry.path}`);
    paths.add(entry.path);
    const file = sourceFile(entry.path, entry.source);
    const refuseUnclassifiable = (node) => {
      if (exemptions.has(entry.path)) return;
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      throw new Error(`parts-parity: unclassifiable discriminant at ${entry.path}:${line}`);
    };
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        let hasDeclaredTypeProperty = false;
        for (const property of node.properties) {
          const computedName = property.name && ts.isComputedPropertyName(property.name)
            ? unwrapExpression(property.name.expression)
            : null;
          if (computedName && (
            (ts.isStringLiteral(computedName) && computedName.text === "type")
            || (ts.isNoSubstitutionTemplateLiteral(computedName) && computedName.text === "type")
          )) {
            refuseUnclassifiable(property);
            continue;
          }
          if (!property.name || propertyNameText(property.name) !== "type") continue;
          if (!ts.isPropertyAssignment(property)) {
            refuseUnclassifiable(property);
            continue;
          }
          const initializer = unwrapExpression(property.initializer);
          if (!ts.isStringLiteral(initializer)) {
            refuseUnclassifiable(property);
            continue;
          }
          if (!sites.has(initializer.text)) continue;
          hasDeclaredTypeProperty = true;
          const line = file.getLineAndCharacterOfPosition(property.getStart(file)).line + 1;
          sites.get(initializer.text).push(`${entry.path}:${line}`);
        }
        if (hasDeclaredTypeProperty) {
          for (const property of node.properties) {
            if (ts.isSpreadAssignment(property)) refuseUnclassifiable(property);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return sites;
}

export function checkPartsParity({
  declarerSource,
  readerSource,
  runtimeSources = readRuntimeSources(),
  declarerPath = DEFAULT_DECLARER,
  readerPath = DEFAULT_READER,
  allowlistedKinds = PRODUCED_ELSEWHERE_PART_KINDS,
}) {
  const declared = [...declaredPartShapes(declarerSource).keys()];
  if (declared.length === 0) throw new Error(`${declarerPath}: no exported object-type part declarations found`);
  const reader = readerPartKinds(readerSource, readerPath);
  const allowlisted = [...allowlistedKinds];
  if (new Set(allowlisted).size !== allowlisted.length) throw new Error("produced-elsewhere allowlist must be duplicate-free");

  const declaredSet = new Set(declared);
  const allowlistedSet = new Set(allowlisted);
  const constructionSites = constructionSiteCensus(runtimeSources, declared);
  const staleAllowlist = allowlisted.filter((kind) => !declaredSet.has(kind));
  const allowlistedWithConstructionSites = allowlisted.filter(
    (kind) => declaredSet.has(kind) && constructionSites.get(kind).length > 0,
  );
  const unexplainedDeclarations = declared.filter(
    (kind) => !allowlistedSet.has(kind) && constructionSites.get(kind).length === 0,
  );
  const emittable = declared.filter((kind) => !allowlistedSet.has(kind));
  const readerSet = new Set(reader);
  const missing = emittable.filter((kind) => !readerSet.has(kind));
  const census = declared.map((kind) => ({
    kind,
    classification: allowlistedSet.has(kind) ? "allowlisted-produced-elsewhere" : "emittable",
    constructionSites: constructionSites.get(kind),
  }));
  const ok = missing.length === 0
    && staleAllowlist.length === 0
    && allowlistedWithConstructionSites.length === 0
    && unexplainedDeclarations.length === 0;
  return {
    ok,
    declared,
    reader,
    allowlisted,
    emittable,
    missing,
    staleAllowlist,
    allowlistedWithConstructionSites,
    unexplainedDeclarations,
    census,
  };
}

export function formatCensus(census) {
  return census.map((entry) => {
    const sites = entry.constructionSites.length > 0 ? entry.constructionSites.join(",") : "no-construction-site";
    return `${entry.kind}=${entry.classification}:${sites}`;
  }).join(" | ");
}

function main() {
  const declarerPath = resolve(REPO_ROOT, DEFAULT_DECLARER);
  const readerPath = resolve(REPO_ROOT, DEFAULT_READER);
  try {
    const result = checkPartsParity({
      declarerSource: readFileSync(declarerPath, "utf8"),
      readerSource: readFileSync(readerPath, "utf8"),
    });
    const census = formatCensus(result.census);
    if (!result.ok) {
      const reasons = [];
      if (result.missing.length > 0) reasons.push(`reader lacks emittable kind(s): ${result.missing.join(", ")}`);
      if (result.allowlistedWithConstructionSites.length > 0) {
        reasons.push(`allowlisted kind(s) gained construction sites: ${result.allowlistedWithConstructionSites.join(", ")}`);
      }
      if (result.unexplainedDeclarations.length > 0) {
        reasons.push(`declared kind(s) have no construction site or allowlist explanation: ${result.unexplainedDeclarations.join(", ")}`);
      }
      if (result.staleAllowlist.length > 0) reasons.push(`allowlist names undeclared kind(s): ${result.staleAllowlist.join(", ")}`);
      console.error(`parts-parity: REFUSED — ${reasons.join("; ")}. Census: ${census}`);
      return 1;
    }
    console.log(
      `parts-parity: OK — CI proves reader ⊇ emittable at this commit; `
        + `emittable={${result.emittable.join(", ")}}; allowlist={${result.allowlisted.join(", ")}}. Census: ${census}`,
    );
    return 0;
  } catch (error) {
    console.error(`parts-parity: REFUSED — ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(main());
