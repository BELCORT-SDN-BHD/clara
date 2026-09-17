// The control listener's LEASED delivery (contract §3.3 / S4-D2). The engine is
// mocked (resumeHook / cancelRun are injected), so these are deterministic: the
// lease predicate, the mark-delivered-on-success-or-HookNotFound rule, lease
// expiry retry, and cancel_requested settlement. No world, no network.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deliverInterruptions, processCancellations } from "../lib/control.mjs";
import * as rig from "./rig.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

after(async () => {
  await rig.endPool();
});

/** A chat task parked (awaiting_input) with a pending clarify. Generates a UNIQUE
 *  hook token (the column is globally unique) and returns it for assertions.
 *
 *  `runId` BINDS AN ENGINE RUN onto the task, which is what a real parked turn always has (the
 *  workflow's own claim step CAS-binds itself before it can ever reach `open_interruption`). It is
 *  opt-in rather than default because binding one also arms `processCancellations`' abort path, and
 *  the cancel cells below are deliberately written against a task with no run to abort. #764 is why
 *  it exists at all: `deliverInterruptions` now asks the ENGINE before it treats a HookNotFound on a
 *  CHAT row as delivery, and a fixture with no run gives it nothing to ask. */
async function parkedClarify(label, { runId = null } = {}) {
  const { owner, firm, client } = await rig.buildFirm(label);
  const session = await rig.createChatSession({ author: owner, client });
  const { task_id } = await rig.beginChatTurn({ session, author: owner, turnKey: "t" });
  if (runId) await rig.bindRun(task_id, runId);
  await rig.driveTask(task_id, runId ? ["awaiting_input"] : ["running", "awaiting_input"]);
  const hookTok = `clarify:${label}-${randomUUID()}`;
  const interId = await rig.insertInterruption({ task: task_id, hookToken: hookTok });
  return { task_id, interId, firm, hookTok };
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
  const { interId, firm, hookTok } = await parkedClarify("ctl1");
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
  const { interId, firm } = await parkedClarify("ctl2");
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

// #764 NARROWED WHAT THIS CELL PROVES, AND THE NARROWING IS THE POINT. S4-P1d's bare inference —
// "the hook is single-shot, so a NotFound must mean a prior attempt delivered it" — is true after a
// crashed resume and FALSE for a hook that was simply lost, and the chat lane can no longer tell
// the two apart by assumption. So the crash this cell models now names its WITNESS: the run that
// consumed the answer went on to finish, which is what `resumeAlreadyLanded` reads. The property
// under test is unchanged (exactly-once-or-provably-already-done); what changed is that "provably"
// is now proved. A chat row with NO such witness rests at `hook_missing` instead —
// `control-chat-clarify.test.mjs` owns that half.
test("deliver: resume-success-then-crash, retry gets HookNotFound → marked delivered (single-shot, S4-P1d)", { skip }, async () => {
  const runId = `run-ctl3-${randomUUID()}`;
  const { interId, firm } = await parkedClarify("ctl3", { runId });
  await markAnswered(interId, { text: "x" });

  // Stateful single-shot fake: the FIRST resume succeeds (the engine hook is consumed);
  // any later resume throws HookNotFound (the hook is single-shot).
  const resumed = [];
  let call = 0;
  const statefulResume = async (token, payload) => {
    call += 1;
    if (call === 1) {
      resumed.push({ token, payload });
      return;
    }
    hookNotFound();
  };

  // First delivery resumes the hook and marks delivered.
  const first = await rig.asRuntime((c) => deliverInterruptions(c, { resumeHook: statefulResume, onlyFirm: firm }));
  assert.equal(first.delivered, 1, "first delivery resumed + marked delivered");
  assert.equal(resumed.length, 1, "the hook was resumed exactly once");

  // Simulate the CRASH: the resume committed at the engine but the process died BEFORE
  // stamping delivered_at — so the row looks undelivered again, lease expired.
  await rig.asRuntime((c) =>
    c.query("update clara.agent_interruptions set delivered_at = null, claim_lease_until = now() - interval '1 second' where id = $1", [interId]),
  );

  // The retry re-leases it; the single-shot hook is gone → HookNotFound → marked delivered.
  const retry = await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: statefulResume, getRun: () => ({ status: Promise.resolve("completed") }), onlyFirm: firm }));
  assert.equal(retry.delivered, 1, "retry marked delivered on HookNotFound the ENGINE accounts for");
  assert.equal(resumed.length, 1, "the hook was NEVER resumed twice (exactly-once-or-provably-done)");
  assert.ok((await rig.readInterruption(interId)).delivered_at, "delivered_at stamped after the retry");
});

test("deliver: a transient resume error leaves the row undelivered for retry", { skip }, async () => {
  const { interId, firm } = await parkedClarify("ctl4");
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
  const { task_id, firm } = await parkedClarify("ctl5");
  // Give the parked task an engine run id + cancel_requested (the human-cancel effect).
  await rig.asRuntime((c) => c.query("update clara.agent_tasks set workflow_run_id='wrun_fake_5', status='cancel_requested' where id=$1", [task_id]));

  const aborted = [];
  const res = await rig.asRuntime((c) => processCancellations(c, { cancelRun: async (r) => aborted.push(r), onlyFirm: firm }));
  assert.equal(res.settled, 1, "one cancellation settled");
  assert.deepEqual(aborted, ["wrun_fake_5"], "the engine run was aborted");
  assert.equal((await rig.readTask(task_id)).status, "cancelled", "task settled cancelled");
});
