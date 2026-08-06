// @frozen
//
// FROZEN — the durable "use step" bodies of autoDraft_v6 (§7-A THE UNATTENDED SALES DRAFTER;
// wave-7a-contract.md §3 PR-RUNTIME). Every step's DB effects are workflow semantics and
// therefore frozen (ship a change as a new class/version). Infrastructure + the tool set
// live in the sibling frozen modules autoDraft.v6.infra.ts / autoDraft.v6.tools.ts
// (imported RELATIVELY so the freeze-lint follows + hash-locks them). Per-attempt
// credentials are minted inside the step that uses them and never cross a step boundary
// (§4.1).
//
// v6 vs v5 (§7-A, skeleton §2a item (d) / §2d): the settle call moves to the 6-arity
// `settle_autodraft_task` overload, carrying the workflow's OWN engine run id as the required
// 6th argument `p_workflow_run_id`. Skeleton §2d's corrected identity: `autodraft_attempts.
// run_id` is the sweep uuid (from `sweep_runs`), while `agent_tasks.workflow_run_id` is the
// ENGINE run id the WDK actually issued — the two are different columns of different types,
// and the 0036 caller-run-identity check needs the LATTER. `getWorkflowMetadata().
// workflowRunId` is already read inside claimAutoDraftStep (below, unchanged) for exactly
// that reason; settleAutoDraftStep reads it again itself (fresh per step execution, matching
// the established claim-step pattern — no new parameter threaded through the workflow body
// in autoDraft.v6.ts, which stays a version-rename).
//
// PR #204 (the DB lane) landed THREE more contract facts this file now honours:
//
//   1. THE BOUND FAMILY (7A-R2). `begin_autodraft_task` now returns `direction` ('sales' |
//      'purchase' | null) in BOTH its return shapes (the replay branch and the fresh-start
//      branch — 0046 S7.2 asserts the anchor occurs exactly twice, so a future recut that
//      drops it from either shape fails the migration's own tail, not silently). This file's
//      `AutoDraftContext` gains a `direction` field, `claimAutoDraftStep` reads it off the
//      receipt, and `runAutoDraftModelStep`'s per-run user message now names the bound
//      direction explicitly (surfacing it to the model so it proposes the RIGHT coding_kind
//      the first time, rather than discovering the mismatch only via a refusal round-trip).
//      The actual EARLY-VALIDATION check against this family lives in tools.ts's
//      runDraftJournalEntry (the wrapper), not here — this file only carries the fact through.
//   2. THE SETTLE NO-OP (skeleton §2d, the 6-arity's own new branch). A losing dispatch — this
//      run's settle call arriving after a DIFFERENT workflow run already holds the task
//      (`t.workflow_run_id is distinct from p_workflow_run_id`) — no longer needs a raise to
//      stay safe: the 6-arity returns `{settled:false,outcome:'not_settled',
//      reason:'run_superseded'}` instead, the SAME shape 0036 already used for
//      `task_superseded`/`registry_superseded`/`registry_released` (never raise on a losing
//      dispatch — the winning run's own settle call owns the real accounting). v5's settle
//      call discarded its query result entirely (fire-and-forget), which already tolerated
//      any non-throwing outcome; settleAutoDraftStep now reads the result EXPLICITLY and
//      short-circuits on `settled === false` — making the no-op path observable and testable
//      rather than merely accidental.
//   3. The `wake_draft_entry` write floor's own two new CLR21 detail reasons
//      (`counterparty_kind_contradiction`, `direction_family_mismatch`) reach this file only
//      via the ALREADY-EXISTING caught-error path (refusalFromDbError in .errors.ts) — no
//      change needed here.
//
// Every other step body (recover/question/close, and consumeAutoDraftModelResult's
// stream-error tagging) is an unmodified version-rename of v5.

import { streamText, stepCountIs } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import type { ModelMessage } from "ai";
import {
  SYSTEM_PROMPT_AUTODRAFT_V6,
  DRAFT_TOOL,
  toAutoDraftOutcome,
  type AutoDraftOutcome,
  type AiContentPart,
  type JeReviewPart,
} from "./autoDraft.v6.prompt.js";
import { pools, resolveModel, type ToolCtx } from "./autoDraft.v6.infra.js";
import { buildAutoDraftTools } from "./autoDraft.v6.tools.js";

export { SYSTEM_PROMPT_AUTODRAFT_V6 };

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
 *  assigned to the thrown Error here is therefore INVISIBLE to autoDraft.v6.ts's top-level
 *  catch, which only ever sees the reconstructed FatalError, not this original object.
 *  refusalFromCaughtError (autoDraft.v6.ts) parses this exact prefix back out. */
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
      // what autoDraft.v6.ts eventually sees.
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
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: SYSTEM_PROMPT_AUTODRAFT_V6,
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

/** PR #204 fix (Codex round 2, B1 — an IMPLEMENTATION blocker, not a test-guard gap): the
 *  original receipt read failed OPEN. `r.rows[0]?.receipt ?? {}` + `receipt.settled ===
 *  false` means a missing row, NULL, `{}`, or ANY malformed/unrecognized shape all fall
 *  through past that one check silently — the workflow would report "drafted" while the
 *  task stays running and its reservation stays charged forever. Codex verified by
 *  EXECUTION against d404ff9 that the fix cannot be "require settled===true" either: the
 *  DB's own SUCCESS shape carries no `settled` key at all (see shape 3 below).
 *
 *  This function enumerates the EXACT jsonb shapes clara.settle_autodraft_task can return —
 *  read directly from the migration (0036_wave_c0_deferred_belts.sql:856-997, the live body
 *  the 6-arity is harvested from at 0046_wave_7a_sales_lane.sql §8, plus that section's own
 *  run_superseded splice) — and accepts ONLY those. Anything else THROWS: a throw retries
 *  the step / surfaces for reconcile_sweep_runs to recover; silence strands the task
 *  non-terminal with a live reservation forever.
 *
 *  Shape 1 — REPLAY (0036:871-873, `t.status in ('completed','failed')`): an idempotent
 *    re-settle of an already-terminal task — `{task_id, status, replayed:true}`. NO
 *    `settled` key, NO `outcome` key at all.
 *  Shapes 2-5 — the FOUR named benign no-ops. ALL carry `settled:false, outcome:
 *    'not_settled'` plus a `reason` drawn from EXACTLY this set:
 *      task_superseded     (0036:899-909 — t.status in ('cancelled','expired'))
 *      registry_superseded (0036:934-939 — no registry row points at this task any more)
 *      registry_released   (0036:941-946 — the registry row is not state='active')
 *      run_superseded      (0046 §8 — t.workflow_run_id is distinct from p_workflow_run_id)
 *  Shape 6 — SUCCESS (0036:994-996, the function's own final return, reached only after
 *    every guard above passes): `{task_id, status:'failed'|'completed', outcome, entry_id,
 *    tokens_spent, tokens_refunded}`. NO `settled` key at all — Codex's own finding, cited
 *    here so a future reader never "fixes" this by requiring settled===true. */
export function classifySettleReceipt(receipt: unknown): "settled" | "benign-no-op" {
  if (receipt == null || typeof receipt !== "object") {
    throw new Error(`settle_autodraft_task returned an unrecognized receipt (missing row or non-object): ${JSON.stringify(receipt)}`);
  }
  const r = receipt as Record<string, unknown>;

  // Shape 1 — REPLAY (0036:871-873).
  if (r.replayed === true && "task_id" in r && "status" in r) {
    return "settled";
  }

  // Shapes 2-5 — the four named benign no-ops (0036:899-946; 0046 §8's run_superseded).
  const KNOWN_NOOP_REASONS = new Set(["task_superseded", "registry_superseded", "registry_released", "run_superseded"]);
  if (r.settled === false && r.outcome === "not_settled" && typeof r.reason === "string" && KNOWN_NOOP_REASONS.has(r.reason)) {
    return "benign-no-op";
  }

  // Shape 6 — SUCCESS (0036:994-996). No `settled` key — deliberately not checked here.
  const KNOWN_OUTCOMES = new Set(["drafted", "skipped_lane", "noop_existing", "failed"]);
  if (
    (r.status === "completed" || r.status === "failed") &&
    typeof r.outcome === "string" &&
    KNOWN_OUTCOMES.has(r.outcome) &&
    "entry_id" in r &&
    typeof r.tokens_spent === "number" &&
    typeof r.tokens_refunded === "number"
  ) {
    return "settled";
  }

  throw new Error(`settle_autodraft_task returned an unrecognized receipt shape: ${JSON.stringify(receipt)}`);
}

/** Settle the sweep task (idempotent). outcome ∈ drafted|skipped_lane|noop_existing|failed;
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
  outcome: "drafted" | "skipped_lane" | "noop_existing" | "failed",
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

/** Stop the model loop after the FIRST successful draft_journal_entry result (one coding per
 *  task). A REFUSED draft ({ok:false}) does NOT stop — the model may still explain the block. */
function stoppedOnSuccessfulDraft({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some(
    (r) => r.toolName === DRAFT_TOOL && !!r.output && typeof r.output === "object" && (r.output as { ok?: unknown }).ok === true,
  );
}
