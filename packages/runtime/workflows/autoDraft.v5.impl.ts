// @frozen
//
// FROZEN — the durable "use step" bodies of autoDraft_v5 (ledger #46, owner ruling
// 2026-07-29 — the SST-zero precedent). Every step's DB effects are workflow semantics and
// therefore frozen (ship a change as a new class/version). Infrastructure + the tool set
// live in the sibling frozen modules autoDraft.v5.infra.ts / autoDraft.v5.tools.ts
// (imported RELATIVELY so the freeze-lint follows + hash-locks them). Per-attempt
// credentials are minted inside the step that uses them and never cross a step boundary
// (§4.1).
//
// v5 vs v4 (ledger #46, owner ruling 2026-07-29): this file is an UNMODIFIED version-rename
// of v4 — every step body (claim/recover/model/settle/question/close) is byte-identical.
// THE FIX THIS WAVE SHIPS lives entirely in the model-FACING surface, outside this file:
// autoDraft.v5.prompt.ts's purchase-leg SHAPE rule (+ its .describe() echo in
// autoDraft.v5.tools.ts). Diagnosed live (read-only, via ~/.clara-tools/live_ro.py against
// the workflow.workflow_stream_chunks stream, decoded byte-for-byte devalue): task
// 7b389b4f-86af-4c72-ac17-07f1084eccb9 (filing 0586d531-f02c-4077-a14b-41a96965c83f,
// IV-00743, run wrun_01KYP3AYD044CA932JQFEJC9K2, 2026-07-29) settled CLR21
// coding_incomplete — the model correctly read the bill's "SST Amt @ 6%: 0.00" line, found
// no chart-of-accounts account carrying the sst_purchase_cost special type, and refused
// rather than fabricate the tied SST leg. The owner's ruling: the client's own FOUR
// previously-approved EZSEC bills (entries 262/280/295/310 — all printing the identical
// "SST Amt @ 6%: 0.00" line) are ALL two-leg. A stated-but-ZERO tax figure documents "no tax
// charged"; a zero-amount visibility leg conveys nothing and would likely be refused by
// entry validation anyway. v5's prompt therefore narrows the three-leg
// sst_purchase_cost-visibility-split requirement to a STATED NONZERO tax; a stated zero (or
// absent) tax now takes the two-leg shape — matching the client's own precedent. The
// zero-stated fact remains recorded in the extraction facts unchanged; nothing about
// Tier-A/Tier-B extraction, the DB-side coding floor, or any OTHER step body changes.
//
// Schema + every step body are otherwise byte-identical to v4 (no wire-shape or DB-call
// change this wave): one admitted READY bill per task: claim (begin_autodraft_task: CAS
// queued->running + context + reserved tokens) -> recover a completed attempt
// (kill-after-draft resume, no re-model) -> run the coding model client-pinned (drafts
// ONLY) -> settle_autodraft_task with actuals. BOTH double_coded reasons map to a
// SUCCESS-shaped noop_existing settle (WA-L8). A question-shaped non-draft MAY open a
// scoped open-question (origin sweep_refusal) then settles failed with the refusal.
// Kill/replay-safe at every step boundary (begin/settle are idempotent; the model step is
// guarded by the op_key + the get_coding_attempt recovery).

import { streamText, stepCountIs } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import type { ModelMessage } from "ai";
import {
  SYSTEM_PROMPT_AUTODRAFT_V5,
  DRAFT_TOOL,
  toAutoDraftOutcome,
  type AutoDraftOutcome,
  type AiContentPart,
  type JeReviewPart,
} from "./autoDraft.v5.prompt.js";
import { pools, resolveModel, type ToolCtx } from "./autoDraft.v5.infra.js";
import { buildAutoDraftTools } from "./autoDraft.v5.tools.js";

export { SYSTEM_PROMPT_AUTODRAFT_V5 };

/** The claim context returned by begin_autodraft_task (the CAS + bind + context read). */
export type AutoDraftContext = {
  firmId: string;
  clientId: string;
  documentId: string;
  filingId: string;
  origin: string;
  runId: string | null;
  model: string;
  reservedTokens: number;
};

/** CLAIM this task for THIS run (CAS queued->running + bind run id; idempotent re-claim on the
 *  same run id — the claim_document_processing_task replay idiom). Returns the task context. */
export async function claimAutoDraftStep(taskId: string): Promise<{ claimed: boolean; ctx: AutoDraftContext | null }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  return pools().withRuntime(async (c) => {
    const r = await c.query("select clara.begin_autodraft_task($1, $2) as receipt", [taskId, workflowRunId]);
    const receipt = (r.rows[0]?.receipt ?? {}) as {
      claimed?: boolean;
      firm_id?: string;
      client_id?: string;
      document_id?: string;
      filing_id?: string;
      origin?: string;
      run_id?: string | null;
      model_snapshot?: string;
      reserved_tokens?: number | string;
    };
    if (receipt.claimed === false || !receipt.firm_id || !receipt.client_id || !receipt.document_id) {
      return { claimed: false, ctx: null };
    }
    return {
      claimed: true,
      ctx: {
        firmId: String(receipt.firm_id),
        clientId: String(receipt.client_id),
        documentId: String(receipt.document_id),
        filingId: String(receipt.filing_id ?? ""),
        origin: String(receipt.origin ?? "sweep"),
        runId: receipt.run_id == null ? null : String(receipt.run_id),
        model: String(receipt.model_snapshot ?? process.env.CLARA_CHAT_MODEL ?? "gpt-5.6-terra"),
        reservedTokens: Number(receipt.reserved_tokens ?? 0),
      },
    };
  });
}

/** Recover a completed coding attempt BEFORE any model call (the chatTurn C-12 idiom). A
 *  kill-after-draft/before-settle resume returns the persisted draft without re-running the
 *  model or re-drafting. get_coding_attempt is a clara_runtime definer read (PIN-AB-1). */
export async function recoverAutoDraftStep(taskId: string): Promise<JeReviewPart | null> {
  "use step";
  try {
    return await pools().withRuntime(async (c) => {
      const r = await c.query("select clara.get_coding_attempt($1) as a", [taskId]);
      const a = (r.rows[0]?.a ?? null) as
        | { entry_id?: string; revision_token?: string; exception?: boolean; client_id?: string; document_id?: string; part_payload?: Record<string, unknown> }
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
        client_id: String(pp.client_id ?? a.client_id ?? ""),
        document_id: String(pp.document_id ?? a.document_id ?? ""),
        provenance_tier: pp.provenance_tier ?? "model_read",
        ...(a.exception === true ? { exception: true } : {}),
        uncertainty: pp.uncertainty ?? undefined,
      };
    });
  } catch {
    return null; // get_coding_attempt absent/transient — the model path proceeds; op_key backstops.
  }
}

/** ledger #44 (R-round F1): the tag consumeAutoDraftModelResult writes onto the thrown
 *  Error's own MESSAGE (never a property) — the ONE channel proven to survive the WDK step
 *  boundary. `@workflow/core@4.6.0`'s step.js (the 'step_failed' event consumer) reconstructs
 *  every terminal step failure as `new FatalError(errorMessage)` from the event log, copying
 *  ONLY `.message` (and `.stack`, when present) — never `.code`, never `.cause` (confirmed by
 *  reading @workflow/core's own dist/step.js and by constructing a real `FatalError` from the
 *  installed `workflow` package: it carries no `code`/`cause` property at all). A `.code`
 *  assigned to the thrown Error here is therefore INVISIBLE to autoDraft.v5.ts's top-level
 *  catch, which only ever sees the reconstructed FatalError, not this original object.
 *  refusalFromCaughtError (autoDraft.v5.ts) parses this exact prefix back out. */
export const AUTODRAFT_MODEL_ERROR_TAG = "autodraft_model";

export async function consumeAutoDraftModelResult(
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
      // (harmless, and useful to anything that inspects this object BEFORE it crosses the
      // WDK step boundary — e.g. this file's own tests), but they are not load-bearing for
      // what autoDraft.v5.ts eventually sees.
      throw Object.assign(new Error(`[${AUTODRAFT_MODEL_ERROR_TAG}:model_stream_error] model stream reported an error: ${detail}`), {
        code: "model_stream_error",
        cause: streamError,
      });
    }
    throw err;
  }
}

/** One model segment: stream the coding model with the client-pinned tool set, then reduce
 *  the collected content to the terminal AutoDraft outcome (pure toAutoDraftOutcome). Single
 *  pass — no clarify, no park (unattended). Stops after the first successful draft. Retry
 *  semantics are unchanged from v3: this is still a plain throw on failure (see
 *  consumeAutoDraftModelResult's own header for the ledger #44 honesty fix). */
export async function runAutoDraftModelStep(
  ctx: ToolCtx,
  model: string,
): Promise<{ outcome: AutoDraftOutcome; usageTokens: number; entryId: string | null }> {
  "use step";
  const tools = buildAutoDraftTools(ctx);
  const messages: ModelMessage[] = [
    { role: "user", content: `Draft the supplier bill for document ${ctx.documentId} (filing ${ctx.filingId}).` },
  ];
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: SYSTEM_PROMPT_AUTODRAFT_V5,
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [stepCountIs(8), stoppedOnSuccessfulDraft],
  });

  const writer = getWritable<unknown>().getWriter();
  let content: AiContentPart[];
  let usage: unknown;
  try {
    ({ content, usage } = await consumeAutoDraftModelResult(result, (part) => writer.write(part)));
  } finally {
    writer.releaseLock();
  }
  const usageTokens =
    (usage as { totalTokens?: number }).totalTokens ??
    ((usage as { inputTokens?: number }).inputTokens ?? 0) + ((usage as { outputTokens?: number }).outputTokens ?? 0);
  const outcome = toAutoDraftOutcome(content);
  const entryId = outcome.kind === "drafted" ? outcome.entryId : null;
  return { outcome, usageTokens, entryId };
}

/** Settle the sweep task (idempotent). outcome ∈ drafted|skipped_lane|noop_existing|failed;
 *  settle_autodraft_task adjusts the reserved tokens to actual + refund under the budget lock,
 *  writes the sweep_run_items row, and updates the registry counters (a 2nd failure parks). */
export async function settleAutoDraftStep(
  taskId: string,
  outcome: "drafted" | "skipped_lane" | "noop_existing" | "failed",
  tokens: number,
  entryId: string | null,
  refusal: unknown | null,
): Promise<void> {
  "use step";
  await pools().withRuntime((c) =>
    c.query("select clara.settle_autodraft_task($1, $2, $3, $4, $5::jsonb)", [
      taskId,
      outcome,
      Math.max(0, Math.round(tokens)),
      entryId,
      refusal == null ? null : JSON.stringify(refusal),
    ]),
  );
}

/** Open a scoped open-question for a question-shaped refusal (origin recorded 'sweep_refusal'
 *  fn-internally). Best-effort + defensive: a failure here NEVER blocks the failed settle — the
 *  wake_open_question writer only DEMOTES lanes (fail-safe). Document-scoped to this bill. */
export async function openSweepQuestionStep(ctx: ToolCtx, questionText: string): Promise<void> {
  "use step";
  try {
    const { secret } = await mintQuestionCredential(ctx.firmId, ctx.clientId);
    await pools().withWriteWakeScoped(secret, (c) =>
      c.query("select clara.wake_open_question($1::uuid, $2, $3::uuid, $4, $5)", [
        ctx.clientId,
        "document",
        ctx.documentId,
        questionText.slice(0, 2000),
        `sweep-q:${ctx.taskId}:${ctx.documentId}`,
      ]),
    );
  } catch {
    // A refused/failed question open is non-fatal — the settle still records the refusal.
  }
}

/** Mint an autodraft credential for the open-question write (same client-pinned mint as the
 *  read/write scoping; kept here so the impl owns the one non-tool wake write). */
async function mintQuestionCredential(firmId: string, clientId: string): Promise<{ secret: string }> {
  const ttl = process.env.CLARA_AUTODRAFT_CREDENTIAL_TTL || "5 minutes";
  return pools().withRuntime(async (c) => {
    const r = await c.query(
      "select credential_id, secret from clara.mint_wake_credential($1, $2, null, $3::interval, $4)",
      ["autodraft", firmId, ttl, clientId],
    );
    return { secret: String((r.rows[0] as { secret: unknown }).secret) };
  });
}

/** Close the run's writable — IDEMPOTENT (the chatTurn closeStreamStep idiom). */
export async function closeAutoDraftStreamStep(): Promise<void> {
  "use step";
  try {
    const writer = getWritable<unknown>().getWriter();
    await writer.close();
  } catch {
    // already closed / not lockable — the readable has already (or will) signal done.
  }
}

/** A minimal view of a model-loop step for the stop condition. */
type LoopStep = { toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }> };

/** Stop the model loop after the FIRST successful draft_journal_entry result (one coding per
 *  task). A REFUSED draft ({ok:false}) does NOT stop — the model may still explain the block. */
function stoppedOnSuccessfulDraft({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some(
    (r) => r.toolName === DRAFT_TOOL && !!r.output && typeof r.output === "object" && (r.output as { ok?: unknown }).ok === true,
  );
}
