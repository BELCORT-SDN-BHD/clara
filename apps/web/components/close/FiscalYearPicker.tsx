"use client";

// The fiscal-year picker — presentational. `years`/`err` are now HYDRATED BY
// THE PARENT (ClosePage), not by this component (review finding M1): both the
// picker AND the selected year's close plan must reload after every door act,
// or the screen can show two contradictory statuses for the same year (a
// picker badge reading "closed" next to a plan panel that just abandoned the
// run) — lifting the fetch to one shared place is what lets ClosePlanPanel
// trigger both reloads from a single `act()`.

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import type { FiscalYearRow } from "@/lib/close/types";

export function FiscalYearPicker({
  years,
  err,
  selected,
  onSelect,
}: {
  years: FiscalYearRow[] | null;
  err: string | null;
  selected: string | null;
  onSelect: (fiscalYearId: string) => void;
}) {
  const t = useTranslations("ClientClose.picker");

  // Default to the most recently opened year once the list first loads — never
  // overrides a human's own later selection.
  useEffect(() => {
    if (years && years.length > 0 && selected === null) {
      const byOrdinal = [...years].sort((a, b) => b.ordinal - a.ordinal);
      const first = byOrdinal[0];
      if (first) onSelect(first.fiscal_year_id);
    }
    // Deliberately keyed on `years` alone (not `selected`/`onSelect`) — this
    // project's eslint config does not register react-hooks/exhaustive-deps
    // (lib/parts/hooks.ts's own header), so no suppression comment is needed.
  }, [years]);

  if (err) return <StateBanner tone="error">{t("error", { message: err })}</StateBanner>;
  if (!years) return <LoadingState>{t("loading")}</LoadingState>;
  if (years.length === 0) return <EmptyState>{t("empty")}</EmptyState>;

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("ariaLabel")}>
      {[...years]
        .sort((a, b) => b.ordinal - a.ordinal)
        .map((fy) => (
          <Button
            key={fy.fiscal_year_id}
            role="tab"
            aria-selected={fy.fiscal_year_id === selected}
            variant={fy.fiscal_year_id === selected ? "default" : "outline"}
            size="sm"
            onClick={() => onSelect(fy.fiscal_year_id)}
          >
            {fy.label}
            <Badge variant="secondary" className="ml-1.5">
              {fy.status}
            </Badge>
            {/* M2 (independent review): 0056:2678-2682's own honest tell — a
                year reading `open` that was once closed and then reopened is
                NOT the same as a year that was never closed at all. */}
            {fy.has_active_reopen_receipt ? (
              <Badge variant="outline" className="ml-1">{t("reopened")}</Badge>
            ) : null}
          </Button>
        ))}
    </div>
  );
}
