"use client";

// #660 — the six-point BOOK CASH trend, and its readable table.
//
// THE TABLE IS ALWAYS IN THE DOM. Not a fallback that appears when something fails — appendix D
// row 15 admits a chart only "for a defined time series or comparison with exact period,
// unit/currency, source and freshness plus a readable value/table disclosure", and a disclosure
// that renders only on failure is not a disclosure. It is visually collapsed at wide widths and
// expanded at 640px and below (where a six-point line chart is unreadable anyway) and at 200%
// zoom, but it is always present, always in reading order, and always the thing a screen reader
// gets. The chart is `aria-hidden`: it is a second rendering of these exact rows, and announcing
// both would read the same six numbers twice.
//
// ONE MEMBERSHIP FOR ALL SIX POINTS, AND THE FACE SAYS WHEN THAT IS NOT TRUE OF THE WINDOW. The
// door resolves ONE cash-set version — the one covering the as-of — and applies it to every point,
// because a trend whose membership changes between points is not a trend. When an earlier point
// falls outside that version's window, the door reports it and this section shows the sentence
// rather than a line that quietly means two different things at its two ends.
//
// A POINT BEFORE THE CLIENT'S BOOKS IS A GAP, NEVER A ZERO. `available:false` points are dropped
// from the chart series (recharts draws a break, which is the honest shape) and shown in the table
// as "no books yet" — not as `RM 0.00`, which would draw a cliff that never happened.
//
// REDUCED MOTION IS HONOURED AT THE SOURCE. `isAnimationActive` is off whenever
// `prefers-reduced-motion: reduce` is set, so the animation is never started rather than started
// and overridden.

import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { CENTS_UNAVAILABLE, fmtCents } from "@/lib/registers/money";
import { usePrefersReducedMotion } from "@/lib/dashboard/financial-display";
import type { CashPoint, CashSetRef } from "@/lib/dashboard/financial-pack";
import { formatDay } from "./client-financial-figure";

const CHART_CONFIG = {
  cash: { label: "Book cash", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ClientCashTrend({
  points,
  cashSet,
  loading,
}: {
  points: CashPoint[];
  cashSet: CashSetRef | null;
  loading: boolean;
}) {
  const t = useTranslations("ClientFinancial");
  const tc = useTranslations("Common");
  const reducedMotion = usePrefersReducedMotion();
  const headingId = "client-home-money-cash-trend";

  // The chart draws only the points that exist. A point before the client's coverage floor is a
  // GAP, and recharts renders a gap as a break in the line, which is exactly right.
  const data = points.map((p) => ({
    day: formatDay(p.asOf),
    cash: p.available && p.valueCents !== null ? p.valueCents / 100 : null,
  }));

  if (loading) return <Skeleton className="h-40 w-full" aria-hidden="true" />;
  if (points.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2">
      <SectionHeader level={3} id={headingId}>{t("cashTrend.heading")}</SectionHeader>
      {cashSet ? (
        <p className="text-xs text-muted-foreground">
          {t("cashTrend.oneMembership", { n: cashSet.memberCount ?? 0 })}
        </p>
      ) : null}

      {/* THE PICTURE. Hidden from assistive technology because the table below IS these rows. */}
      <div aria-hidden="true" className="hidden max-[640px]:hidden sm:block">
        <ChartContainer config={CHART_CONFIG} className="h-40 w-full">
          <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={72} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              dataKey="cash"
              type="monotone"
              stroke="var(--color-cash)"
              strokeWidth={2}
              dot
              connectNulls={false}
              isAnimationActive={!reducedMotion}
            />
          </LineChart>
        </ChartContainer>
      </div>

      {/* THE READABLE DISCLOSURE — ALWAYS PRESENT. `DataTableCard` composes the shared `<Table>`,
          whose scroll container is keyboard-reachable (`table-scroll-region.test.tsx:34-39`). */}
      <DataTableCard label={t("cashTrend.tableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("cashTrend.colAsOf")}</TableHead>
            <TableHead className="text-right">{t("cashTrend.colCash")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((p) => (
            <TableRow key={p.asOf}>
              <TableCell>{formatDay(p.asOf)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {!p.available || p.valueCents === null ? (
                  <span className="text-muted-foreground">
                    {p.reason === "pre_coverage" ? t("reason.preCoveragePoint") : CENTS_UNAVAILABLE}
                  </span>
                ) : (
                  fmtCents(p.valueCents, tc("centsUnsafe"))
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTableCard>
    </section>
  );
}
