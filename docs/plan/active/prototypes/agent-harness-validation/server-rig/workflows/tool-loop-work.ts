// THROWAWAY COMPATIBILITY PROOF. This body uses only the rig's synthetic schema.
import assert from "node:assert/strict";
import { ToolLoopAgent, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import pg from "pg";
import { createHook, getWritable } from "workflow";
import { z } from "zod";

const { Pool } = pg;

type WorkInput = { workId: string };
type Answer = { kind: "answer" | "cancel"; answerId: string; text?: string };

export async function toolLoopWorkV3(input: WorkInput) {
  "use workflow";

  await emitV3({ type: "accepted", bodyVersion: "v3-tool-loop", workId: input.workId });
  using hook = createHook<Answer>({ token: `answer:${input.workId}` });
  const answer = await hook;
  if (answer.kind === "cancel") {
    await emitV3({ type: "cancelled", bodyVersion: "v3-tool-loop", workId: input.workId });
    await closeOutputV3();
    return { status: "cancelled", bodyVersion: "v3-tool-loop", workId: input.workId };
  }

  const result = await runToolLoopStepV3(input.workId, answer.answerId, answer.text ?? "");
  await emitV3({ type: result.status, bodyVersion: "v3-tool-loop", workId: input.workId, ...result });
  await closeOutputV3();
  return { bodyVersion: "v3-tool-loop", workId: input.workId, ...result };
}

async function runToolLoopStepV3(workId: string, answerId: string, answerText: string) {
  "use step";

  const pool = new Pool({ connectionString: requiredEnv("RIG_DATABASE_URL") });
  let modelCalls = 0;
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  };
  const generated = (content: unknown[], unified: "tool-calls" | "stop") => ({
    content,
    finishReason: { unified, raw: undefined },
    usage,
    warnings: [],
  });

  const postSyntheticReceipt = tool({
    description: "Record one synthetic business effect after rechecking the rig's current authority and knowledge revisions.",
    inputSchema: z.object({
      operationKey: z.string(),
      expectedAuthorityRevision: z.number().int(),
      expectedKnowledgeRevision: z.number().int(),
    }),
    execute: async (toolInput) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const state = await client.query(
          `select t.role, t.active, t.authority_revision, t.knowledge_revision
             from rig.work_snapshot w
             join rig.trusted_state t on t.actor_id = w.actor_id
            where w.work_id = $1
            for update of w, t`,
          [workId],
        );
        if (state.rowCount !== 1) throw new Error(`STATE_CHANGED work=${workId} reason=missing`);
        const current = state.rows[0];
        if (
          current.active !== true ||
          current.role !== "bookkeeper" ||
          current.authority_revision !== toolInput.expectedAuthorityRevision ||
          current.knowledge_revision !== toolInput.expectedKnowledgeRevision
        ) {
          throw new Error(
            `STATE_CHANGED currentAuthorityRevision=${current.authority_revision} ` +
              `currentKnowledgeRevision=${current.knowledge_revision} action=reload-and-retry`,
          );
        }

        const inserted = await client.query(
          `insert into rig.effects(operation_key, work_id, answer_text)
           values ($1, $2, $3)
           on conflict (operation_key) do nothing
           returning receipt_id`,
          [toolInput.operationKey, workId, answerText],
        );
        const persisted = await client.query(
          "select receipt_id from rig.effects where operation_key = $1",
          [toolInput.operationKey],
        );
        assert.equal(persisted.rowCount, 1, "the stable operation key must resolve to one receipt");
        await client.query("commit");
        return {
          receiptId: String(persisted.rows[0].receipt_id),
          operationKey: toolInput.operationKey,
          authorityRevision: current.authority_revision,
          knowledgeRevision: current.knowledge_revision,
          deduplicated: inserted.rowCount === 0,
        };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  });

  const operationKey = `${workId}:${answerId}:synthetic-effect-v1`;
  const scriptedModel = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const callIndex = modelCalls++;
      if (callIndex === 0) {
        return generated(
          [{
            type: "tool-call",
            toolCallId: "stale-call",
            toolName: "postSyntheticReceipt",
            input: JSON.stringify({ operationKey, expectedAuthorityRevision: 0, expectedKnowledgeRevision: 0 }),
          }],
          "tool-calls",
        );
      }
      if (callIndex === 1) {
        const promptJson = JSON.stringify(options.prompt);
        assert.match(promptJson, /STATE_CHANGED/);
        assert.match(promptJson, /reload-and-retry/);
        return generated(
          [{
            type: "tool-call",
            toolCallId: "corrected-call",
            toolName: "postSyntheticReceipt",
            input: JSON.stringify({ operationKey, expectedAuthorityRevision: 1, expectedKnowledgeRevision: 1 }),
          }],
          "tool-calls",
        );
      }
      if (callIndex === 2) {
        return generated(
          [{
            type: "tool-call",
            toolCallId: "duplicate-call",
            toolName: "postSyntheticReceipt",
            input: JSON.stringify({ operationKey, expectedAuthorityRevision: 1, expectedKnowledgeRevision: 1 }),
          }],
          "tool-calls",
        );
      }
      if (callIndex === 3) {
        return generated([{ type: "text", text: "Completed from the persisted synthetic receipt." }], "stop");
      }
      throw new Error(`unexpected model call ${callIndex + 1}`);
    },
  });

  try {
    const agent = new ToolLoopAgent({
      model: scriptedModel,
      instructions:
        "clara-agent/v1; skill=accounting-work/v3; registry=business-tools/v2. " +
        "Only report completion from a receipt. On STATE_CHANGED, reload and retry once.",
      tools: { postSyntheticReceipt },
      stopWhen: isStepCount(6),
    });
    const result = await agent.generate({
      prompt: `Synthetic work=${workId}; answer=${answerText}. Record the one authorized effect.`,
      runtimeContext: {
        workId,
        instructionVersion: "clara-agent/v1",
        skillVersion: "accounting-work/v3",
        toolRegistryVersion: "business-tools/v2",
      },
    });
    const toolErrors = result.steps.flatMap((step) => step.content.filter((part) => part.type === "tool-error"));
    const toolResults = result.steps.flatMap((step) =>
      step.content.filter((part) => part.type === "tool-result").map((part) => part.output),
    ) as Array<{ receiptId: string; operationKey: string; deduplicated: boolean }>;
    assert.equal(modelCalls, 4);
    assert.equal(toolErrors.length, 1);
    assert.equal(toolResults.length, 2);
    assert.equal(toolResults[0].receiptId, toolResults[1].receiptId);
    assert.equal(toolResults[0].operationKey, operationKey);
    assert.equal(toolResults[0].deduplicated, false);
    assert.equal(toolResults[1].deduplicated, true);
    return {
      status: "completed" as const,
      modelCalls,
      toolErrors: toolErrors.length,
      receiptId: toolResults[0].receiptId,
      operationKey,
      duplicateReceiptDeduplicated: toolResults[1].deduplicated,
      finalText: result.text,
    };
  } finally {
    await pool.end();
  }
}

async function emitV3(event: unknown) {
  "use step";
  const writer = getWritable<Uint8Array>().getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
  } finally {
    writer.releaseLock();
  }
}

async function closeOutputV3() {
  "use step";
  const writer = getWritable<Uint8Array>().getWriter();
  await writer.close();
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
