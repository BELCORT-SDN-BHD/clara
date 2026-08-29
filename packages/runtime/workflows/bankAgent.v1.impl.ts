// @frozen
//
// FROZEN — part of the bankAgent_v1 closure (see bankAgent.v1.infra.ts for what this class is).
//
// THIS FILE (impl) — the three durable steps: claim, run the model, settle. Each is a WDK
// "use step", so each commits its own transaction before the next can begin, and a crash
// resumes at the step boundary rather than replaying the whole run.
//
// THE ORDER IS THE CONTRACT. Claim first, always: nothing consequential — no credential mint,
// no tool call, no egress — may happen before this run has proven its own task still says
// 'running' and belongs to it. That is the closing wall wake-engine.mjs's module header names
// as this build's own obligation (#5/#8), and putting it anywhere but first would defeat it.

import { streamText, isStepCount } from "ai";
import { getWritable, getWorkflowMetadata } from "workflow";
import {
  pools,
  claimBankTask,
  settleBankTask,
  resolveModel,
  type BankTaskContext,
  type ClaimOutcome,
  type PgExec,
} from "./bankAgent.v1.infra.js";
import { SYSTEM_PROMPT_BANK_AGENT_V1, BANK_AGENT_STEP_BUDGET, type BankAgentOutcome } from "./bankAgent.v1.prompt.js";
import { buildBankAgentTools, newBankRunRecord } from "./bankAgent.v1.tools.js";
import { bankAgentEngineId, recordBankAgentUsage } from "./bankAgent.v1.usage.js";

/** STEP 1 — the CAS-and-bind. Returns a plain, non-secret verdict; a false claim is a clean
 *  stand-down the workflow entry turns into a no-op return, never a thrown error. */
export async function claimBankTaskStep(taskId: string): Promise<ClaimOutcome> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  assertRealRunId(workflowRunId);
  return pools().withRuntime((c: PgExec) => claimBankTask(c, taskId, workflowRunId));
}

/** THE ENTIRE DUPLICATE-START WALL RESTS ON THIS VALUE BEING REAL, so it is checked rather than
 *  assumed (review law 3: prove an identifier IS what its name claims).
 *
 *  The failure mode is silent and total. If workflowRunId were ever null/undefined, the driver
 *  binds NULL and the claim predicate becomes
 *    set workflow_run_id = null where … and (workflow_run_id is null or workflow_run_id = null)
 *  whose FIRST disjunct is true for every unbound row: the claim SUCCEEDS, binds nothing, and two
 *  concurrent runs both "hold" the same task — #8 defeated completely, with the row additionally
 *  left running-with-no-run so the reconciler re-enqueues a third.
 *
 *  A THROW IS THE RIGHT REFUSAL HERE, not a returned verdict: it happens before `holds` is set,
 *  so nothing is settled, and the row stays exactly where the reconciler's own recovery expects
 *  to find it. Under the WDK this value is always populated — that is precisely why an unchecked
 *  one would never be noticed until the day it was not. */
export function assertRealRunId(runId: unknown): asserts runId is string {
  if (typeof runId !== "string" || runId.length === 0) {
    throw new Error(`workflow run id is not a usable identity (${String(runId)}) — refusing to claim, because a null run id makes the duplicate-start CAS pass for every unbound row`);
  }
}

/** The model pass's own reduced result. NOTHING SECRET CROSSES THIS BOUNDARY — the credential
 *  was minted, used and discarded inside the step below (the secret law), and what returns is a
 *  count, a note and token numbers. */
export type BankModelResult = { outcome: BankAgentOutcome; usageTokens: number };

/**
 * STEP 2 — one model pass over the four tools.
 *
 * WHY THE ADMITTED COUNT COMES FROM THE TOOL RECORD, NOT THE MODEL'S SUMMARY. The model's
 * closing text is prose for a human; it is not evidence of what happened. The record counts
 * only replies the DATABASE itself marked admitted (bankAgent.v1.tools.ts's countIfAdmitted),
 * so "acted" is a read of the books, never the model's claim about the books. Constraint 2 in
 * its narrowest form: no model-generated numeral reaches a durable row, and the settle record's
 * own act count is derived from DB replies alone.
 */
export async function runBankAgentModelStep(ctx: BankTaskContext, modelId: string): Promise<BankModelResult> {
  "use step";
  const startedAt = Date.now();
  const rec = newBankRunRecord();
  const tools = buildBankAgentTools(ctx, modelId, rec);
  const dueLine = ctx.dueReason
    ? `The clock woke you because: ${ctx.dueReason}. Confirm that against the pack before you act on it.`
    : "The clock woke you for this account. Read the pack and work out what, if anything, is due.";

  // The two casts below: the provider union is not expressible against the test-injected mock,
  // and a heterogeneous tool map is not expressible as one AI-SDK tool type. The same two casts
  // every sibling lane in this estate carries (autoDraft.v9.impl.ts), for the same two reasons.
  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(modelId) as any,
    system: SYSTEM_PROMPT_BANK_AGENT_V1,
    messages: [{ role: "user", content: dueLine }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [isStepCount(BANK_AGENT_STEP_BUDGET)],
  });

  // The WDK writable is drained even though nothing subscribes to this lane's stream: leaving
  // it unread would leak the writer's lock for the rest of the step. The parts themselves are
  // deliberately discarded — an unattended pass has no viewer, and its durable record is the
  // receipts the DB verbs wrote, never a transcript.
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
    await recordBankAgentUsage(ctx, bankAgentEngineId(modelId), { durationMs: Date.now() - startedAt }, "error");
    throw err;
  } finally {
    writer.releaseLock();
  }

  await recordBankAgentUsage(
    ctx,
    bankAgentEngineId(modelId),
    { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, durationMs: Date.now() - startedAt },
    rec.admitted > 0 ? "success" : "refused",
  );

  const usageTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  return { outcome: classifyBankOutcome(rec, text), usageTokens };
}

/** THE SETTLE DECISION, extracted so it can be driven directly — see closePrep.v1.impl.ts's own
 *  copy for why (review law 1: this decides whether the night was a success, and through the
 *  model step it was reachable by no test at all). */
export function classifyBankOutcome(
  rec: { admitted: number; digest: string | null; infraFaults: number },
  text: string,
): BankAgentOutcome {
  if (rec.admitted > 0) return { kind: "acted", acts: rec.admitted };
  // A pass that read the pack and lawfully found nothing to do is a SUCCESS, not a failure —
  // "stopping early is a correct outcome" is in the prompt because it is true of the settle too.
  // N11 — the PARTIAL failure, the mirror of closePrep's. If the pack read succeeded and every ACT
  // was blocked by our own fault, this branch would settle COMPLETED with nothing on the record.
  // A false failure costs one wasted retry; a false success costs a reconciliation that silently
  // never happened. For an unattended nightly lane the asymmetry is not close.
  if (rec.digest !== null && rec.admitted === 0 && rec.infraFaults > 0) {
    return { kind: "refused", code: "internal", message: "the pack read succeeded but every act was blocked by a fault on our side" };
  }
  if (rec.digest !== null) {
    return { kind: "nothing_due", note: text.slice(0, 500) || "nothing due on this account" };
  }
  // Never even read the pack: the run cannot say it looked, so it must not settle as though it
  // did. Absence is not evidence (review law 2) — this falls through to the failed branch.
  // AND IT MUST NOT BLAME THE MODEL FOR OUR BUGS (S9). A tool call that never reached the database
  // — pools, a credential mint, a driver fault — means whatever went wrong was ours, and
  // `internal` is the honest code. Only a run where the model genuinely never called a tool, or
  // every call was a real DB verdict, is 'model_error'. This is the one field a dead-letter triage
  // reads first.
  return {
    kind: "refused",
    code: rec.infraFaults > 0 ? "internal" : "model_error",
    message: text.slice(0, 500) || "the run ended without reading the bank pack",
  };
}

/** STEP 3 — the settlement. One verb, both projections, idempotent on replay. */
export async function settleBankTaskStep(taskId: string, outcome: "completed" | "failed", errorCode: string | null): Promise<void> {
  "use step";
  await pools().withRuntime((c: PgExec) => settleBankTask(c, taskId, outcome, errorCode));
}
