// @frozen
//
// FROZEN — part of the claraWork_v4 closure. THE STEP BODIES.
//
// MOST OF THE STEPS ARE REACHED BY IMPORT AND NOT RESTATED — `mintHookTokenStep`,
// `markRunningStep`, `closeStreamStep`, `loadWorkStep`, `confirmEntryStep` (v1's, and it already
// reads through the CLIENT-PINNED `clara.get_journal_entry_for`), `openWorkQuestionStep` (v2's),
// and `emitWorkStatusStepV3` / `emitWorkQuestionStepV3` / `recheckAuthorityStepV3` (v3's). A second
// copy of a park/resume body is how two lanes come to disagree about what a parked Work is, and
// claraWork.v1.impl.ts's own header states the discipline.
//
// WHAT IS NEW HERE IS THE KNOWLEDGE CONTEXT AND THE #639 PARTICULARS PAIR, PLUS THE THREE THAT HAD
// TO MOVE BECAUSE THEY CARRY v4's BUNDLE IDENTITY:
//   loadWorkKnowledgeStepV4      reads `clara.get_knowledge_pack` once, before the loop, through
//                                the non-frozen `lib/knowledge-conflicts.mjs`. It NEVER throws and
//                                never returns null: an unreadable pack renders as "unavailable"
//                                and the run carries on, because a Work's authority is its
//                                ADMITTED BASIS and a context read is not allowed to decide the
//                                accounting. Its `knowledge_version` rides into every segment's
//                                model_call trace row (#654 stanza (a)).
//   loadPendingFixedAssetStepV4  after a commit, asks whether THIS entry birthed a fixed-asset
//                                register row whose depreciation particulars are still absent.
//   applyParticularsStepV4       writes the answered particulars through
//                                `clara.complete_fixed_asset_particulars_for`. It posts NO journal
//                                — 0216's tail T.9 asserts the door's body contains no
//                                `journal_entries` reference at all.
//   claimWorkRunStepV4           v1's claim, stamping V4's manifest, plus the `dispatch` trace row.
//   runWorkSegmentStepV4         v3's segment on v4's tools and v4's bundle text, with the
//                                knowledge block in the opening message and `knowledge_version` in
//                                the trace.
//   settleWorkStepV4             v1's settle plus the `settle` trace row, inside one transaction.
//
// THE TRACE SCHEME IS v3's, UNCHANGED, AND THAT IS DELIBERATE. seq 1 is the claim's dispatch row, a
// segment owns three rows from `2 + index * 3`, and the settle takes the first number past the last
// possible segment. The knowledge read and the particulars pair write NO trace rows of their own:
// `clara.record_work_execution_trace` names its capability from the SERVER-OWNED registry
// (`lib/capability-registry.mjs`), that registry is `deployed: true` and therefore immutable, and
// inventing a seq outside the scheme would collide with a re-executed segment's own row. What the
// knowledge read contributes is the `observed` revision on the row that already exists, which is
// exactly what #654's stanza asks for.
//
// DEADLOCK DISCIPLINE (ARCHITECTURE §6, 0184), carried from v3: every trace row except the settle
// row is written on the runtime pool OUTSIDE any posting transaction, and the insert takes NO lock
// on `clara.accounting_work`. The lock order accounting_work → agent_tasks → agent_interruptions is
// untouched by this closure.
//
// A SEGMENT CAN RE-EXECUTE, SO NOTHING HERE DEDUPLICATES IN MEMORY (ARCHITECTURE §5). What survives
// a WDK re-execution is the database's own idempotency: `clara.record_work_execution_trace` replays
// on `(work, run, seq)`, `clara.open_work_question` replays on the hook token,
// `clara.claim_work_run` and `clara.settle_work_run` are idempotent by task, the logical operation
// identity resolves a replayed `wake_record_journal_entry` onto the SAME receipt, and
// `clara.complete_fixed_asset_particulars_for` is op-keyed through `clara._reserve_op` on a key
// derived from the Work and the asset — so a re-executed apply returns the first answer rather than
// writing twice.

import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { ModelMessage } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import { pools, readScoped, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import { resolveModel } from "./chatTurn.v15.infra.js";
import { classifyWorkError, egressRefusalPayload, workErrorPayload, type WorkErrorClass } from "./claraWork.v4.errors.js";
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
  emitWorkQuestionStepV3,
  emitWorkStatusStepV3,
  recheckAuthorityStepV3,
  type AuthorityVerdict,
} from "./claraWork.v3.impl.js";
import {
  ACCRUAL_TERM_FIELDS,
  ACCRUAL_TERM_QUESTION,
  ANSWER_ACCRUAL_TERM_TOOL,
  ASK_KNOWLEDGE_CONFLICT_TOOL,
  ASK_QUESTION_TOOL,
  buildClaraWorkToolsV4,
  type AskQuestionInputV3,
} from "./claraWork.v4.tools.js";
import {
  CLARA_WORK_BUDGETS_V4,
  CLARA_WORK_BUNDLE_V4,
  CLARA_WORK_BUNDLE_V4_DIGEST,
  claraWorkBundleIdentityV4,
  claraWorkRunManifestV4,
} from "./claraWork.v4.bundle.js";
import type { ClaraWorkPartAdditionsV3 } from "./claraWork.v3.parts.js";
import {
  APPLY_FIXED_ASSET_PARTICULARS_TOOL,
  FA_PARTICULARS_FIELDS,
  FA_PARTICULARS_KEYS,
  faParticularsAnswerSchema,
  localParticularsRefusal,
  particularsFromAnswer,
  type FaParticularsAnswer,
} from "../lib/fixed-asset-acquisition.js";
import { distinctConflictRecordCount, knowledgeConflictFields, WORK_KNOWLEDGE_PACK_PURPOSE } from "../lib/knowledge-conflicts.mjs";

// v1's/v2's/v3's park, resume and lifecycle bodies, re-exported BY IMPORT (never copied).
export {
  closeStreamStep, confirmEntryStep, loadWorkStep, markRunningStep, mintHookTokenStep,
  openWorkQuestionStep, workEnvelopeMessage, workErrorPayload, egressRefusalPayload,
  emitWorkQuestionStepV3, emitWorkStatusStepV3, recheckAuthorityStepV3,
};
export type { LoadedWork, OpenedQuestion, SettleArgs, AuthorityVerdict };

/** Everything a claraWork_v4 run streams. THE SAME THREE KINDS v3 declares, plus the two carried
 *  ones — v4 adds no wire kind at all, so `claraWork.v3.parts.ts` stays the declarer and
 *  `check-parts-parity.mjs` needs no new file in its set. */
export type ClaraWorkPartV4 =
  | ClaraWorkPartAdditionsV3
  | { type: "text"; text: string }
  | { type: "refusal"; code: string; reason?: string; message: string };

/** The question a v4 segment asked, as the workflow needs it. `toolName` is new in v4 and is
 *  load-bearing: the resume has to answer the CALL the model made, and three different tools can
 *  now make one. */
export type AskedQuestionV4 = {
  toolCallId: string;
  toolName: string;
  question: string;
  reason: string;
  context?: string;
  sourceRef?: AskQuestionInputV3["source_ref"];
  fields: AskQuestionInputV3["fields"];
};

export type SegmentOutcomeV4 = {
  parts: ClaraWorkPartV4[];
  messages: ModelMessage[];
  question: AskedQuestionV4 | null;
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
 * would become a ROLLBACK and the SETTLE would be lost — the diagnostic deciding the accounting, in
 * the one place where it would decide it silently.
 */
async function traceSafelyInTransaction(exec: PgExec, row: Record<string, unknown>): Promise<void> {
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
 * ONE trace row: this closure's bundle identity, then whatever the call site adds.
 *
 * IT MERGES BY LOOP RATHER THAN BY SPREAD, and that is measured rather than fussy: the
 * parts-parity census walks every module under packages/runtime and REFUSES an object spread it
 * cannot classify, because a spread is exactly how an unreviewed type discriminant reaches a
 * transcript part without anyone seeing it.
 */
function traceRow(model: string | null, row: Record<string, unknown>): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV4();
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
// 1. CLAIM — v1's act, stamping V4's manifest, and the run's FIRST trace row.
// ---------------------------------------------------------------------------

export async function claimWorkRunStepV4(taskId: string): Promise<{ claimed: boolean; model: string; runId: string }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  return pools().withRuntime(async (c: PgExec) => {
    const snap = await c.query("select model_snapshot from clara.agent_tasks where id = $1 and kind = 'accounting_work'", [taskId]);
    if (snap.rowCount === 0) throw new Error(`claraWork_v4: accounting_work task ${taskId} not found`);
    const model = String(snap.rows[0]!.model_snapshot ?? "");
    const r = await c.query("select clara.claim_work_run($1::uuid, $2::text, $3::jsonb) as r", [
      taskId,
      workflowRunId,
      JSON.stringify(claraWorkRunManifestV4(model)),
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
// 2. THE KNOWLEDGE CONTEXT — read once, before the loop, and never decisive.
// ---------------------------------------------------------------------------

/** What the knowledge step hands the run. Small, serialisable and RENDERED: a WDK step's answer is
 *  written into the run's journal and replayed on every later attempt, so putting a client's whole
 *  pack in there would persist it twice over for no gain. */
export type WorkKnowledgeV4 = {
  status: "ok" | "unavailable";
  reason: string | null;
  knowledge_version: string | null;
  records_shown: number;
  text: string;
};

export async function loadWorkKnowledgeStepV4(clientId: string, firmId: string): Promise<WorkKnowledgeV4> {
  "use step";
  const { readWorkKnowledge } = await import("../lib/knowledge-conflicts.mjs");
  const read = readWorkKnowledge as unknown as (
    sql: unknown,
    args: { clientId: string; purpose: string; firmId: string },
  ) => Promise<WorkKnowledgeV4>;
  return pools().withRuntime(async (c: PgExec) =>
    read(c, { clientId, purpose: WORK_KNOWLEDGE_PACK_PURPOSE, firmId }));
}

// ---------------------------------------------------------------------------
// 3. THE SEGMENT — the egress dispatch, then a ToolLoopAgent, then the trace rows.
// ---------------------------------------------------------------------------

type RawCall = { type?: string; toolName?: string; toolCallId?: string; input?: unknown };

/** A readonly field list (the two fixed ones are `as const` so their kinds are literals) presented
 *  in the mutable shape `clara.open_work_question`'s step signature takes. A copy rather than a
 *  cast: the frozen constant must not be handed to anything that could mutate it. */
function questionFields(fields: ReadonlyArray<Record<string, unknown>>): AskQuestionInputV3["fields"] {
  return fields.map((f) => Object.assign({}, f)) as unknown as AskQuestionInputV3["fields"];
}

/** The rows of a knowledge conflict, rendered for the question's CONTEXT so a human reading it in
 *  Needs-you sees what the run saw without opening the register. Identifiers included: the answer
 *  names one of them. */
function conflictContext(key: string, rows: ReadonlyArray<Record<string, unknown>>): string {
  const lines = rows.map(
    (r) => `- ${String(r.scope_kind)} · ${String(r.value)} · applies when ${String(r.applies_when)} (${String(r.record_id)})`,
  );
  return [`Recorded facts under \`${key}\` that cannot all apply here:`, ...lines].join("\n");
}

/**
 * The question call a segment ended on, searched from the last step backwards exactly as v1's,
 * v2's and v3's private finders do, reading the INPUT (none of these tools has an `execute`).
 *
 * THREE TOOLS, ONE PARK. `ask_question` supplies its own fields; the two narrow ones do not, and
 * this function supplies theirs from the closure's own constants. That is where "#652's park may
 * not accept a period the model derived" actually lives: there is no path from a tool input to
 * these field lists.
 */
export function findQuestionCallV4(
  steps: ReadonlyArray<{ content?: ReadonlyArray<RawCall> }>,
): AskedQuestionV4 | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    for (const part of steps[i]?.content ?? []) {
      if (part.type !== "tool-call") continue;
      const toolName = part.toolName;
      const toolCallId = String(part.toolCallId ?? "");
      const input = (part.input ?? {}) as Record<string, unknown>;

      if (toolName === ASK_QUESTION_TOOL) {
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
        return { toolCallId, toolName, question, reason, context, sourceRef, fields };
      }

      if (toolName === ANSWER_ACCRUAL_TERM_TOOL) {
        const reason = typeof input.reason === "string" ? input.reason.trim() : "";
        if (!reason) continue;
        const context = typeof input.context === "string" && input.context.trim() ? input.context.trim() : undefined;
        const raw = input.source_ref;
        const sourceRef =
          raw !== null && typeof raw === "object" && typeof (raw as { kind?: unknown }).kind === "string"
            ? (raw as AskQuestionInputV3["source_ref"])
            : undefined;
        return {
          toolCallId,
          toolName,
          question: ACCRUAL_TERM_QUESTION,
          reason,
          context,
          sourceRef,
          fields: questionFields(ACCRUAL_TERM_FIELDS as unknown as ReadonlyArray<Record<string, unknown>>),
        };
      }

      if (toolName === ASK_KNOWLEDGE_CONFLICT_TOOL) {
        const key = typeof input.knowledge_key === "string" ? input.knowledge_key.trim() : "";
        const why = typeof input.why_it_blocks === "string" ? input.why_it_blocks.trim() : "";
        const rows = Array.isArray(input.rows) ? (input.rows as Array<Record<string, unknown>>) : [];
        // The schema already bounds this at 2..4; the finder re-reads it because a malformed call
        // that slipped a validator must park nothing rather than open a question with one option.
        // DISTINCT records, not rows: the schema types `record_id` a uuid and never requires the
        // four to differ, and `clara.open_work_question` refuses a choice field with a repeated
        // option value (0180:394-398 `option_values_unique`). Two rows naming ONE record are not a
        // conflict, and counting them as one would open a question with a single real choice.
        if (!key || !why || rows.length < 2 || distinctConflictRecordCount(rows) < 2) continue;
        return {
          toolCallId,
          toolName,
          question: `Two or more recorded facts under \`${key}\` disagree. Which one applies to this Work?`,
          reason: why,
          context: conflictContext(key, rows),
          sourceRef: undefined,
          fields: questionFields(knowledgeConflictFields(rows) as ReadonlyArray<Record<string, unknown>>),
        };
      }
    }
  }
  return null;
}

/**
 * THE EGRESS DISPATCH. Prepare the intent through the TASK-BOUND wrapper, then consume it in its
 * own committed transaction immediately before the model call. Byte-carried from v3, whose header
 * carries the full argument: the runtime chooses nothing, the DATABASE re-verifies the whole
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

export async function runWorkSegmentStepV4(
  taskId: string,
  work: LoadedWork,
  runId: string,
  segmentIndex: number,
  priorMessages: ModelMessage[],
  knowledgeVersion: string | null,
): Promise<SegmentOutcomeV4> {
  "use step";
  const ledger = newBudgetLedger();
  const budgets = CLARA_WORK_BUDGETS_V4;
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
  const tools = buildClaraWorkToolsV4(ctx, ledger, budgets);
  const messages: ModelMessage[] =
    priorMessages.length > 0
      ? priorMessages
      : ([{ role: "user", content: workEnvelopeMessage(work) }] as unknown as ModelMessage[]);

  const baseSeq = 2 + segmentIndex * 3;
  // Object.assign rather than an object spread, for the reason traceRow above states.
  const empty = (over: Partial<SegmentOutcomeV4>): SegmentOutcomeV4 =>
    Object.assign({
      parts: [] as ClaraWorkPartV4[], messages: [] as ModelMessage[], question: null,
      posted: null, terminal: null, requiredReadFailed: false, exhausted: null,
      egressRefused: false,
      budget: { toolCalls: 0, replans: 0, transientRetries: 0 },
      usageTokens: 0, finishReason: "unknown", text: "",
    } as SegmentOutcomeV4, over);

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
      taskId, runId, seq: baseSeq, phase: "dispatch",
      capabilityId: "accounting_work.model_segment",
      authorizationId,
      startedAt: dispatchStarted, endedAt: new Date().toISOString(),
      outcome: granted ? "ok" : "refused",
      refusal: granted ? null : { reason: "egress_not_authorized" },
    })));
  if (!granted) {
    const refusal = egressRefusalPayload();
    const parts: ClaraWorkPartV4[] = [{
      type: "refusal",
      code: String(refusal.code),
      reason: String(refusal.reason),
      message: String(refusal.message),
    }];
    await writePartsV4(parts);
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
    instructions: `${CLARA_WORK_BUNDLE_V4.instructions.text}\n\n${CLARA_WORK_BUNDLE_V4.skills[0]!.text}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [
      isStepCount(budgets.modelCalls),
      hasToolCall(ASK_QUESTION_TOOL),
      hasToolCall(ANSWER_ACCRUAL_TERM_TOOL),
      hasToolCall(ASK_KNOWLEDGE_CONFLICT_TOOL),
      stoppedOnTerminalWorkTool,
    ],
  });

  const modelStarted = new Date().toISOString();
  let result;
  try {
    result = await agent.generate({ messages });
  } catch (error) {
    const classification = classifyWorkError(error);
    const parts: ClaraWorkPartV4[] = [
      { type: "refusal", code: classification.code, reason: classification.reason ?? undefined, message: classification.message },
    ];
    await writePartsV4(parts);
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

  const question = findQuestionCallV4(result.steps as never);
  const parts: ClaraWorkPartV4[] = [];
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
  await writePartsV4(parts);

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
      // #654 STANZA (a), AND IT IS THE WHOLE OF THE TRACE CHANGE. `knowledge_version` is already in
      // `OBSERVED_REVISION_KEYS`, so the closed vocabulary is unmoved and the DATABASE refuses the
      // same set it always did; what changes is that a v4 run now RECORDS which watermark of the
      // client's governed knowledge it reasoned on. `basis_digest` stays null — v3 recorded it as
      // null and this cut is not the lane that computes it (#654's own residual H-21).
      await traceSafely(c, traceRow(work.model, {
        taskId, runId, seq: baseSeq + 1, phase: "model_call",
        capabilityId: "accounting_work.model_segment",
        authorizationId,
        inputDigest,
        observed: observedRevisions({ knowledge_version: knowledgeVersion, basis_digest: null }),
        startedAt: modelStarted, endedAt: modelEnded,
        outcome: "ok",
      }));
      if (ledger.posted || terminal || question) {
        await traceSafely(c, traceRow(work.model, {
          taskId, runId, seq: baseSeq + 2, phase: "tool_call",
          // NAMED FROM THE SERVER-OWNED REGISTRY, never from the model's own tool name — and that
          // registry is `deployed: true`, so the two new question tools are traced under the
          // capability they exercise (`accounting_work.ask_question`, one shared park) rather than
          // under ids nothing could add without editing a frozen file. The tool the model actually
          // called is on the question record itself.
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
async function writePartsV4(parts: ReadonlyArray<ClaraWorkPartV4>): Promise<void> {
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
// 4. THE #639 DEPENDENT PARTICULARS PAIR — discovered after the commit, applied on the answer.
// ---------------------------------------------------------------------------

/** The register row this Work's entry birthed, when its depreciation particulars are still absent.
 *  `costCents` and `nonDepreciable` are the two facts `localParticularsRefusal` needs to mirror the
 *  database's own validator before a round trip. */
export type PendingFixedAssetV4 = {
  assetId: string;
  description: string;
  costCents: number;
  nonDepreciable: boolean;
};

/**
 * DID THIS COMMIT BIRTH A FIXED ASSET WHOSE PARTICULARS ARE STILL ABSENT?
 *
 * THE READ IS THE ONE THING #639's STANZA LEFT OPEN, and it is worth saying exactly what was
 * measured rather than what was assumed. The stanza's question carries `source_ref:
 * {kind:'fixed_asset', asset_id}` and its apply takes `p_asset`, so the run must learn an asset id;
 * it names no read for it. Measured on the merged 0001→0224 chain: `clara.get_fixed_asset` and
 * `clara.list_fixed_assets` are granted to `clara_authenticated` ALONE (0216 §E), `clara_runtime`
 * holds no select on `clara.fixed_assets`, and no wake wrapper reads the register. What IS
 * reachable is the run's own OBO READ credential: `clara_agent_ro` holds select on
 * `clara.fixed_assets` under the policy `p_fixed_assets_agent` (`firm_id = clara.wake_firm()`), and
 * `readScoped` is the frozen helper v1's chart read already mints that credential with. So the run
 * reads the register the same way it reads the chart — under the initiator's own OBO authority,
 * firm-walled by RLS — and additionally pins the CLIENT from the run's context so a wake firm with
 * two clients cannot widen it.
 *
 * THE COMPLETENESS PREDICATE IS `clara._fa_particulars_complete`'s, RESTATED. That function is
 * ungranted (0041), so it cannot be called from here; its body is four lines of column tests and
 * this SQL is those four lines. If it is ever wrong the consequence is bounded and safe in one
 * direction only — a question opened for an asset that is already complete is refused CLR37
 * `fa_particulars_already_complete` by the door and the run settles completed regardless.
 *
 * IT NEVER THROWS. A register the run cannot read is not a reason to withhold an entry that is
 * already on the books.
 */
export async function loadPendingFixedAssetStepV4(
  work: LoadedWork,
  entryId: string,
): Promise<PendingFixedAssetV4 | null> {
  "use step";
  const ctx: ToolCtx = { firmId: work.firmId, clientId: work.clientId, createdBy: work.initiator, taskId: "" };
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      const r = await c.query(
        `select fa.id, coalesce(fa.description, '') as description, fa.cost_cents,
                (fa.accum_depr_account_code is null) as non_depreciable
           from clara.fixed_assets fa
          where fa.client_id = $1::uuid
            and fa.acquisition_entry_id = $2::uuid
            and fa.superseded_at is null
            and fa.status in ('pending','active')
            and not (fa.depreciation_start_date is not null
                     and fa.depreciation_method is not null
                     and (fa.depreciation_method = 'none'
                          or (fa.depreciation_method = 'straight_line'
                              and fa.useful_life_months is not null and fa.residual_cents is not null)
                          or (fa.depreciation_method = 'reducing_balance'
                              and fa.useful_life_months is not null and fa.residual_cents is not null
                              and fa.depreciation_rate_bps is not null)))
          order by fa.created_at
          limit 1`,
        [work.clientId, entryId],
      );
      const row = (r.rows[0] ?? null) as
        | { id?: unknown; description?: unknown; cost_cents?: unknown; non_depreciable?: unknown }
        | null;
      if (!row || row.id == null) return null;
      return {
        assetId: String(row.id),
        description: typeof row.description === "string" ? row.description : "",
        costCents: Number(row.cost_cents ?? 0),
        nonDepreciable: row.non_depreciable === true,
      };
    });
  } catch {
    return null;
  }
}

export type ParticularsOutcomeV4 =
  | { ok: true; assetId: string; replayed: boolean }
  | { ok: false; code: string; reason: string | null; field: string | null; message: string };

/**
 * APPLY THE ANSWERED PARTICULARS — and write no journal.
 *
 * `clara.complete_fixed_asset_particulars_for` is `clara_runtime`-only, takes the initiating human
 * as an EXPLICIT `p_obo`, and rechecks their live membership, the bookkeeper floor and the client's
 * status at this moment rather than at admission — which is the point of an OBO door for an answer
 * that may arrive hours later. 0216's tail T.9 asserts that neither particulars door's body
 * contains the string `journal_entries`: the acquisition posted when it posted, and this is a
 * register fact arriving afterwards.
 *
 * THE OP KEY IS DERIVED FROM THE WORK AND THE ASSET, not minted per attempt, so a WDK
 * re-execution of this step resolves onto the first answer through `clara._reserve_op` instead of
 * writing twice.
 */
export async function applyParticularsStepV4(
  work: LoadedWork,
  assetId: string,
  answer: unknown,
  context: { nonDepreciable: boolean; costCents: number },
): Promise<ParticularsOutcomeV4> {
  "use step";
  const parsed = faParticularsAnswerSchema.safeParse(answer);
  if (!parsed.success) {
    // NAME THE CONTROL WHEN THE SCHEMA CAN. A CLR37 from the DOOR carries a `detail.axis` that
    // `refusalFieldForAxis` turns into a field; a refusal from this schema has the field in its own
    // issue path, and dropping it would make the one refusal a surface CANNOT act on. Only a key the
    // particulars door actually accepts is reported — an issue about an unknown key names no
    // control, and the form renders that at form level.
    const first = parsed.error.issues[0];
    const path = first && Array.isArray(first.path) && typeof first.path[0] === "string" ? first.path[0] : null;
    const field = path !== null && (FA_PARTICULARS_KEYS as readonly string[]).includes(path) ? path : null;
    return {
      ok: false,
      code: "CLR37",
      reason: "fa_particulars_invalid",
      field,
      message:
        "The depreciation particulars that came back were not the shape the register accepts, so nothing "
        + "was changed. The acquisition is posted; the particulars are still pending.",
    };
  }
  const typed: FaParticularsAnswer = parsed.data;
  const local = localParticularsRefusal(typed, context);
  if (local) {
    return { ok: false, code: "CLR37", reason: local.reason, field: local.field, message: local.message };
  }
  const opKey = `${APPLY_FIXED_ASSET_PARTICULARS_TOOL}:${work.workId}:${assetId}`;
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const r = await c.query(
        "select clara.complete_fixed_asset_particulars_for($1::uuid, $2::uuid, $3::jsonb, $4::text, $5::uuid) as r",
        [work.clientId, assetId, JSON.stringify(particularsFromAnswer(typed)), opKey, work.initiator],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!receipt || receipt.particulars_complete !== true) {
      return {
        ok: false,
        code: "internal",
        reason: null,
        field: null,
        message: "The depreciation particulars could not be recorded. The acquisition is posted and unaffected.",
      };
    }
    return { ok: true, assetId, replayed: receipt.replayed === true };
  } catch (error) {
    const classification = classifyWorkError(error);
    const { refusalFieldForAxis } = await import("../lib/fixed-asset-acquisition.js");
    const detail = (error as { detail?: unknown }).detail;
    let parsedDetail: { axis?: unknown; field?: unknown } | null = null;
    if (typeof detail === "string") {
      try {
        parsedDetail = JSON.parse(detail) as { axis?: unknown; field?: unknown };
      } catch {
        parsedDetail = null;
      }
    }
    return {
      ok: false,
      code: classification.code,
      reason: classification.reason,
      field: refusalFieldForAxis(parsedDetail),
      message: classification.message,
    };
  }
}

/** The question a dependent particulars park asks, and the reason beside it. The asset's
 *  placeholder description is named so a human answering from Needs-you — who never saw the run —
 *  knows which asset this is about.
 *
 *  THE SOURCE REF IS #639'S OWN STANZA, `{kind:'fixed_asset', asset_id}`, and it is built HERE so
 *  the one cast it needs lives beside its reason. `workQuestionSourceRefSchema` closes the kind to
 *  three values because that schema is what a MODEL may put in an `ask_question` call, and a model
 *  inventing kinds is a surface nobody can resolve. This question is not a model's — it is the
 *  workflow's own act after a commit — and the DATABASE's rule is only that `source_ref` is an
 *  object or null (0180:183), which is why `clara.open_work_question` accepts the fourth kind and
 *  `p639.question.dependent` already drives it on a live rig, asserting `source_ref.asset_id`.
 *  `sourceRefText` (apps/web/components/work/work-question-form.tsx) reads `kind` and `id`, so the
 *  answer form's supporting line now reads `fixed_asset` rather than the WRONG `basis_line <uuid>`
 *  the cut shipped; the asset itself is named in the question and its cost in the context. */
export function particularsQuestionV4(pending: PendingFixedAssetV4): {
  question: string;
  reason: string;
  context: string;
  sourceRef: AskQuestionInputV3["source_ref"];
  fields: AskQuestionInputV3["fields"];
} {
  const label = pending.description.trim() === "" ? "the asset this entry acquired" : pending.description.trim();
  return {
    question: `How is ${label} depreciated?`,
    reason:
      "The acquisition is posted and the fixed-asset register has a row for it, but the register cannot "
      + "compute depreciation without a method and an in-service date. Nobody stated them, and they are "
      + "not something this run may decide.",
    context:
      `Cost ${pending.costCents} cents.`
      + (pending.nonDepreciable
        ? " This asset sits on a non-depreciable enrolment (no accumulated-depreciation account), so its"
          + " method must be “not depreciated” — an in-service date is still required."
        : ""),
    sourceRef: { kind: "fixed_asset", asset_id: pending.assetId } as unknown as AskQuestionInputV3["source_ref"],
    fields: questionFields(FA_PARTICULARS_FIELDS as unknown as ReadonlyArray<Record<string, unknown>>),
  };
}

// ---------------------------------------------------------------------------
// 5. SETTLE — v1's idempotent terminal write, plus the run's LAST trace row.
// ---------------------------------------------------------------------------

export async function settleWorkStepV4(
  taskId: string,
  runId: string,
  seq: number,
  args: SettleArgs,
): Promise<void> {
  "use step";
  const settledAt = new Date().toISOString();
  await pools().withRuntime(async (c: PgExec) => {
    // ONE TRANSACTION FOR THE SETTLE AND ITS TRACE ROW, with the trace write in a SAVEPOINT so a
    // refused diagnostic can never roll the settle back. v3's own shape and its own reason.
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

/** The `result` jsonb a COMPLETED v4 Work carries: the effect, the recorded budget spend, and —
 *  when this Work's acquisition birthed a fixed-asset row — what became of its particulars. */
export function completedResultV4(
  posted: PostedEffect,
  confirmed: boolean,
  budget: SegmentOutcomeV4["budget"],
  segments: number,
  tokens: number,
  particulars: Record<string, unknown> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    entry_id: posted.entry_id,
    receipt_id: posted.receipt_id,
    revision_token: posted.revision_token,
    logical_op_id: posted.logical_op_id,
    replayed: posted.replayed,
    confirmed,
    bundle_digest: CLARA_WORK_BUNDLE_V4_DIGEST,
    budget: { segments, toolCalls: budget.toolCalls, replans: budget.replans, transientRetries: budget.transientRetries, tokens },
  };
  // An ABSENT key rather than a null one: a Work that acquired no fixed asset has nothing to say
  // about particulars, and `"fixed_asset_particulars": null` on every ordinary journal Work would
  // read as "they are missing" on the one surface that renders this object.
  if (particulars !== null) out.fixed_asset_particulars = particulars;
  return out;
}
