// #642 AC4 — the live tool fold, at its own seam.
//
// EVERY CHUNK IN THIS FILE IS THE MEASURED SHAPE, not a shape read out of the AI SDK's
// documentation. It was captured on this rig (#642 M1) by driving the REAL
// `streamText` from `ai@7.0.77` with the `MockLanguageModelV4` script the World legs use,
// through the REAL `consumeChatTurnModelResult` — the same function
// `packages/runtime/src/streamRoute.ts:139` forwards verbatim as `event: chunk`:
//
//   start · start-step · text-start · text-delta{id,text} · text-end · finish-step · finish
//   tool-input-start {id, toolName, dynamic, title}
//   tool-input-delta {id, delta}
//   tool-input-end   {id}
//   tool-call        {toolCallId, toolName, input, providerExecuted, providerMetadata, title}
//   tool-result      {toolCallId, toolName, input, output, dynamic}
//   tool-error       {toolCallId, toolName, input, error, dynamic}
//
// THE FIELD NAME IS THE WHOLE POINT OF MEASURING: `tool-input-start` carries `id`, while
// `tool-call`/`tool-result`/`tool-error` carry `toolCallId`. A fold written from the docs
// would silently render nothing for *preparing*.
//
// RED BEFORE: `lib/clara/liveTools.ts` did not exist. The only live fold in the tree was
// `foldLiveClarifyParts`, and `lib/parts/toolStatus.ts`'s own header records the
// consequence in so many words — "THERE IS DELIBERATELY NO 'RUNNING' ARM… a `tool_call`
// part only ever reaches a screen from the SETTLED transcript".

import assert from "node:assert/strict";
import { test } from "node:test";

import { foldLiveToolParts, type LiveToolStep } from "./liveTools";
import type { ClaraPart } from "@/lib/parts/types";

/** `noUncheckedIndexedAccess` is on, and that is a good thing here: a cell that read
 *  `steps[0].state` off an EMPTY fold would crash rather than fail, and the message would
 *  be about a property of undefined instead of about the behaviour. */
function one(steps: readonly LiveToolStep[], at = 0): LiveToolStep {
  const step = steps[at];
  assert.ok(step, `expected a step at index ${at}; the fold produced ${steps.length}`);
  return step;
}

const inputStart = (id: string, toolName: string) => ({ type: "tool-input-start", id, toolName, dynamic: false, title: undefined });
const inputDelta = (id: string, delta: string) => ({ type: "tool-input-delta", id, delta });
const inputEnd = (id: string) => ({ type: "tool-input-end", id });
const call = (toolCallId: string, toolName: string) => ({ type: "tool-call", toolCallId, toolName, input: "{}", providerExecuted: false });
const result = (toolCallId: string, toolName: string, output: unknown = { ok: true }) => ({ type: "tool-result", toolCallId, toolName, input: "{}", output, dynamic: false });
const error = (toolCallId: string, toolName: string) => ({ type: "tool-error", toolCallId, toolName, input: "{}", error: "boom", dynamic: false });
const textDelta = (text: string) => ({ type: "text-delta", id: "t1", text });

test("p642.web.live_tool_states — tool-input-start renders PREPARING, keyed on `id` and not on `toolCallId`", () => {
  const steps = foldLiveToolParts([{ type: "start" }, { type: "start-step" }, inputStart("v20a", "start_accrual_work")]);
  assert.deepEqual(steps, [{ toolCallId: "v20a", tool: "start_accrual_work", state: "preparing" }]);
});

test("p642.web.live_tool_states — the four states, in the order one real turn produces them", () => {
  const chunks = [
    { type: "start" },
    { type: "start-step", request: {}, warnings: [] },
    inputStart("v20a", "start_accrual_work"),
    inputDelta("v20a", "{\"a\":"),
    inputEnd("v20a"),
    call("v20a", "start_accrual_work"),
  ];
  assert.equal(one(foldLiveToolParts(chunks.slice(0, 3))).state, "preparing");
  assert.equal(one(foldLiveToolParts(chunks)).state, "running");
  assert.equal(one(foldLiveToolParts([...chunks, result("v20a", "start_accrual_work")])).state, "done");
  assert.equal(one(foldLiveToolParts([...chunks, error("v20a", "start_accrual_work")])).state, "failed");
});

test("p642.web.live_tool_states — a tool that REFUSES is not a tool that FAILED", () => {
  // Every chat tool's refusal helper returns `{ok:false, code, message}` as the tool's
  // OUTPUT — the tool ran, declined the request in its own typed vocabulary and wrote
  // nothing. `failed` is the tool THROWING. Collapsing the two would tell a reader the
  // system broke when in fact it refused them.
  const refused = foldLiveToolParts([
    call("v20c", "start_staff_expense_claim_work"),
    result("v20c", "start_staff_expense_claim_work", { ok: false, code: "CLR04", message: "not permitted" }),
  ]);
  assert.equal(one(refused).state, "refused");
  const done = foldLiveToolParts([
    call("v20c", "start_staff_expense_claim_work"),
    result("v20c", "start_staff_expense_claim_work", { ok: true, work_accepted: null }),
  ]);
  assert.equal(one(done).state, "done");
});

test("p642.web.live_tool_states — a settled `refusal` part resolves what the stream left mid-flight, and overwrites nothing it closed", () => {
  const settled: ClaraPart[] = [{ type: "refusal", code: "CLR14", message: "concurrent run limit reached" }];
  const steps = foldLiveToolParts(
    [call("a", "trial_balance"), inputStart("b", "get_bank_pack"), call("c", "read_document"), result("c", "read_document")],
    settled,
  );
  const byId = Object.fromEntries(steps.map((s) => [s.toolCallId, s.state]));
  assert.equal(byId.a, "refused", "a step the stream never closed is reported as refused");
  assert.equal(byId.b, "refused", "…including one that only ever reached `preparing`");
  assert.equal(byId.c, "done", "a step the stream DID close keeps the outcome somebody actually saw");
});

test("p642.web.live_tool_states — a MALFORMED or unrecognised chunk renders NOTHING", () => {
  // `liveClarify.ts:63-65`'s rule, and H-32's: absence is never rendered as a guessed
  // state. A chip with no tool name is a shimmer, and AC4 rules a shimmer out as evidence.
  const junk: unknown[] = [
    null,
    "a string",
    42,
    {},
    { type: "tool-call" },                                   // no id, no name
    { type: "tool-call", toolCallId: "x" },                  // no name
    { type: "tool-call", toolName: "trial_balance" },        // no id
    { type: "tool-input-start", toolCallId: "y", toolName: "trial_balance" }, // the WRONG field
    { type: "some-future-part", toolCallId: "z", toolName: "trial_balance" },
    textDelta("hello "),
    { type: "finish-step" },
    { type: "finish" },
  ];
  assert.deepEqual(foldLiveToolParts(junk), []);
});

test("p642.web.live_tool_states — a reattach replays from index 0 and must not double or REGRESS a step", () => {
  // `streamRoute.ts:113` re-opens the readable at index 0, so a finished call's whole
  // history arrives again. Without the monotonic rank a completed step would flicker back
  // to `preparing` on every reconnect.
  const attempt = [inputStart("v1", "trial_balance"), call("v1", "trial_balance"), result("v1", "trial_balance")];
  const steps = foldLiveToolParts([...attempt, ...attempt]);
  assert.equal(steps.length, 1, "one call, one chip");
  assert.equal(one(steps).state, "done");
});

test("p642.web.live_tool_states — `clarify` is excluded: it has its own answerable card", () => {
  // `foldLiveClarifyParts` renders the question with a control on it. A second
  // "clarify · running" chip beside it would be one event on screen twice, and the chip
  // would still be there after the question was answered.
  const steps = foldLiveToolParts([
    inputStart("c1", "clarify"),
    call("c1", "clarify"),
    call("v1", "trial_balance"),
  ]);
  assert.deepEqual(steps.map((s) => s.tool), ["trial_balance"]);
});

test("p642.web.live_tool_states — several steps keep FIRST-SEEN order", () => {
  const steps = foldLiveToolParts([
    call("a", "trial_balance"),
    call("b", "get_bank_pack"),
    result("a", "trial_balance"),
    call("c", "read_document"),
  ]);
  assert.deepEqual(steps.map((s) => [s.tool, s.state]), [
    ["trial_balance", "done"],
    ["get_bank_pack", "running"],
    ["read_document", "running"],
  ]);
});

test("p642.web.live_tool_states — a `tool-error` AFTER a `tool-result` reads *failed*, not *done*", () => {
  // Fix round 1, review finding ADV-642-8. `done`, `failed` and `refused` all ranked 2 and
  // the comparison is strict, so the FIRST of the three to arrive for a call id won
  // forever: a step that returned and then threw kept reading *done*, which is the one
  // direction this fold must never get wrong — AC4's whole subject is that the transcript
  // may not overstate what a step achieved.
  //
  // The monotonic rank itself is kept, and it is load-bearing: the reattach replays from
  // index 0 (`streamRoute.ts:113`), so without it a finished step would flicker back to
  // *preparing* on every reconnect. Only `failed` is lifted above the other two terminals,
  // because a thrown tool is the stronger statement about the same call.
  const steps = foldLiveToolParts([
    { type: "tool-call", toolCallId: "c1", toolName: "draft_journal_entry", input: {} },
    { type: "tool-result", toolCallId: "c1", toolName: "draft_journal_entry", output: { ok: true } },
    { type: "tool-error", toolCallId: "c1", toolName: "draft_journal_entry", error: "boom" },
  ]);
  assert.equal(steps.length, 1, "one call id is one chip");
  assert.equal(steps.at(0)?.state, "failed");

  // THE CONTROL, and the property the rank exists for: a replay from index 0 re-delivers
  // the whole history, and the step must not walk backwards through it.
  const replayed = foldLiveToolParts([
    { type: "tool-input-start", id: "c2", toolName: "get_bank_pack" },
    { type: "tool-call", toolCallId: "c2", toolName: "get_bank_pack", input: {} },
    { type: "tool-error", toolCallId: "c2", toolName: "get_bank_pack", error: "boom" },
    { type: "tool-input-start", id: "c2", toolName: "get_bank_pack" },
    { type: "tool-call", toolCallId: "c2", toolName: "get_bank_pack", input: {} },
  ]);
  assert.equal(replayed.at(0)?.state, "failed", "a replay must not walk a finished step backwards");
});
