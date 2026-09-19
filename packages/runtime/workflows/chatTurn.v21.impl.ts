// @frozen
//
// FROZEN — part of the chatTurn_v21 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v20.
//
// Every step body except the model segment and the client-basis read is reached BY IMPORT — v10's
// lifecycle steps, exactly as v16..v20 re-export their predecessors'. `runModelSegmentStepV21`
// differs from v20's in exactly THREE bindings: v21's prompt/part helpers, `buildToolsV21`, and
// this closure's own `chatturn-v21` engine stamp. The segment loop, step budget, recovery read,
// stop conditions, pools and model resolution are byte-carried from their original modules.
//
// THERE IS ONE NEW STEP, AND IT IS A READ THAT REPLACES A READ.
// `loadClientBasisStepV21` supersedes v19's `loadKnowledgeContextStepV19` — which is why this file
// does NOT re-export that step, and the absence is deliberate rather than an oversight. v19's step
// reads `clara.get_knowledge_pack`, whose own migration says what this cut is for: 0192's header
// records that `get_knowledge_pack` exists "precisely so #658's retrieval work can supersede it
// without" editing it. v21 takes that offer. The NEW read is `clara.retrieve_knowledge` — bounded,
// CORE-FIRST, tier-marked, period-aware — through the non-frozen
// `packages/runtime/lib/knowledge-retrieval.mjs`.
//
// `loadContextStepV10` IS BYTE-UNTOUCHED AND IS STILL CALLED. It supplies the conversation history
// and the client context pack, and `clara.get_context_pack` is NOT recut and NOT repointed — not
// one byte. What moved is the KNOWLEDGE preload beside it, and only that.
//
// THE NEW READ NEVER COLLAPSES TO NULL, AND THAT IS THE WHOLE POINT OF IT.
// `chatTurn.v10.impl.ts:136`'s `catch { contextPack = null }` is the shape #658 named: a failed
// read and an empty client become the same value, and a turn then tells a human their client has
// nothing recorded when in fact nobody could look. `retrieveKnowledge` answers `{status:'ok'}` or
// `{status:'unavailable', reason}` over five reasons and never throws, so this step has no catch
// to write, and `faceStatusOf` maps those two runtime words onto the estate's four face words in
// the ONE place that mapping is allowed to live.
//
// AND IT REGISTERS NO PART KIND. See `chatTurn.v21.prompt.ts`'s header for the measurement:
// `knowledge_unavailable` was considered and refused because a card for a failed chat-lane read
// could only carry remembered text — there is no row for it to re-read (`work_knowledge_reads` is
// the WORK lane's relation, written off an `accounting_work` join a chat turn has no row in). The
// typed status rides in the step's own answer and the failure is spoken in the block.
//
// `stoppedOnTerminalPost` and `recoverCodingAttempt` are LOCAL COPIES, unchanged from
// v16/v17/v18/v19/v20. Both are unexported in prior frozen closures; exporting them retroactively
// would edit a deployed body. NEITHER NEW TOOL JOINS THE TERMINAL-POST STOP SET: that set stops
// the model after a POSTING act through `post_journal_entry`. `start_trade_invoice_work` admits a
// Work and posts nothing (v18's reasoning for `start_journal_work`, carried), and
// `run_depreciation_period_for_client` DOES post — but through a door that settles its own receipt
// and returns a complete summary, so a turn may legitimately keep talking after it ("September is
// charged; do you want October too?" is a good turn, and stopping the model would cost it).
//
// `CHAT_STEP_BUDGET` is UNCHANGED at 8.

import { streamText, isStepCount, hasToolCall } from "ai";
import { getWritable } from "workflow";
import { findClarifyCall, type AiContentPart, type JeReviewPart } from "./chatTurn.v11.prompt.js";
import {
  SYSTEM_PROMPT_V21,
  toTypedParts_v21,
  hasCodingIntent_v21,
  CLIENT_BASIS_LIMIT,
  CLIENT_BASIS_PURPOSE,
  type ClaraPartV21,
} from "./chatTurn.v21.prompt.js";
import { pools, resolveModel, type PgExec } from "./chatTurn.v15.infra.js";
import { consumeChatTurnModelResult } from "./chatTurn.v10.impl.js";
import { buildToolsV21 } from "./chatTurn.v21.tools.js";
import { POST_TOOL } from "./chatTurn.v13.post.js";
import { recordChatUsage, chatEngineId } from "./chatTurn.v21.usage.js";
import { faceStatusOf, renderRetrievedKnowledge, retrieveKnowledge } from "../lib/knowledge-retrieval.mjs";

// THE CARRIER IS JAVASCRIPT, SO THIS CLOSURE CALLS IT THROUGH A TYPED VIEW — the estate's pattern
// for a `.mjs` dependency (`claraWork.v4.impl.ts:270` casts `readWorkKnowledge` the same way), and
// it exists for a measured reason rather than for tidiness: TypeScript infers a `.mjs` function's
// parameter type from its DESTRUCTURING DEFAULTS, so `retrieveKnowledge({clientId, firmId,
// purpose, asOf = null, …})` is inferred as accepting `asOf?: null` — the type of the default,
// never the type of the argument the carrier's own JSDoc documents. This view states the contract
// the module actually has; it narrows nothing at run time and the carrier stays the one
// implementation.
type RetrieveKnowledgeArgs = {
  clientId: string;
  firmId: string;
  purpose: string;
  asOf?: string | null;
  keys?: readonly string[] | null;
  limit?: number;
};
const retrieveKnowledgeTyped = retrieveKnowledge as unknown as (
  sql: PgExec,
  args: RetrieveKnowledgeArgs,
) => Promise<Record<string, unknown>>;

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
export { SYSTEM_PROMPT_V21 };

/** LOCAL COPY of v10..v20's unexported recovery read (W1). Byte-identical logic. */
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

/** LOCAL COPY of v16..v20's `stoppedOnTerminalPost` — unchanged (see this file's header). */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}

/** v13's own designed bound, carried unchanged through v14..v21. */
export const CHAT_STEP_BUDGET = 8;

// ---------------------------------------------------------------------------
// THE CLIENT-BASIS READ — bounded, core-first, and never null.
// ---------------------------------------------------------------------------

/**
 * What the client-basis step hands the turn. SMALL, SERIALISABLE AND RENDERED: a WDK step's answer
 * is written into the run's journal and replayed on every later attempt, so putting a client's
 * whole record set in there would persist it twice over for no gain. v19's own rule, carried.
 *
 * `face_status` is the ESTATE's vocabulary — `ok` / `partial` / `unknown` / `denied` — and never
 * the runtime's `unavailable`, which no face and no database column may ever say. `status` and
 * `reason` are the runtime's own two words, kept beside it so a later reader can tell the raw
 * answer from the rendered one without re-deriving either.
 */
export type ClientBasisV21 = {
  status: "ok" | "unavailable";
  reason: string | null;
  face_status: "ok" | "partial" | "unknown" | "denied";
  knowledge_version: string | null;
  as_of: string | null;
  records_shown: number;
  truncated: boolean;
  text: string;
};

type RetrievedAnswer = {
  status?: unknown;
  reason?: unknown;
  knowledge_version?: unknown;
  as_of?: unknown;
  truncated?: unknown;
  records?: unknown;
};

/**
 * Read this client's governed knowledge for the turn, CORE-FIRST and BOUNDED.
 *
 * `createdBy` IS THE READER THIS READ IS MADE FOR, AND TODAY IT REACHES NOTHING — stated rather
 * than hidden. `clara.retrieve_knowledge` takes no actor: the runtime pool SET ROLEs to
 * `clara_runtime`, the door is firm-bound by `p_firm` and client-bound by `p_client`, and the chat
 * lane has no read-set relation to record a reader into (`clara.work_knowledge_reads` is the WORK
 * lane's, written off an `accounting_work` join a chat turn has no row in). The parameter is in
 * the signature because the successor stanza fixes it there and a WDK step's argument list is part
 * of its journal shape — a later version that gains a chat-lane read-set must not have to change
 * this step's arity to record who read.
 *
 * `asOf` IS THE PERIOD BEING REASONED ABOUT, not today. A turn with no period in hand passes null
 * and the door defaults to the server's Asia/Kuala_Lumpur calendar date; passing a period's date
 * marks the rows against the right window instead.
 *
 * IT NAMES THE FIRM. 0230's machine lane REQUIRES it — an unbound read is the door's own refusal
 * rather than another firm's knowledge — and that guard is deliberately NOT duplicated here: this
 * step decides nothing about authority.
 *
 * IT NEVER THROWS AND NEVER RETURNS NULL. A HOME conversation has no client, so there is nothing
 * client-scoped to read: `retrieveKnowledge` answers `no_client` for exactly that case, which is
 * not a failure — but it is also not "this client has nothing", and the block says which.
 */
export async function loadClientBasisStepV21(
  clientId: string | null,
  firmId: string,
  createdBy: string,
  asOf: string | null,
): Promise<ClientBasisV21> {
  "use step";
  const answer: RetrievedAnswer = clientId
    ? ((await pools().withRuntime(async (c: PgExec) =>
        retrieveKnowledgeTyped(c, {
          clientId,
          firmId,
          purpose: CLIENT_BASIS_PURPOSE,
          asOf,
          limit: CLIENT_BASIS_LIMIT,
        }),
      )) as RetrievedAnswer)
    : { status: "unavailable", reason: "no_client", records: [] };
  const records = Array.isArray(answer.records) ? answer.records : [];
  return {
    status: answer.status === "ok" ? "ok" : "unavailable",
    reason: typeof answer.reason === "string" ? answer.reason : null,
    face_status: faceStatusOf(answer) as ClientBasisV21["face_status"],
    // VERBATIM, AS TEXT. The watermark is a bigint the driver hands over as text; coercing it
    // through Number() would quietly lose precision past 2^53 and would make a later "is this the
    // version I read?" comparison compare two different things.
    knowledge_version:
      answer.knowledge_version === null || answer.knowledge_version === undefined
        ? null
        : String(answer.knowledge_version),
    as_of: answer.as_of === null || answer.as_of === undefined ? null : String(answer.as_of),
    records_shown: records.length,
    truncated: answer.truncated === true,
    text: renderRetrievedKnowledge(answer),
  };
}

export async function runModelSegmentStepV21(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: import("ai").ModelMessage[],
  systemExtra: string,
  segment: number,
): Promise<{
  parts: ClaraPartV21[];
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
  const tools = buildToolsV21(ctx, model, segment);
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V21}\n\n${systemExtra}` : SYSTEM_PROMPT_V21,
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
    parts: toTypedParts_v21(content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
    coded: hasCodingIntent_v21(content),
    recovered: false,
  };
}
