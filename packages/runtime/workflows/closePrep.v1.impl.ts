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
import { closePrepEngineId, recordClosePrepUsage } from "./closePrep.v1.usage.js";

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

  const usageTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  if (rec.acts > 0) return { outcome: { kind: "proposed", acts: rec.acts }, usageTokens };
  // A pass that READ and lawfully found nothing to do is a success — "finding nothing to do is a
  // correct outcome" is in the prompt because it is true of the settle too.
  if (rec.reads > 0) {
    return { outcome: { kind: "nothing_due", note: text.slice(0, 500) || "nothing due for this client" }, usageTokens };
  }
  // Never read anything at all: the run cannot say it looked, so it must not settle as though it
  // did. Absence is not evidence (review law 2) — this falls to the failed branch.
  return {
    outcome: { kind: "refused", code: "model_error", message: text.slice(0, 500) || "the run ended without reading anything" },
    usageTokens,
  };
}

/** STEP 3 — the settlement. One verb; a direct_queue task has no outbox row to cascade to. */
export async function settleCloseTaskStep(taskId: string, outcome: "completed" | "failed", errorCode: string | null): Promise<void> {
  "use step";
  await pools().withRuntime((c: PgExec) => settleCloseTask(c, taskId, outcome, errorCode));
}
