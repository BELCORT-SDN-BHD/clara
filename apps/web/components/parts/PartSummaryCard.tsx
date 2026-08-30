import { Fragment, type ReactNode } from "react";
import Link from "next/link";

// The shared labeled-identifier-card shape for every receipt-like ClaraPart.
// Extracted from PartRenderer.tsx so each stays independently reviewable.
//
// THREE KINDS OF CALLER NOW, and the difference is what each knows:
//   - the NINE id-only summary types PartRenderer still renders inline
//     (je_review, doc_review, diff, open_question, bank_recon_receipt,
//     fixed_asset, depreciation_run_receipt, adjustment_run_receipt,
//     staff_advance) — no per-type read is wired for any of them yet;
//   - the four chatTurn_v14 kinds (MBB-4, 2026-08-29: entry_posted,
//     question_opened, bank_act, bank_pack), which render what the wire
//     carries because no read function is keyed on what they address;
//   - the five HYDRATED cards (P6-2, 2026-08-30: the four chatTurn_v16 kinds
//     plus 裁-20's sweep_receipt upgrade), which pass their live DB body as
//     `children`. `sweep_receipt` moved OUT of the first group to join this
//     one — the only member that has ever left it.
//
// THIS COMPONENT ITSELF STILL RENDERS IDS ONLY and never sums or fabricates a
// figure; a hydrated caller does its own reading (../../lib/parts/hooks.ts) and
// hands the result down.
//
// `children` and `link` are OPTIONAL and additive (MBB-4): the nine inline
// callers pass neither and render byte-identically to before. `link` takes a
// REAL in-app path only — a card never invents a destination, and a caller that
// cannot build one (an `entry_posted` whose client_id is still "", an
// `agent_receipt` whose row has not loaded) passes nothing rather than a
// broken href.

export type SummaryRow = [label: string, value: string | null | undefined];

export function PartSummaryCard({
  title,
  rows,
  note,
  children,
  link,
}: {
  title: string;
  rows: SummaryRow[];
  note?: string | null;
  children?: ReactNode;
  link?: { href: string; label: string } | null;
}) {
  const present = rows.filter((r): r is [string, string] => r[1] != null && r[1] !== "");
  return (
    <div className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <span className="font-medium text-card-foreground">{title}</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {present.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate text-card-foreground">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {children}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {link ? (
        <Link href={link.href} className="w-fit text-xs font-medium text-primary underline underline-offset-2">
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}
