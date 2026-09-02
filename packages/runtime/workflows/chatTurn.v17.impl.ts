// @frozen
//
// FROZEN — part of the chatTurn_v17 closure (FS-7 ECHELON-1: THE REPORT CHAT OPENER). A NEW
// frozen closure beside byte-untouched chatTurn_v1..v16.
//
// Every step body except the model segment is v10's, re-exported BY IMPORT DIRECTLY from
// chatTurn.v10.impl.js, exactly as v16 does. `runModelSegmentStepV17` differs from v16's in
// exactly THREE bindings: v17's prompt/part helpers, `buildToolsV17`, and this closure's own
// `chatturn-v17` engine stamp. The segment loop, step budget, recovery read, stop conditions,
// pools and model resolution are byte-carried from their original modules.
//
// THE TOOL SET MOVES BECAUSE THIS VERSION ADDS THREE TOOLS. `buildToolsV17` reaches v15's full
// carried set by import and appends only open_report_run, assess_report_claim and
// seal_report_dataset. No report result becomes a terminal part: each wrapper returns jsonb for
// the model to narrate, while v16 remains the newest part declarer.
//
// `stoppedOnTerminalPost` and `recoverCodingAttempt` are LOCAL COPIES, unchanged from v16. Both
// are unexported in prior frozen closures; exporting them retroactively would edit a deployed
// body. Report lifecycle tools do not join the terminal-post stop set: that set prevents work
// after a book-posting act, and these tools change no books.
//
// `CHAT_STEP_BUDGET` is UNCHANGED at 8.

import { streamText, isStepCount, hasToolCall } from "ai";
import { getWritable } from "workflow";
import { findClarifyCall, type AiContentPart, type JeReviewPart } from "./chatTurn.v11.prompt.js";
import { SYSTEM_PROMPT_V17, toTypedParts_v17, hasCodingIntent_v17, type ClaraPartV17 } from "./chatTurn.v17.prompt.js";
import { pools, resolveModel } from "./chatTurn.v15.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV17 } from "./chatTurn.v17.tools.js";
import { POST_TOOL } from "./chatTurn.v13.post.js";
import { recordChatUsage, chatEngineId } from "./chatTurn.v17.usage.js";

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
export { SYSTEM_PROMPT_V17 };

/** LOCAL COPY of v10/v11/v13/v14/v15/v16's unexported recovery read (W1). Byte-identical logic. */
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

/** LOCAL COPY of v16's `stoppedOnTerminalPost` — unchanged (see this file's header). */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}

/** v13's own designed bound, carried unchanged through v14/v15/v16. */
export const CHAT_STEP_BUDGET = 8;

export async function runModelSegmentStepV17(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
  segment: number,
): Promise<{
  parts: ClaraPartV17[];
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
  const tools = buildToolsV17(ctx, model, segment);
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V17}\n\n${systemExtra}` : SYSTEM_PROMPT_V17,
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
    parts: toTypedParts_v17(content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent_v17(content),
    recovered: false,
  };
}
