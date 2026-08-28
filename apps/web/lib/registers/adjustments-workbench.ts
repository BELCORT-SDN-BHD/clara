// The T4 governance bundle — feeds useHydratedPart for the write ceremony
// (template propose/sign/retire, run-now, reverse/approve/cancel pair). Reads
// three sources in parallel and returns them as one envelope so a single
// act()/reload() cycle re-derives everything the ceremony's own components
// need after every write, hydrate-never-trust (lib/parts/hooks.ts).
//
// This does NOT replace adjustments.ts's plain table reads (loadAdjustmentTemplates/
// loadAdjustmentRuns) that adjustments-register.tsx's passive summary already uses —
// the port-wave plan's own ruling (Q3) is that apps/web reads the adjustment tables
// directly, and this train "must not replace working table reads with RPC reads." This
// bundle is ADDITIONAL: `listAdjustmentRuns` (an RPC) is wired here specifically because
// it is the only way to get the DB's own per-run correctability projection (never
// re-derived client-side, hard constraint 2) that the pair-reversal ceremony needs and
// the plain table read cannot provide.
//
// F4 (independent review, 2026-08-28 — "consider" language, recorded rather than silently
// skipped): the three reads ride ONE Promise.all, so a single failing read (e.g. a narrow
// permission edge case on adjustment_run_due) blanks BOTH the run-history panel and the
// pair-reversal ledger, even when the other two reads succeeded. Decoupling into three
// independently-failable fields would need useHydratedPart's single err/clr model to widen
// into a per-field shape — a real redesign, not a one-line fix. Left coupled for this pass;
// the caller (adjustments-register.tsx) at least tells loading/unavailable/live-panel apart
// honestly now, which was F4's actual should-fix half.

import { listAdjustmentRuns, loadAdjustmentPairReversals, adjustmentRunDue } from "./adjustments";
import type { AdjustmentRunWithCorrection, AdjustmentPairReversalRow, AdjustmentRunDueResult } from "./adjustments";
import type { SessionTokenAccessor } from "@/lib/session";

export type AdjustmentGovernanceBundle = {
  runs: AdjustmentRunWithCorrection[];
  pairReversals: AdjustmentPairReversalRow[];
  due: AdjustmentRunDueResult;
};

export async function loadAdjustmentGovernance(session: SessionTokenAccessor, clientId: string): Promise<AdjustmentGovernanceBundle> {
  const [runs, pairReversals, due] = await Promise.all([
    listAdjustmentRuns(session, clientId),
    loadAdjustmentPairReversals(session, clientId),
    adjustmentRunDue(session, clientId),
  ]);
  return { runs, pairReversals, due };
}
