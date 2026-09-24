"use client";

// #653 — ONE DERIVED AMORTISATION, ITS ALLOCATION, ITS EXECUTION AND ITS REFUSALS.
//
// THREE THINGS ONE SCREEN HAS TO SHOW, and each answers a different question:
//
//   1. WHAT WAS DERIVED, AND FROM WHAT. The prepayment recognised, the account it sits in, the
//      service period the DOCUMENT states, the expense account a person judged and WHY, and the
//      frozen evaluator version that produced the allocation. Every one of those is a fact this
//      schedule can be audited against later.
//   2. WHAT EACH PERIOD CHARGES, AND WHETHER IT CHARGED IT. The allocation and its execution in ONE
//      table, joined on `period_end = due_date` — the exact key the derived cadence guarantees, and
//      the join the database itself makes in `clara.get_prepayment_schedule`'s `periods`. A period
//      that has not fallen due, one whose Work is running, one that POSTED and one that REFUSED are
//      four different states and each says which.
//   3. WHAT TO DO WHEN A PERIOD CHARGED NOTHING. That is the explain-and-choose surface below, and
//      it is #653's answer to PRD:73 ("Clara explains the impact and proposes options; the user
//      decides"): the database's own typed reason, what it means in this lane's terms, and the ONE
//      bounded recovery the estate actually has — the existing window-only catch-up, which never
//      reaches back past the plan's authority.
//
// THE LIFECYCLE DIALOGS ARE THE PLAN'S OWN, reused rather than re-cut. A prepayment schedule
// CONFIGURES an `amortisation_schedule` accounting plan, so pause / resume / end / catch-up are
// `clara.pause_accounting_plan` and its siblings called on this schedule's `plan_id`. A
// prepayment-shaped twin of each would be two lanes disagreeing about what "paused" means.
//
// SO THEY SPEAK THE PLAN LANE'S WORDS ("Pause the plan", not "Pause the schedule"), and that is
// the honest consequence of the reuse rather than an oversight: the dialog NAMES this schedule by
// its own purpose in the title, and the noun underneath genuinely is a plan (CONTEXT.md's
// "Accounting plan" now lists `amortisation schedule` as one of its three kinds). The duplicate
// strings this lane briefly carried in its own namespace were DELETED rather than left as a second
// copy nothing reads — a later hand editing the wrong copy would change nothing on screen.
//
// HYDRATE-NEVER-TRUST ON EVERY CONTROL: each act runs through `useAsyncRead().act()`, which reloads
// the schedule unconditionally after success AND after failure. Nothing here paints an outcome the
// database did not just report.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, StateBanner } from "@/components/common/state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/journals/money";
import { PrepaymentBoundaryStatement, PrepaymentConfigurationStatement } from "./prepayment-statement";
import { PrepaymentStatusBadge } from "./prepayments-list";
import {
  CatchUpDialog, EndPlanDialog, PausePlanDialog, ResumePlanDialog,
} from "@/components/plans/plan-lifecycle-dialogs";
import {
  loadPrepayment, type PrepaymentDetail as PrepaymentDetailRow,
  type PrepaymentOccurrence, type PrepaymentPeriod,
} from "@/lib/prepayments/api";
import { allocationIsExact, occurrenceStage, residualIndex } from "@/lib/prepayments/schedule";
import { journalEntryHref, planDetailHref, workDetailHref } from "@/lib/navigation/tree";
import { activityDocumentsHref } from "@/lib/firm/activity";
import { planControls } from "@/lib/plans/schedule";
import { useAsyncRead } from "@/lib/firm/use-async-read";

/** THE FOCUSABLE LANDMARK an accepted lifecycle decision returns focus to, when the trigger that
 *  opened its dialog has unmounted with the status change. Declared beside the component that
 *  renders it so the id and the `tabIndex={-1}` that makes it focusable cannot drift apart —
 *  `plan-detail.tsx`'s `PLAN_HEADING_ID` mechanism, verbatim. */
export const PREPAYMENT_HEADING_ID = "prepayment-detail-heading";

export function PrepaymentDetail({ clientId, scheduleId }: { clientId: string; scheduleId: string }) {
  const t = useTranslations("Prepayments");
  const schedule = useAsyncRead(() => loadPrepayment(scheduleId));
  const row = schedule.data;

  if (schedule.loading && row === null) {
    return <p role="status" className="max-w-prose text-sm text-muted-foreground">{t("loadingDetail")}</p>;
  }
  if (row === null) {
    return (
      <div className="flex flex-col gap-6">
        <PrepaymentBoundaryStatement />
        <DataState loading={false} error={schedule.error} isEmpty emptyMessage={t("notFound")}>
          <span />
        </DataState>
      </div>
    );
  }

  const controls = planControls(row.status);
  const act = (fn: () => Promise<void>) => schedule.act(fn);
  const refusedPeriods = row.periods.filter((p) => periodState(p) === "refused");

  return (
    <div className="flex flex-col gap-6">
      <PrepaymentBoundaryStatement />
      <PrepaymentConfigurationStatement />

      {/* PARTIAL/STALE: the last good reading stays on screen and SAYS it is the last one, rather
          than blanking a schedule a person is mid-decision on. */}
      {schedule.error !== null && row !== null ? (
        <StateBanner tone="warning">{t("stale")}</StateBanner>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader
          level={2}
          id={PREPAYMENT_HEADING_ID}
          action={
            <span className="flex flex-wrap items-center gap-2">
              {controls.pause ? (
                <PausePlanDialog
                  planId={row.plan_id} purpose={row.purpose} busy={schedule.busy}
                  onAct={act} returnFocusTo={PREPAYMENT_HEADING_ID}
                />
              ) : null}
              {controls.resume ? (
                <ResumePlanDialog
                  planId={row.plan_id} purpose={row.purpose} busy={schedule.busy}
                  onAct={act} returnFocusTo={PREPAYMENT_HEADING_ID}
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
                  onAct={act} returnFocusTo={PREPAYMENT_HEADING_ID}
                />
              ) : null}
            </span>
          }
        >
          <span tabIndex={-1} id={`${PREPAYMENT_HEADING_ID}-text`}>{row.purpose}</span>
        </SectionHeader>
        <span className="flex flex-wrap items-center gap-2">
          <PrepaymentStatusBadge status={row.status} />
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
        {/* #919 — the term row this schedule was DERIVED from (0223's own append-only design: the
            stored allocation never moves) is not necessarily the one still live on the document.
            Rendered only once the term ITSELF has moved.

            KEYED ON `term_moved`, NEVER ON `term_live` (ADV-02). `clara._record_document_service_period_core`
            supersedes the live row unconditionally — it compares no dates — so `term_live` goes
            false on a re-record that restates the term byte for byte. This banner says the term
            "has since been corrected" and that the schedule needs rebuilding; on an unchanged term
            that is a false statement of fact and wrong advice about a running amortisation.

            `=== true`, NEVER a truthiness test. The field arrives as unvalidated jsonb from
            `clara.get_prepayment_schedule`, and an ABSENT one — a web build ahead of its database,
            or a rolled-back migration under a live runtime — is falsy: a truthiness test would
            paint this warning on EVERY prepayment in the firm. The sibling accrual surface tests
            `corrected_by_accrual_id !== null` for the same reason. */}
        {row.term_moved === true ? (
          <StateBanner tone="warning" data-testid="prepayment-term-superseded">
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
          {/* #939 — WHICH CARRIER the term came from. `basis_kind` above says how the term was
              ARRIVED AT (stated by a person versus read off a page by an extraction); this says
              WHERE IT LIVES, which is the fact that decides whether there is a document to open at
              all. Two different questions, so two facts rather than one overloaded word. */}
          <Fact label={t("factTermSource")}>
            {row.term_source === "human_stated" ? t("termSourceStated") : t("termSourceDocument")}
          </Fact>
          <Fact label={t("factPrepaid")}>{row.prepaid_account_code}</Fact>
          <Fact label={t("factExpense")}>{row.expense_account_code}</Fact>
          {/* THE JUDGEMENT'S OWN GROUNDS, rendered rather than stored and forgotten. It is the one
              thing on this screen a person wrote, and 0140's wall exists so it is never absent. */}
          <Fact label={t("factExpenseBasis")} wide>{row.expense_account_basis}</Fact>
          <Fact label={t("factWindow")}>
            {row.live_revision?.effective_from ?? "—"} – {row.live_revision?.effective_to ?? "—"}
          </Fact>
          <Fact label={t("factAuthorityFrom")}>{row.authority_from}</Fact>
          <Fact label={t("factCovered")}>{row.covered_through ?? "—"}</Fact>
          <Fact label={t("factEvaluator")}>{row.schedule_version}</Fact>
        </dl>

        {/* #939 — WHO STATED THE TERM, WHEN AND WHY. On the memo-only lane this trio IS the
            evidence: there is no invoice to open behind it, so the reason a named person gave is
            the whole audit trail a reviewer has. It is rendered as its own block rather than three
            more cells in the grid above, because it is a statement by a person and reads as one.
            `=== "human_stated"` rather than a truthiness test on `term_reason`, for the reason the
            corrected-term banner states: an absent field must paint nothing. */}
        {row.term_source === "human_stated" ? (
          <div
            className="flex flex-col gap-2 rounded-md border border-info/30 bg-info-muted/40 p-3"
            data-testid="prepayment-term-stated"
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
                data-testid="prepayment-term-reason-withheld"
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
          {/* #939 — NO DOCUMENT, NO LINK. A memo-only schedule's `document_id` is NULL, and a
              button leading to `?document=null` is worse than no button: it promises evidence that
              does not exist. */}
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

      {/* THE EXPLAIN-AND-CHOOSE SURFACE, above the tables: a period that charged nothing is the
          reason a person opened this page from the attention band, and burying it under the
          allocation would reproduce the silence this lane exists to end. */}
      {refusedPeriods.map((period) => (
        <ExplainAndChoose key={period.period_end} row={row} period={period} />
      ))}

      <Allocation row={row} />
      <History clientId={clientId} row={row} />
    </div>
  );
}

function Fact({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
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
function periodState(period: PrepaymentPeriod): PeriodState {
  const o = period.occurrence;
  if (o === null) return "pending";
  if (o.entry_id !== null) return "posted";
  if (o.outcome?.state === "refused") return "refused";
  if (o.work_status !== null && ["refused", "failed", "cancelled", "expired"].includes(o.work_status)) {
    return "refused";
  }
  return "admitted";
}

function Allocation({ row }: { row: PrepaymentDetailRow }) {
  const t = useTranslations("Prepayments");
  const residual = residualIndex(row.periods);
  const exact = allocationIsExact(row.periods, Number(row.total_cents));
  return (
    <section className="flex flex-col gap-2" aria-labelledby="prepayment-allocation-heading">
      <SectionHeader level={2} id="prepayment-allocation-heading">{t("allocationHeading")}</SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("allocationBody")}</p>
      {/* THE ONE ARITHMETIC THIS SURFACE MAY ASSERT: do the lines the database sent add up to the
          total it sent? A mismatch is NAMED and nothing is reconciled — a surface never edits an
          amount it did not derive. */}
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
              <TableRow key={period.period_end} data-testid={`prepayment-period-${state}`}>
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
                  <Badge variant={state === "posted" ? "default" : state === "refused" ? "secondary" : "outline"}>
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

function History({ clientId, row }: { clientId: string; row: PrepaymentDetailRow }) {
  const t = useTranslations("Prepayments");
  return (
    <section className="flex flex-col gap-2" aria-labelledby="prepayment-history-heading">
      <SectionHeader level={2} id="prepayment-history-heading">{t("historyHeading")}</SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("historyBody")}</p>
      {row.occurrences.length === 0 ? (
        <EmptyState>{t("historyEmpty")}</EmptyState>
      ) : (
        <DataTableCard label={t("historyTableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colDue")}</TableHead>
              <TableHead>{t("colOutcome")}</TableHead>
              <TableHead>{t("colRecord")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row.occurrences.map((o) => (
              <OccurrenceRow key={o.occurrence_id} clientId={clientId} o={o} />
            ))}
          </TableBody>
        </DataTableCard>
      )}
    </section>
  );
}

/** A REFUSED period prints its typed reason VERBATIM. That is the whole record of a due event the
 *  estate could not admit, and replacing it with a phrase this build invented would lose the one
 *  thing an operator can act on. */
function OccurrenceRow({ clientId, o }: { clientId: string; o: PrepaymentOccurrence }) {
  const t = useTranslations("Prepayments");
  const refusedAtAdmission = o.outcome?.state === "refused";
  const workDied = o.work_status !== null
    && ["refused", "failed", "cancelled", "expired"].includes(o.work_status)
    && o.entry_id === null;
  return (
    <TableRow data-testid={refusedAtAdmission || workDied ? "prepayment-occurrence-refused" : "prepayment-occurrence"}>
      <TableCell>{o.due_date}</TableCell>
      <TableCell>
        {refusedAtAdmission || workDied ? (
          <span className="flex flex-col gap-0.5">
            <Badge variant="secondary">{t("outcomeRefused")}</Badge>
            <span className="text-xs text-muted-foreground">
              {(refusedAtAdmission ? o.outcome?.reason : o.work_error?.reason) ?? ""}
            </span>
            <span className="max-w-prose text-xs text-muted-foreground">
              {(refusedAtAdmission ? o.outcome?.message : o.work_error?.message) ?? ""}
            </span>
          </span>
        ) : o.work_id === null ? (
          <Badge variant="outline">{t("outcomePending")}</Badge>
        ) : (
          <Badge variant="default">{t("outcomeAdmitted")}</Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap gap-2 text-xs">
          {o.work_id === null ? (
            <span className="text-muted-foreground">{t("noWork")}</span>
          ) : (
            <Link className="underline underline-offset-2" href={workDetailHref(clientId, o.work_id)}>
              {t("openWork")}
            </Link>
          )}
          {o.entry_id === null ? null : (
            <Link className="underline underline-offset-2" href={journalEntryHref(clientId, o.entry_id)}>
              {t("openEntry")}
            </Link>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}

/**
 * THE EXPLAIN-AND-CHOOSE SURFACE — PRD:73's "explain the impact and propose options; the user
 * decides", made operable rather than asserted.
 *
 * WHAT IT SAYS, in this order: WHERE the period stopped (admission is a plan-lane fact, posting is
 * a books fact, and the next act differs), the database's OWN typed reason verbatim, what that
 * reason means in this lane's terms when it is one of the four this build has enumerated, and the
 * two honest choices — ask for the period again through the EXISTING window-only catch-up once the
 * cause is fixed, or leave it refused with the record keeping why.
 *
 * IT OFFERS NO THIRD CHOICE, deliberately. There is no "post it anyway", because the refusals are
 * the estate's own walls (a closed period, an authority that lapsed, a model-egress authorisation
 * that is no longer live), and a button that appeared to walk around one would be a lie.
 */
function ExplainAndChoose({ row, period }: { row: PrepaymentDetailRow; period: PrepaymentPeriod }) {
  const t = useTranslations("Prepayments");
  const o = period.occurrence;
  if (o === null) return null;
  const stage = occurrenceStage(o.outcome?.state);
  const reason = (stage === "admission" ? o.outcome?.reason : o.work_error?.reason) ?? "";
  const specific = explanationKey(reason);
  return (
    <StateBanner tone="warning" title={t("explainHeading")}>
      <span className="flex flex-col gap-2" data-testid="prepayment-explain">
        <span>{stage === "admission" ? t("explainAdmission") : t("explainPosting")}</span>
        <span className="font-mono text-xs">{t("explainReason", { reason })}</span>
        {specific === null ? null : <span>{t(specific)}</span>}
        <span className="font-medium">{t("explainChoices")}</span>
        <ul className="ml-4 list-disc text-sm">
          <li>
            {t("explainChoiceCatchUp")}
            <span className="block text-xs text-muted-foreground">
              {t("explainChoiceCatchUpNote", { authority: row.authority_from })}
            </span>
          </li>
          <li>{t("explainChoiceLeave")}</li>
        </ul>
      </span>
    </StateBanner>
  );
}

/** The four refusals this lane can say something USEFUL about. Anything else falls through to the
 *  database's own words above — never to a phrase this build guessed. */
function explanationKey(reason: string): string | null {
  switch (reason) {
    case "write_into_closed_period": return "explainClosedPeriod";
    case "actor_not_active": return "explainAuthority";
    case "egress_not_authorized": return "explainEgress";
    case "amortisation_period_line_missing": return "explainPeriodLine";
    default: return null;
  }
}
