"use client";

// #653 — THE ATTENTION BAND, and it is the mitigation rather than an extra.
//
// WHAT IT EXISTS FOR. A refused plan occurrence writes ONLY `outcome` and returns: no
// `clara.accounting_work` row, no `clara._audit` row, no interruption, no notification
// (0193:1369-1382). A twelve-month amortisation that begins refusing therefore fails EVERY MONTH
// with the evidence visible on one projection nobody opens. This band is where that becomes
// reachable — and gap-653's own risk 1 names it the largest design-and-safety hole in the lane.
//
// TWO ARMS, RENDERED DISTINCTLY, because one arm cannot reach both residues and the NEXT ACT
// differs:
//
//   ARM A — "the last period charged nothing". A live schedule whose most recent period was
//   refused at ADMISSION (a deactivated authoriser, a due date outside the allocation) or was
//   admitted and whose Work then died at the POSTING core (a closed period, a lapsed model-egress
//   authorisation). It leads to the schedule's own explain-and-choose surface, which is where the
//   typed reason and the bounded recovery live.
//
//   ARM B — "recognised, not yet amortised". A posted prepayment that NO schedule names. It is the
//   only durable trace of a create-time refusal, because such a refusal writes no plan and no
//   schedule row and therefore no schedule-scoped read can ever reach it. It leads to the term (a
//   person records the service period on the document) or straight into the create form with the
//   recognition prefilled.
//
// WHAT NEITHER ARM REACHES, said here rather than implied: a MEMO-ONLY recognition binds no
// document, so the frozen evaluator refuses it outright and arm B's own predicate excludes it. A
// memo-based prepayment has no amortisation path in this slice at all.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Money } from "@/components/journals/money";
import {
  type AttentionRefusing, type AttentionUnscheduled, type PrepaymentAttention,
} from "@/lib/prepayments/api";
import { prepaymentCreateHref, prepaymentDetailHref } from "@/lib/navigation/tree";
// The documents surface's own address for ONE document — `?document=<id>` is #646's route shape
// and `lib/firm/activity.ts` already owns the helper, so this lane reuses it rather than minting
// a second spelling of the same URL.
import { activityDocumentsHref } from "@/lib/firm/activity";

export function PrepaymentAttentionBand({
  clientId, attention, loading, error,
}: {
  clientId: string;
  attention: PrepaymentAttention | null;
  loading: boolean;
  error: unknown;
}) {
  const t = useTranslations("Prepayments");
  const refusing = attention?.refusing ?? [];
  const unscheduled = attention?.unscheduled ?? [];

  return (
    <section className="flex flex-col gap-2" aria-labelledby="prepayment-attention-heading">
      <SectionHeader level={2} id="prepayment-attention-heading">{t("attentionHeading")}</SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("attentionBody")}</p>
      <DataState
        loading={loading}
        error={error}
        isEmpty={refusing.length === 0 && unscheduled.length === 0}
        emptyMessage={t("attentionEmpty")}
      >
        <ul className="flex list-none flex-col gap-3 p-0">
          {refusing.map((row) => (
            <RefusingRow key={row.occurrence_id} clientId={clientId} row={row} />
          ))}
          {unscheduled.map((row) => (
            <UnscheduledRow key={row.entry_id} clientId={clientId} row={row} />
          ))}
        </ul>
      </DataState>
    </section>
  );
}

/** ARM A. The typed reason is the DATABASE's own word, printed verbatim beside a translated
 *  label — never replaced by one this build invented, because a refusal this build has not
 *  enumerated must still be legible. */
function RefusingRow({ clientId, row }: { clientId: string; row: AttentionRefusing }) {
  const t = useTranslations("Prepayments");
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-muted/40 p-3 sm:flex-row sm:items-start sm:justify-between"
      data-testid="prepayment-attention-refusing"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          {/* COLOUR IS NEVER THE ONLY CUE (appendix D, Badge): the badge carries its own word. */}
          <Badge variant="secondary">{t("attentionRefusingLabel", { reason: row.reason ?? "" })}</Badge>
          <span className="font-medium">{row.purpose}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {row.stage === "admission"
            ? t("attentionRefusingAdmission", { date: row.due_date })
            : t("attentionRefusingPosting", { date: row.due_date })}
        </span>
        {row.message === null || row.message === "" ? null : (
          <span className="max-w-prose text-xs text-muted-foreground">{row.message}</span>
        )}
      </div>
      <Link
        href={prepaymentDetailHref(clientId, row.schedule_id)}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {t("attentionOpenSchedule")}
      </Link>
    </li>
  );
}

/** ARM B. The next act depends on whether the document already states a term, and the row says
 *  which — so a person is never sent to a form that can only refuse. */
function UnscheduledRow({ clientId, row }: { clientId: string; row: AttentionUnscheduled }) {
  const t = useTranslations("Prepayments");
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-info/30 bg-info-muted/40 p-3 sm:flex-row sm:items-start sm:justify-between"
      data-testid="prepayment-attention-unscheduled"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t("attentionUnscheduledLabel")}</Badge>
          <span className="font-medium">
            {t("attentionUnscheduledBody", { date: row.posting_date })}
          </span>
        </span>
        <span className="text-sm">
          <Money cents={row.amount_cents} /> · {row.prepaid_account_code}
        </span>
        <span className="max-w-prose text-xs text-muted-foreground">
          {row.has_live_term ? t("attentionReadyToSchedule") : t("attentionNeedsTerm")}
        </span>
      </div>
      {row.has_live_term ? (
        <Link
          href={prepaymentCreateHref(clientId, row.entry_id)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("attentionConfigure")}
        </Link>
      ) : (
        <Link
          href={activityDocumentsHref(clientId, row.document_id)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("attentionOpenDocument")}
        </Link>
      )}
    </li>
  );
}
