"use client";

// #938 — "a bill posted inside an accrued period", rendered on the Accruals page beside the
// configured-accruals table. Reads the SAME clara.list_review_queue row (row_kind=
// 'accrual_bill_conflict', apps/web/lib/firm/needs-you.ts) the firm-wide Needs-you inbox reads,
// scoped to this one client via useReviewQueue — the identical hook, act()-and-reload cycle and
// DoorRefusal-surfaces-verbatim contract the inbox itself uses (lib/firm/use-review-queue.ts),
// never a second read or a bespoke write path. The two remedies are the SAME two doors the
// inbox's own AccrualBillConflictAffordance calls (lib/accruals/api.ts's reverseAccrualNow /
// skipNextAccrualOccurrence) — one shared implementation, two surfaces.
//
// DERIVED, NEVER STORED (CONTEXT.md's "Settlement candidate row" shape): nothing here is
// dismissed or cleaned up. The row disappears from the NEXT read the moment its own reversal is
// admitted or the client no longer has an open, unreversed, document-conflicting accrual.

import { useState } from "react";
import { useTranslations } from "next-intl";

import Link from "next/link";
import { DataState } from "@/components/firm/data-state";
import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/bank/money";
import { sideLabel } from "./accruals-list";
import { journalEntryHref } from "@/lib/navigation/tree";
import { useReviewQueue } from "@/lib/firm/use-review-queue";
import { reverseAccrualNow, skipNextAccrualOccurrence } from "@/lib/accruals/api";
import { sessionTokenAccessor } from "@/lib/session-accessor";

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
            <AccrualBillConflictItem
              key={`${row.row_kind}:${row.id}`}
              row={row}
              clientId={clientId}
              busy={q.busy}
              onAct={q.act}
            />
          ))}
        </ul>
      </DataState>
    </section>
  );
}

function AccrualBillConflictItem({
  row,
  clientId,
  busy,
  onAct,
}: {
  row: ReturnType<typeof useReviewQueue>["rows"][number];
  clientId: string;
  busy: boolean;
  onAct: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("Accruals");
  const tn = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");

  if (!row.period) return null;
  const planId = row.id;
  const dueDate = row.period;

  const reverseNow = () =>
    onAct(() => reverseAccrualNow(planId, dueDate, { session: sessionTokenAccessor }).then(() => undefined));

  const submitSkip = async () => {
    if (!reason.trim()) return;
    const ok = await onAct(() =>
      skipNextAccrualOccurrence(planId, dueDate, reason.trim(), { session: sessionTokenAccessor }).then(
        () => undefined,
      ),
    );
    if (ok) {
      setSkipping(false);
      setReason("");
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm">{row.question_text}</p>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {/* #942 — WHICH ACCRUAL THIS IS ABOUT. The two remedies read differently on the two
            sides (reversing an accrued FEE releases income, not a cost), so the item says which
            one it is rather than leaving it to the sentence alone. */}
        <span>{t("billConflictSide", { side: sideLabel(t, row.accrual_side ?? "expense") })}</span>
        <span>{t("billConflictPeriod", { period: dueDate })}</span>
        {row.amount_cents !== null ? (
          <span>{t("billConflictAmount", { amount: formatCents(row.amount_cents) })}</span>
        ) : null}
        {row.entry_id ? (
          <Link className="underline underline-offset-2" href={journalEntryHref(clientId, row.entry_id)}>
            {t("billConflictViewEntry")}
          </Link>
        ) : null}
      </div>
      {skipping ? (
        <div className="flex flex-col gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={tn("accrualBillConflictSkipReasonPlaceholder")}
            aria-label={tn("accrualBillConflictSkipReasonPlaceholder")}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submitSkip()} disabled={busy || !reason.trim()}>
              {busy ? tn("submitting") : tn("accrualBillConflictSkipConfirm")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSkipping(false);
                setReason("");
              }}
              disabled={busy}
            >
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void reverseNow()} disabled={busy}>
            {tn("accrualBillConflictReverseNow")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setSkipping(true)} disabled={busy}>
            {tn("accrualBillConflictSkipNext")}
          </Button>
        </div>
      )}
    </li>
  );
}
