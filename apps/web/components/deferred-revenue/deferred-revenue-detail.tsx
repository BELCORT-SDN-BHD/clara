"use client";

// #941 — ONE RECOGNITION SCHEDULE'S OWN SURFACE: what each period recognises, the term it rode,
// who judged the revenue account and on what grounds, and every period's actual fate.
//
// THE LIFECYCLE CONTROLS ARE THE PLAN'S. A recognition schedule IS a `revenue_recognition_schedule`
// accounting plan, so pause, resume, catch up and end are #640's own dialogs called on this
// schedule's `plan_id`. Minting a recognition-shaped twin of each would be two lanes disagreeing
// about what "paused" means.
//
// THE ALLOCATION IS READ-ONLY AND THE ARITHMETIC IS THE DATABASE'S. The one sum this surface may
// assert is whether the lines the database sent add up to the total it sent; a mismatch is NAMED
// and nothing is reconciled, because a surface never edits an amount it did not derive.
//
// THE PURE HELPERS COME FROM `lib/prepayments/schedule.ts` RATHER THAN A SECOND COPY.
// `allocationIsExact` and `PeriodLine` are arithmetic over the frozen evaluator's own emitted
// shape, which is the SAME shape on both sides of the books (#939 gave the evaluator its release
// side as an argument precisely so one body serves both). A second implementation here would be
// the drift the database-owned arithmetic exists to prevent.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/journals/money";
import {
  RecognitionBoundaryStatement, RecognitionConfigurationStatement, RecognitionTaxStatement,
} from "./deferred-revenue-statement";
import { RecognitionStatusBadge } from "./deferred-revenue-list";
import {
  CatchUpDialog, EndPlanDialog, PausePlanDialog, ResumePlanDialog,
} from "@/components/plans/plan-lifecycle-dialogs";
import {
  loadRecognitionSchedule, type RecognitionDetail as RecognitionDetailRow,
  type RecognitionPeriod,
} from "@/lib/deferred-revenue/api";
import { allocationIsExact } from "@/lib/prepayments/schedule";
import { residualIndex } from "@/lib/deferred-revenue/schedule";
import { journalEntryHref, planDetailHref, workDetailHref } from "@/lib/navigation/tree";
import { activityDocumentsHref } from "@/lib/firm/activity";
import { planControls } from "@/lib/plans/schedule";
import { useAsyncRead } from "@/lib/firm/use-async-read";

/** THE FOCUSABLE LANDMARK an accepted lifecycle decision returns focus to, when the trigger that
 *  opened its dialog has unmounted with the status change. Declared beside the component that
 *  renders it so the id and the `tabIndex={-1}` that makes it focusable cannot drift apart. */
export const RECOGNITION_HEADING_ID = "deferred-revenue-detail-heading";

export function DeferredRevenueDetail({
  clientId, scheduleId,
}: { clientId: string; scheduleId: string }) {
  const t = useTranslations("DeferredRevenue");
  const schedule = useAsyncRead(() => loadRecognitionSchedule(scheduleId));
  const row = schedule.data;

  if (schedule.loading && row === null) {
    return (
      <p role="status" className="max-w-prose text-sm text-muted-foreground">
        {t("loadingDetail")}
      </p>
    );
  }
  if (row === null) {
    return (
      <div className="flex flex-col gap-6">
        <RecognitionBoundaryStatement />
        <DataState loading={false} error={schedule.error} isEmpty emptyMessage={t("notFound")}>
          <span />
        </DataState>
      </div>
    );
  }

  const controls = planControls(row.status);
  const act = (fn: () => Promise<void>) => schedule.act(fn);

  return (
    <div className="flex flex-col gap-6">
      <RecognitionBoundaryStatement />
      <RecognitionConfigurationStatement />
      <RecognitionTaxStatement />

      {/* PARTIAL/STALE: the last good reading stays on screen and SAYS it is the last one, rather
          than blanking a schedule a person is mid-decision on. */}
      {schedule.error !== null && row !== null ? (
        <StateBanner tone="warning">{t("stale")}</StateBanner>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader
          level={2}
          id={RECOGNITION_HEADING_ID}
          action={
            <span className="flex flex-wrap items-center gap-2">
              {controls.pause ? (
                <PausePlanDialog
                  planId={row.plan_id} purpose={row.purpose} busy={schedule.busy}
                  onAct={act} returnFocusTo={RECOGNITION_HEADING_ID}
                />
              ) : null}
              {controls.resume ? (
                <ResumePlanDialog
                  planId={row.plan_id} purpose={row.purpose} busy={schedule.busy}
                  onAct={act} returnFocusTo={RECOGNITION_HEADING_ID}
                />
              ) : null}
              {controls.catchUp ? (
                <CatchUpDialog
                  planId={row.plan_id} purpose={row.purpose}
                  effectiveFrom={row.live_revision?.effective_from ?? row.authority_from}
                  today={null} busy={schedule.busy} onAct={act}
                />
              ) : null}
              {controls.end ? (
                <EndPlanDialog
                  planId={row.plan_id} purpose={row.purpose} busy={schedule.busy}
                  onAct={act} returnFocusTo={RECOGNITION_HEADING_ID}
                />
              ) : null}
            </span>
          }
        >
          <span tabIndex={-1} id={`${RECOGNITION_HEADING_ID}-text`}>{row.purpose}</span>
        </SectionHeader>
        <span className="flex flex-wrap items-center gap-2">
          <RecognitionStatusBadge status={row.status} />
          {row.status === "ended" ? (
            <span className="text-sm text-muted-foreground">{t("endedNoControls")}</span>
          ) : null}
        </span>
        {row.paused_reason === null ? null : (
          <StateBanner tone="info">{t("pausedReason", { reason: row.paused_reason })}</StateBanner>
        )}
        {row.ended_reason === null ? null : (
          <StateBanner tone="neutral">{t("endedReason", { reason: row.ended_reason })}</StateBanner>
        )}
        {/* THE TERM ROW THIS SCHEDULE WAS DERIVED FROM is not necessarily the one still live on its
            carrier: the stored allocation never moves, by design, so a correction leaves a running
            schedule riding a superseded statement. Rendered only once the term ITSELF has moved.

            KEYED ON `term_moved`, NEVER ON `term_live`. Both term doors supersede unconditionally —
            neither compares dates — so `term_live` goes false on a re-record that restates the term
            byte for byte. This banner says the term "has since been corrected"; on an unchanged
            term that is a false statement of fact and wrong advice about a running schedule.

            `=== true`, NEVER a truthiness test. The field arrives as unvalidated jsonb, and an
            ABSENT one — a web build ahead of its database — is falsy: a truthiness test would paint
            this warning on EVERY recognition schedule in the firm. */}
        {row.term_moved === true ? (
          <StateBanner tone="warning" data-testid="deferred-revenue-term-superseded">
            {t("termSupersededBody")}
          </StateBanner>
        ) : null}

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label={t("factTotal")}><Money cents={row.total_cents} /></Fact>
          <Fact label={t("factPeriods")}>{row.period_count}</Fact>
          <Fact label={t("factTerm")}>{row.term_start} – {row.term_end}</Fact>
          <Fact label={t("factTermBasis")}>
            {row.basis_kind === "human_stated" ? t("factBasisHuman") : t("factBasisExtracted")}
          </Fact>
          {/* WHICH CARRIER the term came from. `basis_kind` above says how the term was ARRIVED AT
              (stated by a person versus read off a page by an extraction); this says WHERE IT
              LIVES, which is the fact that decides whether there is a document to open at all. */}
          <Fact label={t("factTermSource")}>
            {row.term_source === "human_stated" ? t("termSourceStated") : t("termSourceDocument")}
          </Fact>
          <Fact label={t("factPattern")}>{t("patternStraightLine")}</Fact>
          <Fact label={t("factDeferred")}>{row.deferred_account_code}</Fact>
          <Fact label={t("factRevenue")}>{row.revenue_account_code}</Fact>
          {/* THE JUDGEMENT'S OWN GROUNDS, rendered rather than stored and forgotten. It is the one
              thing on this screen a person wrote, and the door's wall exists so it is never
              absent. */}
          <Fact label={t("factRevenueBasis")} wide>{row.revenue_account_basis}</Fact>
          <Fact label={t("factWindow")}>
            {row.live_revision?.effective_from ?? "—"} – {row.live_revision?.effective_to ?? "—"}
          </Fact>
          <Fact label={t("factAuthorityFrom")}>{row.authority_from}</Fact>
          <Fact label={t("factCovered")}>{row.covered_through ?? "—"}</Fact>
          <Fact label={t("factEvaluator")}>{row.schedule_version}</Fact>
        </dl>

        {/* WHO STATED THE TERM, WHEN AND WHY. On the memo-only lane this trio IS the evidence:
            there is no invoice to open behind it, so the reason a named person gave is the whole
            audit trail a reviewer has. `=== "human_stated"` rather than a truthiness test on
            `term_reason`, for the reason the corrected-term banner states. */}
        {row.term_source === "human_stated" ? (
          <div
            className="flex flex-col gap-2 rounded-md border border-info/30 bg-info-muted/40 p-3"
            data-testid="deferred-revenue-term-stated"
          >
            <p className="max-w-prose text-sm">{t("termStatedNote")}</p>
            {/* #1036 fix round / ADV-02 — THE STATEMENT IS THERE AND IT IS NOT YOURS TO READ.
                Below `clara.role_rank('bookkeeper')` the read returns the trio null and this flag
                true (migration 0315 §E). Painting three em-dashes would read as "nobody said why",
                which is a false statement of fact about a schedule someone DID justify -- so the
                block says what is true and who may see it, which is the standing ruling that a
                wall prompts rather than going dark. `=== true`, never a truthiness test: the field
                arrives as unvalidated jsonb and an ABSENT one (a web build ahead of its database)
                is falsy. */}
            {row.term_reason_withheld === true ? (
              <p
                className="max-w-prose text-sm text-muted-foreground"
                data-testid="deferred-revenue-term-reason-withheld"
              >
                {t("termReasonWithheld")}
              </p>
            ) : (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Fact label={t("factTermStatedBy")}>{row.term_stated_by ?? "—"}</Fact>
                <Fact label={t("factTermStatedAt")}>
                  {row.term_stated_at === null ? "—" : row.term_stated_at.slice(0, 10)}
                </Fact>
                <Fact label={t("factTermReason")} wide>{row.term_reason ?? "—"}</Fact>
              </dl>
            )}
          </div>
        ) : null}

        <span className="flex flex-wrap gap-2">
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={journalEntryHref(clientId, row.source_entry_id)}
          >
            {t("openEntry")}
          </Link>
          {/* NO DOCUMENT, NO LINK. A memo-only schedule's `document_id` is NULL, and a button
              leading to `?document=null` is worse than no button: it promises evidence that does
              not exist. */}
          {row.document_id === null ? null : (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={activityDocumentsHref(clientId, row.document_id)}
            >
              {t("openDocument")}
            </Link>
          )}
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={planDetailHref(clientId, row.plan_id)}
          >
            {t("openPlan")}
          </Link>
        </span>
      </section>

      <Allocation row={row} />
      <History clientId={clientId} row={row} />
    </div>
  );
}

function Fact({
  label, children, wide = false,
}: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

type PeriodState = "pending" | "admitted" | "posted" | "refused";

/** The FOUR states one derived period can be in, read off the row rather than inferred from a flag
 *  the database does not carry. `entry_id` is present only for a COMMITTED receipt, so "posted"
 *  means money on the books rather than a job that may still refuse. */
export function periodState(period: RecognitionPeriod): PeriodState {
  const o = period.occurrence;
  if (o === null) return "pending";
  if (o.entry_id !== null) return "posted";
  if (o.outcome?.state === "refused") return "refused";
  if (o.work_status !== null
      && ["refused", "failed", "cancelled", "expired"].includes(o.work_status)) {
    return "refused";
  }
  return "admitted";
}

function Allocation({ row }: { row: RecognitionDetailRow }) {
  const t = useTranslations("DeferredRevenue");
  const residual = residualIndex(row.periods);
  const exact = allocationIsExact(row.periods, Number(row.total_cents));
  return (
    <section className="flex flex-col gap-2" aria-labelledby="deferred-revenue-allocation-heading">
      <SectionHeader level={2} id="deferred-revenue-allocation-heading">
        {t("allocationHeading")}
      </SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("allocationBody")}</p>
      {/* THE ONE ARITHMETIC THIS SURFACE MAY ASSERT: do the lines the database sent add up to the
          total it sent? A mismatch is NAMED and nothing is reconciled. */}
      {exact ? null : <StateBanner tone="error">{t("allocationMismatch")}</StateBanner>}
      <DataTableCard label={t("allocationTableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colPeriod")}</TableHead>
            <TableHead>{t("colPostsOn")}</TableHead>
            <TableHead>{t("colAmount")}</TableHead>
            <TableHead>{t("colPeriodStatus")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {row.periods.map((period, i) => {
            const state = periodState(period);
            return (
              <TableRow key={period.period_end} data-testid={`deferred-revenue-period-${state}`}>
                <TableCell className="text-muted-foreground">
                  {period.period_start} – {period.period_end}
                </TableCell>
                <TableCell>{period.period_end}</TableCell>
                <TableCell>
                  <Money cents={Number(period.amount_cents)} />
                  {i === residual ? (
                    <span className="block text-xs text-muted-foreground">{t("residualNote")}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      state === "posted" ? "default" : state === "refused" ? "secondary" : "outline"
                    }
                  >
                    {state === "posted" ? t("periodPosted")
                      : state === "refused" ? t("periodRefused")
                        : state === "admitted" ? t("periodAdmitted")
                          : t("periodPending")}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </DataTableCard>
    </section>
  );
}

/** EVERY DUE EVENT THIS PLAN HAS SEEN, including the ones that refused. A period that recognised
 *  nothing is why a person opened this page from the attention band, and the typed reason is the
 *  DATABASE's own word printed verbatim — never replaced by one this build invented. */
function History({ clientId, row }: { clientId: string; row: RecognitionDetailRow }) {
  const t = useTranslations("DeferredRevenue");
  return (
    <section className="flex flex-col gap-2" aria-labelledby="deferred-revenue-history-heading">
      <SectionHeader level={2} id="deferred-revenue-history-heading">
        {t("historyHeading")}
      </SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("historyBody")}</p>
      <DataState
        loading={false}
        error={null}
        isEmpty={row.occurrences.length === 0}
        emptyMessage={t("historyEmpty")}
      >
        <DataTableCard label={t("historyTableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colDue")}</TableHead>
              <TableHead>{t("colOutcome")}</TableHead>
              <TableHead>{t("colWork")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row.occurrences.map((o) => (
              <TableRow key={o.occurrence_id} data-testid="deferred-revenue-occurrence">
                <TableCell className="text-muted-foreground">{o.due_date}</TableCell>
                <TableCell>
                  {o.entry_id !== null ? (
                    <Badge variant="default">{t("periodPosted")}</Badge>
                  ) : (
                    <span className="flex flex-col gap-1">
                      <Badge variant="secondary">
                        {t("occurrenceRefusedLabel", {
                          reason: o.outcome?.reason ?? o.work_error?.reason ?? "",
                        })}
                      </Badge>
                      {o.outcome?.message === undefined || o.outcome.message === "" ? null : (
                        <span className="max-w-prose text-xs text-muted-foreground">
                          {o.outcome.message}
                        </span>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {o.work_id === null ? (
                    <span className="text-sm text-muted-foreground">{t("noWork")}</span>
                  ) : (
                    <Link
                      className="text-sm underline underline-offset-2"
                      href={workDetailHref(clientId, o.work_id)}
                    >
                      {t("openWork")}
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      </DataState>
    </section>
  );
}
