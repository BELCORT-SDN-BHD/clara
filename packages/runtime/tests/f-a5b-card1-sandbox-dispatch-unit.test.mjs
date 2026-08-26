// F-A5b card 1 — the SANDBOX-EXPORT LEADER DISPATCH unit battery. NO database, NO Fly, NO
// container. The sibling of zeta-render-dispatch-unit.test.mjs, on its terms and for its reason.
//
// This belt is runtime JUDGEMENT LOGIC — it decides whether to start a paid machine right now —
// so review law 1 applies and it is celled here rather than only in an acceptance matrix. The DB
// client and the machine-start call are both INJECTED, which is what lets the decisions be
// exercised as decisions instead of as an integration test.
//
// WHAT THIS BATTERY CANNOT PROVE, stated so nobody reads it as more than it is: it does not prove
// that clara.sandbox_dispatch_begin picks the right rows (that is a DB cell,
// packages/db/tests/f-a5b-card1-seam-stage-a.test.mjs B6.3), and it does not prove a real machine
// starts. It proves the leader's own decisions: when it calls, when it refuses to, and what it
// records when it cannot.
//
// MATCHERS ARE PRECISE, and that lesson is inherited rather than re-paid: the feature-detect probe
// NAMES BOTH verbs inside to_regprocedure(...), so a loose `includes("sandbox_dispatch_record")`
// would match the PROBE rather than the receipt and the battery would go green against the wrong
// statement. Every matcher anchors on `select clara.<verb>`, the shape the belt actually issues.

import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { reconcileSandboxDispatch } from "../lib/reconciler-sandbox.mjs";

const FULL_ENV = {
  CLARA_RENDER_FLY_API_TOKEN: "tok",
  CLARA_RENDER_FLY_APP: "clara-render",
  CLARA_RENDER_IMAGE_REF: "registry.fly.io/clara-render@sha256:abc",
  CLARA_RENDER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
  CLARA_RENDER_SOURCE_COMMIT: "b".repeat(40),
};

function fakeClient({
  surface = true,
  due = { due: 0, export_ids: [] },
  reap = { reaped: 0, reaped_export_ids: [], reaped_sandbox_view_ids: [] },
  recorded = null,
  throwOn = null,
} = {}) {
  const calls = [];
  return {
    calls,
    issued(verb) { return calls.filter((c) => c.sql.includes(`select clara.${verb}`)); },
    async query(sql, params) {
      calls.push({ sql, params });
      if (throwOn && sql.includes(throwOn)) throw new Error(`boom: ${throwOn}`);
      if (sql.includes("to_regprocedure")) return { rows: [{ surface }] };
      if (sql.includes("select clara.reap_exhausted_sandbox_exports")) return { rows: [{ r: reap }] };
      if (sql.includes("select clara.sandbox_dispatch_begin")) return { rows: [{ r: due }] };
      if (sql.includes("select clara.sandbox_dispatch_record")) {
        const asked = (params?.[0] ?? []).length;
        return { rows: [{ r: recorded ?? { recorded: asked, skipped: 0 } }] };
      }
      return { rows: [] };
    },
  };
}

const silent = () => {};
const collect = () => { const lines = []; const log = (l) => lines.push(String(l)); log.lines = lines; return log; };

test("a database behind this build leaves the belt DORMANT — not failed, and not a start", async () => {
  const client = fakeClient({ surface: false });
  const r = await reconcileSandboxDispatch(client, { log: silent, env: FULL_ENV });
  strictEqual(r.sandboxDormant, true);
  strictEqual(r.sandboxOk, true, "dormant is a healthy state — the migration simply has not applied yet");
  strictEqual(client.issued("sandbox_dispatch_begin").length, 0);
  strictEqual(client.issued("reap_exhausted_sandbox_exports").length, 0);
});

test("a FAILING surface probe is a connection problem, NOT a dormant surface — the two must not report the same thing", async () => {
  const client = fakeClient({ throwOn: "to_regprocedure" });
  const r = await reconcileSandboxDispatch(client, { log: silent, env: FULL_ENV });
  strictEqual(r.sandboxOk, false, "a probe that could not run is not evidence that the surface is absent");
  strictEqual(r.sandboxDormant, undefined);
});

test("QUEUE HYGIENE RUNS FIRST AND UNCONDITIONALLY — an UNWIRED deploy still reaps, and says which views need action", async () => {
  const client = fakeClient({
    reap: { reaped: 2, reaped_export_ids: ["e1", "e2"], reaped_sandbox_view_ids: ["v1", "v2"] },
  });
  const log = collect();
  const r = await reconcileSandboxDispatch(client, { log, env: {} }); // nothing configured
  strictEqual(r.sandboxUnconfigured, true);
  strictEqual(r.sandboxReaped, 2, "reaping is not part of dispatching; gating it on being able to start machines is how crash-only rows end up with no terminal state at all");
  strictEqual(client.issued("reap_exhausted_sandbox_exports").length, 1);
  strictEqual(client.issued("sandbox_dispatch_begin").length, 0, "an unwired leader stamps NOTHING");
  ok(log.lines.some((l) => l.includes("UNWIRED") && l.includes("CLARA_RENDER_FLY_API_TOKEN")),
    "the log NAMES what is missing rather than reporting a bare failure");
  ok(log.lines.some((l) => l.includes("v1") && l.includes("v2")),
    "a reaped export means a document will not exist without a human, so the line names the views");
});

test("nothing due: no machine is started and no receipt is written", async () => {
  const client = fakeClient({ due: { due: 0, export_ids: [] } });
  let started = 0;
  const r = await reconcileSandboxDispatch(client, {
    log: silent, env: FULL_ENV, startRenderMachine: async () => { started += 1; },
  });
  strictEqual(started, 0);
  strictEqual(r.sandboxDue, 0);
  strictEqual(client.issued("sandbox_dispatch_record").length, 0);
});

test("due rows: the machine is started ONCE for the batch and the receipt records the success", async () => {
  const client = fakeClient({ due: { due: 2, export_ids: ["e1", "e2"], oldest_wait_seconds: 61 } });
  let started = 0;
  const log = collect();
  const r = await reconcileSandboxDispatch(client, {
    log, env: FULL_ENV, startRenderMachine: async () => { started += 1; return { id: "m1" }; },
  });
  strictEqual(started, 1, "one machine for the batch — the dispatch is a doorbell, not one call per row");
  strictEqual(r.sandboxDispatched, 2);
  strictEqual(r.sandboxOldestWaitSeconds, 61, "the wait the queue actually suffered is reported on EVERY dispatch, not only a slow one");
  const receipt = client.issued("sandbox_dispatch_record");
  strictEqual(receipt.length, 1);
  deepStrictEqual(receipt[0].params[0], ["e1", "e2"]);
  strictEqual(receipt[0].params[1], true);
});

test("a FAILED start is RECORDED ON THE ROWS, not merely logged — 'we could not start the renderer' is the actionable fact", async () => {
  const client = fakeClient({ due: { due: 1, export_ids: ["e1"] } });
  const r = await reconcileSandboxDispatch(client, {
    log: silent, env: FULL_ENV,
    startRenderMachine: async () => { throw new Error("fly said no"); },
  });
  strictEqual(r.sandboxOk, false);
  strictEqual(r.sandboxDispatched, 0);
  const receipt = client.issued("sandbox_dispatch_record");
  strictEqual(receipt.length, 1, "the receipt is written even though the start failed");
  strictEqual(receipt[0].params[1], false);
  ok(JSON.parse(receipt[0].params[2]).error.includes("fly said no"));
});

test("a SKIPPED receipt is reported, not swallowed — rows that went terminal during the start call", async () => {
  const client = fakeClient({
    due: { due: 3, export_ids: ["e1", "e2", "e3"] },
    recorded: { recorded: 2, skipped: 1 },
  });
  const log = collect();
  const r = await reconcileSandboxDispatch(client, {
    log, env: FULL_ENV, startRenderMachine: async () => ({ id: "m1" }),
  });
  strictEqual(r.sandboxReceiptSkipped, 1);
  ok(log.lines.some((l) => l.includes("skipped")),
    "silently skipping them would leave those rows' outcome unrecorded with nothing saying so");
});

test("a due-read that THROWS fails soft: the cycle reports it and retries next time, and no machine is started", async () => {
  const client = fakeClient({ throwOn: "select clara.sandbox_dispatch_begin" });
  let started = 0;
  const r = await reconcileSandboxDispatch(client, {
    log: silent, env: FULL_ENV, startRenderMachine: async () => { started += 1; },
  });
  strictEqual(r.sandboxOk, false);
  strictEqual(started, 0);
});

test("a reap that THROWS does not stop a dispatch that could still start work", async () => {
  const client = fakeClient({
    due: { due: 1, export_ids: ["e1"] }, throwOn: "select clara.reap_exhausted_sandbox_exports",
  });
  let started = 0;
  const log = collect();
  const r = await reconcileSandboxDispatch(client, {
    log, env: FULL_ENV, startRenderMachine: async () => { started += 1; return { id: "m1" }; },
  });
  strictEqual(r.sandboxReaped, 0);
  strictEqual(started, 1, "hygiene failing must never block dispatch");
  ok(log.lines.some((l) => l.includes("sandbox reap error")), "and it is logged, never swallowed");
});
