// @frozen
//
// FROZEN — part of the autoDraft_v10 closure (see autoDraft.v10.tools.ts for the one statement
// of what v10 is). A NEW frozen closure beside the byte-untouched autoDraft_v1..v9
// (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export, never an in-place
// edit — the registry repoints `autoDraft:` here).
//
// THIS FILE IS A VERSION-RENAME of autoDraft.v9.impl.ts, byte-identical but for ONE import line:
// `./autoDraft.v9.toolset.js` -> `./autoDraft.v10.toolset.js`. Its own behaviour is v9's. The
// .prompt / .infra / .settle / .usage imports below deliberately keep naming v9's files, which
// v10 reuses unchanged.
//
// THIS FILE (impl) — v9 vs v8. The claim/recover/question/close step bodies and
// consumeAutoDraftModelResult's stream-error tagging are BYTE-CARRIED. Five things change:
//   1. `settleAutoDraftStep` accepts the `posted` outcome and `classifySettleReceipt` gains its
//      shape. PR-1's own posted-chain note is explicit that the PRODUCER must settle only AFTER
//      the post commits; the workflow entry honours that, and this file's classifier refuses to
//      recognise a `posted` settle that does not carry its entry id.
//   2. `runAutoDraftModelStep` stops on a terminal POST, not on a successful draft: the draft is
//      no longer the end of the run.
//   3. The step budget becomes a NAMED, designed bound — AUTODRAFT_STEP_BUDGET below — rather
//      than the unowned constant `stepCountIs(8)` v8 carried.
//   4. One metering row per model call, through F-A9's `clara.record_agent_usage_event`.
//
// THE AI SDK NAME. `isStepCount` is ai@7's canonical export; `stepCountIs` survives only as a
// legacy alias (its own export list reads `isStepCount as stepCountIs`), so v9 uses the current
// name. Read from the installed package's own type declarations, not from memory.

import { streamText, isStepCount } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import type { ModelMessage } from "ai";
import {
  SYSTEM_PROMPT_AUTODRAFT_V9,
  POST_TOOL,
  toAutoDraftOutcome,
  type AutoDraftOutcome,
  type AiContentPart,
  type JeReviewPart,
} from "./autoDraft.v9.prompt.js";
import { pools, resolveModel, type ToolCtx } from "./autoDraft.v9.infra.js";
import { buildAutoDraftTools } from "./autoDraft.v10.toolset.js";

export { SYSTEM_PROMPT_AUTODRAFT_V9 };

/** The claim context returned by begin_autodraft_task (the CAS + bind + context read).
 *  `direction` is PR #204's addition — the admission-bound coding-kind family ('sales' |
 *  'purchase'), or null for a pre-migration attempt row the DB never backfilled. */
export type AutoDraftContext = {
  firmId: string;
  clientId: string;
  documentId: string;
  filingId: string;
  origin: string;
  runId: string | null;
  model: string;
  reservedTokens: number;
  direction: "sales" | "purchase" | null;
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
      direction?: string | null;
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
        direction: receipt.direction === "sales" || receipt.direction === "purchase" ? receipt.direction : null,
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
 *  assigned to the thrown Error here is therefore INVISIBLE to autoDraft.v9.ts's top-level
 *  catch, which only ever sees the reconstructed FatalError, not this original object.
 *  refusalFromCaughtError (autoDraft.v9.ts) parses this exact prefix back out. */
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
      // what autoDraft.v9.ts eventually sees.
      throw Object.assign(new Error(`[${AUTODRAFT_MODEL_ERROR_TAG}:model_stream_error] model stream reported an error: ${detail}`), {
        code: "model_stream_error",
        cause: streamError,
      });
    }
    throw err;
  }
}

/**
 * THE STEP BUDGET — a NAMED, DESIGNED BOUND (F-A2 PR-2, the owner-assigned design cell).
 *
 * v8 wrote `stopWhen: [stepCountIs(8), …]`. The 8 was an unowned constant: no document said what
 * it was counting, why eight, or what happens on the step that exceeds it. v9 owns it.
 *
 * WHAT IT COUNTS. An AI SDK "step" is one model call plus the tool results that call produced.
 * It is NOT a tool call: several tools invoked in one assistant turn are ONE step.
 *
 * WHY EIGHT. F-A2 deliberately retains v8's measured safety ceiling while naming it here as
 * part of the v9 design. Tool calls do not consume the budget one-for-one: a model may issue
 * several independent reads in one step, and each step includes the resulting tool outputs.
 * Eight therefore bounds model round-trips, not the number of permitted accounting reads or
 * writes. It admits the normal read -> draft -> review -> post exchange plus bounded correction,
 * without silently expanding unattended spend as part of the posting change.
 *
 * WHAT HAPPENS WHEN IT IS REACHED, AND WHY THAT IS SAFE. Nothing is posted by exhausting it. The
 * loop stops, `toAutoDraftOutcome` reduces whatever the run actually produced, and a run that
 * drafted-but-did-not-post settles `drafted` while a run that produced nothing settles `failed`
 * with an honest refusal. The budget can therefore only ever produce a LESS complete outcome,
 * never a wrong one — it is a cost bound, not a wall, and it must never be given wall duties.
 *
 * WHAT WOULD CHANGE IT. Only a separately designed bound change with its own evidence. Adding a
 * tool does not by itself justify another model round-trip, because multiple tool calls can share
 * one step.
 */
export const AUTODRAFT_STEP_BUDGET = 8;

/** One model segment: stream the coding model with the client-pinned tool set, then reduce
 *  the collected content to the terminal AutoDraft outcome (pure toAutoDraftOutcome). Single
 *  pass — no clarify, no park (unattended). F-A2: stops after a TERMINAL POST, not after a
 *  successful draft — the draft is now the first of two acts. Retry semantics are unchanged
 *  from v3: this is still a plain throw on failure (see consumeAutoDraftModelResult's own
 *  header for the ledger #44 honesty fix). */
export async function runAutoDraftModelStep(
  ctx: ToolCtx,
  model: string,
): Promise<{ outcome: AutoDraftOutcome; usageTokens: number; entryId: string | null }> {
  "use step";
  const tools = buildAutoDraftTools(ctx, model);
  // PR #204 / 7A-R2: surface the admission-bound direction to the model directly, so it
  // proposes the right coding_kind family the FIRST time rather than discovering a mismatch
  // only via runDraftJournalEntry's early refusal. `direction` is null only for a
  // pre-migration attempt row (never for a document admitted under the ceremony's activated
  // flag) — the clause is simply omitted then, and the static system prompt's own
  // direction-determination guidance still applies.
  const directionClause =
    ctx.direction === "sales"
      ? ' This admission is bound to the SALES direction — propose coding_kind "sales_invoice" or "sales_credit_note" accordingly.'
      : ctx.direction === "purchase"
        ? ' This admission is bound to the PURCHASE direction — propose coding_kind "supplier_bill" accordingly.'
        : "";
  const messages: ModelMessage[] = [
    { role: "user", content: `Draft the document for document ${ctx.documentId} (filing ${ctx.filingId}).${directionClause}` },
  ];
  const startedAt = Date.now();
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: SYSTEM_PROMPT_AUTODRAFT_V9,
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    // The DESIGNED bound, then the SEMANTIC one. Order is presentational only — the AI SDK stops
    // when ANY condition holds — but reading it this way is right: the budget is the backstop,
    // `stoppedOnTerminalPost` is the intended exit.
    stopWhen: [isStepCount(AUTODRAFT_STEP_BUDGET), stoppedOnTerminalPost],
  });

  const writer = getWritable<unknown>().getWriter();
  let content: AiContentPart[];
  let usage: unknown;
  try {
    ({ content, usage } = await consumeAutoDraftModelResult(result, (part) => writer.write(part)));
  } catch (err) {
    await recordAutoDraftUsage(
      ctx,
      ctx.firmId,
      autoDraftEngineId(model),
      { durationMs: Date.now() - startedAt },
      "error",
    );
    throw err;
  } finally {
    writer.releaseLock();
  }
  const usageTokens =
    (usage as { totalTokens?: number }).totalTokens ??
    ((usage as { inputTokens?: number }).inputTokens ?? 0) + ((usage as { outputTokens?: number }).outputTokens ?? 0);
  const outcome = toAutoDraftOutcome(content);
  // ONE METERING ROW PER MODEL CALL, inside the step that made it, before the outcome is
  // returned. The `outcome` here is the METERING outcome — did the call complete — not the
  // accounting one: a run that lawfully refuses to post still bought the tokens, and law 76 says
  // the ledger records spend rather than judging it. A call that threw never reaches this line
  // and is metered by the catch above, inside this same step while its task identity is present.
  await recordAutoDraftUsage(
    ctx,
    ctx.firmId,
    autoDraftEngineId(model),
    {
      inputTokens: (usage as { inputTokens?: number }).inputTokens,
      outputTokens: (usage as { outputTokens?: number }).outputTokens,
      durationMs: Date.now() - startedAt,
    },
    "success",
  );
  // F-A2: the entry id a settle carries. `posted` joins `drafted` here because the DB's re-cut
  // `ck_sweep_run_items_shape` REQUIRES an entry_id on a posted row — writing null would be a
  // constraint violation, and writing it for any third outcome would be false data.
  const entryId =
    outcome.kind === "drafted" || outcome.kind === "posted"
      ? outcome.entryId
      : null;
  return { outcome, usageTokens, entryId };
}

// `classifySettleReceipt` and its three shape helpers moved to autoDraft.v9.settle.ts at v9
// (this file is at the repo's 500-line ceiling) and were WIDENED there for the `posted`
// outcome. Re-exported so every consumer keeps ONE import site.
export { classifySettleReceipt } from "./autoDraft.v9.settle.js";
export type { SettleOutcome } from "./autoDraft.v9.settle.js";
import { classifySettleReceipt, type SettleOutcome } from "./autoDraft.v9.settle.js";

// (hasExactlyKeys lives beside the classifier in autoDraft.v9.settle.ts.)

// F-A2's metering (one row per model call, through the AGENT door with a live-catalog signature
// assertion) lives in autoDraft.v9.usage.ts — its own module because this file is at the repo's
// 500-line ceiling. Re-exported so every consumer keeps ONE import site.
export { autoDraftEngineId, recordAutoDraftUsage, onUsageProblem, liveAgentUsageIdent, AGENT_USAGE_IDENT, AUTODRAFT_CALL_KIND } from "./autoDraft.v9.usage.js";
export type { UsageProblem } from "./autoDraft.v9.usage.js";
import { autoDraftEngineId, recordAutoDraftUsage } from "./autoDraft.v9.usage.js";

/** Settle the sweep task (idempotent). outcome ∈ drafted|skipped_lane|noop_existing|failed|
 *  **posted** (F-A2 — Annex F's five-layer chain admits it, `sweep_runs.posted_count` is its
 *  FOURTH counter, and `ck_sweep_run_items_shape` requires its entry_id).
 *  settle_autodraft_task adjusts the reserved tokens to actual + refund under the budget lock,
 *  writes the sweep_run_items row, and updates the registry counters (a 2nd failure parks).
 *  §7-A / skeleton §2d: the 6-arity overload's REQUIRED 6th argument is the workflow's OWN
 *  engine run id (agent_tasks.workflow_run_id) — NOT the admission-time sweep uuid — sourced
 *  fresh from getWorkflowMetadata() inside this step, matching the pattern already
 *  established in claimAutoDraftStep above.
 *
 *  PR #204 (fixed per Codex round 2, B1): the receipt is read explicitly and classified via
 *  classifySettleReceipt, which FAILS CLOSED — a missing row, NULL, `{}`, or any shape
 *  outside the six enumerated ones throws, rather than silently completing as if settled. */
export async function settleAutoDraftStep(
  taskId: string,
  outcome: SettleOutcome,
  tokens: number,
  entryId: string | null,
  refusal: unknown | null,
): Promise<void> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  const r = await pools().withRuntime((c) =>
    c.query("select clara.settle_autodraft_task($1, $2, $3, $4, $5::jsonb, $6::text) as receipt", [
      taskId,
      outcome,
      Math.max(0, Math.round(tokens)),
      entryId,
      refusal == null ? null : JSON.stringify(refusal),
      workflowRunId,
    ]),
  );
  classifySettleReceipt(r.rows[0]?.receipt);
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

/**
 * F-A2: stop the model loop after a TERMINAL POST — any `post_journal_entry` result at all,
 * whether it posted or was refused. v8 stopped after the first successful DRAFT, which is now
 * exactly the wrong place: the draft is the first of two acts, and stopping there would leave
 * every run un-posted.
 *
 * WHY A REFUSED POST STOPS THE LOOP TOO, and this is the load-bearing half. The post verb is the
 * ONE authority on whether a post is lawful; a refusal is its answer, not an obstacle. Letting
 * the loop continue after one would invite the model to re-draft and re-post against the same
 * document — re-litigating a wall it does not own, spending budget, and (worst) producing a
 * transcript in which the ladder said no and something happened anyway. The refusal is carried
 * to the settle record and the entry stays a draft for a human, which is the designed outcome.
 *
 * The tool set's own once-guard makes a second post impossible in any case; this condition is
 * what makes the run END rather than merely fail to post twice.
 */
function stoppedOnTerminalPost({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => r.toolName === POST_TOOL && !!r.output && typeof r.output === "object");
}
