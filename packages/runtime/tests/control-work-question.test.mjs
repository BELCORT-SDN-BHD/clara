// #629 — THE CONTROL LISTENER'S WORK-QUESTION DELIVERY. Real Postgres, MOCKED WORLD (resumeHook /
// getRun are injected), so every cell below is deterministic: no engine, no network, no sleeping
// on a real hook.
//
// WHAT THIS FILE RETIRES. `deliverInterruptions` used to stamp `delivered_at` on ANY
// HookNotFoundError, on the reasoning that the engine hook is single-shot so a NotFound must mean a
// prior attempt already delivered it. That is true after a crashed resume and FALSE in the one case
// that matters: a run whose hook is simply gone — reaped, lost, never created — is marked
// "delivered" while it sits parked for ever, and the Work never advances and never settles. #629
// asks for "reconcile actual hook/run state rather than treating HookNotFound as delivery success",
// and these cells are that reconciliation, both directions.
//
// IT ALSO PINS THE CLAIMANT CONDITION. The delivered stamp used to be `where id=$1 and delivered_at
// is null` — so a listener whose lease had EXPIRED and been re-taken by another process could still
// stamp the row delivered after ITS resume returned, hiding the second process's own delivery.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deliverInterruptions, expirePastDueInterruptions, resumePayloadFor } from "../lib/control.mjs";
import { reconcileAccountingWorkTasks } from "../lib/reconciler-work.mjs";
import * as rig from "./rig.mjs";

async function workQuestionReady() {
  try {
    const r = await rig.rootQuery(`
      select
        to_regprocedure('clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)') is not null as open_fn,
        to_regprocedure('clara.expire_due_interruptions(integer,uuid)') is not null as expire_fn,
        to_regclass('clara.accounting_work') is not null as work_tbl`);
    const row = r.rows[0] ?? {};
    return Boolean(row.open_fn && row.expire_fn && row.work_tbl);
  } catch {
    return false;
  }
}

const READY = (await rig.runtimeReady()) && (await workQuestionReady());
const SKIP = READY ? false : "migration 0180 (work questions) is not on this database";

after(async () => {
  await rig.endPool();
});

const FIELDS = [
  { key: "posting_date", label: "Which date?", kind: "date", required: true },
  { key: "amount_cents", label: "How much, in cents?", kind: "money", required: true },
];

function basis() {
  return {
    posting_date: "2026-09-01",
    memo: "office rent paid from Maybank",
    currency: "MYR",
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
    ],
  };
}

/** An accounting Work, claimed onto a run, parked on ONE work question. Everything through the
 *  real verbs — a planted row would prove nothing about what the estate actually parks. */
async function parkedWorkQuestion(label) {
  const { owner, firm, client } = await rig.buildFirm(label);
  const admitted = await rig
    .asRuntime((c) =>
      c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r", [
        client, owner, `wq-${label}-${randomUUID()}`, JSON.stringify(basis()), "user_direct", "[]", rig.DEFAULT_MODEL,
      ]),
    )
    .then((r) => r.rows[0].r);
  const runId = `run-${label}-${randomUUID()}`;
  await rig.asRuntime((c) =>
    c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb)", [
      admitted.task_id, runId, JSON.stringify({ id: "clara-work/v2", digest: "f".repeat(64), model: rig.DEFAULT_MODEL }),
    ]),
  );
  const token = `wq:${label}-${randomUUID()}`;
  const opened = await rig
    .asRuntime((c) =>
      c.query("select clara.open_work_question($1::uuid,$2::text,$3::jsonb,$4::jsonb,$5::text,$6::jsonb) as r", [
        admitted.task_id, token,
        JSON.stringify({ type: "clarify", question: "Which date and how much?", context: null, framing: "work_question" }),
        JSON.stringify(FIELDS), "The admitted basis names no amount.", null,
      ]),
    )
    .then((r) => r.rows[0].r);
  return { owner, firm, client, runId, token, taskId: admitted.task_id, workId: admitted.work_id, questionId: opened.question_id };
}

/** Accept the answer through the REAL human door, so the row carries what a real answer carries. */
async function answer(owner, questionId, answerObj = { posting_date: "2026-09-05", amount_cents: 98765 }) {
  await rig.humanQuery(owner,
    "select clara.answer_work_question($1::uuid,$2::int,$3::jsonb,$4::text)",
    [questionId, 1, JSON.stringify(answerObj), `k-${randomUUID()}`]);
}

const hookNotFound = () => {
  const e = new Error("Hook not found");
  e.name = "HookNotFoundError";
  throw e;
};
const runStatus = (status) => () => ({ status: Promise.resolve(status) });

// ===========================================================================================
// 1 · The payload a Work question resumes with.
// ===========================================================================================

test("payload: a work question resumes with its identity; a chat clarify keeps today's shape", { skip: SKIP }, async () => {
  const at = new Date("2026-09-10T02:03:04.000Z");
  const work = resumePayloadFor({
    id: "q1", status: "answered", answer: { amount_cents: 42 }, work_id: "w1",
    question_version: 2, answered_by: "u1", answered_role: "bookkeeper", answered_at: at,
  });
  assert.deepEqual(work, {
    kind: "answer", answer: { amount_cents: 42 }, question_id: "q1", question_version: 2,
    answered_by: "u1", answered_role: "bookkeeper", answered_at: "2026-09-10T02:03:04.000Z",
  }, "payload: the run is told WHICH question and version it is resuming, and on whose authority");

  const chat = resumePayloadFor({ id: "c1", status: "answered", answer: { text: "Acme" }, work_id: null });
  assert.deepEqual(chat, { kind: "answer", answer: { text: "Acme" } },
    "payload: the chat lane's payload is byte-identical to what it was before 0180");
});

// ===========================================================================================
// 2 · Delivery stamps the state, counts the attempt, and is CONDITIONED on the claimant.
// ===========================================================================================

test("deliver: an answered work question is leased, resumed and stamped delivered", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq1");
  await answer(p.owner, p.questionId);

  const calls = [];
  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: async (t, pl) => calls.push({ t, pl }), getRun: runStatus("running"), onlyFirm: p.firm }));
  assert.equal(res.delivered, 1);
  assert.equal(calls[0].t, p.token);
  assert.equal(calls[0].pl.question_id, p.questionId, "deliver: the payload names the question");
  assert.equal(calls[0].pl.question_version, 1);
  assert.equal(calls[0].pl.answered_role, "owner", "deliver: …and the role whose authority accepted it");
  assert.deepEqual(calls[0].pl.answer, { posting_date: "2026-09-05", amount_cents: 98765 });

  const row = await rig.readInterruption(p.questionId);
  assert.ok(row.delivered_at, "deliver: delivered_at stamped");
  assert.equal(row.delivery_state, "delivered");
  assert.equal(row.delivery_attempts, 1, "deliver: exactly one attempt was spent");
});

test("deliver: the delivered stamp REFUSES when the lease was lost to another claimant", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq2");
  await answer(p.owner, p.questionId);

  // The lease is stolen WHILE the resume is in flight — the exact window a slow world call opens.
  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, {
      getRun: runStatus("running"),
      onlyFirm: p.firm,
      resumeHook: async () => {
        await rig.asRuntime((c2) =>
          c2.query("update clara.agent_interruptions set claimed_by='another-listener' where id=$1", [p.questionId]));
      },
    }));
  assert.equal(res.delivered, 0, "deliver: a listener that lost its lease does not count a delivery");
  assert.equal(res.leaseLost, 1, "deliver: …and says so, rather than failing silently");
  const row = await rig.readInterruption(p.questionId);
  assert.equal(row.delivered_at, null, "deliver: the row is still deliverable by whoever holds the lease");
  assert.notEqual(row.delivery_state, "delivered");
});

// ===========================================================================================
// 3 · HookNotFound is NOT delivery. It is a question about the RUN.
// ===========================================================================================

test("hook-missing: a live run whose hook is gone is NOT delivered — it rests in hook_missing", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq3");
  await answer(p.owner, p.questionId);

  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));
  assert.equal(res.delivered, 0, "hook-missing: nothing was delivered, and nothing pretends otherwise");
  assert.equal(res.hookMissing, 1);
  const row = await rig.readInterruption(p.questionId);
  assert.equal(row.delivered_at, null);
  assert.equal(row.delivery_state, "hook_missing");
  assert.equal(row.claim_lease_until, null, "hook-missing: the lease is released rather than left to rot");
});

test("hook-missing: a row already at hook_missing is not re-leased by the delivery scan", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq4");
  await answer(p.owner, p.questionId);
  await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));

  let attempts = 0;
  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, {
      resumeHook: async () => { attempts += 1; },
      getRun: runStatus("running"),
      onlyFirm: p.firm,
    }));
  assert.equal(res.leased, 0, "hook-missing: the scan excludes it — the Work reconciler owns it now");
  assert.equal(attempts, 0);
  assert.equal((await rig.readInterruption(p.questionId)).delivery_attempts, 1,
    "hook-missing: and no second attempt is spent on it");
});

test("hook-missing: a TERMINAL run proves the resume already landed — stamp delivered", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq5");
  await answer(p.owner, p.questionId);

  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("completed"), onlyFirm: p.firm }));
  assert.equal(res.delivered, 1, "hook-missing: a completed run consumed its hook — that IS delivery");
  const row = await rig.readInterruption(p.questionId);
  assert.ok(row.delivered_at);
  assert.equal(row.delivery_state, "delivered");
});

test("hook-missing: a task that has LEFT awaiting_input proves it too", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq6");
  await answer(p.owner, p.questionId);
  // The workflow's own markRunningStep: the run consumed the answer and went back to work.
  await rig.asRuntime((c) => c.query("update clara.agent_tasks set status='running' where id=$1", [p.taskId]));

  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));
  assert.equal(res.delivered, 1, "hook-missing: the run moved on, so the answer reached it");
  assert.equal((await rig.readInterruption(p.questionId)).delivery_state, "delivered");
});

test("hook-missing: an UNREADABLE run state decides nothing — the row is left for the next cycle", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq7");
  await answer(p.owner, p.questionId);

  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, {
      resumeHook: hookNotFound,
      getRun: () => { throw new Error("world unreachable"); },
      onlyFirm: p.firm,
    }));
  assert.equal(res.delivered, 0);
  assert.equal(res.hookMissing, 0, "hook-missing: not knowing is not the same as knowing the hook is gone");
  const row = await rig.readInterruption(p.questionId);
  assert.equal(row.delivered_at, null);
  assert.equal(row.delivery_state, "leased", "hook-missing: the lease simply expires and the scan retries");
});

// ===========================================================================================
// 4 · A slow resume renews its lease instead of losing it.
// ===========================================================================================

test("lease: a resume slower than the lease renews it and still stamps delivered", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq8");
  await answer(p.owner, p.questionId);

  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, {
      getRun: runStatus("running"),
      onlyFirm: p.firm,
      leaseSeconds: 2,
      resumeHook: async () => { await rig.sleep(2600); },
    }));
  assert.equal(res.delivered, 1, "lease: the renewal kept the claim alive across a 2.6s resume on a 2s lease");
  assert.ok(res.leaseRenewals >= 1, "lease: …and it actually renewed");
  assert.equal((await rig.readInterruption(p.questionId)).delivery_state, "delivered");
});

test("lease: an attempt past its bound is abandoned rather than allowed to run for ever", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq9");
  await answer(p.owner, p.questionId);

  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, {
      getRun: runStatus("running"),
      onlyFirm: p.firm,
      leaseSeconds: 1,
      maxLeaseRenewals: 1,
      resumeHook: () => new Promise(() => {}),   // never settles
    }));
  assert.equal(res.delivered, 0, "lease: an unbounded resume is not a delivery");
  assert.equal(res.attemptAbandoned, 1);
  assert.equal((await rig.readInterruption(p.questionId)).delivered_at, null,
    "lease: the row stays deliverable — the lease expires and the next cycle re-leases it");
});

// ===========================================================================================
// 5 · The expiry arm the 14-day deadline never had.
// ===========================================================================================

test("expire: a past-due work question is expired and then delivered as expired", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq10");
  // `expires_at` is immutable (0006), so the past-due row is PLANTED at insert time on the same
  // Work. The FIRST question is closed the way the estate closes one.
  await rig.asRuntime((c) =>
    c.query("update clara.agent_interruptions set status='cancelled' where id=$1", [p.questionId]));
  const planted = await rig.asRuntime((c) =>
    c.query(
      `insert into clara.agent_interruptions
         (task_id, hook_token, question, expires_at, work_id, client_id, question_version, basis_digest, fields)
       select $1, $2, $3::jsonb, now() - interval '1 hour', w.id, w.client_id, 2, w.basis_digest, $4::jsonb
         from clara.accounting_work w where w.id = $5 returning id`,
      [p.taskId, `wq:past-${randomUUID()}`,
        JSON.stringify({ type: "clarify", question: "Which date?", context: null, framing: "work_question" }),
        JSON.stringify(FIELDS), p.workId]),
  ).then((r) => r.rows[0].id);

  const swept = await rig.asRuntime((c) => expirePastDueInterruptions(c, { onlyFirm: p.firm }));
  assert.ok(swept.expired >= 1, "expire: the sweep moved the past-due question");
  assert.equal((await rig.readInterruption(planted)).status, "expired");

  const calls = [];
  await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: async (t, pl) => calls.push({ t, pl }), getRun: runStatus("running"), onlyFirm: p.firm }));
  const expiredCall = calls.find((x) => x.pl.kind === "expired");
  assert.ok(expiredCall, "expire: the parked run is told its question expired, so it can settle recoverably");
});

test("expire: a live question and a CHAT clarify are both left alone", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq11");
  const session = await rig.createChatSession({ author: p.owner, client: p.client });
  const { task_id } = await rig.beginChatTurn({ session, author: p.owner, turnKey: `t-${randomUUID()}` });
  await rig.driveTask(task_id, ["running", "awaiting_input"]);
  const chatId = await rig.insertInterruption({ task: task_id, expiresInDays: -1 });

  await rig.asRuntime((c) => expirePastDueInterruptions(c, { onlyFirm: p.firm }));
  assert.equal((await rig.readInterruption(p.questionId)).status, "pending",
    "expire: a question inside its deadline is untouched");
  assert.equal((await rig.readInterruption(chatId)).status, "pending",
    "expire: the arm is scoped to WORK questions — the chat lane's identical gap is a separate finding");
});

// ===========================================================================================
// 6 · The Work reconciler's other half: an unreachable question settles the Work recoverably.
// ===========================================================================================

test("reconcile: a parked Work whose question rests at hook_missing settles expired/question_unreachable", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq12");
  await answer(p.owner, p.questionId);
  await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));
  assert.equal((await rig.readInterruption(p.questionId)).delivery_state, "hook_missing");
  // …and it has RESTED there past the grace. A stamp written moments ago is not yet evidence (see
  // the grace cell below); ageing it is what makes this cell about the settle rather than a race
  // with a sleep in it.
  await ageHookMissing(p.questionId);

  // The engine still believes the run is in flight. Before #629 this row was skipped for ever.
  const out = await rig.asRuntime((c) =>
    reconcileAccountingWorkTasks(c, {
      enqueueClaraWork: async () => {},
      getRun: runStatus("running"),
      onlyFirm: p.firm,
    }));
  assert.equal(out.workSettledExpired, 1, "reconcile: the Work is settled, not left parked");

  const work = await rig.rootQuery("select status, error, result from clara.accounting_work where id=$1", [p.workId])
    .then((r) => r.rows[0]);
  assert.equal(work.status, "expired");
  assert.equal(work.error.reason, "question_unreachable");
  assert.equal(work.error.recoverable, true, "reconcile: …and a human can Retry it");
  assert.equal(work.result, null, "reconcile: nothing was posted, and the row says so");
});

/** Push a `hook_missing` stamp back past any plausible grace. `delivery_state_at` is in the
 *  trigger's FREE set (runtime bookkeeping), so this is a lawful write, not a doctored row. */
async function ageHookMissing(questionId, interval = "1 hour") {
  await rig.rootQuery(
    `update clara.agent_interruptions set delivery_state_at = clock_timestamp() - ($2)::interval where id = $1`,
    [questionId, interval]);
}

// ===========================================================================================
// 7 · THE GRACE AND THE SECOND PROBE (reviewed finding).
//
// A Work was settled `expired` on the FIRST sweep after a `hook_missing` stamp, with no grace and
// no second look. The window that makes that wrong is real and narrow: the control listener probes
// between the engine CONSUMING the hook and the resumed run's own `markRunningStep`, sees a live
// run with no hook, and writes `hook_missing` — while the answer is in fact landing. One sweep
// later the Work is expired and the human is told their answer could not be delivered, about an
// answer that arrived.
//
// TWO BELTS, because either alone still loses the race: the stamp must have RESTED past a grace,
// AND the task/run must be RE-PROBED at settle time. The second is what catches a resume that
// landed DURING the grace.
// ===========================================================================================

test("reconcile: a hook_missing stamped MOMENTS ago is not yet evidence — the grace holds", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq13");
  await answer(p.owner, p.questionId);
  await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));
  const row = await rig.readInterruption(p.questionId);
  assert.equal(row.delivery_state, "hook_missing");
  assert.ok(row.delivery_state_at instanceof Date,
    "grace: the listener records WHEN it decided, or the grace has nothing to measure");

  const out = await rig.asRuntime((c) =>
    reconcileAccountingWorkTasks(c, {
      enqueueClaraWork: async () => {},
      getRun: runStatus("running"),
      onlyFirm: p.firm,
    }));
  assert.equal(out.workSettledExpired, 0, "grace: a fresh stamp does not settle a Work");
  const work = await rig.rootQuery("select status from clara.accounting_work where id=$1", [p.workId])
    .then((r) => r.rows[0]);
  assert.equal(work.status, "awaiting_input", "grace: …the Work is still parked, exactly as it should be");
});

test("reconcile: the TASK moved on between the two probes, and the settle is abandoned", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq14");
  await answer(p.owner, p.questionId);
  await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));
  await ageHookMissing(p.questionId);

  // THE INJECTED WORLD MOVES THE TASK BETWEEN THE TWO PROBES. The sweep reads its open rows FIRST
  // (`awaiting_input`) and only then asks the engine, so a getRun that also lets the resumed run do
  // what a resumed run does — `markRunningStep` — reproduces the race exactly: the sweep is holding
  // a task row that says parked while the database says running. A belt that read the task once
  // would expire a Work that had already continued.
  let probes = 0;
  const movingWorld = (runId) => {
    probes += 1;
    void runId;
    if (probes > 1) return { status: Promise.resolve("running") };
    return {
      status: rig
        .asRuntime((c) => c.query("update clara.agent_tasks set status='running' where id=$1", [p.taskId]))
        .then(() => "running"),
    };
  };

  const out = await rig.asRuntime((c) =>
    reconcileAccountingWorkTasks(c, { enqueueClaraWork: async () => {}, getRun: movingWorld, onlyFirm: p.firm }));
  assert.equal(out.workSettledExpired, 0, "reconcile: an answer that landed during the grace is not expired away");
  const work = await rig.rootQuery("select status, error from clara.accounting_work where id=$1", [p.workId])
    .then((r) => r.rows[0]);
  assert.notEqual(work.status, "expired");
  assert.equal(work.error, null, "reconcile: …and nothing false was written about it");
  assert.equal((await rig.readInterruption(p.questionId)).delivery_state, "hook_missing",
    "reconcile: the question is left exactly as it was — the next sweep decides with fresh facts");
});

test("reconcile: the RUN state is asked AGAIN before settling, not trusted from the sweep's first look", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq16");
  await answer(p.owner, p.questionId);
  await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));
  await ageHookMissing(p.questionId);

  // The task stays parked, so the re-probe reaches the ENGINE — which by then says the run
  // finished. `terminalForWork`'s own arm owns that outcome, with the terminal the engine's status
  // actually implies; this belt must stand down rather than write `expired` over it.
  let probes = 0;
  const settlingWorld = () => {
    probes += 1;
    return { status: Promise.resolve(probes === 1 ? "running" : "completed") };
  };

  const out = await rig.asRuntime((c) =>
    reconcileAccountingWorkTasks(c, { enqueueClaraWork: async () => {}, getRun: settlingWorld, onlyFirm: p.firm }));
  assert.equal(probes, 2, "reconcile: exactly two probes — the sweep's, and the one before settling");
  assert.equal(out.workSettledExpired, 0, "reconcile: a run that finished during the grace is not expired away");
  const work = await rig.rootQuery("select status from clara.accounting_work where id=$1", [p.workId])
    .then((r) => r.rows[0]);
  assert.equal(work.status, "awaiting_input", "reconcile: nothing is written on a cycle that decided nothing");
});

test("deliver: every delivery_state write records WHEN it was written", { skip: SKIP }, async () => {
  const p = await parkedWorkQuestion("wq15");
  await answer(p.owner, p.questionId);
  const before = await rig.readInterruption(p.questionId);
  assert.equal(before.delivery_state, "pending");
  assert.equal(before.delivery_state_at, null, "deliver: an unopened delivery has no decision to time");

  await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: async () => {}, getRun: runStatus("running"), onlyFirm: p.firm }));
  const after_ = await rig.readInterruption(p.questionId);
  assert.equal(after_.delivery_state, "delivered");
  assert.ok(after_.delivery_state_at instanceof Date, "deliver: the delivered stamp carries its own instant");
});
