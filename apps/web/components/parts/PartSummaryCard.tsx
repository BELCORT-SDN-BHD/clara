import { Fragment, type ReactNode } from "react";
import Link from "next/link";

// The shared labeled-identifier-card shape for every receipt-like ClaraPart
// (je_review, doc_review, diff, sweep_receipt, open_question, bank_recon_receipt,
// fixed_asset, depreciation_run_receipt, adjustment_run_receipt, staff_advance,
// and — since MBB-4 — the four chatTurn_v14 kinds entry_posted, question_opened,
// bank_act, bank_pack).
// Renders ids only; it never sums or fabricates a figure — that is the hydrated
// card's job (../../lib/parts/hooks.ts), landing with the specific per-type read fn
// in P3. Extracted from PartRenderer.tsx so each stays independently reviewable.
//
// `children` and `link` are OPTIONAL and additive (MBB-4, 2026-08-29): the ten
// callers above pass neither and render byte-identically to before. `link` takes a
// REAL in-app path only — a card never invents a destination, and a caller that
// cannot build one (an `entry_posted` whose client_id is still "") passes nothing
// rather than a broken href.

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
