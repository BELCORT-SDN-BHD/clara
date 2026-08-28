"use client";

// AR/AP aging (clara.ar_aging/ap_aging) — pre-bucketed by the DB; this component
// never sums a bucket or a running balance (hard constraint 2). AR/AP is a LOCAL
// toggle (not URL state, unlike the parent's tab) — switching it re-reads via an
// explicit reload(), since useAsyncRead's own mount effect fires exactly once.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadAging, type AgingDomain } from "@/lib/registers/aging";
import { businessToday } from "@/lib/business-date";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";
// T8 (port-wave plan §4/§5, team-lead's brief): the aging tab's own content
// extends with the counterparty statement (selection-driven, this file's own
// AR/AP-toggle precedent) and the counterparty hygiene panel — NO tab-array
// edit (Q3's closed IA stays untouched; TABS above is unmodified).
import { CounterpartyStatementPanel } from "./counterparty-statement-panel";
import { CounterpartyHygienePanel } from "./counterparty-hygiene-panel";

export function AgingRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.aging");
  const tc = useTranslations("Common");
  const [domain, setDomain] = useState<AgingDomain>("ar");
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<string | null>(null);
  const asOf = businessToday();
  const { data, loading, error, reload } = useAsyncRead(() => loadAging(sessionTokenAccessor, domain, clientId, asOf));

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // T8: switching AR/AP invalidates whatever counterparty was selected
    // under the PRIOR domain — a stale id surviving the toggle would feed
    // the statement panel a domain/counterparty pairing that never came
    // from a real selection in this domain.
    setSelectedCounterpartyId(null);
    void reload();
  }, [domain, reload]);

  const rows = data?.counterparties ?? [];
  const selectedRow = rows.find((r) => r.counterparty_id === selectedCounterpartyId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* P3 polish: a selected-one-of-N control, painted the way every other
          one in the product already is (close's fiscal-year picker, the
          reopen dialog's correction-target group) — <Button> with
          default-vs-outline carrying the selection. `aria-pressed` stays: this
          is a filter toggle, NOT a section switcher, so it is deliberately not
          <SectionTabs>. */}
      <div className="flex flex-wrap items-center gap-2">
        {(["ar", "ap"] as const).map((d) => (
          <Button
            key={d}
            type="button"
            size="sm"
            variant={domain === d ? "default" : "outline"}
            aria-pressed={domain === d}
            onClick={() => setDomain(d)}
          >
            {t(d)}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">{t("asOf", { date: asOf })}</span>
      </div>
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("counterparty")}</TableHead>
              <TableHead>{t("current")}</TableHead>
              <TableHead>{t("d3160")}</TableHead>
              <TableHead>{t("d6190")}</TableHead>
              <TableHead>{t("d91plus")}</TableHead>
              <TableHead>{t("total")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.counterparty_id} aria-selected={r.counterparty_id === selectedCounterpartyId}>
                <TableCell>{r.counterparty_name ?? r.counterparty_id.slice(0, 8)}</TableCell>
                <TableCell>{fmtCents(r.current_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell>{fmtCents(r.d31_60_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell>{fmtCents(r.d61_90_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell>{fmtCents(r.d91_plus_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell className="font-medium">{fmtCents(r.total_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="xs"
                    variant={r.counterparty_id === selectedCounterpartyId ? "default" : "outline"}
                    aria-pressed={r.counterparty_id === selectedCounterpartyId}
                    onClick={() => setSelectedCounterpartyId((cur) => (cur === r.counterparty_id ? null : r.counterparty_id))}
                  >
                    {t("viewStatement")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {data?.totals ? (
            <TableFooter>
              <TableRow>
                <TableCell>{t("totalsRow")}</TableCell>
                <TableCell>{fmtCents(data.totals.current_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell>{fmtCents(data.totals.d31_60_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell>{fmtCents(data.totals.d61_90_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell>{fmtCents(data.totals.d91_plus_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell>{fmtCents(data.totals.total_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          ) : null}
        </DataTableCard>
      </DataState>

      {selectedRow ? (
        <CounterpartyStatementPanel
          // Remount on domain/counterparty change (lib/parts/hooks.ts's own
          // header: a captured id that changes must key-remount, never rely
          // on a fresh loader closure alone to re-trigger a load).
          key={`${domain}-${selectedRow.counterparty_id}`}
          clientId={clientId}
          domain={domain}
          counterpartyId={selectedRow.counterparty_id}
          counterpartyName={selectedRow.counterparty_name ?? selectedRow.counterparty_id.slice(0, 8)}
          agingItems={selectedRow.items}
        />
      ) : null}

      <CounterpartyHygienePanel clientId={clientId} />
    </div>
  );
}
