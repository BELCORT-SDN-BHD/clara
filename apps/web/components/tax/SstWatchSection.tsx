"use client";

// The ONE live section on the Tax tab: this client's SST compliance watch.
//
// WHY THIS AND NOTHING ELSE. The tab shipped three static notes and issued ZERO reads, while the
// single piece of tax state a human session can actually reach sat unread — the SST compliance
// watch, which arrives on `clara.list_review_queue`'s own `compliance` envelope. The firm-admin
// compliance register has read it that way since T10; the client's own Tax tab did not read it
// at all, so the professional had to leave the client to see the client's SST position.
//
// EVERY FIGURE HERE IS THE DATABASE'S. `confirmed_included_cents`, `unknown_or_mixed_cents` and
// `screening_proxy_cents` are computed by the evaluator and rendered through `fmtCents`; the
// crossing month and the application-due date are columns, not arithmetic. Nothing on this
// surface is summed, projected or estimated in the browser (hard constraint 2).
//
// THE STALENESS FLAG IS NOT DECORATION. The evaluator runs on the runtime lane
// (`evaluate_sst_watches_all` is granted to `clara_runtime` and deliberately NOT to
// `clara_authenticated`), so a human cannot re-run it from here and there is no re-evaluate
// button to offer. When the DB says its last run is over 48h old, the figures below are shown
// WITH that warning rather than silently presented as current.
//
// THE THREE ACTS ARE THE ONES THAT ALREADY EXIST, reused verbatim.
// `components/firm/compliance-watch-affordance.tsx` is the shipped acknowledge / snooze /
// resolve trio, wired to the same three governed doors and already covered by its own cells and
// the inbox's a11y discipline. It needs a queue ROW (for `watch_id`) and an `act()` — both come
// from the same envelope read this section already made. A second implementation of those three
// doors on this tab would be three more places for a refusal to be swallowed.

import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { ComplianceWatchAffordance } from "@/components/firm/compliance-watch-affordance";
import { DataState } from "@/components/firm/data-state";
import { businessDate } from "@/lib/business-date";
import type { AsyncReadState } from "@/lib/firm/use-async-read";
import { fmtCents } from "@/lib/registers/money";
import type { ClientSstWatch } from "@/lib/tax/sst-watch";

/** The five values `clara.compliance_watches.state` admits today. A value outside them renders
 *  as its own raw text — the house's checked-lookup discipline, never a next-intl key path and
 *  never a cast that hides a missing label from tsc. */
const KNOWN_WATCH_STATES: readonly string[] = ["monitored", "early_warning", "crossed", "overdue", "resolved"];

export function SstWatchSection({ watch }: { watch: AsyncReadState<ClientSstWatch> }) {
  const t = useTranslations("ClientTax.sstWatch");
  const tc = useTranslations("Common");

  const data = watch.data;
  const rows = data?.watches ?? [];

  return (
    <section aria-labelledby="client-tax-sst-watch" className="flex flex-col gap-3">
      <SectionHeader level={3}>
        <span id="client-tax-sst-watch">{t("heading")}</span>
      </SectionHeader>
      {data?.staleEvaluator ? <StateBanner tone="warning">{t("stale")}</StateBanner> : null}
      <DataState
        loading={watch.loading}
        error={watch.error}
        isEmpty={rows.length === 0}
        emptyMessage={t("empty")}
      >
        <div className="enter-content flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={`${row.client_id}:${row.service_group}`}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-card-foreground">{row.service_group}</span>
                {/* The state's own word, from the DB's vocabulary. `crossed` and `overdue` are
                    the two that mean a registration obligation may already have bitten, so they
                    carry the error tone; the rest are neutral. */}
                <Badge tone={row.state === "crossed" || row.state === "overdue" ? "error" : "neutral"}>
                  {KNOWN_WATCH_STATES.includes(row.state) ? t(`state.${row.state}`) : row.state}
                </Badge>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt>{t("confirmedIncluded")}</dt>
                <dd>{fmtCents(row.confirmed_included_cents, tc("centsUnsafe"))}</dd>
                <dt>{t("unknownOrMixed")}</dt>
                <dd>{fmtCents(row.unknown_or_mixed_cents, tc("centsUnsafe"))}</dd>
                <dt>{t("screeningProxy")}</dt>
                <dd>{fmtCents(row.screening_proxy_cents, tc("centsUnsafe"))}</dd>
                <dt>{t("earliestCrossing")}</dt>
                <dd>{row.earliest_crossing_month ?? t("notRecorded")}</dd>
                <dt>{t("applicationDue")}</dt>
                <dd>{row.application_due ? businessDate(new Date(row.application_due)) : t("notRecorded")}</dd>
                <dt>{t("futureMethod")}</dt>
                <dd>{row.future_method_status ?? t("notRecorded")}</dd>
              </dl>
            </div>
          ))}
          {/* The acts hang off the queue ROW, which is the only carrier of `watch_id`. When the
              aggregate reports figures but no row is open, there is nothing to acknowledge and
              no control is offered — never a disabled button standing in for an absent subject. */}
          {data?.actionable ? (
            <ComplianceWatchAffordance
              row={data.actionable}
              busy={watch.busy}
              error={watch.error}
              act={watch.act}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{t("noOpenWatchRow")}</p>
          )}
        </div>
      </DataState>
    </section>
  );
}
