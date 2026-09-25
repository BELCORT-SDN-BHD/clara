// @frozen
//
// FROZEN - the claraWork_v7 workflow entry: the CLOSING wave's Work successor (2026-09-26). A
// REPOINT of the `claraWork` registry key, never an edit: v1's ... v6's file sets are
// byte-untouched and stay frozen, built and exported, because a Work admitted under any of them
// may still be parked on its hook when this image deploys (docs/ARCHITECTURE.md SS10,
// #workflow-versioning-and-rollback, policy (b) and (c)).
//
// WHAT CHANGED FROM v6, AND IT IS ONE THING: THE DEPENDENT-PARTICULARS PROPOSAL IS GROUNDED ON
// WHAT THE ESTATE ACTUALLY KNOWS.
//
// `loadFaProposalInputsStepV6` is deploy-locked on `main`, so the consolidated contract in
// `docs/plan/active/riders-2026-09-20/reports/waveS-lane05-fix.md` lands as `claraWork_v7`'s own
// `loadFaProposalInputsStepV7`. Three things move, and each of them is a ground a PERSON already
// wrote down that v6 could not see:
//
//   (a) THE COMPLETENESS PREDICATE. v6 asks two conditions; the estate's own
//       `clara._fa_particulars_complete` asks six. Under the narrow form a register row with a
//       method and a start date but NO USEFUL LIFE reads complete, and the dependent question that
//       would have collected the missing drivers is never opened - so a depreciation schedule is
//       later computed from particulars nobody was asked for.
//   (b) THE CLIENT'S RECORDED DEPRECIATION NOTE (#1090). Migration 0345 catalogues the
//       `depreciation_policy` knowledge key, so what the firm wrote down about this client's
//       policy can ground the proposal.
//   (c) THE ACCOUNT'S RETIRED POLICY (#1092). Migration 0346 gives the read credential a
//       firm-scoped SELECT on `clara.fa_account_depreciation_policies`.
//
// THE MODEL SEES NONE OF THIS. The proposal is not a model act: the dependent question is opened
// by the workflow BODY after a commit, so v7's tool roster gains nothing, no tool takes an input
// for it, and the instructions are v6's text unchanged. What changes is ONE key of the question the
// body already opens - and the person who answers it sees a form that is filled in from grounds
// they themselves recorded, with the sentence naming which one.
//
// WHAT DID NOT CHANGE, AND IS REACHED BY IMPORT: the claim CAS, the Work load, the knowledge read
// and its terminal, the drift read and its replan, the egress dispatch, the chart read, the one
// wake wrapper that posts, the read-back confirm, the park/resume, the budgets, the authority
// recheck, the #639 particulars pair in full, the question finder, #1030's source-correction probe
// and its confirmation park, and "success is decided by a receipt, never by a stream ending"
// (ARCHITECTURE SS6). The TOOL ROSTER IS v6's, unchanged: v7 adds no tool and widens no schema.
// What moves in the bundle is this closure's own ids, so the digest moves and
// `tests/pinned-work-bundle.mjs` can tell a v7 run from a v6 one on the record rather than on the
// calendar.
//
// NO COUPLED MIGRATION, AND NO DEPLOY-ORDER OBLIGATION OF ITS OWN. 0345 and 0346 have been live
// since the riders sweep wave, hosted 2026-09-25 at frontier `0361_reservation_release_advice`.
// v6's own obligation (0321), v5's 0230 and v4's 0192/0216 are inherited unchanged. Against a
// database missing 0345 or 0346 the two new reads throw inside the step's own try, the step
// answers `null` exactly as it does for any unreadable register, and the question opens WITHOUT a
// block - contained, and the same behaviour v6 has today.
//
// ROLLBACK TO v6 narrows the proposal back to the asset's own row and its siblings, and changes no
// database state. A question already opened keeps the block it was opened with: the proposal is a
// value on a durable question row, not something this image re-derives when a person answers.
// THE BUDGETS DO NOT MOVE, and nothing in this cut presses on them: the step that changed runs
// once, after a commit, outside the segment loop.
import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  applyParticularsStepV4,
  claimWorkRunStepV7,
  closeStreamStep,
  completedResultV7,
  confirmEntryStep,
  driftNoteV6,
  driftSpendsReplanV6,
  egressRefusalPayload,
  emitWorkQuestionStepV3,
  emitWorkStatusStepV3,
  loadPendingFixedAssetStepV4,
  knowledgeReadFailedV6,
  loadWorkKnowledgeStepV6,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  openWorkQuestionStep,
  faProposalFromInputsV7,
  loadFaProposalInputsStepV7,
  particularsQuestionV6,
  readKnowledgeDriftStepV6,
  recheckAuthorityStepV3,
  runWorkSegmentStepV7,
  segmentTraceBase,
  settleWorkStepV7,
  loadSourceCorrectionBriefStepV6,
  sourceCorrectionConfirmedV6,
  sourceCorrectionQuestionV6,
  workEnvelopeMessage,
  workErrorPayload,
  SETTLE_TRACE_SEQ,
  type WorkKnowledgeV6,
} from "./claraWork.v7.impl.js";
import { CLARA_WORK_BUDGETS_V7 } from "./claraWork.v7.bundle.js";
import {
  budgetExhaustedPayload,
  knowledgeReadFailedPayload,
  particularsPendingNote,
  questionNotOpenedPayload,
  sourceCorrectionDeclinedPayload,
  sourceCorrectionProbeFailedPayload,
  taskErrorCodeFor,
  workOutcomeFor,
} from "./claraWork.v7.errors.js";
import { WORK_KNOWLEDGE_READ_PURPOSE } from "../lib/knowledge-retrieval.mjs";
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
 * finding, carried by v3 and v4 and carried again).
 */
function recheckRefusalPayload(reason: string, message: string): Record<string, unknown> {
  return { code: reason, reason, message, recoverable: reason === "work_unreadable" };
}

export async function claraWork_v7(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const budgets = CLARA_WORK_BUDGETS_V7;
  let segment = 0;
  let tokens = 0;
  let toolCalls = 0;
  let replans = 0;
  let transientRetries = 0;
  let outcome = "failed";
  let runId = "";
  let knowledge: WorkKnowledgeV6 | null = null;

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
    await settleWorkStepV7(taskId, runId, SETTLE_TRACE_SEQ, { outcome: o, errorCode, error, result });
  };

  try {
    const claim = await claimWorkRunStepV7(taskId);
    // A duplicate start (the route racing the reconciler, or a re-enqueue after a lost
    // acknowledgement) self-aborts here. The FIRST run keeps the task.
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };
    runId = claim.runId;

    const work = await loadWorkStep(taskId);
    await emitWorkStatusStepV3(work.workId, work.clientId, "running");

    // #1030 — THE CONFIRMATION A SUCCESSOR OWES, ASKED BEFORE ANYTHING ELSE HAPPENS.
    //
    // ASKED FOR EVERY WORK, UNCONDITIONALLY. The door answers NULL for an ordinary one, so there
    // is no marker to forget, no column to keep in step and no arm that can be skipped by a Work
    // that does not look like a successor. One read, before the knowledge preload, because a Work
    // a person may stop is not a Work worth reading a client's governed knowledge for.
    //
    // A FAILED READ IS NOT "NOT A SUCCESSOR". See this file's header: it settles the run rather
    // than proceeding as though the answer had been no.
    const correction = await loadSourceCorrectionBriefStepV6(work.workId);
    if (!correction.ok) {
      await settle("failed", "internal", sourceCorrectionProbeFailedPayload(correction.reason), null);
      return { taskId, outcome, segments: 0 };
    }
    if (correction.brief) {
      await emitWorkStatusStepV3(work.workId, work.clientId, "awaiting_input");
      const hookToken = await mintHookTokenStep();
      const hook = createHook<WorkResume>({ token: hookToken });
      const asked = sourceCorrectionQuestionV6(correction.brief);
      // WRAPPED, for the reason the two later opens are wrapped: 0180's field grammar is a wall
      // the DOOR holds, and a field array that trips it must leave a Work a person can read.
      const opened = await openWorkQuestionStep(taskId, hookToken, {
        question: asked.question,
        reason: asked.reason,
        context: asked.context,
        sourceRef: asked.sourceRef,
        fields: asked.fields,
      }).catch(() => null);
      if (opened === null) {
        await settle("failed", "internal", questionNotOpenedPayload(), null);
        return { taskId, outcome, segments: 0 };
      }
      await emitWorkQuestionStepV3(opened, work.clientId);

      const confirmation = await hook; // PARK — nothing may post until this is answered

      // A CONFIRMATION IS A POSITIVE ACT. An expiry, a cancellation and an answer that does not
      // say "record" all stop the Work with nothing posted: the person was shown both figures and
      // did not say yes, and the estate's standing position after a correction is that the
      // instruction has to be given again.
      if (confirmation.kind !== "answer" || !sourceCorrectionConfirmedV6(confirmation.answer)) {
        await settle("cancelled", taskErrorCodeFor("cancelled"), sourceCorrectionDeclinedPayload(), null);
        return { taskId, outcome, segments: 0 };
      }
      await markRunningStep(taskId);
      await emitWorkStatusStepV3(work.workId, work.clientId, "running");
      // ROLE LOSS BLOCKS CONTINUATION (#629), asked BEFORE a single token is spent — the same
      // recheck the question resume inside the loop performs, for the same reason: a human's
      // answer can arrive days later.
      const authority = await recheckAuthorityStepV3(taskId);
      if (!authority.ok) {
        await settle("refused", taskErrorCodeFor("refusal"), recheckRefusalPayload(authority.reason, authority.message), null);
        return { taskId, outcome, segments: 0 };
      }
    }

    // ONE READ, BEFORE THE LOOP, and its answer is data in the opening message. A per-segment read
    // would put the same block in the journal four times and could hand two segments of one run
    // two different watermarks to reason on — v4's reason, unchanged.
    //
    // THE PERIOD IS NULL BECAUSE THIS LANE HAS NONE IN HAND. A documentless journal Work carries a
    // posting date in its basis, but the basis is the HUMAN's and re-deriving a retrieval window
    // from it would be this body making an accounting judgement. The door then marks the rows
    // against the server's Asia/Kuala_Lumpur calendar date, which is the right default; a later
    // lane that KNOWS the period it is working passes that period's date instead.
    knowledge = await loadWorkKnowledgeStepV6(
      work.clientId, work.firmId, null, WORK_KNOWLEDGE_READ_PURPOSE, taskId, runId,
    );

    // D16 / R-D. ANY unavailable answer, and nothing has been posted because nothing has run.
    // The rule is `knowledgeReadFailedV6`, a pure predicate in the impl, so that "fires on any
    // unavailable" and "never fires on an ok answer with an empty core" are claims a cell drives
    // rather than claims a reader has to take from this line.
    if (knowledgeReadFailedV6(knowledge)) {
      await settle("failed", "internal", knowledgeReadFailedPayload(work.clientId, knowledge.reason), null);
      return { taskId, outcome, segments: 0 };
    }

    const envelope = knowledge.text
      ? `${workEnvelopeMessage(work)}\n\n${knowledge.text}`
      : workEnvelopeMessage(work);
    const messages: ModelMessage[] = [{ role: "user", content: envelope } as unknown as ModelMessage];

    for (; segment < budgets.segments; segment++) {
      const seg = await runWorkSegmentStepV7(taskId, work, runId, segment, messages, knowledge.knowledge_version);
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
        // in-service date. Every ordinary journal Work reads null here and settles exactly as v4's
        // did. v4's bodies, by import — this cut changes nothing about them.
        const pending = await loadPendingFixedAssetStepV4(work, seg.posted.entry_id);
        if (pending) {
          await emitWorkStatusStepV3(work.workId, work.clientId, "awaiting_input");
          const hookToken = await mintHookTokenStep();
          const hook = createHook<WorkResume>({ token: hookToken });
          // #933 (A10) - THE PROPOSAL, DERIVED BEFORE THE QUESTION OPENS. The read never throws
          // and the derivation cannot fail: a register this run cannot read, or a shape the
          // module's own schema refuses, yields `null` and the question opens exactly as v5's did.
          // What a proposal adds is the ONE key `proposalSourceRef` puts beside the asset id, and
          // `apps/web/components/work/work-question-form.tsx` already reads that shape.
          const proposalInputs = await loadFaProposalInputsStepV7(work, pending);
          const asked = particularsQuestionV6(pending, faProposalFromInputsV7(proposalInputs));
          // A DOOR CALL RAISES, AND A RAISE HERE MUST NOT UNDO A POSTED ENTRY. Unwrapped, a
          // refusal from `clara.open_work_question` reached the outer catch and settled the Work
          // `failed`/`internal` with "Nothing was posted" — which would be FALSE: the acquisition
          // is on the books and its register row exists.
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
              completedResultV7(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens, particulars, knowledge),
            );
            break;
          }

          await emitWorkQuestionStepV3(opened, work.clientId);

          const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

          if (resolution.kind === "answer") {
            await markRunningStep(taskId);
            await emitWorkStatusStepV3(work.workId, work.clientId, "running");
            // NO AUTHORITY RECHECK AND NO DRIFT READ HERE, and both absences are measured rather
            // than omissions. `clara.complete_fixed_asset_particulars_for` takes the initiator as
            // an explicit `p_obo` and rechecks their active membership, the bookkeeper floor and
            // the client's status ITSELF (0216 §E), so a second read would be a stale copy. And a
            // DRIFT note has nowhere to go: this resume feeds a TYPED DOOR, not a model turn —
            // there is no segment to re-enter, no replan to spend, and telling nobody about a
            // moved key is better than spending a budget on a message no model will read.
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
          completedResultV7(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens, particulars, knowledge),
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
        // wall the DOOR holds, and a model-supplied field array that trips it must leave a Work a
        // person can read — not a run that died claiming it "failed before it could record an
        // entry".
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
                // THE TOOL THE MODEL ACTUALLY CALLED, not a constant. Three tools can park a v5
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

          // #658's REPLAN TRIGGER. A human's answer can arrive days later, and the firm may have
          // recorded, revised or withdrawn a fact in between. Asked ONCE per resume, AFTER the
          // authority recheck (an unauthorised run should not spend a read) and BEFORE the next
          // segment — its trace row is the first of that segment's four.
          //
          // AND ONLY WHEN THERE IS A NEXT SEGMENT (fix round 1, review ADV-S-3). The drift row is
          // `segmentTraceBase(segment + 1)`, and on the LAST segment's resume that number is
          // `segmentTraceBase(budgets.segments)` = `SETTLE_TRACE_SEQ`: the run leaves the loop
          // immediately after this branch, settles, and `clara.record_work_execution_trace`'s
          // `on conflict (work_id, run_id, seq) do nothing` then DROPS the settle's own row —
          // outcome, refusal and receipt — onto a drift row, with no error anywhere, because both
          // writers swallow the answer. The guard is also the honest reading of the act: a resume
          // that cannot re-enter a segment has nothing to re-plan with, so a read whose news
          // nobody can act on is not worth a row, a round trip, or a replan charged against it.
          const drift = segment + 1 < budgets.segments
            ? await readKnowledgeDriftStepV6(
              work.firmId, work.workId, taskId, runId, segmentTraceBase(segment + 1),
            )
            : null;
          const note = drift === null ? null : driftNoteV6(drift);
          if (note !== null) {
            // A RELEVANT DRIFT SPENDS ONE EXISTING `budget.replans`, AND ONLY A RELEVANT ONE.
            // `relevant:true` is the estate saying a key THIS run recorded reading has moved: the
            // resumed segment is genuinely re-planning against a changed basis, and that is what
            // the replan allowance is for. `relevant:null` and an unreadable drift are SURFACED
            // and spend nothing — charging a budget for news the estate could not confirm would
            // let an unreadable diagnostic exhaust a run.
            if (drift !== null && driftSpendsReplanV6(drift)) {
              if (replans >= budgets.replans) {
                // The allowance is gone and the basis has moved under this run. Carrying on would
                // re-plan without the budget that bounds re-planning; settling is RECOVERABLE and
                // a Retry starts from the current basis.
                await settle("failed", "limit", budgetExhaustedPayload("replans"), null);
                break;
              }
              replans += 1;
            }
            messages.push({ role: "user", content: note } as unknown as ModelMessage);
          }
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
