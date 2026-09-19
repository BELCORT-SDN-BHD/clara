// #852 — THE CHAT-CLARIFY BELT INSIDE THE SWEEP RECEIPT.
//
// THE HOLE THIS CLOSES. `reconcileChatClarifies` ran from leader.mjs, in its own try/catch, beside
// `runReconcilerSweep` rather than inside it. Two consequences, both invisible to any reader of the
// sweep's own receipt: its five counters (`chatClarifyResumed / Expired / Landed / ProbeFailed /
// SettleFailed`) never appeared on the returned object, and a belt failure was a LOG LINE and
// nothing else — never a name in `beltErrors`. The estate's own law for this is already written in
// reconciler.mjs: "a failure that is COUNTED stays visible; a failure that is only logged is one
// grep away from invisible". This belt was the one exception.
//
// WHY IT WAS OUTSIDE, AND WHAT MOVED. leader.mjs's own header named the binding reason: IMPORT
// DIRECTION. `reconciler-chat-clarify.mjs` took `isHookNotFound` / `resumePayloadFor` from
// `control.mjs`, and `control.mjs` imports `settleCancelledByKind` from `reconciler.mjs` — so a
// direct registration inside `runReconcilerSweep` would have closed
// `reconciler → chat-clarify → control → reconciler`. Both symbols now live in a LEAF
// (`lib/hook-resume.mjs`, no first-party import at all) that both sides read, so the edge that
// closed the cycle is gone and the belt can be registered where every other belt is.
//
// PURE mock-client unit cells (no DB, no world, no network) — the convention of
// reconcile-belt-isolation-unit.test.mjs, whose assembly cells these sit beside.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReconcilerSweep } from "../lib/reconciler.mjs";

const LIB = fileURLToPath(new URL("../lib/", import.meta.url));
const PKG = fileURLToPath(new URL("../", import.meta.url));

// ---------------------------------------------------------------------------
// 1 · THE IMPORT GRAPH — the acceptance criterion that is about SHAPE, not behaviour.
// ---------------------------------------------------------------------------

/** Every FIRST-PARTY relative specifier a module names — static `from "./x"`, bare side-effect
 *  `import "./x"`, and dynamic `import("./x")`. Package specifiers are not edges we own. */
function relativeImportsOf(file) {
  const src = readFileSync(file, "utf8");
  const out = new Set();
  for (const m of src.matchAll(/(?:^|[\s;}])(?:import|export)\s[^;]*?from\s*["'](\.[^"']+)["']/g)) out.add(m[1]);
  for (const m of src.matchAll(/(?:^|[\s;}])import\s*["'](\.[^"']+)["']/g)) out.add(m[1]);
  for (const m of src.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g)) out.add(m[1]);
  return [...out].map((spec) => resolve(dirname(file), spec));
}

/** The whole relative-import closure of `entry`, plus every cycle found while walking it. A cycle
 *  is reported as the path that closes it, so a failure NAMES the edge rather than only its fact. */
function closureOf(entry) {
  const seen = new Set();
  const cycles = [];
  const walk = (file, stack) => {
    if (stack.includes(file)) {
      cycles.push([...stack.slice(stack.indexOf(file)), file].map((f) => relative(PKG, f).replaceAll("\\", "/")));
      return;
    }
    if (seen.has(file)) return;
    seen.add(file);
    for (const dep of relativeImportsOf(file)) walk(dep, [...stack, file]);
  };
  walk(entry, []);
  return { modules: [...seen].map((f) => relative(PKG, f).replaceAll("\\", "/")), cycles };
}

test("#852 graph: hook-resume.mjs is a LEAF — it names no first-party module, so both sides may share it", () => {
  const leaf = `${LIB}hook-resume.mjs`;
  assert.deepEqual(relativeImportsOf(leaf), [],
    "a module that both control.mjs and the chat-clarify belt import may not itself import anything "
    + "first-party: the moment it does, it can grow an edge back into reconciler.mjs and the cycle returns");
});

test("#852 graph: the NEW edge closes no cycle — the belt's own closure never reaches reconciler.mjs", () => {
  // THE CELL IS ABOUT THE EDGE THIS TICKET ADDS, not about the package's whole graph. The edge is
  // `reconciler.mjs -> reconciler-chat-clarify.mjs`; it is cycle-free exactly when the belt's own
  // transitive closure cannot get back to reconciler.mjs. That is the property `control.mjs` broke
  // (it imports reconciler.mjs for `settleCancelledByKind`) and the leaf restores.
  const { modules, cycles } = closureOf(`${LIB}reconciler-chat-clarify.mjs`);
  assert.deepEqual(cycles, [], `the belt's own closure is a DAG (found ${JSON.stringify(cycles)})`);
  assert.ok(!modules.includes("lib/reconciler.mjs"),
    `the belt may not reach reconciler.mjs, or registering it inside the sweep re-closes the cycle (closure: ${JSON.stringify(modules)})`);
  assert.ok(!modules.includes("lib/control.mjs"),
    "…and specifically not through control.mjs, which is the edge #852 removed");
  assert.ok(modules.includes("lib/hook-resume.mjs"),
    "…it reaches the two shared symbols through the leaf instead");

  // The sweep really does take that edge.
  assert.ok(closureOf(`${LIB}reconciler.mjs`).modules.includes("lib/reconciler-chat-clarify.mjs"),
    "the belt IS in runReconcilerSweep's closure — registered inside the sweep, not beside it");
});

test("#852 graph: the ONE pre-existing cycle in this package is named, so cell 2 is not quietly tolerating a new one", () => {
  // `reconciler-wake.mjs` imports `terminalFor` from reconciler.mjs while reconciler.mjs imports
  // `reconcileWakeEngineTasks` from it — a cycle that predates this ticket (Gate G1's belt) and
  // that #852 neither created nor is scoped to fix. It is PINNED here rather than left implicit:
  // a cell that asserted global acyclicity would have to be weakened to pass, and a weakened cell
  // is how the next cycle gets in. When that edge is broken, delete this cell and tighten cell 2
  // to the whole closure.
  const { cycles } = closureOf(`${LIB}reconciler.mjs`);
  assert.deepEqual(cycles, [["lib/reconciler.mjs", "lib/reconciler-wake.mjs", "lib/reconciler.mjs"]],
    "exactly ONE cycle, the known Gate-G1 one — any second entry here is a cycle this wave introduced");
});

test("#852 graph: control.mjs reads the same two symbols from the SAME leaf — one declaration, never two", () => {
  const control = readFileSync(`${LIB}control.mjs`, "utf8");
  const belt = readFileSync(`${LIB}reconciler-chat-clarify.mjs`, "utf8");
  assert.match(control, /import \{ isHookNotFound, resumePayloadFor \} from "\.\/hook-resume\.mjs";/,
    "control.mjs takes them from the leaf (and re-exports them, so its existing import sites keep resolving)");
  assert.match(control, /export \{ isHookNotFound, resumePayloadFor \};/,
    "…re-exported by name, because tests/unit.test.mjs and control-work-question.test.mjs read them from here");
  assert.match(belt, /import \{ isHookNotFound, resumePayloadFor \} from "\.\/hook-resume\.mjs";/,
    "the belt takes them from the leaf too — a restatement on either side is the drift this package refuses");
});

// ---------------------------------------------------------------------------
// 2 · THE RECEIPT — counters, containment and order.
// ---------------------------------------------------------------------------

/** A scripted pg client for the SWEEP, recording every statement in order.
 *
 *  `deliveryColumns` decides what the chat-clarify belt's own deploy-order probe answers: 0 makes
 *  it a one-statement dormant belt (and, unlike 3, is never memoised — see that probe's header),
 *  which is exactly what an ordering cell wants. `failOn(sql)` is the fault injector. */
function sweepClient({ deliveryColumns = 0, failOn = () => null } = {}) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      const s = String(sql).trim();
      queries.push(s);
      const boom = failOn(s, params);
      if (boom) return Promise.reject(boom);
      if (/information_schema\.columns/.test(s)) return Promise.resolve({ rows: [{ n: deliveryColumns }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

const CHAT_CLARIFY_PROBE = /information_schema\.columns/;
const HEARTBEAT = /runtime_heartbeats/;
const sweepDeps = (log, extra = {}) => ({
  enqueueChatTurn: async () => ({ runId: "x" }),
  getRun: () => ({ status: Promise.resolve("completed"), cancel: async () => {} }),
  // #764: without a world resume the belt is a clean no-op that issues no statement at all, so
  // every cell here hands it one. It is never called — no resting row is ever returned.
  resumeHook: async () => {},
  log,
  ...extra,
});

test("#852 receipt: the sweep's own result carries all FIVE chat-clarify counters", async () => {
  const client = sweepClient();
  const swept = await runReconcilerSweep(client, sweepDeps(() => {}));
  for (const key of ["chatClarifyResumed", "chatClarifyExpired", "chatClarifyLanded",
    "chatClarifyProbeFailed", "chatClarifySettleFailed"]) {
    assert.equal(swept[key], 0, `${key} is on the receipt the leader reads, not only in a log line`);
  }
  assert.deepEqual(swept.beltErrors, [], "and a clean cycle names no belt");
  assert.equal(swept.heartbeatOk, true);
});

test("#852 receipt: a chat-clarify belt failure is NAMED in beltErrors and never throws out of the sweep", async () => {
  const client = sweepClient({
    failOn: (sql) => (CHAT_CLARIFY_PROBE.test(sql) ? new Error("catalog read refused") : null),
  });
  const log = [];

  let swept;
  await assert.doesNotReject(async () => {
    swept = await runReconcilerSweep(client, sweepDeps((m) => log.push(m)));
  }, "a chat-clarify escape must cost THAT belt this cycle and nothing else — contained exactly like the Wave-E render belts");

  assert.deepEqual(swept.beltErrors, ["chat clarify reconcile"],
    "the failed belt is NAMED in the receipt — this is the whole of #852's second half");
  assert.ok(log.some((m) => /^\[reconcile\] chat clarify reconcile error: catalog read refused$/.test(m)),
    `the estate's own '[reconcile] <belt> error:' idiom (got ${JSON.stringify(log)})`);
  assert.equal(swept.chatClarifyResumed, undefined,
    "a failed belt contributes NO counters — a zeroed fallback would claim 'nothing resumed' where the truth is 'we do not know'");
  // Keys only a belt sequenced AFTER it can contribute.
  assert.equal(typeof swept.expired, "number", "the clarify-expiry belt behind it still ran");
  assert.equal(typeof swept.spoolRemoved, "number", "…all the way to the last unconditional pass");
});

test("#852 order: the belt runs FIRST of the belts — before the generic mirror that would settle the same row `cancelled`", async () => {
  // reconcileTasks' section C settles a parked chat turn with terminalFor('awaiting_input','lost')
  // = cancelled/engine_lost. For a turn whose clarification is UNREACHABLE the honest terminal is
  // `expired` + a clarify_closed part, which only this belt writes. It therefore has to decide
  // before the generic mirror ever sees the row — the order leader.mjs used to guarantee by
  // calling it ahead of the sweep, and which the sweep now guarantees itself.
  const client = sweepClient();
  await runReconcilerSweep(client, sweepDeps(() => {}));

  const probe = client.queries.findIndex((q) => CHAT_CLARIFY_PROBE.test(q));
  const beat = client.queries.findIndex((q) => HEARTBEAT.test(q));
  const expiry = client.queries.findIndex((q) => /update clara\.agent_interruptions/.test(q));
  const mirror = client.queries.findIndex((q) => /status in \('running','awaiting_input'\)/.test(q));

  assert.ok(probe >= 0 && expiry >= 0 && mirror >= 0,
    `all three belts issued a statement (got ${JSON.stringify(client.queries.map((q) => q.slice(0, 40)))})`);
  assert.equal(probe, beat + 1,
    "the chat-clarify belt is the FIRST belt — immediately after the heartbeat, which is not a belt but the sweep's own fail-fast");
  assert.ok(probe < expiry, "…ahead of the clarify-expiry belt");
  assert.ok(probe < mirror, "…and ahead of reconcileTasks, which is the one that matters");
});

test("#852 wiring: the leader no longer runs this belt itself — one caller, one receipt", () => {
  const leader = readFileSync(`${LIB}leader.mjs`, "utf8");
  assert.ok(!/reconcileChatClarifies/.test(leader),
    "leader.mjs must not call or import the belt any more: two callers per cycle would double-probe every resting row");
  assert.match(leader, /swept\.chatClarify/,
    "…it reads the counters off the sweep result instead, which is where they now live");
});
