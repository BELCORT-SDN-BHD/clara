"use client";

// #640 — JOURNEY C9's DETAIL. Everything the acceptance asks one screen to show about one
// schedule: "plan purpose/basis, accounting kind, exact schedule/timezone/effective dates,
// authority source, next-occurrence preview, current revision and immutable occurrence results."
//
// THREE READS, NOT ONE, AND EACH KEEPS ITS OWN STATE. The plan, its preview and its occurrence
// history are three doors, and a surface that folded them into one loader would make a failed
// preview hide a perfectly readable occurrence history. Each section therefore reports its own
// loading / empty / failed state, and a failure in one never blanks the others.
//
// HYDRATE-NEVER-TRUST ON EVERY CONTROL. Pause, resume, end and catch-up all run through
// `useAsyncRead().act()`, which reloads the plan unconditionally after success AND after failure,
// and the two sibling reads are reloaded beside it. Nothing here paints an outcome the database
// did not just report.
//
// THE PREVIEW IS NOT A PROMISE. `clara.preview_accounting_plan` answers `admitting:false` while a
// plan is paused or ended, and this surface says so IN WORDS above the dates rather than hiding
// them: "here is the schedule, it is not being admitted" is a different fact from "there is
// nothing scheduled", and an empty list would read as the second.
//
// AN OCCURRENCE ROW IS IMMUTABLE HISTORY. It carries its own due date, the revision it ran under,
// the Work it created, that Work's current status and — once posted — its receipt and the journal
// entry itself. A REFUSED occurrence prints its typed reason verbatim: that is the whole record of
// a due event the estate could not admit.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { buttonVariants } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/journals/money";
import { PlanBoundaryStatement } from "./plan-statement";
import { PlanStatusBadge, kindLabel, scheduleSentence } from "./plans-list";
import { EndPlanDialog, PausePlanDialog, ResumePlanDialog, CatchUpDialog } from "./plan-lifecycle-dialogs";
import {
  loadPlan, loadPlanOccurrences, loadPlanPreview,
  type PlanBasis, type PlanDetail as PlanDetailRow, type PlanOccurrenceRow,
} from "@/lib/plans/api";
import { planReviseHref, journalEntryHref, workDetailHref } from "@/lib/navigation/tree";
import { planControls } from "@/lib/plans/schedule";
import { useAsyncRead } from "@/lib/firm/use-async-read";

const PREVIEW_COUNT = 3;

/** THE FOCUSABLE LANDMARK an accepted lifecycle decision returns focus to, when the trigger that
 *  opened its dialog has unmounted with the status change. Declared beside the component that
 *  renders it so the id and the `tabIndex={-1}` that makes it focusable cannot drift apart. */
export const PLAN_HEADING_ID = "plan-detail-heading";

export function PlanDetail({ clientId, planId }: { clientId: string; planId: string }) {
  const t = useTranslations("Plans");
  const plan = useAsyncRead(() => loadPlan(planId));
  const preview = useAsyncRead(() => loadPlanPreview(planId, PREVIEW_COUNT));
  const occurrences = useAsyncRead(() => loadPlanOccurrences(planId));

  const row = plan.data;
  const controls = planControls(row?.status ?? "");
  const reloadAll = async () => {
    await Promise.all([preview.reload(), occurrences.reload()]);
  };

  return (
    <div className="flex flex-col gap-6">
      <PlanBoundaryStatement />
      <DataState
        loading={plan.loading}
        error={plan.error}
        isEmpty={row === null}
        emptyMessage={t("notFound")}
      >
        {row === null ? null : (
          <div className="flex flex-col gap-6">
            <PlanIdentity clientId={clientId} row={row} />
            <section className="flex flex-wrap items-center gap-2">
              {controls.revise ? (
                <Link
                  href={planReviseHref(clientId, row.plan_id)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t("revise")}
                </Link>
              ) : null}
              {controls.pause ? (
                <PausePlanDialog
                  planId={row.plan_id}
                  purpose={row.purpose}
                  busy={plan.busy}
                  returnFocusTo={PLAN_HEADING_ID}
                  onAct={(fn) => plan.act(async () => {
                    await fn();
                    await reloadAll();
                  })}
                />
              ) : null}
              {controls.resume ? (
                <ResumePlanDialog
                  planId={row.plan_id}
                  purpose={row.purpose}
                  busy={plan.busy}
                  returnFocusTo={PLAN_HEADING_ID}
                  onAct={(fn) => plan.act(async () => {
                    await fn();
                    await reloadAll();
                  })}
                />
              ) : null}
              {controls.catchUp ? (
                <CatchUpDialog
                  planId={row.plan_id}
                  purpose={row.purpose}
                  effectiveFrom={row.live_revision?.effective_from ?? null}
                  today={preview.data?.today ?? null}
                  busy={plan.busy}
                  onAct={(fn) => plan.act(async () => {
                    await fn();
                    await reloadAll();
                  })}
                />
              ) : null}
              {controls.end ? (
                <EndPlanDialog
                  planId={row.plan_id}
                  purpose={row.purpose}
                  busy={plan.busy}
                  returnFocusTo={PLAN_HEADING_ID}
                  onAct={(fn) => plan.act(async () => {
                    await fn();
                    await reloadAll();
                  })}
                />
              ) : null}
              {row.status === "ended" ? (
                <p className="text-sm text-muted-foreground">{t("endedNoControls")}</p>
              ) : null}
            </section>

            <PlanBasisSection basis={row.live_revision?.basis ?? null} />

            <section className="flex flex-col gap-2">
              <SectionHeader level={2}>{t("previewHeading")}</SectionHeader>
              {preview.loading ? (
                <LoadingState>{t("previewLoading")}</LoadingState>
              ) : preview.error ? (
                <StateBanner tone="error">{t("previewUnavailable")}</StateBanner>
              ) : preview.data === null ? (
                <EmptyState>{t("previewUnavailable")}</EmptyState>
              ) : (
                <>
                  {preview.data.admitting === false ? (
                    // THE PAUSED EXPLANATION, above the dates rather than instead of them.
                    <StateBanner tone="warning" title={t("previewPausedTitle")}>
                      {t("previewPausedBody")}
                    </StateBanner>
                  ) : null}
                  {preview.data.occurrences.length === 0 ? (
                    <EmptyState>{t("previewEmpty")}</EmptyState>
                  ) : (
                    <ul className="flex flex-col gap-2 text-sm">
                      {preview.data.occurrences.map((o) => (
                        <li key={`${o.due_date}-${o.leg}`} className="rounded-lg border border-border bg-card p-3">
                          <span className="font-medium">{o.due_date}</span>
                          <span className="ml-2 text-muted-foreground">{legLabel(t, o.leg)}</span>
                          <span className="ml-2 text-muted-foreground">
                            {t("previewAmount")} <Money cents={totalDebits(o.basis)} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <SectionHeader level={2}>{t("historyHeading")}</SectionHeader>
              <DataState
                loading={occurrences.loading}
                error={occurrences.error}
                isEmpty={(occurrences.data ?? []).length === 0}
                emptyMessage={t("historyEmpty")}
              >
                <DataTableCard label={t("historyTableLabel")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colDue")}</TableHead>
                      <TableHead>{t("colLeg")}</TableHead>
                      <TableHead>{t("colRevision")}</TableHead>
                      <TableHead>{t("colOutcome")}</TableHead>
                      <TableHead>{t("colLinks")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(occurrences.data ?? []).map((o) => (
                      <OccurrenceRow key={o.occurrence_id} clientId={clientId} occurrence={o} />
                    ))}
                  </TableBody>
                </DataTableCard>
              </DataState>
            </section>
          </div>
        )}
      </DataState>
    </div>
  );
}

function PlanIdentity({ clientId, row }: { clientId: string; row: PlanDetailRow }) {
  const t = useTranslations("Plans");
  const rev = row.live_revision;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* `tabIndex={-1}` makes it programmatically focusable WITHOUT adding it to the tab
            order — the standard treatment for a destination focus is SENT to rather than tabbed
            to. See plan-lifecycle-dialogs.tsx's `moveFocusTo` for what sends it. */}
        <h2 id={PLAN_HEADING_ID} tabIndex={-1} className="text-base font-medium text-card-foreground">
          {row.purpose}
        </h2>
        <PlanStatusBadge status={row.status} />
        <span className="text-sm text-muted-foreground">{kindLabel(t, row.kind)}</span>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Fact label={t("factSchedule")}>
          {rev === null
            ? t("scheduleUnknown")
            : `${scheduleSentence(t, rev)} · ${rev.timezone}`}
        </Fact>
        <Fact label={t("factWindow")}>
          {rev === null
            ? "—"
            : `${rev.effective_from}${rev.effective_to === null ? ` ${t("windowOpenEnded")}` : ` – ${rev.effective_to}`}`}
        </Fact>
        <Fact label={t("factRevision")}>{String(row.current_revision)}</Fact>
        <Fact label={t("factAuthority")}>
          {/* THE AUTHORITY IS A LINK TO THE INSTRUCTION ITSELF where the reference names a Work —
              the acceptance's "authority source … and instruction link". A reference of another
              kind prints what it is rather than inventing a destination for it. */}
          {row.authority_ref?.kind === "accounting_work" && typeof row.authority_ref.id === "string" ? (
            <Link className="underline underline-offset-2" href={workDetailHref(clientId, row.authority_ref.id)}>
              {t("authorityInstructionLink")}
            </Link>
          ) : (
            <span>{String(row.authority_ref?.kind ?? row.authority_kind)}</span>
          )}
        </Fact>
        <Fact label={t("factAuthoriser")}>{row.authorised_by}</Fact>
        <Fact label={t("factAuthorisedAt")}>{row.authorised_at}</Fact>
      </dl>
      {row.status === "paused" && row.paused_reason !== null ? (
        <p className="text-sm text-muted-foreground">{t("pausedReason", { reason: row.paused_reason })}</p>
      ) : null}
      {row.status === "ended" && row.ended_reason !== null ? (
        <p className="text-sm text-muted-foreground">{t("endedReason", { reason: row.ended_reason })}</p>
      ) : null}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function PlanBasisSection({ basis }: { basis: PlanBasis | null }) {
  const t = useTranslations("Plans");
  if (basis === null) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("basisHeading")}</SectionHeader>
      <p className="max-w-prose text-sm text-muted-foreground">{t("basisMemo", { memo: basis.memo })}</p>
      {/* THE DATE ON THE STORED BASIS IS A PLACEHOLDER and this surface says so rather than
          printing it as "the posting date": every occurrence replaces it with its own due date. */}
      <p className="max-w-prose text-xs text-muted-foreground">{t("basisDateNote")}</p>
      <DataTableCard label={t("basisTableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colAccount")}</TableHead>
            <TableHead>{t("colDescription")}</TableHead>
            <TableHead className="text-right">{t("colDebit")}</TableHead>
            <TableHead className="text-right">{t("colCredit")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {basis.lines.map((line, i) => (
            <TableRow key={`${line.account_code}-${i}`}>
              <TableCell>{line.account_code}</TableCell>
              <TableCell className="text-muted-foreground">{line.description ?? ""}</TableCell>
              <TableCell className="text-right"><Money cents={line.debit_cents} /></TableCell>
              <TableCell className="text-right"><Money cents={line.credit_cents} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTableCard>
    </section>
  );
}

function OccurrenceRow({ clientId, occurrence }: { clientId: string; occurrence: PlanOccurrenceRow }) {
  const t = useTranslations("Plans");
  const refused = occurrence.outcome?.state === "refused";
  // #789 — THE LEDGER IS OLDEST-FIRST AND INCLUDES THE CURRENT ADMISSION (0193 appends one element
  // on every admission), so the PRIOR attempts are the ledger elements whose `work_id` is NOT the
  // row's current one. Rendering the ledger verbatim would show the current Work as its own
  // predecessor. `attempts` is tolerated absent (a door below 0193's frontier, or an ordinary
  // single-attempt occurrence carrying an empty ledger) — it renders no history block at all, not a
  // throw.
  const priorAttempts = (occurrence.attempts ?? []).filter((a) => a.work_id !== occurrence.work_id);
  return (
    <TableRow>
      <TableCell className="font-medium">{occurrence.due_date}</TableCell>
      <TableCell className="text-muted-foreground">{legLabel(t, occurrence.leg)}</TableCell>
      <TableCell className="text-muted-foreground">
        {occurrence.revision}
        {/* THE CURRENT ATTEMPT NUMBER, FOLDED INTO THE REVISION CELL rather than a new column — a
            new column would mean a new header kept in step with it for no reader benefit, since
            attempt 1 (the overwhelming majority of occurrences) says nothing a reader does not
            already assume. */}
        {" · "}
        {t("attemptLabel", { n: occurrence.attempt })}
      </TableCell>
      <TableCell>
        {refused ? (
          // A REFUSED DUE EVENT PRINTS ITS TYPED REASON VERBATIM — the database's own words, never
          // re-worded (lib/doors.ts's rule for a governed refusal, applied to a recorded one).
          <span className="text-error">
            {t("outcomeRefused")}
            {occurrence.outcome?.reason ? ` · ${occurrence.outcome.reason}` : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {occurrence.work_status === null ? t("outcomeAdmitted") : workStatusLabel(t, occurrence.work_status)}
          </span>
        )}
      </TableCell>
      <TableCell className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-2">
          {occurrence.work_id === null ? (
            <span className="text-muted-foreground">{t("noWork")}</span>
          ) : (
            <Link className="underline underline-offset-2" href={workDetailHref(clientId, occurrence.work_id)}>
              {t("openWork")}
            </Link>
          )}
          {occurrence.entry_id === null ? null : (
            <Link className="underline underline-offset-2" href={journalEntryHref(clientId, occurrence.entry_id)}>
              {t("openEntry")}
            </Link>
          )}
          {/* THE ENTRY THIS LEG UNDOES, under a label distinct from `openEntry` so it cannot be read
              as the entry this occurrence PRODUCED (CONTEXT's own distinction between the two). */}
          {occurrence.reverses_entry_id === null || occurrence.reverses_entry_id === undefined ? null : (
            <Link className="underline underline-offset-2" href={journalEntryHref(clientId, occurrence.reverses_entry_id)}>
              {t("reversesEntry")}
            </Link>
          )}
        </div>
        {/* THE CANCELLED OR FAILED WORK STAYS REACHABLE FROM THE PLAN (CONTEXT's "Plan occurrence"):
            every prior attempt this due event took, each linking its OWN Work through the same
            helper the current `work_id` already uses. No block at all when there is none — an
            ordinary, never-superseded occurrence renders exactly as it always has. */}
        {priorAttempts.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{t("priorAttemptsHeading")}</span>
            {priorAttempts.map((a) => (
              <Link
                key={a.work_id}
                className="text-xs underline underline-offset-2"
                href={workDetailHref(clientId, a.work_id)}
              >
                {t("priorAttemptLink", { n: a.attempt })}
              </Link>
            ))}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

function legLabel(t: Translate, leg: string): string {
  const labels: Record<string, string> = { primary: t("legPrimary"), reversal: t("legReversal") };
  return labels[leg] ?? leg;
}

function workStatusLabel(t: Translate, status: string): string {
  const labels: Record<string, string> = {
    queued: t("workQueued"),
    running: t("workRunning"),
    awaiting_input: t("workAwaitingInput"),
    stopping: t("workStopping"),
    completed: t("workCompleted"),
    refused: t("workRefused"),
    failed: t("workFailed"),
    cancelled: t("workCancelled"),
    expired: t("workExpired"),
  };
  return labels[status] ?? status;
}

/** The occurrence's own amount: the sum of its debits, in exact cents. Integer arithmetic only —
 *  a non-integer in the basis is a wire fault, not something to round. */
function totalDebits(basis: PlanBasis): number {
  return basis.lines.reduce((sum, line) => sum + (Number.isInteger(line.debit_cents) ? line.debit_cents : 0), 0);
}
