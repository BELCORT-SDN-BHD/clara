// @frozen
//
// FROZEN — the claraWork_v5 workflow entry: the wave 2026-09-18 integration cut. A REPOINT of the
// `claraWork` registry key, never an edit: v1's, v2's, v3's and v4's file sets are byte-untouched
// and stay frozen, built and exported, because a Work admitted under any of them may still be
// parked on its hook when this image deploys (docs/ARCHITECTURE.md §10,
// #workflow-versioning-and-rollback, policy (b) and (c)).
//
// WHAT CHANGED FROM v4, IN FIVE LINES.
//   1. THE RUN READS THE CLIENT'S GOVERNED KNOWLEDGE THROUGH A BOUNDED, CORE-FIRST DOOR, AND
//      RECORDS WHAT IT READ. `clara.retrieve_knowledge` replaces v4's `clara.get_knowledge_pack`
//      recency view, and `clara.record_work_knowledge_read` writes the read-set row that makes
//      "what did Clara actually see?" a question with an answer.
//   2. AND THAT READ CAN NOW END THE RUN. `knowledge_read_failed` — settles `failed`/`internal`,
//      RECOVERABLE, NOTHING POSTED — fires on any `unavailable` answer. See the block below: this
//      is the one place v5 is stricter than v4, and it is the point of the cut.
//   3. TWO NEW READS IN THE ROSTER, BOTH EXECUTE-ING. `read_knowledge_source` and
//      `read_knowledge_history` let a run look ONE record up in full, or read its revision
//      history, when the bounded block clipped something that matters. Neither writes a row,
//      neither mints a part, both spend `budget.toolCalls`.
//   4. A RESUMED RUN IS TOLD WHETHER THE BASIS MOVED WHILE IT WAITED. After an answered question,
//      `clara.work_knowledge_drift_for` is asked once; a RELEVANT drift spends ONE EXISTING
//      `budget.replans` and the resumed segment is told what moved. Budgets do not move.
//   5. THE BUNDLE IS `clara-work/v5` with a SEVEN-name roster whose digest finally covers each
//      tool's JSON SCHEMA and its declared dependencies — ARCHITECTURE:435-445, binding since v4
//      and unmet by v4.
//
// PLUS TWO RIDERS THAT TOUCH THIS FILE NOT AT ALL AND ARE NAMED SO A READER CAN FIND THEM:
// #847's writer-side trace bounds live in `claraWork.v5.impl.ts` (through the new sibling
// `lib/work-trace-bounds.mjs`; `lib/work-trace.mjs` is NOT opened), and #882(a)'s one-row CLR40
// reclassification lives in `claraWork.v5.errors.ts`.
//
// WHY A FAILED KNOWLEDGE READ STOPS THE RUN, WHEN v4's DID NOT — BECAUSE THE READ CHANGED.
// v4's rule was "a Work's authority is its ADMITTED BASIS and a context read may not decide the
// accounting", and for a RECENCY DUMP that was right: losing the twenty most recently written
// facts about a client costs colour, not correctness. `clara.retrieve_knowledge` is a different
// thing. Its CORE tier is, by the database's own definition, what this client's work always needs
// — the currency, the framework, the policies the firm wrote down — and posting to a client's
// books while unable to see any of it is a confident mistake rather than a graceful degradation.
// DECISIONS §6.2.0 R-D ratified the strict reading, and it ratified WHY the terminal is all-or-
// nothing: the door decides all three tiers in ONE statement and catches nothing, so there is no
// per-tier readability signal and this body must not be written as though there were. An
// `{status:'ok'}` answer never fires it, however small `tiers.core` is — a client that genuinely
// has nothing recorded is not a failed read, and stopping every Work for every new client would
// be the same defect pointing the other way.
//
// WHAT DID NOT CHANGE, AND IS REACHED BY IMPORT: the claim CAS, the Work load, the egress dispatch
// and its two-phase shape, the chart read, the one wake wrapper that posts, the read-back confirm,
// the park/resume, the budgets, the authority recheck, the #639 particulars pair in full, the
// question finder, and the "success is decided by a receipt, never by a stream ending" rule
// (ARCHITECTURE §6).
//
// THE CRASH WINDOWS ARE v4's, PLUS ONE THIS CUT ADDS AND CLOSES IN THE SAME BREATH:
//   · after the KNOWLEDGE READ was recorded and before the workflow checkpointed — the
//     re-executed step reaches `clara.record_work_knowledge_read` on the same
//     `(work_id, run_id, seq)` and lands on the ORIGINAL row. If the re-read genuinely saw
//     something different, the step records its own NEXT seq rather than pretending the estate
//     holds what it just sent (claraWork.v5.impl.ts states the bound and why it converges).
//
// THE DEPLOY ORDER IS OWED IN ONE DIRECTION. MIGRATION 0230 MUST BE LIVE BEFORE THIS IMAGE RUNS
// ANY WORK, on top of v4's own 0192/0216 and v3's 0195. Against a database without 0230 the
// knowledge read classifies the missing function as `read_failed` — and under this body that is
// now `knowledge_read_failed`, so EVERY Work stops, refusing to post rather than posting blind.
// CONTAINED, corrupting nothing, and loud: a whole lane that refuses is a page anybody notices,
// which is the correct failure for a deploy-order mistake. The REVERSE order is FREE: 0230 against
// a v4 image adds a relation and verbs nothing calls.
//
// ROLLBACK TO v4 returns the knowledge preload to `clara.get_knowledge_pack`, stops offering the
// two reads, stops recording read-sets and stops checking drift, and changes no database state.
// Read-set rows already written stay and stay readable. It is NOT free while 0230 is live in the
// sense v3's note means: a Work parked on a v5 question stays ANSWERABLE under a v4 image (the
// doors are the database's), and the resumed v4 run will simply not be told about drift — so a
// rollback should drain parked questions first rather than assume they resume identically.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  applyParticularsStepV4,
  claimWorkRunStepV5,
  closeStreamStep,
  completedResultV5,
  confirmEntryStep,
  driftNoteV5,
  driftSpendsReplanV5,
  egressRefusalPayload,
  emitWorkQuestionStepV3,
  emitWorkStatusStepV3,
  loadPendingFixedAssetStepV4,
  knowledgeReadFailedV5,
  loadWorkKnowledgeStepV5,
  loadWorkStep,
  markRunningStep,
  mintHookTokenStep,
  openWorkQuestionStep,
  particularsQuestionV4,
  readKnowledgeDriftStepV5,
  recheckAuthorityStepV3,
  runWorkSegmentStepV5,
  segmentTraceBase,
  settleWorkStepV5,
  workEnvelopeMessage,
  workErrorPayload,
  SETTLE_TRACE_SEQ,
  type WorkKnowledgeV5,
} from "./claraWork.v5.impl.js";
import { CLARA_WORK_BUDGETS_V5 } from "./claraWork.v5.bundle.js";
import {
  budgetExhaustedPayload,
  knowledgeReadFailedPayload,
  particularsPendingNote,
  questionNotOpenedPayload,
  taskErrorCodeFor,
  workOutcomeFor,
} from "./claraWork.v5.errors.js";
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

export async function claraWork_v5(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const budgets = CLARA_WORK_BUDGETS_V5;
  let segment = 0;
  let tokens = 0;
  let toolCalls = 0;
  let replans = 0;
  let transientRetries = 0;
  let outcome = "failed";
  let runId = "";
  let knowledge: WorkKnowledgeV5 | null = null;

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
    await settleWorkStepV5(taskId, runId, SETTLE_TRACE_SEQ, { outcome: o, errorCode, error, result });
  };

  try {
    const claim = await claimWorkRunStepV5(taskId);
    // A duplicate start (the route racing the reconciler, or a re-enqueue after a lost
    // acknowledgement) self-aborts here. The FIRST run keeps the task.
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };
    runId = claim.runId;

    const work = await loadWorkStep(taskId);
    await emitWorkStatusStepV3(work.workId, work.clientId, "running");

    // ONE READ, BEFORE THE LOOP, and its answer is data in the opening message. A per-segment read
    // would put the same block in the journal four times and could hand two segments of one run
    // two different watermarks to reason on — v4's reason, unchanged.
    //
    // THE PERIOD IS NULL BECAUSE THIS LANE HAS NONE IN HAND. A documentless journal Work carries a
    // posting date in its basis, but the basis is the HUMAN's and re-deriving a retrieval window
    // from it would be this body making an accounting judgement. The door then marks the rows
    // against the server's Asia/Kuala_Lumpur calendar date, which is the right default; a later
    // lane that KNOWS the period it is working passes that period's date instead.
    knowledge = await loadWorkKnowledgeStepV5(
      work.clientId, work.firmId, null, WORK_KNOWLEDGE_READ_PURPOSE, taskId, runId,
    );

    // D16 / R-D. ANY unavailable answer, and nothing has been posted because nothing has run.
    // The rule is `knowledgeReadFailedV5`, a pure predicate in the impl, so that "fires on any
    // unavailable" and "never fires on an ok answer with an empty core" are claims a cell drives
    // rather than claims a reader has to take from this line.
    if (knowledgeReadFailedV5(knowledge)) {
      await settle("failed", "internal", knowledgeReadFailedPayload(work.clientId, knowledge.reason), null);
      return { taskId, outcome, segments: 0 };
    }

    const envelope = knowledge.text
      ? `${workEnvelopeMessage(work)}\n\n${knowledge.text}`
      : workEnvelopeMessage(work);
    const messages: ModelMessage[] = [{ role: "user", content: envelope } as unknown as ModelMessage];

    for (; segment < budgets.segments; segment++) {
      const seg = await runWorkSegmentStepV5(taskId, work, runId, segment, messages, knowledge.knowledge_version);
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
          const asked = particularsQuestionV4(pending);
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
              completedResultV5(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens, particulars, knowledge),
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
          completedResultV5(seg.posted, confirm.confirmed, { toolCalls, replans, transientRetries }, segment + 1, tokens, particulars, knowledge),
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
            ? await readKnowledgeDriftStepV5(
              work.firmId, work.workId, taskId, runId, segmentTraceBase(segment + 1),
            )
            : null;
          const note = drift === null ? null : driftNoteV5(drift);
          if (note !== null) {
            // A RELEVANT DRIFT SPENDS ONE EXISTING `budget.replans`, AND ONLY A RELEVANT ONE.
            // `relevant:true` is the estate saying a key THIS run recorded reading has moved: the
            // resumed segment is genuinely re-planning against a changed basis, and that is what
            // the replan allowance is for. `relevant:null` and an unreadable drift are SURFACED
            // and spend nothing — charging a budget for news the estate could not confirm would
            // let an unreadable diagnostic exhaust a run.
            if (drift !== null && driftSpendsReplanV5(drift)) {
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
