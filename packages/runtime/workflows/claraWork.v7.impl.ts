// @frozen
//
// FROZEN — part of the claraWork_v7 closure. THE STEP BODIES.
//
// THIS IS v6's MODULE WITH FOUR BODIES MINTED AND EVERY OTHER ONE REACHED BY IMPORT, which is the
// narrower of the two shapes a cut can take and the one §2.1 of `CUT-PLAN.md` states: copy whole
// ONLY what changes, re-export every unchanged predecessor symbol rather than duplicating it, so
// the closure hash-locks the old text once. A second copy of a park/resume body is how two lanes
// come to disagree about what a parked Work is.
//
// THE FOUR, AND WHY EACH ONE CANNOT BE REACHED BY IMPORT:
//
//   1. `claimWorkRunStepV7` stores `claraWorkRunManifestV7` on the Work row.
//   2. `runWorkSegmentStepV7` instructs the model with `CLARA_WORK_BUNDLE_V7`'s text and hands the
//      segment `buildClaraWorkToolsV7`, whose posting tool sends `CLARA_WORK_BUNDLE_V7_DIGEST`.
//   3. `settleWorkStepV7` writes the run's last trace row under this closure's identity, and
//      `completedResultV7` stamps `bundle_digest`.
//   4. `loadFaProposalInputsStepV7` is THE ONE BEHAVIOURAL CHANGE OF THIS CUT — see §6 below.
//
// That is what a version cut IS on this lane: `tests/pinned-work-bundle.mjs` compares
// `work.bundle.id`, `work.bundle.digest`, `operation_receipts.bundle_digest` and
// `work_execution_traces.bundle_id` against the PINNED version's own bundle module, so a v7 run
// stamped with v6's identity is a run whose receipt names a contract it was not served under.
//
// EVERYTHING ELSE IS v6's, BY IMPORT: the Work load, the knowledge read and its terminal, the
// drift read and its replan, the egress refusal payload, the chart read, the read-back confirm,
// the park/resume, the authority recheck, the #639 particulars pair, the question finder, #1030's
// source-correction probe and its question, and "success is decided by a receipt, never by a
// stream ending" (ARCHITECTURE §6).

import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { ModelMessage } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import { pools, readScoped, resolveModel, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import { classifyWorkError, egressRefusalPayload, type WorkErrorClass } from "./claraWork.v7.errors.js";
import {
  newBudgetLedger,
  type JournalBasis,
  type PostedEffect,
  type WorkToolCtx,
} from "./claraWork.v1.tools.js";
import {
  stoppedOnTerminalWorkTool,
  workEnvelopeMessage,
  type LoadedWork,
  type SettleArgs,
} from "./claraWork.v1.impl.js";
import { ASK_QUESTION_TOOL } from "./claraWork.v1.prompt.js";
import { ANSWER_ACCRUAL_TERM_TOOL, ASK_KNOWLEDGE_CONFLICT_TOOL } from "./claraWork.v4.prompt.js";
import { ANSWER_PREPAYMENT_TERM_TOOL } from "./claraWork.v6.schemas.js";
import {
  findQuestionCallV6,
  segmentTraceBase,
  type ClaraWorkPartV6,
  type PendingFixedAssetV4,
  type SegmentOutcomeV6,
  type WorkKnowledgeV6,
} from "./claraWork.v6.impl.js";
import { buildClaraWorkToolsV7 } from "./claraWork.v7.tools.js";
import {
  CLARA_WORK_BUDGETS_V7,
  CLARA_WORK_BUNDLE_V7,
  CLARA_WORK_BUNDLE_V7_DIGEST,
  claraWorkBundleIdentityV7,
  claraWorkRunManifestV7,
} from "./claraWork.v7.bundle.js";
import { CAPABILITY_REGISTRY_VERSION_V2, purposeForV2 } from "../lib/capability-registry-v2.mjs";
import { boundedRevisionNumber, boundedRunId } from "../lib/work-trace-bounds.mjs";
import {
  deriveFaParticularsProposal,
  type FaProposalInputs,
  type FaProposalSibling,
} from "../lib/fa-particulars-proposal.js";
// #1090 AND #1092's GROUNDS, FROM THE LANE'S OWN MODULE. `lib/fa-proposal-grounds.ts` is not in
// the frozen manifest today; importing it from this frozen file HASH-LOCKS it, and from here on a
// hardening of either statement goes through the NEXT version closure
// (`packages/runtime/README.md`, the owner ruling of 2026-09-15). That is a deliberate buy: the
// statements are the db battery's own subject, driven under a real `clara_agent_ro` credential,
// and keeping them as exported constants gives each statement ONE home rather than a copy here.
import {
  FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL,
  FA_RETIRED_ACCOUNT_POLICY_SQL,
  mapDepreciationKnowledgeRows,
  mapRetiredAccountPolicyRow,
  type DepreciationPolicyKnowledgeRow,
  type RetiredAccountPolicyRow,
} from "../lib/fa-proposal-grounds.js";

// v1's/v2's/v3's/v4's/v6's park, resume, lifecycle, knowledge, drift and particulars bodies,
// re-exported BY IMPORT (never copied). A run journalled under v6 resumes on identical step
// identities for every one of them.
export {
  closeStreamStep, confirmEntryStep, loadWorkStep, markRunningStep, mintHookTokenStep,
  openWorkQuestionStep, workEnvelopeMessage, workErrorPayload, egressRefusalPayload,
  emitWorkQuestionStepV3, emitWorkStatusStepV3, recheckAuthorityStepV3,
  applyParticularsStepV4, findQuestionCallV4, loadPendingFixedAssetStepV4, particularsQuestionV4,
  knowledgeReadFailedV6, loadWorkKnowledgeStepV6, readKnowledgeDriftStepV6, driftNoteV6,
  driftSpendsReplanV6, loadSourceCorrectionBriefStepV6, sourceCorrectionQuestionV6,
  sourceCorrectionConfirmedV6, prepaymentTermContextV6, findQuestionCallV6, particularsQuestionV6,
  faProposalFromInputsV6, knowledgeReadFailedPayload,
  CLAIM_TRACE_SEQ, KNOWLEDGE_TRACE_SEQ, SEGMENT_TRACE_ROWS, FIRST_SEGMENT_TRACE_SEQ,
  segmentTraceBase,
} from "./claraWork.v6.impl.js";
export type {
  LoadedWork, OpenedQuestion, SettleArgs, AuthorityVerdict, PendingFixedAssetV4,
  ClaraWorkPartV6, AskedQuestionV4, AskedQuestionV6, SegmentOutcomeV6, WorkKnowledgeV6,
  WorkDriftV6, SourceCorrectionBriefV6, SourceCorrectionProbeV6,
} from "./claraWork.v6.impl.js";
export { SOURCE_CORRECTION_CONFIRM_FIELDS } from "./claraWork.v6.impl.js";

/** Everything a claraWork_v7 run streams. THE SAME KINDS v6 declares, by reference — v7 adds no
 *  wire kind at all, so `claraWork.v3.parts.ts` stays the declarer and `check-parts-parity.mjs`
 *  needs no new file in its set. */
export type ClaraWorkPartV7 = ClaraWorkPartV6;

/** v6's segment outcome, by reference: v7's segment answers the same shape. */
export type SegmentOutcomeV7 = SegmentOutcomeV6;

/** THE SETTLE'S TRACE SEQ — the first number past the last possible segment. v6's number, and it
 *  is the same number: the budgets did not move at this cut, so re-deriving it here would be a
 *  second thing that can be wrong about one constant. */
export { SETTLE_TRACE_SEQ } from "./claraWork.v6.impl.js";

// ---------------------------------------------------------------------------
// 0. THE TRACE SCHEME — v6's numbers, and the #847 writer-side bounds, restated because the
//    identity a row carries is this closure's.
// ---------------------------------------------------------------------------

/**
 * RIDER #847, HALF ONE — every NUMERIC observed revision passes 0210's own numeric clause before
 * it is sent. A refused number DROPS ITS KEY rather than failing the row; a NON-number is passed
 * through UNTOUCHED, because a string revision is the `rev` grammar's business and bounding it
 * here would make the writer tighter than the door.
 */
function boundedObserved(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number") {
      const bounded = boundedRevisionNumber(value);
      if (bounded === null) continue;
      out[key] = bounded;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Write ONE trace row and never throw. `lib/work-trace.mjs` throws on a database refusal so its own
 * positive-control battery can see the closed-vocabulary wall; every caller in a FROZEN body
 * swallows it, because a diagnostic may not decide an accounting outcome.
 *
 * RIDER #847, HALF TWO. The run id passes 0210's long-digit clause first, and a REFUSED one skips
 * the row entirely — cheaper than a round trip, and inside the settle's transaction it is safer.
 */
async function traceSafely(exec: PgExec, row: Record<string, unknown>): Promise<void> {
  if (typeof row.runId === "string" && boundedRunId(row.runId) === null) return;
  try {
    const { recordTrace } = await import("../lib/work-trace.mjs");
    const write = recordTrace as unknown as (e: unknown, r: Record<string, unknown>) => Promise<unknown>;
    await write(exec, row);
  } catch {
    /* a diagnostic row is not authority; the Work's record is the database row it posted */
  }
}

/**
 * The same write, INSIDE a caller's open transaction, behind a SAVEPOINT.
 *
 * WHY THE SAVEPOINT IS THE WHOLE POINT. `traceSafely` swallows a refusal, and inside a transaction
 * swallowing is not enough: a failed statement poisons the transaction, so the caller's COMMIT
 * would become a ROLLBACK and the SETTLE would be lost — the diagnostic deciding the accounting,
 * in the one place where it would decide it silently.
 */
async function traceSafelyInTransaction(exec: PgExec, row: Record<string, unknown>): Promise<void> {
  if (typeof row.runId === "string" && boundedRunId(row.runId) === null) return;
  try {
    await exec.query("savepoint clara_work_trace");
  } catch {
    return;
  }
  try {
    const { recordTrace } = await import("../lib/work-trace.mjs");
    const write = recordTrace as unknown as (e: unknown, r: Record<string, unknown>) => Promise<unknown>;
    await write(exec, row);
    await exec.query("release savepoint clara_work_trace");
  } catch {
    await exec.query("rollback to savepoint clara_work_trace").catch(() => {});
  }
}

/**
 * ONE trace row: this closure's bundle identity, the v2 registry and its purpose, then whatever the
 * call site adds.
 *
 * IT MERGES BY LOOP RATHER THAN BY SPREAD, and that is measured rather than fussy: the
 * parts-parity census walks every module under packages/runtime and REFUSES an object spread it
 * cannot classify, because a spread is exactly how an unreviewed type discriminant reaches a
 * transcript part without anyone seeing it.
 */
function traceRow(model: string | null, row: Record<string, unknown>): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV7();
  const capabilityId = typeof row.capabilityId === "string" ? row.capabilityId : null;
  const out: Record<string, unknown> = {
    bundleId: identity.id,
    bundleDigest: identity.digest,
    instructionsId: identity.instructions,
    skills: identity.skills,
    toolsId: identity.tools,
    modelId: model,
    registryVersion: CAPABILITY_REGISTRY_VERSION_V2,
    // NAMED EXPLICITLY, never defaulted. `recordTrace` reads its default from v1's `capability()`,
    // which answers null for the later ids — and a null purpose on a model-bound row is the field
    // an auditor most needs.
    purpose: capabilityId === null ? null : purposeForV2(capabilityId),
  };
  for (const [key, value] of Object.entries(row)) {
    if (key === "observed") {
      out.observed = boundedObserved((value ?? {}) as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. CLAIM — v1's act, stamping V7's manifest, and the run's FIRST trace row.
// ---------------------------------------------------------------------------

export async function claimWorkRunStepV7(taskId: string): Promise<{ claimed: boolean; model: string; runId: string }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  return pools().withRuntime(async (c: PgExec) => {
    const snap = await c.query("select model_snapshot from clara.agent_tasks where id = $1 and kind = 'accounting_work'", [taskId]);
    if (snap.rowCount === 0) throw new Error(`claraWork_v7: accounting_work task ${taskId} not found`);
    const model = String(snap.rows[0]!.model_snapshot ?? "");
    const r = await c.query("select clara.claim_work_run($1::uuid, $2::text, $3::jsonb) as r", [
      taskId,
      workflowRunId,
      JSON.stringify(claraWorkRunManifestV7(model)),
    ]);
    const receipt = (r.rows[0]?.r ?? null) as { claimed?: boolean } | null;
    const claimed = receipt?.claimed === true;
    if (claimed) {
      // SEQ 1 IS ALWAYS THE DISPATCH ROW. It is written before a single token is spent, so a run
      // that dies in its first segment still leaves a durable record of what it was dispatched to
      // do and under which bundle.
      await traceSafely(c, traceRow(model, {
        taskId, runId: String(workflowRunId), seq: 1, phase: "dispatch",
        capabilityId: "accounting_work.model_segment",
        outcome: "ok",
      }));
    }
    return { claimed, model, runId: String(workflowRunId) };
  });
}

// ---------------------------------------------------------------------------
// 2. THE SEGMENT — the egress dispatch, then a ToolLoopAgent, then the trace rows.
// ---------------------------------------------------------------------------

/**
 * THE EGRESS DISPATCH. Prepare the intent through the TASK-BOUND wrapper, then consume it in its
 * own committed transaction immediately before the model call. Byte-carried from v3/v4/v6, whose
 * headers carry the full argument: the runtime chooses nothing, the DATABASE re-verifies the whole
 * intent, and a dispatch that could not be DECIDED is a refusal rather than an assumption of
 * consent.
 */
async function dispatchEgress(
  c: PgExec,
  taskId: string,
  runId: string,
): Promise<{ granted: boolean; authorizationId: string | null }> {
  const prepared = await c
    .query("select clara.prepare_work_egress_dispatch($1::uuid, $2::text) as v", [taskId, runId])
    .then((r) => (r.rows[0]?.v ?? null) as null | {
      verdict?: string; authorization_id?: string; firm_id?: string; client_id?: string;
      purpose?: string; event_seq?: string; event_type?: string;
    });
  if (prepared?.verdict !== "granted" || !prepared.authorization_id) {
    return { granted: false, authorizationId: null };
  }
  await c.query("begin");
  try {
    const consumed = await c
      .query("select clara.consume_egress_dispatch($1::uuid,$2::uuid,$3::uuid,$4::text,$5::bigint,$6::text,$7::text) as v", [
        prepared.firm_id,
        prepared.authorization_id,
        prepared.client_id,
        prepared.purpose,
        prepared.event_seq,
        prepared.event_type,
        null,
      ])
      .then((r) => (r.rows[0]?.v ?? null) as null | { verdict?: string });
    await c.query("commit");
    return { granted: consumed?.verdict === "granted", authorizationId: prepared.authorization_id };
  } catch (error) {
    await c.query("rollback").catch(() => {});
    throw error;
  }
}

/** Write parts onto the run's durable writable. Never throws: a closed or unlockable stream is a
 *  display concern, and the Work's authority is the database row, not the stream. */
async function writePartsV7(parts: ReadonlyArray<ClaraWorkPartV7>): Promise<void> {
  if (parts.length === 0) return;
  try {
    const writer = getWritable<unknown>().getWriter();
    try {
      for (const part of parts) await writer.write(part);
    } finally {
      writer.releaseLock();
    }
  } catch {
    /* the stream is closed or not lockable — the durable row still carries the truth */
  }
}

export async function runWorkSegmentStepV7(
  taskId: string,
  work: LoadedWork,
  runId: string,
  segmentIndex: number,
  priorMessages: ModelMessage[],
  knowledgeVersion: string | null,
): Promise<SegmentOutcomeV7> {
  "use step";
  const ledger = newBudgetLedger();
  const budgets = CLARA_WORK_BUDGETS_V7;
  const ctx: WorkToolCtx = {
    firmId: work.firmId,
    clientId: work.clientId,
    createdBy: work.initiator,
    taskId,
    workId: work.workId,
    logicalOpId: work.logicalOpId,
    runId,
    basis: work.basis as JournalBasis,
  };
  const tools = buildClaraWorkToolsV7(ctx, ledger, budgets);
  const messages: ModelMessage[] =
    priorMessages.length > 0
      ? priorMessages
      : ([{ role: "user", content: workEnvelopeMessage(work) }] as unknown as ModelMessage[]);

  // v6's four-row block. `+0` is the drift row the BODY writes before this segment when a resume
  // preceded it; the three below are this step's own.
  const baseSeq = segmentTraceBase(segmentIndex);
  // Object.assign rather than an object spread, for the reason traceRow above states.
  const empty = (over: Partial<SegmentOutcomeV7>): SegmentOutcomeV7 =>
    Object.assign({
      parts: [] as ClaraWorkPartV7[], messages: [] as ModelMessage[], question: null,
      posted: null, terminal: null, requiredReadFailed: false, exhausted: null,
      egressRefused: false,
      budget: { toolCalls: 0, replans: 0, transientRetries: 0 },
      usageTokens: 0, finishReason: "unknown", text: "",
    } as SegmentOutcomeV7, over);

  // ---- THE DISPATCH, BEFORE ANY TOKEN IS SPENT ------------------------------------------
  const dispatchStarted = new Date().toISOString();
  let authorizationId: string | null = null;
  let granted = false;
  try {
    const verdict = await pools().withRuntime((c: PgExec) => dispatchEgress(c, taskId, runId));
    granted = verdict.granted;
    authorizationId = verdict.authorizationId;
  } catch {
    granted = false;
  }
  await pools().withRuntime((c: PgExec) =>
    traceSafely(c, traceRow(work.model, {
      taskId, runId, seq: baseSeq + 1, phase: "dispatch",
      capabilityId: "accounting_work.model_segment",
      authorizationId,
      startedAt: dispatchStarted, endedAt: new Date().toISOString(),
      outcome: granted ? "ok" : "refused",
      refusal: granted ? null : { reason: "egress_not_authorized" },
    })));
  if (!granted) {
    const refusal = egressRefusalPayload();
    const parts: ClaraWorkPartV7[] = [{
      type: "refusal",
      code: String(refusal.code),
      reason: String(refusal.reason),
      message: String(refusal.message),
    }];
    await writePartsV7(parts);
    return empty({
      parts,
      egressRefused: true,
      terminal: {
        kind: "refusal",
        code: String(refusal.code),
        reason: String(refusal.reason),
        message: String(refusal.message),
        terminal: true,
        recoverable: true,
      },
      finishReason: "egress_not_authorized",
    });
  }

  // ---- THE MODEL CALL --------------------------------------------------------------------
  const agent = new ToolLoopAgent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(work.model) as any,
    instructions: `${CLARA_WORK_BUNDLE_V7.instructions.text}\n\n${CLARA_WORK_BUNDLE_V7.skills[0]!.text}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    // THE FOUR INSPECTION READS ARE NOT STOP CONDITIONS, AND THAT IS THE POINT OF THEM. A run reads
    // a record IN ORDER to keep going — it looks the fact up, then records the entry or asks a
    // question. Stopping the loop on an inspection read would make the tool useless: the segment
    // would end with a read and no act, and the body would settle `no_effect` on a run that was
    // doing exactly what it was told to do.
    stopWhen: [
      isStepCount(budgets.modelCalls),
      hasToolCall(ASK_QUESTION_TOOL),
      hasToolCall(ANSWER_ACCRUAL_TERM_TOOL),
      hasToolCall(ASK_KNOWLEDGE_CONFLICT_TOOL),
      hasToolCall(ANSWER_PREPAYMENT_TERM_TOOL),
      stoppedOnTerminalWorkTool,
    ],
  });

  const modelStarted = new Date().toISOString();
  let result;
  try {
    result = await agent.generate({ messages });
  } catch (error) {
    const classification = classifyWorkError(error);
    const parts: ClaraWorkPartV7[] = [
      { type: "refusal", code: classification.code, reason: classification.reason ?? undefined, message: classification.message },
    ];
    await writePartsV7(parts);
    await pools().withRuntime((c: PgExec) =>
      traceSafely(c, traceRow(work.model, {
        taskId, runId, seq: baseSeq + 2, phase: "model_call",
        capabilityId: "accounting_work.model_segment",
        authorizationId,
        startedAt: modelStarted, endedAt: new Date().toISOString(),
        outcome: "failed",
        refusal: { code: classification.code, reason: classification.reason, message: classification.message },
      })));
    return empty({
      parts,
      posted: ledger.posted,
      terminal: classification,
      requiredReadFailed: ledger.terminal?.kind === "required_read_failed",
      exhausted: ledger.exhausted,
      budget: { toolCalls: ledger.toolCalls, replans: ledger.replans, transientRetries: ledger.transientRetries },
      finishReason: "segment_error",
    });
  }

  const question = findQuestionCallV6(result.steps as never);
  const parts: ClaraWorkPartV7[] = [];
  const text = String(result.text ?? "").trim();
  if (text) parts.push({ type: "text", text });
  if (ledger.posted) {
    parts.push({
      type: "work_result",
      work_id: work.workId,
      client_id: work.clientId,
      entry_id: ledger.posted.entry_id,
      receipt_id: ledger.posted.receipt_id,
    });
  }
  let terminal: WorkErrorClass | null = null;
  if (ledger.terminal && (ledger.terminal.kind === "refusal" || ledger.terminal.kind === "conflict" || ledger.terminal.kind === "required_read_failed")) {
    terminal = ledger.terminal.detail as WorkErrorClass;
    parts.push({ type: "refusal", code: terminal.code, reason: terminal.reason ?? undefined, message: terminal.message });
  }
  await writePartsV7(parts);

  const usage = (result.totalUsage ?? {}) as { totalTokens?: number; inputTokens?: number; outputTokens?: number };
  const usageTokens = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const modelEnded = new Date().toISOString();

  // WRAPPED WHOLE, for the reason traceSafely is wrapped: the digest helper and the vocabulary
  // filter live in the same module the writer does, and a module that would not load must not be
  // able to fail a segment that has already posted.
  await pools().withRuntime(async (c: PgExec) => {
    try {
      const { traceDigest, observedRevisions } = await import("../lib/work-trace.mjs");
      const inputDigest = await traceDigest({ basis: work.basis, segment: segmentIndex, messages: messages.length });
      await traceSafely(c, traceRow(work.model, {
        taskId, runId, seq: baseSeq + 2, phase: "model_call",
        capabilityId: "accounting_work.model_segment",
        authorizationId,
        inputDigest,
        observed: observedRevisions({ knowledge_version: knowledgeVersion, basis_digest: null }),
        startedAt: modelStarted, endedAt: modelEnded,
        outcome: "ok",
      }));
      if (ledger.posted || terminal || question) {
        await traceSafely(c, traceRow(work.model, {
          taskId, runId, seq: baseSeq + 3, phase: "tool_call",
          // NAMED FROM THE SERVER-OWNED REGISTRY, never from the model's own tool name. The
          // inspection reads do not appear here: this row records the segment's TERMINAL act —
          // what it posted, refused or asked — and an inspection read is never terminal.
          capabilityId: question
            ? "accounting_work.ask_question"
            : "accounting_work.record_journal_entry",
          authorizationId,
          startedAt: modelStarted, endedAt: modelEnded,
          outcome: ledger.posted ? "ok" : terminal ? "refused" : "skipped",
          refusal: terminal ? { code: terminal.code, reason: terminal.reason, message: terminal.message } : null,
          receiptId: ledger.posted ? ledger.posted.receipt_id : null,
        }));
      }
    } catch {
      /* a diagnostic row is not authority */
    }
  });

  return {
    parts,
    messages: (result.response?.messages ?? []) as ModelMessage[],
    question,
    posted: ledger.posted,
    terminal,
    requiredReadFailed: ledger.terminal?.kind === "required_read_failed",
    exhausted: ledger.exhausted,
    egressRefused: false,
    budget: { toolCalls: ledger.toolCalls, replans: ledger.replans, transientRetries: ledger.transientRetries },
    usageTokens,
    finishReason: String(result.finishReason ?? "unknown"),
    text,
  };
}

// ---------------------------------------------------------------------------
// 3. SETTLE — v1's idempotent terminal write, plus the run's LAST trace row.
// ---------------------------------------------------------------------------

export async function settleWorkStepV7(
  taskId: string,
  runId: string,
  seq: number,
  args: SettleArgs,
): Promise<void> {
  "use step";
  const settledAt = new Date().toISOString();
  await pools().withRuntime(async (c: PgExec) => {
    // ONE TRANSACTION FOR THE SETTLE AND ITS TRACE ROW, with the trace write in a SAVEPOINT so a
    // refused diagnostic can never roll the settle back. v3's, v4's and v6's shape and reason.
    await c.query("begin");
    try {
      await c.query("select clara.settle_work_run($1::uuid, $2::text, $3::text, $4::jsonb, $5::jsonb) as r", [
        taskId,
        args.outcome,
        args.errorCode,
        args.error == null ? null : JSON.stringify(args.error),
        args.result == null ? null : JSON.stringify(args.result),
      ]);
      const outcome =
        args.outcome === "completed" ? "ok"
          : args.outcome === "refused" ? "refused"
            : args.outcome === "cancelled" ? "cancelled"
              : args.outcome === "expired" ? "cancelled"
                : "failed";
      await traceSafelyInTransaction(c, traceRow(null, {
        taskId, runId, seq, phase: "settle",
        capabilityId: "accounting_work.settle",
        outcome,
        refusal: args.error ?? null,
        receiptId: (args.result as { receipt_id?: string } | null)?.receipt_id ?? null,
        // BOTH INSTANTS, FROM ONE CLOCK — v3's measured fix: a row that supplied only an end
        // instant is compared against the DATABASE's now() for its start, and a settle whose JS
        // clock trails the server's by a millisecond then violates
        // ck_work_execution_traces_ended and the row is silently dropped.
        startedAt: settledAt,
        endedAt: settledAt,
      }));
      await c.query("commit");
    } catch (error) {
      await c.query("rollback").catch(() => {});
      throw error;
    }
  });
}

/** The `result` jsonb a COMPLETED v7 Work carries. v6's shape, with THIS closure's digest. */
export function completedResultV7(
  posted: PostedEffect,
  confirmed: boolean,
  budget: SegmentOutcomeV7["budget"],
  segments: number,
  tokens: number,
  particulars: Record<string, unknown> | null,
  knowledge: WorkKnowledgeV6 | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    entry_id: posted.entry_id,
    receipt_id: posted.receipt_id,
    revision_token: posted.revision_token,
    logical_op_id: posted.logical_op_id,
    replayed: posted.replayed,
    confirmed,
    bundle_digest: CLARA_WORK_BUNDLE_V7_DIGEST,
    budget: { segments, toolCalls: budget.toolCalls, replans: budget.replans, transientRetries: budget.transientRetries, tokens },
  };
  // An ABSENT key rather than a null one: a Work that acquired no fixed asset has nothing to say
  // about particulars, and `"fixed_asset_particulars": null` on every ordinary journal Work would
  // read as "they are missing" on the one surface that renders this object.
  if (particulars !== null) out.fixed_asset_particulars = particulars;
  if (knowledge !== null) {
    out.knowledge = {
      status: knowledge.face_status,
      knowledge_version: knowledge.knowledge_version,
      as_of: knowledge.as_of,
      records_shown: knowledge.records_shown,
      truncated: knowledge.truncated,
      read_seq: knowledge.read_seq,
      recorded: knowledge.recorded,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. THE ONE BEHAVIOURAL CHANGE OF THIS CUT — the dependent-particulars PROPOSAL's inputs.
//
// The consolidated contract is `docs/plan/active/riders-2026-09-20/reports/waveS-lane05-fix.md`
// § "Successor contract, the proposal input-loading step", which supersedes #1090's, #1092's and
// #1093's ticket reports where they overlap. THREE THINGS MOVE:
//
//   (a) `particulars_complete` becomes the ESTATE'S OWN six-condition predicate. v6's step carries
//       a two-condition form, under which a row with a method and a start date but no useful life
//       reads COMPLETE — and the question that would have collected the missing drivers is
//       SKIPPED. The six conditions here are `clara._fa_particulars_complete`'s own, read live
//       from `pg_proc` on the lane database, and `loadPendingFixedAssetStepV4` uses the same form.
//   (b) THE CLIENT'S RECORDED DEPRECIATION NOTE joins the inputs (#1090). Migration 0345
//       catalogues the `depreciation_policy` knowledge key.
//   (c) THE ACCOUNT'S RETIRED POLICY joins them (#1092). Migration 0346 gives `clara_agent_ro` a
//       firm-scoped SELECT on `clara.fa_account_depreciation_policies`.
//
// AND ONE SENTENCE OF v6's IS NOT CARRIED, because this wave made it false: v6's OMITTED comment
// said `clara.knowledge_keys` catalogues no depreciation key and the retired-policy relation is
// unreachable from this credential. 0345 catalogues it and 0346 reaches it.
//
// WHAT THIS STEP STILL DOES NOT DO, and it must not be assumed: it reads the relations DIRECTLY and
// therefore leaves NO work-knowledge-read receipt, so `clara.work_knowledge_drift` will not see
// this reliance. That is measured rather than chosen lightly — `clara_agent_ro` holds EXECUTE on
// neither `clara.retrieve_knowledge` nor `clara.record_work_knowledge_read` (cell `dk.09`). If the
// drift trail is wanted for this ground, the step must run under `clara_runtime` instead, which is
// a different credential with a different wall and a decision of its own.
// ---------------------------------------------------------------------------

/**
 * The inputs the derivation needs, read under v4's OWN credential.
 *
 * IT NEVER THROWS, and that posture is v4's and v6's for the same read: a register the run cannot
 * read is not a reason to withhold a question. A failed read yields `null`, the question opens
 * without a block, and every surface renders today's empty form.
 */
export async function loadFaProposalInputsStepV7(
  work: LoadedWork,
  pending: PendingFixedAssetV4,
): Promise<FaProposalInputs | null> {
  "use step";
  const ctx: ToolCtx = { firmId: work.firmId, clientId: work.clientId, createdBy: work.initiator, taskId: "" };
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      // (a) THIS asset's own account, acquisition date and completeness. `::text` IS LOAD-BEARING:
      //     without it node-postgres maps a Postgres `date` onto a JS `Date` at LOCAL midnight,
      //     whose UTC spelling under Asia/Kuala_Lumpur is the day BEFORE — and every depreciation
      //     charge from then on would be computed from a date one day early. The derivation
      //     refuses a `Date` by name, so a forgotten cast is a loud failure rather than a wrong
      //     date; the cast is what makes it never happen.
      //
      //     THE COMPLETENESS PREDICATE IS THE ESTATE'S OWN SIX CONDITIONS (SPEC-1093-A). See this
      //     section's header for what the narrow form skips.
      const own = await c.query(
        `select fa.asset_account_code,
                fa.acquired_date::text as acquired_date,
                (fa.depreciation_start_date is not null
                 and fa.depreciation_method is not null
                 and (fa.depreciation_method = 'none'
                      or (fa.depreciation_method = 'straight_line'
                          and fa.useful_life_months is not null and fa.residual_cents is not null)
                      or (fa.depreciation_method = 'reducing_balance'
                          and fa.useful_life_months is not null and fa.residual_cents is not null
                          and fa.depreciation_rate_bps is not null))) as particulars_complete
           from clara.fixed_assets fa
          where fa.client_id = $1::uuid and fa.id = $2::uuid`,
        [work.clientId, pending.assetId],
      );
      const row = (own.rows[0] ?? null) as Record<string, unknown> | null;
      if (!row) return null;
      const assetAccount = row.asset_account_code == null ? null : String(row.asset_account_code);

      // (b) the account's OTHER completed, live rows. `residual_cents` is NOT selected: the
      //     proposal's residual is the firm's nil default by the owner's #932 decision and is never
      //     read off a ground, so carrying it would only invite a half-adoption.
      //
      //     A NULL ACCOUNT NARROWS EVERY GROUND, and that is the derivation's own rule rather than
      //     an accident: with `$3` null this statement yields nothing, because `= null` is never
      //     true, and a row on no account grounds only on inputs that are also on no account.
      const siblingRows = await c.query(
        `select fa.asset_account_code, fa.depreciation_method, fa.useful_life_months,
                fa.depreciation_rate_bps
           from clara.fixed_assets fa
          where fa.client_id = $1::uuid
            and fa.asset_account_code = $3::text
            and fa.id <> $2::uuid
            and fa.superseded_at is null
            and fa.status in ('active','pending')
            and fa.depreciation_method is not null
            and fa.depreciation_start_date is not null
          order by fa.created_at desc
          limit 50`,
        [work.clientId, pending.assetId, assetAccount],
      );
      const siblings: FaProposalSibling[] = [];
      for (const sibling of siblingRows.rows as Record<string, unknown>[]) {
        siblings.push({
          assetAccount: sibling.asset_account_code == null ? null : String(sibling.asset_account_code),
          particularsComplete: true,
          method: sibling.depreciation_method == null ? null : String(sibling.depreciation_method),
          usefulLifeMonths: sibling.useful_life_months == null ? null : Number(sibling.useful_life_months),
          rateBps: sibling.depreciation_rate_bps == null ? null : Number(sibling.depreciation_rate_bps),
        });
      }

      // (c) THE CLIENT'S RECORDED DEPRECIATION NOTE (#1090). `$2` is the calendar day the proposal
      //     is made for; `null` means today in MYT, computed in the statement itself. The run
      //     carries no as-of of its own, so it passes null rather than inventing one — and the
      //     statement drops a note whose effective window is CLOSED, which is why there is no
      //     `state = 'live'`-only form here.
      const knowledgeRows = await c.query(FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, [work.clientId, null]);
      const knowledge = mapDepreciationKnowledgeRows(
        knowledgeRows.rows as DepreciationPolicyKnowledgeRow[]);

      // (d) THE ACCOUNT'S RETIRED POLICY (#1092). `$2` is the row's own account, which (a) already
      //     selected — and A NULL ACCOUNT HAS NO POLICY, so the read is not attempted at all: a
      //     statement that cannot be scoped must not be run.
      const retiredPolicy = assetAccount === null ? null : mapRetiredAccountPolicyRow(
        ((await c.query(FA_RETIRED_ACCOUNT_POLICY_SQL, [work.clientId, assetAccount]))
          .rows[0] as RetiredAccountPolicyRow) ?? null);

      return {
        asset: {
          assetId: pending.assetId,
          description: pending.description,
          costCents: pending.costCents,
          nonDepreciable: pending.nonDepreciable,
          particularsComplete: row.particulars_complete === true,
          assetAccount,
          acquiredDate: row.acquired_date == null ? null : String(row.acquired_date),
        },
        siblings,
        knowledge,
        retiredPolicy,
      };
    });
  } catch {
    return null;
  }
}

/** The derivation itself, from inputs the step above read. It is PURE and it cannot fail: every
 *  input is optional, and an absent ground produces a narrower proposal rather than an error. */
export function faProposalFromInputsV7(inputs: FaProposalInputs | null) {
  if (inputs === null) return null;
  try {
    return deriveFaParticularsProposal(inputs);
  } catch {
    // The derivation REFUSES a `Date` by name (see step (a)). A throw here is this closure's own
    // wiring mistake, and the honest answer to it is the question v5 already opened.
    return null;
  }
}
