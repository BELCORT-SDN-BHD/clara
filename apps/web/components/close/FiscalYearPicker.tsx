"use client";

// The fiscal-year picker — clara.list_fiscal_years(p_client) (0056:2665). Reads
// once per client mount (this component lives OUTSIDE the fiscalYearId-keyed
// ClosePlanPanel, so a plan-only re-derive never re-lists the years).

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listFiscalYears } from "@/lib/close/api";
import type { SessionTokenAccessor } from "@/lib/session";

export function FiscalYearPicker({
  clientId,
  session,
  selected,
  onSelect,
}: {
  clientId: string;
  session: SessionTokenAccessor;
  selected: string | null;
  onSelect: (fiscalYearId: string) => void;
}) {
  const t = useTranslations("ClientClose.picker");
  const { data: years, err } = useHydratedPart(session, (s) => listFiscalYears(clientId, { session: s }));

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

  if (err) return <p className="text-sm text-destructive">{t("error", { message: err })}</p>;
  if (!years) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (years.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

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
          </Button>
        ))}
    </div>
  );
}
