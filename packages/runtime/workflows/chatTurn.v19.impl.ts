// @frozen
//
// FROZEN — part of the chatTurn_v19 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v18.
//
// Every step body except the model segment and the ONE new read is v10's, re-exported BY IMPORT
// DIRECTLY from chatTurn.v10.impl.js, exactly as v16, v17 and v18 do. `runModelSegmentStepV19`
// differs from v18's in exactly THREE bindings: v19's prompt/part helpers, `buildToolsV19`, and
// this closure's own `chatturn-v19` engine stamp. The segment loop, step budget, recovery read,
// stop conditions, pools and model resolution are byte-carried from their original modules.
//
// `stoppedOnTerminalPost` and `recoverCodingAttempt` are LOCAL COPIES, unchanged from v16/v17/v18.
// Both are unexported in prior frozen closures; exporting them retroactively would edit a deployed
// body. Neither new tool joins the terminal-post stop set: that set stops the model after a
// POSTING act on the books. `start_periodic_adjustment_work` admits a Work and posts nothing (the
// same reasoning v18 wrote for `start_journal_work`), and `remember_client_information` writes a
// knowledge revision, which is not a posting at all — a turn may legitimately keep talking after
// either.
//
// `CHAT_STEP_BUDGET` is UNCHANGED at 8.
//
// ---------------------------------------------------------------------------------------------
// THE ONE NEW STEP: `loadKnowledgeContextStepV19`.
//
// WHY IT IS A SECOND STEP RATHER THAN A WIDER FIRST ONE. `loadContextStepV10` is FROZEN and is
// reached by import from every chat closure since v10; widening it to read a second pack would be
// an in-place edit of a deployed body, which the versioning law forbids and freeze-lint refuses.
// So v19 leaves it byte-untouched and adds a step beside it. Two steps also means two independent
// WDK checkpoints: a knowledge read that fails does not take the history read down with it.
//
// IT NEVER THROWS, AND THAT IS THE WHOLE DESIGN. `readKnowledgePack`
// (packages/runtime/lib/knowledge.mjs, #644) answers `{status:'ok'}` or
// `{status:'unavailable', reason}` and never null — so this step has no `catch { … = null }` to
// write, and the turn can always tell "I could not read" from "there is nothing to read".
// #603's finding, closed at the seam where it was open.
//
// IT NAMES THE FIRM. `clara.get_knowledge_pack(p_client, p_purpose, p_firm default null)` REQUIRES
// the binding on the machine lane (0192 as amended by #644's second fix round: CLR10
// `pack_firm_required`, CLR11 when the named firm does not own the client). The runtime pool SET
// ROLEs to `clara_runtime`, so this IS the machine lane — an unbound read here would be refused by
// the door rather than quietly answering with whichever firm the client happens to belong to.
//
// IT RETURNS RENDERED TEXT, not the records. A WDK step's answer is serialised into the run's
// journal and replayed on every later attempt, so putting a client's whole knowledge pack in there
// would persist it twice over for no gain: the block is composed once, bounded once, and only the
// bounded form crosses the boundary. The watermark rides beside it so #631's execution trace can
// record which version the turn reasoned on.

import { streamText, isStepCount, hasToolCall } from "ai";
import { getWritable } from "workflow";
import { findClarifyCall, type AiContentPart, type JeReviewPart } from "./chatTurn.v11.prompt.js";
import { SYSTEM_PROMPT_V19, toTypedParts_v19, hasCodingIntent_v19, renderKnowledgeContext, KNOWLEDGE_PACK_PURPOSE, type ClaraPartV19 } from "./chatTurn.v19.prompt.js";
import { pools, resolveModel } from "./chatTurn.v15.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV19 } from "./chatTurn.v19.tools.js";
import { POST_TOOL } from "./chatTurn.v13.post.js";
import { recordChatUsage, chatEngineId } from "./chatTurn.v19.usage.js";
import { readKnowledgePack } from "../lib/knowledge.mjs";

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
export { SYSTEM_PROMPT_V19 };

/** LOCAL COPY of v10/v11/v13/v14/v15/v16/v17/v18's unexported recovery read (W1). Byte-identical
 *  logic. */
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

/** LOCAL COPY of v16/v17/v18's `stoppedOnTerminalPost` — unchanged (see this file's header). */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}

/** v13's own designed bound, carried unchanged through v14/v15/v16/v17/v18. */
export const CHAT_STEP_BUDGET = 8;

/** What the knowledge step hands the turn. Small, serialisable, and rendered — see the header. */
export type KnowledgeContextV19 = {
  status: "ok" | "unavailable";
  reason: string | null;
  knowledge_version: string | null;
  records_shown: number;
  text: string;
};

export async function loadKnowledgeContextStepV19(
  clientId: string | null,
  firmId: string,
): Promise<KnowledgeContextV19> {
  "use step";
  // A HOME conversation has no client, so there is no client-scoped pack to read and no read to
  // make. `readKnowledgePack` answers `no_client` for exactly this case and it is NOT a failure —
  // but it is also not "this client has nothing", which is why it still renders as unavailable
  // rather than as an empty list.
  const pack = clientId
    ? await pools().withRuntime(async (c) => readKnowledgePack(c, { clientId, purpose: KNOWLEDGE_PACK_PURPOSE, firmId }))
    : { status: "unavailable", reason: "no_client", knowledge_version: null, records: [] };
  const records = Array.isArray((pack as { records?: unknown }).records) ? ((pack as { records: unknown[] }).records) : [];
  const version = (pack as { knowledge_version?: unknown }).knowledge_version;
  return {
    status: (pack as { status?: unknown }).status === "ok" ? "ok" : "unavailable",
    reason: typeof (pack as { reason?: unknown }).reason === "string" ? ((pack as { reason: string }).reason) : null,
    // VERBATIM, as TEXT. `clara.knowledge_records.knowledge_version` is a bigint the driver hands
    // over as a string; coercing it through Number() would lose precision past 2^53 and make a
    // later "is this the version I read?" comparison compare two different things.
    knowledge_version: version === null || version === undefined ? null : String(version),
    records_shown: (pack as { status?: unknown }).status === "ok" ? records.length : 0,
    text: renderKnowledgeContext(pack),
  };
}

export async function runModelSegmentStepV19(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
  segment: number,
): Promise<{
  parts: ClaraPartV19[];
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
  const tools = buildToolsV19(ctx, model, segment);
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V19}\n\n${systemExtra}` : SYSTEM_PROMPT_V19,
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
    parts: toTypedParts_v19(content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent_v19(content),
    recovered: false,
  };
}
