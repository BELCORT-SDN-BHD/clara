// The live clarify fold. Every cell here is about what the fold REFUSES to invent:
// the shapes it must ignore are the point, because anything it wrongly promotes to a
// clarify card becomes a card offering to answer a question Clara never asked.

import assert from "node:assert/strict";
import { test } from "node:test";

import { foldLiveClarifyParts } from "./liveClarify";

const clarifyChunk = (toolCallId: string, input: unknown) => ({
  type: "tool-call",
  toolCallId,
  toolName: "clarify",
  input,
});

test("folds a clarify tool-call chunk into a clarify part, carrying question and context verbatim", () => {
  const parts = foldLiveClarifyParts([
    { type: "text-delta", id: "t1", delta: "Looking at this…" },
    clarifyChunk("call-1", { question: "Which client owns this invoice?", context: "The supplier name is shared." }),
  ]);
  assert.deepEqual(parts, [{
    type: "clarify",
    tool_call_id: "call-1",
    question: "Which client owns this invoice?",
    context: "The supplier name is shared.",
    framing: "",
  }]);
});

test("a context-less clarify folds with a null context, never an invented sentence", () => {
  const parts = foldLiveClarifyParts([clarifyChunk("call-1", { question: "Which period?" })]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]!.context, null);
  // The framing is deliberately blank: the runtime's own CLARIFY_FRAMING belongs to a
  // PERSISTED part, and apps/web renders its own translated sentence instead of
  // hard-coding a second copy of the runtime's English here.
  assert.equal(parts[0]!.framing, "");
});

test("every non-clarify chunk shape is ignored — the fold is not a live transcript", () => {
  const parts = foldLiveClarifyParts([
    { type: "text-delta", id: "t1", delta: "hello" },
    { type: "tool-call", toolCallId: "call-2", toolName: "draft_journal_entry", input: { question: "not a clarify" } },
    { type: "tool-result", toolCallId: "call-2", toolName: "draft_journal_entry", output: {} },
    { type: "tool-error", toolCallId: "call-2", toolName: "draft_journal_entry", error: "boom" },
    { type: "error", error: { message: "stream error" } },
    { type: "finish" },
  ]);
  assert.deepEqual(parts, []);
});

test("malformed, empty-question and non-object chunks yield NO card (absence is not evidence)", () => {
  const parts = foldLiveClarifyParts([
    null,
    undefined,
    "tool-call",
    42,
    clarifyChunk("call-1", { question: "   " }),
    clarifyChunk("call-2", { question: 7 }),
    clarifyChunk("call-3", null),
    { type: "tool-call", toolName: "clarify", input: { question: "no tool call id" } },
  ]);
  assert.deepEqual(parts, [], "a clarify card must never appear for a question this fold did not actually see");
});

test("a replayed chunk buffer (reattach streams the readable from index 0) folds to one card, not two", () => {
  const chunk = clarifyChunk("call-1", { question: "Which client owns this invoice?" });
  const parts = foldLiveClarifyParts([chunk, chunk, { ...chunk }]);
  assert.equal(parts.length, 1);
});

test("two clarify rounds in one run keep arrival order — the LAST is the one still parked", () => {
  const parts = foldLiveClarifyParts([
    clarifyChunk("call-1", { question: "First question?" }),
    { type: "tool-result", toolCallId: "call-1", toolName: "clarify", output: { type: "json", value: { text: "answered" } } },
    clarifyChunk("call-2", { question: "Second question?" }),
  ]);
  assert.deepEqual(parts.map((p) => p.question), ["First question?", "Second question?"]);
});

test("the AI SDK's older `args` spelling is read too, so a chunk-shape drift degrades to a card, never to silence", () => {
  const parts = foldLiveClarifyParts([
    { type: "tool-call", toolCallId: "call-1", toolName: "clarify", args: { question: "Which period?" } },
  ]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]!.question, "Which period?");
});
