// THROWAWAY COMPATIBILITY PROOF. This is synthetic and has no production credentials or data.
import assert from "node:assert/strict";
import { ToolLoopAgent, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

const current = {
  authorityRevision: 7,
  knowledgeRevision: 12,
};
const receipts = new Map();
let syntheticRevisionComparisons = 0;
let businessSideEffects = 0;

const postSyntheticAdjustment = tool({
  description: "Post a synthetic adjustment after checking current authority and knowledge revisions.",
  inputSchema: z.object({
    operationKey: z.string(),
    expectedAuthorityRevision: z.number().int(),
    expectedKnowledgeRevision: z.number().int(),
    amountMinor: z.number().int().positive(),
  }),
  execute: async (input) => {
    syntheticRevisionComparisons += 1;

    if (
      input.expectedAuthorityRevision !== current.authorityRevision ||
      input.expectedKnowledgeRevision !== current.knowledgeRevision
    ) {
      throw new Error(
        `STATE_CHANGED currentAuthorityRevision=${current.authorityRevision} ` +
          `currentKnowledgeRevision=${current.knowledgeRevision} action=reload-and-retry`,
      );
    }

    const existing = receipts.get(input.operationKey);
    if (existing) return { ...existing, deduplicated: true };

    businessSideEffects += 1;
    const receipt = {
      receiptId: `receipt:${input.operationKey}`,
      operationKey: input.operationKey,
      amountMinor: input.amountMinor,
      authorityRevision: current.authorityRevision,
      knowledgeRevision: current.knowledgeRevision,
      deduplicated: false,
    };
    receipts.set(input.operationKey, receipt);
    return receipt;
  },
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const generated = (content, unified) => ({
  content,
  finishReason: { unified, raw: undefined },
  usage,
  warnings: [],
});

const calls = [];
const scriptedModel = new MockLanguageModelV4({
  doGenerate: async (options) => {
    const callIndex = calls.length;
    calls.push(options);
    switch (callIndex) {
      case 0:
      return generated(
        [
          {
            type: "tool-call",
            toolCallId: "stale-call",
            toolName: "postSyntheticAdjustment",
            input: JSON.stringify({
              operationKey: "work-42:adjustment-1",
              expectedAuthorityRevision: 6,
              expectedKnowledgeRevision: 11,
              amountMinor: 12500,
            }),
          },
        ],
        "tool-calls",
      );
      case 1: {
      const promptJson = JSON.stringify(options.prompt);
      assert.match(promptJson, /STATE_CHANGED/);
      assert.match(promptJson, /reload-and-retry/);
      return generated(
        [
          {
            type: "tool-call",
            toolCallId: "corrected-call",
            toolName: "postSyntheticAdjustment",
            input: JSON.stringify({
              operationKey: "work-42:adjustment-1",
              expectedAuthorityRevision: 7,
              expectedKnowledgeRevision: 12,
              amountMinor: 12500,
            }),
          },
        ],
        "tool-calls",
      );
      }
      case 2:
      return generated(
        [
          {
            type: "tool-call",
            toolCallId: "duplicate-delivery",
            toolName: "postSyntheticAdjustment",
            input: JSON.stringify({
              operationKey: "work-42:adjustment-1",
              expectedAuthorityRevision: 7,
              expectedKnowledgeRevision: 12,
              amountMinor: 12500,
            }),
          },
        ],
        "tool-calls",
      );
      case 3:
      return generated(
        [{ type: "text", text: "Completed from the server receipt." }],
        "stop",
      );
      default:
        throw new Error(`unexpected model call ${callIndex + 1}`);
    }
  },
});

const agent = new ToolLoopAgent({
  model: scriptedModel,
  instructions:
    "clara-agent/v1; skill=accounting-work/v3; registry=business-tools/v2. " +
    "Only report completion from a business receipt. On STATE_CHANGED, reload the versions and retry once.",
  tools: { postSyntheticAdjustment },
  stopWhen: isStepCount(6),
});

const result = await agent.generate({
  prompt:
    "Synthetic client=client-1 work=work-42. Post MYR 125.00 using authority revision 6 and knowledge revision 11.",
  runtimeContext: {
    clientId: "client-1",
    workId: "work-42",
    instructionVersion: "clara-agent/v1",
    skillVersion: "accounting-work/v3",
    toolRegistryVersion: "business-tools/v2",
  },
});

const toolErrors = result.steps.flatMap((step) =>
  step.content.filter((part) => part.type === "tool-error"),
);
const toolResults = result.steps.flatMap((step) =>
  step.content.filter((part) => part.type === "tool-result").map((part) => part.output),
);

assert.equal(calls.length, 4, "the bounded loop must stop after correction, duplicate delivery, and final text");
assert.equal(toolErrors.length, 1, "the stale state failure must be model-visible");
assert.equal(syntheticRevisionComparisons, 3, "every attempted execution compares the supplied synthetic revisions");
assert.equal(businessSideEffects, 1, "duplicate delivery must not duplicate the business side effect");
assert.equal(receipts.size, 1, "one operation key produces one authoritative receipt");
assert.equal(toolResults.length, 2, "corrected and duplicate calls both return the same receipt");
assert.equal(toolResults[0].receiptId, toolResults[1].receiptId);
assert.equal(toolResults[0].deduplicated, false);
assert.equal(toolResults[1].deduplicated, true);
assert.equal(result.text, "Completed from the server receipt.");

console.log(
  JSON.stringify(
    {
      status: "PASS",
      node: process.version,
      ai: "7.0.77",
      modelCalls: calls.length,
      toolErrors: toolErrors.length,
      syntheticRevisionComparisons,
      businessSideEffects,
      receiptId: toolResults[0].receiptId,
      duplicateReceiptDeduplicated: toolResults[1].deduplicated,
      finalText: result.text,
    },
    null,
    2,
  ),
);
