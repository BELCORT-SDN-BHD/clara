// #967 — unit cells for tests/queue-drain.mjs's own retry/timeout shape, entirely in-memory (no
// database): a fake `rig.rootQuery` answers by SQL text (workflow_runs / agent_tasks /
// document_processing_tasks), tracking which of the three queries `waitForQueueDrain`'s single poll
// iteration has issued so far, so a batch's three queries always answer from the SAME simulated
// database snapshot regardless of the order they happen to resolve in.
import test from "node:test";
import assert from "node:assert/strict";
import { waitForQueueDrain } from "./queue-drain.mjs";

/** @param {Array<{runs?:unknown[], agent?:unknown[], docs?:unknown[]}>} steps */
function fakeRig(steps) {
  let index = 0;
  const seen = new Set();
  const calls = [];
  const advanceIfComplete = () => {
    if (seen.size === 3) {
      seen.clear();
      if (index < steps.length - 1) index += 1;
    }
  };
  return {
    calls,
    rootQuery: async (sql) => {
      calls.push(sql);
      const step = steps[Math.min(index, steps.length - 1)];
      if (/workflow_runs/.test(sql)) {
        seen.add("runs");
        const rows = (step.runs ?? []).map((name) => ({ name, n: 1, oldest: null }));
        advanceIfComplete();
        return { rows };
      }
      if (/agent_tasks/.test(sql)) {
        seen.add("agent");
        advanceIfComplete();
        return { rows: step.agent ?? [] };
      }
      seen.add("docs");
      advanceIfComplete();
      return { rows: step.docs ?? [] };
    },
  };
}

test("waitForQueueDrain resolves once BOTH censuses read empty, not on the first clean census alone", async () => {
  // dirty (a stray workflow run) -> dirty (the run is gone but a document task is still live) ->
  // clean. Neither census alone is enough to resolve — this is the vacuity control's own target:
  // an implementation that ORs the two censuses instead of ANDing them would resolve one step
  // early.
  const rig = fakeRig([
    { runs: ["workflow//./workflows/documentIngest.v2//documentIngest_v2"], agent: [], docs: [] },
    { runs: [], agent: [], docs: [{ id: "t1", lane: "classify", status: "queued" }] },
    { runs: [], agent: [], docs: [] },
  ]);
  const logs = [];
  const result = await waitForQueueDrain(rig, { deadlineMs: 3000, log: (m) => logs.push(m) });
  assert.ok(result.polls >= 3, `expected at least 3 polls to walk all three steps, got ${result.polls}`);
  assert.ok(logs.some((m) => /drained/.test(m)), "the drain logs its own success");
});

test("waitForQueueDrain THROWS on timeout, naming the outstanding rows — never a silent pass", async () => {
  // Permanently dirty (the #967 shape: a capped classify task that never clears, e.g. left
  // `queued` forever by lib/classify.mjs's own MAX_ATTEMPTS backstop).
  const rig = fakeRig([{ runs: [], agent: [], docs: [{ id: "poisoned", lane: "classify", status: "queued" }] }]);
  await assert.rejects(
    () => waitForQueueDrain(rig, { deadlineMs: 300 }),
    (err) => {
      assert.match(err.message, /TIMED OUT/, "names the failure mode");
      assert.match(err.message, /poisoned/, "names the actual stuck row, not just a generic count");
      return true;
    },
  );
});

test("waitForQueueDrain resolves immediately (one poll) when the database was already clean", async () => {
  const rig = fakeRig([{ runs: [], agent: [], docs: [] }]);
  const result = await waitForQueueDrain(rig, { deadlineMs: 3000 });
  assert.equal(result.polls, 1, `a clean database should need exactly one poll, got ${result.polls}`);
});
