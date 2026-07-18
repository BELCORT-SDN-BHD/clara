// Scripted mock language model for the chat-turn tests — MockLanguageModelV4 +
// simulateReadableStream from 'ai/test' (the exact shape the S4-P3 probe proved).
// NO network, NO key ever. The model is injected into the frozen workflow via
// globalThis.__claraModelForTest, so the workflow's real streamText call runs
// against this deterministic script.

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

function usage() {
  return {
    inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 7, reasoning: undefined, audio: undefined },
    raw: undefined,
  };
}

function textChunks(text) {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    ...text.split(" ").map((w) => ({ type: "text-delta", id: "t1", delta: `${w} ` })),
    { type: "text-end", id: "t1" },
    { type: "finish", usage: usage(), finishReason: { unified: "stop", raw: "stop" } },
  ];
}

function clarifyChunks(question) {
  const input = JSON.stringify({ question });
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-input-start", id: "c1", toolName: "clarify" },
    { type: "tool-input-delta", id: "c1", delta: input },
    { type: "tool-input-end", id: "c1" },
    { type: "tool-call", toolCallId: "c1", toolName: "clarify", input },
    { type: "finish", usage: usage(), finishReason: { unified: "tool-calls", raw: "tool_use" } },
  ];
}

/** A model that always answers with the given text. */
export function mockTextModel(text = "here is your answer") {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks: textChunks(text), chunkDelayInMs: 5 }) }),
  });
}

/** A model that calls `clarify` until the clarify has been ANSWERED, then replies
 *  with text. Driven by the INPUT (whether a clarify tool-result is already in the
 *  prompt), NOT a call counter — so it is deterministic across WDK step retries and
 *  workflow replays (a counter would misalign when a step re-invokes the model). */
export function mockClarifyThenTextModel(question = "Which client is this for?", answer = "thanks, done") {
  return new MockLanguageModelV4({
    doStream: async (options) => {
      const prompt = JSON.stringify(options?.prompt ?? options?.messages ?? "");
      const clarifyAnswered = /tool-result/.test(prompt) && /clarify/.test(prompt);
      const chunks = clarifyAnswered ? textChunks(answer) : clarifyChunks(question);
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 5 }) };
    },
  });
}

/** A model whose stream throws (to exercise the workflow's failure/settle path). */
export function mockThrowingModel() {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw new Error("mock model failure");
    },
  });
}
