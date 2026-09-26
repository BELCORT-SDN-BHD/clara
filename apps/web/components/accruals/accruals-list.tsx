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
//
// #1152 — THE REGISTER READS A PAGE AT A TIME, AND THE SIDE FILTER IS A SERVER ROUND TRIP. Before
// this ticket the side control narrowed a FULLY READ answer in the browser — honest only because
// every row was already in hand. Now that the register paginates, a client-side filter could
// disagree with a page it had not yet read, so `useAccrualsRegister` sends `side` to the door
// (`clara.list_accrual_adjustments`'s own `p_side`) and this component renders exactly the rows
// it is handed, never a second, local narrowing on top.

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccrualBoundaryStatement } from "./accrual-statement";
import { AccrualBillConflicts } from "./accrual-bill-conflicts";
import { NativeSelect } from "@/components/common/native-select";
import { ACCRUAL_SIDES, type AccrualListRow, type AccrualSide } from "@/lib/accruals/api";
import { useAccrualsRegister } from "@/lib/accruals/use-accruals-register";
import { accrualCreateHref, accrualDetailHref } from "@/lib/navigation/tree";
import { formatCents } from "@/lib/bank/money";

export function AccrualsList({ clientId }: { clientId: string }) {
  const t = useTranslations("Accruals");
  const [side, setSide] = useState<AccrualSide | "">("");
  const { rows, loading, loadingMore, error, hasMore, loadMore } = useAccrualsRegister(clientId, {}, side);

  return (
    <div className="flex flex-col gap-6">
      <AccrualBoundaryStatement />
      {/* #938 — "a bill posted inside an accrued period", ABOVE the configured-accruals table:
          it names an action the person should take now, the table below is the standing
          register. */}
      <AccrualBillConflicts clientId={clientId} />
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
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="accruals-side-filter">
            {t("filterSide")}
          </label>
          <NativeSelect
            id="accruals-side-filter"
            className="w-auto min-w-40"
            value={side}
            onChange={(e) => setSide(e.target.value as AccrualSide | "")}
          >
            <option value="">{t("filterSideAll")}</option>
            {ACCRUAL_SIDES.map((s) => (
              <option key={s} value={s}>{sideLabel(t, s)}</option>
            ))}
          </NativeSelect>
        </div>
        <DataState
          loading={loading}
          error={error}
          isEmpty={rows.length === 0}
          emptyMessage={t("empty")}
        >
          <DataTableCard label={t("tableLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colPurpose")}</TableHead>
                <TableHead>{t("colSide")}</TableHead>
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
          {hasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 self-start"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? t("loadingMore") : t("loadMore")}
            </Button>
          ) : null}
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
        {/* #942 — THE LEGS READ IN POSTING ORDER. A revenue accrual debits the accrued-income
            asset and credits the revenue account, so printing the two columns in their stored
            order would say the opposite of what the ledger will do for half the register. */}
        <span className="block text-xs text-muted-foreground">
          {row.side === "revenue"
            ? t("legs", { expense: row.liability_account_code, liability: row.expense_account_code })
            : t("legs", { expense: row.expense_account_code, liability: row.liability_account_code })}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{sideLabel(t, row.side)}</TableCell>
      <TableCell className="text-muted-foreground">
        <span className="block">{t("termRange", { from: row.service_period_start, to: row.service_period_end })}</span>
        <span className="block text-xs">{methodLabel(t, row.method?.rule ?? "")}</span>
      </TableCell>
      <TableCell className="tabular-nums">
        {formatCents(row.amount_cents)}
        {/* #1071 — the Amount column names its OWN kind, beside the money: `amount_cents` is the
            per-period figure under `stated_amount` but the WINDOW TOTAL under
            `stated_period_amount` (#937), and a reader scanning this column alone had no way to
            tell which. The Term column's method sentence already says the same fact in different
            words, but this is the label at the figure itself. */}
        <span className="block text-xs text-muted-foreground">{amountKindLabel(t, row.method?.rule ?? "")}</span>
      </TableCell>
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
 *  performed (migration 0222's FOURTH MEASUREMENT). */
/** #942 — the side, in one word, with the same honest raw-value fallback `methodLabel` uses. */
export function sideLabel(t: Translate, side: string): string {
  const labels: Record<string, string> = {
    expense: t("sideShortExpense"),
    revenue: t("sideShortRevenue"),
  };
  return labels[side] ?? side;
}

export function methodLabel(t: Translate, rule: string): string {
  const labels: Record<string, string> = {
    stated_amount: t("methodStatedAmount"),
    // #937 — the second rule the ledger performs. An unenumerated value still prints as itself.
    stated_period_amount: t("methodStatedPeriodAmount"),
  };
  return labels[rule] ?? rule;
}

/** #1071 — WHICH KIND OF FIGURE the Amount column's `amount_cents` is, beside the money itself:
 *  under `stated_amount` it is the amount THIS accrual posts every period; under
 *  `stated_period_amount` (#937) `amount_cents` is the TOTAL across the whole authority window,
 *  and the per-period figures live only in `period_amounts` (rendered on the detail view, #1070 —
 *  the register does not render them, by that ticket's own scope). Same honest raw-value fallback
 *  as `sideLabel`/`methodLabel`: a rule this build has not enumerated prints as itself rather than
 *  a false claim about which kind the figure is. */
export function amountKindLabel(t: Translate, rule: string): string {
  const labels: Record<string, string> = {
    stated_amount: t("amountKindPerPeriod"),
    stated_period_amount: t("amountKindWindowTotal"),
  };
  return labels[rule] ?? rule;
}
