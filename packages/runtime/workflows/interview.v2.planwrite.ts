// @frozen
//
// The firm plan write, with its retries and its failure park — extracted from the workflow body
// so the one property that matters can be driven without an engine: SUCCESS IS ONLY EVER
// REPORTED FOR A WRITE THAT LANDED.
//
// WHY IT EXISTS (finding L6, the worst of the adversarial round). The loop used to be three
// bounded CAS attempts inline in `firmInterview.v2.ts`, followed unconditionally by a
// `firm_created` terminal. When a concurrent editor touched the same identity items before each
// attempt, all three returned `stale_conflict`, the loop simply ran out, and the run announced
// success: the firm existed, the person was told their profile was recorded, and the plan held
// either nothing of the eleven answers or somebody else's competing values. A durable run that
// cannot finish its work must say so and stay resumable — which is what a park is for.
//
// Everything here is injected (`ask`, `mintOpKey`, `updatePlan`), so the caller supplies memoized
// WDK steps in production and stubs in a test. The module holds no "workflow" import and mints no
// credential; it is pure orchestration over the caller's effects.

import { fingerprintMap, type PlanItemSnapshot, type PlanWriteResult } from "./interview.v1.writer.js";
import { isAffirmative, type AskFn, type PlanItemInput } from "./interview.v2.core.js";

/** The effects the loop needs. Production passes the memoized steps; tests pass stubs. */
export type PlanWriteDeps = {
  ask: AskFn;
  mintOpKey: (label: string) => Promise<string>;
  updatePlan: (args: {
    planId: string;
    expectedRevision: string;
    items: PlanItemInput[];
    answeredBy: string;
    opKey: string;
    retryOpKey: string;
    knownItems?: Readonly<Record<string, string | null>>;
  }) => Promise<PlanWriteResult>;
};

export type PlanWriteOutcome =
  | { status: "written"; rounds: number }
  | { status: "abandoned"; resolution: "cancelled" | "expired"; conflictingKeys: string[]; rounds: number };

/** Attempts per round before the person is asked what to do. */
const ATTEMPTS_PER_ROUND = 3;

/** True iff the answer to the failure park asks for another round. "retry" is the word the
 *  question itself offers, so it must be the word that works — a park whose own instruction is
 *  rejected is a trap. Plain affirmatives are accepted too, because people type "yes". */
export function wantsPlanWriteRetry(resolution: { kind: string; value?: unknown }): boolean {
  if (resolution.kind !== "answer") return false;
  const said = String(resolution.value ?? "").trim().toLowerCase();
  return said === "retry" || said === "again" || isAffirmative(resolution.value);
}

/**
 * Write the firm's intended-record, retrying a bounded number of times per round and PARKING —
 * loudly, resumably, naming the conflict — whenever a round is exhausted.
 *
 * Returns `written` only when a write actually landed. There is no path from exhaustion to
 * success: an abandoned outcome is a distinct value the caller must handle, not a fall-through.
 */
export async function writeFirmPlanWithRetries(
  deps: PlanWriteDeps,
  args: {
    planId: string;
    items: PlanItemInput[];
    answeredBy: string;
    revision: string;
    knownItems: Record<string, string | null>;
  },
): Promise<PlanWriteOutcome> {
  let revision = args.revision;
  let knownItems = args.knownItems;
  let conflictingKeys: string[] = [];

  for (let round = 0; ; round++) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_ROUND; attempt++) {
      // The op_key label carries BOTH counters: a WDK step is memoized by its arguments, so a
      // later round reusing `firm_plan_write#0` would replay the first round's op_key against a
      // revision that has since moved — a receipt-hash CLR10 rather than a write.
      const opKey = await deps.mintOpKey(`firm_plan_write#${round}#${attempt}`);
      const write = await deps.updatePlan({
        planId: args.planId,
        expectedRevision: revision,
        items: args.items,
        answeredBy: args.answeredBy,
        opKey,
        retryOpKey: `${opKey}:retry`,
        knownItems,
      });
      if (write.status !== "stale_conflict") return { status: "written", rounds: round + 1 };
      revision = write.revisionToken;
      conflictingKeys = write.conflictingKeys ?? conflictingKeys;
      if (write.liveItems) knownItems = fingerprintMap(write.liveItems as PlanItemSnapshot[]);
    }

    // EXHAUSTION IS NOT SUCCESS. The firm genuinely exists — create_firm already returned a
    // verified receipt, and pretending otherwise would be a worse lie than saying nothing — so the
    // park reports precisely which half failed and leaves the run resumable.
    const resolve = await deps.ask({
      seg: "plan_write",
      phase: "q",
      question:
        `The firm was created, but its profile could not be saved: another editor changed the same ` +
        `plan items during all ${ATTEMPTS_PER_ROUND} attempts (stale_conflict` +
        `${conflictingKeys.length ? ` on ${conflictingKeys.join(", ")}` : ""}). ` +
        `None of your answers are lost — they are held in this run. Reply “retry” once the other ` +
        `edit has settled, or “cancel” to leave the profile unwritten and complete it from the plan page.`,
    });
    if (!wantsPlanWriteRetry(resolve)) {
      return {
        status: "abandoned",
        resolution: resolve.kind === "expired" ? "expired" : "cancelled",
        conflictingKeys,
        rounds: round + 1,
      };
    }
  }
}
