import { expect, it } from "vitest";
import { start } from "workflow/api";
import { nativeWorkflowAgentWork, unsafeFinishWork } from "./native-agent.js";

it("runs WorkflowAgent 1.0.70 as a compiled Workflow 4 agent loop", async () => {
  const run = await start(nativeWorkflowAgentWork, [{ workId: "work-native-1" }]);
  const result = await run.returnValue;

  expect(await run.status).toBe("completed");
  expect(result.stepCount).toBe(2);
  expect(result.text).toBe("Completed from the synthetic receipt.");
  expect(JSON.stringify(result.stepEvidence)).toContain("createSyntheticReceipt");
  expect(JSON.stringify(result.finalMessages)).toContain("receipt:work-native-1:native-v1");
});

it("does not execute a tool when WorkflowAgent receives an unsafe finish reason", async () => {
  const run = await start(unsafeFinishWork, [{ workId: "work-unsafe-1" }]);
  const result = await run.returnValue;

  expect(await run.status).toBe("completed");
  expect(result.finishReason).toBe("content-filter");
  expect(result.toolResults).toEqual([]);
  expect(JSON.stringify(result.messages)).not.toContain("receipt:work-unsafe-1:unsafe");
});
