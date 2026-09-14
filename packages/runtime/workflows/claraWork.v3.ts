// @frozen
//
// FROZEN — the claraWork_v3 workflow entry (#631: MODEL EGRESS OBEYS CURRENT PURPOSE
// AUTHORISATION). A REPOINT of the `claraWork` registry key, never an edit: v1's and v2's file
// sets are byte-untouched and stay frozen, built and exported, because a Work admitted under
// either may still be parked on its hook when this image deploys (ARCHITECTURE Appendix A policy
// (b) and (c)).
//
// WHAT CHANGED FROM v2, IN FOUR LINES.
//   1. EVERY SEGMENT DISPATCHES BEFORE IT SPENDS. `clara.prepare_work_egress_dispatch` derives the
//      whole intent from the TASK, and `clara.consume_egress_dispatch` is called IMMEDIATELY
//      before `agent.generate` — the wiki lane's own two-phase shape. A revocation, a superseded
//      legal version, an archived client or an exhausted authorisation refuses at the consume, and
//      the model is never called at all.
//   2. EVERY STEP LEAVES A DURABLE, REDACTED DIAGNOSTIC ROW — dispatch, model_call, tool_call,
//      settle — in `clara.work_execution_traces`, which has NO payload column. That is C88.12's
//      discovery closed: the minimum durable diagnostic event is one row per step.
//   3. THE ERROR ROSTER GAINS THREE PAIRS (#737): `(CLR13, work_cancelled) → cancelled`,
//      `(CLR13, work_settled) → refusal`, `(CLR13, egress_not_authorized) → refusal`. Each was
//      `state_changed` under the inherited default, i.e. worth up to `budgets.replans` refused
//      model turns; none of the three is something a re-plan can fix.
//   4. THE `work_status` PART CARRIES `client_id` (#738), so a status line can build the route and
//      the scoped reads that Cancel Work needs.
//
// WHAT DID NOT CHANGE, AND IS REACHED BY IMPORT: the claim CAS, the Work load, the chart read, the
// one wake wrapper that posts, the read-back confirm, the park/resume, the budgets, and the
// "success is decided by a receipt, never by a stream ending" rule (ARCHITECTURE §6).
//
// THE CRASH WINDOWS THIS BODY IS SHAPED AROUND ARE STILL THREE, AND #631 ADDS NONE.
//   · after `wake_record_journal_entry` COMMITTED and before the segment step checkpointed — the
//     re-executed step reaches the SAME logical identity and the database returns the ORIGINAL
//     receipt with `replayed:true`. THE EGRESS GATE IS SKIPPED ON THAT PATH BY CONSTRUCTION:
//     migration 0195 guards it with `clara._work_committed_receipt(p_work) is null`, so a
//     committed replay cannot be refused by an authorisation that was withdrawn in between.
//   · after the LEASE committed and before the resume — the control listener's window.
//   · after the RESUME landed and before this body settled — the WDK re-executes from the last
//     checkpoint; `markRunningStep`, the authority recheck, the dispatch and the segment are all
//     safe to re-execute (a re-executed segment prepares and consumes a FRESH authorisation under
//     the same run binding), and the settle is idempotent by task.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimWorkRunStepV3,
  closeStreamStep,
  completedResultV3,
  confirmEntryStep,
  egressRefusalPayload,
  emitWorkQuestionStepV3,
  emitWorkStatusStepV3,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  openWorkQuestionStep,
  recheckAuthorityStepV3,
  runWorkSegmentStepV3,
  settleWorkStepV3,
  workEnvelopeMessage,
  workErrorPayload,
} from "./claraWork.v3.impl.js";
import { ASK_QUESTION_TOOL } from "./claraWork.v3.tools.js";
import { CLARA_WORK_BUDGETS_V3 } from "./claraWork.v3.bundle.js";
import { budgetExhaustedPayload, taskErrorCodeFor, workOutcomeFor } from "./claraWork.v3.errors.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";

/** The resume payload the control listener writes for a WORK question. */
type WorkResume = {
  kind: "answer" | "expired" | "cancelled";
  answer?: unknown;
  question_id?: string;
  question_version?: number;
  answered_by?: string | null;
  answered_role?: string | null;
  answered_at?: string | null;
};

/** THE SETTLE'S TRACE SEQ. A segment owns three rows starting at `2 + index * 3`, and seq 1 is the
 *  claim's dispatch row, so the settle takes the first number past the last possible segment. A
 *  fixed number, not a counter: the settle can be reached from any segment and from the catch. */
const SETTLE_TRACE_SEQ = 2 + CLARA_WORK_BUDGETS_V3.segments * 3;

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

/**
 * The payload the post-resume recheck settles with.
 *
 * AN AUTHORITY REFUSAL IS NOT RECOVERABLE, and saying so is the whole point of the field. A Retry
 * would run under the same absent authority and be refused again at the same place.
 *
 * `work_unreadable` IS RECOVERABLE, AND IT IS NOT AN AUTHORITY REFUSAL AT ALL (v2's reviewed
 * finding, carried): `clara.work_authority_snapshot` returns NULL when its join finds nothing, and
 * none of those cases is "you may not".
 */
function recheckRefusalPayload(reason: string, message: string): Record<string, unknown> {
  return { code: reason, reason, message, recoverable: reason === "work_unreadable" };
}

export async function claraWork_v3(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const budgets = CLARA_WORK_BUDGETS_V3;
  let segment = 0;
  let tokens = 0;
  let toolCalls = 0;
  let replans = 0;
  let transientRetries = 0;
  let outcome = "failed";
  let runId = "";

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
    await settleWorkStepV3(taskId, runId, SETTLE_TRACE_SEQ, { outcome: o, errorCode, error, result });
  };

  try {
    const claim = await claimWorkRunStepV3(taskId);
    // A duplicate start (the route racing the reconciler, or a re-enqueue after a lost
    // acknowledgement) self-aborts here. The FIRST run keeps the task.
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };
    runId = claim.runId;

    const work = await loadWorkStep(taskId);
    await emitWorkStatusStepV3(work.workId, work.clientId, "running");

    const messages: ModelMessage[] = [{ role: "user", content: workEnvelopeMessage(work) } as unknown as ModelMessage];

    for (; segment < budgets.segments; segment++) {
      const seg = await runWorkSegmentStepV3(taskId, work, runId, segment, messages);
      tokens += seg.usageTokens;
      toolCalls += seg.budget.toolCalls;
      replans += seg.budget.replans;
      transientRetries += seg.budget.transientRetries;
      for (const m of seg.messages) messages.push(m);

      // 0. THE DISPATCH WAS REFUSED. No model was called, no tokens were spent, and no later
      //    segment can succeed either — the authorisation is a property of the client and the
      //    firm's current agreements, not of this turn. TERMINAL, with no provider named.
      if (seg.egressRefused) {
        await settle("refused", taskErrorCodeFor("refusal"), egressRefusalPayload(), null);
        break;
      }

      // 1. A committed effect ends the Work, whatever else the segment did.
      if (seg.posted) {
        const confirm = await confirmEntryStep(work, taskId, seg.posted.entry_id);
        await settle(
          "completed",
          null,
          null,
          completedResultV3(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens),
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

      // 4. A question parks the Work on a WDK hook until a human answers it — from the Work
      //    detail, from Needs-you, or from the Clara rail. All three post to the SAME door.
      if (seg.question) {
        await emitWorkStatusStepV3(work.workId, work.clientId, "awaiting_input");
        const hookToken = await mintHookTokenStep();
        const hook = createHook<WorkResume>({ token: hookToken });
        const opened = await openWorkQuestionStep(taskId, hookToken, {
          question: seg.question.question,
          reason: seg.question.reason,
          context: seg.question.context,
          sourceRef: seg.question.sourceRef,
          fields: seg.question.fields,
        });
        await emitWorkQuestionStepV3(opened, work.clientId);

        const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

        if (resolution.kind === "answer") {
          await markRunningStep(taskId);
          await emitWorkStatusStepV3(work.workId, work.clientId, "running");
          // ROLE LOSS BLOCKS CONTINUATION (#629), asked BEFORE a single token is spent on the
          // resumed segment — and before the resumed segment's own dispatch, so a Work whose
          // human is gone is never even prepared for.
          const authority = await recheckAuthorityStepV3(taskId);
          if (!authority.ok) {
            await settle("refused", taskErrorCodeFor("refusal"), recheckRefusalPayload(authority.reason, authority.message), null);
            break;
          }
          messages.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: seg.question.toolCallId,
                toolName: ASK_QUESTION_TOOL,
                // THE ANSWER IS ATTRIBUTED, not bare.
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
