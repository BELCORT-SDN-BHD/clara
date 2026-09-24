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
// #939 — ARM B NOW REACHES THE MEMO-ONLY RECOGNITION TOO, and this header used to say the
// opposite: "a memo-based prepayment has no amortisation path in this slice at all". That was true
// while `clara.document_service_periods` was the only term carrier — the frozen evaluator refused
// such an entry outright, so listing it would have offered an action that could only refuse.
// Migration 0305 adds a second carrier a named person writes to, so the row is now actionable and
// the NEXT ACT is a third one: state the service period, rather than open a document that does not
// exist. The read answers WHICH act (`next_step`), and this band never infers it from the absence
// of a document id.

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
  // EACH ARM IS CAPPED AT FIFTY, NEWEST FIRST, and the read SAYS when the cap bit. A band that
  // showed fifty of nine hundred without saying so would read as "this is all of it" — which on
  // this surface is the difference between "nothing else is failing" and "I cannot see what is".
  const truncated = Boolean(attention?.refusing_truncated) || Boolean(attention?.unscheduled_truncated);

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
        {truncated ? (
          <p className="max-w-prose text-xs text-muted-foreground" data-testid="prepayment-attention-truncated">
            {t("attentionTruncated", { shown: refusing.length + unscheduled.length })}
          </p>
        ) : null}
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

/** ARM B. The next act depends on whether a term already stands and on WHICH carrier it would
 *  live in, and the row says both — so a person is never sent to a form that can only refuse, and
 *  never to a document that does not exist. */
function UnscheduledRow({ clientId, row }: { clientId: string; row: AttentionUnscheduled }) {
  const t = useTranslations("Prepayments");
  // #939 — THE READ'S OWN TOKEN, with a fallback that reproduces the pre-#939 behaviour EXACTLY
  // for a database at an earlier frontier: a live term means configure, and anything else means
  // the document. The fallback never guesses "state the period", because on a frontier without
  // migration 0305 there is no door to state one through.
  const next = row.next_step
    ?? (row.has_live_term ? "configure_schedule" : "record_document_service_period");
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
          {next === "configure_schedule"
            ? t("attentionReadyToSchedule")
            : next === "state_service_period"
              ? t("attentionNeedsStatedTerm")
              : t("attentionNeedsTerm")}
        </span>
      </div>
      {next === "record_document_service_period" && row.document_id !== null ? (
        <Link
          href={activityDocumentsHref(clientId, row.document_id)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("attentionOpenDocument")}
        </Link>
      ) : (
        // BOTH remaining acts land on the SAME destination with the recognition prefilled: the
        // configure form is where the statement is made and where the schedule is configured, so a
        // person who has to do both does not have to find the page twice. The LABEL differs,
        // because the two acts are different and the button must say which one it is.
        <Link
          href={prepaymentCreateHref(clientId, row.entry_id)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {next === "state_service_period" ? t("attentionStateTerm") : t("attentionConfigure")}
        </Link>
      )}
    </li>
  );
}
