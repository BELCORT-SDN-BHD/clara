"use client";

// THE CELLS THE TWO COMPOSITION TABLES SHARE (#1001 review, 2026-09-23).
//
// The cash arm (`client-cash-trend.tsx`) and the profit arm (`client-income-expense-chart.tsx`)
// each render a per-account composition table. Their COLUMNS differ, deliberately: cash leads
// with a closing BALANCE and names why each account is cash, profit has neither, and a table
// component taking arrays of extra cell renderers would hide that difference behind an
// indirection harder to read than the two explicit tables. What IS the same cell twice is the
// account cell and the entries cell — down to the drilldown address.
//
// THEY WERE BUILT INDEPENDENTLY ONCE, AND THAT COST WAS PAID IMMEDIATELY. The account-level cap
// disclosure was copied from the profit table to the cash table still saying "largest first"
// when neither door orders by size (migration 0232 orders both compositions by `a.account_code`).
// One copy of a shape drifts; two copies drift apart.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { TableCell } from "@/components/ui/table";
import { CENTS_UNAVAILABLE, fmtCents } from "@/lib/registers/money";
import type { CompositionRow } from "@/lib/dashboard/financial-pack";
import { clientBase } from "@/lib/navigation/tree";
import { formatDay } from "./client-financial-figure";

/** The ONE address a composition entry opens. Built here once so neither table — nor any later
 *  caller — can spell the same drilldown two ways. It addresses the EXISTING journals page,
 *  which already reads `?tab=posted&entry=<id>` on the server, so Back returns the reader where
 *  they were. */
export function entryHref(clientId: string, entryId: string): string {
  return `${clientBase(clientId)}/journals?tab=posted&entry=${encodeURIComponent(entryId)}`;
}

/** One account's own cell: its chart code, then its name. */
export function CompositionAccountCell({ row }: { row: CompositionRow }) {
  return (
    <TableCell>
      <span className="font-medium">{row.accountCode}</span>{" "}
      <span className="text-muted-foreground">{row.name}</span>
    </TableCell>
  );
}

/** The entries behind one account's movement — each a link into the journals page — and the
 *  entry-level cap (20 per account, in the door) saying so when it bit. `truncatedKey` is the
 *  CALLER's own message key: the two tables describe different populations and each says so in
 *  its own words. */
export function CompositionEntriesCell({
  clientId,
  row,
  truncatedKey,
}: {
  clientId: string;
  row: CompositionRow;
  truncatedKey: "drilldown.truncated" | "cashDrilldown.truncated";
}) {
  const t = useTranslations("ClientFinancial");
  const tc = useTranslations("Common");
  return (
    <TableCell>
      <ul className="flex flex-col gap-1">
        {row.entries.map((e) => (
          <li key={e.entryId}>
            <Link
              href={entryHref(clientId, e.entryId)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {formatDay(e.postingDate)}
              {" · "}
              {e.amountCents === null
                ? CENTS_UNAVAILABLE
                : fmtCents(e.amountCents, tc("centsUnsafe"))}
              {e.memo ? ` · ${e.memo}` : ""}
            </Link>
          </li>
        ))}
      </ul>
      {row.entriesTruncated ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t(truncatedKey, { shown: row.entries.length, total: row.entriesTotal ?? 0 })}
        </p>
      ) : null}
    </TableCell>
  );
}
