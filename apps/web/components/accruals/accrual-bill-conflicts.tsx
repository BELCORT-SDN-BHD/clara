"use client";

// #938 — "a document posted inside an accrued period", rendered on the Accruals page beside the
// configured-accruals table. Reads the SAME clara.list_review_queue row (row_kind=
// 'accrual_bill_conflict', apps/web/lib/firm/needs-you.ts) the firm-wide Needs-you inbox reads,
// scoped to this one client via useReviewQueue — the identical hook, act()-and-reload cycle and
// DoorRefusal-surfaces-verbatim contract the inbox itself uses (lib/firm/use-review-queue.ts),
// never a second read or a bespoke write path.
//
// ONE IMPLEMENTATION, TWO SURFACES — and now literally one (fix round 1). This item used to carry
// its OWN copy of the skip/reverse state machine, byte-for-byte the inbox affordance's: the
// standards review named it as Duplicated Code and let it stand at two call sites, and the fix
// round then had THREE more things to add to both (the document link, the remedy hint, the
// plan-status face). Two copies of a growing state machine is how the two surfaces drift, so the
// remedies, the facts they act on and every sentence about them now come from the ONE component
// the inbox mounts (components/firm/accrual-bill-conflict-affordance.tsx). What stays here is the
// page's own chrome: the section, the sentence and the accrued amount to compare the document
// against.
//
// DERIVED, NEVER STORED (CONTEXT.md's "Settlement candidate row" shape): nothing here is
// dismissed or cleaned up. The row disappears from the NEXT read the moment its own reversal is
// admitted or the client no longer has an open, unreversed, document-conflicting accrual.

import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { SectionHeader } from "@/components/common/section-header";
import { AccrualBillConflictAffordance } from "@/components/firm/accrual-bill-conflict-affordance";
import { formatCents } from "@/lib/bank/money";
import { useReviewQueue } from "@/lib/firm/use-review-queue";

export function AccrualBillConflicts({ clientId }: { clientId: string }) {
  const t = useTranslations("Accruals");
  const q = useReviewQueue({ client_id: clientId });
  const rows = q.rows.filter((r) => r.row_kind === "accrual_bill_conflict");

  if (!q.loading && !q.error && rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("billConflictsHeading")}</SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("billConflictsBody")}</p>
      <DataState loading={q.loading} error={q.error} isEmpty={rows.length === 0} emptyMessage="">
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={`${row.row_kind}:${row.id}`} className="flex flex-col gap-2 rounded-md border p-3">
              <p className="text-sm">{row.question_text}</p>
              {row.amount_cents !== null ? (
                <p className="text-xs text-muted-foreground">
                  {t("billConflictAmount", { amount: formatCents(row.amount_cents) })}
                </p>
              ) : null}
              {/* The side, the flagged period, the document that collided, both remedies and every
                  sentence about them — the SAME component the Needs-you inbox mounts for this row
                  kind. `error` is null because this section's own DataState already renders
                  `q.error` (the shared hook holds one error for the read and the act alike). */}
              <AccrualBillConflictAffordance row={row} busy={q.busy} error={null} act={q.act} />
            </li>
          ))}
        </ul>
      </DataState>
    </section>
  );
}
