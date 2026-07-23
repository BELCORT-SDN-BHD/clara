// @frozen
//
// FROZEN — the interview family's "use step" DB-effect + streaming primitives, shared by
// firmInterview_v1 + clientOnboarding_v1. Each step is a memoized durable unit (a WDK
// replay re-runs a step at most once). Pools are read from globalThis.__claraPools (the
// AB-16 infra-injection precedent — never imported, so tuning stays out of the frozen
// closure). The interview uses ONLY the runtime lane (withRuntime → update_onboarding_plan,
// clara_runtime GRANT); it mints NO wake credential and holds NO secret (P19).

import { getWritable, getWorkflowMetadata } from "workflow";
import { randomUUID } from "node:crypto";
import { updatePlanWithCas, readPlan, verifyFirmCommitReceipt, type PgExec, type RuntimeExec, type PlanWriteResult, type PlanSnapshot, type PlanItemSnapshot } from "./interview.v1.writer.js";
import type { PlanItemInput } from "./interview.v1.core.js";

type Pools = { withRuntime: RuntimeExec };
function pools(): Pools {
  const p = (globalThis as unknown as { __claraPools?: Pools }).__claraPools;
  if (!p) throw new Error("runtime pools not injected (globalThis.__claraPools) — the supervisor injects them at boot");
  return p;
}

/** Mint a STABLE op_key inside a memoized step (S4-AB4): a WDK replay returns the SAME
 *  uuid, so the receipt-idempotent DB writers (update_onboarding_plan; the dashboard's
 *  create_firm via O7) replay byte-identically across a runtime kill. */
export async function mintOpKeyStep(_label: string): Promise<string> {
  "use step";
  void _label; // WDK keys step memoization by args — distinct labels keep distinct op_key slots
  return randomUUID();
}

/** This run's id, read inside a memoized step (the established autoDraft/chatTurn pattern
 *  reads getWorkflowMetadata ONLY inside a step) so the deterministic hook token
 *  (interview.v1.core hookToken) is stable across replays. */
export async function runIdStep(): Promise<string> {
  "use step";
  return getWorkflowMetadata().workflowRunId;
}

/** Stream the current park's prompt to the run's writable so GET /state can render the
 *  open question. The hook TOKEN is never streamed — a reader learns the park index only,
 *  and resumeHook is server-only, so no resume capability leaks. */
export async function streamPromptStep(prompt: { parkIndex: number; seg: string; phase: string; question: string; scope: string; expects?: string }): Promise<void> {
  "use step";
  const writer = getWritable<unknown>().getWriter();
  try {
    await writer.write({ type: "interview_prompt", ...prompt });
  } finally {
    writer.releaseLock();
  }
}

/** Stream the run's binding owner marker as the FIRST chunk (before any prompt). The answer/
 *  cancel + /state routes read this to bind a runId to its principal (firm) or plan (client)
 *  BEFORE resuming a hook or exposing a prompt stream (F1). No token/secret is streamed. */
export async function streamOwnerStep(marker: { scope: string; principalUserId?: string; planId?: string }): Promise<void> {
  "use step";
  const writer = getWritable<unknown>().getWriter();
  try {
    await writer.write({ type: "interview_owner", ...marker });
  } finally {
    writer.releaseLock();
  }
}

/** Verify a firm create_firm receipt against live DB state BEFORE the plan write (F2). `attempt`
 *  keys memoization per re-park (WDK memoizes a step by its args) so each re-delivered receipt is
 *  verified against FRESH state, never a stale earlier verdict. */
export async function verifyFirmReceiptStep(args: { planId: string; firmId: string; principalUserId: string; attempt?: number }): Promise<boolean> {
  "use step";
  void args.attempt; // memo-distinctness only — the reader ignores it
  return verifyFirmCommitReceipt(pools().withRuntime, { planId: args.planId, firmId: args.firmId, principalUserId: args.principalUserId });
}

/** Stream a terminal marker (complete / cancelled / expired / firm_created) and close. */
export async function streamTerminalStep(marker: Record<string, unknown>): Promise<void> {
  "use step";
  const writer = getWritable<unknown>().getWriter();
  try {
    await writer.write({ type: "interview_terminal", ...marker });
    await writer.close();
  } catch {
    writer.releaseLock?.();
  }
}

/** Read a plan's current revision (runtime SELECT). */
export async function readPlanStep(planId: string): Promise<PlanSnapshot | null> {
  "use step";
  return readPlan(pools().withRuntime, planId);
}

/** Persist one confirmed segment's items under the revision CAS (CLR06 → re-read + retry
 *  once, else surface). opKey/retryOpKey are STABLE (minted via mintOpKeyStep). */
export async function updatePlanStep(args: {
  planId: string;
  expectedRevision: string;
  items: PlanItemInput[];
  answeredBy: string;
  opKey: string;
  retryOpKey: string;
  knownItems?: Readonly<Record<string, string | null>>;
}): Promise<PlanWriteResult> {
  "use step";
  return updatePlanWithCas(pools().withRuntime, args);
}

export type { PgExec, PlanWriteResult, PlanSnapshot, PlanItemSnapshot };
