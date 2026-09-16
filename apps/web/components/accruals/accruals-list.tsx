"use client";

// #652 — JOURNEY C08.1's LIST: "locate the current adjustment route and prove a user can
// inspect/select an applicable template with current authority and period feedback."
//
// EVERY ROW SAYS WHAT IT ACCRUES, FOR WHICH TERM, UNDER WHOSE AUTHORITY, AND WHETHER IT HAS POSTED
// — and every one of those is read from the database rather than derived here. `posted` in
// particular is `clara.list_accrual_adjustments`'s own answer, computed from a COMMITTED
// `clara.operation_receipts` row; a flag this component inferred from a date would be a second,
// disagreeing statement about the ledger.
//
// THE SERVICE PERIOD IS SHOWN BESIDE THE MONEY, ALWAYS. An accrual's whole point is that a cost
// belongs to a period other than the one it was invoiced in, so a list that showed only an amount
// and a schedule would omit the fact the reader is there for.
//
// THE MONEY IS EXACT AND THE DATES ARE ISO. `formatCents` groups for readability and never rounds;
// the dates come back from the door as `YYYY-MM-DD` and are printed as they arrived.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccrualBoundaryStatement } from "./accrual-statement";
import { loadAccruals, type AccrualListRow } from "@/lib/accruals/api";
import { accrualCreateHref, accrualDetailHref } from "@/lib/navigation/tree";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { formatCents } from "@/lib/bank/money";

export function AccrualsList({ clientId }: { clientId: string }) {
  const t = useTranslations("Accruals");
  const accruals = useAsyncRead(() => loadAccruals(clientId));
  const rows = accruals.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <AccrualBoundaryStatement />
      <section className="flex flex-col gap-2">
        <SectionHeader
          level={2}
          action={
            // THE PRIMARY ACTION STAYS VISIBLE (appendix D's Dropdown Menu rule) and it is a LINK,
            // not a dialog trigger: an accrual carries a term, a method, an authority and two
            // account legs, which appendix C §4 sends to a detail destination rather than an
            // overlay — where one Escape would take a half-typed term with it.
            <Link href={accrualCreateHref(clientId)} className={buttonVariants({ size: "sm" })}>
              {t("newAccrual")}
            </Link>
          }
        >
          {t("listHeading")}
        </SectionHeader>
        <p className="max-w-prose text-sm text-muted-foreground">{t("listBody")}</p>
        <DataState
          loading={accruals.loading}
          error={accruals.error}
          isEmpty={rows.length === 0}
          emptyMessage={t("empty")}
        >
          <DataTableCard label={t("tableLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colPurpose")}</TableHead>
                <TableHead>{t("colTerm")}</TableHead>
                <TableHead>{t("colAmount")}</TableHead>
                <TableHead>{t("colSchedule")}</TableHead>
                <TableHead>{t("colState")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <AccrualRow key={row.accrual_id} clientId={clientId} row={row} />
              ))}
            </TableBody>
          </DataTableCard>
        </DataState>
      </section>
    </div>
  );
}

function AccrualRow({ clientId, row }: { clientId: string; row: AccrualListRow }) {
  const t = useTranslations("Accruals");
  return (
    <TableRow>
      <TableCell>
        <Link
          className="font-medium underline underline-offset-2"
          href={accrualDetailHref(clientId, row.accrual_id)}
        >
          {row.purpose}
        </Link>
        <span className="block text-xs text-muted-foreground">
          {t("legs", { expense: row.expense_account_code, liability: row.liability_account_code })}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span className="block">{t("termRange", { from: row.service_period_start, to: row.service_period_end })}</span>
        <span className="block text-xs">{methodLabel(t, row.method?.rule ?? "")}</span>
      </TableCell>
      <TableCell className="tabular-nums">{formatCents(row.amount_cents)}</TableCell>
      <TableCell className="text-muted-foreground">
        {t("windowFromTo", { from: row.effective_from, to: row.effective_to })}
      </TableCell>
      <TableCell>
        {/* COLOUR IS NEVER THE ONLY CUE (appendix D, Badge): each badge carries its own word, and
            the two words name the boundary this whole surface exists to keep — an accepted
            CONFIGURATION is not a POSTED occurrence. */}
        <Badge variant={row.posted ? "default" : "secondary"}>
          {row.posted ? t("statePosted") : t("stateConfigured")}
        </Badge>
        <span className="block text-xs text-muted-foreground">
          {t("occurrenceCount", { count: row.occurrence_count })}
        </span>
      </TableCell>
    </TableRow>
  );
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The selection rule, as a sentence — with an HONEST raw-value fallback for anything outside the
 *  admitted set (the adjustments-register N10 idiom): a rule this build has not enumerated prints
 *  as itself, never as a key path and never as a silent blank. One rule is admitted because one is
 *  performed (migration 0207's FOURTH MEASUREMENT). */
export function methodLabel(t: Translate, rule: string): string {
  const labels: Record<string, string> = {
    stated_amount: t("methodStatedAmount"),
  };
  return labels[rule] ?? rule;
}
