"use client";

// #660 — SECTION C1, THE MONEY BAND. Book cash, period profit, and the two trends behind them.
//
// =============================================================================================
// WHY THIS IS ONE SECTION WITH ONE READ, AND WHY THAT SATISFIES THE BOARD'S LAW RATHER THAN
// BREAKING IT.
//
// `client-workspace-overview.tsx:16-19` states the law: EVERY SECTION READS FOR ITSELF, because
// "a board that blanks on a single failure reads as *this client has nothing outstanding*, which
// is the most expensive possible way to be wrong here."
//
// Cash, profit, the cash trend and the income/expense series are NOT four sections. They are FOUR
// FACES OF ONE ENVELOPE, and they are only true together: they share a period, an as-of, a
// definition version and a SOURCE WATERMARK — the snapshot the door computed them all in. Four
// reads could not guarantee that, and four faces disagreeing about which instant they describe is
// a worse failure than one band going quiet. So the money band is ONE section, with ONE hook
// instance, and everything else on this board still reads for itself. A failure here darkens
// exactly this band.
//
// THE PERIOD CONTROL IS INSIDE THIS SECTION'S HEADER, for the same reason: it is visibly scoped to
// the money. The Work band above has no period axis at all, and a control in the page chrome would
// claim otherwise.
//
// =============================================================================================
// WHAT REFRESHES, AND THE ONE THING THAT CANNOT — SAID ON THE FACE.
//
// Entry, a scope change, a period change, a return to the tab, and a 30-second tick while the tab
// is visible. There is NO commit event in this app to subscribe to: `lib/command/bus.ts` carries
// exactly two events and neither is a posting or an approval. Rather than promise a freshness this
// build cannot deliver, the footer says what it actually does — "this figure refreshes at most
// every 30 seconds" — and names the last successful read.
//
// =============================================================================================
// EVERY STATE HAS A REAL FACE.
//
//   loading            skeletons, never a zero.
//   successful-empty   `no_posted_entries` — "no posted entries yet", NOT `RM 0.00`.
//   no-results         a historic month with no movement: a REAL 0, labelled with its period.
//   partial / stale    the number STAYS, dated, with its reason in words.
//   invalid / saving   the publish dialog only. There are no drafts on a read-only board.
//   denied             values cleared immediately, a sentence naming the permission, never a 0.
//   failed (first)     no number at all — there is no dated value to keep.
//   failed (later)     the dated number stays, with Retry beside it.
//   cancelled          N/A for the read; the dialog's cancel restores nothing (it committed
//                      nothing). Stated rather than left as an absent control.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { isDoorRefusal } from "@/lib/doors";
import { businessDateTime } from "@/lib/business-date";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import {
  proposeClientCashAccounts,
  type CashProposal,
  type ClientFinancialPack,
} from "@/lib/dashboard/financial-pack";
import { useFinancialPack } from "@/lib/dashboard/use-financial-pack";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ClientCashSetDialog } from "./client-cash-set-dialog";
import { ClientCashSummary } from "./client-cash-summary";
import { ClientCashTrend } from "./client-cash-trend";
import { ClientIncomeExpenseChart } from "./client-income-expense-chart";
import { ClientPeriodSelector } from "./client-period-selector";
import { ClientProfitSummary } from "./client-profit-summary";
import { formatDay } from "./client-financial-figure";

/** A failure's own words, WITHOUT a second live region. A governed refusal renders verbatim (its
 *  code rides the banner's own chip); anything else renders its message. This is deliberately not
 *  `ErrorMessage`: that component IS a banner, and nesting one live region inside another makes
 *  announcement order undefined (WCAG 4.1.3). */
function failureText(error: unknown): string {
  if (isDoorRefusal(error)) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export function ClientFinancialSummary({
  clientId,
  period,
  pathname,
  search,
  malformedPeriod,
  load,
  now,
  loadProposal,
}: {
  clientId: string;
  /** `YYYY-MM-01` from the server-read `?period=`, or null for month-to-date. */
  period: string | null;
  pathname: string;
  search: string;
  /** True when the address carried a `?period=` this build could not read. The face SAYS so
   *  rather than silently showing a different month under the label the reader chose. */
  malformedPeriod: boolean;
  /** Injected by the cells so a test drives the band directly; production reads the doors. */
  load?: (clientId: string, month: string | null) => Promise<ClientFinancialPack>;
  now?: () => number;
  loadProposal?: (clientId: string) => Promise<CashProposal>;
}) {
  const t = useTranslations("ClientFinancial");
  const [dialogOpen, setDialogOpen] = useState(false);
  const state = useFinancialPack({ clientId, month: period, load, now });
  const { pack, loading, staleError, denied, failedFirstRead, readAt, delayed, reload } = state;

  // The proposal is read ONLY when the dialog is opened: it is a second door, and the band must
  // not pay for it on every board that never publishes a cash set.
  const proposal = useAsyncRead(
    useCallback(
      () => (dialogOpen
        ? (loadProposal ?? ((id: string) => proposeClientCashAccounts(id, { session: sessionTokenAccessor })))(clientId)
        : Promise.resolve(null)),
      [clientId, dialogOpen, loadProposal],
    ),
  );
  // OPENING THE DIALOG IS THE READ. `useAsyncRead`'s own contract is that a new loader identity
  // ALONE never re-triggers a load (`lib/firm/use-async-read.ts:26-30`) — the caller must either
  // re-key the subtree or call `reload()` explicitly. This is that explicit call, bound to a const
  // so the effect's dependency list is honest rather than suppressed.
  const reloadProposal = proposal.reload;
  useEffect(() => {
    if (dialogOpen) void reloadProposal();
  }, [dialogOpen, reloadProposal]);

  const headingId = "client-home-money";
  // A DENIED CALLER IS NOT OFFERED THE AUTHORING DOOR. The publish door floors at admin and
  // refuses CLR04; a refused READ is this board's only evidence the caller is below a floor, so
  // the entrance is withdrawn rather than offered and then refused.
  const onOpenCashSet = denied ? null : () => setDialogOpen(true);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <SectionHeader
        level={2}
        id={headingId}
        action={
          <ClientPeriodSelector
            clientId={clientId}
            pathname={pathname}
            search={search}
            value={period === null ? null : period.slice(0, 7)}
          />
        }
      >
        {t("heading")}
      </SectionHeader>

      {malformedPeriod ? (
        <StateBanner tone="warning" title={t("period.malformedTitle")}>
          {t("period.malformedBody")}
        </StateBanner>
      ) : null}

      {denied ? (
        <StateBanner tone="info" title={t("denied.title")}>{t("denied.body")}</StateBanner>
      ) : null}

      {/* A FIRST FAILURE SHOWS NO NUMBER AT ALL. There is no dated value to keep, and a zero here
          would be a fabrication. A LATER failure keeps the dated numbers and adds Retry.
          THE TITLE AND THE ERROR ARE ONE BANNER, NOT A BANNER INSIDE A BANNER. `ErrorMessage`
          renders its own `StateBanner`, and a live region nested inside another has undefined
          announcement order — a screen reader can read the same failure twice or attribute it to
          the wrong region (WCAG 4.1.3). So this owns the announcement and renders the error's own
          text beside its title. */}
      {failedFirstRead ? (
        <StateBanner
          tone="error"
          title={t("failed.title")}
          code={isDoorRefusal(staleError)
            ? `${staleError.code}${staleError.reason ? ` · ${staleError.reason}` : ""}`
            : undefined}
          action={<Button type="button" variant="outline" size="sm" onClick={reload}>{t("retry")}</Button>}
        >
          {failureText(staleError)}
        </StateBanner>
      ) : null}
      {staleError && !failedFirstRead ? (
        <StateBanner
          tone="warning"
          title={t("stale.title")}
          action={<Button type="button" variant="outline" size="sm" onClick={reload}>{t("retry")}</Button>}
        >
          {failureText(staleError)}
        </StateBanner>
      ) : null}
      {delayed ? (
        <StateBanner tone="warning" title={t("delayed.title")} data-testid="client-money-delayed">
          {readAt === null
            ? t("delayed.never")
            : t("delayed.body", { at: businessDateTime(new Date(readAt)) })}
        </StateBanner>
      ) : null}

      {!failedFirstRead ? (
        <>
          <div className="@container">
            <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
              <ClientCashSummary
                figure={pack.cash}
                cashSet={pack.cashSet}
                loading={loading}
                onOpenCashSet={onOpenCashSet}
              />
              <ClientProfitSummary
                profit={pack.profit}
                income={pack.income}
                expense={pack.expense}
                unmarkedClosingEntries={pack.unmarkedClosingEntries}
                loading={loading}
              />
            </div>
          </div>

          <ClientCashTrend points={pack.cashPoints} cashSet={pack.cashSet} loading={loading} />
          <ClientIncomeExpenseChart
            clientId={clientId}
            series={pack.series}
            composition={pack.profit.composition}
            loading={loading}
          />
        </>
      ) : null}

      {/* THE FRESHNESS SENTENCE, and it is deliberately the SMALLER promise. See this file's
          header: there is no commit event in this app to invalidate on. */}
      <p className="text-xs text-muted-foreground" data-testid="client-money-freshness">
        {readAt === null
          ? t("freshness.never")
          : t("freshness.read", { at: businessDateTime(new Date(readAt)) })}
        {" "}
        {t("freshness.cadence")}
        {pack.coverageFloor ? ` ${t("freshness.booksFrom", { day: formatDay(pack.coverageFloor) })}` : ""}
      </p>

      <ClientCashSetDialog
        clientId={clientId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        proposal={proposal.data ?? null}
        loading={proposal.loading}
        error={proposal.error}
        onPublished={reload}
      />
    </section>
  );
}
