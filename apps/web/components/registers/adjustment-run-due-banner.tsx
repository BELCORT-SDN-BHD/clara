"use client";

// clara.adjustment_run_due — a state banner, never a UI-computed figure (hard
// constraint 2, the port-wave plan §5 pattern fa_register_tie/staff_advance_tie
// already set). Rendered verbatim: the DB decides which live template is
// oldest-due (if any) and names every template it found blocked, why.

import { useTranslations } from "next-intl";
import { StateBanner } from "@/components/common/state";
import type { AdjustmentRunDueResult } from "@/lib/registers/adjustments";

export function AdjustmentRunDueBanner({ due }: { due: AdjustmentRunDueResult }) {
  const t = useTranslations("AdjustmentsAccounts.runDue");

  if (due.due) {
    return (
      <StateBanner tone="info">
        {t("due", { start: due.period_start, end: due.period_end })}
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
