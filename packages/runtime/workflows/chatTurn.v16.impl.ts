// @frozen
//
// FROZEN — part of the chatTurn_v16 closure (P6-1: THE FOUR-CARD WIRE BUMP). A NEW frozen
// closure beside byte-untouched chatTurn_v1..v15.
//
// Every step body except the model segment is v10's, re-exported BY IMPORT DIRECTLY from
// chatTurn.v10.impl.js (the same source v11/v13/v14/v15's impl files import from) so it cannot
// drift. `runModelSegmentStepV16` differs from v15's in exactly TWO bindings —
// `SYSTEM_PROMPT_V16`/`toTypedParts_v16`/`hasCodingIntent_v16` (one prompt module), and this
// closure's own `chatEngineId` (the `chatturn-v16` stamp). The segment loop, the step budget,
// the stop conditions and the recovery read are byte-carried from v15.
//
// THE TOOL SET IS v15's, REACHED BY IMPORT — `buildToolsV15`, NOT a `buildToolsV16`. This
// closure adds no tool and takes none away, so a v16 tools module would be a copy whose only
// content is a rename, and the freeze-lint closure would then hash a file that exists to say
// "the same". v14 needed its own because it added thirteen tools; v15 needed its own because it
// added one; v16 adds zero, so it imports. (What DOES change is what the runtime makes of a
// tool RESULT — `toTypedParts_v16` — which is a prompt-module concern, not a tool-set one.)
//
// `stoppedOnTerminalPost` and `recoverCodingAttempt` are LOCAL COPIES, unchanged from v15's
// (which are v14's, which are v13's). Both are unexported in every prior closure, so an import
// is not available; the alternative — exporting them from a frozen file — would be editing a
// frozen body. The copies carry their originals' logic and their originals' reasoning: the
// freeform read still does NOT join the terminal-stop set, for the same reason `get_bank_pack`
// does not (it is a READ, and a turn that reads and then keeps working is the normal case),
// and Q8's card does not change that — promoting a card for a read does not make the read an
// act.
//
// `CHAT_STEP_BUDGET` is UNCHANGED at 8.

import { streamText, isStepCount, hasToolCall } from "ai";
import { getWritable } from "workflow";
import { findClarifyCall, type AiContentPart, type JeReviewPart } from "./chatTurn.v11.prompt.js";
import { SYSTEM_PROMPT_V16, toTypedParts_v16, hasCodingIntent_v16, type ClaraPartV16 } from "./chatTurn.v16.prompt.js";
import { pools, resolveModel } from "./chatTurn.v15.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV15 } from "./chatTurn.v15.tools.js";
import { POST_TOOL } from "./chatTurn.v13.post.js";
import { recordChatUsage, chatEngineId } from "./chatTurn.v16.usage.js";

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
export { SYSTEM_PROMPT_V16 };

/** LOCAL COPY of v10/v11/v13/v14/v15's unexported recovery read (W1). Byte-identical logic. */
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
      return {
        type: "je_review",
        entry_id: String(a.entry_id),
        revision_token: String(a.revision_token),
        client_id: String(pp.client_id ?? ""),
        document_id: String(pp.document_id ?? ""),
        provenance_tier: pp.provenance_tier ?? "model_read",
        ...(a.exception === true ? { exception: true } : {}),
        uncertainty: pp.uncertainty ?? undefined,
      };
    });
  } catch {
    return null;
  }
}

type LoopStep = { toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }> };

/** LOCAL COPY of v15's `stoppedOnTerminalPost` — unchanged (see this file's header). */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}

/** v13's own designed bound, carried unchanged through v14/v15 — see this file's header. */
export const CHAT_STEP_BUDGET = 8;

export async function runModelSegmentStepV16(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
  segment: number,
): Promise<{
  parts: ClaraPartV16[];
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
  const tools = buildToolsV15(ctx, model, segment);
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V16}\n\n${systemExtra}` : SYSTEM_PROMPT_V16,
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
    parts: toTypedParts_v16(content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent_v16(content),
    recovered: false,
  };
}
