// @frozen
//
// FROZEN — part of the claraWork_v1 closure (#623). THE STEP BODIES.
//
// EVERY PARK/RESUME STEP IS chatTurn_v10's, REACHED BY IMPORT — `mintHookTokenStep`,
// `openInterruptionStep`, `markRunningStep`, `closeStreamStep`. Not copied: the shared question
// is ONE mechanism with one durable shape (`clara.open_interruption` + a WDK hook token), and a
// second copy of it is how two lanes come to disagree about what a parked Work is. chatTurn_v17
// established this exact import-don't-copy discipline for the same four bodies.
//
// WHAT IS NEW HERE IS THE WORK LANE'S OWN FOUR: claim (with the bundle manifest), load (the
// task + the admitted Work row), the ToolLoopAgent segment, and the settle. They call
// `clara.claim_work_run` / `clara.settle_work_run`, which chat has no analogue of — an
// accounting Work is not a chat turn and `settle_chat_turn` refuses CLR10 for any other kind.
//
// THE SEGMENT IS THE PROTOTYPE'S SHAPE, WITH THE PROTOTYPE'S SCHEMA THROWN AWAY. The proof
// (docs/plan/active/refresh-2026-09-08-tool-loop-workflow-merge-proof.md) established that an
// AI SDK 7 `ToolLoopAgent` runs correctly INSIDE a WDK `"use step"`, that a scripted
// MockLanguageModelV4 drives it deterministically, and that a stable operation key makes a
// replayed step's tool call return the ORIGINAL receipt. What it did NOT establish, and what
// this file must therefore own, is every accounting boundary: the credential, the authority
// recheck, the period, the chart, the control-account rule, the exact cents. Those are the
// database's, called through exactly one wake wrapper.
//
// A SEGMENT CAN RE-EXECUTE, SO NOTHING HERE DEDUPLICATES IN MEMORY (ARCHITECTURE §5: "一个
// segment 可以重跑, 因此模型结果和副作用不能仅靠内存去重"). The budget ledger is per-attempt and
// deliberately so — it bounds ONE execution of the step. What survives a re-execution is the
// database's own idempotency: the logical operation identity resolves a replayed
// `wake_record_journal_entry` onto the SAME receipt with `replayed:true`, and `claim_work_run`
// and `settle_work_run` are both idempotent by task.
//
// USAGE IS NOT WRITTEN TO `firm_usage_daily` BY THIS CLOSURE, AND THAT IS A STATED LIMIT RATHER
// THAN AN OVERSIGHT. `recordChatUsage` stamps `CHAT_CALL_KIND` and a `chatturn-*` engine id;
// recording an accounting-work run through it would put a false lane label on a real meter, and
// widening that recorder means editing a frozen body. This run's spend is recorded where it is
// true: `clara.accounting_work.result.budget`, written by the settle below.

import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { ModelMessage } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import { pools, resolveModel, type PgExec } from "./chatTurn.v15.infra.js";
import {
  CLARA_WORK_BUDGETS_V1,
  CLARA_WORK_BUNDLE_V1,
  CLARA_WORK_BUNDLE_V1_DIGEST,
  claraWorkRunManifest,
} from "./claraWork.v1.bundle.js";
import { classifyWorkError, workErrorPayload, type WorkErrorClass } from "./claraWork.v1.errors.js";
import {
  ASK_QUESTION_TOOL,
  LIST_ACCOUNTS_TOOL,
  RECORD_JOURNAL_ENTRY_TOOL,
  buildClaraWorkTools,
  newBudgetLedger,
  type JournalBasis,
  type PostedEffect,
  type WorkToolCtx,
} from "./claraWork.v1.tools.js";
import type { ClaraWorkPartAdditions } from "./claraWork.v1.parts.js";

// v10's park/resume bodies, re-exported BY IMPORT (never copied).
export { mintHookTokenStep, openInterruptionStep, markRunningStep, closeStreamStep } from "./chatTurn.v10.impl.js";

/** Everything a claraWork run streams. The two new kinds plus the two carried ones the whole
 *  transcript vocabulary already has (`text` narrates, `refusal` names a typed no). */
export type ClaraWorkPart =
  | ClaraWorkPartAdditions
  | { type: "text"; text: string }
  | { type: "refusal"; code: string; reason?: string; message: string };

export type LoadedWork = {
  workId: string;
  firmId: string;
  clientId: string;
  initiator: string;
  logicalOpId: string;
  basis: JournalBasis;
  basisOrigin: string;
  model: string;
  workStatus: string;
  taskStatus: string;
};

export type SegmentOutcome = {
  parts: ClaraWorkPart[];
  /** The model messages this segment produced, carried into the next one. */
  messages: ModelMessage[];
  question: { toolCallId: string; question: string; context?: string } | null;
  posted: PostedEffect | null;
  terminal: (WorkErrorClass & { kind: WorkErrorClass["kind"] }) | null;
  requiredReadFailed: boolean;
  exhausted: string | null;
  budget: { toolCalls: number; replans: number; transientRetries: number };
  usageTokens: number;
  finishReason: string;
  text: string;
};

// ---------------------------------------------------------------------------
// 1. CLAIM — CAS the task onto THIS run and stamp the bundle manifest.
// ---------------------------------------------------------------------------

/**
 * The `claimRunStep` shape (chatTurn.v10.impl.ts), moved onto the Work lane's own verb so the
 * bundle manifest is written in the SAME transaction that binds the run. C-35's obligation is
 * exactly this pairing: the run id belongs to the durable Work, and an old run's identity must
 * survive rather than be overwritten by a late duplicate start.
 *
 * The model snapshot is READ HERE rather than passed in, because the manifest is
 * `bundle identity + THIS run's model` and reading it inside the claim makes the two facts one
 * transaction instead of two.
 */
export async function claimWorkRunStep(taskId: string): Promise<{ claimed: boolean; model: string; runId: string }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  return pools().withRuntime(async (c: PgExec) => {
    const snap = await c.query("select model_snapshot from clara.agent_tasks where id = $1 and kind = 'accounting_work'", [taskId]);
    if (snap.rowCount === 0) throw new Error(`claraWork_v1: accounting_work task ${taskId} not found`);
    const model = String(snap.rows[0]!.model_snapshot ?? "");
    const r = await c.query("select clara.claim_work_run($1::uuid, $2::text, $3::jsonb) as r", [
      taskId,
      workflowRunId,
      JSON.stringify(claraWorkRunManifest(model)),
    ]);
    const receipt = (r.rows[0]?.r ?? null) as { claimed?: boolean } | null;
    return { claimed: receipt?.claimed === true, model, runId: String(workflowRunId) };
  });
}

// ---------------------------------------------------------------------------
// 2. LOAD — the task binding + the ADMITTED Work row.
// ---------------------------------------------------------------------------

/** The basis the run posts comes from the WORK ROW, never from a model argument and never from
 *  the HTTP request that is long gone. That is what makes `basis_mismatch` a wall rather than a
 *  formality: the echo is compared against a value the run itself read from the database. */
export async function loadWorkStep(taskId: string): Promise<LoadedWork> {
  "use step";
  return pools().withRuntime(async (c: PgExec) => {
    const r = await c.query(
      `select t.status as task_status, t.model_snapshot,
              w.id as work_id, w.firm_id, w.client_id, w.initiator, w.logical_op_id,
              w.basis, w.basis_origin, w.status as work_status
         from clara.agent_tasks t
         join clara.accounting_work w on w.id = t.work_id
        where t.id = $1 and t.kind = 'accounting_work'`,
      [taskId],
    );
    if (r.rowCount === 0) throw new Error(`claraWork_v1: no accounting_work row bound to task ${taskId}`);
    const row = r.rows[0]!;
    return {
      workId: String(row.work_id),
      firmId: String(row.firm_id),
      clientId: String(row.client_id),
      initiator: String(row.initiator),
      logicalOpId: String(row.logical_op_id),
      basis: row.basis as JournalBasis,
      basisOrigin: String(row.basis_origin),
      model: String(row.model_snapshot ?? ""),
      workStatus: String(row.work_status),
      taskStatus: String(row.task_status),
    };
  });
}

// ---------------------------------------------------------------------------
// 3. THE SEGMENT — a ToolLoopAgent inside a "use step".
// ---------------------------------------------------------------------------

type LoopStep = { toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }> };

/** Stop the segment the moment a tool result is TERMINAL: a successful post, a refusal, a
 *  conflict, or a failed required read. This is what makes "a refusal is terminal for the loop"
 *  a mechanism rather than an instruction — the model is never given the next turn in which it
 *  could call the recording tool again with mutated parameters (spec §4). */
export function stoppedOnTerminalWorkTool({ steps }: { steps: ReadonlyArray<LoopStep> }): boolean {
  const last = steps[steps.length - 1];
  if (!last?.toolResults) return false;
  return last.toolResults.some((r) => {
    if (r.toolName !== RECORD_JOURNAL_ENTRY_TOOL && r.toolName !== LIST_ACCOUNTS_TOOL) return false;
    const output = r.output as { ok?: unknown; terminal?: unknown } | null | undefined;
    if (!output || typeof output !== "object") return false;
    return output.ok === true ? r.toolName === RECORD_JOURNAL_ENTRY_TOOL : output.terminal === true;
  });
}

/** The per-run envelope handed to the model as its user turn. The BUNDLE's instructions and
 *  skill are versioned and hashed; THIS is the run's own facts, so it is deliberately not part
 *  of the digest. */
export function workEnvelopeMessage(work: LoadedWork): string {
  return [
    `Work ${work.workId} — record one journal entry for client ${work.clientId}.`,
    `Logical operation identity: ${work.logicalOpId}`,
    `Basis origin: ${work.basisOrigin === "clara_interpreted" ? "interpreted by you from the human's message" : "entered directly by the human"}.`,
    "There is NO source document for this Work.",
    "",
    "The admitted basis, to be echoed verbatim:",
    JSON.stringify(work.basis),
  ].join("\n");
}

function findAskQuestionCall(
  steps: ReadonlyArray<{ content?: ReadonlyArray<{ type?: string; toolName?: string; toolCallId?: string; input?: unknown }> }>,
): { toolCallId: string; question: string; context?: string } | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    for (const part of steps[i]?.content ?? []) {
      if (part.type !== "tool-call" || part.toolName !== ASK_QUESTION_TOOL) continue;
      const input = (part.input ?? {}) as { question?: unknown; context?: unknown };
      const question = typeof input.question === "string" ? input.question.trim() : "";
      if (!question) continue;
      const context = typeof input.context === "string" && input.context.trim() ? input.context.trim() : undefined;
      return { toolCallId: String(part.toolCallId ?? ""), question, context };
    }
  }
  return null;
}

/**
 * ONE segment. The budget ledger is PER ATTEMPT and deliberately so: it bounds one execution of
 * this step, and what survives a WDK re-execution is the database's own idempotency, never a
 * counter in memory (see this file's header).
 *
 * There is no `segment` parameter, and that is a decision rather than an omission: the index
 * would be a step ARGUMENT, and a step's arguments are part of its durable input — passing a
 * number this body does not read would put a value into the run's persisted state that nothing
 * can ever be wrong about but everything must carry. The loop bound lives in the workflow.
 */
export async function runWorkSegmentStep(
  taskId: string,
  work: LoadedWork,
  runId: string,
  priorMessages: ModelMessage[],
): Promise<SegmentOutcome> {
  "use step";
  const ledger = newBudgetLedger();
  const budgets = CLARA_WORK_BUDGETS_V1;
  const ctx: WorkToolCtx = {
    firmId: work.firmId,
    clientId: work.clientId,
    createdBy: work.initiator,
    taskId,
    workId: work.workId,
    logicalOpId: work.logicalOpId,
    runId,
    basis: work.basis,
  };
  const tools = buildClaraWorkTools(ctx, ledger, budgets);
  const messages: ModelMessage[] =
    priorMessages.length > 0
      ? priorMessages
      : ([{ role: "user", content: workEnvelopeMessage(work) }] as unknown as ModelMessage[]);

  // `resolveModel` returns the injected mock in tests and the pinned OpenAI snapshot in
  // production; the SDK's own `LanguageModel` union cannot express "either", exactly as every
  // chat closure since v10 states at its own streamText call.
  const agent = new ToolLoopAgent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(work.model) as any,
    instructions: `${CLARA_WORK_BUNDLE_V1.instructions.text}\n\n${CLARA_WORK_BUNDLE_V1.skills[0]!.text}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [isStepCount(budgets.modelCalls), hasToolCall(ASK_QUESTION_TOOL), stoppedOnTerminalWorkTool],
  });

  let result;
  try {
    result = await agent.generate({ messages });
  } catch (error) {
    const classification = classifyWorkError(error);
    const parts: ClaraWorkPart[] = [
      { type: "refusal", code: classification.code, reason: classification.reason ?? undefined, message: classification.message },
    ];
    await writeParts(parts);
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

  const question = findAskQuestionCall(result.steps as never);
  const parts: ClaraWorkPart[] = [];
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
  await writeParts(parts);

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

/** Write parts onto the run's durable writable. Never throws: a closed or unlockable stream is
 *  a display concern, and the Work's authority is the database row, not the stream. */
async function writeParts(parts: ReadonlyArray<ClaraWorkPart>): Promise<void> {
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

/** Emit ONE observable status onto the stream (§6: a running Work must be observable between
 *  durable reads, and "queued/running" is not a fake percentage). */
export async function emitWorkStatusStep(workId: string, status: string): Promise<void> {
  "use step";
  await writeParts([{ type: "work_status", work_id: workId, status }]);
}

// ---------------------------------------------------------------------------
// 4. CONFIRM — the client-pinned read-back.
// ---------------------------------------------------------------------------

/**
 * Re-read the posted entry through `clara.get_journal_entry_for(p_entry, p_client)` — the
 * CLIENT-PINNED getter, never `clara.get_journal_entry` on the read pool (the 2026-09-09 note on
 * #623: chatTurn_v1's un-pinned call is the census waiver #637 retires, and a NEW successor must
 * not add a second reason to keep it). The read runs OBO the initiator on the read pool.
 *
 * A FAILURE HERE DOES NOT UN-POST ANYTHING and does not change the outcome: the receipt the
 * database returned is the authority, and a run that settled `failed` because a confirming read
 * timed out would be lying about a committed entry. It is recorded as `confirmed:false`.
 */
export async function confirmEntryStep(work: LoadedWork, taskId: string, entryId: string): Promise<{ confirmed: boolean }> {
  "use step";
  try {
    const p = pools();
    const { secret } = await p.mintWakeCredentialObo(work.firmId, work.initiator);
    const entry = await p.withReadWakeScoped(secret, (c: PgExec) =>
      c.query("select clara.get_journal_entry_for($1::uuid, $2::uuid) as e", [entryId, work.clientId]).then((r) => r.rows[0]?.e ?? null),
    );
    return { confirmed: entry != null };
  } catch {
    void taskId;
    return { confirmed: false };
  }
}

// ---------------------------------------------------------------------------
// 5. SETTLE — one idempotent terminal write for the task AND the Work.
// ---------------------------------------------------------------------------

export type SettleArgs = {
  outcome: "completed" | "refused" | "failed" | "cancelled" | "expired";
  errorCode: string | null;
  error: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
};

/** `clara.settle_work_run` maps the outcome onto BOTH the task status set (which has no
 *  `refused` — a refusal lands as task `failed` with error_code 'tool_error') and the Work's own
 *  status set (which does). Idempotent by task: an already-terminal task returns
 *  `{"replayed":true}` rather than raising, so the reconciler and the run can both call it. */
export async function settleWorkStep(taskId: string, args: SettleArgs): Promise<void> {
  "use step";
  await pools().withRuntime((c: PgExec) =>
    c.query("select clara.settle_work_run($1::uuid, $2::text, $3::text, $4::jsonb, $5::jsonb) as r", [
      taskId,
      args.outcome,
      args.errorCode,
      args.error == null ? null : JSON.stringify(args.error),
      args.result == null ? null : JSON.stringify(args.result),
    ]),
  );
}

/** The `result` jsonb a COMPLETED Work carries: the effect plus the recorded budget spend. */
export function completedResult(posted: PostedEffect, confirmed: boolean, budget: SegmentOutcome["budget"], segments: number, tokens: number): Record<string, unknown> {
  return {
    entry_id: posted.entry_id,
    receipt_id: posted.receipt_id,
    revision_token: posted.revision_token,
    logical_op_id: posted.logical_op_id,
    replayed: posted.replayed,
    confirmed,
    bundle_digest: CLARA_WORK_BUNDLE_V1_DIGEST,
    budget: { segments, toolCalls: budget.toolCalls, replans: budget.replans, transientRetries: budget.transientRetries, tokens },
  };
}

export { workErrorPayload };
