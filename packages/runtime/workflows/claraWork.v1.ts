// @frozen
//
// FROZEN — the claraWork_v1 workflow entry (#623: THE FIRST PERSISTENT CLARA SUCCESSOR — a
// documentless journal entry). A NEW workflow CLASS, not a repoint: registry.ts gains
// `claraWork: claraWork_v1` beside the existing keys, and nothing that was already dispatchable
// moves. Appendix A policy (b) still binds every future change here — a behavioural change ships
// as claraWork_v2 and repoints that key.
//
// WHAT ONE RUN IS. Exactly one `clara.agent_tasks` row of kind `accounting_work`, bound to
// exactly one `clara.accounting_work` row whose server-assigned `logical_op_id` is
// `work:<work_id>:journal_entry:1`. The run claims the task (stamping the hashed bundle
// manifest), reads the ADMITTED basis from the Work row, runs a bounded ToolLoopAgent segment,
// and settles both rows through one idempotent verb.
//
// WHAT DECIDES SUCCESS (ARCHITECTURE §6: "Work 成功由完整业务结果决定, 不能按工具调用数、stream
// 结束或任务表的一个状态猜测"). A run settles `completed` if and ONLY if the database returned a
// receipt for a posted entry. A model that narrated a posting it never made settles `failed` with
// `no_effect` — the same shape as chat's C-19 terminal invariant, applied to a Work.
//
// WHY THE SEGMENT LOOP IS BOUNDED TWICE. `budgets.modelCalls` bounds the ToolLoopAgent INSIDE one
// segment; `budgets.segments` bounds how many human round trips the whole Work may take. Both
// are finite, both are recorded on the Work row, and exhaustion settles `failed` with
// `error_code='limit'` and a recoverable `budget_exhausted` — never a silent stop and never an
// unbounded loop.
//
// THE CRASH WINDOW IS THE POINT OF THE WHOLE DESIGN. If the process dies AFTER
// `wake_record_journal_entry` committed and BEFORE this workflow checkpointed the segment step,
// the WDK re-executes that step on resume. The re-executed tool call reaches the SAME logical
// operation identity with the SAME payload and the database returns the ORIGINAL receipt with
// `replayed:true` — one entry, one committed receipt, and this body needs no in-memory memory of
// what it already did (ARCHITECTURE §5: "一个 segment 可以重跑, 因此模型结果和副作用不能仅靠内存
// 去重"). tests/work-journal-e2e.mjs drives that window with a real SIGKILL-equivalent exit.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimWorkRunStep,
  closeStreamStep,
  completedResult,
  confirmEntryStep,
  emitWorkStatusStep,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  openInterruptionStep,
  runWorkSegmentStep,
  settleWorkStep,
  workEnvelopeMessage,
  workErrorPayload,
} from "./claraWork.v1.impl.js";
import { ASK_QUESTION_TOOL } from "./claraWork.v1.tools.js";
import { CLARA_WORK_BUDGETS_V1 } from "./claraWork.v1.bundle.js";
import { budgetExhaustedPayload, taskErrorCodeFor, workOutcomeFor } from "./claraWork.v1.errors.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";

/** A Work that ran and produced nothing is a FAILURE, not a completion — §6's own rule. It is
 *  recoverable: a Retry makes a new run for the same logical identity. */
function noEffectPayload(): Record<string, unknown> {
  return {
    code: "no_effect",
    reason: "no_receipt",
    message: "This run finished without recording an entry. Nothing was posted; retry to run it again.",
    recoverable: true,
  };
}

export async function claraWork_v1(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const budgets = CLARA_WORK_BUDGETS_V1;
  let segment = 0;
  let tokens = 0;
  let toolCalls = 0;
  let replans = 0;
  let transientRetries = 0;
  let outcome = "failed";

  let settled = false;
  const settle = async (
    o: "completed" | "refused" | "failed" | "cancelled" | "expired",
    errorCode: string | null,
    error: Record<string, unknown> | null,
    result: Record<string, unknown> | null,
  ) => {
    if (settled) return;
    settled = true;
    outcome = o;
    await settleWorkStep(taskId, { outcome: o, errorCode, error, result });
  };

  try {
    const claim = await claimWorkRunStep(taskId);
    // A duplicate start (the route racing the reconciler, or a re-enqueue after a lost
    // acknowledgement) self-aborts here. The FIRST run keeps the task, and C-35's obligation —
    // "preserve correct old-run identity" — is discharged by the CAS, not by a later repair.
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };

    const work = await loadWorkStep(taskId);
    await emitWorkStatusStep(work.workId, "running");

    const messages: ModelMessage[] = [{ role: "user", content: workEnvelopeMessage(work) } as unknown as ModelMessage];

    for (; segment < budgets.segments; segment++) {
      const seg = await runWorkSegmentStep(taskId, work, claim.runId, messages);
      tokens += seg.usageTokens;
      toolCalls += seg.budget.toolCalls;
      replans += seg.budget.replans;
      transientRetries += seg.budget.transientRetries;
      for (const m of seg.messages) messages.push(m);

      // 1. A committed effect ends the Work, whatever else the segment did.
      if (seg.posted) {
        const confirm = await confirmEntryStep(work, taskId, seg.posted.entry_id);
        await settle(
          "completed",
          null,
          null,
          completedResult(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens),
        );
        break;
      }

      // 2. A typed refusal / conflict / required-read failure is TERMINAL. The model does not
      //    get another attempt with mutated parameters.
      if (seg.terminal) {
        const kind = seg.requiredReadFailed ? "invariant" : seg.terminal.kind;
        await settle(workOutcomeFor(kind), taskError(kind, seg.requiredReadFailed), workErrorPayload(seg.terminal), null);
        break;
      }

      // 3. A spent budget leaves a RECOVERABLE state, never a crash.
      if (seg.exhausted) {
        await settle("failed", "limit", budgetExhaustedPayload(seg.exhausted), null);
        break;
      }

      // 4. A question parks the Work on a WDK hook until a human answers it.
      if (seg.question) {
        await emitWorkStatusStep(work.workId, "awaiting_input");
        const hookToken = await mintHookTokenStep();
        const hook = createHook<{ kind: "answer" | "expired" | "cancelled"; answer?: unknown }>({ token: hookToken });
        await openInterruptionStep(taskId, hookToken, { question: seg.question.question, context: seg.question.context });

        const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

        if (resolution.kind === "answer") {
          await markRunningStep(taskId);
          await emitWorkStatusStep(work.workId, "running");
          messages.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: seg.question.toolCallId,
                toolName: ASK_QUESTION_TOOL,
                output: { type: "json", value: resolution.answer ?? null },
              },
            ],
          } as unknown as ModelMessage);
          continue;
        }
        const code = resolution.kind === "expired" ? "expired" : "cancelled";
        await settle(code, taskErrorCodeFor("cancelled"), {
          code: `question_${code}`,
          reason: CLARIFY_FRAMING,
          message:
            code === "expired"
              ? "The question this Work was waiting on expired before it was answered. Nothing was posted."
              : "This Work was cancelled while waiting for an answer. Nothing was posted.",
          recoverable: true,
        }, null);
        break;
      }

      // 5. The segment neither acted nor asked. Continuing would re-run the same dead end.
      await settle("failed", "internal", noEffectPayload(), null);
      break;
    }

    // The segment budget itself ran out (every segment asked a question and was answered).
    await settle("failed", "limit", budgetExhaustedPayload("segments"), null);
  } catch (err) {
    await settle("failed", "internal", {
      code: "internal",
      reason: "run_error",
      message: "This Work run failed before it could record an entry. Nothing was posted.",
      recoverable: true,
    }, null).catch(() => {});
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await closeStreamStep().catch(() => {});
  }

  return { taskId, outcome, segments: segment + 1 };
}

/** A required-read failure settles `failed` with 'internal' (the chart could not be read — a
 *  visible fault), while a business refusal settles with 'tool_error' (the CHECK on
 *  `agent_tasks.error_code` has no `refused` member, so a typed refusal rides there and the
 *  Work row carries the real reason). */
function taskError(kind: string, requiredReadFailed: boolean): string | null {
  if (requiredReadFailed) return "internal";
  return taskErrorCodeFor(kind as Parameters<typeof taskErrorCodeFor>[0]);
}
