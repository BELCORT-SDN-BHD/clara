"use client";

// #941 — THE ATTENTION BAND, and it is the mitigation rather than an extra.
//
// WHAT IT EXISTS FOR. A refused plan occurrence writes ONLY `outcome` and returns: no
// `clara.accounting_work` row, no audit row, no interruption, no notification. A twelve-month
// recognition schedule that begins refusing therefore fails EVERY MONTH with the evidence visible
// on one projection nobody opens — and on this side of the books the consequence is that revenue
// the client has EARNED is sitting in a liability account nobody is watching. This band is where
// that becomes reachable.
//
// TWO ARMS, RENDERED DISTINCTLY, because one arm cannot reach both residues and the NEXT ACT
// differs:
//
//   ARM A — "the last period did not post". A live schedule whose most recent period was refused
//   at ADMISSION (a deactivated authoriser, a due date outside the allocation) or was admitted and
//   whose Work then died at the POSTING core (a closed period, a lapsed model-egress
//   authorisation). It leads to the schedule's own detail surface, where the typed reason and the
//   bounded recovery live.
//
//   ARM B — "received in advance, not yet recognised". A posted advance that NO schedule names. It
//   is the only durable trace of a create-time refusal, because such a refusal writes no plan and
//   no schedule row and therefore no schedule-scoped read can ever reach it. It leads to the term
//   (a person records the service period on the document, or states one) or straight into the
//   create form with the receipt prefilled.
//
// THE READ ANSWERS WHICH ACT (`next_step`), and this band never infers it from the absence of a
// document id: the field arrives as unvalidated jsonb, and a web build ahead of its database that
// inferred the lane from a null would offer the wrong act to every row in the firm.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Money } from "@/components/journals/money";
import {
  type AttentionRefusing, type AttentionUnrecognised, type RecognitionAttention,
} from "@/lib/deferred-revenue/api";
import { deferredRevenueCreateHref, deferredRevenueDetailHref } from "@/lib/navigation/tree";
// The documents surface's own address for ONE document — `?document=<id>` is #646's route shape
// and `lib/firm/activity.ts` already owns the helper, so this lane reuses it rather than minting
// a second spelling of the same URL.
import { activityDocumentsHref } from "@/lib/firm/activity";

export function RecognitionAttentionBand({
  clientId, attention, loading, error,
}: {
  clientId: string;
  attention: RecognitionAttention | null;
  loading: boolean;
  error: unknown;
}) {
  const t = useTranslations("DeferredRevenue");
  const refusing = attention?.refusing ?? [];
  const unrecognised = attention?.unrecognised ?? [];
  // EACH ARM IS CAPPED AT FIFTY, NEWEST FIRST, and the read SAYS when the cap bit. A band that
  // showed fifty of nine hundred without saying so would read as "this is all of it" — which on
  // this surface is the difference between "nothing else is failing" and "I cannot see what is".
  const truncated =
    Boolean(attention?.refusing_truncated) || Boolean(attention?.unrecognised_truncated);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="deferred-revenue-attention-heading">
      <SectionHeader level={2} id="deferred-revenue-attention-heading">
        {t("attentionHeading")}
      </SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("attentionBody")}</p>
      <DataState
        loading={loading}
        error={error}
        isEmpty={refusing.length === 0 && unrecognised.length === 0}
        emptyMessage={t("attentionEmpty")}
      >
        <ul className="flex list-none flex-col gap-3 p-0">
          {refusing.map((row) => (
            <RefusingRow key={row.occurrence_id} clientId={clientId} row={row} />
          ))}
          {unrecognised.map((row) => (
            <UnrecognisedRow key={row.entry_id} clientId={clientId} row={row} />
          ))}
        </ul>
        {truncated ? (
          <p
            className="max-w-prose text-xs text-muted-foreground"
            data-testid="deferred-revenue-attention-truncated"
          >
            {t("attentionTruncated", { shown: refusing.length + unrecognised.length })}
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
  const t = useTranslations("DeferredRevenue");
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-muted/40 p-3 sm:flex-row sm:items-start sm:justify-between"
      data-testid="deferred-revenue-attention-refusing"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          {/* COLOUR IS NEVER THE ONLY CUE (appendix D, Badge): the badge carries its own word. */}
          <Badge variant="secondary">
            {t("attentionRefusingLabel", { reason: row.reason ?? "" })}
          </Badge>
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
        href={deferredRevenueDetailHref(clientId, row.schedule_id)}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {t("attentionOpenSchedule")}
      </Link>
    </li>
  );
}

/** ARM B. The next act depends on whether a term already stands and on WHICH carrier it would live
 *  in, and the row says both — so a person is never sent to a form that can only refuse, and never
 *  to a document that does not exist. */
function UnrecognisedRow({ clientId, row }: { clientId: string; row: AttentionUnrecognised }) {
  const t = useTranslations("DeferredRevenue");
  // THE READ'S OWN TOKEN, with a fallback that reproduces the same answer for a database at an
  // earlier frontier: a live term means configure, and anything else means the carrier the
  // document id names. The fallback never guesses "state the period" for a document-bound receipt.
  const next = row.next_step
    ?? (row.has_live_term
      ? "configure_schedule"
      : row.document_id !== null
        ? "record_document_service_period"
        : "state_service_period");
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-info/30 bg-info-muted/40 p-3 sm:flex-row sm:items-start sm:justify-between"
      data-testid="deferred-revenue-attention-unrecognised"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t("attentionUnrecognisedLabel")}</Badge>
          <span className="font-medium">
            {t("attentionUnrecognisedBody", { date: row.posting_date })}
          </span>
        </span>
        <span className="text-sm">
          <Money cents={row.amount_cents} /> · {row.deferred_account_code}
        </span>
        <span className="max-w-prose text-xs text-muted-foreground">
          {next === "configure_schedule"
            ? t("attentionReadyToRecognise")
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
        // BOTH remaining acts land on the SAME destination with the receipt prefilled: the
        // configure form is where the statement is made and where the schedule is configured, so a
        // person who has to do both does not have to find the page twice. The LABEL differs,
        // because the two acts are different and the button must say which one it is.
        <Link
          href={deferredRevenueCreateHref(clientId, row.entry_id)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {next === "state_service_period" ? t("attentionStateTerm") : t("attentionConfigure")}
        </Link>
      )}
    </li>
  );
}
