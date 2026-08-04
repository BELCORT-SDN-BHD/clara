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
// These cells are pure: no WDK engine, no DB, no server. They lock in both halves cheaply enough
// to run in the unit battery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = join(HERE, "..", "workflows");

/** The interview bodies the REGISTRY actually points at — resolved from source, so a future
 *  _v4 repoint is covered by this guard automatically instead of silently escaping it. */
function registeredInterviewBodies() {
  const registry = readFileSync(join(WORKFLOWS, "registry.ts"), "utf8");
  const bodies = [];
  for (const cls of ["firmInterview", "clientOnboarding"]) {
    // `  firmInterview: firmInterview_v3,`
    const pick = new RegExp(`^\\s*${cls}:\\s*([A-Za-z0-9_]+)\\s*,`, "m").exec(registry);
    assert.ok(pick, `the registry names a body for '${cls}'`);
    const ident = pick[1];
    // `import { firmInterview_v3 } from "./firmInterview.v3.js";`
    const imp = new RegExp(`import\\s*\\{\\s*${ident}\\s*\\}\\s*from\\s*"\\./([^"]+)\\.js"`, "m").exec(registry);
    assert.ok(imp, `the registry imports '${ident}' from a relative module`);
    bodies.push({ cls, ident, file: `${imp[1]}.ts` });
  }
  return bodies;
}

/** The text of the `ask` closure in a workflow body (from the arrow head to its closing `};`). */
function askClosureOf(src, file) {
  const start = src.indexOf("const ask: AskFn = async (prompt) => {");
  assert.notEqual(start, -1, `${file} defines an 'ask' closure`);
  const end = src.indexOf("\n  };", start);
  assert.notEqual(end, -1, `${file}'s 'ask' closure terminates`);
  return src.slice(start, end);
}

test("GH #152: every REGISTERED interview body arms its hook BEFORE it announces the park", () => {
  const bodies = registeredInterviewBodies();
  assert.equal(bodies.length, 2, "both interview classes are registered");

  for (const { cls, ident, file } of bodies) {
    const src = readFileSync(join(WORKFLOWS, file), "utf8");
    const ask = askClosureOf(src, file);

    const armAt = ask.indexOf("createHook<Resolution>(");
    const announceAt = ask.indexOf("await streamPromptStep(");
    assert.notEqual(armAt, -1, `${file}: 'ask' arms a hook`);
    assert.notEqual(announceAt, -1, `${file}: 'ask' announces the park`);

    // THE WHOLE POINT. createHook() only enqueues; the engine persists hook_created at the next
    // suspension, and at that suspension it creates hooks BEFORE dispatching any step
    // (@workflow/core runtime/suspension-handler.js: "Process hooks first to prevent race
    // conditions with webhook receivers"). Awaiting streamPromptStep IS that suspension — so the
    // arm must come FIRST for the token to be durable before the park is visible.
    assert.ok(
      armAt < announceAt,
      `${cls} -> ${ident} (${file}) ANNOUNCES BEFORE IT ARMS. That reopens the GH #152 window: ` +
        `the park becomes visible via GET /state while its hook does not yet exist, an answer ` +
        `POSTed in that window raises HookNotFoundError, and the route reports 409 not_pending — ` +
        `which clients treat as "already delivered", so a real answer is silently dropped. ` +
        `Put createHook(...) BEFORE await streamPromptStep(...), as chatTurn.v8 does.`,
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
