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

/** Prove `name` in this file IS the named import from a module matching `moduleRe`, and that
 *  NOTHING ELSE in the file binds that name. Returns null when proven, else the refusal reason. */
function bindingRefusal(sf, name, moduleRe) {
  let imported = 0;
  let other = 0;
  const visit = (n) => {
    if (ts.isImportSpecifier(n) && n.name.text === name) {
      const spec = n.parent.parent.parent.moduleSpecifier;
      if (ts.isStringLiteral(spec) && moduleRe.test(spec.text)) imported++;
      else other++;
    } else if (
      (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name?.text === name
    ) other++;
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) other++;
    else if (ts.isParameter(n) && ts.isIdentifier(n.name) && n.name.text === name) other++;
    else if (ts.isImportClause(n) && n.name?.text === name) other++;
    else if (ts.isNamespaceImport(n) && n.name.text === name) other++;
    ts.forEachChild(n, visit);
  };
  visit(sf);

  if (imported === 0) return `'${name}' is not imported from a module matching ${moduleRe} — the call cannot be proven to be the real one`;
  if (imported > 1) return `'${name}' is imported ${imported} times — ambiguous, refused`;
  if (other > 0) return `'${name}' is ALSO bound locally (${other} other binding(s)) — a shadowing declaration means the call site may not be the import at all`;
  return null;
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

  const bodies = [];
  for (const cls of ["firmInterview", "clientOnboarding"]) {
    const prop = table.properties.find(
      (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === cls,
    );
    if (!prop || !ts.isIdentifier(prop.initializer)) {
      throw new Error(`registry.ts names no plain identifier for '${cls}'`);
    }
    const ident = prop.initializer.text;

    let spec = null;
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st)) continue;
      const named = st.importClause?.namedBindings;
      if (!named || !ts.isNamedImports(named)) continue;
      if (named.elements.some((el) => el.name.text === ident)) spec = st.moduleSpecifier.text;
    }
    if (!spec) throw new Error(`registry.ts imports '${ident}' from nowhere resolvable`);

    bodies.push({ cls, ident, file: `${spec.replace(/^\.\//, "").replace(/\.js$/, "")}.ts` });
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

    // NO ARM MAY LIVE OUTSIDE THE ANALYSED CLOSURE. A second park-asking closure (an `askPark`
    // beside a decoy `ask`) would otherwise let the guard certify a function nobody calls.
    const fileArms = collectCalls(sf, ARM);
    for (const c of fileArms) {
      let owner = c.parent;
      while (owner && !isFunctionBoundary(owner)) owner = owner.parent;
      if (owner !== ask) return refuse(`a ${ARM}() call lives OUTSIDE the analysed 'ask' closure — this file asks parks in more than one place, and the guard will not certify only one of them`);
    }

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
        ? `${where}: arms at statement ${arm.index}, announces (awaited) at statement ${announce.index}`
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

  const shapes = [
    ["the arm inside `if (false)`", (s) => s.replace(armRe, `    if (false) { const hook = ${armExpr}; }\n    const hook = null as never;`)],
    ["the announce as the arm's own ARGUMENT (it evaluates first)", (s) => s.replace(annRe, "").replace(armRe, `    const hook = createHook<Resolution>(({ x: ${ann.trim().replace(/;$/, "")} }) as never);`)],
    ["a constructor arming, instantiated after the announce", (s) => s.replace(armRe, `    class A { h: unknown; constructor() { this.h = ${armExpr}; } }`).replace(annRe, `${ann}\n    const hook = new A().h as never;`)],
    ["an instance FIELD arming, instantiated after the announce", (s) => s.replace(armRe, `    class A { h = ${armExpr}; }`).replace(annRe, `${ann}\n    const hook = new A().h as never;`)],
    ["a skipped destructuring default", (s) => s.replace(armRe, `    const { z: hook = ${armExpr} } = { z: 1 as never };`)],
    ["an unreachable arm after `break` in a labelled block", (s) => s.replace(armRe, `    let hook: never = null as never;\n    lbl: { break lbl; hook = ${armExpr}; }`)],
    ["`maybe?.(createHook())`, whose argument is skipped", (s) => s.replace(armRe, `    const maybe: ((x: unknown) => never) | undefined = undefined;\n    const hook = maybe?.(${armExpr}) as never;`)],
    // SPELLING IS NOT IDENTITY: a local decoy named like the import satisfies the order test
    // while the REAL hook is never created.
    ["a local `createHook` shadowing the real import", (s) =>
      s.replace('import { createHook } from "workflow";', 'import { createHook as realCreateHook } from "workflow";\nfunction createHook<T>(_a: unknown): T { return null as T; }\nvoid realCreateHook;')],
    ["a local `streamPromptStep` shadowing the real import", (s) =>
      s.replace("import { mintOpKeyStep, runIdStep, streamPromptStep,", "import { mintOpKeyStep, runIdStep, streamPromptStep as realStreamPromptStep,")
        .replace(armRe, `    async function streamPromptStep(_a: unknown): Promise<void> { void realStreamPromptStep; }\n${src.match(armRe)[0]}`)],
  ];

  for (const [label, mutate] of shapes) {
    const dir = mkdtempSync(join(tmpdir(), "park-order-selftest-"));
    try {
      cpSync(WORKFLOWS, dir, { recursive: true });
      writeFileSync(join(dir, "clientOnboarding.v3.ts"), mutate(src));
      const finding = analyzeParkOrdering(dir).find((f) => f.file === "clientOnboarding.v3.ts");
      assert.equal(finding.ok, false, `the guard must REFUSE ${label}, but it certified it: ${finding.detail}`);
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
