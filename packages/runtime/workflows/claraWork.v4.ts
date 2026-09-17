// @frozen
//
// FROZEN — the claraWork_v4 workflow entry: the wave 2026-09-15 integration cut. A REPOINT of the
// `claraWork` registry key, never an edit: v1's, v2's and v3's file sets are byte-untouched and
// stay frozen, built and exported, because a Work admitted under any of them may still be parked on
// its hook when this image deploys (ARCHITECTURE Appendix A policy (b) and (c)).
//
// WHAT CHANGED FROM v3, IN FOUR LINES.
//   1. THE RUN READS THE CLIENT'S GOVERNED KNOWLEDGE ONCE, before the loop, and renders it into the
//      opening message as DATA. `loadWorkKnowledgeStepV4` never throws and never returns null: an
//      unreadable pack says so and the run carries on, because a Work's authority is its ADMITTED
//      BASIS and a context read may not decide the accounting. The pack's `knowledge_version` rides
//      into every segment's `model_call` trace row as an OBSERVED REVISION — #654's stanza (a),
//      closed against the trace call v3 already makes.
//   2. TWO NEW QUESTIONS, BOTH EXECUTE-LESS. `answer_accrual_term` (#652) asks a human for an
//      accrual's service period when the document or instruction never stated one, and supplies no
//      dates of its own. `ask_knowledge_conflict` (#654) puts two to four disagreeing recorded
//      facts to a human and picks no winner. Both park through the SAME
//      `clara.open_work_question` machinery `ask_question` already uses; neither can write a row.
//   3. THE DEPENDENT FIXED-ASSET PARTICULARS QUESTION (#639). After a commit whose entry birthed a
//      register row with no depreciation method or in-service date, the run opens ONE question,
//      parks, and applies the answer through `clara.complete_fixed_asset_particulars_for`. IT POSTS
//      NO SECOND JOURNAL — the door writes a register fact and 0216's tail T.9 asserts its body
//      names no `journal_entries` row.
//   4. THE BUNDLE IS `clara-work/v4` with a FIVE-name roster, so a receipt can say which contract
//      the run was served.
//
// WHAT DID NOT CHANGE, AND IS REACHED BY IMPORT: the claim CAS, the Work load, the egress
// dispatch and its two-phase shape, the chart read, the one wake wrapper that posts, the read-back
// confirm, the park/resume, the budgets, the authority recheck, the trace scheme, and the "success
// is decided by a receipt, never by a stream ending" rule (ARCHITECTURE §6).
//
// THE ONE PLACE THIS BODY DEPARTS FROM v3's CONTROL FLOW, AND WHY IT IS NOT A WEAKENING. v3's rule
// is "a committed effect ends the Work, whatever else the segment did". v4 still ends the Work on a
// committed effect — it just does not SETTLE it in the same instant when the effect birthed a
// fixed-asset row with absent particulars. The model gets no further turn, no tool becomes
// callable, and no second entry can be written: the only thing that happens between the commit and
// the settle is one question to a person and one typed register write. If that question expires or
// the Work is cancelled while it is open, the Work still settles COMPLETED with its real effect and
// a named remainder — because telling a human "cancelled" about a run whose entry is in their
// ledger would be false.
//
// THE CRASH WINDOWS ARE STILL v3's THREE, PLUS THE SHAPE OF THE FOURTH THIS BODY ADDS:
//   · after the particulars question was OPENED and before the workflow checkpointed — the
//     re-executed step calls `clara.open_work_question` again, which is idempotent on the hook
//     token, and the same question comes back.
//   · after `complete_fixed_asset_particulars_for` COMMITTED and before the settle — the
//     re-executed step reaches the same `clara._reserve_op` key (`work_id` + `asset_id`) and the
//     database returns the ORIGINAL answer rather than writing a second one.
//
// THE DEPLOY ORDER IS OWED IN ONE DIRECTION. MIGRATIONS 0192 (knowledge pack) AND 0216 (the
// particulars door) MUST BE LIVE BEFORE THIS IMAGE RUNS ANY WORK, on top of v3's own 0195. Against
// a database without 0192 the knowledge read classifies the missing function as `read_failed` and
// the block says the knowledge could not be read — CONTAINED BY CONSTRUCTION. Against a database
// without 0216 the particulars discovery read finds nothing and no question is ever opened — also
// contained, and invisible. Neither corrupts anything; both make Clara quietly do less than it
// offers. Deploy the migrations first.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  applyParticularsStepV4,
  claimWorkRunStepV4,
  closeStreamStep,
  completedResultV4,
  confirmEntryStep,
  egressRefusalPayload,
  emitWorkQuestionStepV3,
  emitWorkStatusStepV3,
  loadPendingFixedAssetStepV4,
  loadWorkKnowledgeStepV4,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  openWorkQuestionStep,
  particularsQuestionV4,
  recheckAuthorityStepV3,
  runWorkSegmentStepV4,
  settleWorkStepV4,
  workEnvelopeMessage,
  workErrorPayload,
} from "./claraWork.v4.impl.js";
import { CLARA_WORK_BUDGETS_V4 } from "./claraWork.v4.bundle.js";
import { budgetExhaustedPayload, particularsPendingNote, questionNotOpenedPayload, taskErrorCodeFor, workOutcomeFor } from "./claraWork.v4.errors.js";
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
 *  fixed number, not a counter: the settle can be reached from any segment and from the catch. The
 *  #639 particulars pair writes NO trace rows, so it cannot collide with this. */
const SETTLE_TRACE_SEQ = 2 + CLARA_WORK_BUDGETS_V4.segments * 3;

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
 * finding, carried by v3 and carried again).
 */
function recheckRefusalPayload(reason: string, message: string): Record<string, unknown> {
  return { code: reason, reason, message, recoverable: reason === "work_unreadable" };
}

export async function claraWork_v4(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const budgets = CLARA_WORK_BUDGETS_V4;
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
    await settleWorkStepV4(taskId, runId, SETTLE_TRACE_SEQ, { outcome: o, errorCode, error, result });
  };

  try {
    const claim = await claimWorkRunStepV4(taskId);
    // A duplicate start (the route racing the reconciler, or a re-enqueue after a lost
    // acknowledgement) self-aborts here. The FIRST run keeps the task.
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };
    runId = claim.runId;

    const work = await loadWorkStep(taskId);
    await emitWorkStatusStepV3(work.workId, work.clientId, "running");

    // #654 (a). ONE read, before the loop, and its answer is data in the opening message. A
    // per-segment read would put the same block in the journal four times and could hand two
    // segments of one run two different watermarks to reason on.
    const knowledge = await loadWorkKnowledgeStepV4(work.clientId, work.firmId);
    const envelope = knowledge.text
      ? `${workEnvelopeMessage(work)}\n\n${knowledge.text}`
      : workEnvelopeMessage(work);
    const messages: ModelMessage[] = [{ role: "user", content: envelope } as unknown as ModelMessage];

    for (; segment < budgets.segments; segment++) {
      const seg = await runWorkSegmentStepV4(taskId, work, runId, segment, messages, knowledge.knowledge_version);
      tokens += seg.usageTokens;
      toolCalls += seg.budget.toolCalls;
      replans += seg.budget.replans;
      transientRetries += seg.budget.transientRetries;
      for (const m of seg.messages) messages.push(m);

      // 0. THE DISPATCH WAS REFUSED. No model was called, no tokens were spent, and no later
      //    segment can succeed either. TERMINAL, with no provider named.
      if (seg.egressRefused) {
        await settle("refused", taskErrorCodeFor("refusal"), egressRefusalPayload(), null);
        break;
      }

      // 1. A committed effect ends the Work, whatever else the segment did.
      if (seg.posted) {
        const confirm = await confirmEntryStep(work, taskId, seg.posted.entry_id);
        let particulars: Record<string, unknown> | null = null;

        // #639 — THE DEPENDENT QUESTION, AND IT OPENS ONLY WHEN THE LEDGER SAYS IT SHOULD. The
        // trigger is not the model's opinion and not the Work's purpose: it is a register row that
        // exists, names this entry as its acquisition, and carries no depreciation method or
        // in-service date. Every ordinary journal Work reads null here and settles exactly as v3's
        // did.
        const pending = await loadPendingFixedAssetStepV4(work, seg.posted.entry_id);
        if (pending) {
          await emitWorkStatusStepV3(work.workId, work.clientId, "awaiting_input");
          const hookToken = await mintHookTokenStep();
          const hook = createHook<WorkResume>({ token: hookToken });
          const asked = particularsQuestionV4(pending);
          // A DOOR CALL RAISES, AND A RAISE HERE MUST NOT UNDO A POSTED ENTRY. Unwrapped, a
          // refusal from `clara.open_work_question` reached the outer catch and settled the Work
          // `failed`/`internal` with "Nothing was posted" — which would be FALSE: the acquisition
          // is on the books and its register row exists. The Work settles COMPLETED with the same
          // honest remainder an expired question leaves, and the particulars stay answerable from
          // the asset's own page.
          const opened = await openWorkQuestionStep(taskId, hookToken, {
            question: asked.question,
            reason: asked.reason,
            context: asked.context,
            sourceRef: asked.sourceRef,
            fields: asked.fields,
          }).catch(() => null);

          if (opened === null) {
            particulars = particularsPendingNote(pending.assetId, "not_opened");
            await settle(
              "completed",
              null,
              null,
              completedResultV4(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens, particulars),
            );
            break;
          }

          await emitWorkQuestionStepV3(opened, work.clientId);

          const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

          if (resolution.kind === "answer") {
            await markRunningStep(taskId);
            await emitWorkStatusStepV3(work.workId, work.clientId, "running");
            // NO SEPARATE AUTHORITY RECHECK HERE, and that is a measured choice rather than an
            // omission: `clara.complete_fixed_asset_particulars_for` takes the initiator as an
            // explicit `p_obo` and rechecks their active membership, the bookkeeper floor and the
            // client's status ITSELF, with a distinct diagnosis for each (0216 §E). A second read
            // before it would be a stale copy of the same three questions.
            const applied = await applyParticularsStepV4(work, pending.assetId, resolution.answer, {
              nonDepreciable: pending.nonDepreciable,
              costCents: pending.costCents,
            });
            particulars = applied.ok
              ? { asset_id: applied.assetId, particulars_complete: true, replayed: applied.replayed }
              : {
                  asset_id: pending.assetId,
                  particulars_complete: false,
                  code: applied.code,
                  reason: applied.reason,
                  field: applied.field,
                  message: applied.message,
                };
          } else {
            particulars = particularsPendingNote(pending.assetId, resolution.kind);
          }
        }

        await settle(
          "completed",
          null,
          null,
          completedResultV4(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens, particulars),
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
      //    detail, from Needs-you, or from the Clara rail. All three post to the SAME door, and all
      //    THREE question tools reach it through this one branch.
      if (seg.question) {
        await emitWorkStatusStepV3(work.workId, work.clientId, "awaiting_input");
        const hookToken = await mintHookTokenStep();
        const hook = createHook<WorkResume>({ token: hookToken });
        // WRAPPED, for the reason the particulars open above is wrapped: 0180's field grammar is a
        // wall the DOOR holds, and a model-supplied field array that trips it (option values that
        // are not distinct, most concretely) must leave a Work a person can read — not a run that
        // died claiming it "failed before it could record an entry".
        const opened = await openWorkQuestionStep(taskId, hookToken, {
          question: seg.question.question,
          reason: seg.question.reason,
          context: seg.question.context,
          sourceRef: seg.question.sourceRef,
          fields: seg.question.fields,
        }).catch(() => null);
        if (opened === null) {
          await settle("failed", "internal", questionNotOpenedPayload(), null);
          break;
        }
        await emitWorkQuestionStepV3(opened, work.clientId);

        const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

        if (resolution.kind === "answer") {
          await markRunningStep(taskId);
          await emitWorkStatusStepV3(work.workId, work.clientId, "running");
          // ROLE LOSS BLOCKS CONTINUATION (#629), asked BEFORE a single token is spent on the
          // resumed segment — and before the resumed segment's own dispatch.
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
                // THE TOOL THE MODEL ACTUALLY CALLED, not a constant. Three tools can park a v4
                // run and a tool result that named the wrong one would be a message the model
                // cannot match to its own call.
                toolName: seg.question.toolName,
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
