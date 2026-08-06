// GH #152 — THE PARK/HOOK INVERSION. Two regression cells, one per half of the fix.
//
// THE BUG. clientOnboarding_v1/v2 and firmInterview_v1/v2 ANNOUNCED a park before ARMING it:
// `streamPromptStep` (which makes the park visible to GET /state) ran first and `createHook`
// second. WDK registers a hook only when the workflow SUSPENDS (@workflow/core create-hook.d.ts:
// "Calling createHook() alone does not register the hook — registration only happens when the
// workflow suspends"), so those two lines landed in two DIFFERENT suspensions and every park was
// briefly VISIBLE-BUT-UNARMED. An answer POSTed in that window raised HookNotFoundError, which
// interviewRoutes maps to 409 not_pending — a status whose documented contract is "already
// delivered" — so the answer was silently DROPPED. Measured on the durable record before the fix:
// 44/44 parks armed 1.4–55.6 ms AFTER their announce chunk; after it, 567/567 armed 41–266 ms
// BEFORE. The e2e saw it as "scripted answers for segment 'X' are exhausted" (the driver
// re-dequeued on the 409 retry) and as "cancel → 200 (got 409)" — one cause, two signatures.
//
// THE GUARD IS AST-BASED, NOT TEXTUAL. The first version of this cell compared `indexOf` offsets
// of two source substrings inside a slice delimited by `"\n  };"` — i.e. by INDENTATION. Three
// ways that lies: a comment or string literal mentioning `createHook(` ahead of the announce buys
// a FALSE GREEN; a reformat (a line-wrapped generic, a re-indented body) either moves the
// closure's end marker so the wrong region is compared, or drops a token to -1 and reds
// honestly-correct source; and the closure could be renamed out from under it. So the source is
// now PARSED — with the TypeScript compiler API, already a direct devDependency of this package —
// and the question is put to the syntax tree: inside the `ask` function, does the STATEMENT that
// calls createHook come before the STATEMENT that awaits streamPromptStep? Comments and string
// literals are not call expressions and cannot vote; whitespace has no representation in the tree
// at all; and the type argument is ignored, so `createHook<Anything>(...)` still counts.
//
// AND IT IS FAIL-CLOSED ON UNKNOWN (the ADR-059 armour law), because "parses the source" is not
// the same as "cannot be fooled". A cross-model review of the first AST cut MEASURED three false
// greens, each reproduced here before it was closed:
//   · `if (false) { createHook(...) }` ahead of the announce — an arm that never runs;
//   · `createHook(await streamPromptStep(...))` — one statement, where the ANNOUNCE (the
//     argument) evaluates FIRST, so written order is exactly backwards;
//   · a correctly-ordered but UNUSED `ask` sitting beside the real, inverted `askPark`.
// A SECOND review round then measured a FOURTH, from the same root — a hand-rolled notion of
// "function": a `class Armer { constructor() { createHook(...) } }` DECLARED before the announce
// and INSTANTIATED after it read as an earlier arm, because the boundary test knew about
// functions and arrows but not constructors. The boundary test is now the compiler's own
// `ts.isFunctionLike`, which is the lesson generalised: do not re-implement the language.
//
// A fourth round then made the deepest point: SPELLING IS NOT IDENTITY. Matching a callee by
// name proves nothing, because a local `function createHook() {}` shadowing the real import
// satisfies "arms before it announces" while the engine's hook is never created at all. So both
// names are first proven to BE their imports — a single named import from the expected module,
// and no other binding of that name anywhere in the file.
//
// So the guard now names the only shape it will certify, and REFUSES everything else instead of
// guessing: both names proven to be the real imports; exactly one `ask`; no createHook anywhere
// else in the file; exactly one arm and one announce inside it; the announce directly awaited;
// both calls unconditional top-level statements of the ask body in the canonical `const x =
// createHook(...)` / `await streamPromptStep(...)` forms; and the two in DIFFERENT statements,
// because intra-statement order is evaluation order, not text order.
// A refusal is a red cell with a diagnosis naming the construct — never a silent pass.
//
// TWO LATER ROUNDS (found convergently by a native review and a Codex pass) closed the last two
// holes, and both were holes of SCOPE rather than of shape — the guard was reading less of the
// file than it was implicitly claiming to:
//   · G1, ASYMMETRIC COUNTING. Arms were collected FILE-WIDE and refused unless they sat in the
//     analysed `ask`; announces were only ever collected INSIDE `ask`. So a top-level `await
//     streamPromptStep(...)` in the exported body — a park made visible with no hook armed for
//     it, i.e. GH #152 by hand — was invisible here and stayed green, while being loud in
//     production (it 409s every answer aimed at that park). Both names are now counted the same
//     way, and a stray call of either is refused with its line number.
//   · G2, AN UNREACHED `ask`. The guard proved `ask` was the only arming site in the file, never
//     that anything REACHES it. A dead `ask` arms no hook at all, and the verdict would still
//     have read clean. The exported body must now use the `ask` identifier at least once — as a
//     direct call or, as the registered bodies actually do, by handing the closure to the shared
//     segment driver. What that proves is deliberately stated no wider than it is: the body
//     reaches the closure. Whether the driver invokes its callback lives in another module and is
//     not this guard's to claim.
//
// These cells are pure: no WDK engine, no DB, no server. They lock in both halves cheaply enough
// to run in the unit battery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = join(HERE, "..", "workflows");

const ARM = "createHook";
const ANNOUNCE = "streamPromptStep";

/** WHERE each name must come from. A guard that matches a callee by SPELLING proves nothing: a
 *  local `function createHook() {}` shadowing the real import satisfies "arms before it
 *  announces" while the engine's hook is never created. So each name must be proven to BE the
 *  import — bound by a named import from the expected module, with no other binding of that name
 *  anywhere in the file. */
const ARM_MODULE = /^workflow$/;
const ANNOUNCE_MODULE = /^\.\/interview\.v\d+\.steps\.js$/;

function parse(file, src) {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TS);
}

/** Peel `as const` / parentheses off an expression. */
function unwrap(node) {
  let n = node;
  while (ts.isAsExpression(n) || ts.isParenthesizedExpression(n)) n = n.expression;
  return n;
}

/** ANY function-like boundary — the compiler's own predicate, which covers constructors,
 *  get/set accessors and methods as well as functions and arrows. A hand-rolled list missed
 *  constructors, and a `class Armer { constructor() { createHook(...) } }` declared before the
 *  announce then instantiated after it read as an earlier arm. Do not narrow this back. */
function isFunctionBoundary(n) {
  return ts.isFunctionLike(n);
}

/** A callable WITH a body, for spotting `const ask = ... =>` / `function ask()`. */
function isCallableWithBody(n) {
  return ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n);
}

/** A call to the BARE identifier `name`. A property call (`o.createHook()`) is deliberately NOT
 *  a match: it is a different function, and counting it was a way to fake an arm. */
function isBareCallTo(n, name) {
  return ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name;
}

/** Every bare call to `name` anywhere under `node` (nested functions included — the caller
 *  decides what to do about them; this walk never silently drops a candidate). */
function collectCalls(node, name) {
  const out = [];
  const visit = (n) => {
    if (isBareCallTo(n, name)) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** Nodes whose presence between a call and the function body means the call is CONDITIONAL or
 *  REPEATED, so its written position no longer implies it runs, or runs once, at that point. */
function isControlFlow(n) {
  return (
    ts.isIfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
    ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isSwitchStatement(n) || ts.isCaseClause(n) ||
    ts.isTryStatement(n) || ts.isCatchClause(n) || ts.isConditionalExpression(n) ||
    (ts.isBinaryExpression(n) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]
        .includes(n.operatorToken.kind))
  );
}

/** Locate `call` as an UNCONDITIONAL top-level statement of `body`, and insist the statement is
 *  the CANONICAL shape for its role. Returns { index } or { refused: <why> } — never a guess.
 *
 *  The canonical-shape rule is what finally ended the false-green hunt. Successive rounds each
 *  found another construct whose written position is not its execution order — a dead `if
 *  (false)`, an argument evaluated before its callee, a constructor, a class instance FIELD, a
 *  skipped destructuring default, a statement after `break` in a labelled block, `maybe?.(
 *  createHook())` whose argument is skipped when the callee is absent. Enumerating them is a
 *  losing game, so the guard stopped enumerating: the arm must be exactly a top-level
 *  `const <id> = createHook(...)` and the announce exactly a top-level `await
 *  streamPromptStep(...)`. That is the shape every registered body actually uses; every other
 *  shape — however innocent — is REFUSED and must be re-certified by a human. */
function topLevelStatementOf(body, call, label) {
  let n = call;
  while (n.parent && n.parent !== body) {
    n = n.parent;
    if (isFunctionBoundary(n)) return { refused: `the ${label} call sits inside a NESTED FUNCTION, so its position does not say when it runs` };
    if (isControlFlow(n)) return { refused: `the ${label} call sits inside a CONDITIONAL or LOOP (${ts.SyntaxKind[n.kind]}), so its position does not prove it runs there` };
  }
  const index = body.statements.indexOf(n);
  if (index < 0) return { refused: `the ${label} call could not be tied to a top-level statement of 'ask'` };

  if (label === ARM) {
    // exactly: const <identifier> = createHook(...);
    const ok =
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1 &&
      ts.isIdentifier(n.declarationList.declarations[0].name) &&
      n.declarationList.declarations[0].initializer === call;
    if (!ok) return { refused: `the ${ARM} call is not the canonical \`const <name> = ${ARM}(...)\` statement (found ${ts.SyntaxKind[n.kind]}), so the guard will not certify when it runs` };
  } else {
    // exactly: await streamPromptStep(...);
    const ok = ts.isExpressionStatement(n) && ts.isAwaitExpression(n.expression) && n.expression.expression === call;
    if (!ok) return { refused: `the ${ANNOUNCE} call is not the canonical \`await ${ANNOUNCE}(...)\` statement (found ${ts.SyntaxKind[n.kind]}), so the guard will not certify when it runs` };
  }
  return { index };
}

/** Every identifier a BindingName introduces, INCLUDING nested destructuring and defaults —
 *  `const { createHook } = decoy` binds the name just as surely as `function createHook()`. */
function boundNames(name, out = []) {
  if (!name) return out;
  if (ts.isIdentifier(name)) out.push(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) if (ts.isBindingElement(el)) boundNames(el.name, out);
  }
  return out;
}

/** Prove `name` in this file IS the named import from a module matching `moduleRe`, and that
 *  NOTHING ELSE in the file binds that name. Returns null when proven, else the refusal reason.
 *
 *  Three ways this was defeated before, all now closed:
 *    · `streamTerminalStep as streamPromptStep` — the LOCAL name matched while the imported
 *      symbol was a different function entirely. The import's propertyName must match too.
 *    · `const { createHook } = decoy` — a destructured binding is a binding; binding PATTERNS
 *      are now walked, not just plain identifiers.
 *    · a `import type { … }` of the same name, which binds nothing at runtime.
 *  The set of ways a module-level name can be bound is small and closed, so it is enumerated
 *  exhaustively here rather than approximated. */
function bindingRefusal(sf, name, moduleRe) {
  let imported = 0;
  let other = 0;
  let aliased = false;
  let typeOnly = false;

  const visit = (n) => {
    if (ts.isImportSpecifier(n) && n.name.text === name) {
      const clause = n.parent.parent;
      const spec = clause.parent.moduleSpecifier;
      if (n.isTypeOnly || clause.isTypeOnly) typeOnly = true;
      else if (n.propertyName && n.propertyName.text !== name) aliased = true;
      else if (ts.isStringLiteral(spec) && moduleRe.test(spec.text)) imported++;
      else other++;
    } else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name?.text === name) other++;
    else if (ts.isVariableDeclaration(n) && boundNames(n.name).includes(name)) other++;
    else if (ts.isParameter(n) && boundNames(n.name).includes(name)) other++;
    else if (ts.isCatchClause(n) && boundNames(n.variableDeclaration?.name).includes(name)) other++;
    else if (ts.isImportClause(n) && n.name?.text === name) other++;
    else if (ts.isNamespaceImport(n) && n.name.text === name) other++;
    else if (ts.isImportEqualsDeclaration(n) && n.name.text === name) other++;
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // A NAMESPACE import reaches the very same export under a different spelling —
  // `import * as w from "workflow"` then `w.createHook()` is the real arm, invisible to a
  // bare-identifier walk. Both angles are refused: the namespace import itself, and any
  // property call bearing the name whatever its object.
  let namespaced = 0;
  let qualifiedCalls = 0;
  const visit2 = (n) => {
    if (ts.isNamespaceImport(n)) {
      const spec = n.parent.parent.moduleSpecifier;
      if (ts.isStringLiteral(spec) && moduleRe.test(spec.text)) namespaced++;
    } else if (
      ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === name
    ) qualifiedCalls++;
    ts.forEachChild(n, visit2);
  };
  visit2(sf);
  if (namespaced > 0) return `the module providing '${name}' is also imported as a NAMESPACE — '${name}' could be reached qualified, where a bare-identifier walk cannot see it`;
  if (qualifiedCalls > 0) return `'${name}' is called as a PROPERTY (${qualifiedCalls} site(s)) — the guard reads bare calls only, so a qualified call would be invisible to the ordering test`;

  if (typeOnly) return `'${name}' is imported TYPE-ONLY — it binds nothing at runtime, so no call of that name can be the real one`;
  if (aliased) return `'${name}' is an ALIAS for a different export — the local spelling matches but the imported symbol does not`;
  if (imported === 0) return `'${name}' is not imported from a module matching ${moduleRe} — the call cannot be proven to be the real one`;
  if (imported > 1) return `'${name}' is imported ${imported} times — ambiguous, refused`;
  if (other > 0) return `'${name}' is ALSO bound locally (${other} other binding(s)) — a shadowing declaration means the call site may not be the import at all`;
  return null;
}

/** The owning function-like node of `n`, or undefined at module scope. */
function ownerFunctionOf(n) {
  let owner = n.parent;
  while (owner && !isFunctionBoundary(owner)) owner = owner.parent;
  return owner;
}

/** 1-based line of a node, for a diagnosis that NAMES the offending site rather than gesturing
 *  at it — a refusal a reader cannot locate costs as much time as no refusal at all. */
function lineOf(sf, n) {
  return sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
}

/** G1 — NEITHER CALL MAY LIVE OUTSIDE THE ANALYSED CLOSURE, and the two halves are checked the
 *  SAME WAY. Arms were already counted file-wide; announces were counted only INSIDE `ask`, and
 *  that asymmetry was a hole with a name: a top-level `await streamPromptStep(...)` in the
 *  exported body — a park announced with no hook armed for it, which 409s every answer aimed at
 *  it — was simply invisible to this guard and stayed green. An announce outside `ask` is exactly
 *  as disqualifying as an arm outside it: in both cases the file asks parks in more than one
 *  place, and certifying the ordering of one of them says nothing about the other. */
function outsideAskRefusal(sf, ask, name) {
  for (const c of collectCalls(sf, name)) {
    if (ownerFunctionOf(c) !== ask) {
      return `a ${name}() call lives OUTSIDE the analysed 'ask' closure (line ${lineOf(sf, c)}) — this file asks parks in more than one place, and the guard will not certify only one of them`;
    }
  }
  return null;
}

/** Every declaration site that BINDS the name `ask` in this file, by the same exhaustive
 *  enumeration `bindingRefusal` uses for the imports. Used to prove that a reference to `ask`
 *  anywhere in the file can only be the closure this guard analysed. */
function askBindings(sf) {
  const out = [];
  const visit = (n) => {
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name?.text === "ask") out.push(n);
    else if (ts.isVariableDeclaration(n) && boundNames(n.name).includes("ask")) out.push(n);
    else if (ts.isParameter(n) && boundNames(n.name).includes("ask")) out.push(n);
    else if (ts.isCatchClause(n) && boundNames(n.variableDeclaration?.name).includes("ask")) out.push(n);
    else if (ts.isImportSpecifier(n) && n.name.text === "ask") out.push(n);
    else if (ts.isImportClause(n) && n.name?.text === "ask") out.push(n);
    else if (ts.isNamespaceImport(n) && n.name.text === "ask") out.push(n);
    else if (ts.isImportEqualsDeclaration(n) && n.name.text === "ask") out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Is `node` lexically inside `ancestor`? */
function isInside(node, ancestor) {
  let n = node.parent;
  while (n && n !== ancestor) n = n.parent;
  return n === ancestor;
}

/** Is this identifier a USE of a binding, rather than the place a binding is DECLARED (or a
 *  property/label that merely happens to be spelled the same)? */
function isValueReference(id) {
  const p = id.parent;
  if (!p) return false;
  if ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) ||
       ts.isParameter(p) || ts.isBindingElement(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) ||
       ts.isNamespaceImport(p) || ts.isExportSpecifier(p) || ts.isPropertyAssignment(p) ||
       ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) &&
      p.name === id) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false; // `o.ask` is not our `ask`
  if (ts.isQualifiedName(p) && p.right === id) return false;
  return true;
}

/** G2 — IS `ask` ACTUALLY REACHED FROM THE BODY THE REGISTRY RUNS? The ordering verdict is only
 *  worth something if the closure it certifies is wired into the workflow at all: an `ask` that
 *  nothing reaches arms no hook, every park is announced by something else (or never), and the
 *  guard would still have reported a clean arm-before-announce. That is loud at runtime, but a
 *  static guard that can say so statically should.
 *
 *  WHAT IT PROVES, EXACTLY — and the honesty matters, because overclaiming here would be the same
 *  error as reading a derived state as evidence. It proves the exported body REACHES the analysed
 *  closure: the `ask` identifier is used as a value at least once inside the exported function, and
 *  that identifier can only be this closure. It does NOT prove `ask` is invoked — the registered
 *  bodies do not call it directly at all; they hand it to the shared segment driver
 *  (`askAndConfirmSegmentV2(seg, ask, prior)`), and whether the driver calls its callback is a
 *  fact in another module and out of this guard's reach. So a direct call and a hand-off both
 *  count as REACHED, and the finding reports which it saw. A reference from INSIDE `ask` itself
 *  does not count: a closure that only calls itself is not reached by anything.
 *
 *  SPELLING IS NOT IDENTITY applies here too, and it is the reason this insists on exactly one
 *  binding of the name in the whole file: without that, a reference inside a nested scope that
 *  declares its OWN `ask` would be counted as reaching the analysed closure while resolving to a
 *  local decoy — the same shadowing trick `bindingRefusal` closes for the imports. */
function askReachabilityRefusal(sf, ask, ident) {
  const exported = sf.statements.find(
    (st) => ts.isFunctionDeclaration(st) && st.name?.text === ident &&
      st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
  );
  if (!exported || !exported.body) return { refused: `the exported body '${ident}' has no analysable function declaration in this file` };

  // The analysed closure must live INSIDE the exported body. An `ask` declared at module scope,
  // or inside some other function, is not this workflow's asking closure whatever it is called.
  let scope = ask.parent;
  while (scope && scope !== exported) scope = scope.parent;
  if (scope !== exported) return { refused: `the 'ask' closure is not declared inside the exported body '${ident}' — a closure the registered function does not own cannot be the one arming its parks` };

  const bindings = askBindings(sf);
  if (bindings.length !== 1) {
    return { refused: `'ask' is bound ${bindings.length} times in this file — a SHADOWING declaration means a reference to 'ask' need not be the analysed closure at all, so reachability cannot be proven` };
  }
  // …and that one binding must be the analysed closure's own declaration.
  const decl = ask.parent && ts.isVariableDeclaration(ask.parent) ? ask.parent : ask;
  if (bindings[0] !== decl) return { refused: `the single 'ask' binding is not the analysed closure's own declaration` };

  let calls = 0;
  let handoffs = 0;
  const visit = (n) => {
    if (ts.isIdentifier(n) && n.text === "ask" && isValueReference(n) && !isInside(n, ask)) {
      if (ts.isCallExpression(n.parent) && n.parent.expression === n) calls++;
      else handoffs++;
    }
    ts.forEachChild(n, visit);
  };
  visit(exported.body);

  if (calls + handoffs === 0) {
    return { refused: `'ask' is never reached from the exported body '${ident}' — it is neither called nor handed to anything, so no hook it arms can ever be created` };
  }
  return { calls, handoffs };
}

/** Every `ask` function in a workflow body — `const ask = ... =>` or `function ask()`. */
function findAskFunctions(sf) {
  const hits = [];
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "ask" &&
      n.initializer && isCallableWithBody(n.initializer)
    ) hits.push(n.initializer);
    else if (ts.isFunctionDeclaration(n) && n.name?.text === "ask") hits.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/** The interview bodies the REGISTRY actually points at, resolved from the registry's own AST —
 *  so a future _v4 repoint is covered by this guard automatically instead of silently escaping
 *  it. Throws when the registry cannot be read at all (a structural failure, not a verdict). */
export function registeredInterviewBodies(workflowsDir = WORKFLOWS) {
  const file = join(workflowsDir, "registry.ts");
  const sf = parse(file, readFileSync(file, "utf8"));

  let table = null;
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === "workflows" && d.initializer) {
        const init = unwrap(d.initializer);
        if (ts.isObjectLiteralExpression(init)) table = init;
      }
    }
  }
  if (!table) throw new Error("registry.ts declares no `workflows` object literal");

  // A SPREAD can silently override an earlier entry — `{ clientOnboarding: v3, ...{
  // clientOnboarding: v2 } }` runs v2 while a first-match resolver certifies v3. The table must
  // therefore contain no spreads at all, and exactly one assignment per guarded class.
  if (table.properties.some((p) => ts.isSpreadAssignment(p))) {
    throw new Error("registry.ts's `workflows` table contains a SPREAD — a later spread can override a guarded entry, so the effective body cannot be resolved statically");
  }

  const bodies = [];
  for (const cls of ["firmInterview", "clientOnboarding"]) {
    const matches = table.properties.filter(
      (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === cls,
    );
    if (matches.length !== 1) throw new Error(`registry.ts declares '${cls}' ${matches.length} times — the effective body is ambiguous`);
    const prop = matches[0];
    if (!ts.isIdentifier(prop.initializer)) {
      throw new Error(`registry.ts names no plain identifier for '${cls}'`);
    }
    const ident = prop.initializer.text;

    // The registry entry must be a NON-ALIASED, non-type-only named import: `import {
    // decoyWorkflow as clientOnboarding_v3 }` would otherwise let the guard certify the correct
    // but UNUSED `ask` in clientOnboarding.v3.ts while the registry runs the decoy.
    let spec = null;
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st)) continue;
      const named = st.importClause?.namedBindings;
      if (!named || !ts.isNamedImports(named)) continue;
      const el = named.elements.find((e) => e.name.text === ident);
      if (!el) continue;
      if (el.isTypeOnly || st.importClause.isTypeOnly) throw new Error(`registry.ts imports '${ident}' TYPE-ONLY — it binds no workflow body`);
      if (el.propertyName && el.propertyName.text !== ident) {
        throw new Error(`registry.ts binds '${ident}' to a DIFFERENT export ('${el.propertyName.text}') — the name in the table is not the function that would run`);
      }
      spec = st.moduleSpecifier.text;
    }
    if (!spec) throw new Error(`registry.ts imports '${ident}' from nowhere resolvable`);

    const file = `${spec.replace(/^\.\//, "").replace(/\.js$/, "")}.ts`;
    // …and that module must really EXPORT a function of that exact name.
    const bodySf = parse(join(workflowsDir, file), readFileSync(join(workflowsDir, file), "utf8"));
    const exportsIt = bodySf.statements.some(
      (st) => ts.isFunctionDeclaration(st) && st.name?.text === ident &&
        st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
    );
    if (!exportsIt) throw new Error(`${file} does not export a function named '${ident}' — the registry entry cannot be tied to a body`);

    bodies.push({ cls, ident, file });
  }
  return bodies;
}

/** THE VERDICT, AS DATA. One finding per registered interview class:
 *  `{ cls, ident, file, ok, detail }` — ok===false is an order inversion, a missing call, or an
 *  `ask` this guard cannot locate. Exported so the guard itself can be exercised against a
 *  deliberately inverted copy of the workflows directory without a test-only knob in the source. */
export function analyzeParkOrdering(workflowsDir = WORKFLOWS) {
  return registeredInterviewBodies(workflowsDir).map(({ cls, ident, file }) => {
    const where = `${cls} -> ${ident} (${file})`;
    const path = join(workflowsDir, file);
    const sf = parse(path, readFileSync(path, "utf8"));

    const refuse = (why) => ({ cls, ident, file, ok: false, detail: `${where}: ${why}` });

    // SPELLING IS NOT IDENTITY. Prove both names are the real imports before reading any order.
    const armBinding = bindingRefusal(sf, ARM, ARM_MODULE);
    if (armBinding) return refuse(armBinding);
    const announceBinding = bindingRefusal(sf, ANNOUNCE, ANNOUNCE_MODULE);
    if (announceBinding) return refuse(announceBinding);

    const asks = findAskFunctions(sf);
    if (asks.length !== 1) return refuse(`expected exactly one 'ask' function, found ${asks.length}`);
    const ask = asks[0];
    const body = ask.body;
    if (!body || !ts.isBlock(body)) return refuse("'ask' has no block body to analyse");

    // NEITHER CALL MAY LIVE OUTSIDE THE ANALYSED CLOSURE (G1). A second park-asking closure (an
    // `askPark` beside a decoy `ask`) would otherwise let the guard certify a function nobody
    // calls — and a bare announce outside `ask` is a park nothing ever armed.
    const strayArm = outsideAskRefusal(sf, ask, ARM);
    if (strayArm) return refuse(strayArm);
    const strayAnnounce = outsideAskRefusal(sf, ask, ANNOUNCE);
    if (strayAnnounce) return refuse(strayAnnounce);

    // AND THE CLOSURE MUST BE REACHED FROM THE REGISTERED BODY (G2) — an `ask` nothing reaches
    // arms nothing, however perfectly ordered it is.
    const reach = askReachabilityRefusal(sf, ask, ident);
    if (reach.refused) return refuse(reach.refused);

    // Exactly one of each inside `ask`. Two arms or two announces is ambiguous, and ambiguity
    // is refused rather than guessed (the ADR-059 fail-closed-on-unknown law).
    const arms = collectCalls(body, ARM);
    const announces = collectCalls(body, ANNOUNCE);
    if (arms.length === 0) return refuse(`'ask' never calls ${ARM}() — it arms no hook at all`);
    if (announces.length === 0) return refuse(`'ask' never calls ${ANNOUNCE}() — it announces no park at all`);
    if (arms.length > 1) return refuse(`'ask' calls ${ARM}() ${arms.length} times — ambiguous, refused`);
    if (announces.length > 1) return refuse(`'ask' calls ${ANNOUNCE}() ${announces.length} times — ambiguous, refused`);

    // THE ANNOUNCE MUST BE AWAITED. The await IS the suspension the arm has to beat; an
    // un-awaited announce is a different (and broken) shape, not a passing one.
    if (!announces[0].parent || !ts.isAwaitExpression(announces[0].parent)) {
      return refuse(`the ${ANNOUNCE}() call is not directly awaited — the suspension it is supposed to be cannot be proven`);
    }

    const arm = topLevelStatementOf(body, arms[0], ARM);
    if (arm.refused) return refuse(arm.refused);
    const announce = topLevelStatementOf(body, announces[0], ANNOUNCE);
    if (announce.refused) return refuse(announce.refused);

    // SAME STATEMENT => REFUSE. `createHook(await streamPromptStep(...))` reads arm-then-announce
    // left to right but EVALUATES the argument first, so textual position is exactly backwards
    // there. The guard does not adjudicate intra-statement order; it declines to certify it.
    if (arm.index === announce.index) {
      return refuse(`${ARM}() and ${ANNOUNCE}() share statement ${arm.index} — written order is not evaluation order inside one expression, so this shape is refused rather than certified`);
    }

    const armFirst = arm.index < announce.index;
    return {
      cls, ident, file, ok: armFirst,
      detail: armFirst
        ? `${where}: arms at statement ${arm.index}, announces (awaited) at statement ${announce.index}; 'ask' reached from ${ident} (${reach.calls} direct call(s), ${reach.handoffs} hand-off(s))`
        : `${where} ANNOUNCES BEFORE IT ARMS (announce at statement ${announce.index}, arm at statement ${arm.index}).`,
    };
  });
}

test("GH #152: every REGISTERED interview body arms its hook BEFORE it announces the park", () => {
  const findings = analyzeParkOrdering();
  assert.equal(findings.length, 2, "both interview classes are registered");

  for (const f of findings) {
    // THE WHOLE POINT. createHook() only enqueues; the engine persists hook_created at the next
    // suspension, and at that suspension it creates hooks BEFORE dispatching any step
    // (@workflow/core runtime/suspension-handler.js: "Process hooks first to prevent race
    // conditions with webhook receivers"). Awaiting streamPromptStep IS that suspension — so the
    // arm must come FIRST for the token to be durable before the park is visible.
    assert.ok(
      f.ok,
      `${f.detail} That reopens the GH #152 window: the park becomes visible via GET /state ` +
        `while its hook does not yet exist, an answer POSTed in that window raises ` +
        `HookNotFoundError, and the route reports 409 not_pending — which clients treat as ` +
        `"already delivered", so a real answer is silently dropped. Put createHook(...) BEFORE ` +
        `await streamPromptStep(...), as chatTurn.v8 does.`,
    );
  }
});

test("GH #152: the guard REFUSES every shape whose written position is not its execution order", () => {
  // The false-green museum. Every entry was MEASURED green against an earlier cut of this guard
  // across three review rounds; each is an inversion or a non-arm, and each must now be refused.
  // They live here so the armour is checked by CI rather than by memory.
  const src = readFileSync(join(WORKFLOWS, "clientOnboarding.v3.ts"), "utf8");
  const armRe = /^.*const hook = createHook<Resolution>\(.*$/m;
  const annRe = /^.*await streamPromptStep\(.*$/m;
  const armExpr = src.match(armRe)[0].trim().replace(/^const hook = /, "").replace(/;$/, "");
  const ann = src.match(annRe)[0];
  // Anchors for the G1/G2 mutations: a statement of the EXPORTED body (outside `ask`), and a
  // statement of a DIFFERENT nested closure inside it.
  const OWNER_LINE = '  await streamOwnerStep({ scope: "client", planId });';
  const RES0_LINE = "    let res = res0;";

  // Each shape carries the REASON it must be refused for. Asserting only `ok === false` would
  // let a shape start passing for an unrelated reason and quietly stop testing what it was
  // written for — a self-test that has silently gone vacuous is worse than none.
  const shapes = [
    ["the arm inside `if (false)`",
      (s) => s.replace(armRe, `    if (false) { const hook = ${armExpr}; }\n    const hook = null as never;`), /CONDITIONAL or LOOP/],
    ["the announce as the arm's own ARGUMENT (it evaluates first)",
      // The canonical-shape rule now catches this before the same-statement rule can: an
      // announce buried in the arm's arguments is not `await streamPromptStep(...)` either way.
      (s) => s.replace(annRe, "").replace(armRe, `    const hook = createHook<Resolution>(({ x: ${ann.trim().replace(/;$/, "")} }) as never);`), /canonical|share statement/],
    ["a constructor arming, instantiated after the announce",
      (s) => s.replace(armRe, `    class A { h: unknown; constructor() { this.h = ${armExpr}; } }`).replace(annRe, `${ann}\n    const hook = new A().h as never;`), /OUTSIDE the analysed|canonical/],
    ["an instance FIELD arming, instantiated after the announce",
      (s) => s.replace(armRe, `    class A { h = ${armExpr}; }`).replace(annRe, `${ann}\n    const hook = new A().h as never;`), /OUTSIDE the analysed|canonical/],
    ["a skipped destructuring default",
      (s) => s.replace(armRe, `    const { z: hook = ${armExpr} } = { z: 1 as never };`), /canonical/],
    ["an unreachable arm after `break` in a labelled block",
      (s) => s.replace(armRe, `    let hook: never = null as never;\n    lbl: { break lbl; hook = ${armExpr}; }`), /canonical/],
    ["`maybe?.(createHook())`, whose argument is skipped",
      (s) => s.replace(armRe, `    const maybe: ((x: unknown) => never) | undefined = undefined;\n    const hook = maybe?.(${armExpr}) as never;`), /canonical/],
    // SPELLING IS NOT IDENTITY: a local decoy named like the import satisfies the order test
    // while the REAL hook is never created.
    ["a local `createHook` shadowing the real import",
      (s) => s.replace('import { createHook } from "workflow";', 'import { createHook as realCreateHook } from "workflow";\nfunction createHook<T>(_a: unknown): T { return null as T; }\nvoid realCreateHook;'), /not imported from a module|bound locally/],
    ["a local `streamPromptStep` shadowing the real import",
      (s) => s.replace("import { mintOpKeyStep, runIdStep, streamPromptStep,", "import { mintOpKeyStep, runIdStep, streamPromptStep as realStreamPromptStep,")
        .replace(armRe, `    async function streamPromptStep(_a: unknown): Promise<void> { void realStreamPromptStep; }\n${src.match(armRe)[0]}`), /not imported from a module|bound locally/],
    // …and the same trick one level subtler: the local NAME is right, the imported SYMBOL is not.
    ["`streamTerminalStep as streamPromptStep` — right spelling, wrong export",
      (s) => s.replace("import { mintOpKeyStep, runIdStep, streamPromptStep,", "import { mintOpKeyStep, runIdStep, streamTerminalStep as streamPromptStep,"), /ALIAS for a different export/],
    ["`const { createHook } = decoy` — a DESTRUCTURED shadow",
      (s) => s.replace(armRe, `    const decoy = { createHook: <T,>(_a: unknown): T => null as T };\n    const { createHook } = decoy;\n${src.match(armRe)[0]}`), /bound locally/],
    ["a TYPE-ONLY import of createHook, which binds nothing at runtime",
      (s) => s.replace('import { createHook } from "workflow";', 'import type { createHook } from "workflow";'), /TYPE-ONLY/],
    ["a NAMESPACE import of the arm's module, reachable qualified",
      (s) => s.replace('import { createHook } from "workflow";', 'import { createHook } from "workflow";\nimport * as workflowNs from "workflow";\nvoid workflowNs;'), /NAMESPACE/],
    ["a QUALIFIED `ns.createHook()` call the bare-identifier walk cannot see",
      (s) => s.replace(armRe, `    const ns = { createHook: <T,>(_a: unknown): T => null as T };\n    void ns.createHook(1);\n${src.match(armRe)[0]}`), /called as a PROPERTY/],

    // G1 — THE ASYMMETRY. Arms were counted file-wide, announces only inside `ask`, so an
    // announce ANYWHERE ELSE in the file was invisible and the cell stayed green. Both of these
    // are a park made visible with no hook armed for it: the exact GH #152 window, hand-written.
    ["a stray top-level announce in the exported body, outside `ask`",
      (s) => s.replace(OWNER_LINE, `${OWNER_LINE}\n  await streamPromptStep({ parkIndex: -1, seg: "stray", phase: "q", question: "unarmed", scope: "client" });`),
      /streamPromptStep\(\) call lives OUTSIDE the analysed/],
    ["a stray announce inside a DIFFERENT nested closure (not module scope — the check is not just 'top level')",
      (s) => s.replace(RES0_LINE, `    await streamPromptStep({ parkIndex: -1, seg: "stray", phase: "q", question: "unarmed", scope: "client" });\n${RES0_LINE}`),
      /streamPromptStep\(\) call lives OUTSIDE the analysed/],

    // G2 — AN UNREACHED `ask`. A perfectly ordered closure nothing reaches arms nothing at all.
    ["an `ask` the exported body never reaches (every hand-off replaced by an inline stand-in)",
      (s) => s.replaceAll("askAndConfirmSegmentV2(seg, ask, prior)", "askAndConfirmSegmentV2(seg, (async () => null) as never, prior)"),
      /never reached from the exported body/],
    // …and SPELLING IS NOT IDENTITY, one more time: a reference that resolves to a LOCAL decoy
    // is not a reference to the analysed closure. Deliberately written `as never` so it slips
    // past `findAskFunctions` (which only counts callables-with-body) — this is precisely the
    // shape the old "exactly one ask function" check could not see.
    ["a LOCAL `ask` shadowing the analysed closure at a real hand-off site",
      (s) => s.replace(RES0_LINE, `    const ask = (async () => null) as never;\n${RES0_LINE}`),
      /bound 2 times in this file/],
  ];

  for (const [label, mutate, reason] of shapes) {
    const dir = mkdtempSync(join(tmpdir(), "park-order-selftest-"));
    try {
      cpSync(WORKFLOWS, dir, { recursive: true });
      const mutated = mutate(src);
      assert.notEqual(mutated, src, `the "${label}" mutation did not apply — this self-test would be VACUOUS`);
      writeFileSync(join(dir, "clientOnboarding.v3.ts"), mutated);
      const finding = analyzeParkOrdering(dir).find((f) => f.file === "clientOnboarding.v3.ts");
      assert.equal(finding.ok, false, `the guard must REFUSE ${label}, but it certified it: ${finding.detail}`);
      assert.match(finding.detail, reason, `${label} was refused, but for the WRONG reason: ${finding.detail}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("GH #152: the guard REFUSES a registry that does not resolve to the body it certifies", () => {
  // The registry half of the same lesson: certifying clientOnboarding.v3.ts is worthless if the
  // table would not actually run it. Each of these makes the resolver refuse, loudly.
  const registry = readFileSync(join(WORKFLOWS, "registry.ts"), "utf8");
  const mutations = [
    ["an ALIASED import binding a different export to the registry name",
      (s) => s.replace('import { clientOnboarding_v3 } from "./clientOnboarding.v3.js";', 'import { clientOnboarding_v2 as clientOnboarding_v3 } from "./clientOnboarding.v2.js";'),
      /DIFFERENT export/],
    ["a later SPREAD silently overriding the guarded entry",
      (s) => s.replace("  clientOnboarding: clientOnboarding_v3,", "  clientOnboarding: clientOnboarding_v3,\n  ...{ clientOnboarding: clientOnboarding_v2 },"),
      /SPREAD/],
    ["the class declared TWICE, where the last one wins at runtime",
      (s) => s.replace("  clientOnboarding: clientOnboarding_v3,", "  clientOnboarding: clientOnboarding_v3,\n  clientOnboarding: clientOnboarding_v2,"),
      /2 times/],
  ];

  for (const [label, mutate, reason] of mutations) {
    const dir = mkdtempSync(join(tmpdir(), "park-order-registry-"));
    try {
      cpSync(WORKFLOWS, dir, { recursive: true });
      const mutated = mutate(registry);
      assert.notEqual(mutated, registry, `the "${label}" mutation did not apply — this self-test would be VACUOUS`);
      writeFileSync(join(dir, "registry.ts"), mutated);
      assert.throws(() => analyzeParkOrdering(dir), reason, `the resolver must REFUSE ${label}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("GH #152: a re-ask at the SAME parkIndex resends the same answer and never burns the queue", async () => {
  const { scriptedAnswers } = await import("./wave-b-interview-testkit.mjs");

  // 'mpers_eligibility' is scripted with exactly ONE answer — the segment the CI flake named.
  const answers = scriptedAnswers();
  const first = answers("mpers_eligibility", 12);
  const retry = answers("mpers_eligibility", 12);
  const again = answers("mpers_eligibility", 12);
  assert.equal(first, "no", "the scripted determination");
  assert.equal(retry, first, "a 409 retry at the same park resends the SAME value");
  assert.equal(again, first, "and stays stable however many times the driver loops");

  // A segment scripted with a QUEUE still advances across DISTINCT parks (framework -> edition).
  const fwA = answers("framework", 20);
  const fwB = answers("framework", 21);
  assert.deepEqual([fwA, fwB], ["MPERS", "2025"], "distinct parks consume the queue in order");
  assert.equal(answers("framework", 20), "MPERS", "and each park keeps its own memoized answer");

  // Exhaustion is still reported honestly for a genuinely extra park.
  assert.throws(() => answers("framework", 22), /exhausted/, "a THIRD framework park is still a real exhaustion");

  // Legacy (no parkIndex) callers keep the plain per-segment queue behaviour.
  const legacy = scriptedAnswers();
  assert.equal(legacy("framework"), "MPERS");
  assert.equal(legacy("framework"), "2025");
});
