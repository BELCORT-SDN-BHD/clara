// Lane ζ — the LEADER DISPATCH unit battery. NO database, NO Fly, NO container.
//
// This is the one place lane ζ touches runtime judgement logic (design part2 §10; §12's lane
// table marks it Yes for the Law-1 column), so it is celled here as well as in the acceptance
// matrix. The DB client and the Fly start call are both injected, which is what lets the three
// arms of A33 be exercised as decisions rather than as an integration test.
//
// What this battery CANNOT prove, stated so nobody reads it as more than it is: it does not prove
// that clara.render_dispatch_begin picks the right jobs (that is a DB test, packages/db/tests/
// zeta-render-queue.test.mjs), and it does not prove that a real Fly machine starts. It proves
// the leader's own decisions: when it calls, when it refuses to call, and what it records.

import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { readDispatchConfig, reconcileRenderDispatch } from "../lib/reconciler-render.mjs";

const FULL_ENV = {
  CLARA_RENDER_FLY_API_TOKEN: "tok",
  CLARA_RENDER_FLY_APP: "clara-render",
  CLARA_RENDER_IMAGE_REF: "registry.fly.io/clara-render@sha256:abc",
};

/**
 * A fake pg client: answers the surface probe, the due-read, and records every call.
 *
 * MATCHERS ARE PRECISE, and that is a lesson this file paid for. The feature-detect probe's SQL
 * NAMES BOTH verbs inside to_regprocedure(...), so a loose `includes("render_dispatch_record")`
 * matched the probe rather than the receipt — the battery went green-ish against the wrong
 * statement. Every matcher here therefore anchors on `select clara.<verb>`, which is the shape the
 * belt actually issues.
 */
function fakeClient({ surface = true, due = { due: 0, job_ids: [] }, throwOn = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (throwOn && sql.includes(throwOn)) throw new Error(`boom: ${throwOn}`);
      if (sql.includes("to_regprocedure")) return { rows: [{ surface }] };
      if (sql.includes("select clara.render_dispatch_begin")) return { rows: [{ r: due }] };
      if (sql.includes("select clara.render_dispatch_record")) {
        return { rows: [{ r: { recorded: (params?.[0] ?? []).length } }] };
      }
      return { rows: [] };
    },
  };
}

// === configuration ==============================================================================

test("an unwired deploy is detected by NAME, not by a truthiness check", () => {
  strictEqual(readDispatchConfig({}).configured, false);
  deepStrictEqual(readDispatchConfig({}).missing.length, 3);
  const noToken = readDispatchConfig({ ...FULL_ENV, CLARA_RENDER_FLY_API_TOKEN: undefined });
  strictEqual(noToken.configured, false);
  ok(noToken.missing.includes("CLARA_RENDER_FLY_API_TOKEN"));
});

test("either start mode configures it: a pre-created machine id, or a pinned image ref", () => {
  strictEqual(readDispatchConfig(FULL_ENV).configured, true);
  const byMachine = readDispatchConfig({
    CLARA_RENDER_FLY_API_TOKEN: "tok", CLARA_RENDER_FLY_APP: "clara-render",
    CLARA_RENDER_FLY_MACHINE_ID: "m1",
  });
  strictEqual(byMachine.configured, true);
  strictEqual(byMachine.machineId, "m1");
});

test("the region defaults to sin — the same city as the database", () => {
  strictEqual(readDispatchConfig(FULL_ENV).region, "sin");
});

// === dormancy and unwiring: two different silences, told apart ====================================

test("before the ζ migration exists the belt is DORMANT and touches nothing", async () => {
  const client = fakeClient({ surface: false });
  const r = await reconcileRenderDispatch(client, { env: FULL_ENV, log: () => {} });
  strictEqual(r.renderDormant, true);
  strictEqual(r.renderOk, true, "a dormant belt is not a failure — there is simply nothing to do yet");
  strictEqual(client.calls.length, 1, "only the feature-detect probe should have run");
});

test("an UNWIRED dispatch stamps NOTHING and says so loudly", async () => {
  const lines = [];
  const client = fakeClient();
  const r = await reconcileRenderDispatch(client, { env: {}, log: (m) => lines.push(m) });
  strictEqual(r.renderUnconfigured, true);
  strictEqual(r.renderOk, false);
  strictEqual(client.calls.length, 1, "no cooldown may be burned by a leader that cannot dispatch");
  ok(lines.some((l) => l.includes("UNWIRED") && l.includes("delayed, not stranded")),
    "the unwired case must name itself every cycle — a de-duplicated warning becomes silence");
});

// === A33 arm (i): dispatch within cadence =========================================================

test("a due job starts a machine exactly once and records SUCCESS", async () => {
  const started = [];
  const client = fakeClient({ due: { due: 1, job_ids: ["j1"], oldest_wait_seconds: 42 } });
  const r = await reconcileRenderDispatch(client, {
    env: FULL_ENV, log: () => {},
    startRenderMachine: async (cfg) => { started.push(cfg.app); return { mode: "create", machine_id: "m9" }; },
  });
  strictEqual(started.length, 1, "one dispatch call per due batch, not one per job");
  strictEqual(r.renderDispatched, 1);
  strictEqual(r.renderOldestWaitSeconds, 42, "the observed wait is reported on EVERY dispatch, not only a slow one");
  const receipt = client.calls.find((c) => c.sql.includes("select clara.render_dispatch_record"));
  ok(receipt, "a dispatch must always leave a receipt");
  deepStrictEqual(receipt.params[0], ["j1"]);
  strictEqual(receipt.params[1], true);
});

test("nothing due means no start call and no receipt", async () => {
  let started = 0;
  const client = fakeClient({ due: { due: 0, job_ids: [] } });
  const r = await reconcileRenderDispatch(client, {
    env: FULL_ENV, log: () => {}, startRenderMachine: async () => { started += 1; return {}; },
  });
  strictEqual(started, 0);
  strictEqual(r.renderDue, 0);
  ok(!client.calls.some((c) => c.sql.includes("select clara.render_dispatch_record")));
});

// === the failure path: recorded, not merely logged =================================================

test("a failed START is RECORDED on the rows — 'could not start' is a different fact from 'nothing happened'", async () => {
  const client = fakeClient({ due: { due: 2, job_ids: ["j1", "j2"], oldest_wait_seconds: 900 } });
  const r = await reconcileRenderDispatch(client, {
    env: FULL_ENV, log: () => {},
    startRenderMachine: async () => { throw new Error("fly says 402"); },
  });
  strictEqual(r.renderOk, false);
  strictEqual(r.renderDispatched, 0);
  const receipt = client.calls.find((c) => c.sql.includes("select clara.render_dispatch_record"));
  ok(receipt, "a FAILED dispatch must still leave a receipt");
  strictEqual(receipt.params[1], false);
  ok(JSON.parse(receipt.params[2]).error.includes("402"),
    "the receipt carries what Fly actually said, not just that something failed");
});

test("a due-read that throws never propagates out of the belt", async () => {
  const client = fakeClient({ throwOn: "select clara.render_dispatch_begin" });
  const r = await reconcileRenderDispatch(client, { env: FULL_ENV, log: () => {} });
  strictEqual(r.renderOk, false);
  strictEqual(r.renderDispatched, 0);
});

test("a receipt that throws never propagates either — the dispatch already happened", async () => {
  const client = fakeClient({ due: { due: 1, job_ids: ["j1"] }, throwOn: "select clara.render_dispatch_record" });
  const r = await reconcileRenderDispatch(client, {
    env: FULL_ENV, log: () => {}, startRenderMachine: async () => ({ mode: "start", machine_id: "m1" }),
  });
  strictEqual(r.renderOk, true, "the machine did start; a lost receipt must not be reported as a failed dispatch");
});

// === A33 arm (ii): the leader cannot strand anything ===============================================

test("NOTHING in this belt can move a job out of the claimable state", async () => {
  const client = fakeClient({ due: { due: 1, job_ids: ["j1"] } });
  await reconcileRenderDispatch(client, {
    env: FULL_ENV, log: () => {}, startRenderMachine: async () => { throw new Error("down"); },
  });
  // The whole point of arm (ii): a leader outage DELAYS renders rather than stranding them, and
  // the structural reason is that the leader has no verb that consumes a job. Asserted as an
  // absence over what the belt ACTUALLY issued, which is a read of its behaviour rather than a
  // reading of its source.
  const issued = client.calls.map((c) => c.sql).join(" ");
  for (const forbidden of ["claim_render_job", "complete_render_job", "fail_render_job", "update ", "delete "]) {
    ok(!issued.includes(forbidden), `the dispatch belt must never issue ${forbidden}`);
  }
});
