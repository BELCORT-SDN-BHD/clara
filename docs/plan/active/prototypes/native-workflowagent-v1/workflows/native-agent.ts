import { WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount } from "ai";
import { getWritable } from "workflow";
import { z } from "zod";
import { scriptedModel } from "../mock-model.js";

async function createSyntheticReceipt(input: { operationKey: string }) {
  "use step";
  return { receiptId: `receipt:${input.operationKey}`, operationKey: input.operationKey };
}

export async function nativeWorkflowAgentWork(input: { workId: string }) {
  "use workflow";

  const operationKey = `${input.workId}:native-v1`;
  const agent = new WorkflowAgent({
    model: scriptedModel([
      { type: "tool-call", toolName: "createSyntheticReceipt", input: JSON.stringify({ operationKey }) },
      { type: "text", text: "Completed from the synthetic receipt." },
    ]),
    instructions: "Only claim completion after a receipt.",
    tools: {
      createSyntheticReceipt: {
        description: "Create one synthetic receipt.",
        inputSchema: z.object({ operationKey: z.string() }),
        execute: createSyntheticReceipt,
      },
    },
    stopWhen: isStepCount(4),
  });

  const result = await agent.stream({
    prompt: `Complete ${input.workId}`,
    writable: getWritable(),
    runtimeContext: { workId: input.workId, harnessVersion: "workflow-agent-1.0.70" },
  });

  return {
    text: result.steps.at(-1)?.text ?? "",
    stepCount: result.steps.length,
    stepEvidence: result.steps.map(step => ({
      text: step.text,
      content: step.content,
      toolCalls: step.toolCalls,
      toolResults: step.toolResults,
    })),
    finalMessages: result.messages,
    finishReason: result.finishReason,
  };
}

export async function unsafeFinishWork(input: { workId: string }) {
  "use workflow";
  const agent = new WorkflowAgent({
    model: scriptedModel([
      {
        type: "tool-call",
        toolName: "mustNotExecute",
        input: JSON.stringify({ operationKey: `${input.workId}:unsafe` }),
        finishReason: "content-filter",
      },
    ]),
    tools: {
      mustNotExecute: {
        description: "This tool must not execute after an unsafe finish.",
        inputSchema: z.object({ operationKey: z.string() }),
        execute: createSyntheticReceipt,
      },
    },
    maxRetries: 0,
    stopWhen: isStepCount(2),
  });
  const result = await agent.stream({ prompt: `Unsafe finish ${input.workId}` });
  return {
    finishReason: result.finishReason,
    messages: result.messages,
    toolResults: result.toolResults,
    steps: result.steps.map(step => ({ finishReason: step.finishReason, content: step.content })),
  };
}
