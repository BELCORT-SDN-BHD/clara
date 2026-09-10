// @frozen
//
// FROZEN — part of the claraWork_v2 closure (#629). THE STEP BODIES.
//
// SIX OF THE ELEVEN STEPS ARE REACHED BY IMPORT AND NOT RESTATED: `mintHookTokenStep`,
// `markRunningStep`, `closeStreamStep` (chatTurn_v10's, through v1), `loadWorkStep`,
// `emitWorkStatusStep`, `confirmEntryStep` and `settleWorkStep` (v1's). Their behaviour is
// unchanged by this ticket, and a second copy of a park/resume body is how two lanes come to
// disagree about what a parked Work is — claraWork.v1.impl.ts's own header states the discipline
// and this file follows it.
//
// WHAT IS NEW HERE IS THE QUESTION'S OWN THREE, PLUS TWO THAT HAD TO MOVE:
//   openWorkQuestionStep     calls `clara.open_work_question` (0180) instead of
//                            `clara.open_interruption` (0006) — the Work identity, the typed
//                            fields, the reason and the source ref are what that verb adds.
//   emitWorkQuestionStep     writes the `work_question` part onto the run's live stream.
//   recheckAuthorityStep     re-reads the Work, the client and the INITIATOR's CURRENT membership
//                            the moment a resume lands, and settles `refused`/`authority_lost`
//                            when either is gone. "Role loss blocks continuation" (#629).
//   claimWorkRunStepV2       v1's claim, stamping v2's manifest (the digest is the run's claim
//                            about which bundle served it, and it must be v2's).
//   runWorkSegmentStepV2     v1's segment, built on v2's tools and v2's bundle text.
//
// A SEGMENT CAN RE-EXECUTE, SO NOTHING HERE DEDUPLICATES IN MEMORY (ARCHITECTURE §5). What survives
// a WDK re-execution is the database's own idempotency: `clara.open_work_question` replays on the
// hook token, `clara.claim_work_run` and `clara.settle_work_run` are idempotent by task, and the
// logical operation identity resolves a replayed `wake_record_journal_entry` onto the SAME receipt.

import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { ModelMessage } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import { pools, resolveModel, type PgExec } from "./chatTurn.v15.infra.js";
import { classifyWorkError, workErrorPayload, type WorkErrorClass } from "./claraWork.v2.errors.js";
import {
  newBudgetLedger,
  type JournalBasis,
  type PostedEffect,
  type WorkToolCtx,
} from "./claraWork.v1.tools.js";
import {
  closeStreamStep,
  confirmEntryStep,
  emitWorkStatusStep,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  settleWorkStep,
  stoppedOnTerminalWorkTool,
  workEnvelopeMessage,
  type LoadedWork,
  type SettleArgs,
} from "./claraWork.v1.impl.js";
import {
  ASK_QUESTION_TOOL,
  buildClaraWorkToolsV2,
  type AskQuestionInputV2,
} from "./claraWork.v2.tools.js";
import {
  CLARA_WORK_BUDGETS_V2,
  CLARA_WORK_BUNDLE_V2,
  CLARA_WORK_BUNDLE_V2_DIGEST,
  claraWorkRunManifestV2,
} from "./claraWork.v2.bundle.js";
import type { ClaraWorkPartAdditionsV2 } from "./claraWork.v2.parts.js";

// v1's park/resume and lifecycle bodies, re-exported BY IMPORT (never copied).
export {
  closeStreamStep, confirmEntryStep, emitWorkStatusStep, loadWorkStep, markRunningStep,
  mintHookTokenStep, settleWorkStep, workEnvelopeMessage, workErrorPayload,
};
export type { LoadedWork, SettleArgs };

/** Everything a claraWork_v2 run streams. The three v2 kinds plus the two carried ones the whole
 *  transcript vocabulary already has (`text` narrates, `refusal` names a typed no). */
export type ClaraWorkPartV2 =
  | ClaraWorkPartAdditionsV2
  | { type: "text"; text: string }
  | { type: "refusal"; code: string; reason?: string; message: string };

/** The question a v2 segment asked, as the workflow needs it: the tool call to answer, and the
 *  three things `clara.open_work_question` takes. */
export type AskedQuestion = {
  toolCallId: string;
  question: string;
  reason: string;
  context?: string;
  fields: AskQuestionInputV2["fields"];
};

export type SegmentOutcomeV2 = {
  parts: ClaraWorkPartV2[];
  messages: ModelMessage[];
  question: AskedQuestion | null;
  posted: PostedEffect | null;
  terminal: WorkErrorClass | null;
  requiredReadFailed: boolean;
  exhausted: string | null;
  budget: { toolCalls: number; replans: number; transientRetries: number };
  usageTokens: number;
  finishReason: string;
  text: string;
};

// ---------------------------------------------------------------------------
// 1. CLAIM — v1's act, stamping V2's manifest.
// ---------------------------------------------------------------------------

/** v1's `claimWorkRunStep` with one value changed: the manifest is v2's, so
 *  `clara.accounting_work.bundle` records the bundle that actually served the run. The claim is
 *  still the CAS that binds one run to one task, and a duplicate start still self-aborts on it. */
export async function claimWorkRunStepV2(taskId: string): Promise<{ claimed: boolean; model: string; runId: string }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  return pools().withRuntime(async (c: PgExec) => {
    const snap = await c.query("select model_snapshot from clara.agent_tasks where id = $1 and kind = 'accounting_work'", [taskId]);
    if (snap.rowCount === 0) throw new Error(`claraWork_v2: accounting_work task ${taskId} not found`);
    const model = String(snap.rows[0]!.model_snapshot ?? "");
    const r = await c.query("select clara.claim_work_run($1::uuid, $2::text, $3::jsonb) as r", [
      taskId,
      workflowRunId,
      JSON.stringify(claraWorkRunManifestV2(model)),
    ]);
    const receipt = (r.rows[0]?.r ?? null) as { claimed?: boolean } | null;
    return { claimed: receipt?.claimed === true, model, runId: String(workflowRunId) };
  });
}

// ---------------------------------------------------------------------------
// 2. THE SEGMENT — a ToolLoopAgent inside a "use step", on v2's tools.
// ---------------------------------------------------------------------------

/**
 * The `ask_question` call a segment ended on, with the fields it declared.
 *
 * SEARCHED FROM THE LAST STEP BACKWARDS, exactly as v1's private finder does, and it reads the
 * INPUT rather than any tool result: this tool has no `execute`, so there is no result to read.
 * A call whose `question`, `reason` or `fields` did not survive the schema is skipped rather than
 * half-used — the segment then falls through to "neither acted nor asked", which settles the Work
 * honestly instead of parking it on a question no surface can render.
 */
export function findAskQuestionCallV2(
  steps: ReadonlyArray<{ content?: ReadonlyArray<{ type?: string; toolName?: string; toolCallId?: string; input?: unknown }> }>,
): AskedQuestion | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    for (const part of steps[i]?.content ?? []) {
      if (part.type !== "tool-call" || part.toolName !== ASK_QUESTION_TOOL) continue;
      const input = (part.input ?? {}) as { question?: unknown; reason?: unknown; context?: unknown; fields?: unknown };
      const question = typeof input.question === "string" ? input.question.trim() : "";
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      const fields = Array.isArray(input.fields) ? (input.fields as AskQuestionInputV2["fields"]) : [];
      if (!question || !reason || fields.length === 0) continue;
      const context = typeof input.context === "string" && input.context.trim() ? input.context.trim() : undefined;
      return { toolCallId: String(part.toolCallId ?? ""), question, reason, context, fields };
    }
  }
  return null;
}

export async function runWorkSegmentStepV2(
  taskId: string,
  work: LoadedWork,
  runId: string,
  priorMessages: ModelMessage[],
): Promise<SegmentOutcomeV2> {
  "use step";
  const ledger = newBudgetLedger();
  const budgets = CLARA_WORK_BUDGETS_V2;
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
  const tools = buildClaraWorkToolsV2(ctx, ledger, budgets);
  const messages: ModelMessage[] =
    priorMessages.length > 0
      ? priorMessages
      : ([{ role: "user", content: workEnvelopeMessage(work) }] as unknown as ModelMessage[]);

  const agent = new ToolLoopAgent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(work.model) as any,
    instructions: `${CLARA_WORK_BUNDLE_V2.instructions.text}\n\n${CLARA_WORK_BUNDLE_V2.skills[0]!.text}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [isStepCount(budgets.modelCalls), hasToolCall(ASK_QUESTION_TOOL), stoppedOnTerminalWorkTool],
  });

  let result;
  try {
    result = await agent.generate({ messages });
  } catch (error) {
    const classification = classifyWorkError(error);
    const parts: ClaraWorkPartV2[] = [
      { type: "refusal", code: classification.code, reason: classification.reason ?? undefined, message: classification.message },
    ];
    await writePartsV2(parts);
    return {
      parts,
      messages: [],
      question: null,
      posted: ledger.posted,
      terminal: classification,
      requiredReadFailed: ledger.terminal?.kind === "required_read_failed",
      exhausted: ledger.exhausted,
      budget: { toolCalls: ledger.toolCalls, replans: ledger.replans, transientRetries: ledger.transientRetries },
      usageTokens: 0,
      finishReason: "segment_error",
      text: "",
    };
  }

  const question = findAskQuestionCallV2(result.steps as never);
  const parts: ClaraWorkPartV2[] = [];
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
  await writePartsV2(parts);

  const usage = (result.totalUsage ?? {}) as { totalTokens?: number; inputTokens?: number; outputTokens?: number };
  return {
    parts,
    messages: (result.response?.messages ?? []) as ModelMessage[],
    question,
    posted: ledger.posted,
    terminal,
    requiredReadFailed: ledger.terminal?.kind === "required_read_failed",
    exhausted: ledger.exhausted,
    budget: { toolCalls: ledger.toolCalls, replans: ledger.replans, transientRetries: ledger.transientRetries },
    usageTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    finishReason: String(result.finishReason ?? "unknown"),
    text,
  };
}

/** Write parts onto the run's durable writable. Never throws: a closed or unlockable stream is a
 *  display concern, and the Work's authority is the database row, not the stream. */
async function writePartsV2(parts: ReadonlyArray<ClaraWorkPartV2>): Promise<void> {
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
// 3. THE QUESTION — open it durably, then announce it.
// ---------------------------------------------------------------------------

export type OpenedQuestion = {
  questionId: string;
  workId: string;
  questionVersion: number;
  expiresAt: string | null;
};

/**
 * Open the shared question through `clara.open_work_question` (0180).
 *
 * NOT `clara.open_interruption`. That verb takes a bare `question` jsonb and cannot stamp the Work
 * identity, the basis digest, the version or the typed fields — and every one of those is what
 * makes a question answerable from a surface that has never heard of this run. The two verbs share
 * one linearisation and one table; the run picks the one that matches what it is asking.
 *
 * IDEMPOTENT ON THE HOOK TOKEN, which is what makes this step safe to re-execute: a WDK replay of
 * this step returns the ORIGINAL question rather than opening a second one, and the token was
 * minted by a step of its own so a replay mints the same one.
 */
export async function openWorkQuestionStep(
  taskId: string,
  hookToken: string,
  asked: { question: string; reason: string; context?: string; fields: AskQuestionInputV2["fields"] },
): Promise<OpenedQuestion> {
  "use step";
  return pools().withRuntime(async (c: PgExec) => {
    const r = await c.query(
      "select clara.open_work_question($1::uuid, $2::text, $3::jsonb, $4::jsonb, $5::text, $6::jsonb) as r",
      [
        taskId,
        hookToken,
        JSON.stringify({ type: "clarify", question: asked.question, context: asked.context ?? null, framing: "work_question" }),
        JSON.stringify(asked.fields),
        asked.reason,
        null,
      ],
    );
    const out = (r.rows[0]?.r ?? {}) as { question_id?: string; work_id?: string; question_version?: number; expires_at?: string };
    return {
      questionId: String(out.question_id ?? ""),
      workId: String(out.work_id ?? ""),
      questionVersion: Number(out.question_version ?? 1),
      expiresAt: out.expires_at ?? null,
    };
  });
}

/** Announce the question on the run's LIVE stream. Identifiers only — every surface re-reads
 *  `clara.get_work_question` for the content, which is the whole point of the shared record. */
export async function emitWorkQuestionStep(opened: OpenedQuestion, clientId: string): Promise<void> {
  "use step";
  await writePartsV2([
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
// 4. THE AUTHORITY RECHECK — "role loss blocks continuation".
// ---------------------------------------------------------------------------

export type AuthorityVerdict = { ok: true } | { ok: false; reason: string; message: string };

/**
 * Re-read the Work, its client and the INITIATOR's CURRENT membership the moment a resume lands.
 *
 * WHY IT IS A SEPARATE STEP AND NOT PART OF THE COMMIT'S OWN RECHECK. `clara._record_journal_entry_
 * core` (0178) already rechecks the initiator's live role and the client's status AT COMMIT, and
 * that belt stays — it is the structural one. But a Work can park for days, and a run that resumes,
 * spends a model segment, calls the chart read and only THEN discovers the human who asked for it
 * was deactivated has burnt a segment and told the human nothing useful. This step refuses first,
 * with a typed, NON-RECOVERABLE reason: `authority_lost` is not something a Retry can fix, because
 * the retry would run under the same absent authority.
 *
 * IT READS THROUGH A DOOR, and that is measured rather than stylistic: `clara_runtime` holds NO
 * select on `clara.firm_memberships` and NO execute on `clara.role_rank(text)`, so this question
 * cannot be asked from the runtime's own role at all. `clara.work_authority_snapshot` (0180) is one
 * definer read granted to one role, answering exactly this and nothing else.
 */
export async function recheckAuthorityStep(taskId: string): Promise<AuthorityVerdict> {
  "use step";
  return pools().withRuntime(async (c: PgExec) => {
    const r = await c.query("select clara.work_authority_snapshot($1::uuid) as s", [taskId]);
    const snap = (r.rows[0]?.s ?? null) as null | {
      work_status?: string;
      client_status?: string;
      initiator_authorised?: boolean;
      initiator_active?: boolean;
      initiator_role?: string | null;
    };
    if (snap === null) {
      return { ok: false, reason: "work_unreadable", message: "This Work could not be re-read after the answer arrived. Nothing was posted." };
    }
    if (snap.initiator_active !== true) {
      return { ok: false, reason: "authority_lost", message: "The person who asked for this Work is no longer an active member of the firm, so it cannot continue. Nothing was posted." };
    }
    if (snap.initiator_authorised !== true) {
      return { ok: false, reason: "authority_lost", message: `The person who asked for this Work no longer holds the role needed to post it (${snap.initiator_role ?? "unknown"}). Nothing was posted.` };
    }
    if (snap.client_status !== "active") {
      return { ok: false, reason: "client_inactive", message: "This client is no longer active, so this Work cannot continue. Nothing was posted." };
    }
    return { ok: true };
  });
}

/** The `result` jsonb a COMPLETED v2 Work carries: the effect plus the recorded budget spend. */
export function completedResultV2(
  posted: PostedEffect,
  confirmed: boolean,
  budget: SegmentOutcomeV2["budget"],
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
    bundle_digest: CLARA_WORK_BUNDLE_V2_DIGEST,
    budget: { segments, toolCalls: budget.toolCalls, replans: budget.replans, transientRetries: budget.transientRetries, tokens },
  };
}
