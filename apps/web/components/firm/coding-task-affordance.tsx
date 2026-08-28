"use client";

// The coding_task inline act — registered into ./needs-you-affordances.tsx
// (T7, port-wave plan §4/§5). Delegates to components/documents/
// coding-task-actions.tsx, the SAME component the coding-lane workbench uses.
//
// F1, independent review: the error renders HERE — see
// uncoded-filing-affordance.tsx's own header for why (this surface's
// `error` is a raw `unknown` exception, the RIGHT renderer for it is
// `ErrorMessage`, not the workbench's own `ActionRefusal`).

import type { NeedsYouAffordanceProps } from "./needs-you-affordances";
import { CodingTaskActions } from "@/components/documents/coding-task-actions";
import { ErrorMessage } from "./data-state";

export function CodingTaskAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  if (!row.task_id || !row.filing_id) return null;
  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      <CodingTaskActions taskId={row.task_id} filingId={row.filing_id} busy={busy} act={act} />
    </div>
  );
}
