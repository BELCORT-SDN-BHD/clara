"use client";

// The dry-run tie-out strip — clara.get_opening_dryrun(p_seed). Mobbin
// grounding takeaways 1-3 (docs/plan/active/mobbin-grounding-wave-2026-08-28.md
// §T2): the tie-out is a strip of DB-RETURNED terms converging on the DB's
// own signed difference (`obe_net_cents`) — a `StateBanner`, never client
// arithmetic (constraint 2); zero is quiet `tone="success"`, nonzero is
// `tone="warning"` carrying the DB figure; the outstanding-items-causing-the-
// gap table (`deltas[]`) is what makes the difference actionable.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { getOpeningDryrun } from "@/lib/registers/opening";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner, EmptyState } from "@/components/common/state";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";

export function OpeningDryrunStrip({ seedId }: { seedId: string }) {
  const t = useTranslations("OpeningCarryDown.dryrun");
  const tc = useTranslations("Common");
  // Re-keyed by seedId (React key on the caller side) rather than a manual
  // reload-on-change wire — this panel is small enough that an unmount/
  // remount on seed switch is the simplest correct thing (aging-register.tsx's
  // own precedent documents the alternative for a case that needs it).
  const { data, loading, error } = useAsyncRead(() => getOpeningDryrun(sessionTokenAccessor, seedId));

  return (
    <div className="flex flex-col gap-2" data-testid="opening-dryrun-strip">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <DataState loading={loading} error={error} isEmpty={false} emptyMessage="">
        {data ? (
          <div className="flex flex-col gap-2">
            <StateBanner tone={data.obe_net_cents === 0 ? "neutral" : "warning"} title={t("asOf", { date: data.as_of })}>
              {data.obe_net_cents === 0
                ? t("ties")
                : t("doesNotTie", { amount: fmtCents(data.obe_net_cents, tc("centsUnsafe")) })}
            </StateBanner>
            {data.deltas.length === 0 ? (
              <EmptyState className="text-xs">{t("noDeltas")}</EmptyState>
            ) : (
              <DataTableCard>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("accountCol")}</TableHead>
                    <TableHead className="text-right">{t("targetDebitCol")}</TableHead>
                    <TableHead className="text-right">{t("targetCreditCol")}</TableHead>
                    <TableHead className="text-right">{t("actualDebitCol")}</TableHead>
                    <TableHead className="text-right">{t("actualCreditCol")}</TableHead>
                    <TableHead className="text-right">{t("deltaDebitCol")}</TableHead>
                    <TableHead className="text-right">{t("deltaCreditCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.deltas.map((d) => {
                    const off = d.delta_debit !== 0 || d.delta_credit !== 0;
                    return (
                      <TableRow key={d.account_code}>
                        <TableCell>{d.account_code}</TableCell>
                        <TableCell className="text-right">{fmtCents(d.target_debit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className="text-right">{fmtCents(d.target_credit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className="text-right">{fmtCents(d.actual_debit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className="text-right">{fmtCents(d.actual_credit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className={off ? "text-right text-warning" : "text-right"}>{fmtCents(d.delta_debit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className={off ? "text-right text-warning" : "text-right"}>{fmtCents(d.delta_credit, tc("centsUnsafe"))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </DataTableCard>
            )}
            {data.unmapped_labels.length > 0 ? (
              <StateBanner tone="info" title={t("unmappedTitle")}>
                <ul className="list-disc pl-4">
                  {data.unmapped_labels.map((u) => (
                    <li key={u.line_key}>{u.source_label ?? u.line_key}</li>
                  ))}
                </ul>
              </StateBanner>
            ) : null}
            {data.missing_must_asks.length > 0 ? (
              <StateBanner tone="warning" title={t("missingMustAsksTitle")}>
                <ul className="list-disc pl-4">
                  {data.missing_must_asks.map((m) => (
                    <li key={m.item_key}>{m.question}</li>
                  ))}
                </ul>
              </StateBanner>
            ) : null}
          </div>
        ) : null}
      </DataState>
    </div>
  );
}
