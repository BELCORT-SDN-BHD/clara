"use client";

// #660 — PERIOD PROFIT, one tile, with its income and expense halves underneath.
//
// PROFIT IS A FLOW, CASH IS A BALANCE, and the labels say so. Cash is "as at" a date; profit is
// "for" an interval. Putting them side by side without that distinction is how a reader concludes
// that a profitable month should have left that much in the bank.
//
// THE CLOSING TRANSFER IS OUT, AND THE YEAR-END CORRECTION IS IN. The door applies the estate's
// one predicate — `not (is_year_end and closing_transfer)` — so a year-end roll does not deflate
// the figure while a genuine year-end revenue correction still counts. The face does not restate
// that rule; it only surfaces the one case the rule CANNOT see: a close finalised before the
// marker existed, which the door detects separately and reports as partial coverage. That line is
// a real statement about this client's books, not a technical footnote.
//
// A NEGATIVE PROFIT IS A LOSS AND IS PRINTED AS ONE. Nothing anywhere in this band clamps a
// figure at zero.

import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/common/section-header";
import { CENTS_UNAVAILABLE, fmtCents } from "@/lib/registers/money";
import { coverageReasonKey } from "@/lib/dashboard/financial-display";
import type { FigureGroup } from "@/lib/dashboard/financial-pack";
import { FigureComparisonLine, figureAriaLabel, formatDay } from "./client-financial-figure";

export function ClientProfitSummary({
  profit,
  income,
  expense,
  unmarkedClosingEntries,
  loading,
}: {
  profit: FigureGroup;
  income: FigureGroup;
  expense: FigureGroup;
  unmarkedClosingEntries: number | null;
  loading: boolean;
}) {
  const t = useTranslations("ClientFinancial");
  const tc = useTranslations("Common");
  const headingId = "client-home-money-profit";
  const reasonKey = coverageReasonKey(profit.coverageReason);

  const amount = (figure: FigureGroup): string =>
    figure.valueCents === null
      ? CENTS_UNAVAILABLE
      : fmtCents(figure.valueCents, tc("centsUnsafe"));

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2">
      <SectionHeader level={3} id={headingId}>{t("profit.heading")}</SectionHeader>

      {loading ? (
        <Skeleton className="h-8 w-44" aria-hidden="true" />
      ) : profit.status === "denied" ? (
        <p className="text-sm text-muted-foreground">{t("denied.body")}</p>
      ) : profit.status === "unknown" ? (
        <p className="text-sm text-muted-foreground">
          {reasonKey ? t(reasonKey) : t("unknown.body")}
        </p>
      ) : (
        <>
          <p
            className="text-2xl font-semibold tabular-nums text-foreground"
            aria-label={figureAriaLabel(t("profit.heading"), profit, tc("centsUnsafe"))}
            data-testid="client-money-profit-value"
          >
            {amount(profit)}
          </p>
          {profit.period ? (
            <p className="text-xs text-muted-foreground">
              {t("profit.forPeriod", {
                start: formatDay(profit.period.start),
                asOf: formatDay(profit.period.asOf),
              })}
            </p>
          ) : null}
          <FigureComparisonLine figure={profit} />

          {/* THE TWO HALVES, because "profit fell" and "income fell" and "costs rose" are three
              different next actions and the tile above cannot tell them apart on its own. */}
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("income.heading")}</dt>
            <dd
              className="text-right tabular-nums"
              aria-label={figureAriaLabel(t("income.heading"), income, tc("centsUnsafe"))}
              data-testid="client-money-income-value"
            >
              {amount(income)}
            </dd>
            <dt className="text-muted-foreground">{t("expense.heading")}</dt>
            <dd
              className="text-right tabular-nums"
              aria-label={figureAriaLabel(t("expense.heading"), expense, tc("centsUnsafe"))}
              data-testid="client-money-expense-value"
            >
              {amount(expense)}
            </dd>
          </dl>

          {profit.coverage === "partial" && reasonKey ? (
            <p className="text-xs text-warning" data-testid="client-money-profit-partial">
              {profit.coverageReason === "closing_transfer_unmarked_history"
                ? t("reason.closingTransferUnmarkedCount", { n: unmarkedClosingEntries ?? 0 })
                : t(reasonKey)}
            </p>
          ) : null}
          {profit.coverageReason === "no_posted_entries" ? (
            <p className="text-xs text-muted-foreground">{t("reason.noPostedEntries")}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
