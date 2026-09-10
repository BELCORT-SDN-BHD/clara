#!/usr/bin/env node
// Commit-parity gate: apps/web's reader must cover every part kind this runtime can emit.
// Declared-only kinds are exempt only through the explicit produced-elsewhere allowlist, and
// each exemption is invalidated by any object-literal construction site in packages/runtime.
// Scope is every regular TS/JS module file under packages/runtime. Files outside that root,
// behind a symlink, or below node_modules/tests/.output/.nitro are not scanned. The census
// detects object-literal constructions: literal discriminants are classified, while dynamic
// properties and every object spread throw unless their exact AST site is explicitly reviewed.
// Unknown never means safe.

import { readFileSync, readdirSync } from "node:fs";
import { extname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { declaredPartShapes } from "./part-shapes.mjs";
import {
  REVIEWED_COMPUTED_KEY_EXEMPTIONS,
  REVIEWED_NON_PART_LITERAL_EXEMPTIONS,
  REVIEWED_OBJECT_SPREAD_EXEMPTIONS,
} from "./parts-parity-exemptions.mjs";
import { describeParitySite, siteExemptionLedger } from "./parts-parity-sites.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DEFAULT_DECLARER = "packages/runtime/workflows/chatTurn.v16.parts.ts";
// #623 — THE DECLARER IS A SET, NOT A FILE. It was one file while exactly one closure had ever
// widened the wire. Two closures now do: chatTurn_v18 declares `work_accepted` (it is minted by a
// chat turn) and claraWork_v1 declares `work_status` / `work_result` (they are written by a Work
// run's own stream). The alternative — re-declaring v16's four kinds inside a newer file so the
// gate could keep reading one — is exactly the duplicate-discriminant shape `declaredPartShapes`
// refuses on sight, and it would put four copies of a shape beside a producer that does not mint
// them. A discriminant declared twice ANYWHERE in the set is a hard throw, so "exactly one
// declaration per kind" stays mechanically true rather than becoming a convention.
const DEFAULT_DECLARERS = [
  DEFAULT_DECLARER,
  "packages/runtime/workflows/chatTurn.v18.parts.ts",
  "packages/runtime/workflows/claraWork.v1.parts.ts",
];
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

export const LEGACY_PART_KINDS = [
  "text",
  "tool_call",
  "tool_result",
  "tool_error",
  "clarify",
  "clarify_closed",
  "attachment",
  "je_review",
  "refusal",
  "doc_review",
  "diff",
  "sweep_receipt",
  "open_question",
  "bank_recon_receipt",
  "fixed_asset",
  "depreciation_run_receipt",
  "adjustment_run_receipt",
  "staff_advance",
  "entry_posted",
  "question_opened",
  "bank_act",
  "bank_pack",
];

export const UNCLASSIFIABLE_DISCRIMINANT_EXEMPTIONS = [
  {
    path: "packages/runtime/workflows/chatTurn.v14.bankSchemas.ts",
    enclosing: "upsertBankCoaAccountInputSchema",
    signature: "type: z.string().min(1)",
    reason: "Zod input schema field for a bank account class; it does not construct a chat part",
  },
  {
    path: "packages/runtime/lib/myinvois-ubl.mjs",
    enclosing: "extractUblModel",
    signature: 'type: txtAt(category, "cbc:ID")',
    reason: "MyInvois UBL tax-category projection field; it does not construct a chat part",
  },
];

const DEFAULT_SITE_EXEMPTIONS = [
  ...UNCLASSIFIABLE_DISCRIMINANT_EXEMPTIONS.map((exemption) => ({ ...exemption, siteKind: "property" })),
  ...REVIEWED_OBJECT_SPREAD_EXEMPTIONS,
  ...REVIEWED_NON_PART_LITERAL_EXEMPTIONS,
  ...REVIEWED_COMPUTED_KEY_EXEMPTIONS,
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

function topLevelConstBindings(file) {
  const bindings = new Map();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        bindings.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return bindings;
}

function namedImports(file) {
  const imports = new Map();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      imports.set(element.name.text, {
        importedName: element.propertyName?.text ?? element.name.text,
        specifier: statement.moduleSpecifier.text,
      });
    }
  }
  return imports;
}

function resolveImportedPath(fromPath, specifier, contexts) {
  if (!specifier.startsWith(".")) return null;
  const raw = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  const extension = posix.extname(raw);
  const stem = extension ? raw.slice(0, -extension.length) : raw;
  const candidates = extension
    ? [raw, ...RUNTIME_SCRIPT_KINDS.keys()].map((candidate, index) => (index === 0 ? candidate : `${stem}${candidate}`))
    : [raw, ...[...RUNTIME_SCRIPT_KINDS.keys()].map((suffix) => `${raw}${suffix}`)];
  return candidates.find((candidate) => contexts.has(candidate)) ?? null;
}

function dereferenceExpression(node, context, contexts, seen = new Set()) {
  let current = unwrapExpression(node);
  let currentContext = context;
  let currentSeen = seen;
  while (ts.isIdentifier(current)) {
    const key = `${currentContext.path}:${current.text}`;
    if (currentSeen.has(key)) return null;
    const nextSeen = new Set(currentSeen);
    nextSeen.add(key);
    let targetContext = currentContext;
    let initializer = currentContext.bindings.get(current.text);
    if (!initializer) {
      const imported = currentContext.imports.get(current.text);
      const importedPath = imported && resolveImportedPath(currentContext.path, imported.specifier, contexts);
      targetContext = importedPath ? contexts.get(importedPath) : null;
      initializer = targetContext?.bindings.get(imported?.importedName);
    }
    if (!initializer || !targetContext) return null;
    current = unwrapExpression(initializer);
    currentContext = targetContext;
    currentSeen = nextSeen;
  }
  return { context: currentContext, node: current, seen: currentSeen };
}

function staticStringValue(node, context, contexts, seen = new Set()) {
  const resolved = dereferenceExpression(node, context, contexts, seen);
  if (!resolved) return { kind: "unknown" };
  const current = resolved.node;
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return { kind: "string", value: current.text };
  }
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    return { kind: "mutable-object-property" };
  }
  return { kind: "unknown" };
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

function constructionSiteCensus(runtimeSources, declared, siteExemptions) {
  if (!Array.isArray(runtimeSources) || runtimeSources.length === 0) {
    throw new Error("runtime construction-site census requires at least one runtime source");
  }
  const exemptions = siteExemptionLedger(siteExemptions);
  const knownPartKinds = new Set([...LEGACY_PART_KINDS, ...declared]);
  const sites = new Map(declared.map((kind) => [kind, []]));
  const paths = new Set();
  const contexts = new Map();
  for (const entry of runtimeSources) {
    if (!entry || typeof entry.path !== "string" || typeof entry.source !== "string") {
      throw new Error("every runtime census entry must carry string path and source fields");
    }
    if (paths.has(entry.path)) throw new Error(`runtime construction-site census contains duplicate path ${entry.path}`);
    paths.add(entry.path);
    const file = sourceFile(entry.path, entry.source);
    contexts.set(entry.path, {
      bindings: topLevelConstBindings(file),
      entry,
      file,
      imports: namedImports(file),
      path: entry.path,
    });
  }
  for (const context of contexts.values()) {
    const { entry, file } = context;
    const refuseUnclassifiable = (node, siteKind, message) => {
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      const site = describeParitySite(node, file, entry.path, siteKind);
      if (exemptions.consume(site)) return;
      throw new Error(`parts-parity: ${message} at ${entry.path}:${line}`);
    };
    const visitComputedKeys = (node) => {
      if (ts.isComputedPropertyName(node)) {
        const computedName = staticStringValue(node.expression, context, contexts);
        if (computedName.kind !== "string") {
          refuseUnclassifiable(node, "computed", "unclassifiable computed key");
        }
        if (computedName.value === "type") {
          refuseUnclassifiable(node, "computed", "unclassifiable discriminant");
        }
      }
      ts.forEachChild(node, visitComputedKeys);
    };
    visitComputedKeys(file);

    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (ts.isSpreadAssignment(property)) {
            refuseUnclassifiable(property, "spread", "unclassifiable object spread");
          }
        }
        for (const property of node.properties) {
          if (property.name && ts.isComputedPropertyName(property.name)) continue;
          if (!property.name || propertyNameText(property.name) !== "type") continue;
          if (!ts.isPropertyAssignment(property)) {
            refuseUnclassifiable(property, "property", "unclassifiable discriminant");
            continue;
          }
          const initializer = unwrapExpression(property.initializer);
          if (!ts.isStringLiteral(initializer)) {
            refuseUnclassifiable(property, "property", "unclassifiable discriminant");
            continue;
          }
          if (!knownPartKinds.has(initializer.text)) {
            const site = describeParitySite(property, file, entry.path, "literal");
            if (exemptions.consume(site)) continue;
            throw new Error(
              `unknown part kind '${initializer.text}' constructed at ${entry.path}:${site.line} — declare it or site-exempt it`,
            );
          }
          if (!sites.has(initializer.text)) continue;
          const line = file.getLineAndCharacterOfPosition(property.getStart(file)).line + 1;
          sites.get(initializer.text).push(`${entry.path}:${line}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  exemptions.assertComplete();
  return sites;
}

/** Read the declarer modules this repo carries. */
export function readDeclarerSources(paths = DEFAULT_DECLARERS) {
  return paths.map((path) => ({ path, source: readFileSync(resolve(REPO_ROOT, path), "utf8") }));
}

/** Merge every declarer's shapes into ONE kind -> fields map, refusing a discriminant declared in
 *  two files (the same law `declaredPartShapes` enforces inside one file). */
export function declaredPartShapesAcross(declarers) {
  const merged = new Map();
  const owner = new Map();
  for (const { path, source } of declarers) {
    for (const [kind, fields] of declaredPartShapes(source, path)) {
      if (merged.has(kind)) {
        throw new Error(
          `parts-parity: discriminant ${kind} is declared in both ${owner.get(kind)} and ${path} — exactly one declaration per kind`,
        );
      }
      merged.set(kind, fields);
      owner.set(kind, path);
    }
  }
  return merged;
}

export function checkPartsParity({
  declarerSource,
  declarerSources,
  readerSource,
  runtimeSources = readRuntimeSources(),
  declarerPath = DEFAULT_DECLARER,
  readerPath = DEFAULT_READER,
  allowlistedKinds = PRODUCED_ELSEWHERE_PART_KINDS,
  siteExemptions = DEFAULT_SITE_EXEMPTIONS,
}) {
  // `declarerSource` stays a supported SHORTHAND for "this one declarer's text, plus whatever
  // else the repo declares" — every pre-#623 caller passes the v16 declarer that way, and a cell
  // that mutates it is exercising the PARSER, not the roster. `declarerSources` names the whole
  // set explicitly, which is what the CLI does.
  const declarers =
    declarerSources
    ?? (declarerSource === undefined
      ? readDeclarerSources()
      : [
          { path: declarerPath, source: declarerSource },
          ...readDeclarerSources(DEFAULT_DECLARERS.filter((candidate) => candidate !== declarerPath)),
        ]);
  const declared = [...declaredPartShapesAcross(declarers).keys()];
  if (declared.length === 0) {
    throw new Error(`${declarers.map((d) => d.path).join(", ")}: no exported object-type part declarations found`);
  }
  const reader = readerPartKinds(readerSource, readerPath);
  const allowlisted = [...allowlistedKinds];
  if (new Set(allowlisted).size !== allowlisted.length) throw new Error("produced-elsewhere allowlist must be duplicate-free");

  const declaredSet = new Set(declared);
  const allowlistedSet = new Set(allowlisted);
  const constructionSites = constructionSiteCensus(runtimeSources, declared, siteExemptions);
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
  const readerPath = resolve(REPO_ROOT, DEFAULT_READER);
  try {
    const result = checkPartsParity({
      declarerSources: readDeclarerSources(),
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
