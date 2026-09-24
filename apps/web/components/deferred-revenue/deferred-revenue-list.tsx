"use client";

// #941 — THE DEFERRED-REVENUE LIST: the attention band first, then the schedules.
//
// THE ATTENTION BAND IS ABOVE THE TABLE, and the order is the point rather than a layout taste: a
// schedule that is recognising correctly needs no decision, and a period that recognised NOTHING
// is invisible everywhere else in the estate — the liability simply stays where it was and the
// revenue never appears.
//
// TWO READS, NOT ONE, AND EACH KEEPS ITS OWN STATE. `clara.list_revenue_recognition_schedules` and
// `clara.list_revenue_recognition_attention` are two doors, and folding them into one loader would
// make a failed attention read blank a perfectly readable schedule list.
//
// EVERY NUMBER IS THE DATABASE'S. The progress column is `posted_periods` — periods with a
// COMMITTED receipt, never admitted Work — and `next_due` is the shared scheduler's own arithmetic.
// This file computes no date at all.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/common/native-select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/journals/money";
import {
  RecognitionBoundaryStatement, RecognitionConfigurationStatement, RecognitionTaxStatement,
} from "./deferred-revenue-statement";
import { RecognitionAttentionBand } from "./deferred-revenue-attention";
import {
  loadRecognitionAttention, loadRecognitionSchedules,
  type RecognitionListRow, type RecognitionTermSource,
} from "@/lib/deferred-revenue/api";
import { deferredRevenueCreateHref, deferredRevenueDetailHref } from "@/lib/navigation/tree";
import { useAsyncRead } from "@/lib/firm/use-async-read";

export function DeferredRevenueList({ clientId }: { clientId: string }) {
  const t = useTranslations("DeferredRevenue");
  const schedules = useAsyncRead(() => loadRecognitionSchedules(clientId));
  const attention = useAsyncRead(() => loadRecognitionAttention(clientId));
  const all = schedules.data ?? [];
  // THE FILTER IS OVER THE READ THIS LIST ALREADY HOLDS, never a second call. Both lanes arrive in
  // one answer, so re-reading to narrow would be a second answer to one question and a second
  // chance to disagree with itself.
  const [termSource, setTermSource] = useState<RecognitionTermSource | "">("");
  const rows = useMemo(
    () => (termSource === "" ? all : all.filter((r) => r.term_source === termSource)),
    [all, termSource],
  );

  return (
    <div className="flex flex-col gap-6">
      <RecognitionBoundaryStatement />
      <RecognitionConfigurationStatement />
      <RecognitionTaxStatement />

      <RecognitionAttentionBand
        clientId={clientId}
        attention={attention.data}
        loading={attention.loading}
        error={attention.error}
      />

      <section className="flex flex-col gap-2" aria-labelledby="deferred-revenue-list-heading">
        <SectionHeader
          level={2}
          id="deferred-revenue-list-heading"
          action={
            // THE PRIMARY ACTION STAYS VISIBLE (appendix D's Dropdown Menu rule) and it is a LINK,
            // not a dialog trigger: configuring carries a posted receipt, a judged account with its
            // stated grounds and a derived allocation preview, which appendix C §4 sends to a
            // detail destination rather than an overlay.
            <Link
              href={deferredRevenueCreateHref(clientId)}
              className={buttonVariants({ size: "sm" })}
            >
              {t("newSchedule")}
            </Link>
          }
        >
          {t("listHeading")}
        </SectionHeader>
        <p className="max-w-prose text-sm text-muted-foreground">{t("listBody")}</p>
        {/* THE TERM-SOURCE FILTER. An advance recognised over a period a PERSON stated and one
            recognised over a period an invoice states are the same schedule with different
            provenance, and a firm reviewing its own judgements wants exactly one of those groups.
            A labelled native Select, so the control is a control rather than a row of toggles
            whose state a reader has to infer. */}
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="deferred-revenue-term-source-filter"
          >
            {t("termSourceFilterLabel")}
          </label>
          <NativeSelect
            id="deferred-revenue-term-source-filter"
            className="w-auto"
            value={termSource}
            onChange={(e) => setTermSource(e.target.value as RecognitionTermSource | "")}
          >
            <option value="">{t("termSourceAll")}</option>
            <option value="document_service_period">{t("termSourceDocument")}</option>
            <option value="human_stated">{t("termSourceStated")}</option>
          </NativeSelect>
        </div>
        <DataState
          loading={schedules.loading}
          error={schedules.error}
          isEmpty={rows.length === 0}
          emptyMessage={t("empty")}
        >
          <DataTableCard label={t("tableLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colPurpose")}</TableHead>
                <TableHead>{t("colTerm")}</TableHead>
                <TableHead>{t("colTotal")}</TableHead>
                <TableHead>{t("colProgress")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colNext")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ScheduleRow key={row.schedule_id} clientId={clientId} row={row} />
              ))}
            </TableBody>
          </DataTableCard>
        </DataState>
      </section>
    </div>
  );
}

function ScheduleRow({ clientId, row }: { clientId: string; row: RecognitionListRow }) {
  const t = useTranslations("DeferredRevenue");
  return (
    <TableRow>
      <TableCell>
        <Link
          className="font-medium underline underline-offset-2"
          href={deferredRevenueDetailHref(clientId, row.schedule_id)}
        >
          {row.purpose}
        </Link>
        <span className="block text-xs text-muted-foreground">
          {row.deferred_account_code} → {row.revenue_account_code}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {row.term_start} – {row.term_end}
        {/* THE SAME FACT THE DETAIL BANNER CARRIES, where a person first meets the schedule. It is
            a WORD, not a colour (appendix D, Badge), and it is keyed on `term_moved === true` for
            two reasons: a re-record that changed nothing is not a correction, and an absent field
            must paint nothing. */}
        {row.term_moved === true ? (
          <span className="mt-1 block" data-testid="deferred-revenue-row-term-corrected">
            <Badge variant="outline">{t("termCorrectedBadge")}</Badge>
          </span>
        ) : null}
        {/* WHERE THE TERM CAME FROM. `=== "human_stated"`, never a truthiness test on the absence
            of a document id: the field arrives as unvalidated jsonb, and a web build ahead of its
            database would paint this marker on every schedule in the firm if it inferred the lane
            from a null. */}
        {row.term_source === "human_stated" ? (
          <span className="mt-1 block" data-testid="deferred-revenue-row-term-stated">
            <Badge variant="secondary">{t("termStatedBadge")}</Badge>
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <Money cents={row.total_cents} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {/* POSTED, NOT ADMITTED. A committed receipt is money on the books; an admitted Work is a
            job that may still refuse. The two are different facts and this column says the first. */}
        {t("progress", { posted: row.posted_periods, count: row.period_count })}
      </TableCell>
      <TableCell>
        <RecognitionStatusBadge status={row.status} />
      </TableCell>
      <TableCell>
        {/* AN ENDED OR PAUSED SCHEDULE STILL HAS PERIODS, and they are not being admitted. Printing
            the next date beside a "paused" badge without saying so would read as "this will run". */}
        {row.status === "active" ? (row.next_due ?? t("noNextOccurrence")) : t("notAdmitting")}
      </TableCell>
    </TableRow>
  );
}

export function RecognitionStatusBadge({ status }: { status: string }) {
  const t = useTranslations("DeferredRevenue");
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
