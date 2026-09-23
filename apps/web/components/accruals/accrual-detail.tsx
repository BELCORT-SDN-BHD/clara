"use client";

// #652 — ONE ACCRUAL'S DURABLE DETAIL, at its own address.
//
// WHAT THIS SURFACE IS FOR. The ticket's own acceptance line is that the originating adjustment,
// the current-period journal and the REVERSAL RELATIONSHIP are all recorded and all reachable.
// `clara.get_accrual_adjustment` derives that lineage by JOIN — plan + revision → occurrence → Work
// → COMMITTED operation receipt → journal entry, and the reversal through
// `accounting_plan_occurrences.reverses_entry_id` — and this renders it without re-deriving one
// step of it.
//
// THE TWO BOUNDARY SENTENCES RENDER HERE TOO, persistently. A reader who arrives at a detail page
// from a link has not seen the list's copy.
//
// A REFUSED OCCURRENCE IS HISTORY, NOT AN ERROR STATE. `clara.accounting_plan_occurrences` records
// every due event the lane reached, admitted or refused, and a refused one carries the database's
// own typed reason — including `reversal_before_primary` with its `primary_state`, which is the one
// a reader of an accrual most needs: it says WHICH of the three ways the accrual fails to stand
// behind its reversal, and the operator's next move differs for each.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { StateBanner } from "@/components/common/state";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { AccrualBoundaryStatement } from "./accrual-statement";
import { methodLabel } from "./accruals-list";
import { loadAccrual, type AccrualDetail as AccrualDetailRow, type AccrualOccurrenceRow } from "@/lib/accruals/api";
import {
  accrualCorrectHref, accrualDetailHref, accrualsHref, journalEntryHref, planDetailHref, workDetailHref,
} from "@/lib/navigation/tree";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { formatCents } from "@/lib/bank/money";

export function AccrualDetail({ clientId, accrualId }: { clientId: string; accrualId: string }) {
  const t = useTranslations("Accruals");
  const accrual = useAsyncRead(() => loadAccrual(accrualId));
  const row = accrual.data;

  return (
    <div className="flex flex-col gap-6">
      <AccrualBoundaryStatement />
      <DataState
        loading={accrual.loading}
        error={accrual.error}
        isEmpty={row === null}
        emptyMessage={t("detailNotFound")}
      >
        {row === null ? null : <Body clientId={clientId} row={row} />}
      </DataState>
      <Link className="text-sm underline underline-offset-2" href={accrualsHref(clientId)}>
        {t("backToList")}
      </Link>
    </div>
  );
}

function Body({ clientId, row }: { clientId: string; row: AccrualDetailRow }) {
  const t = useTranslations("Accruals");
  const primary = row.occurrences.find((o) => o.leg === "primary") ?? null;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeader level={2}>{row.purpose}</SectionHeader>
          {row.corrected_by_accrual_id !== null ? null : (
            // #936 — ALWAYS OFFERED, never floor-gated here: the destination form does that
            // (裁-187 is about a CONTROL whose only outcome is a refusal, not a navigation link to
            // a page that renders its own denied face — the accruals list's own "New accrual"
            // link is the same shape).
            <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={accrualCorrectHref(clientId, row.accrual_id)}>
              {t("correctLink")}
            </Link>
          )}
        </div>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Fact label={t("factAmount")} value={formatCents(row.amount_cents)} />
          <Fact label={t("factCurrency")} value={row.currency} />
          <Fact
            label={t("factTerm")}
            value={t("termRange", { from: row.service_period_start, to: row.service_period_end })}
            note={t("factTermSource")}
          />
          <Fact label={t("factMethod")} value={methodLabel(t, row.method?.rule ?? "")} />
          <Fact label={t("factExpenseLeg")} value={row.expense_account_code} />
          <Fact label={t("factLiabilityLeg")} value={row.liability_account_code} />
          <Fact
            label={t("factWindow")}
            value={t("windowFromTo", { from: row.effective_from, to: row.effective_to })}
          />
          <Fact
            label={t("factSchedule")}
            value={scheduleSentence(t, row)}
            note={row.plan.timezone ?? undefined}
          />
        </dl>
      </section>

      {row.corrects_accrual_id === null && row.corrected_by_accrual_id === null ? null : (
        // #936 — THE CORRECTION LINEAGE. `corrects_accrual_id` and `corrected_by_accrual_id` are
        // 0222's own columns, first WRITTEN by `clara.correct_accrual_adjustment` (0284): they name
        // each other, in both directions, and the superseded row is otherwise unmoved apart from
        // this one stamp — 0222's append-only trigger's own law.
        <section className="flex flex-col gap-2">
          <SectionHeader level={2}>{t("lineageNote")}</SectionHeader>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {row.corrects_accrual_id === null ? null : (
              <Fact
                label={t("correctsLabel")}
                value={row.corrects_accrual_id}
                href={accrualDetailHref(clientId, row.corrects_accrual_id)}
              />
            )}
            {row.corrected_by_accrual_id === null ? null : (
              <Fact
                label={t("correctedByLabel")}
                value={row.corrected_by_accrual_id}
                href={accrualDetailHref(clientId, row.corrected_by_accrual_id)}
              />
            )}
          </dl>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("authorityHeading")}</SectionHeader>
        <p className="max-w-prose text-sm text-muted-foreground">{t("authorityNote")}</p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Fact label={t("factAuthorityKind")} value={row.authority_kind} />
          <Fact
            label={t("factAuthorityRef")}
            value={row.authority_ref?.id ?? "—"}
            href={row.authority_ref?.kind === "accounting_work" && row.authority_ref.id
              ? workDetailHref(clientId, row.authority_ref.id)
              : undefined}
          />
          <Fact label={t("factAuthorityFrom")} value={row.plan.authority_from} />
          <Fact
            label={t("factPlan")}
            value={row.plan.purpose}
            href={planDetailHref(clientId, row.plan.plan_id)}
            note={t("planNote")}
          />
        </dl>
        <p className="max-w-prose text-sm">{row.instruction}</p>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("postingHeading")}</SectionHeader>
        {/* THE BOUNDARY, RESTATED WHERE IT BITES. `posted` is derived by the door from a COMMITTED
            receipt; a configured-but-unposted accrual says so rather than showing an empty table a
            reader would read as a failure. */}
        <Badge variant={row.posted ? "default" : "secondary"}>
          {row.posted ? t("statePosted") : t("stateConfigured")}
        </Badge>
        {row.posted ? null : <StateBanner tone="neutral">{t("notPostedYet")}</StateBanner>}
        {row.reversal === null ? (
          <StateBanner tone="neutral">{t("noReversalYet")}</StateBanner>
        ) : (
          <p className="max-w-prose text-sm text-muted-foreground">
            {row.reversal.reverses_entry_id === null
              ? t("reversalPending", { due: row.reversal.due_date })
              : t("reversalBound", { due: row.reversal.due_date, entry: row.reversal.reverses_entry_id })}
          </p>
        )}
        <DataTableCard label={t("occurrenceTableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colDue")}</TableHead>
              <TableHead>{t("colLeg")}</TableHead>
              <TableHead>{t("colWork")}</TableHead>
              <TableHead>{t("colEntry")}</TableHead>
              <TableHead>{t("colOutcome")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row.occurrences.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {t("noOccurrencesYet")}
                </TableCell>
              </TableRow>
            ) : (
              row.occurrences.map((o) => (
                <OccurrenceRow key={o.occurrence_id} clientId={clientId} occurrence={o} />
              ))
            )}
          </TableBody>
        </DataTableCard>
        {primary === null || primary.entry_id === null ? null : (
          <Link className="text-sm underline underline-offset-2" href={journalEntryHref(clientId, primary.entry_id)}>
            {t("openPostedEntry")}
          </Link>
        )}
      </section>
    </div>
  );
}

function OccurrenceRow({ clientId, occurrence }: { clientId: string; occurrence: AccrualOccurrenceRow }) {
  const t = useTranslations("Accruals");
  const state = occurrence.outcome?.state ?? (occurrence.work_id === null ? "pending" : "admitted");
  return (
    <TableRow>
      <TableCell className="tabular-nums">{occurrence.due_date}</TableCell>
      <TableCell>
        {occurrence.leg === "reversal" ? t("legReversal") : t("legAccrual")}
        {occurrence.attempt > 1 ? (
          <span className="block text-xs text-muted-foreground">{t("attempt", { n: occurrence.attempt })}</span>
        ) : null}
      </TableCell>
      <TableCell>
        {occurrence.work_id === null ? (
          <span className="text-muted-foreground">{t("noWork")}</span>
        ) : (
          <Link className="underline underline-offset-2" href={workDetailHref(clientId, occurrence.work_id)}>
            {occurrence.work_status ?? t("workAdmitted")}
          </Link>
        )}
      </TableCell>
      <TableCell>
        {occurrence.entry_id === null ? (
          <span className="text-muted-foreground">{t("noEntry")}</span>
        ) : (
          <Link className="underline underline-offset-2" href={journalEntryHref(clientId, occurrence.entry_id)}>
            {t("openEntry")}
          </Link>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {/* THE DATABASE'S OWN TYPED REASON, VERBATIM — never re-worded, and `primary_state` beside
            it when the refusal is the orphan wall's, because "no occurrence at all", "admitted but
            nothing posted yet" and "posted and since reversed" are three different facts about the
            books. */}
        {state === "refused" ? (
          <>
            <span className="block font-medium">{occurrence.outcome?.reason ?? t("refused")}</span>
            {occurrence.outcome?.primary_state ? (
              <span className="block text-xs">{t("primaryState", { state: occurrence.outcome.primary_state })}</span>
            ) : null}
            {occurrence.outcome?.message ? (
              <span className="block text-xs">{occurrence.outcome.message}</span>
            ) : null}
          </>
        ) : (
          state
        )}
        {occurrence.reverses_entry_id === null ? null : (
          <span className="block text-xs">{t("reverses", { entry: occurrence.reverses_entry_id })}</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function Fact({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm wrap-anywhere">
        {href === undefined ? value : (
          <Link className="underline underline-offset-2" href={href}>{value}</Link>
        )}
        {note === undefined ? null : <span className="block text-xs text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The schedule as one readable line, assembled from translated pieces with an HONEST raw-value
 *  fallback for anything outside the known sets — never a key path, never a silent blank. */
function scheduleSentence(t: Translate, row: AccrualDetailRow): string {
  const frequencies: Record<string, string> = {
    monthly: t("frequencyMonthly"),
    quarterly: t("frequencyQuarterly"),
    annual: t("frequencyAnnual"),
  };
  const frequency = row.plan.frequency === null ? null : frequencies[row.plan.frequency] ?? row.plan.frequency;
  if (frequency === null || row.plan.day_rule === null) return t("scheduleUnknown");
  if (row.plan.day_rule === "last_day_of_month") return t("scheduleLastDay", { frequency });
  if (row.plan.day_of_month !== null) {
    return t("scheduleDayOfMonth", { frequency, day: row.plan.day_of_month });
  }
  return frequency;
}
