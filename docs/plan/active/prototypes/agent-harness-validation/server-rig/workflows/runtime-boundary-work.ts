// THROWAWAY BOUNDARY PROOF. This body uses only the rig's synthetic schema.
import assert from "node:assert/strict";
import { ToolLoopAgent, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import pg from "pg";
import { createHook, getWritable } from "workflow";
import { z } from "zod";

const { Pool } = pg;

type BoundaryMode = "crash_effect" | "basis_resume";
type WorkInput = { workId: string; mode?: BoundaryMode };
type Answer = { kind: "answer" | "cancel"; answerId: string; text?: string };

export async function runtimeBoundaryWorkV4(input: WorkInput) {
  "use workflow";

  const mode = input.mode ?? "basis_resume";
  await emitV4({ type: "accepted", bodyVersion: "v4-runtime-boundary", mode, workId: input.workId });
  using hook = createHook<Answer>({ token: `answer:${input.workId}` });
  await openSyntheticQuestionV4(input.workId, mode);
  const answer = await hook;
  if (answer.kind === "cancel") {
    await emitV4({ type: "cancelled", bodyVersion: "v4-runtime-boundary", mode, workId: input.workId });
    await closeOutputV4();
    return { status: "cancelled", bodyVersion: "v4-runtime-boundary", mode, workId: input.workId };
  }

  const result = mode === "crash_effect"
    ? await runCrashBoundaryToolLoopV4(input.workId, answer.answerId, answer.text ?? "")
    : await readMinimumWorkBasisV4(input.workId, answer.answerId);
  await emitV4({ type: "completed", bodyVersion: "v4-runtime-boundary", mode, workId: input.workId, ...result });
  await closeOutputV4();
  return { status: "completed", bodyVersion: "v4-runtime-boundary", mode, workId: input.workId, ...result };
}

async function openSyntheticQuestionV4(workId: string, mode: BoundaryMode) {
  "use step";

  const pool = new Pool({ connectionString: requiredEnv("RIG_DATABASE_URL") });
  try {
    await pool.query(
      `insert into rig.interruptions(work_id, hook_token, status, question_kind)
       values ($1, $2, 'pending', $3)
       on conflict (work_id) do nothing`,
      [workId, `answer:${workId}`, mode],
    );
  } finally {
    await pool.end();
  }
}

async function readMinimumWorkBasisV4(workId: string, answerId: string) {
  "use step";

  const pool = new Pool({ connectionString: requiredEnv("RIG_DATABASE_URL") });
  try {
    const basis = await pool.query(
      `select instruction, source_ref, accepted_answer
         from rig.work_basis
        where work_id = $1`,
      [workId],
    );
    assert.equal(basis.rowCount, 1, "minimum work basis must survive ordinary chat deletion");
    assert.ok(basis.rows[0].accepted_answer, "answer admission must persist the accepted answer outside chat text");
    const chat = await pool.query("select count(*)::int as count from rig.chat_messages where work_id = $1", [workId]);
    return {
      answerId,
      minimumBasis: basis.rows[0],
      ordinaryChatRows: chat.rows[0].count,
    };
  } finally {
    await pool.end();
  }
}

async function runCrashBoundaryToolLoopV4(workId: string, answerId: string, answerText: string) {
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
  const operationKey = `${workId}:${answerId}:crash-boundary-effect-v1`;

  const persistCrashBoundaryEffect = tool({
    description: "Persist one synthetic effect after checking the current locked work and authority state.",
    inputSchema: z.object({
      operationKey: z.string(),
      expectedAuthorityRevision: z.number().int(),
      expectedKnowledgeRevision: z.number().int(),
      expectedPeriodRevision: z.number().int(),
    }),
    execute: async (toolInput) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const state = await client.query(
          `select w.cancel_requested, t.role, t.active, t.authority_revision,
                  t.knowledge_revision, t.period_open, t.period_revision
             from rig.work_snapshot w
             join rig.trusted_state t on t.actor_id = w.actor_id
            where w.work_id = $1
            for update of w, t`,
          [workId],
        );
        if (state.rowCount !== 1) throw new Error(`STATE_CHANGED work=${workId} reason=missing`);
        const current = state.rows[0];
        if (
          current.cancel_requested === true ||
          current.active !== true ||
          current.role !== "bookkeeper" ||
          current.period_open !== true ||
          current.authority_revision !== toolInput.expectedAuthorityRevision ||
          current.knowledge_revision !== toolInput.expectedKnowledgeRevision ||
          current.period_revision !== toolInput.expectedPeriodRevision
        ) {
          throw new Error(
            `STATE_CHANGED currentAuthorityRevision=${current.authority_revision} ` +
              `currentKnowledgeRevision=${current.knowledge_revision} currentPeriodRevision=${current.period_revision}`,
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
        assert.equal(persisted.rowCount, 1, "stable operation key must resolve to exactly one receipt");
        const marker = await client.query(
          `insert into rig.fault_markers(operation_key, first_pid, replay_count)
           values ($1, $2, 0)
           on conflict (operation_key) do update
             set replay_count = rig.fault_markers.replay_count + 1
           returning first_pid, replay_count`,
          [toolInput.operationKey, process.pid],
        );
        await client.query("commit");

        const firstPid = Number(marker.rows[0].first_pid);
        const replayCount = Number(marker.rows[0].replay_count);
        if (firstPid === process.pid && replayCount === 0) {
          // The runner observes the committed marker and kills this serving process here,
          // before the tool result can return and before Workflow can checkpoint the step.
          await new Promise<void>(() => {});
        }
        return {
          receiptId: String(persisted.rows[0].receipt_id),
          operationKey: toolInput.operationKey,
          deduplicated: inserted.rowCount === 0,
          firstCommitPid: firstPid,
          replayPid: process.pid,
          replayCount,
        };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  });

  const scriptedModel = new MockLanguageModelV4({
    doGenerate: async () => {
      const callIndex = modelCalls++;
      if (callIndex === 0) {
        return generated(
          [{
            type: "tool-call",
            toolCallId: "persist-effect",
            toolName: "persistCrashBoundaryEffect",
            input: JSON.stringify({
              operationKey,
              expectedAuthorityRevision: 1,
              expectedKnowledgeRevision: 1,
              expectedPeriodRevision: 1,
            }),
          }],
          "tool-calls",
        );
      }
      if (callIndex === 1) {
        return generated([{ type: "text", text: "Completed from the stable persisted receipt." }], "stop");
      }
      throw new Error(`unexpected model call ${callIndex + 1}`);
    },
  });

  try {
    const agent = new ToolLoopAgent({
      model: scriptedModel,
      instructions: "Synthetic crash-boundary proof. Report completion only from the stable operation receipt.",
      tools: { persistCrashBoundaryEffect },
      stopWhen: isStepCount(4),
    });
    const result = await agent.generate({
      prompt: `Synthetic work=${workId}; answer=${answerText}. Persist the authorized effect.`,
      runtimeContext: { workId, bodyVersion: "v4-runtime-boundary" },
    });
    const toolResults = result.steps.flatMap((step) =>
      step.content.filter((part) => part.type === "tool-result").map((part) => part.output),
    ) as Array<{
      receiptId: string;
      operationKey: string;
      deduplicated: boolean;
      firstCommitPid: number;
      replayPid: number;
      replayCount: number;
    }>;
    assert.equal(toolResults.length, 1);
    assert.equal(toolResults[0].operationKey, operationKey);
    return {
      modelCalls,
      receiptId: toolResults[0].receiptId,
      operationKey,
      replayObservedExistingReceipt: toolResults[0].deduplicated,
      firstCommitPid: toolResults[0].firstCommitPid,
      replayPid: toolResults[0].replayPid,
      replayCount: toolResults[0].replayCount,
      finalText: result.text,
    };
  } finally {
    await pool.end();
  }
}

async function emitV4(event: unknown) {
  "use step";
  const writer = getWritable<Uint8Array>().getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
  } finally {
    writer.releaseLock();
  }
}

async function closeOutputV4() {
  "use step";
  const writer = getWritable<Uint8Array>().getWriter();
  await writer.close();
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
