// @frozen
//
// FROZEN — part of the closePrep_v1 closure (see closePrep.v1.infra.ts for what this class is).
//
// THIS FILE (impl) — the three durable steps: claim, run the model, settle. Same order and same
// reasoning as bankAgent.v1.impl.ts: claim FIRST and unconditionally, because nothing
// consequential — no credential mint, no wrapper call — may happen before this run has proven
// its own task still says 'running' and belongs to it.

import { streamText, isStepCount } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import {
  pools,
  claimCloseTask,
  settleCloseTask,
  resolveModel,
  type CloseTaskContext,
  type ClaimOutcome,
  type PgExec,
} from "./closePrep.v1.infra.js";
import { SYSTEM_PROMPT_CLOSE_PREP_V1, CLOSE_PREP_STEP_BUDGET, type ClosePrepOutcome } from "./closePrep.v1.prompt.js";
import { buildClosePrepTools, newCloseRunRecord } from "./closePrep.v1.tools.js";
import { closePrepEngineId, recordClosePrepUsage, onUsageProblem } from "./closePrep.v1.usage.js";

/** STEP 1 — the CAS-and-bind. A false claim is a clean stand-down, never a thrown error. */
export async function claimCloseTaskStep(taskId: string): Promise<ClaimOutcome> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  assertRealRunId(workflowRunId);
  return pools().withRuntime((c: PgExec) => claimCloseTask(c, taskId, workflowRunId));
}

/** The duplicate-start wall rests on this value being real — see bankAgent.v1.impl.ts's own copy
 *  for the full statement of the failure mode (a NULL run id makes the claim predicate's first
 *  disjunct true for every unbound row, so two runs both "hold" the same task). Duplicated rather
 *  than shared because a frozen closure may not import a mutable module, and importing the bank
 *  closure's copy would splice two frozen bodies into one hash. A throw is the right refusal: it
 *  lands before `holds` is set, so nothing settles and the reconciler recovers the row. */
export function assertRealRunId(runId: unknown): asserts runId is string {
  if (typeof runId !== "string" || runId.length === 0) {
    throw new Error(`workflow run id is not a usable identity (${String(runId)}) — refusing to claim, because a null run id makes the duplicate-start CAS pass for every unbound row`);
  }
}

/** NOTHING SECRET CROSSES THIS BOUNDARY — the credential was minted, used and discarded inside
 *  the step below; what returns is a verdict, a note and token counts. */
export type CloseModelResult = { outcome: ClosePrepOutcome; usageTokens: number };

/**
 * STEP 2 — one model pass over the twelve wrappers.
 *
 * THE ACT COUNT IS A READ OF THE BOOKS, NOT OF THE MODEL. The record counts only replies the
 * database itself marked admitted (closePrep.v1.reads.ts's countIfAdmitted). The model's closing
 * text is prose for a human and is never evidence of what happened — constraint 2 in its
 * narrowest form.
 */
export async function runClosePrepModelStep(ctx: CloseTaskContext, modelId: string): Promise<CloseModelResult> {
  "use step";
  const startedAt = Date.now();
  const rec = newCloseRunRecord();
  const tools = buildClosePrepTools(ctx, modelId, rec);

  // The two casts below: the provider union is not expressible against the test-injected mock,
  // and a heterogeneous tool map is not expressible as one AI-SDK tool type. The same two casts
  // every sibling lane in this estate carries (autoDraft.v9.impl.ts), for the same two reasons.
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(modelId) as any,
    system: SYSTEM_PROMPT_CLOSE_PREP_V1,
    messages: [
      {
        role: "user",
        content:
          "A fiscal year for this client has ended and nobody has started closing it. Find out what is true, clear what is mechanically yours to clear, and leave a proposal a human can settle in the morning.",
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [isStepCount(CLOSE_PREP_STEP_BUDGET)],
  });

  // The WDK writable is drained even though nothing subscribes to this lane's stream — leaving
  // it unread would leak the writer's lock for the rest of the step. The parts are deliberately
  // discarded: an unattended pass has no viewer, and its durable record is the receipts the
  // wrappers wrote (clara.agent_act_receipts, written in-transaction by _agent_close_receipt),
  // never a transcript.
  const writer = getWritable<unknown>().getWriter();
  let text = "";
  let usage: { inputTokens?: number; outputTokens?: number } = {};
  try {
    for await (const part of result.fullStream) {
      if ((part as { type?: string }).type === "text-delta") {
        const delta = (part as { text?: string }).text;
        if (typeof delta === "string") text += delta;
      }
    }
    usage = ((await result.usage) ?? {}) as { inputTokens?: number; outputTokens?: number };
  } catch (err) {
    await recordClosePrepUsage(ctx, closePrepEngineId(modelId), { durationMs: Date.now() - startedAt }, "error");
    throw err;
  } finally {
    writer.releaseLock();
  }

  await recordClosePrepUsage(
    ctx,
    closePrepEngineId(modelId),
    { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, durationMs: Date.now() - startedAt },
    rec.acts > 0 ? "success" : "refused",
  );

  // N12 (independent review) — A PARTIAL SUCCESS IS STILL A SUCCESS: the acts landed with durable
  // receipts, and failing the run would discard real work. But this is precisely the run nobody
  // looks at, so a fault on our side must not vanish. It goes out through the sink whose stated
  // purpose is exactly this — "a lane that has stopped metering says so instead of looking
  // healthy". No behaviour change; one signal.
  //
  // EMITTED HERE, INSIDE THE STEP, AND THAT PLACEMENT IS LOAD-BEARING — the build taught it. An
  // earlier draft called onUsageProblem from classifyCloseOutcome, and the WDK bundler refused
  // the whole build: reaching the usage module from that function pulled `node:crypto` (via
  // closeOpKey in the infra module) into WORKFLOW scope, where Node modules are unavailable
  // ("Move this function into a step function"). Steps may use Node modules; workflow-scope code
  // may not. So the classifier stays PURE and testable, and the side effect lives in the step.
  const note = infraFaultNote(rec);
  if (note) onUsageProblem({ reason: "write_failed", detail: note });

  const usageTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  return { outcome: classifyCloseOutcome(rec, text), usageTokens };
}

/** The N12 signal, as a PURE function so it can be driven by a cell (the emission itself lives in
 *  the step, for the build reason above). Null when there is nothing to say — a clean run must
 *  stay silent, or the signal becomes noise a reader learns to ignore. */
export function infraFaultNote(rec: { acts: number; infraFaults: number }): string | null {
  if (rec.acts <= 0 || rec.infraFaults <= 0) return null;
  return `close_prep run succeeded with ${rec.acts} act(s) but ${rec.infraFaults} tool call(s) never reached the database`;
}

/**
 * THE SETTLE DECISION, extracted so it can be driven directly (review law 1: this is judgement
 * logic — it decides whether the night was a success — and it was previously only reachable
 * through a model call, i.e. not reachable by any test at all).
 */
export function classifyCloseOutcome(
  rec: { acts: number; reads: number; infraFaults: number },
  text: string,
): ClosePrepOutcome {
  if (rec.acts > 0) return { kind: "proposed", acts: rec.acts };
  // A pass that READ and lawfully found nothing to do is a success — "finding nothing to do is a
  // correct outcome" is in the prompt because it is true of the settle too.
  //
  // N11 — BUT ONLY IF NOTHING ON OUR SIDE BROKE. S9 fixed the TOTAL failure's attribution; this is
  // the PARTIAL one, and it is the shape with no durable trace at all. If the reads succeed and
  // every WRITE is blocked by our own fault, reads > 0 would take this branch and settle the task
  // COMPLETED — and for assertTailBinding's throw the failure lands BEFORE the DB call, so no
  // receipt is written either. A single drifted propose_close call site would mean every close run
  // reads fine, proposes nothing, and reports a green night with literally nothing on the record.
  // That is the same silent-green class as M4, one layer up, and worse: M4 at least left twelve
  // refused receipts behind.
  //
  // THE ASYMMETRY DECIDES IT, and for an unattended nightly lane it is not close. A false failure
  // costs one wasted retry — the next wake picks the client up again. A false SUCCESS costs a
  // close that silently never gets prepared, invisibly, with nobody looking. So an infra fault in
  // a zero-act run is reported as a failure even though reads succeeded.
  if (rec.reads > 0 && rec.acts === 0 && rec.infraFaults > 0) {
    return { kind: "refused", code: "internal", message: "reads succeeded but every act was blocked by a fault on our side" };
  }
  if (rec.reads > 0) {
    return { kind: "nothing_due", note: text.slice(0, 500) || "nothing due for this client" };
  }
  // Never read anything at all: the run cannot say it looked, so it must not settle as though it
  // did. Absence is not evidence (review law 2) — this falls to the failed branch.
  //
  // BUT IT MUST NOT BLAME THE MODEL FOR OUR BUGS (S9). If any tool call never reached the database
  // — pools, a credential mint, assertTailBinding's throw, a driver fault — then whatever went
  // wrong was ours, and `internal` is the honest code. Only a run where the model genuinely never
  // called a tool, or every call was a real DB verdict, is 'model_error'. This is the one field a
  // dead-letter triage reads first, so a wrong attribution here is expensive later.
  return {
    kind: "refused",
    code: rec.infraFaults > 0 ? "internal" : "model_error",
    message: text.slice(0, 500) || "the run ended without reading anything",
  };
}

/** STEP 3 — the settlement. One verb; a direct_queue task has no outbox row to cascade to. */
export async function settleCloseTaskStep(taskId: string, outcome: "completed" | "failed", errorCode: string | null): Promise<void> {
  "use step";
  await pools().withRuntime((c: PgExec) => settleCloseTask(c, taskId, outcome, errorCode));
}
