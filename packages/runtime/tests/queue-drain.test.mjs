// #967 — unit cells for tests/queue-drain.mjs's own retry/timeout shape, entirely in-memory (no
// database): a fake `rig.rootQuery` answers by SQL text (the FAILED-runs census / workflow_runs /
// agent_tasks / document_processing_tasks), tracking which of the four queries `waitForQueueDrain`'s
// single poll iteration has issued so far, so a batch's four queries always answer from the SAME
// simulated database snapshot regardless of the order they happen to resolve in.
import test from "node:test";
import assert from "node:assert/strict";
import { waitForQueueDrain } from "./queue-drain.mjs";

/** @param {Array<{runs?:unknown[], agent?:unknown[], docs?:unknown[], failed?:Array<{id:string,name:string}>}>} steps */
function fakeRig(steps) {
  let index = 0;
  const seen = new Set();
  const calls = [];
  const advanceIfComplete = () => {
    if (seen.size === 4) {
      seen.clear();
      if (index < steps.length - 1) index += 1;
    }
  };
  return {
    calls,
    rootQuery: async (sql) => {
      calls.push(sql);
      const step = steps[Math.min(index, steps.length - 1)];
      // MUST be checked before the plain `workflow_runs` match below — both queries read that
      // same table, and the failed-runs census is the more specific pattern of the two.
      if (/status = 'failed'/.test(sql)) {
        seen.add("failed");
        const rows = (step.failed ?? []).map((r) => ({ id: r.id, name: r.name, status: "failed" }));
        advanceIfComplete();
        return { rows };
      }
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

test("waitForQueueDrain THROWS when a run left behind by an earlier leg's queued work FAILS while this leg's own engine drives it, even though both other censuses go on to read empty — #967 AC3, L06-967-B", async () => {
  // The exact reproduced shape from the lane's own local run: a straggler was still
  // NON-TERMINAL (counted in `runs` on the first poll, so `waitForQueueDrain` does not resolve
  // yet and keeps polling under this leg's own still-running engine), then reached `failed` — a
  // TERMINAL status, so it silently disappears from `censusNonTerminalRuns` on the next poll.
  // Before this fix that disappearance reads as "drained" and the call resolves cleanly; a
  // genuine failure is carried into the next leg's log as if nothing happened, which is the exact
  // outcome AC3 names as the thing not to do.
  const rig = fakeRig([
    { runs: ["workflow//./workflows/documentIngest.v2//documentIngest_v2"], agent: [], docs: [], failed: [] },
    { runs: [], agent: [], docs: [], failed: [{ id: "run-poisoned", name: "workflow//./workflows/documentIngest.v2//documentIngest_v2" }] },
  ]);
  await assert.rejects(
    () => waitForQueueDrain(rig, { deadlineMs: 3000 }),
    (err) => {
      assert.match(err.message, /FAILED/, "names the failure mode, not a generic timeout");
      assert.match(err.message, /run-poisoned/, "names the actual failed run, not just a generic count");
      return true;
    },
  );
});

test("waitForQueueDrain does NOT throw on a run that was ALREADY failed before this leg's own drain wait began — a pre-existing failure is this leg's own already-resolved scope, not one newly drained away", async () => {
  // Reproduces the real shape found on this rig's own reused `clara_intake_ci` (fix round 1):
  // 106 `failed` `documentIngest_v2` runs already sitting on the database from these same legs'
  // own prior local exercise, none of them "left behind by an earlier leg's queued work" in the
  // AC3 sense — they were already terminal by the time ANY leg's drain call is reached. A blanket
  // "any failed row present" rule would make this gate throw on nearly every local re-run; the
  // baseline established on the FIRST poll is what keeps it silent on history and loud only on a
  // NEW failure witnessed during this leg's own wait.
  const rig = fakeRig([{ runs: [], agent: [], docs: [], failed: [{ id: "old-failure", name: "documentIngest_v2" }] }]);
  const result = await waitForQueueDrain(rig, { deadlineMs: 3000 });
  assert.equal(result.polls, 1, `a database whose only failures predate this wait should still drain in one poll, got ${result.polls}`);
});

test("waitForQueueDrain still resolves cleanly when no run has ever failed — the new census is not a false positive on ordinary drains", async () => {
  const rig = fakeRig([
    { runs: ["workflow//./workflows/documentIngest.v2//documentIngest_v2"], agent: [], docs: [], failed: [] },
    { runs: [], agent: [], docs: [], failed: [] },
  ]);
  const result = await waitForQueueDrain(rig, { deadlineMs: 3000 });
  assert.ok(result.polls >= 2, `expected at least 2 polls, got ${result.polls}`);
});

// ==============================================================================================
// #1151 — THE FIRM NARROWING, PROVEN BY WHAT THE GATE DOES, not by a bind parameter. The first
// cut of this fix passed a fourth bind parameter down into the SHIPPED
// `lib/rollback-preflight.mjs` and asserted on that parameter; the narrowing now lives in
// `queue-drain.mjs` itself (SPEC-K3-03: #1151 is a test-only ticket), so these cells drive
// `waitForQueueDrain` and assert the ANSWER — drained or timed out, and which rows the timeout
// names. A fake rig answers the census queries and the one narrowing statement by SQL text.
//
// The scoped fake models a database carrying TWO live agent rows: one belonging to the firm this
// leg built, one belonging to a stranger firm whose data no engine here will ever clear.
// ==============================================================================================

const OWN_FIRM = "11111111-1111-1111-1111-111111111111";
const STRANGER_FIRM = "22222222-2222-2222-2222-222222222222";

/** @param {{rows: Array<{id:string, firm:string}>}} db */
function twoFirmRig(db) {
  const narrowingCalls = [];
  return {
    narrowingCalls,
    rootQuery: async (sql, params) => {
      // The narrowing statement FIRST: it names agent_tasks too, and the census matcher below
      // would otherwise swallow it.
      if (/queue-drain firm scope/.test(sql)) {
        narrowingCalls.push(params);
        const [agentIds, , firmIds] = params;
        const rows = db.rows
          .filter((r) => agentIds.includes(r.id) && firmIds.includes(r.firm))
          .map((r) => ({ tbl: "clara.agent_tasks", id: r.id }));
        return { rows };
      }
      if (/status = 'failed'/.test(sql)) return { rows: [] };
      if (/workflow_runs/.test(sql)) return { rows: [] };
      if (/agent_tasks/.test(sql)) {
        return { rows: db.rows.map((r) => ({ id: r.id, kind: "wake", work_id: null, status: "held", source_class: null })) };
      }
      return { rows: [] };
    },
  };
}

test("#1151 waitForQueueDrain scoped to the leg's OWN firms drains past a stranger firm's live row", async () => {
  // The database carries exactly one live agent row, and it belongs to a firm this leg never
  // built — the shape a rig clone of a used estate always has. Scoped, that row is not this leg's
  // to drive, so the gate DRAINS instead of timing out on it.
  const rig = twoFirmRig({ rows: [{ id: "stranger-task", firm: STRANGER_FIRM }] });
  const result = await waitForQueueDrain(rig, { deadlineMs: 1500, firmIds: [OWN_FIRM] });
  assert.ok(result.polls >= 1, "the scoped drain resolved rather than timing out on a row it does not own");
  assert.ok(rig.narrowingCalls.length >= 1, "the narrowing statement was actually issued");
  assert.deepEqual(rig.narrowingCalls[0][2], [OWN_FIRM], "…carrying exactly the firms the caller named");
});

test("#1151 the SAME database, UNSCOPED, times out naming the stranger's row — the narrowing is what changed the answer", async () => {
  const rig = twoFirmRig({ rows: [{ id: "stranger-task", firm: STRANGER_FIRM }] });
  await assert.rejects(
    () => waitForQueueDrain(rig, { deadlineMs: 400 }),
    (err) => {
      assert.match(err.message, /TIMED OUT/);
      assert.match(err.message, /stranger-task/, "an unscoped drain is held open by a firm it never built");
      return true;
    },
  );
  assert.equal(rig.narrowingCalls.length, 0,
    "an omitted firmIds issues NO narrowing statement at all — every existing caller keeps its exact unscoped answer");
});

test("#1151 a scoped drain still FAILS, naming the leg's OWN live row, and never the excluded one", async () => {
  const rig = twoFirmRig({ rows: [{ id: "own-task", firm: OWN_FIRM }, { id: "stranger-task", firm: STRANGER_FIRM }] });
  await assert.rejects(
    () => waitForQueueDrain(rig, { deadlineMs: 400, firmIds: [OWN_FIRM] }),
    (err) => {
      assert.match(err.message, /TIMED OUT/);
      assert.match(err.message, /own-task/, "names THIS leg's own live task");
      assert.doesNotMatch(err.message, /stranger-task/, "never blocked by, and never blaming, a firm this scope excluded");
      return true;
    },
  );
});

test("#1151 an EMPTY firmIds array is refused BY NAME, never silently answered 'drained'", async () => {
  const rig = twoFirmRig({ rows: [{ id: "own-task", firm: OWN_FIRM }] });
  await assert.rejects(
    () => waitForQueueDrain(rig, { deadlineMs: 400, firmIds: [] }),
    (err) => {
      assert.match(err.message, /EMPTY array/);
      assert.doesNotMatch(err.message, /TIMED OUT/, "refused before any poll, not after a wait");
      return true;
    },
  );
  assert.equal(rig.narrowingCalls.length, 0, "nothing was asked of the database at all");
});

