// Freeze-lint Slice-4 hardening checkers (contract §4.9; the deferred
// finding-11 half — see check-frozen-workflows.mjs header, capabilities (d)+(e)):
//
//   (d) REGISTRY-VERSION MONOTONICITY (this module) — the workflow registry is
//       parsed STRUCTURALLY at HEAD and at the base ref; a class may only keep
//       or INCREASE its version, and a class present on base may never
//       disappear.
//   (e) ENQUEUE-SITE PROVENANCE (freeze-lint-enqueue.mjs) — a WDK enqueue call
//       must receive a workflow reference whose import provenance traces to
//       workflows/registry.ts.
//   (f) REGISTRY-VIEW-INTEGRITY (this module, Gate G1 MUST D) — the
//       enqueue-provenance check in (e) accepts ANY identifier imported from
//       registry.ts as a proven-safe root, by name alone. That is only sound
//       because exactly one dynamic-dispatch view exists (`workflowsByName`)
//       and it is PROVABLY the same object as `workflows` (Object.freeze
//       returns its argument, so `workflowsByName === workflows`). This check
//       enforces both halves structurally at HEAD: `workflowsByName`, if
//       present, must be declared as EXACTLY `Object.freeze(workflows)` — no
//       spread copy, no fresh literal, no unfrozen alias — and no SECOND
//       top-level const export may exist whose initializer mentions
//       `workflows` (a second, unverified "view" would be silently trusted by
//       (e) merely for living in this file). Fail-closed: an unparseable
//       `workflowsByName` declaration is a violation, never a skip.
//
// Everything is PURE (source strings in, violation strings out — no git, no
// fs) so the self-test (check-frozen-workflows.selftest.mjs) can inject
// simulated base/head pairs and fixture files; check-frozen-workflows.mjs
// wires these to the real working tree + base ref. Both checks fail CLOSED:
// an unparseable registry or an untraceable enqueue argument is a violation,
// never a skip. This module is also the FACADE: consumers import every
// checker from here (the split across freeze-lint-lex.mjs /
// freeze-lint-enqueue.mjs honors the repo's 500-line file gate, not a public
// module boundary).
//
// round-6 (Codex #11) — "stop regex-parsing TypeScript; parse it": the export-surface census
// below (parseRegistryExports / checkRegistryExportsClosedWorld) now runs on the REAL
// TypeScript compiler API (`typescript`, already the repo's own pinned toolchain — package.json
// + packages/runtime/package.json both carry it; nothing new added), not a regex generation.
// Three concrete probes beat round-5's own regex scanner: an ESCAPED identifier
// (`export const workflowsByName = ...` — a plain-text regex sees the escape sequence
// literally and never recognizes it as `workflowsByName`; ts.Identifier.text comes out of the
// real parser ALREADY NORMALIZED, so the trick dies structurally, not by pattern-matching
// harder), a MULTI-DECLARATOR statement (`export const a = X, b = Y;` — the regex scanner's own
// lastIndex bookkeeping only ever found the FIRST declarator; ts.VariableDeclarationList.
// declarations enumerates every one), and an UNVERIFIED re-export TARGET (round-5 accepted a
// relative re-export on `startsWith(".")` alone, never checking the resolved path actually
// stays inside packages/runtime/workflows/ — `import {x} from "../../../etc/passwd"` starts
// with a dot too). The old regex path (findTopLevelExportPositions / parseExportBraceList /
// extractTopLevelConstExports) is DELETED, not kept as a fallback — this is the third round of
// regex-vs-TypeScript on this exact surface, and a fallback would just be the next arms-race
// entry waiting to be found.

import ts from "typescript";
import { blankSource, REGISTRY_REL } from "./freeze-lint-lex.mjs";

export { blankSource, REGISTRY_REL };
export { checkEnqueueSites, isTestPath, ENQUEUE_MODULES, ENQUEUE_CALLABLES } from "./freeze-lint-enqueue.mjs";

// round-7 (native adversarial leg, MUST #11) — the closed-world census's EXPORT half moved to
// the TypeScript compiler API in round-6; its ACCEPTANCE half (resolving a re-export's local
// name, or a `workflows={...}` entry's identifier, back to the import that actually bound it)
// still ran on freeze-lint-lex.mjs's own regex-based `parseImportBindings`, over a blank that
// deliberately PRESERVES string literals (it has to — it reads the import specifier's own quoted
// path). That combination is bypassable: `importRe` matches ANY text shaped like an import
// statement, including one sitting inside an ordinary string literal — e.g. `const NOTE =
// "import { backdoor } from './evil.js'"` — and since `bindings` is a plain Map, a decoy landing
// after the real import for the same local name silently WINS (last-write-wins), so a locally-
// declared or genuinely-unrelated-import binding gets accepted as if it were the real one.
// Reproduced live against the real exported checker (round-7 finding). Fixed the same way the
// export half was: a real AST walk over `ts.isImportDeclaration` nodes. A string literal is
// never re-parsed as a statement by a real parser — the decoy trick dies structurally, not by
// pattern-matching harder. `parseImportBindings`/`blankSource(...,{strings:false})` is RETIRED
// from this module's own registry.ts-facing use entirely (both call sites below); `blankSource`
// itself stays imported only because parseRegistrySource's own pass2 (locating the `workflows =
// {...}` object literal, an unrelated concern to import-binding resolution) still needs it.
// `parseImportBindings` keeps its OWN separate life in freeze-lint-enqueue.mjs — that module scans
// arbitrary `packages/runtime/src/**` files for enqueue call sites, a materially different, wider
// surface the round-4 canonical-name pin already backstops (this finding's own "blast radius
// limited" note) and which round-7 did not ask this pass to rebuild.
/**
 * AST-based import-binding resolver for registry.ts — the drop-in structural replacement for
 * freeze-lint-lex.mjs's own regex-based `parseImportBindings`, scoped to what THIS module needs
 * (a Map<localName, {source, imported}>; registry.ts never re-exports another module's exports
 * or uses a dynamic import, so the old function's `reexports`/`dynamics` fields have no analogue
 * here — checkRegistryExportsClosedWorld reads registry.ts's OWN re-export statements straight
 * off parseRegistryExports instead). A type-only import (`import type {...}`, or a per-specifier
 * `import { type X, real }`) carries no runtime binding and is skipped, exactly like a type-only
 * EXPORT is skipped on the other half of this same census.
 */
function parseImportBindingsAst(headSrc) {
  const bindings = new Map();
  const sourceFile = ts.createSourceFile("registry.ts", headSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const clause = stmt.importClause;
    if (!clause || clause.isTypeOnly) continue; // side-effect-only import, or `import type {...}` — no runtime binding
    const source = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : null;
    if (source === null) continue; // an unparseable/non-string specifier — nothing to bind
    if (clause.name && ts.isIdentifier(clause.name)) {
      bindings.set(clause.name.text, { source, imported: "default" });
    }
    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named)) {
      bindings.set(named.name.text, { source, imported: "*" });
    } else if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        if (el.isTypeOnly) continue; // `import { type X, real } from "..."` — X carries no runtime binding
        const imported = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text;
        bindings.set(el.name.text, { source, imported });
      }
    }
  }
  return bindings;
}

// --- (d) registry-version monotonicity --------------------------------------

/** Version per the identifier suffix convention: closeExampleV2 / chatTurn_v1. */
export function identifierVersion(name) {
  const m = /_?[vV](\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}
/** Version per the module-file convention: "./closeExample.v1.js" / ".v2.ts". */
export function specVersion(spec) {
  const m = /\.v(\d+)(?:\.[cm]?[jt]sx?)?$/i.exec(spec);
  return m ? Number(m[1]) : null;
}

/**
 * STRUCTURAL parse of the workflow registry: blank comments/strings, resolve
 * the import bindings, then read the `export const workflows = { class:
 * identifier }` object literal entry by entry — never a regex over the whole
 * file. Fail-closed: an entry whose value is not a plain identifier IMPORTED
 * from a RELATIVE module, carrying a parseable _vN/VN version that agrees
 * with the module's .vN suffix (when present), is a problem, not a skip —
 * otherwise an inline `const chatTurnV2 = chatTurnV1;` alias could fake a
 * repoint. Returns { classes: Map<class,{identifier,version,source}>, problems }.
 */
export function parseRegistrySource(src, label) {
  const problems = [];
  const classes = new Map();
  const bindings = parseImportBindingsAst(src);
  const pass2 = blankSource(src, { comments: true, strings: true, templates: true });
  const declM = /\bexport\s+const\s+workflows\s*=\s*\{/.exec(pass2);
  if (!declM) {
    problems.push(
      `REGISTRY-UNPARSEABLE  ${label}: no \`export const workflows = { ... }\` object literal found — the monotonicity gate cannot run (fail-closed). Keep the registry in its canonical shape.`,
    );
    return { classes, problems };
  }
  const openIdx = declM.index + declM[0].length - 1;
  let depth = 0;
  let endIdx = -1;
  for (let i = openIdx; i < pass2.length; i++) {
    const ch = pass2[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) {
    problems.push(`REGISTRY-UNPARSEABLE  ${label}: unbalanced \`workflows\` object literal (fail-closed).`);
    return { classes, problems };
  }
  const body = pass2.slice(openIdx + 1, endIdx);
  const entries = [];
  {
    let d = 0;
    let cur = "";
    for (const ch of body) {
      if (ch === "{" || ch === "(" || ch === "[") d++;
      else if (ch === "}" || ch === ")" || ch === "]") d--;
      if (ch === "," && d === 0) {
        entries.push(cur);
        cur = "";
      } else cur += ch;
    }
    entries.push(cur);
  }
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue; // trailing comma
    let className;
    let ident;
    const pair = /^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*!*$/.exec(entry);
    if (pair) {
      className = pair[1];
      ident = pair[2];
    } else if (/^[A-Za-z_$][\w$]*$/.test(entry)) {
      className = entry; // shorthand — the class name IS the identifier
      ident = entry;
    } else {
      problems.push(
        `REGISTRY-UNPARSEABLE  ${label}: entry "${entry.slice(0, 60)}" is not \`class: importedIdentifierVN\` — its version cannot be proven (fail-closed).`,
      );
      continue;
    }
    const b = bindings.get(ident);
    if (!b || !b.source.startsWith(".")) {
      problems.push(
        `REGISTRY-UNPARSEABLE  ${label}: "${className}" points at "${ident}", which is not imported from a RELATIVE workflow module — an inline or laundered identifier cannot prove its version (fail-closed).`,
      );
      continue;
    }
    const iv = identifierVersion(ident);
    if (iv === null) {
      problems.push(
        `REGISTRY-UNPARSEABLE  ${label}: "${className}" identifier "${ident}" carries no _vN/VN version suffix — the monotonicity gate cannot read its version (fail-closed).`,
      );
      continue;
    }
    const sv = specVersion(b.source);
    if (sv !== null && sv !== iv) {
      problems.push(
        `REGISTRY-VERSION-MISMATCH  ${label}: "${className}" identifier "${ident}" says v${iv} but its module "${b.source}" says v${sv} — a mislabelled repoint (fail-closed).`,
      );
      continue;
    }
    classes.set(className, { identifier: ident, version: iv, source: b.source });
  }
  return { classes, problems };
}

/**
 * Monotonicity law (contract §4.9): for every workflow class present on the
 * base, the HEAD registry entry's version may only stay EQUAL or strictly
 * INCREASE; a class removed from the registry (or the whole registry deleted)
 * is a REJECT — its non-terminal runs would be stranded (policy (c)). New
 * classes are fine. Pure: takes the two sources (null = file absent there).
 */
export function checkRegistryMonotonicity(baseSrc, headSrc, baseLabel = "base") {
  const violations = [];
  if (baseSrc == null && headSrc == null) return violations;
  let head = { classes: new Map(), problems: [] };
  if (headSrc != null) {
    head = parseRegistrySource(headSrc, "registry@HEAD");
    violations.push(...head.problems);
  }
  if (baseSrc == null) return violations; // registry introduced in this change — every class is new
  const bse = parseRegistrySource(baseSrc, `registry@${baseLabel}`);
  violations.push(...bse.problems);
  for (const [className, b] of bse.classes) {
    const h = head.classes.get(className);
    if (!h) {
      violations.push(
        `REGISTRY-CLASS-REMOVED  workflow class "${className}" (v${b.version} on ${baseLabel}) is gone from ${REGISTRY_REL} — removing a class strands its non-terminal runs (policy (c)); keep the entry until zero runs reference it.`,
      );
      continue;
    }
    if (h.version < b.version) {
      violations.push(
        `REGISTRY-DOWNGRADE  workflow class "${className}" repointed v${b.version} -> v${h.version} (${h.identifier}) — a registry entry may only stay or INCREASE (Appendix A policy (b)); new runs must never target an older body.`,
      );
    }
  }
  return violations;
}

// --- (f) registry-view integrity (Gate G1 MUST D) ---------------------------

/** RHS forms that derive PURELY and ONLY from `workflows`, with nothing else
 * mixed in, so their values (if any) are provably the real frozen originals
 * — never an alternate/fake collection. Anything else that mentions
 * `workflows` (a spread copy, a fresh literal, a second `Object.freeze`
 * under a different name, ...) is an unverified alternate view. */
const SAFE_WORKFLOWS_DERIVATIONS = new Set([
  "workflows",
  "Object.keys(workflows)",
  "Object.values(workflows)",
  "Object.entries(workflows)",
]);

const WORKFLOWS_DIR = REGISTRY_REL.replace(/\/[^/]+$/, ""); // "packages/runtime/workflows"

/** Pure path resolution (no fs) — resolves `spec` (a relative import specifier) against
 *  `fromRel`'s own directory, extension-insensitive. The SAME algebra freeze-lint-enqueue.mjs's
 *  own resolveRelPure uses (kept as a separate local copy rather than a shared import — each
 *  module in this split keeps its own small pure helpers, an existing repo pattern). */
function resolveRelPure(fromRel, spec) {
  const parts = fromRel.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/").replace(/\.(?:[cm]?[jt]sx?)$/, "");
}

/** round-6 (Codex #11, probe 3) — "relative" alone (startsWith(".")) is not "inside
 *  packages/runtime/workflows/": `import {x} from "../../../etc/passwd"` starts with a dot
 *  too. Resolve the specifier PURELY against registry.ts's own known location and require the
 *  result to land inside WORKFLOWS_DIR — never trust relativity alone. */
function resolvesInsideWorkflowsDir(spec) {
  if (typeof spec !== "string" || !spec.startsWith(".")) return false;
  const resolved = resolveRelPure(REGISTRY_REL, spec);
  return resolved === WORKFLOWS_DIR || resolved.startsWith(`${WORKFLOWS_DIR}/`);
}

function hasModifier(node, kind) {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return mods ? mods.some((m) => m.kind === kind) : false;
}

/** round-6 (Codex #11) — the ONE AST-based enumeration of every top-level export in
 *  registry.ts, replacing the prior regex generation entirely (see this module's own header
 *  for the three probes that beat it). `ts.createSourceFile` parses REAL TypeScript; every
 *  identifier read off the tree (`.text`) is already unicode-escape-NORMALIZED by the parser
 *  itself — the escape trick dies structurally, not by pattern-matching harder.
 *
 *  Returns:
 *    consts:    [{name, initializerText}] — every declarator of every exported
 *               const/let/var statement (ALL of them, not just the first — probe 2).
 *    reexports: [{local, exported, aliased, fromModuleSpecifier}] — every element of every
 *               `export { ... }` / `export { ... } from "..."` NamedExports clause.
 *    rejected:  [violation strings, already fully formed] — every export shape with NO
 *               legitimate use in registry.ts at all (function/class/enum, default,
 *               wildcard re-export, namespace re-export, anything unrecognized) — a true
 *               fail-closed catch-all: an export statement this walk does not explicitly
 *               recognize as const/let/var, type/interface, or a NamedExports clause falls
 *               into `rejected` by construction, never silently passed.
 *  Parse failure (invalid TypeScript) is itself fail-closed: `sourceFile.parseDiagnostics` (via
 *  a syntactic-only check) becoming non-empty is reported as its own rejected entry rather than
 *  silently walking a best-effort/garbage tree. */
export function parseRegistryExports(headSrc, label = "registry@HEAD") {
  const consts = [];
  const reexports = [];
  const rejected = [];
  const sourceFile = ts.createSourceFile("registry.ts", headSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  // @ts-expect-error — parseDiagnostics is an internal-but-stable field TS itself populates on
  // every createSourceFile call; used here only as a cheap syntactic-validity signal, fail-open
  // toward "no diagnostics field" (an older/newer TS shape) rather than crash the whole checker.
  const syntaxErrors = sourceFile.parseDiagnostics ?? [];
  if (syntaxErrors.length > 0) {
    rejected.push(
      `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: registry.ts did not parse as valid TypeScript (${syntaxErrors.length} syntax error(s)) — the closed-world census cannot run against an unparseable file; REJECTED, fail-closed rather than best-effort.`,
    );
    return { consts, reexports, rejected };
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      if (!hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          rejected.push(
            `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: an exported declarator ("${decl.getText(sourceFile).slice(0, 60)}") is a destructuring pattern, not a plain identifier — REJECTED, fail-closed rather than guessed at.`,
          );
          continue;
        }
        consts.push({ name: decl.name.text, initializerText: decl.initializer ? decl.initializer.getText(sourceFile) : "" });
      }
      continue;
    }
    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) continue; // erased at compile time — zero runtime existence, safe regardless of export modifier
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
      if (!hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) continue;
      const kind = ts.isFunctionDeclaration(stmt) ? "function" : ts.isClassDeclaration(stmt) ? "class" : "enum";
      const name = stmt.name && ts.isIdentifier(stmt.name) ? stmt.name.text : "?";
      rejected.push(
        `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export ${kind} ${name}\` — registry.ts's own closed world admits only \`workflows\`/\`workflowsByName\`, SAFE_WORKFLOWS_DERIVATIONS-shaped consts, and bare unaliased workflow re-exports; a ${kind} declared and exported directly in this file is none of those and is REJECTED on sight.`,
      );
      continue;
    }
    if (ts.isExportAssignment(stmt)) {
      rejected.push(
        `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`${stmt.isExportEquals ? "export =" : "export default"}\` — registry.ts's closed world has no legitimate use for a default export; REJECTED on sight.`,
      );
      continue;
    }
    if (ts.isExportDeclaration(stmt)) {
      // round-6 (novel probe, self-devised): `export type { X } from "..."` / `export { type
      // X, real }` are TYPE-ONLY — erased at compile time (same rationale as the
      // isTypeAliasDeclaration/isInterfaceDeclaration skip above), so they carry ZERO runtime
      // export surface. Neither round-5's regex nor a naive first-draft AST walk distinguishes
      // this from a real re-export; treating a type-only specifier as a value re-export needing
      // workflows/-directory verification is a FALSE-POSITIVE risk (a legitimate type import
      // would be rejected), not a bypass either way — but the correct, precise behavior is to
      // recognize it and skip it, exactly like any other erased-at-compile-time declaration.
      if (stmt.isTypeOnly) continue; // `export type { ... } from "..."` — the WHOLE clause is types only
      const fromModuleSpecifier = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : null;
      if (!stmt.exportClause) {
        rejected.push(
          `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export * from "${fromModuleSpecifier ?? "?"}"\` — a wildcard re-export carries an UNBOUNDED, unverifiable set of names; REJECTED unconditionally.`,
        );
        continue;
      }
      if (ts.isNamespaceExport(stmt.exportClause)) {
        rejected.push(
          `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export * as ${stmt.exportClause.name.text} from "${fromModuleSpecifier ?? "?"}"\` — a namespace wildcard re-export carries an UNBOUNDED, unverifiable set of names; REJECTED unconditionally, never inspected shape-by-shape.`,
        );
        continue;
      }
      // NamedExports — `export { a, b as c }` or `export { a, b as c } from "..."`.
      for (const el of stmt.exportClause.elements) {
        if (el.isTypeOnly) continue; // `export { type X, real }` — X is a per-element type-only specifier
        reexports.push({
          local: el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text,
          exported: el.name.text,
          aliased: !!el.propertyName,
          fromModuleSpecifier,
        });
      }
      continue;
    }
    // Fail-closed catch-all: any OTHER exported top-level statement (a module/namespace
    // declaration, an exported `import X = require(...)`, or any future TS syntax this walk
    // has not been taught) is REJECTED, never silently passed — the closed-world claim depends
    // on this branch existing, not on the enumerated shapes above being exhaustive by inspection.
    if (hasModifier(stmt, ts.SyntaxKind.ExportKeyword) || hasModifier(stmt, ts.SyntaxKind.DefaultKeyword)) {
      rejected.push(
        `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: an \`export\` statement did not match any recognized shape (const/let/var, type/interface, default, function/class/enum, or \`export {...}\` with or without \`from\`/wildcard) — REJECTED, fail-closed on the unrecognized syntax rather than silently passed: \`${stmt.getText(sourceFile).slice(0, 60).trim()}\``,
      );
    }
  }
  return { consts, reexports, rejected };
}

/**
 * Gate G1 MUST D — REGISTRY-VIEW-INTEGRITY. Structural, HEAD-only (a standing
 * shape policy, not a base-diff monotonicity check): the enqueue-provenance
 * check (e) trusts ANY identifier imported from registry.ts as a proven-safe
 * dispatch root, by IMPORT SOURCE alone — that trust is only sound because
 * exactly one dynamic-dispatch view exists (`workflowsByName`) and it is
 * PROVABLY `workflows` itself, not merely a same-shaped copy. Enforces:
 *
 *   1. If `workflowsByName` is exported, its initializer (whitespace-
 *      collapsed) must be EXACTLY `Object.freeze(workflows)` — a spread
 *      copy, a fresh object literal, or an unfrozen alias all LOOK like a
 *      view but prove nothing about reference identity or mutability.
 *   2. No OTHER top-level `export const` (besides `workflows` itself and a
 *      correctly-shaped `workflowsByName`) may have an initializer
 *      mentioning the `workflows` identifier — a second, differently-shaped
 *      "view" would be silently trusted by (e) merely for living in this
 *      file, without ever being proven to alias the real registry.
 *
 * Pure: registry.ts being entirely absent from a change is fine (no
 * violations); an unparseable/wrong-shaped `workflowsByName` when the name
 * IS present is fail-closed, never a skip.
 */
export function checkRegistryViewIntegrity(headSrc, label = "registry@HEAD") {
  const violations = [];
  if (headSrc == null) return violations;
  const parsed = parseRegistryExports(headSrc, label);
  const byName = new Map(parsed.consts.map((e) => [e.name, e]));

  // M8(b) (opus R2 + Codex review), round-6-safe: the check below only recognizes `export
  // const workflowsByName = ...` — an ALIASED RE-EXPORT (`export { fake as workflowsByName }`)
  // or any other export syntax carrying the name is a COMPLETELY different shape. Build the
  // "does this name appear anywhere in the export surface" signal from the SAME AST parse
  // (consts + reexports' own exported names) — round-5's own bare-text regex would itself be
  // fooled by an escaped identifier, exactly the class of bug round-6 exists to close; the
  // parser has already normalized every name by the time it reaches here.
  const declaredExportedNames = [...parsed.consts.map((e) => e.name), ...parsed.reexports.map((e) => e.exported)];
  const occurrences = declaredExportedNames.filter((n) => n === "workflowsByName").length;
  const view = byName.get("workflowsByName");
  if (occurrences > 0 && !view) {
    violations.push(
      `REGISTRY-VIEW-INTEGRITY  ${label}: "workflowsByName" appears in this file's own export surface (${occurrences} occurrence(s)) but NOT as a recognized \`export const workflowsByName = ...\` declaration — an aliased re-export (\`export { x as workflowsByName }\`) or any other export shape is REJECTED, never silently trusted (fail-closed).`,
    );
  } else if (occurrences > 1) {
    violations.push(
      `REGISTRY-VIEW-INTEGRITY  ${label}: "workflowsByName" is exported ${occurrences} times — exactly ONE declaration is ever trusted; a second occurrence anywhere (a duplicate export, a re-export) is REJECTED, never silently ignored.`,
    );
  }

  if (view) {
    const collapsed = view.initializerText.replace(/\s+/g, "");
    if (collapsed !== "Object.freeze(workflows)") {
      violations.push(
        `REGISTRY-VIEW-INTEGRITY  ${label}: "workflowsByName" must be declared as EXACTLY \`Object.freeze(workflows)\` — found \`${view.initializerText.trim().slice(0, 120)}\` instead. Anything else (a spread copy, a fresh literal, an unfrozen alias) is not provably the same object as \`workflows\`, so the enqueue-provenance check's trust in registry.ts exports would no longer be sound (Gate G1 MUST D, fail-closed).`,
      );
    }
  }

  // #11 (round-4 review, REOPENED) — every OTHER top-level const/let/var export must collapse
  // to a SAFE_WORKFLOWS_DERIVATIONS shape, whether or not it references `workflows` in its own
  // text (a plain `export const alternateView = {evil:fn};` mentions nothing about `workflows`
  // at all and must still be caught).
  for (const e of parsed.consts) {
    if (e.name === "workflows" || e.name === "workflowsByName") continue;
    const collapsed = e.initializerText.replace(/\s+/g, "");
    if (!SAFE_WORKFLOWS_DERIVATIONS.has(collapsed)) {
      violations.push(
        `REGISTRY-VIEW-INTEGRITY  ${label}: a second top-level export "${e.name}" is declared as \`${e.initializerText.trim().slice(0, 120)}\`, which is not one of the provably-safe derivations (a bare alias, Object.keys/values/entries, or exactly \`Object.freeze(workflows)\`). Only \`workflowsByName\` (declared as exactly \`Object.freeze(workflows)\`) may be trusted as a dynamic-dispatch view of the registry — any other shape is an ALTERNATE, unverified view that the enqueue-provenance check (e) would trust by import source alone; rename/remove it or fold it into \`workflowsByName\` (Gate G1 MUST D, fail-closed).`,
      );
    }
  }

  violations.push(...checkRegistryExportsClosedWorld(headSrc, parsed, label));

  return violations;
}

/** #11 (round-4 review, both legs, REOPENED; round-6, Codex — rebuilt on the TypeScript
 *  compiler API, see this module's own header) — a CLOSED-WORLD census of EVERY export shape
 *  registry.ts can carry, closing what the checks above (built to catch a suspicious REFERENCE
 *  to `workflows`, or a specific `workflowsByName` mis-declaration) were never built to see.
 *  freeze-lint-enqueue.mjs's own provenance check (classifyWorkflowArg) trusts ANY name
 *  imported FROM registry.ts by CANONICAL NAME (round-4's own fix, pinned to `workflows`/
 *  `workflowsByName` only) — this census is the OTHER half: a bare re-export is legitimate
 *  ONLY if it is UNALIASED (the exported name equals the imported local name) AND names a
 *  binding this file ACTUALLY imported via a path that resolves INSIDE
 *  packages/runtime/workflows/ (round-6, Codex probe 3 — relativity alone,
 *  `spec.startsWith(".")`, does not prove the target stays in-directory; `../../../etc/passwd`
 *  is relative too) — the real, individual frozen workflow exports every class needs for
 *  check-frozen-workflows.mjs's own golden-hash tracking (every historical `chatTurn_v1`..
 *  `chatTurn_v13`, not just whichever is CURRENTLY pointed to inside the `workflows` object —
 *  constraint 9 requires every one of them to stay exported). A DIRECT `export {x} from "..."`
 *  is rejected unconditionally regardless of target — `x` is never bound locally in that
 *  shape, so there is nothing to verify it against; registry.ts's own real pattern is always
 *  import-then-bare-re-export, never this one. Everything else `parseRegistryExports` could not
 *  place in `consts`/`reexports` is already a fully-formed violation in its own `rejected`
 *  list. */
function checkRegistryExportsClosedWorld(headSrc, parsedIn, label) {
  const violations = [];
  const parsed = parsedIn ?? parseRegistryExports(headSrc, label);
  violations.push(...parsed.rejected);

  // round-7 (native adversarial leg, MUST #11) — AST-based, not the regex-based
  // parseImportBindings this used to call (see this module's own header): a decoy string
  // literal shaped like an import statement can no longer be mistaken for a real one.
  const bindings = parseImportBindingsAst(headSrc);

  for (const item of parsed.reexports) {
    if (item.exported === "workflows" || item.exported === "workflowsByName") continue; // covered by checkRegistryViewIntegrity above
    if (item.aliased) {
      violations.push(
        `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export { ${item.local} as ${item.exported} }${item.fromModuleSpecifier ? ` from "${item.fromModuleSpecifier}"` : ""}\` is an ALIASED re-export — even if "${item.local}" is itself a legitimate workflow implementation, exporting it under a DIFFERENT name is indistinguishable from smuggling an unrelated binding out under a plausible-looking one. Re-export under its OWN name only.`,
      );
      continue;
    }
    if (item.fromModuleSpecifier !== null) {
      // `export { x } from "somewhere"` — x is never a local binding at all in THIS file
      // (bindings only tracks THIS file's own `import` statements — a direct re-export never
      // creates one), so there is nothing here to verify it against even when the target DOES
      // resolve inside workflows/. registry.ts's own real pattern is always
      // import-THEN-bare-re-export, never a direct `from` re-export.
      violations.push(
        `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export { ${item.exported} } from "${item.fromModuleSpecifier}"\` is a DIRECT re-export from another module — "${item.local}" is never bound locally in this file at all, so there is nothing to verify it against; registry.ts's own real pattern is always import-then-bare-re-export, never this shape. REJECTED unconditionally.`,
      );
      continue;
    }
    const b = bindings.get(item.local);
    if (!b || !resolvesInsideWorkflowsDir(b.source)) {
      violations.push(
        `REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export { ${item.exported} }\` does not name a binding imported from a path that resolves inside ${WORKFLOWS_DIR}/ — registry.ts's closed world admits only \`workflows\`/\`workflowsByName\`, a SAFE_WORKFLOWS_DERIVATIONS-shaped const, or a bare re-export of an actually-imported workflow file IN THIS DIRECTORY; a freshly-declared local, a non-relative (package) import, or a relative import that escapes ${WORKFLOWS_DIR}/ (round-6, Codex probe 3 — relativity alone is not target verification) is REJECTED on sight (fail-closed).`,
      );
    }
  }

  return violations;
}
