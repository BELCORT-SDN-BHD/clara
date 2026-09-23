"use client";

// #938 — the inline act on an `accrual_bill_conflict` row: "reverse now" (clara.request_plan_
// catch_up, the EXISTING plan-lane door, unchanged) and "skip this period's next occurrence"
// (clara.skip_plan_occurrence, #938's own new door). Registered in ./needs-you-affordances.tsx,
// the open_question-affordance.tsx pattern every inline affordance follows: its own file, one
// line in that table, never a branch added to needs-you-row.tsx itself.
//
// THE ROW'S `id` IS THE PLAN's OWN ID, and `period` is the flagged occurrence's own due date as
// ISO text — lib/firm/needs-you.ts's REVIEW_QUEUE_ROW_KINDS entry for this kind states why. Both
// doors below take exactly those two values, byte for byte, never a value this component derives.
//
// "REVERSE NOW" MAY HONESTLY REFUSE. Reversing before the scheduled reversal date is not
// possible — the DoorRefusal (`catch_up_in_future`) surfaces verbatim through `error`, exactly
// as any other refused act does; nothing here pretends an early reversal happened.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reverseAccrualNow, skipNextAccrualOccurrence } from "@/lib/accruals/api";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "./data-state";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

export function AccrualBillConflictAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  const t = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");

  // Both remedies need the plan id (the row's shared `id`) and the flagged occurrence's own due
  // date (`period`, carried as ISO `YYYY-MM-DD` text — see the row_kind's own grounding).
  if (!row.period) return null;
  const planId = row.id;
  const dueDate = row.period;

  const reverseNow = () =>
    act(() => reverseAccrualNow(planId, dueDate, { session: sessionTokenAccessor }).then(() => undefined));

  const submitSkip = async () => {
    if (!reason.trim()) return;
    const ok = await act(() =>
      skipNextAccrualOccurrence(planId, dueDate, reason.trim(), { session: sessionTokenAccessor }).then(
        () => undefined,
      ),
    );
    // N13: clear only on success — a refusal must not discard what the human typed.
    if (ok) {
      setSkipping(false);
      setReason("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      {skipping ? (
        <div className="flex flex-col gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("accrualBillConflictSkipReasonPlaceholder")}
            aria-label={t("accrualBillConflictSkipReasonPlaceholder")}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submitSkip()} disabled={busy || !reason.trim()}>
              {busy ? t("submitting") : t("accrualBillConflictSkipConfirm")}
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
            {t("accrualBillConflictReverseNow")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setSkipping(true)} disabled={busy}>
            {t("accrualBillConflictSkipNext")}
          </Button>
        </div>
      )}
    </div>
  );
}
