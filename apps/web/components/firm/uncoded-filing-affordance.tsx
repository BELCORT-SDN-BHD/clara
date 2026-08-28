"use client";

// The uncoded_filing inline act — registered into ./needs-you-affordances.tsx
// (T7, port-wave plan §4/§5). Delegates to components/documents/
// uncoded-filing-actions.tsx, the SAME component the coding-lane workbench
// uses (never a second, drifting copy of the door-calling logic).

import type { NeedsYouAffordanceProps } from "./needs-you-affordances";
import { UncodedFilingActions } from "@/components/documents/uncoded-filing-actions";

export function UncodedFilingAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  if (!row.client_id || !row.document_id || !row.filing_id) return null;
  return (
    <UncodedFilingActions
      clientId={row.client_id}
      documentId={row.document_id}
      filingId={row.filing_id}
      busy={busy}
      error={error}
      act={act}
    />
  );
}
