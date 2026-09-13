// @frozen
//
// FROZEN — part of the claraWork_v3 closure (#631). THE STEP BODIES.
//
// MOST OF THE ELEVEN STEPS ARE REACHED BY IMPORT AND NOT RESTATED — `mintHookTokenStep`,
// `markRunningStep`, `closeStreamStep`, `loadWorkStep`, `confirmEntryStep` (v1's, and it already
// reads through the CLIENT-PINNED `clara.get_journal_entry_for`, never the bare
// `clara.get_journal_entry` migration 0009 retired from the agent lane), and
// `openWorkQuestionStep` (v2's). A second copy of a park/resume body is how two lanes come to
// disagree about what a parked Work is, and claraWork.v1.impl.ts's own header states the
// discipline.
//
// WHAT IS NEW HERE IS THE DISPATCH AND THE TRACE, PLUS THE FOUR THAT HAD TO MOVE:
//   runWorkSegmentStepV3   v2's segment with the EGRESS DISPATCH in front of the model call and a
//                          trace row at each of its three moments. The prepare/consume pair is the
//                          wiki-projection precedent (lib/wiki-projection.mjs:484-505) applied to
//                          the Work lane: prepare the intent, read everything the turn needs, then
//                          CONSUME immediately before `agent.generate`. A revocation committed
//                          before the consume refuses and the model is never called.
//   claimWorkRunStepV3     v1's claim stamping v3's manifest, plus the `dispatch` trace row — the
//                          first durable diagnostic of the run, written before anything is spent.
//   emitWorkStatusStepV3   v1's status part, carrying `client_id` (#738).
//   recheckAuthorityStepV3 v2's recheck, reading `responsible` / `initiated_by` from
//                          `clara.work_authority_snapshot` rather than the aliased `initiator_*`
//                          keys (#737), so a Work that was TAKEN OVER says whose authority it is
//                          running under.
//   settleWorkStepV3       v1's settle plus the `settle` trace row — THE ONE ROW WRITTEN INSIDE
//                          the settle's own call path rather than beside it.
//
// DEADLOCK DISCIPLINE (ARCHITECTURE §6, 0184). Every trace row except the settle row is written on
// the runtime pool OUTSIDE any posting transaction, and the writer takes no lock on
// `clara.accounting_work` or `clara.agent_tasks` beyond the FK key-share its own insert needs. The
// lock order accounting_work → agent_tasks → agent_interruptions is untouched by this closure.
//
// A TRACE NEVER DECIDES ANYTHING. Every `recordTrace` call here is wrapped: a Work that failed to
// post because its diagnostic row would not write would be the diagnostic deciding the accounting.
// The dispatch, by contrast, is NOT wrapped — a dispatch that cannot be decided is a refusal.
//
// A SEGMENT CAN RE-EXECUTE, SO NOTHING HERE DEDUPLICATES IN MEMORY (ARCHITECTURE §5). What survives
// a WDK re-execution is the database's own idempotency: `clara.record_work_execution_trace` replays
// on `(work, run, seq)`, `clara.open_work_question` replays on the hook token,
// `clara.claim_work_run` and `clara.settle_work_run` are idempotent by task, and the logical
// operation identity resolves a replayed `wake_record_journal_entry` onto the SAME receipt.

import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { ModelMessage } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import { pools, resolveModel, type PgExec } from "./chatTurn.v15.infra.js";
import { classifyWorkError, egressRefusalPayload, workErrorPayload, type WorkErrorClass } from "./claraWork.v3.errors.js";
import {
  newBudgetLedger,
  type JournalBasis,
  type PostedEffect,
  type WorkToolCtx,
} from "./claraWork.v1.tools.js";
import {
  closeStreamStep,
  confirmEntryStep,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  stoppedOnTerminalWorkTool,
  workEnvelopeMessage,
  type LoadedWork,
  type SettleArgs,
} from "./claraWork.v1.impl.js";
import { openWorkQuestionStep, type OpenedQuestion } from "./claraWork.v2.impl.js";
import {
  ASK_QUESTION_TOOL,
  buildClaraWorkToolsV3,
  type AskQuestionInputV3,
} from "./claraWork.v3.tools.js";
import {
  CLARA_WORK_BUDGETS_V3,
  CLARA_WORK_BUNDLE_V3,
  CLARA_WORK_BUNDLE_V3_DIGEST,
  claraWorkBundleIdentityV3,
  claraWorkRunManifestV3,
} from "./claraWork.v3.bundle.js";
import type { ClaraWorkPartAdditionsV3 } from "./claraWork.v3.parts.js";

// v1's/v2's park, resume and lifecycle bodies, re-exported BY IMPORT (never copied).
export {
  closeStreamStep, confirmEntryStep, loadWorkStep, markRunningStep, mintHookTokenStep,
  openWorkQuestionStep, workEnvelopeMessage, workErrorPayload, egressRefusalPayload,
};
export type { LoadedWork, OpenedQuestion, SettleArgs };

/** Everything a claraWork_v3 run streams. The three v3 kinds plus the two carried ones the whole
 *  transcript vocabulary already has (`text` narrates, `refusal` names a typed no). */
export type ClaraWorkPartV3 =
  | ClaraWorkPartAdditionsV3
  | { type: "text"; text: string }
  | { type: "refusal"; code: string; reason?: string; message: string };

/** The question a v3 segment asked, as the workflow needs it. */
export type AskedQuestion = {
  toolCallId: string;
  question: string;
  reason: string;
  context?: string;
  sourceRef?: AskQuestionInputV3["source_ref"];
  fields: AskQuestionInputV3["fields"];
};

export type SegmentOutcomeV3 = {
  parts: ClaraWorkPartV3[];
  messages: ModelMessage[];
  question: AskedQuestion | null;
  posted: PostedEffect | null;
  terminal: WorkErrorClass | null;
  requiredReadFailed: boolean;
  exhausted: string | null;
  /** TRUE when the dispatch itself was refused: no model was called and none will be. */
  egressRefused: boolean;
  budget: { toolCalls: number; replans: number; transientRetries: number };
  usageTokens: number;
  finishReason: string;
  text: string;
};

// ---------------------------------------------------------------------------
// 0. THE TRACE — one helper, wrapped, used by every step that records one.
// ---------------------------------------------------------------------------

/** Write ONE trace row and never throw. `lib/work-trace.mjs` throws on a database refusal so its
 *  own positive-control battery can see the closed-vocabulary wall; every caller in a FROZEN body
 *  swallows it, because a diagnostic may not decide an accounting outcome. */
async function traceSafely(exec: PgExec, row: Record<string, unknown>): Promise<void> {
  try {
    const { recordTrace } = await import("../lib/work-trace.mjs");
    // The module is untyped .mjs; the row is built by `traceRow` above and validated AGAIN by the
    // database's own closed vocabularies, which is where a wrong field is actually caught.
    const write = recordTrace as unknown as (e: unknown, r: Record<string, unknown>) => Promise<unknown>;
    await write(exec, row);
  } catch {
    /* a diagnostic row is not authority; the Work's record is the database row it posted */
  }
}

/**
 * ONE trace row: this closure's bundle identity, then whatever the call site adds.
 *
 * IT MERGES BY LOOP RATHER THAN BY SPREAD, and that is measured rather than fussy: the
 * parts-parity census walks every frozen workflow file and REFUSES an object spread it cannot
 * classify (check-parts-parity.mjs:320), because a spread is exactly how an unreviewed type
 * discriminant reaches a transcript part without anyone seeing it. claraWork.v2.errors.ts's own
 * header states the same rule for the same reason.
 */
function traceRow(model: string | null, row: Record<string, unknown>): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV3();
  const out: Record<string, unknown> = {
    bundleId: identity.id,
    bundleDigest: identity.digest,
    instructionsId: identity.instructions,
    skills: identity.skills,
    toolsId: identity.tools,
    modelId: model,
  };
  for (const [key, value] of Object.entries(row)) out[key] = value;
  return out;
}

// ---------------------------------------------------------------------------
// 1. CLAIM — v1's act, stamping V3's manifest, and the run's FIRST trace row.
// ---------------------------------------------------------------------------

export async function claimWorkRunStepV3(taskId: string): Promise<{ claimed: boolean; model: string; runId: string }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  return pools().withRuntime(async (c: PgExec) => {
    const snap = await c.query("select model_snapshot from clara.agent_tasks where id = $1 and kind = 'accounting_work'", [taskId]);
    if (snap.rowCount === 0) throw new Error(`claraWork_v3: accounting_work task ${taskId} not found`);
    const model = String(snap.rows[0]!.model_snapshot ?? "");
    const r = await c.query("select clara.claim_work_run($1::uuid, $2::text, $3::jsonb) as r", [
      taskId,
      workflowRunId,
      JSON.stringify(claraWorkRunManifestV3(model)),
    ]);
    const receipt = (r.rows[0]?.r ?? null) as { claimed?: boolean } | null;
    const claimed = receipt?.claimed === true;
    if (claimed) {
      // SEQ 1 IS ALWAYS THE DISPATCH ROW. It is written before a single token is spent, so a run
      // that dies in its first segment still leaves a durable record of what it was dispatched to
      // do and under which bundle — C88.12's "minimum durable diagnostic event", at the earliest
      // moment there is anything true to say.
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

/** The `ask_question` call a segment ended on, searched from the last step backwards exactly as
 *  v1's and v2's private finders do, reading the INPUT (this tool has no `execute`). */
export function findAskQuestionCallV3(
  steps: ReadonlyArray<{ content?: ReadonlyArray<{ type?: string; toolName?: string; toolCallId?: string; input?: unknown }> }>,
): AskedQuestion | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    for (const part of steps[i]?.content ?? []) {
      if (part.type !== "tool-call" || part.toolName !== ASK_QUESTION_TOOL) continue;
      const input = (part.input ?? {}) as {
        question?: unknown; reason?: unknown; context?: unknown; source_ref?: unknown; fields?: unknown;
      };
      const question = typeof input.question === "string" ? input.question.trim() : "";
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      const fields = Array.isArray(input.fields) ? (input.fields as AskQuestionInputV3["fields"]) : [];
      if (!question || !reason || fields.length === 0) continue;
      const context = typeof input.context === "string" && input.context.trim() ? input.context.trim() : undefined;
      const raw = input.source_ref;
      const sourceRef =
        raw !== null && typeof raw === "object" && typeof (raw as { kind?: unknown }).kind === "string"
          ? (raw as AskQuestionInputV3["source_ref"])
          : undefined;
      return { toolCallId: String(part.toolCallId ?? ""), question, reason, context, sourceRef, fields };
    }
  }
  return null;
}

/**
 * THE EGRESS DISPATCH. Prepare the intent through the TASK-BOUND wrapper, then consume it in its
 * own committed transaction immediately before the model call.
 *
 * THE RUNTIME CHOOSES NOTHING. `clara.prepare_work_egress_dispatch` resolves task → work →
 * firm/client positively and derives the event seq from `clara._work_egress_event_seq(work, run)`;
 * this function presents back exactly what it was handed. A cached, injected or misassociated
 * authorization cannot be spent on a different client's dispatch because the DATABASE re-verifies
 * the whole intent, not because this function keeps the id in the right variable (0020 ratchet
 * R1-F1).
 *
 * EXPLICIT BEGIN/COMMIT around the consume, mirroring `lib/wiki-projection.mjs`'s own helper: a
 * PostgreSQL function cannot commit its caller's transaction, so `granted` must MEAN committed for
 * any caller. On a failure the transaction is rolled back and the error propagates — no silent
 * `unknown` that would look like an ordinary refusal.
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
    return {
      granted: consumed?.verdict === "granted",
      authorizationId: prepared.authorization_id,
    };
  } catch (error) {
    await c.query("rollback").catch(() => {});
    throw error;
  }
}

export async function runWorkSegmentStepV3(
  taskId: string,
  work: LoadedWork,
  runId: string,
  segmentIndex: number,
  priorMessages: ModelMessage[],
): Promise<SegmentOutcomeV3> {
  "use step";
  const ledger = newBudgetLedger();
  const budgets = CLARA_WORK_BUDGETS_V3;
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
  const tools = buildClaraWorkToolsV3(ctx, ledger, budgets);
  const messages: ModelMessage[] =
    priorMessages.length > 0
      ? priorMessages
      : ([{ role: "user", content: workEnvelopeMessage(work) }] as unknown as ModelMessage[]);

  // Every segment's rows share a base: seq 1 is the claim's dispatch row, so a segment's own rows
  // start at 2 and advance three per segment (dispatch decision, model call, tool call).
  const baseSeq = 2 + segmentIndex * 3;
  // Object.assign rather than an object spread, for the reason traceRow above states.
  const empty = (over: Partial<SegmentOutcomeV3>): SegmentOutcomeV3 =>
    Object.assign({
      parts: [] as ClaraWorkPartV3[], messages: [] as ModelMessage[], question: null,
      posted: null, terminal: null, requiredReadFailed: false, exhausted: null,
      egressRefused: false,
      budget: { toolCalls: 0, replans: 0, transientRetries: 0 },
      usageTokens: 0, finishReason: "unknown", text: "",
    } as SegmentOutcomeV3, over);

  // ---- THE DISPATCH, BEFORE ANY TOKEN IS SPENT ------------------------------------------
  const dispatchStarted = new Date().toISOString();
  let authorizationId: string | null = null;
  let granted = false;
  try {
    const verdict = await pools().withRuntime((c: PgExec) => dispatchEgress(c, taskId, runId));
    granted = verdict.granted;
    authorizationId = verdict.authorizationId;
  } catch {
    // A dispatch that could not be DECIDED is a refusal, never an assumption of consent.
    granted = false;
  }
  await pools().withRuntime((c: PgExec) =>
    traceSafely(c, traceRow(work.model, {
      taskId, runId, seq: baseSeq, phase: "dispatch",
      capabilityId: "accounting_work.model_segment",
      authorizationId,
      startedAt: dispatchStarted, endedAt: new Date().toISOString(),
      outcome: granted ? "ok" : "refused",
      refusal: granted ? null : { reason: "egress_not_authorized" },
    })));
  if (!granted) {
    const refusal = egressRefusalPayload();
    const parts: ClaraWorkPartV3[] = [{
      type: "refusal",
      code: String(refusal.code),
      reason: String(refusal.reason),
      message: String(refusal.message),
    }];
    await writePartsV3(parts);
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
    instructions: `${CLARA_WORK_BUNDLE_V3.instructions.text}\n\n${CLARA_WORK_BUNDLE_V3.skills[0]!.text}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [isStepCount(budgets.modelCalls), hasToolCall(ASK_QUESTION_TOOL), stoppedOnTerminalWorkTool],
  });

  const modelStarted = new Date().toISOString();
  let result;
  try {
    result = await agent.generate({ messages });
  } catch (error) {
    const classification = classifyWorkError(error);
    const parts: ClaraWorkPartV3[] = [
      { type: "refusal", code: classification.code, reason: classification.reason ?? undefined, message: classification.message },
    ];
    await writePartsV3(parts);
    await pools().withRuntime((c: PgExec) =>
      traceSafely(c, traceRow(work.model, {
        taskId, runId, seq: baseSeq + 1, phase: "model_call",
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

  const question = findAskQuestionCallV3(result.steps as never);
  const parts: ClaraWorkPartV3[] = [];
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
  await writePartsV3(parts);

  const usage = (result.totalUsage ?? {}) as { totalTokens?: number; inputTokens?: number; outputTokens?: number };
  const usageTokens = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const modelEnded = new Date().toISOString();

  // WRAPPED WHOLE, for the reason traceSafely is wrapped: the digest helper and the vocabulary
  // filter live in the same module the writer does, and a module that would not load must not be
  // able to fail a segment that has already posted.
  await pools().withRuntime(async (c: PgExec) => {
    try {
    const { traceDigest, observedRevisions } = await import("../lib/work-trace.mjs");
    // THE INPUT DIGEST IS OVER THE ENVELOPE, REDACTED FIRST. A digest of the raw transcript would
    // be a perfect oracle for anyone holding a candidate secret; see lib/work-trace.mjs.
    const inputDigest = await traceDigest({ basis: work.basis, segment: segmentIndex, messages: messages.length });
    await traceSafely(c, traceRow(work.model, {
      taskId, runId, seq: baseSeq + 1, phase: "model_call",
      capabilityId: "accounting_work.model_segment",
      authorizationId,
      inputDigest,
      observed: observedRevisions({ basis_digest: null }),
      startedAt: modelStarted, endedAt: modelEnded,
      outcome: "ok",
    }));
    // THE TOOL CALL, when one acted. The capability is named from the server-owned registry, never
    // from the model's own tool name, so a roster that drifted would be visible in the trace.
    if (ledger.posted || terminal || question) {
      await traceSafely(c, traceRow(work.model, {
        taskId, runId, seq: baseSeq + 2, phase: "tool_call",
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

/** Write parts onto the run's durable writable. Never throws: a closed or unlockable stream is a
 *  display concern, and the Work's authority is the database row, not the stream. */
async function writePartsV3(parts: ReadonlyArray<ClaraWorkPartV3>): Promise<void> {
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

// ---------------------------------------------------------------------------
// 3. THE STATUS AND THE QUESTION — both now carrying the client.
// ---------------------------------------------------------------------------

/** v1's status part, PLUS `client_id` (#738). Never throws. */
export async function emitWorkStatusStepV3(workId: string, clientId: string, status: string): Promise<void> {
  "use step";
  await writePartsV3([{ type: "work_status", work_id: workId, client_id: clientId, status }]);
}

/** Announce the question on the run's LIVE stream. Identifiers only — every surface re-reads
 *  `clara.get_work_question` for the content, which is the whole point of the shared record. */
export async function emitWorkQuestionStepV3(opened: OpenedQuestion, clientId: string): Promise<void> {
  "use step";
  await writePartsV3([
    {
      type: "work_question",
      work_id: opened.workId,
      client_id: clientId,
      question_id: opened.questionId,
      question_version: opened.questionVersion,
      status: "pending",
    },
  ]);
}

// ---------------------------------------------------------------------------
// 4. THE AUTHORITY RECHECK — "role loss blocks continuation", reading the #630 keys.
// ---------------------------------------------------------------------------

export type AuthorityVerdict = { ok: true } | { ok: false; reason: string; message: string };

/**
 * v2's recheck, reading `responsible` and `initiated_by` (0184's own keys) rather than the aliased
 * `initiator_*` ones.
 *
 * WHY THE ALIAS MATTERS (#737). `clara.work_authority_snapshot` carries BOTH: `initiated_by` is
 * who ADMITTED the Work and `responsible` is who it is now executed AS — they differ after a
 * takeover, and `taken_over` says so. The `initiator_*` keys describe the RESPONSIBLE human, which
 * is correct, but a refusal message built from them cannot tell a reader that the person who asked
 * for the Work and the person whose authority it is running under are two different people. That
 * is precisely the case where an authority refusal is confusing, so v3 names them.
 *
 * IT READS THROUGH A DOOR, and that is measured rather than stylistic: `clara_runtime` holds NO
 * select on `clara.firm_memberships` and NO execute on `clara.role_rank(text)`.
 */
export async function recheckAuthorityStepV3(taskId: string): Promise<AuthorityVerdict> {
  "use step";
  return pools().withRuntime(async (c: PgExec) => {
    const r = await c.query("select clara.work_authority_snapshot($1::uuid) as s", [taskId]);
    const snap = (r.rows[0]?.s ?? null) as null | {
      work_status?: string;
      client_status?: string;
      initiator_authorised?: boolean;
      initiator_active?: boolean;
      initiator_role?: string | null;
      responsible?: string | null;
      initiated_by?: string | null;
      taken_over?: boolean;
    };
    if (snap === null) {
      return { ok: false as const, reason: "work_unreadable", message: "This Work could not be re-read after the answer arrived. Nothing was posted." };
    }
    const handed = snap.taken_over === true && snap.responsible !== snap.initiated_by;
    const who = handed ? "The colleague this Work was handed to" : "The person who asked for this Work";
    if (snap.initiator_active !== true) {
      return { ok: false as const, reason: "authority_lost", message: `${who} is no longer an active member of the firm, so it cannot continue. Nothing was posted.` };
    }
    if (snap.initiator_authorised !== true) {
      return { ok: false as const, reason: "authority_lost", message: `${who} no longer holds the role needed to post it (${snap.initiator_role ?? "unknown"}). Nothing was posted.` };
    }
    if (snap.client_status !== "active") {
      return { ok: false as const, reason: "client_inactive", message: "This client is no longer active, so this Work cannot continue. Nothing was posted." };
    }
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// 5. SETTLE — v1's idempotent terminal write, plus the run's LAST trace row.
// ---------------------------------------------------------------------------

export async function settleWorkStepV3(
  taskId: string,
  runId: string,
  seq: number,
  args: SettleArgs,
): Promise<void> {
  "use step";
  const settledAt = new Date().toISOString();
  await pools().withRuntime(async (c: PgExec) => {
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
    await traceSafely(c, traceRow(null, {
      taskId, runId, seq, phase: "settle",
      capabilityId: "accounting_work.settle",
      outcome,
      refusal: args.error ?? null,
      receiptId: (args.result as { receipt_id?: string } | null)?.receipt_id ?? null,
      // BOTH INSTANTS, FROM ONE CLOCK. A row that supplied only an end instant would be compared
      // against the DATABASE's now() for its start, and a settle whose JS clock trails the
      // server's by a millisecond then violates ck_work_execution_traces_ended and the row is
      // silently dropped by traceSafely. Measured on the rig: the settle row was absent from every
      // completed run in tests/work-egress-e2e.mjs's first cut.
      startedAt: settledAt,
      endedAt: settledAt,
    }));
  });
}

/** The `result` jsonb a COMPLETED v3 Work carries: the effect plus the recorded budget spend. */
export function completedResultV3(
  posted: PostedEffect,
  confirmed: boolean,
  budget: SegmentOutcomeV3["budget"],
  segments: number,
  tokens: number,
): Record<string, unknown> {
  return {
    entry_id: posted.entry_id,
    receipt_id: posted.receipt_id,
    revision_token: posted.revision_token,
    logical_op_id: posted.logical_op_id,
    replayed: posted.replayed,
    confirmed,
    bundle_digest: CLARA_WORK_BUNDLE_V3_DIGEST,
    budget: { segments, toolCalls: budget.toolCalls, replans: budget.replans, transientRetries: budget.transientRetries, tokens },
  };
}
