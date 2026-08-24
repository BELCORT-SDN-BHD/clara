// @frozen
//
// FROZEN — part of the chatTurn_v12 closure (F-A1 PR-3a; see chatTurn.v13.tools.ts for the one
// statement of what changed and why). A NEW frozen closure beside the byte-untouched
// chatTurn_v1..v11 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export,
// never an in-place edit — the registry repoints `chatTurn:` here).
//
// THIS FILE (impl) — every step body except the model segment is v10's, re-exported by IMPORT
// DIRECTLY from chatTurn.v10.impl.js (the same source v11.impl.js itself imports from — this
// file does not route through v11.impl.js) so it cannot drift. runModelSegmentStepV13 differs
// from v11's in exactly one expression: it binds buildToolsV13 (chatTurn.v13.tools.js) instead
// of buildToolsV11. SYSTEM_PROMPT_V11 is UNCHANGED — F-A1's widening is read-side only, so no
// prompt sentence needed a word changed (the region vocabulary is identical across regimes).
// Two helpers are LOCAL COPIES rather than imports because v10/v11 do not export them
// (recoverCodingAttempt, stoppedOnSuccessfulDraft) — same v10 rationale, byte-equivalent.

import { streamText, isStepCount, hasToolCall } from "ai";
import { getWritable } from "workflow";
import { findClarifyCall, type AiContentPart, type JeReviewPart } from "./chatTurn.v11.prompt.js";
import { SYSTEM_PROMPT_V13, toTypedParts_v13, hasCodingIntent_v13, type ClaraPartV13 } from "./chatTurn.v13.prompt.js";
import { pools, resolveModel } from "./chatTurn.v13.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV13 } from "./chatTurn.v13.tools.js";
import { POST_TOOL } from "./chatTurn.v13.post.js";
import { recordChatUsage, chatEngineId } from "./chatTurn.v13.usage.js";

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
export { SYSTEM_PROMPT_V13 };

/** LOCAL COPY of v10/v11's unexported recovery read (W1): a kill-after-draft resume shows the
 *  same review card, exception panel included, as the fresh one. An absent get_coding_attempt
 *  or a transient means no recovery — the model path proceeds and the op_key replay backstops
 *  any double draft. */
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

/**
 * F-A2: v12's stop condition was "stop after the first SUCCESSFUL draft" (W4, one coding per
 * task). THAT CONDITION IS REMOVED, not renamed, and the removal is deliberate: on the attended
 * lane a successful draft is now the MIDDLE of the interaction, not the end — the human's next
 * words may be "yes, book it", and the model must still be in the loop to call the post tool.
 * Stopping there would have made chat parity unreachable by construction.
 *
 * WHAT STOPS THE LOOP INSTEAD. A terminal POST — any `post_journal_entry` result, whether it
 * posted or was refused. A refusal stops too, for the same reason it does on the unattended
 * lane: the post verb is the ONE authority on whether a post is lawful, and letting the loop
 * continue would invite the model to re-litigate a wall it does not own. `hasToolCall("clarify")`
 * is untouched and still ends a segment for a human answer.
 *
 * A DRAFT NO LONGER STOPS THE LOOP, so the step budget is what bounds a turn that drafts and
 * never posts — see CHAT_STEP_BUDGET below, which is why that constant had to become a designed
 * bound rather than the unowned 8 v12 carried.
 */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}

/**
 * THE CHAT STEP BUDGET — a NAMED, DESIGNED BOUND (the same design cell as the unattended lane's
 * AUTODRAFT_STEP_BUDGET; v12 wrote a bare `stepCountIs(8)` that no document explained).
 *
 * WHAT IT COUNTS. One AI SDK "step" is one model call plus the tool results it produced — not
 * one tool call: several tools invoked in one assistant turn are ONE step.
 *
 * WHY EIGHT. v13 claims and explains the inherited v12 ceiling; it does not use posting parity
 * as an excuse to expand model spend. A step is a model round-trip, not one tool invocation, so
 * reads, draft and post calls may be grouped by the model within the existing eight rounds.
 *
 * WHAT HAPPENS WHEN IT IS REACHED. The segment ends; `MAX_SEGMENTS` in the workflow entry is the
 * separate bound on clarify round-trips. Nothing is posted by exhausting it, and the C-19
 * terminal invariant still fires — a coding-intent turn that produced no card gets a typed
 * refusal rather than a silent settle. It is a cost bound, never a wall.
 */
export const CHAT_STEP_BUDGET = 8;

export async function runModelSegmentStepV13(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
): Promise<{
  parts: ClaraPartV13[];
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
  const tools = buildToolsV13(ctx, model);
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V13}\n\n${systemExtra}` : SYSTEM_PROMPT_V13,
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    // The DESIGNED budget, then the two SEMANTIC exits. Order is presentational only — the AI
    // SDK stops when ANY condition holds — but the budget reads first because it is the backstop
    // and the other two are the intended ends of a turn.
    stopWhen: [isStepCount(CHAT_STEP_BUDGET), hasToolCall("clarify"), stoppedOnTerminalPost],
  });

  const writer = getWritable<unknown>().getWriter();
  let content: AiContentPart[];
  let usage: unknown;
  try {
    ({ content, usage } = await consumeChatTurnModelResult(result, (part) => writer.write(part)));
  } catch (err) {
    await recordChatUsage(
      ctx,
      chatEngineId(model),
      { durationMs: Date.now() - startedAt },
      "error",
    );
    throw err;
  } finally {
    writer.releaseLock();
  }

  const finishReason = String(await result.finishReason);
  const usageTokens =
    (usage as { totalTokens?: number }).totalTokens ??
    ((usage as { inputTokens?: number }).inputTokens ?? 0) + ((usage as { outputTokens?: number }).outputTokens ?? 0);

  // ONE METERING ROW PER CHAT MODEL CALL, inside the step that made it (law 76: this records
  // spend, it never gates it). The outcome here is the METERING outcome — did the call complete
  // — not the accounting one: a turn that lawfully refuses to post still bought the tokens.
  await recordChatUsage(
    ctx,
    chatEngineId(model),
    {
      inputTokens: (usage as { inputTokens?: number }).inputTokens,
      outputTokens: (usage as { outputTokens?: number }).outputTokens,
      durationMs: Date.now() - startedAt,
    },
    "success",
  );

  return {
    parts: toTypedParts_v13(content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent_v13(content),
    recovered: false,
  };
}
