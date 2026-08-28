"use client";

// The lint_finding inline act — registered into ./needs-you-affordances.tsx
// (T7, port-wave plan §4/§5). Delegates to components/documents/
// lint-finding-actions.tsx, the SAME component the coding-lane workbench uses.
//
// F1, independent review: the error renders HERE — see
// uncoded-filing-affordance.tsx's own header for why.

import type { NeedsYouAffordanceProps } from "./needs-you-affordances";
import { LintFindingActions } from "@/components/documents/lint-finding-actions";
import { ErrorMessage } from "./data-state";

export function LintFindingAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  if (!row.finding_id) return null;
  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      <LintFindingActions findingId={row.finding_id} busy={busy} act={act} />
    </div>
  );
}
