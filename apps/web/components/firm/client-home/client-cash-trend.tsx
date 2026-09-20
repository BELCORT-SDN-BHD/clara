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
//
// #1001 — THE CASH ARM'S OWN COMPOSITION TABLE lives here, under the trend, on the SAME
// readable-table-with-per-row-journal-links pattern `client-income-expense-chart.tsx` already
// established for profit — this file is the cash arm's own chart-and-drilldown home exactly as
// that one is the profit arm's. `entryHref` is imported rather than re-spelled, per that file's
// own header: "Built here once so the chart's table and any later caller cannot spell the same
// drilldown two ways."
//
// THE HEADLINE IS THE CLOSING BALANCE, NEVER THE MOVEMENT. Book cash is a BALANCE cumulative from
// inception (`financial-pack.ts`'s own `closingCents` — 0232's `q.closing`, summed over every
// approved line up to and including the as-of, no lower bound); the profit table's `movementCents`
// is the right headline THERE because profit is itself a movement over the period. A cash table
// built the same way would not sum to the figure above it (the owner's ruling, 2026-09-20). Period
// movement is shown BESIDE the balance, never instead of it.
//
// AND NO SPECIAL CASE FOR "NO PUBLISHED CASH SET" IS WRITTEN HERE. 0232 returns `composition: []`
// on the SAME `v_set_id is null` branch that leaves `points: []` (migration 0232:891,910,1062-
// 1065), so this component's existing `if (points.length === 0) return null` already withdraws the
// composition table with it — the cash tile's own unpublished-set banner
// (`client-cash-summary.tsx`) stays the only face for that state, exactly as the brief requires.

import Link from "next/link";
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
import { memberReasonKey, usePrefersReducedMotion } from "@/lib/dashboard/financial-display";
import type { CashPoint, CashSetRef, CompositionRow } from "@/lib/dashboard/financial-pack";
import { formatDay } from "./client-financial-figure";
import { entryHref } from "./client-income-expense-chart";

const CHART_CONFIG = {
  cash: { label: "Book cash", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ClientCashTrend({
  clientId,
  points,
  cashSet,
  composition,
  compositionTotal,
  compositionTruncated,
  loading,
}: {
  clientId: string;
  points: CashPoint[];
  cashSet: CashSetRef | null;
  /** The per-account BALANCE composition behind book cash — the drilldown's own population. */
  composition: CompositionRow[];
  /** How many cash accounts there are BEFORE the door's 50-row cap, and whether it bit. */
  compositionTotal: number | null;
  compositionTruncated: boolean;
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
            {/* ACCESSIBILITY LAYER OFF, and this is the other half of `aria-hidden` above.
                Recharts' own layer puts `role="application" tabindex="0"` on its root `<svg>`
                (`recharts/es6/container/RootSurface.js:44-53`), and a FOCUSABLE element inside an
                aria-hidden subtree is a serious WCAG failure — a keyboard user lands on a node a
                screen reader has been told does not exist. The readable TABLE below is this
                chart's accessible rendering, so the picture is hidden AND unfocusable rather
                than half of each. */}
          <LineChart data={data} accessibilityLayer={false} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
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

      {/* #1001 — THE CASH COMPOSITION. Each row is one member account, headlined by its CLOSING
          balance at the as-of (never the period's movement — see the file header), with the
          entries behind that movement — capped in the door (20 per account, 50 accounts per
          group) and saying so, exactly as the profit table does. */}
      {composition.length > 0 ? (
        <div className="flex flex-col gap-1">
          <SectionHeader level={4}>{t("cashDrilldown.heading")}</SectionHeader>
          <DataTableCard label={t("cashDrilldown.tableLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("cashDrilldown.colAccount")}</TableHead>
                <TableHead className="text-right">{t("cashDrilldown.colBalance")}</TableHead>
                <TableHead className="text-right">{t("cashDrilldown.colMovement")}</TableHead>
                <TableHead>{t("cashDrilldown.colReason")}</TableHead>
                <TableHead>{t("cashDrilldown.colEntries")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {composition.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    <span className="font-medium">{row.accountCode}</span>{" "}
                    <span className="text-muted-foreground">{row.name}</span>
                  </TableCell>
                  {/* THE HEADLINE. `closingCents` is the cumulative balance book cash itself is
                      computed on — see the file header for why this is never `movementCents`. */}
                  <TableCell
                    className="text-right tabular-nums"
                    data-testid="client-cash-drilldown-balance"
                  >
                    {row.closingCents === null
                      ? CENTS_UNAVAILABLE
                      : fmtCents(row.closingCents, tc("centsUnsafe"))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.movementCents === null
                      ? CENTS_UNAVAILABLE
                      : fmtCents(row.movementCents, tc("centsUnsafe"))}
                  </TableCell>
                  <TableCell>{t(memberReasonKey(row.memberReason))}</TableCell>
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
                        {t("cashDrilldown.truncated", {
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
            <p className="text-xs text-muted-foreground" data-testid="client-cash-accounts-truncated">
              {t("cashDrilldown.accountsTruncated", {
                shown: composition.length, total: compositionTotal ?? composition.length,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
