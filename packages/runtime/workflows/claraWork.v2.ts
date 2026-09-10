// @frozen
//
// FROZEN — the claraWork_v2 workflow entry (#629: SHARED WORK QUESTIONS). A REPOINT of the
// `claraWork` registry key, never an edit: v1's seven files are byte-untouched and stay frozen,
// built and exported, because a Work admitted under v1 may still be parked on a v1 hook when this
// image deploys (ARCHITECTURE Appendix A policy (b) and (c)).
//
// WHAT CHANGED FROM v1, IN THREE LINES.
//   1. The park writes a WORK QUESTION (`clara.open_work_question`, migration 0180) instead of a
//      bare clarify: the Work identity, a monotone question VERSION, the Work's basis digest, the
//      REASON and one to six TYPED FIELDS. That is what lets the Work detail, Needs-you and the
//      Clara rail render the SAME question and post the SAME answer.
//   2. The resume RE-READS AUTHORITY before it spends anything. An answer accepted hours later is
//      only worth acting on if the person who asked for the Work is still allowed to have it done.
//   3. The resume feeds the answer back with WHO answered, WHEN and under WHICH VERSION, so the
//      model uses a value it can attribute rather than a bare blob.
//
// WHAT DID NOT CHANGE, AND IS REACHED BY IMPORT: the claim CAS, the Work load, the chart read, the
// one wake wrapper that posts, the read-back confirm, the settle, the budgets, the error classifier
// and the "success is decided by a receipt, never by a stream ending" rule (ARCHITECTURE §6).
//
// THE CRASH WINDOWS THIS BODY IS SHAPED AROUND ARE THREE, NOT ONE.
//   · after `wake_record_journal_entry` COMMITTED and before the segment step checkpointed — v1's
//     window, unchanged: the re-executed step reaches the SAME logical identity and the database
//     returns the ORIGINAL receipt with `replayed:true`.
//   · after the LEASE committed and before the resume — the control listener's window. The hook is
//     still unconsumed, so the re-leased delivery resumes it exactly once.
//   · after the RESUME landed and before this body settled — the WDK re-executes from the last
//     checkpoint; `markRunningStep`, the authority recheck and the segment are all safe to
//     re-execute, and the settle is idempotent by task.
// tests/work-question-e2e.mjs drives all three against a real Postgres World.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimWorkRunStepV2,
  closeStreamStep,
  completedResultV2,
  confirmEntryStep,
  emitWorkQuestionStep,
  emitWorkStatusStep,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  openWorkQuestionStep,
  recheckAuthorityStep,
  runWorkSegmentStepV2,
  settleWorkStep,
  workEnvelopeMessage,
  workErrorPayload,
} from "./claraWork.v2.impl.js";
import { ASK_QUESTION_TOOL } from "./claraWork.v2.tools.js";
import { CLARA_WORK_BUDGETS_V2 } from "./claraWork.v2.bundle.js";
import { budgetExhaustedPayload, taskErrorCodeFor, workOutcomeFor } from "./claraWork.v1.errors.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";

/** The resume payload the control listener writes for a WORK question. `question_id` and
 *  `question_version` are what let this body feed an ATTRIBUTED answer back to the model, and
 *  `answered_by`/`answered_role`/`answered_at` are the attribution. The three optional fields are
 *  optional because the same hook shape also carries `expired` and `cancelled`. */
type WorkResume = {
  kind: "answer" | "expired" | "cancelled";
  answer?: unknown;
  question_id?: string;
  question_version?: number;
  answered_by?: string | null;
  answered_role?: string | null;
  answered_at?: string | null;
};

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

/** An authority refusal is NOT recoverable, and saying so is the whole point of the field. A Retry
 *  would run under the same absent authority and be refused again at the same place; what the
 *  human needs is the membership or the client restored, or somebody else to start the Work. */
function authorityLostPayload(reason: string, message: string): Record<string, unknown> {
  return { code: reason, reason, message, recoverable: false };
}

export async function claraWork_v2(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const budgets = CLARA_WORK_BUDGETS_V2;
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
    const claim = await claimWorkRunStepV2(taskId);
    // A duplicate start (the route racing the reconciler, or a re-enqueue after a lost
    // acknowledgement) self-aborts here. The FIRST run keeps the task, and C-35's obligation —
    // "preserve correct old-run identity" — is discharged by the CAS, not by a later repair.
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };

    const work = await loadWorkStep(taskId);
    await emitWorkStatusStep(work.workId, "running");

    const messages: ModelMessage[] = [{ role: "user", content: workEnvelopeMessage(work) } as unknown as ModelMessage];

    for (; segment < budgets.segments; segment++) {
      const seg = await runWorkSegmentStepV2(taskId, work, claim.runId, messages);
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
          completedResultV2(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens),
        );
        break;
      }

      // 2. A typed refusal / conflict / required-read failure is TERMINAL. The model does not get
      //    another attempt with mutated parameters.
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

      // 4. A question parks the Work on a WDK hook until a human answers it — from the Work detail,
      //    from Needs-you, or from the Clara rail. All three post to the SAME door.
      if (seg.question) {
        await emitWorkStatusStep(work.workId, "awaiting_input");
        const hookToken = await mintHookTokenStep();
        const hook = createHook<WorkResume>({ token: hookToken });
        const opened = await openWorkQuestionStep(taskId, hookToken, {
          question: seg.question.question,
          reason: seg.question.reason,
          context: seg.question.context,
          fields: seg.question.fields,
        });
        await emitWorkQuestionStep(opened, work.clientId);

        const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

        if (resolution.kind === "answer") {
          await markRunningStep(taskId);
          await emitWorkStatusStep(work.workId, "running");
          // ROLE LOSS BLOCKS CONTINUATION (#629). Asked BEFORE a single token is spent on the
          // resumed segment, and BEFORE the commit-time recheck that would otherwise be the first
          // thing to notice.
          const authority = await recheckAuthorityStep(taskId);
          if (!authority.ok) {
            await settle("refused", taskErrorCodeFor("refusal"), authorityLostPayload(authority.reason, authority.message), null);
            break;
          }
          messages.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: seg.question.toolCallId,
                toolName: ASK_QUESTION_TOOL,
                // THE ANSWER IS ATTRIBUTED, not bare. The model is told WHICH question version it
                // is answering and on whose live authority the answer was accepted, so a
                // transcript that is replayed after a re-ask cannot be read as answering the new
                // question with the old answer.
                output: {
                  type: "json",
                  value: {
                    answer: resolution.answer ?? null,
                    question_version: resolution.question_version ?? opened.questionVersion,
                    answered_by_role: resolution.answered_role ?? null,
                    answered_at: resolution.answered_at ?? null,
                  },
                },
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
 *  `agent_tasks.error_code` has no `refused` member, so a typed refusal rides there and the Work
 *  row carries the real reason). */
function taskError(kind: string, requiredReadFailed: boolean): string | null {
  if (requiredReadFailed) return "internal";
  return taskErrorCodeFor(kind as Parameters<typeof taskErrorCodeFor>[0]);
}
