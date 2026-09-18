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

import { foldLiveToolParts } from "./liveTools";
import type { ClaraPart } from "@/lib/parts/types";

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
  assert.equal(foldLiveToolParts(chunks.slice(0, 3))[0].state, "preparing");
  assert.equal(foldLiveToolParts(chunks)[0].state, "running");
  assert.equal(foldLiveToolParts([...chunks, result("v20a", "start_accrual_work")])[0].state, "done");
  assert.equal(foldLiveToolParts([...chunks, error("v20a", "start_accrual_work")])[0].state, "failed");
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
  assert.equal(refused[0].state, "refused");
  const done = foldLiveToolParts([
    call("v20c", "start_staff_expense_claim_work"),
    result("v20c", "start_staff_expense_claim_work", { ok: true, work_accepted: null }),
  ]);
  assert.equal(done[0].state, "done");
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
  assert.equal(steps[0].state, "done");
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
