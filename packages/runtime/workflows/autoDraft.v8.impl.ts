// @frozen
//
// FROZEN — part of the autoDraft_v8 closure (F-A1 PR-3a; see autoDraft.v8.tools.ts for the one
// statement of what changed and why). A NEW frozen closure beside the byte-untouched
// autoDraft_v1..v7 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export,
// never an in-place edit — the registry repoints `autoDraft:` here).
//
// THIS FILE (impl) — an UNMODIFIED version-rename of v7: every step body
// (claim/recover/model/settle/question/close), classifySettleReceipt's six-shape
// fail-closed classifier, the 6-arity settle call site, consumeAutoDraftModelResult's
// stream-error tagging and the bound-direction user-message clause are byte-identical;
// only import paths and the SYSTEM_PROMPT_AUTODRAFT_V7 -> _V8 identifier moved. F-A1's
// change lives in the prompt/tools/errors modules this file imports (the tools module
// only — prompt/errors are themselves unmodified version-renames too).

import { streamText, stepCountIs } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import type { ModelMessage } from "ai";
import {
  SYSTEM_PROMPT_AUTODRAFT_V8,
  DRAFT_TOOL,
  toAutoDraftOutcome,
  type AutoDraftOutcome,
  type AiContentPart,
  type JeReviewPart,
} from "./autoDraft.v8.prompt.js";
import { pools, resolveModel, type ToolCtx } from "./autoDraft.v8.infra.js";
import { buildAutoDraftTools } from "./autoDraft.v8.tools.js";

export { SYSTEM_PROMPT_AUTODRAFT_V8 };

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
 *  assigned to the thrown Error here is therefore INVISIBLE to autoDraft.v8.ts's top-level
 *  catch, which only ever sees the reconstructed FatalError, not this original object.
 *  refusalFromCaughtError (autoDraft.v8.ts) parses this exact prefix back out. */
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
      // what autoDraft.v8.ts eventually sees.
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
    system: SYSTEM_PROMPT_AUTODRAFT_V8,
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

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function isNonNegativeNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

/** True iff `r`'s OWN enumerable keys are EXACTLY `keys` (same set, same size) — not a
 *  subset check. Codex round 3 named this the missing piece: shape checks that only tested
 *  for PRESENCE of the fields they expected let an object carrying EXTRA, unaccounted-for
 *  fields (or a field with the wrong runtime type smuggled in alongside correct ones) slip
 *  through as if it were a real DB shape. */
function hasExactlyKeys(r: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(r);
  if (actual.length !== keys.length) return false;
  return keys.every((k) => Object.prototype.hasOwnProperty.call(r, k));
}

/** PR #204 fix (Codex round 2, B1 — an IMPLEMENTATION blocker, not a test-guard gap): the
 *  original receipt read failed OPEN. `r.rows[0]?.receipt ?? {}` + `receipt.settled ===
 *  false` means a missing row, NULL, `{}`, or ANY malformed/unrecognized shape all fall
 *  through past that one check silently — the workflow would report "drafted" while the
 *  task stays running and its reservation stays charged forever. Codex verified by
 *  EXECUTION against d404ff9 that the fix cannot be "require settled===true" either: the
 *  DB's own SUCCESS shape carries no `settled` key at all (see shape 3 below).
 *
 *  Codex round 3 (B1, deepened): the round-2 version checked FIELD PRESENCE and coarse type
 *  (e.g. "has a `reason` string in a known set"), which let SHAPE-LIKE malformed objects pass
 *  — `{task_id:null,status:null,replayed:true}`, `{task_id:"t",status:"running",
 *  replayed:true}` (REPLAY does not exist for a non-terminal status), a no-op missing its own
 *  task identity, `{status:"completed",outcome:"failed",...}` (that status/outcome pairing
 *  cannot exist — 'completed' only ever pairs with drafted|skipped_lane|noop_existing), and a
 *  SUCCESS shape missing `task_id` entirely. This version re-derives every shape's EXACT field
 *  set and value-level constraints straight from the SQL a second time — every field the
 *  function genuinely returns, not a convenient subset — and rejects anything with an
 *  unaccounted-for extra field via hasExactlyKeys.
 *
 *  Shape 1 — REPLAY (0036:871-873, reached only via `t.status in ('completed','failed')`):
 *    `{task_id, status, replayed:true}`, EXACTLY these 3 keys. `task_id` a non-empty string
 *    (it is always `p_task`, itself null-checked at function entry). `status` restricted to
 *    'completed'|'failed' — no OTHER task status ever reaches this branch, so a replay
 *    carrying e.g. 'running' cannot be genuine.
 *  Shapes 2-5 — the FOUR named benign no-ops, ALL carrying `settled:false, outcome:
 *    'not_settled', reason:<name>` plus `task_id` (non-empty string) and `status` (a string —
 *    see per-reason restriction below), and NOTHING else except each reason's own extra field:
 *      task_superseded     (0036:899-909) — reached only via `t.status in ('cancelled',
 *        'expired')`; EXACTLY 6 keys, the extra one `released_reservation:boolean`.
 *      registry_superseded (0036:934-939) — reached only via `t.status in ('running',
 *        'cancel_requested')` (the prior guard at 0036:927-929 already excludes every other
 *        status); EXACTLY 5 keys, no extra field.
 *      registry_released   (0036:941-946) — same status restriction as registry_superseded;
 *        EXACTLY 6 keys, the extra one `registry_state`, itself restricted to 'parked'|'idle'
 *        (0011_daily_loop.sql:709's own check constraint — `a.state<>'active'` is the ONLY
 *        way this branch is reached, and 'active'/'parked'/'idle' are the constraint's ENTIRE
 *        domain, so excluding 'active' leaves exactly those two).
 *      run_superseded      (0046 §8) — spliced in immediately after the SAME running-check
 *        anchor registry_superseded's guard sits behind, so the SAME status restriction
 *        applies; EXACTLY 5 keys, structurally identical to registry_superseded (the `reason`
 *        string is the only field that tells the two apart — confirmed against 0046's own
 *        splice text, not assumed).
 *  Shape 6 — SUCCESS (0036:994-996, the function's own final return, reached only after every
 *    guard above passes): `{task_id, status, outcome, entry_id, tokens_spent, tokens_refunded}`,
 *    EXACTLY 6 keys, NO `settled` key at all (Codex's own round-2 finding, re-cited here so a
 *    future reader never "fixes" this by requiring settled===true). `task_id` non-empty
 *    string. The status<->outcome pairing is NOT two independent checks — the SQL computes
 *    status FROM outcome (`case when p_outcome='failed' then 'failed' else 'completed' end`),
 *    so 'completed' can only ever pair with outcome in {drafted, skipped_lane, noop_existing}
 *    and 'failed' can only ever pair with outcome='failed'; a 'completed'+'failed' pairing (or
 *    any other cross) cannot come from this function and must throw. `entry_id`: this file's
 *    own settleAutoDraftStep (below) only ever passes a non-null p_entry when
 *    outcome==='drafted' (runAutoDraftModelStep sets `entryId` to null for every other
 *    outcome) — so within the shapes THIS runtime can genuinely produce, entry_id is a
 *    non-empty string for 'drafted' and null for every other outcome; anything else is
 *    unrecognized. `tokens_spent`/`tokens_refunded`: non-negative numbers (both computed via
 *    `greatest(...,0)` / a failed-outcome zero-floor in the SQL — never negative). */
export function classifySettleReceipt(receipt: unknown): "settled" | "benign-no-op" {
  if (receipt == null || typeof receipt !== "object") {
    throw new Error(`settle_autodraft_task returned an unrecognized receipt (missing row or non-object): ${JSON.stringify(receipt)}`);
  }
  const r = receipt as Record<string, unknown>;

  // Shape 1 — REPLAY (0036:871-873).
  if (
    r.replayed === true &&
    isNonEmptyString(r.task_id) &&
    (r.status === "completed" || r.status === "failed") &&
    hasExactlyKeys(r, ["task_id", "status", "replayed"])
  ) {
    return "settled";
  }

  // Shapes 2-5 — the four named benign no-ops (0036:899-946; 0046 §8's run_superseded).
  // Every reason this function can genuinely produce restricts `status` to the same set the
  // SQL itself restricts it to at the point that reason's branch is reached. A function
  // (not an index signature lookup) keeps this precise under noUncheckedIndexedAccess and
  // avoids the "possibly undefined" trap of indexing a Record by an unnarrowed key.
  const noopStatusesForReason = (reason: unknown): readonly string[] | undefined => {
    if (reason === "task_superseded") return ["cancelled", "expired"];
    if (reason === "registry_superseded" || reason === "registry_released" || reason === "run_superseded") return ["running", "cancel_requested"];
    return undefined;
  };
  const noopStatuses = noopStatusesForReason(r.reason);
  if (
    r.settled === false &&
    r.outcome === "not_settled" &&
    isNonEmptyString(r.task_id) &&
    typeof r.status === "string" &&
    noopStatuses !== undefined &&
    noopStatuses.includes(r.status)
  ) {
    if (r.reason === "task_superseded") {
      if (typeof r.released_reservation === "boolean" && hasExactlyKeys(r, ["task_id", "status", "settled", "outcome", "reason", "released_reservation"])) {
        return "benign-no-op";
      }
    } else if (r.reason === "registry_released") {
      if ((r.registry_state === "parked" || r.registry_state === "idle") && hasExactlyKeys(r, ["task_id", "status", "settled", "outcome", "reason", "registry_state"])) {
        return "benign-no-op";
      }
    } else {
      // registry_superseded | run_superseded — structurally identical, 5 keys, no extra field.
      if (hasExactlyKeys(r, ["task_id", "status", "settled", "outcome", "reason"])) {
        return "benign-no-op";
      }
    }
  }

  // Shape 6 — SUCCESS (0036:994-996). No `settled` key — deliberately not checked here.
  // Same function-not-index-signature reasoning as noopStatusesForReason above: `status`
  // determines the outcome the SQL could have computed it FROM (`case when p_outcome=
  // 'failed' then 'failed' else 'completed' end`), so this is a real correlation, not two
  // independent set-membership checks.
  const successOutcomesForStatus = (status: unknown): readonly string[] | undefined => {
    if (status === "completed") return ["drafted", "skipped_lane", "noop_existing"];
    if (status === "failed") return ["failed"];
    return undefined;
  };
  const successOutcomes = successOutcomesForStatus(r.status);
  if (
    isNonEmptyString(r.task_id) &&
    successOutcomes !== undefined &&
    typeof r.outcome === "string" &&
    successOutcomes.includes(r.outcome) &&
    ((r.outcome === "drafted" && isNonEmptyString(r.entry_id)) || (r.outcome !== "drafted" && r.entry_id === null)) &&
    isNonNegativeNumber(r.tokens_spent) &&
    isNonNegativeNumber(r.tokens_refunded) &&
    hasExactlyKeys(r, ["task_id", "status", "outcome", "entry_id", "tokens_spent", "tokens_refunded"])
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
