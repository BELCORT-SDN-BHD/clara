"use client";

// AR/AP aging (clara.ar_aging/ap_aging) — pre-bucketed by the DB; this component
// never sums a bucket or a running balance (hard constraint 2). AR/AP is a LOCAL
// toggle (not URL state, unlike the parent's tab) — switching it re-reads via an
// explicit reload(), since useAsyncRead's own mount effect fires exactly once.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadAging, type AgingDomain } from "@/lib/registers/aging";
import { businessToday } from "@/lib/registers/business-date";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "@/components/firm/data-state";

export function AgingRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.aging");
  const tc = useTranslations("Common");
  const [domain, setDomain] = useState<AgingDomain>("ar");
  const asOf = businessToday();
  const { data, loading, error, reload } = useAsyncRead(() => loadAging(sessionTokenAccessor, domain, clientId, asOf));

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void reload();
  }, [domain, reload]);

  const rows = data?.counterparties ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["ar", "ap"] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={domain === d}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              domain === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
            onClick={() => setDomain(d)}
          >
            {t(d)}
          </button>
        ))}
        <span className="self-center text-xs text-muted-foreground">{t("asOf", { date: asOf })}</span>
      </div>
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("counterparty")}</th>
                <th className="py-2 pr-4 font-medium">{t("current")}</th>
                <th className="py-2 pr-4 font-medium">{t("d3160")}</th>
                <th className="py-2 pr-4 font-medium">{t("d6190")}</th>
                <th className="py-2 pr-4 font-medium">{t("d91plus")}</th>
                <th className="py-2 pr-4 font-medium">{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.counterparty_id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-card-foreground">{r.counterparty_name ?? r.counterparty_id.slice(0, 8)}</td>
                  <td className="py-2 pr-4 text-card-foreground">{fmtCents(r.current_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4 text-card-foreground">{fmtCents(r.d31_60_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4 text-card-foreground">{fmtCents(r.d61_90_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4 text-card-foreground">{fmtCents(r.d91_plus_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4 font-medium text-card-foreground">{fmtCents(r.total_cents, tc("centsUnsafe"))}</td>
                </tr>
              ))}
            </tbody>
            {data?.totals ? (
              <tfoot>
                <tr className="text-xs font-medium text-foreground">
                  <td className="py-2 pr-4">{t("totalsRow")}</td>
                  <td className="py-2 pr-4">{fmtCents(data.totals.current_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4">{fmtCents(data.totals.d31_60_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4">{fmtCents(data.totals.d61_90_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4">{fmtCents(data.totals.d91_plus_cents, tc("centsUnsafe"))}</td>
                  <td className="py-2 pr-4">{fmtCents(data.totals.total_cents, tc("centsUnsafe"))}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </DataState>
    </div>
  );
}
