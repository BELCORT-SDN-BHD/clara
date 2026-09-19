"use client";

// #660 — six calendar months of INCOME and EXPENSE, and the readable table that is always beside
// it.
//
// THE CURRENT MONTH IS LABELLED PARTIAL, WITH ITS EXACT AS-OF. A six-bar chart whose last bar is
// eighteen days long and looks like a whole month is the single most misleading thing this board
// could draw — "revenue is collapsing" is the conclusion a reader reaches on the 3rd of every
// month. The bar is marked, the table row says "to 18 Sep 2026", and the legend says it once more.
//
// THE TABLE IS ALWAYS IN THE DOM, for the reason `client-cash-trend.tsx` states in full: appendix
// D admits a chart only with a readable value/table disclosure, and a disclosure that appears only
// on failure is not one. The chart is `aria-hidden` because the table IS these rows.
//
// THE DRILLDOWN LIVES UNDER THIS CHART, and it addresses the EXISTING journals page. Each
// composition row links one journal entry to `/clients/<id>/journals?tab=posted&entry=<id>` —
// an address that page already reads on the server (`journals/page.tsx:27-45`), so Back returns
// the reader where they were. This build adds NO trial-balance or general-ledger surface; the
// account-filtered ledger is #670's.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { CENTS_UNAVAILABLE, fmtCents } from "@/lib/registers/money";
import { usePrefersReducedMotion } from "@/lib/dashboard/financial-display";
import type { CompositionRow, SeriesMonth } from "@/lib/dashboard/financial-pack";
import { clientBase } from "@/lib/navigation/tree";
import { monthLabel } from "./client-period-selector";
import { formatDay } from "./client-financial-figure";

const CHART_CONFIG = {
  income: { label: "Income", color: "var(--chart-1)" },
  expense: { label: "Expense", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** The ONE address a composition entry opens. Built here once so the chart's table and any later
 *  caller cannot spell the same drilldown two ways. */
export function entryHref(clientId: string, entryId: string): string {
  return `${clientBase(clientId)}/journals?tab=posted&entry=${encodeURIComponent(entryId)}`;
}

export function ClientIncomeExpenseChart({
  clientId,
  series,
  composition,
  compositionTotal,
  compositionTruncated,
  unmarkedSeriesEntries,
  loading,
}: {
  clientId: string;
  series: SeriesMonth[];
  /** The per-account movement behind the CURRENT period's profit — the drilldown's population. */
  composition: CompositionRow[];
  /** How many accounts there are BEFORE the door's 50-row cap, and whether it bit. A table that
   *  sums to less than the headline above it has to say why. */
  compositionTotal: number | null;
  compositionTruncated: boolean;
  /** How many approved entries across the SIX DRAWN MONTHS carry a close receipt but no
   *  `closing_transfer` marker. The bar they sit in includes them; the reader is told. */
  unmarkedSeriesEntries: number | null;
  loading: boolean;
}) {
  const t = useTranslations("ClientFinancial");
  const tc = useTranslations("Common");
  const reducedMotion = usePrefersReducedMotion();
  const headingId = "client-home-money-series";

  const data = series.map((m) => ({
    month: monthLabel(m.month),
    income: m.incomeCents === null ? null : m.incomeCents / 100,
    expense: m.expenseCents === null ? null : m.expenseCents / 100,
  }));

  if (loading) return <Skeleton className="h-48 w-full" aria-hidden="true" />;
  if (series.length === 0) return null;

  const partial = series.find((m) => m.partial) ?? null;

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2">
      <SectionHeader level={3} id={headingId}>{t("series.heading")}</SectionHeader>
      {partial ? (
        <p className="text-xs text-warning" data-testid="client-money-partial-month">
          {t("series.partialMonth", {
            month: monthLabel(partial.month),
            asOf: formatDay(partial.asOf),
          })}
        </p>
      ) : null}
      {/* THE DISCLOSURE COVERS ALL SIX BARS, not only the selected month. An unmarked pre-0120
          close three months back is invisible to the exclusion predicate and is counted into that
          month's bar; the tile above can only speak for the selected period. */}
      {unmarkedSeriesEntries !== null && unmarkedSeriesEntries > 0 ? (
        <p className="text-xs text-warning" data-testid="client-money-series-unmarked">
          {t("series.unmarkedHistory", { n: unmarkedSeriesEntries })}
        </p>
      ) : null}

      <div aria-hidden="true" className="hidden sm:block">
        <ChartContainer config={CHART_CONFIG} className="h-48 w-full">
            {/* ACCESSIBILITY LAYER OFF, and this is the other half of `aria-hidden` above.
                Recharts' own layer puts `role="application" tabindex="0"` on its root `<svg>`
                (`recharts/es6/container/RootSurface.js:44-53`), and a FOCUSABLE element inside an
                aria-hidden subtree is a serious WCAG failure — a keyboard user lands on a node a
                screen reader has been told does not exist. The readable TABLE below is this
                chart's accessible rendering, so the picture is hidden AND unfocusable rather
                than half of each. */}
          <BarChart data={data} accessibilityLayer={false} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={72} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="income" fill="var(--color-income)" radius={2} isAnimationActive={!reducedMotion} />
            <Bar dataKey="expense" fill="var(--color-expense)" radius={2} isAnimationActive={!reducedMotion} />
          </BarChart>
        </ChartContainer>
      </div>

      <DataTableCard label={t("series.tableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("series.colMonth")}</TableHead>
            <TableHead className="text-right">{t("income.heading")}</TableHead>
            <TableHead className="text-right">{t("expense.heading")}</TableHead>
            <TableHead className="text-right">{t("profit.heading")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {series.map((m) => (
            <TableRow key={m.month}>
              <TableCell>
                {monthLabel(m.month)}
                {m.partial ? (
                  <span className="ml-1 text-xs text-warning">
                    {t("series.toAsOf", { asOf: formatDay(m.asOf) })}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {m.incomeCents === null ? CENTS_UNAVAILABLE : fmtCents(m.incomeCents, tc("centsUnsafe"))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {m.expenseCents === null ? CENTS_UNAVAILABLE : fmtCents(m.expenseCents, tc("centsUnsafe"))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {m.profitCents === null ? CENTS_UNAVAILABLE : fmtCents(m.profitCents, tc("centsUnsafe"))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTableCard>

      {/* THE DRILLDOWN. Each row is one account of the CURRENT period, with the entries behind its
          movement — capped in the door (20 per account, 50 accounts) and saying so, because a
          cumulative figure is a number and not an enumerable population. */}
      {composition.length > 0 ? (
        <div className="flex flex-col gap-1">
          <SectionHeader level={4}>{t("drilldown.heading")}</SectionHeader>
          <DataTableCard label={t("drilldown.tableLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("drilldown.colAccount")}</TableHead>
                <TableHead className="text-right">{t("drilldown.colMovement")}</TableHead>
                <TableHead>{t("drilldown.colEntries")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {composition.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    <span className="font-medium">{row.accountCode}</span>{" "}
                    <span className="text-muted-foreground">{row.name}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.movementCents === null
                      ? CENTS_UNAVAILABLE
                      : fmtCents(row.movementCents, tc("centsUnsafe"))}
                  </TableCell>
                  <TableCell>
                    <ul className="flex flex-col gap-1">
                      {row.entries.map((e) => (
                        <li key={e.entryId}>
                          <Link
                            href={entryHref(clientId, e.entryId)}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {formatDay(e.postingDate)}
                            {" · "}
                            {e.amountCents === null
                              ? CENTS_UNAVAILABLE
                              : fmtCents(e.amountCents, tc("centsUnsafe"))}
                            {e.memo ? ` · ${e.memo}` : ""}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {row.entriesTruncated ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("drilldown.truncated", {
                          shown: row.entries.length, total: row.entriesTotal ?? 0,
                        })}
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTableCard>
          {compositionTruncated ? (
            <p className="text-xs text-muted-foreground" data-testid="client-money-accounts-truncated">
              {t("drilldown.accountsTruncated", {
                shown: composition.length, total: compositionTotal ?? composition.length,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
