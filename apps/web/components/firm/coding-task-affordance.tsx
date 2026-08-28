"use client";

// The coding_task inline act — registered into ./needs-you-affordances.tsx
// (T7, port-wave plan §4/§5). Delegates to components/documents/
// coding-task-actions.tsx, the SAME component the coding-lane workbench uses.

import type { NeedsYouAffordanceProps } from "./needs-you-affordances";
import { CodingTaskActions } from "@/components/documents/coding-task-actions";

export function CodingTaskAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  if (!row.task_id || !row.filing_id) return null;
  return <CodingTaskActions taskId={row.task_id} filingId={row.filing_id} busy={busy} error={error} act={act} />;
}
