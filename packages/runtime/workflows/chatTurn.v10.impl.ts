// @frozen
//
// FROZEN — part of the chatTurn_v10 closure (WAVE E, the F6–F9 fix batch; H1 ACCEPTANCE
// FINDING F9, ADR-064 §3). A NEW frozen closure beside the byte-untouched
// chatTurn_v1..v9 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN
// export, never an in-place edit — the registry repoints `chatTurn:` here).
//
// THE FINDING, ONCE, FOR THE WHOLE CLOSURE. The drafting model mis-transcribed ONE hex
// group of a 36-character region UUID (…-4c6d-… for the true …-4fce-…), recurring across
// independent attempts — INCLUDING a separate attempt on the CHAT lane, which is why this
// family bumps too and not only autoDraft. The DB evidence wall
// (clara._write_entry_evidence) correctly refused CLR21 evidence_invalid every time; a
// hand-draft citing the true id drafted clean first try
// (docs/plan/wave-7a-acceptance-h1.md:773-790). The defect is upstream, in asking a model
// to reproduce an opaque 36-char identifier it was shown once inside a large JSON array.
// v10 stops asking: the toolface takes a small INDEX (`region_idx`) into the region list
// read_document printed, and the WRAPPER resolves index -> region_id server-side before
// the DB writer is called. The wall is untouched and still receives a region_id.
//
// THIS FILE (impl) — an UNMODIFIED version-rename of v9: every step body
// (claim/load/model-segment/hook/checkpoint/settle/close), the attachment-aware transcript
// folder, the coding-attempt recovery, the draft stop condition and
// consumeChatTurnModelResult's stream-error tagging are byte-identical; only import paths
// and the V9 -> V10 identifier suffixes moved. F9's change lives in the prompt/tools/errors
// modules this file imports.

import { streamText, stepCountIs, hasToolCall, type ModelMessage } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import {
  SYSTEM_PROMPT_V10,
  CLARIFY_FRAMING,
  DRAFT_TOOL,
  attachmentStub,
  toTypedParts_v10,
  findClarifyCall,
  hasCodingIntent,
  type ClaraPart,
  type AiContentPart,
  type JeReviewPart,
} from "./chatTurn.v10.prompt.js";
import { pools, resolveModel, readScoped } from "./chatTurn.v10.infra.js";
import { buildToolsV10 } from "./chatTurn.v10.tools.js";

export { SYSTEM_PROMPT_V10 };

/** Reconstruct a model message from stored Clara parts. v2 surfaces an attachment
 *  part as the read_document stub [N-F14] (v1 dropped it); je_review / refusal parts
 *  render as short pointers so prior coding turns stay legible to the model. */
function messageFromParts_v10(role: string, parts: ClaraPart[]): ModelMessage | null {
  const text = parts
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "clarify") return `[clarify] ${p.question}`;
      if (p.type === "je_review") return `[review card drafted for entry ${p.entry_id}]`;
      if (p.type === "refusal") return `[refused: ${p.message}]`;
      const anyPart = p as { type: string; document_id?: unknown };
      if (anyPart.type === "attachment" && typeof anyPart.document_id === "string") return attachmentStub(anyPart.document_id);
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) return null;
  if (role === "user") return { role: "user", content: text };
  if (role === "assistant") return { role: "assistant", content: text };
  return null;
}

/** CLAIM this task for THIS run (S4-AB3 self-bind dedupe) — identical to v1. */
export async function claimRunStep(taskId: string): Promise<{ claimed: boolean }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  return pools().withRuntime(async (c) => {
    const cas = await c.query(
      `update clara.agent_tasks set workflow_run_id = $2, status = 'running'
        where id = $1 and status = 'queued' and workflow_run_id is null returning id`,
      [taskId, workflowRunId],
    );
    if (cas.rowCount === 1) return { claimed: true };
    const own = await c.query("select 1 from clara.agent_tasks where id = $1 and workflow_run_id = $2", [taskId, workflowRunId]);
    return { claimed: own.rowCount === 1 };
  });
}

/** Read the task snapshot + binding. v2 ALSO returns created_by (the OBO subject for
 *  every wake-scoped read/write in the turn — C-11). */
export async function loadTaskStepV10(
  taskId: string,
): Promise<{ sessionId: string; model: string; clientId: string | null; firmId: string; createdBy: string }> {
  "use step";
  return pools().withRuntime(async (c) => {
    const r = await c.query(
      "select session_id, model_snapshot, client_id, firm_id, created_by from clara.agent_tasks where id = $1",
      [taskId],
    );
    if (r.rowCount === 0) throw new Error(`chatTurn_v10: task ${taskId} not found`);
    const row = r.rows[0]!;
    return {
      sessionId: String(row.session_id),
      model: String(row.model_snapshot),
      clientId: row.client_id == null ? null : String(row.client_id),
      firmId: String(row.firm_id),
      createdBy: String(row.created_by),
    };
  });
}

/** Load prior transcript (attachment-aware, v2) + the client context pack (per-attempt
 *  credential minted OBO the initiator). v7: the pack fetch runs purpose "wiki_coding"
 *  (AMB-1) with the FORK-6 `clara.pack_consumer='v25'` GUC set txn-local immediately
 *  before it, on the SAME client, inside the SAME readScoped transaction. */
export async function loadContextStepV10(
  sessionId: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
): Promise<{ history: ModelMessage[]; contextPack: unknown | null }> {
  "use step";
  const history = await pools().withRuntime(async (c) => {
    const r = await c.query("select role, parts from clara.chat_messages where session_id = $1 order by seq", [sessionId]);
    return r.rows
      .map((row) => messageFromParts_v10(String(row.role), (row.parts ?? []) as ClaraPart[]))
      .filter((m): m is ModelMessage => m !== null);
  });
  let contextPack: unknown | null = null;
  if (clientId) {
    try {
      contextPack = await readScoped({ firmId, clientId, createdBy, taskId: sessionId }, async (c) => {
        await c.query("select set_config('clara.pack_consumer', $1, true)", ["v25"]);
        const r = await c.query("select clara.get_context_pack($1, $2) as pack", [clientId, "wiki_coding"]);
        return r.rows[0]?.pack ?? null;
      });
    } catch {
      // A below-floor initiator (OBO mint refused) advises without the pack rather
      // than failing the whole turn; the read tools return their own typed refusals.
      contextPack = null;
    }
  }
  return { history, contextPack };
}

/** Recover a completed coding attempt for this task BEFORE any model call (C-12). A
 *  completed attempt short-circuits the segment to the canonical card, so a
 *  kill-after-draft/before-settle resume never re-runs the model or re-drafts. The
 *  stable op_key is the real idempotency guarantee; this is the fast, faithful path. */
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
        // The recovery read exposes the persisted amount-exception state (W1) so a
        // kill-after-draft resume shows the same exception panel as the fresh card.
        ...(a.exception === true ? { exception: true } : {}),
        uncertainty: pp.uncertainty ?? undefined,
      };
    });
  } catch {
    // get_coding_attempt absent (pre-0009) or transient — no recovery; the model
    // path proceeds and the op_key replay backstops any double-draft.
    return null;
  }
}

/** A minimal view of a model-loop step for the stop condition (the AI SDK StepResult
 *  carries a `toolResults` array of `{ toolName, output }`). */
type LoopStep = { toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }> };

/** Stop the model loop after the FIRST successful draft_journal_entry result (W4:
 *  one coding per TASK). Mirrors the clarify stop mechanism, but keys on a successful
 *  tool RESULT because the draft tool executes (clarify has no execute). A REFUSED
 *  draft ({ok:false}) does NOT stop — the model may still clarify or explain. The DB's
 *  one-coding-per-task law (CLR21 double_coded) is the hard backstop; this stop keeps
 *  the model from even attempting a second bill in the same turn. */
function stoppedOnSuccessfulDraft({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some(
    (r) => r.toolName === DRAFT_TOOL && !!r.output && typeof r.output === "object" && (r.output as { ok?: unknown }).ok === true,
  );
}

/** ledger #46a (the diagnostic twin, cross-referencing autoDraft.v4.impl.ts's own
 *  ledger #44 header for the full R-round F1 finding): the tag
 *  consumeChatTurnModelResult writes onto the thrown Error's own MESSAGE (never a
 *  property) — the ONE channel proven to survive the WDK step boundary.
 *  `@workflow/core@4.6.0`'s step.js (the 'step_failed' event consumer) reconstructs
 *  every terminal step failure as `new FatalError(errorMessage)` from the event log,
 *  copying ONLY `.message` (and `.stack`, when present) — never `.code`, never
 *  `.cause`. A `.code` assigned to the thrown Error here is therefore INVISIBLE to
 *  chatTurn.v10.ts's top-level catch, which only ever sees the reconstructed
 *  FatalError, not this original object. errorCodeFromCaughtError (chatTurn.v10.ts)
 *  parses this exact prefix back out. */
export const CHATTURN_MODEL_ERROR_TAG = "chatturn_model";

export async function consumeChatTurnModelResult(
  result: { fullStream: AsyncIterable<unknown>; content: PromiseLike<unknown>; totalUsage: PromiseLike<unknown> },
  write: (part: unknown) => Promise<void>,
): Promise<{ content: AiContentPart[]; usage: unknown }> {
  let streamError: unknown = null;
  for await (const part of result.fullStream) {
    if (streamError == null && (part as { type?: string }).type === "error") {
      streamError = (part as { error?: unknown }).error ?? part;
    }
    await write(part);
  }
  try {
    const content = (await result.content) as AiContentPart[];
    const usage = await result.totalUsage;
    return { content, usage };
  } catch (err) {
    if (streamError != null) {
      const detail = streamError instanceof Error ? streamError.message : String(streamError);
      // The [tag:code] prefix rides IN the message — the properties below are kept too
      // (harmless, and useful to anything that inspects this object BEFORE it crosses
      // the WDK step boundary — e.g. this file's own tests), but they are not
      // load-bearing for what chatTurn.v10.ts eventually sees.
      throw Object.assign(new Error(`[${CHATTURN_MODEL_ERROR_TAG}:model_stream_error] model stream reported an error: ${detail}`), {
        code: "model_stream_error",
        cause: streamError,
      });
    }
    throw err;
  }
}

/** One model segment (v2): recover a completed coding attempt first, else stream the
 *  model with the v2 tool set, collect typed parts (with je_review/refusal promotion),
 *  and detect a clarify + coding intent. v8: the fullStream consumption + content/
 *  totalUsage read routes through consumeChatTurnModelResult (ledger #46a) instead of
 *  an uninspected write-loop + unguarded awaits. */
export async function runModelSegmentStepV10(
  taskId: string,
  model: string,
  clientId: string | null,
  firmId: string,
  createdBy: string,
  messages: ModelMessage[],
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

  const tools = buildToolsV10({ firmId, clientId, createdBy, taskId });
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT_V10}\n\n${systemExtra}` : SYSTEM_PROMPT_V10,
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

/** Mint a RANDOM hook token in a MEMOIZED step (S4-AB4) — identical to v1. */
export async function mintHookTokenStep(): Promise<string> {
  "use step";
  const { randomUUID } = await import("node:crypto");
  return `clarify:${randomUUID()}`;
}

/** Open a clarify ATOMICALLY via clara.open_interruption (S4-AB4) — identical to v1. */
export async function openInterruptionStep(
  taskId: string,
  hookToken: string,
  clarify: { question: string; context?: string },
): Promise<void> {
  "use step";
  const question = { type: "clarify", question: clarify.question, context: clarify.context ?? null, framing: CLARIFY_FRAMING };
  await pools().withRuntime((c) =>
    c.query("select clara.open_interruption($1, $2, $3::jsonb, null)", [taskId, hookToken, JSON.stringify(question)]),
  );
}

/** Durably checkpoint a completed segment's tokens + parts (S4-AB6) — identical to v1. */
export async function checkpointStep(taskId: string, segment: number, tokens: number, parts: ClaraPart[]): Promise<void> {
  "use step";
  await pools().withRuntime((c) =>
    c.query("select clara.checkpoint_turn($1, $2, $3, $4::jsonb)", [taskId, segment, tokens, JSON.stringify(parts)]),
  );
}

/** Un-park the task on resume (awaiting_input -> running) — identical to v1. */
export async function markRunningStep(taskId: string): Promise<void> {
  "use step";
  await pools().withRuntime((c) =>
    c.query("update clara.agent_tasks set status = 'running' where id = $1 and status = 'awaiting_input'", [taskId]),
  );
}

/** Settle the turn (idempotent; closes pending interruptions when terminal) — identical to v1. */
export async function settleStep(
  taskId: string,
  parts: ClaraPart[],
  tokens: number,
  outcome: "completed" | "failed" | "expired" | "cancelled",
  errorCode: string | null,
): Promise<void> {
  "use step";
  await pools().withRuntime((c) =>
    c.query("select clara.settle_chat_turn($1, $2::jsonb, $3, $4, $5)", [taskId, JSON.stringify(parts), tokens, outcome, errorCode]),
  );
}

/** Close the run's writable — IDEMPOTENT (S4-AB4b) — identical to v1. */
export async function closeStreamStep(): Promise<void> {
  "use step";
  try {
    const writer = getWritable<unknown>().getWriter();
    await writer.close();
  } catch {
    // already closed / not lockable — the readable has already (or will) signal done.
  }
}
