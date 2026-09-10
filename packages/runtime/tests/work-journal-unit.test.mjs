// #623 — THE SEGMENT, driven by a scripted model against a fake pool API.
//
// This is the merge proof's shape with the proof's synthetic schema thrown away: a real AI SDK
// 7.0.77 `ToolLoopAgent` runs the REAL frozen tool set, and every accounting boundary is the
// real one's SQL text and the real one's credential mint — only the connections and the model
// are doubles. What it proves is what no DB cell can (a model's decisions) and what no rig cell
// should have to (that a refusal ends the loop rather than being retried with new numbers).
//
// The step bodies are reached through the tsx/esm register() idiom; a `"use step"` directive is
// inert outside the WDK compiler, so `runWorkSegmentStep` runs here as a plain async function.
// `getWritable()` throws outside a run and the step's own `writeParts` swallows that by design —
// the durable row is the Work's authority, never the stream.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const impl = await import("../workflows/claraWork.v1.impl.ts");
const bundle = await import("../workflows/claraWork.v1.bundle.ts");

const {
  FIXTURE_ACCOUNTS,
  fakeWorkPools,
  installWorkTestDoubles,
  loadedWork,
  say,
  scriptedWorkModel,
  toolCall,
} = await import("./work-scripted-model.mjs");

const WORK = loadedWork();
const RUN_ID = "run_623_unit";
const RECEIPT = {
  posted: true,
  entry_id: "55555555-5555-4555-8555-555555555555",
  revision_token: "rev-1",
  receipt_id: "66666666-6666-4666-8666-666666666666",
  logical_op_id: WORK.logicalOpId,
  replayed: false,
};

const raise = (code, reason, message = "refused") =>
  Object.assign(new Error(message), { code, detail: JSON.stringify({ reason }) });

/** The correct, unmutated echo of the admitted basis. */
function goodInput() {
  return { basis: WORK.basis, rationale: "the human asked for this posting" };
}

async function runSegment({ script, accounts = FIXTURE_ACCOUNTS, record, work = WORK }) {
  const { api, calls } = fakeWorkPools({ accounts, record });
  const { model, state } = scriptedWorkModel(script);
  const restore = installWorkTestDoubles({ pools: api, model });
  try {
    const outcome = await impl.runWorkSegmentStep("task-1", work, RUN_ID, [{ role: "user", content: impl.workEnvelopeMessage(work) }]);
    return { outcome, calls, model: state };
  } finally {
    restore();
  }
}

test("623.unit: list_accounts then record_journal_entry completes with a receipt", async () => {
  const { outcome, calls, model } = await runSegment({
    script: [
      toolCall("c1", "list_accounts", {}),
      toolCall("c2", "record_journal_entry", goodInput()),
      // A THIRD turn is scripted deliberately and must never be reached: a successful post is a
      // TERMINAL tool result, so the segment ends without giving the model another turn in which
      // it could post again, narrate a second effect, or "improve" what it just recorded. The
      // scripted model throws on an unscripted call, so this entry is the proof, not padding.
      say("this narration must never be produced"),
    ],
    record: () => RECEIPT,
  });

  assert.equal(calls.trialBalance, 1, "the required accounts read ran exactly once");
  assert.equal(calls.record.length, 1, "the write ran exactly once");
  assert.equal(model.calls, 2, "the loop stopped ON the successful post — no post-hoc narration turn");

  assert.deepEqual(outcome.posted, {
    entry_id: RECEIPT.entry_id,
    receipt_id: RECEIPT.receipt_id,
    revision_token: "rev-1",
    logical_op_id: WORK.logicalOpId,
    replayed: false,
  });
  assert.equal(outcome.terminal, null, "a successful post is not an error classification");
  assert.equal(outcome.requiredReadFailed, false);
  assert.equal(outcome.exhausted, null);

  // The stream carries the identifiers-only result card, and nothing that moves.
  const kinds = outcome.parts.map((p) => p.type);
  assert.deepEqual(kinds, ["work_result"], "the record IS the card; the run does not narrate over it");
  const result = outcome.parts.find((p) => p.type === "work_result");
  assert.deepEqual(result, {
    type: "work_result",
    work_id: WORK.workId,
    client_id: WORK.clientId,
    entry_id: RECEIPT.entry_id,
    receipt_id: RECEIPT.receipt_id,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result, "posting_date"), false, "no moving value rides the card");

  // The budget spend is RECORDED, not merely bounded.
  assert.deepEqual(outcome.budget, { toolCalls: 2, replans: 0, transientRetries: 0 });
  assert.ok(outcome.usageTokens > 0, "token spend is carried out of the segment");
});

test("623.unit: the write is minted OBO the human, client-pinned, and carries the bundle digest", async () => {
  const { calls } = await runSegment({
    script: [toolCall("c1", "list_accounts", {}), toolCall("c2", "record_journal_entry", goodInput()), say("done")],
    record: () => RECEIPT,
  });

  const readMint = calls.mints.find((m) => m.kind === "interactive");
  const writeMint = calls.mints.find((m) => m.kind === "interactive_client");
  assert.ok(readMint, "the required read mints a plain interactive credential OBO the initiator");
  assert.equal(readMint.oboUserId, WORK.initiator);
  assert.ok(writeMint, "the write mints the PINNED interactive_client kind");
  assert.equal(writeMint.oboUserId, WORK.initiator, "on behalf of the HUMAN — never a service identity");
  assert.equal(writeMint.clientId, WORK.clientId, "pinned to this Work's client");

  const params = calls.record[0];
  assert.equal(params[0], WORK.clientId);
  assert.equal(params[1], WORK.workId);
  assert.equal(params[2], WORK.logicalOpId, "the server-assigned logical identity, not a model-supplied key");
  assert.deepEqual(JSON.parse(params[3]), WORK.basis, "the ADMITTED basis, echoed verbatim");
  assert.equal(params[4], bundle.CLARA_WORK_BUNDLE_V1_DIGEST, "the receipt records which bundle acted");
  assert.equal(params[5], RUN_ID);
  assert.match(String(params[6]), /human/, "the rationale the model gave rides to the receipt");
});

test("623.unit: a REFUSAL is terminal — the model gets no second attempt with mutated params", async () => {
  const mutated = {
    basis: {
      posting_date: "2026-10-01", // a different period, which is exactly the "work around it" move
      memo: WORK.basis.memo,
      currency: "MYR",
      lines: WORK.basis.lines,
    },
    rationale: "trying a different date",
  };
  const { outcome, calls, model } = await runSegment({
    script: [
      toolCall("c1", "list_accounts", {}),
      toolCall("c2", "record_journal_entry", goodInput()),
      // The model WANTS a second attempt with changed figures. The segment must never reach it.
      toolCall("c3", "record_journal_entry", mutated),
      say("unreachable"),
    ],
    record: () => {
      throw raise("CLR10", "write_into_closed_period", "the posting period is closed");
    },
  });

  assert.equal(calls.record.length, 1, "the recording verb was called EXACTLY ONCE — no mutated retry");
  assert.equal(model.calls, 2, "the loop stopped on the terminal tool result, before the third model turn");
  assert.equal(outcome.posted, null);
  assert.equal(outcome.terminal.kind, "refusal");
  assert.equal(outcome.terminal.reason, "write_into_closed_period");
  assert.equal(outcome.terminal.recoverable, true, "a closed period is recoverable BY A HUMAN, not by the model");
  const refusal = outcome.parts.find((p) => p.type === "refusal");
  assert.equal(refusal.reason, "write_into_closed_period", "the typed reason reaches the stream, not just prose");
});

test("623.unit: a CONFLICT is terminal too, and is not recoverable by retrying the same Work", async () => {
  const { outcome, calls } = await runSegment({
    script: [
      toolCall("c1", "list_accounts", {}),
      toolCall("c2", "record_journal_entry", goodInput()),
      toolCall("c3", "record_journal_entry", goodInput()),
      say("unreachable"),
    ],
    record: () => {
      throw raise("CLR10", "operation_payload_conflict", "that operation identity is already used");
    },
  });
  assert.equal(calls.record.length, 1);
  assert.equal(outcome.terminal.kind, "conflict");
  assert.equal(outcome.terminal.recoverable, false);
});

test("623.unit: a REPLAY returns the ORIGINAL receipt and is reported as one entry", async () => {
  const replayed = Object.assign({}, RECEIPT, { replayed: true });
  const { outcome, calls } = await runSegment({
    script: [toolCall("c1", "list_accounts", {}), toolCall("c2", "record_journal_entry", goodInput()), say("already recorded")],
    record: () => replayed,
  });
  assert.equal(calls.record.length, 1);
  assert.equal(outcome.posted.replayed, true, "the run knows this was a replay");
  assert.equal(outcome.posted.entry_id, RECEIPT.entry_id, "and it is the ORIGINAL entry");
  const card = outcome.parts.find((p) => p.type === "work_result");
  assert.equal(card.entry_id, RECEIPT.entry_id, "one entry, one card — a replay does not mint a second effect");
});

test("623.unit: state_changed is CORRECTED once inside budget, then posts", async () => {
  let attempt = 0;
  const { outcome, calls, model } = await runSegment({
    script: [
      toolCall("c1", "list_accounts", {}),
      toolCall("c2", "record_journal_entry", goodInput()),
      (options, index) => {
        // The prototype's own probe, kept: the model must actually SEE the typed reason before
        // it corrects. A correction the model could not have read is not a correction.
        const prompt = JSON.stringify(options?.prompt ?? "");
        assert.match(prompt, /task_transition/, `the ${index}th turn is shown the typed reason`);
        return toolCall("c3", "record_journal_entry", goodInput());
      },
      say("this narration must never be produced"),
    ],
    record: () => {
      attempt += 1;
      if (attempt === 1) throw raise("CLR13", "task_transition", "the task moved under this run");
      return RECEIPT;
    },
  });

  assert.equal(calls.record.length, 2, "exactly ONE corrected retry");
  assert.equal(model.calls, 3, "the corrected post is terminal too — no fourth turn");
  assert.equal(outcome.budget.replans, 1, "the correction is recorded against the replan budget");
  assert.equal(outcome.posted.entry_id, RECEIPT.entry_id);
  assert.equal(outcome.terminal, null);
});

test("623.unit: exhausting the replan budget settles a RECOVERABLE budget failure, never a loop", async () => {
  const budgets = bundle.CLARA_WORK_BUDGETS_V1;
  const script = [toolCall("c0", "list_accounts", {})];
  // One initial attempt plus one per allowed replan, then one more the budget must refuse.
  for (let i = 0; i <= budgets.replans + 1; i += 1) script.push(toolCall(`c${i + 1}`, "record_journal_entry", goodInput()));
  script.push(say("unreachable"));

  const { outcome, calls } = await runSegment({
    script,
    record: () => {
      throw raise("CLR10", "basis_mismatch", "the echoed basis does not match the admitted basis");
    },
  });

  assert.equal(outcome.exhausted, "replans");
  assert.equal(outcome.posted, null);
  assert.ok(calls.record.length <= budgets.replans + 1, "the DB was never called an unbounded number of times");
  // The consequence the workflow applies to this state, asserted through the same helpers it uses.
  const errors = await import("../workflows/claraWork.v1.errors.ts");
  assert.equal(errors.taskErrorCodeFor("budget_exhausted"), "limit");
  assert.equal(errors.workOutcomeFor("budget_exhausted"), "failed");
  assert.equal(errors.budgetExhaustedPayload("replans").recoverable, true);
});

test("623.unit: a failed REQUIRED read is an explicit failure, never an empty pack", async () => {
  const { api, calls } = fakeWorkPools({ accounts: [], record: () => RECEIPT });
  // The read pool itself refuses — the shape a revoked grant or a dead socket produces.
  api.withReadWakeScoped = async () => {
    throw Object.assign(new Error("permission denied for function trial_balance"), { code: "42501" });
  };
  const { model, state } = scriptedWorkModel([toolCall("c1", "list_accounts", {}), say("unreachable")]);
  const restore = installWorkTestDoubles({ pools: api, model });
  let outcome;
  try {
    outcome = await impl.runWorkSegmentStep("task-1", WORK, RUN_ID, [{ role: "user", content: "go" }]);
  } finally {
    restore();
  }

  assert.equal(outcome.requiredReadFailed, true, "the failure is explicit");
  assert.equal(outcome.posted, null, "and nothing was posted on the strength of an unread chart");
  assert.equal(calls.record.length, 0, "the write was never attempted");
  assert.equal(state.calls, 1, "the segment stopped on the terminal read failure");
  assert.equal(outcome.terminal.kind, "invariant");
  const refusal = outcome.parts.find((p) => p.type === "refusal");
  assert.match(refusal.message, /chart of accounts could not be read/);
  assert.match(refusal.message, /nothing was recorded/i);
});

test("623.unit: ask_question stops the segment and surfaces the pending question", async () => {
  const { outcome, calls, model } = await runSegment({
    script: [
      toolCall("c1", "list_accounts", {}),
      toolCall("c2", "ask_question", { question: "Which bank account was this paid from?", context: "two accounts match" }),
      say("unreachable"),
    ],
    record: () => RECEIPT,
  });
  assert.equal(model.calls, 2, "the loop stops on the ask_question CALL — the tool has no execute");
  assert.equal(calls.record.length, 0, "nothing is posted while a question is open");
  assert.deepEqual(outcome.question, {
    toolCallId: "c2",
    question: "Which bank account was this paid from?",
    context: "two accounts match",
  });
  assert.equal(outcome.posted, null);
  assert.equal(outcome.terminal, null, "a question is not an error");
});

test("623.unit: the segment's stop condition is what makes a terminal tool result terminal", () => {
  const posted = { steps: [{ toolResults: [{ toolName: "record_journal_entry", output: { ok: true } }] }] };
  const refused = { steps: [{ toolResults: [{ toolName: "record_journal_entry", output: { ok: false, terminal: true } }] }] };
  const retryable = { steps: [{ toolResults: [{ toolName: "record_journal_entry", output: { ok: false, terminal: false } }] }] };
  const readFailed = { steps: [{ toolResults: [{ toolName: "list_accounts", output: { ok: false, terminal: true } }] }] };
  const readOk = { steps: [{ toolResults: [{ toolName: "list_accounts", output: { ok: true, accounts: [] } }] }] };

  assert.equal(impl.stoppedOnTerminalWorkTool(posted), true);
  assert.equal(impl.stoppedOnTerminalWorkTool(refused), true);
  assert.equal(impl.stoppedOnTerminalWorkTool(retryable), false, "a correction inside budget must NOT stop the loop");
  assert.equal(impl.stoppedOnTerminalWorkTool(readFailed), true);
  assert.equal(impl.stoppedOnTerminalWorkTool(readOk), false, "a successful read is the START of the work, not the end");
  assert.equal(impl.stoppedOnTerminalWorkTool({ steps: [] }), false);
});

test("623.unit: the run envelope hands the model the admitted basis and says there is no document", () => {
  const envelope = impl.workEnvelopeMessage(WORK);
  assert.match(envelope, /NO source document/);
  assert.match(envelope, new RegExp(WORK.logicalOpId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(envelope.includes(JSON.stringify(WORK.basis)), "the exact admitted basis, not a paraphrase");
  const interpreted = impl.workEnvelopeMessage(loadedWork({ basisOrigin: "clara_interpreted" }));
  assert.match(interpreted, /interpreted by you/);
  assert.match(envelope, /entered directly by the human/);
});

test("623.unit: the completed result records the effect AND the budget spend", () => {
  const result = impl.completedResult(
    { entry_id: "e", receipt_id: "r", revision_token: "t", logical_op_id: WORK.logicalOpId, replayed: false },
    true,
    { toolCalls: 2, replans: 0, transientRetries: 0 },
    1,
    42,
  );
  assert.equal(result.entry_id, "e");
  assert.equal(result.receipt_id, "r");
  assert.equal(result.confirmed, true);
  assert.equal(result.bundle_digest, bundle.CLARA_WORK_BUNDLE_V1_DIGEST);
  assert.deepEqual(result.budget, { segments: 1, toolCalls: 2, replans: 0, transientRetries: 0, tokens: 42 });
});
