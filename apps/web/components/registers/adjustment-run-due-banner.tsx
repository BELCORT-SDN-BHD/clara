"use client";

// clara.adjustment_run_due — a state banner, never a UI-computed figure (hard
// constraint 2, the port-wave plan §5 pattern fa_register_tie/staff_advance_tie
// already set). Rendered verbatim: the DB decides which live template is
// oldest-due (if any) and names every template it found blocked, why.
//
// [#927/#928, riders wave 3] THE DUE BRANCH NO LONGER INVITES AN ACT. The oracle still answers
// `due: true` for a client carrying a live pre-retirement template, and it is right to — the
// period really is unposted. But #927 closed `clara.run_adjustment_manual` and #928 deleted the
// daily sweep, so nothing left in the product can post it: the old sentence ("An adjustment run
// is due for …") named an obligation with no discharge, on the very tab D6 keeps readable for a
// firm that ran this lane before the retirement. The fact is still reported — which period, and
// that it will never post — with the successor named. The `all_blocked` and `nothing_due` arms
// are unchanged: neither ever invited an act.

import { useTranslations } from "next-intl";
import { StateBanner } from "@/components/common/state";
import type { AdjustmentRunDueResult } from "@/lib/registers/adjustments";

export function AdjustmentRunDueBanner({ due }: { due: AdjustmentRunDueResult }) {
  const t = useTranslations("AdjustmentsAccounts.runDue");

  if (due.due) {
    return (
      <StateBanner tone="warning">
        {t("dueRetired", { start: due.period_start, end: due.period_end })}
      </StateBanner>
    );
  }
  const reasonLabels: Record<string, string> = {
    nothing_due: t("nothingDue"),
    all_blocked: t("allBlocked"),
    client_not_found: t("clientNotFound"),
  };
  return (
    <StateBanner tone={due.reason === "nothing_due" ? "neutral" : "warning"}>
      {reasonLabels[due.reason] ?? t("unknownReason", { reason: due.reason })}
    </StateBanner>
  );
}
