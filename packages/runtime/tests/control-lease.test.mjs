// The control listener's LEASED delivery (contract §3.3 / S4-D2). The engine is
// mocked (resumeHook / cancelRun are injected), so these are deterministic: the
// lease predicate, the mark-delivered-on-success-or-HookNotFound rule, lease
// expiry retry, and cancel_requested settlement. No world, no network.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { deliverInterruptions, processCancellations } from "../lib/control.mjs";
import * as rig from "./rig.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

after(async () => {
  await rig.endPool();
});

/** A chat task parked (awaiting_input) with a pending clarify carrying `hookTok`. */
async function parkedClarify(label, hookTok) {
  const { owner, firm, client } = await rig.buildFirm(label);
  const session = await rig.createChatSession({ author: owner, client });
  const { task_id } = await rig.beginChatTurn({ session, author: owner, turnKey: "t" });
  await rig.driveTask(task_id, ["running", "awaiting_input"]);
  const interId = await rig.insertInterruption({ task: task_id, hookToken: hookTok });
  return { task_id, interId, firm };
}

async function markAnswered(id, answer) {
  await rig.asRuntime((c) =>
    c.query(
      "update clara.agent_interruptions set status='answered', answer=$2::jsonb, answered_by=gen_random_uuid(), answered_at=now() where id=$1",
      [id, JSON.stringify(answer)],
    ),
  );
}
async function setLease(id, untilExpr) {
  await rig.asRuntime((c) => c.query(`update clara.agent_interruptions set claimed_by='ghost', claim_lease_until=${untilExpr} where id=$1`, [id]));
}
const hookNotFound = () => {
  const e = new Error("Hook not found");
  e.name = "HookNotFoundError";
  throw e;
};

test("deliver: an answered clarify is leased + resumed + marked delivered", { skip }, async () => {
  const hookTok = "clarify:t-one";
  const { interId, firm } = await parkedClarify("ctl1", hookTok);
  await markAnswered(interId, { text: "Acme Sdn Bhd" });

  const calls = [];
  const res = await rig.asRuntime((c) => deliverInterruptions(c, { resumeHook: async (t, p) => calls.push({ t, p }), onlyFirm: firm }));
  assert.equal(res.delivered, 1, "one delivered");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].t, hookTok, "resumed the exact hook token from the question payload");
  assert.deepEqual(calls[0].p, { kind: "answer", answer: { text: "Acme Sdn Bhd" } });

  const row = await rig.readInterruption(interId);
  assert.ok(row.delivered_at, "delivered_at stamped");
});

test("deliver: claim_crash_before_resume retries only AFTER the lease expires", { skip }, async () => {
  const { interId, firm } = await parkedClarify("ctl2", "clarify:t-two");
  await markAnswered(interId, { text: "x" });
  await setLease(interId, "now() + interval '60 seconds'"); // a crashed listener holds a live lease

  const first = await rig.asRuntime((c) => deliverInterruptions(c, { resumeHook: async () => {}, onlyFirm: firm }));
  assert.equal(first.leased, 0, "a live lease is not re-leased");
  assert.equal((await rig.readInterruption(interId)).delivered_at, null, "not delivered while leased");

  await setLease(interId, "now() - interval '1 second'"); // lease expires
  const second = await rig.asRuntime((c) => deliverInterruptions(c, { resumeHook: async () => {}, onlyFirm: firm }));
  assert.equal(second.delivered, 1, "delivered after the lease expired");
  assert.ok((await rig.readInterruption(interId)).delivered_at, "delivered_at now set");
});

test("deliver: resume crash then HookNotFound marks delivered (single-shot — S4-P1d)", { skip }, async () => {
  const { interId, firm } = await parkedClarify("ctl3", "clarify:t-three");
  await markAnswered(interId, { text: "x" });
  const res = await rig.asRuntime((c) => deliverInterruptions(c, { resumeHook: hookNotFound, onlyFirm: firm }));
  assert.equal(res.delivered, 1, "HookNotFound counts as delivered (already resumed by a prior crashed attempt)");
  assert.ok((await rig.readInterruption(interId)).delivered_at, "delivered_at stamped despite HookNotFound");
});

test("deliver: a transient resume error leaves the row undelivered for retry", { skip }, async () => {
  const { interId, firm } = await parkedClarify("ctl4", "clarify:t-four");
  await markAnswered(interId, { text: "x" });
  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, {
      resumeHook: async () => {
        throw new Error("world temporarily unreachable");
      },
      onlyFirm: firm,
    }),
  );
  assert.equal(res.delivered, 0, "not delivered on a transient error");
  assert.equal((await rig.readInterruption(interId)).delivered_at, null, "delivered_at stays null (will retry after lease)");
});

test("cancel: processCancellations aborts the run and settles the task cancelled", { skip }, async () => {
  const { task_id, firm } = await parkedClarify("ctl5", "clarify:t-five");
  // Give the parked task an engine run id + cancel_requested (the human-cancel effect).
  await rig.asRuntime((c) => c.query("update clara.agent_tasks set workflow_run_id='wrun_fake_5', status='cancel_requested' where id=$1", [task_id]));

  const aborted = [];
  const res = await rig.asRuntime((c) => processCancellations(c, { cancelRun: async (r) => aborted.push(r), onlyFirm: firm }));
  assert.equal(res.settled, 1, "one cancellation settled");
  assert.deepEqual(aborted, ["wrun_fake_5"], "the engine run was aborted");
  assert.equal((await rig.readTask(task_id)).status, "cancelled", "task settled cancelled");
});
