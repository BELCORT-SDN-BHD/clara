// @frozen
//
// FROZEN — part of the chatTurn_v23 closure. THE STEP BODIES.
//
// A NEW frozen closure beside byte-untouched chatTurn_v1..v22.
//
// EVERY STEP BUT THE MODEL SEGMENT IS REACHED BY IMPORT — v10's lifecycle steps and v21's client
// basis read, exactly as v16..v22 re-export their predecessors'. `runModelSegmentStepV23` differs
// from v22's in exactly THREE bindings: v23's prompt/part helpers, `buildToolsV23`, and this
// closure's own `chatturn-v23` engine stamp. The segment loop, step budget, recovery read, stop
// conditions, pools and model resolution are byte-carried from their original modules.
//
// THERE IS NO NEW STEP, and that is the whole shape of this cut: #1144 adds SEVEN TOOLS, not a
// read the turn makes on its own. `loadClientBasisStepV21` is re-exported unchanged — the same
// step, the same journal shape, the same `clara.retrieve_knowledge` door — so a run parked
// mid-turn at the cutover replays the identical step identity it was journalled under.
//
// `stoppedOnTerminalPost` and `recoverCodingAttempt` are LOCAL COPIES, unchanged from
// v16..v22. Both are unexported in prior frozen closures; exporting them retroactively would edit
// a deployed body.
//
// NONE OF THE SEVEN JOINS THE TERMINAL-POST STOP SET. That set stops the model after a POSTING act
// through `post_journal_entry`. Five of the seven are reads and post nothing. The two
// confirmations record a rent PLAN and post nothing either: a plan's own occurrences post through
// the Work lane later, and a turn may legitimately keep talking after a confirmation ("that is
// twenty-four months from January; shall I show you the first three?" is a good turn).
//
// `stoppedOnDuplicateQuestionV22` IS REACHED BY IMPORT, not re-cut: the look-alike question it
// ends a segment on is v22's `start_trade_invoice_work` arm, unchanged by this cut, and a second
// copy of it is how two versions come to disagree about when a segment ends.
//
// `CHAT_STEP_BUDGET` is UNCHANGED at 8.

import { streamText, isStepCount, hasToolCall } from "ai";
import { getWritable } from "workflow";
import { findClarifyCall, type AiContentPart, type JeReviewPart } from "./chatTurn.v11.prompt.js";
import {
  SYSTEM_PROMPT_V23,
  toTypedParts_v23,
  hasCodingIntent_v23,
  type ClaraPartV23,
} from "./chatTurn.v23.prompt.js";
import { pools, resolveModel } from "./chatTurn.v15.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV23 } from "./chatTurn.v23.tools.js";
import { POST_TOOL } from "./chatTurn.v13.post.js";
import { recordChatUsage, chatEngineId } from "./chatTurn.v23.usage.js";
import { CHAT_STEP_BUDGET } from "./chatTurn.v21.impl.js";
import { stoppedOnDuplicateQuestionV22, withDuplicateQuestionTextV22 } from "./chatTurn.v22.impl.js";

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
// THE KNOWLEDGE PRELOAD IS v21's, BY REFERENCE, as v22 carried it. #658's step is unchanged by
// this cut, and re-exporting it rather than re-cutting it keeps ONE step body for every version
// since — which is what lets a run journalled under v21 or v22 resume without a replay
// divergence.
export { loadClientBasisStepV21, type ClientBasisV21 } from "./chatTurn.v21.impl.js";
export { CHAT_STEP_BUDGET };
export { SYSTEM_PROMPT_V23 };
export { stoppedOnDuplicateQuestionV22, withDuplicateQuestionTextV22 };

/** LOCAL COPY of v10..v22's unexported recovery read (W1). Byte-identical logic. */
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

/** LOCAL COPY of v16..v22's `stoppedOnTerminalPost` — unchanged (see this file's header). */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}

export async function runModelSegmentStepV23(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
  segment: number,
): Promise<{
  parts: ClaraPartV23[];
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
  const tools = buildToolsV23(ctx, model, segment);
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V23}\n\n${systemExtra}` : SYSTEM_PROMPT_V23,
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [isStepCount(CHAT_STEP_BUDGET), hasToolCall("clarify"), stoppedOnTerminalPost, stoppedOnDuplicateQuestionV22],
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
    parts: withDuplicateQuestionTextV22(toTypedParts_v23(content) as never, content) as unknown as ClaraPartV23[],
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent_v23(content),
    recovered: false,
  };
}
