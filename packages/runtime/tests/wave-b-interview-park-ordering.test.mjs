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
// These cells are pure: no WDK engine, no DB, no server. They lock in both halves cheaply enough
// to run in the unit battery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = join(HERE, "..", "workflows");

const ARM = "createHook";
const ANNOUNCE = "streamPromptStep";

function parse(file, src) {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TS);
}

/** Peel `as const` / parentheses off an expression. */
function unwrap(node) {
  let n = node;
  while (ts.isAsExpression(n) || ts.isParenthesizedExpression(n)) n = n.expression;
  return n;
}

function isFunctionLike(n) {
  return ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
}

/** The called name: `f(...)` -> "f", `o.f(...)` -> "f". */
function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** The first CallExpression to `name` inside `node`, NOT descending into a nested function — a
 *  call written inside a closure does not execute where the closure is written. */
function findCallIn(node, name) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (n !== node && isFunctionLike(n)) return;
    if (ts.isCallExpression(n) && calleeName(n) === name) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Which top-level statement of `block` calls `name` first: { index, node } or null. */
function findCallStatement(block, name) {
  for (let i = 0; i < block.statements.length; i++) {
    const node = findCallIn(block.statements[i], name);
    if (node) return { index: i, node };
  }
  return null;
}

/** Every `ask` function in a workflow body — `const ask = ... =>` or `function ask()`. */
function findAskFunctions(sf) {
  const hits = [];
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "ask" &&
      n.initializer && isFunctionLike(n.initializer)
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

    const asks = findAskFunctions(sf);
    if (asks.length !== 1) {
      return { cls, ident, file, ok: false, detail: `${where}: expected exactly one 'ask' function, found ${asks.length}` };
    }
    const body = asks[0].body;
    if (!body || !ts.isBlock(body)) {
      return { cls, ident, file, ok: false, detail: `${where}: 'ask' has no block body to analyse` };
    }

    const arm = findCallStatement(body, ARM);
    const announce = findCallStatement(body, ANNOUNCE);
    if (!arm) return { cls, ident, file, ok: false, detail: `${where}: 'ask' never calls ${ARM}() — it arms no hook at all` };
    if (!announce) return { cls, ident, file, ok: false, detail: `${where}: 'ask' never calls ${ANNOUNCE}() — it announces no park at all` };

    // Same statement (e.g. the arm nested in the announce's own arguments): fall back to tree
    // position, which is evaluation order within a single expression.
    const armFirst = arm.index === announce.index
      ? arm.node.getStart(sf) < announce.node.getStart(sf)
      : arm.index < announce.index;

    return {
      cls, ident, file, ok: armFirst,
      detail: armFirst
        ? `${where}: arms at statement ${arm.index}, announces at statement ${announce.index}`
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
