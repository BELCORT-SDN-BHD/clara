// @frozen
//
// FROZEN — part of the chatTurn_v22 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v21.
//
// EVERY STEP BUT THE MODEL SEGMENT IS REACHED BY IMPORT — v10's lifecycle steps and v21's client
// basis read, exactly as v16..v21 re-export their predecessors'. `runModelSegmentStepV22` differs
// from v21's in exactly THREE bindings: v22's prompt/part helpers, `buildToolsV22`, and this
// closure's own `chatturn-v22` engine stamp. The segment loop, step budget, recovery read, stop
// conditions, pools and model resolution are byte-carried from their original modules.
//
// THERE IS NO NEW STEP, and that is the whole shape of this cut: #985 adds a TOOL, not a read the
// turn makes on its own. `loadClientBasisStepV21` is re-exported unchanged — the same step, the
// same journal shape, the same `clara.retrieve_knowledge` door — so a run parked mid-turn at the
// cutover replays the identical step identity it was journalled under.
//
// `stoppedOnTerminalPost` and `recoverCodingAttempt` are LOCAL COPIES, unchanged from
// v16/v17/v18/v19/v20/v21. Both are unexported in prior frozen closures; exporting them
// retroactively would edit a deployed body. `read_opening_source` does NOT join the terminal-post
// stop set: that set stops the model after a POSTING act through `post_journal_entry`, and an
// opening read posts nothing — it authors targets on a basis a person still has to approve, and a
// turn may legitimately keep talking after it ("that is three lines recorded; shall I show you
// where to approve them?" is a good turn, and stopping the model would cost it).
//
// `CHAT_STEP_BUDGET` is UNCHANGED at 8.

import { streamText, isStepCount, hasToolCall } from "ai";
import { getWritable } from "workflow";
import { findClarifyCall, type AiContentPart, type JeReviewPart } from "./chatTurn.v11.prompt.js";
import {
  SYSTEM_PROMPT_V22,
  toTypedParts_v22,
  hasCodingIntent_v22,
  type ClaraPartV22,
} from "./chatTurn.v22.prompt.js";
import { pools, resolveModel } from "./chatTurn.v15.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV22, START_TRADE_INVOICE_WORK_TOOL } from "./chatTurn.v22.tools.js";
import { POST_TOOL } from "./chatTurn.v13.post.js";
import { recordChatUsage, chatEngineId } from "./chatTurn.v22.usage.js";
import { CHAT_STEP_BUDGET } from "./chatTurn.v21.impl.js";

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
// THE KNOWLEDGE PRELOAD IS v21's, BY REFERENCE. #658's step is unchanged by this cut, and
// re-exporting it rather than re-cutting it keeps ONE step body for both versions — which is what
// lets a run journalled under v21 resume without a replay divergence.
export { loadClientBasisStepV21, type ClientBasisV21 } from "./chatTurn.v21.impl.js";
export { CHAT_STEP_BUDGET };
export { SYSTEM_PROMPT_V22 };

/** LOCAL COPY of v10..v21's unexported recovery read (W1). Byte-identical logic. */
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

/** LOCAL COPY of v16..v21's `stoppedOnTerminalPost` — unchanged (see this file's header). */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}

/**
 * A LOOK-ALIKE QUESTION ENDS THE SEGMENT. `start_trade_invoice_work`'s probe answers
 * `{ok:true, status:"duplicates_found"}` — an ordinary tool result, not a refusal — and without
 * this arm the loop continued, so the model could set `record_anyway` ITSELF and record inside the
 * same segment while `clara.record_trade_invoice_duplicate_ack` wrote a durable row asserting the
 * preparer had been warned. (Cut-phase adversarial round, ADV-C1-02.)
 *
 * WHY A STOP RATHER THAN A PARK. `claraWork_v4`'s shape for this is `clara.open_work_question`,
 * which parks a RUN; the chat lane has no run to park and no hook token to park it on (measured,
 * `chatTurn.v22.tools.ts`'s enrolment-question note). Ending the segment is the chat lane's
 * equivalent: the matches reach the person, and the only way to `record_anyway` is a NEW turn,
 * which by construction follows a human message.
 */
export function stoppedOnDuplicateQuestionV22({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => {
    if (r.toolName !== START_TRADE_INVOICE_WORK_TOOL) return false;
    const out = r.output as { status?: unknown } | null | undefined;
    return !!out && typeof out === "object" && out.status === "duplicates_found";
  });
}

/**
 * THE QUESTION HAS TO REACH THE PERSON, and stopping the loop is what makes that non-obvious.
 *
 * `stoppedOnDuplicateQuestionV22` ends the segment on the tool result itself, so the model never
 * gets the step in which it would normally narrate what it found — and a `duplicates_found` result
 * mints no part of its own (`toTypedParts_v21` only lifts a result carrying a `work_id`). Without
 * this the turn would end silently and the person would be asked nothing at all, which is a worse
 * failure than the one the stop fixes.
 *
 * The door's own sentence is used verbatim (`duplicateQuestion()` composes it from the matches),
 * never a re-spelling, and it is appended only when nothing already says it. No new wire kind: a
 * `text` part is what the coding-recovery path already returns.
 */
export function withDuplicateQuestionTextV22(
  parts: ClaraPartV22[],
  content: readonly AiContentPart[],
): ClaraPartV22[] {
  const asked: string[] = [];
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolName?: string; output?: unknown };
    if (tr.toolName !== START_TRADE_INVOICE_WORK_TOOL) continue;
    const out = tr.output as { status?: unknown; question?: unknown } | null | undefined;
    if (!out || typeof out !== "object" || out.status !== "duplicates_found") continue;
    if (typeof out.question === "string" && out.question.trim() !== "") asked.push(out.question);
  }
  if (asked.length === 0) return parts;
  const alreadySaid = (q: string) =>
    parts.some((p) => (p as { type?: string; text?: string }).type === "text"
      && typeof (p as { text?: string }).text === "string"
      && ((p as { text: string }).text).includes(q));
  const out = [...parts];
  for (const q of asked) if (!alreadySaid(q)) out.push({ type: "text", text: q } as unknown as ClaraPartV22);
  return out;
}

export async function runModelSegmentStepV22(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
  segment: number,
): Promise<{
  parts: ClaraPartV22[];
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
  const tools = buildToolsV22(ctx, model, segment);
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V22}\n\n${systemExtra}` : SYSTEM_PROMPT_V22,
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
    parts: withDuplicateQuestionTextV22(toTypedParts_v22(content), content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent_v22(content),
    recovered: false,
  };
}
