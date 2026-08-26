import { Fragment } from "react";

// The shared labeled-identifier-card shape for every receipt-like ClaraPart
// (je_review, doc_review, diff, sweep_receipt, open_question, bank_recon_receipt,
// fixed_asset, depreciation_run_receipt, adjustment_run_receipt, staff_advance).
// Renders ids only; it never sums or fabricates a figure — that is the hydrated
// card's job (../../lib/parts/hooks.ts), landing with the specific per-type read fn
// in P3. Extracted from PartRenderer.tsx so each stays independently reviewable.

export type SummaryRow = [label: string, value: string | null | undefined];

export function PartSummaryCard({ title, rows, note }: { title: string; rows: SummaryRow[]; note?: string | null }) {
  const present = rows.filter((r): r is [string, string] => r[1] != null && r[1] !== "");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <span className="font-medium text-card-foreground">{title}</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {present.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate text-card-foreground">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
