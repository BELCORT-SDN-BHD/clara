"use client";

// #640 — JOURNEY C9's LIST: "Plans list → purpose/basis/authority/schedule → next occurrence
// preview → run history and revise/pause/cancel."
//
// EVERY ROW SAYS WHAT IT IS AND WHEN IT NEXT RUNS, and both halves are read from the database
// rather than derived here: `next_occurrence` is `clara.list_accounting_plans`'s own answer,
// computed by the same `_plan_due_*` arithmetic the runtime scan uses. A second implementation of
// "when is this due" in TypeScript is exactly the drift #640's DB-owned arithmetic exists to
// prevent, so this file computes no date at all.
//
// THE SCHEDULE IS RENDERED AS A SENTENCE ASSEMBLED FROM TRANSLATED PIECES, with the raw value as
// an honest fallback for anything outside the known set (the adjustments-register N10 idiom): a
// frequency this build has not enumerated prints as itself, never as a key path and never as a
// silent blank.
//
// THE TIMEZONE IS ALWAYS SHOWN BESIDE THE DATES, because a due date is a calendar day in a
// specific zone and a reader eight hours away would otherwise have to guess which one.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlanBoundaryStatement } from "./plan-statement";
import { loadPlans, type PlanListRow } from "@/lib/plans/api";
import { planCreateHref, planDetailHref } from "@/lib/navigation/tree";
import { useAsyncRead } from "@/lib/firm/use-async-read";

export function PlansList({ clientId }: { clientId: string }) {
  const t = useTranslations("Plans");
  const plans = useAsyncRead(() => loadPlans(clientId));
  const rows = plans.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PlanBoundaryStatement />
      <section className="flex flex-col gap-2">
        <SectionHeader
          level={2}
          action={
            // THE PRIMARY ACTION STAYS VISIBLE (appendix D's Dropdown Menu rule) and it is a LINK,
            // not a dialog trigger: a plan carries a schedule, an authority and a full journal
            // basis, which appendix C §4 sends to a detail destination rather than an overlay.
            <Link href={planCreateHref(clientId)} className={buttonVariants({ size: "sm" })}>
              {t("newPlan")}
            </Link>
          }
        >
          {t("listHeading")}
        </SectionHeader>
        <p className="max-w-prose text-sm text-muted-foreground">{t("listBody")}</p>
        <DataState
          loading={plans.loading}
          error={plans.error}
          isEmpty={rows.length === 0}
          emptyMessage={t("empty")}
        >
          <DataTableCard label={t("tableLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colPurpose")}</TableHead>
                <TableHead>{t("colSchedule")}</TableHead>
                <TableHead>{t("colWindow")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colNext")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <PlanRow key={row.plan_id} clientId={clientId} row={row} />
              ))}
            </TableBody>
          </DataTableCard>
        </DataState>
      </section>
    </div>
  );
}

function PlanRow({ clientId, row }: { clientId: string; row: PlanListRow }) {
  const t = useTranslations("Plans");
  return (
    <TableRow>
      <TableCell>
        <Link className="font-medium underline underline-offset-2" href={planDetailHref(clientId, row.plan_id)}>
          {row.purpose}
        </Link>
        <span className="block text-xs text-muted-foreground">{kindLabel(t, row.kind)}</span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span className="block">{scheduleSentence(t, row)}</span>
        <span className="block text-xs">{row.timezone ?? ""}</span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {row.effective_from ?? "—"}
        {row.effective_to === null || row.effective_to === undefined ? ` ${t("windowOpenEnded")}` : ` – ${row.effective_to}`}
      </TableCell>
      <TableCell>
        <PlanStatusBadge status={row.status} />
      </TableCell>
      <TableCell>
        {/* AN ENDED OR PAUSED PLAN STILL HAS A SCHEDULE, and it is not being admitted. Printing the
            next date beside a "paused" badge without saying so would read as "this will run". */}
        {row.status === "active"
          ? (row.next_occurrence ?? t("noNextOccurrence"))
          : t("notAdmitting")}
      </TableCell>
    </TableRow>
  );
}

export function PlanStatusBadge({ status }: { status: string }) {
  const t = useTranslations("Plans");
  // COLOUR IS NEVER THE ONLY CUE (appendix D, Badge): every badge carries its own word.
  const labels: Record<string, string> = {
    active: t("statusActive"),
    paused: t("statusPaused"),
    ended: t("statusEnded"),
  };
  const variants: Record<string, "default" | "secondary" | "outline"> = {
    active: "default",
    paused: "secondary",
    ended: "outline",
  };
  return <Badge variant={variants[status] ?? "outline"}>{labels[status] ?? status}</Badge>;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function kindLabel(t: Translate, kind: string): string {
  const labels: Record<string, string> = {
    recurring_journal: t("kindRecurring"),
    reversing_journal: t("kindReversing"),
  };
  return labels[kind] ?? kind;
}

/** The schedule as one readable line, assembled from translated pieces with an HONEST raw-value
 *  fallback for anything outside the known sets — never a key path, never a silent blank. */
export function scheduleSentence(
  t: Translate,
  row: { frequency: string | null; day_rule: string | null; day_of_month: number | null },
): string {
  const frequencies: Record<string, string> = {
    monthly: t("frequencyMonthly"),
    quarterly: t("frequencyQuarterly"),
    annual: t("frequencyAnnual"),
  };
  if (row.frequency === null || row.day_rule === null) return t("scheduleUnknown");
  const frequency = frequencies[row.frequency] ?? row.frequency;
  if (row.day_rule === "last_day_of_month") return t("scheduleLastDay", { frequency });
  if (row.day_rule === "day_of_month" && row.day_of_month !== null) {
    return t("scheduleDayOfMonth", { frequency, day: row.day_of_month });
  }
  return frequency;
}
