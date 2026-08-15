// @frozen
//
// FROZEN — part of the chatTurn_v11 closure (WAVE E lane eta, E-c; design part2 section 11). See
// chatTurn.v11.prompt.ts for the one statement of what v11 changes and why this closure imports
// v10's modules rather than copying them.
//
// THIS FILE (impl) — every step body except the model segment is v10's, re-exported by IMPORT so
// it cannot drift. runModelSegmentStepV11 differs from v10's in exactly two expressions: it binds
// buildToolsV11 and SYSTEM_PROMPT_V11. Two helpers are LOCAL COPIES rather than imports because
// v10 does not export them (recoverCodingAttempt, stoppedOnSuccessfulDraft); each carries the
// v10 rationale in short and is byte-equivalent in behaviour.

import { streamText, stepCountIs, hasToolCall } from "ai";
import { getWritable } from "workflow";
import {
  SYSTEM_PROMPT_V11,
  DRAFT_TOOL,
  toTypedParts_v10,
  findClarifyCall,
  hasCodingIntent,
  type ClaraPart,
  type AiContentPart,
  type JeReviewPart,
} from "./chatTurn.v11.prompt.js";
import { pools, resolveModel } from "./chatTurn.v10.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV11 } from "./chatTurn.v11.tools.js";

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
export { SYSTEM_PROMPT_V11 };

/** LOCAL COPY of v10's unexported recovery read (W1): a kill-after-draft resume shows the same
 *  review card, exception panel included, as the fresh one. An absent get_coding_attempt or a
 *  transient means no recovery — the model path proceeds and the op_key replay backstops any
 *  double draft. */
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

/** LOCAL COPY of v10's unexported stop condition (W4, one coding per TASK): stop after the first
 *  SUCCESSFUL draft result. A refused draft does not stop — the model may still clarify. The DB's
 *  CLR21 double_coded law is the hard backstop; this only avoids a wasted second attempt.
 *  The authoring tools deliberately do NOT stop the loop: composing a preview and then discussing
 *  it is one turn's work, and none of them writes to the books. */
function stoppedOnSuccessfulDraft({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some(
    (r) => r.toolName === DRAFT_TOOL && !!r.output && typeof r.output === "object" && (r.output as { ok?: unknown }).ok === true,
  );
}

export async function runModelSegmentStepV11(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
): Promise<{
  parts: ClaraPart[];
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

  const tools = buildToolsV11({ firmId, clientId, createdBy, taskId });
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V11}\n\n${systemExtra}` : SYSTEM_PROMPT_V11,
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [stepCountIs(8), hasToolCall("clarify"), stoppedOnSuccessfulDraft],
  });

  const writer = getWritable<unknown>().getWriter();
  let content: AiContentPart[];
  let usage: unknown;
  try {
    ({ content, usage } = await consumeChatTurnModelResult(result, (part) => writer.write(part)));
  } finally {
    writer.releaseLock();
  }

  const finishReason = String(await result.finishReason);
  const usageTokens =
    (usage as { totalTokens?: number }).totalTokens ??
    ((usage as { inputTokens?: number }).inputTokens ?? 0) + ((usage as { outputTokens?: number }).outputTokens ?? 0);

  return {
    parts: toTypedParts_v10(content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent(content),
    recovered: false,
  };
}
