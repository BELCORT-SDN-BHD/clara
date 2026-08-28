"use client";

// The uncoded_filing inline act — registered into ./needs-you-affordances.tsx
// (T7, port-wave plan §4/§5). Delegates to components/documents/
// uncoded-filing-actions.tsx, the SAME component the coding-lane workbench
// uses (never a second, drifting copy of the door-calling logic).
//
// F1, independent review: the error itself renders HERE, not inside the
// shared action component — `error` on this surface is `useReviewQueue`'s
// raw `unknown` exception (never pre-split into a string + a separate
// `clr`), so `ErrorMessage` (the SAME instanceof-based classifier
// OpenQuestionAffordance already uses) is the correct renderer, not
// `ActionRefusal` (built for the workbench's OWN, differently-shaped
// `useHydratedPart` err/clr pair).

import type { NeedsYouAffordanceProps } from "./needs-you-affordances";
import { UncodedFilingActions } from "@/components/documents/uncoded-filing-actions";
import { ErrorMessage } from "./data-state";

export function UncodedFilingAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  if (!row.client_id || !row.document_id || !row.filing_id) return null;
  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      <UncodedFilingActions
        clientId={row.client_id}
        documentId={row.document_id}
        filingId={row.filing_id}
        busy={busy}
        act={act}
      />
    </div>
  );
}
