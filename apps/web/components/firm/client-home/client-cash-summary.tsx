"use client";

// #660 — BOOK CASH, one tile.
//
// "BOOK CASH" IS THE LABEL, AND THE WORD "BOOK" IS LOAD-BEARING. This is what the LEDGER says the
// cash accounts hold: every approved debit minus every approved credit over a governed, versioned
// cash account set, cumulative from inception. It is NOT a bank statement balance, NOT an
// available balance, and the two can legitimately differ by everything that has not cleared. The
// bank section on the same board carries the other half of that sentence.
//
// AN UNPUBLISHED CASH SET IS A FACE WITH A DOOR ON IT, NEVER `RM 0.00`. "Nobody has said which
// accounts count as cash for this client" and "this client has no cash" are different sentences
// and only one of them means somebody should do something. The door answers `unknown` with a NULL
// value for the first; this tile renders the sentence and the entrance to the dialog that fixes it.
//
// A PARTIAL ANSWER KEEPS ITS NUMBER. Coverage is a statement ABOUT the number, not a reason to
// withhold it: a series that reaches back before this client's books, or a cash set whose
// membership changed inside the window, still has a true figure at the as-of. The reason is said
// beside it, in words.

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { CENTS_UNAVAILABLE, fmtCents } from "@/lib/registers/money";
import { coverageReasonKey, FIGURE_TONE } from "@/lib/dashboard/financial-display";
import type { CashSetRef, FigureGroup } from "@/lib/dashboard/financial-pack";
import { FigureComparisonLine, figureAriaLabel } from "./client-financial-figure";

export function ClientCashSummary({
  figure,
  cashSet,
  loading,
  onOpenCashSet,
}: {
  figure: FigureGroup;
  cashSet: CashSetRef | null;
  loading: boolean;
  /** The entrance to the publish dialog, or null when this caller may not author a cash set. */
  onOpenCashSet: (() => void) | null;
}) {
  const t = useTranslations("ClientFinancial");
  const tc = useTranslations("Common");
  const headingId = "client-home-money-cash";
  const reasonKey = coverageReasonKey(figure.coverageReason);

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2">
      <SectionHeader level={3} id={headingId}>{t("cash.heading")}</SectionHeader>

      {loading ? (
        <Skeleton className="h-8 w-44" aria-hidden="true" />
      ) : figure.status === "denied" ? (
        <p className="text-sm text-muted-foreground">{t("denied.body")}</p>
      ) : figure.coverageReason === "cash_set_unpublished" ? (
        <StateBanner tone="info" title={t("cashSet.missingTitle")}>
          <p>{t("cashSet.missingBody")}</p>
          {onOpenCashSet ? (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onOpenCashSet}>
              {t("cashSet.chooseAccounts")}
            </Button>
          ) : (
            <p className="mt-1 text-xs">{t("cashSet.adminOnly")}</p>
          )}
        </StateBanner>
      ) : figure.status === "unknown" ? (
        <p className="text-sm text-muted-foreground">
          {reasonKey ? t(reasonKey) : t("unknown.body")}
        </p>
      ) : (
        <>
          {/* THE NUMBER CARRIES ITS PERIOD IN ITS ACCESSIBLE NAME. "Book cash RM 182,340.55 as at
              18 Sep 2026" — never a bare amount, because a figure read aloud without its as-of is
              a figure a screen-reader user cannot check. */}
          <p
            className="text-2xl font-semibold tabular-nums text-foreground"
            aria-label={figureAriaLabel(t("cash.heading"), figure, tc("centsUnsafe"))}
            data-testid="client-money-cash-value"
          >
            {figure.valueCents === null
              ? CENTS_UNAVAILABLE
              : fmtCents(figure.valueCents, tc("centsUnsafe"))}
          </p>
          <FigureComparisonLine figure={figure} />
          {figure.coverage === "partial" && reasonKey ? (
            <p className="text-xs text-warning">{t(reasonKey)}</p>
          ) : null}
          {figure.coverageReason === "no_posted_entries" ? (
            <p className="text-xs text-muted-foreground">{t("reason.noPostedEntries")}</p>
          ) : null}
          {cashSet ? (
            <p className="text-xs text-muted-foreground">
              {t("cashSet.basis", { n: cashSet.memberCount ?? 0, revision: cashSet.revision ?? 1 })}
              {onOpenCashSet ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="underline underline-offset-4 hover:no-underline"
                    onClick={onOpenCashSet}
                  >
                    {t("cashSet.change")}
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </>
      )}

      <p className="text-xs text-muted-foreground">{t("cash.notStatementBalance")}</p>
    </section>
  );
}

export const CASH_TONE = FIGURE_TONE;
