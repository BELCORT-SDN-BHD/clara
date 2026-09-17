// @frozen
//
// FROZEN — part of the chatTurn_v20 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v19.
//
// Every step body except the model segment is reached BY IMPORT — v10's lifecycle steps and v19's
// own knowledge-context step, exactly as v16, v17, v18 and v19 re-export their predecessors'.
// `runModelSegmentStepV20` differs from v19's in exactly THREE bindings: v20's prompt/part
// helpers, `buildToolsV20`, and this closure's own `chatturn-v20` engine stamp. The segment loop,
// step budget, recovery read, stop conditions, pools and model resolution are byte-carried from
// their original modules.
//
// THERE IS NO NEW STEP HERE, AND THAT IS THE SHAPE OF THIS CUT. v19 added
// `loadKnowledgeContextStepV19` because it needed a second READ; v20 adds two tools over doors the
// database already grants `clara_runtime`, so the only thing that moves is the tool map. The
// knowledge context step is v19's, re-exported unchanged, and the turn still renders an unreadable
// pack as "unavailable" rather than as a client with nothing recorded (#603).
//
// `stoppedOnTerminalPost` and `recoverCodingAttempt` are LOCAL COPIES, unchanged from
// v16/v17/v18/v19. Both are unexported in prior frozen closures; exporting them retroactively
// would edit a deployed body. NEITHER NEW TOOL JOINS THE TERMINAL-POST STOP SET: that set stops
// the model after a POSTING act on the books. `start_staff_expense_claim_work` admits a Work and
// posts nothing (v18's reasoning for `start_journal_work`, v19's for
// `start_periodic_adjustment_work`), and `start_accrual_work` configures a schedule — it may admit
// this period's Work, and it still posts nothing. A turn may legitimately keep talking after
// either: "I've queued the claim; do you want the June one too?" is a good turn.
//
// `CHAT_STEP_BUDGET` is UNCHANGED at 8.

import { streamText, isStepCount, hasToolCall } from "ai";
import { getWritable } from "workflow";
import { findClarifyCall, type AiContentPart, type JeReviewPart } from "./chatTurn.v11.prompt.js";
import { SYSTEM_PROMPT_V20, toTypedParts_v20, hasCodingIntent_v20, type ClaraPartV20 } from "./chatTurn.v20.prompt.js";
import { pools, resolveModel } from "./chatTurn.v15.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV20 } from "./chatTurn.v20.tools.js";
import { POST_TOOL } from "./chatTurn.v13.post.js";
import { recordChatUsage, chatEngineId } from "./chatTurn.v20.usage.js";

export {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
  consumeChatTurnModelResult,
  CHATTURN_MODEL_ERROR_TAG,
} from "./chatTurn.v10.impl.js";
// v19's knowledge-context step, BY IMPORT and not restated: it is the one read #603 closed, its
// honesty is the whole point of it, and a second copy is how two lanes come to disagree about what
// an unreadable pack means.
export { loadKnowledgeContextStepV19, type KnowledgeContextV19 } from "./chatTurn.v19.impl.js";
export { SYSTEM_PROMPT_V20 };

/** LOCAL COPY of v10..v19's unexported recovery read (W1). Byte-identical logic. */
async function recoverCodingAttempt(taskId: string): Promise<JeReviewPart | null> {
  try {
    return await pools().withRuntime(async (c) => {
      const r = await c.query("select clara.get_coding_attempt($1) as a", [taskId]);
      const a = (r.rows[0]?.a ?? null) as
        | { entry_id?: string; revision_token?: string; exception?: boolean; part_payload?: Record<string, unknown> }
        | null;
      if (!a || !a.entry_id || !a.revision_token) return null;
      const pp = (a.part_payload ?? {}) as {
        client_id?: string;
        document_id?: string;
        provenance_tier?: "verified" | "model_read";
        uncertainty?: { note: string; alternatives: string[] } | null;
      };
      const recoveredPart: JeReviewPart = {
        type: "je_review",
        entry_id: String(a.entry_id),
        revision_token: String(a.revision_token),
        client_id: String(pp.client_id ?? ""),
        document_id: String(pp.document_id ?? ""),
        provenance_tier: pp.provenance_tier ?? "model_read",
        uncertainty: pp.uncertainty ?? undefined,
      };
      if (a.exception === true) recoveredPart.exception = true;
      return recoveredPart;
    });
  } catch {
    return null;
  }
}

type LoopStep = { toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }> };

/** LOCAL COPY of v16/v17/v18/v19's `stoppedOnTerminalPost` — unchanged (see this file's header). */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}

/** v13's own designed bound, carried unchanged through v14..v19. */
export const CHAT_STEP_BUDGET = 8;

export async function runModelSegmentStepV20(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
  segment: number,
): Promise<{
  parts: ClaraPartV20[];
  assistantContent: AiContentPart[];
  usageTokens: number;
  clarify: { toolCallId: string; question: string; context?: string } | null;
  finishReason: string;
  coded: boolean;
  recovered: boolean;
}> {
  "use step";
  const recovered = await recoverCodingAttempt(taskId);
  if (recovered) {
    return {
      parts: [recovered, { type: "text", text: "Your draft is ready to review." }],
      assistantContent: [],
      usageTokens: 0,
      clarify: null,
      finishReason: "coding_recovered",
      coded: true,
      recovered: true,
    };
  }

  const ctx = { firmId, clientId, createdBy, taskId };
  const tools = buildToolsV20(ctx, model, segment);
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V20}\n\n${systemExtra}` : SYSTEM_PROMPT_V20,
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [isStepCount(CHAT_STEP_BUDGET), hasToolCall("clarify"), stoppedOnTerminalPost],
  });

  const writer = getWritable<unknown>().getWriter();
  let content: AiContentPart[];
  let usage: unknown;
  try {
    ({ content, usage } = await consumeChatTurnModelResult(result, (part) => writer.write(part)));
  } catch (err) {
    await recordChatUsage(ctx, chatEngineId(model), { durationMs: Date.now() - startedAt }, "error");
    throw err;
  } finally {
    writer.releaseLock();
  }

  const finishReason = String(await result.finishReason);
  const usageTokens =
    (usage as { totalTokens?: number }).totalTokens ??
    ((usage as { inputTokens?: number }).inputTokens ?? 0) + ((usage as { outputTokens?: number }).outputTokens ?? 0);

  await recordChatUsage(
    ctx,
    chatEngineId(model),
    { inputTokens: (usage as { inputTokens?: number }).inputTokens, outputTokens: (usage as { outputTokens?: number }).outputTokens, durationMs: Date.now() - startedAt },
    "success",
  );

  return {
    parts: toTypedParts_v20(content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent_v20(content),
    recovered: false,
  };
}
