#!/usr/bin/env node
// Commit-parity gate: apps/web's reader must cover every part kind this runtime can emit.
// Declared-only kinds are exempt only through the explicit produced-elsewhere allowlist, and
// each exemption is invalidated by any object-literal construction site in packages/runtime.

import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { declaredPartShapes } from "./part-shapes.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DEFAULT_DECLARER = "packages/runtime/workflows/chatTurn.v16.parts.ts";
const DEFAULT_READER = "apps/web/lib/parts/types.ts";
const DEFAULT_RUNTIME_ROOT = "packages/runtime";

export const PRODUCED_ELSEWHERE_PART_KINDS = [
  "agent_receipt",
  "firm_question",
  "close_proposal",
];

function sourceFile(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
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
      if (entry.name === "node_modules" || entry.name === ".output" || entry.name === ".nitro") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".ts")) {
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
    throw new Error("runtime construction-site census requires at least one TypeScript source");
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
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property) || propertyNameText(property.name) !== "type") continue;
          const initializer = unwrapExpression(property.initializer);
          if (!ts.isStringLiteral(initializer) || !sites.has(initializer.text)) continue;
          const line = file.getLineAndCharacterOfPosition(property.getStart(file)).line + 1;
          sites.get(initializer.text).push(`${entry.path}:${line}`);
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
