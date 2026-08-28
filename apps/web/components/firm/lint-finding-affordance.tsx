"use client";

// The lint_finding inline act — registered into ./needs-you-affordances.tsx
// (T7, port-wave plan §4/§5). Delegates to components/documents/
// lint-finding-actions.tsx, the SAME component the coding-lane workbench uses.

import type { NeedsYouAffordanceProps } from "./needs-you-affordances";
import { LintFindingActions } from "@/components/documents/lint-finding-actions";

export function LintFindingAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  if (!row.finding_id) return null;
  return <LintFindingActions findingId={row.finding_id} busy={busy} error={error} act={act} />;
}
