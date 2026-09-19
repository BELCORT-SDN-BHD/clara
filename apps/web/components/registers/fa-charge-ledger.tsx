"use client";

// #651 — THE IMMUTABLE CHARGE LEDGER.
//
// `clara.get_fixed_asset` has returned `charges` since 0041 — the append-only `clara.fa_depreciation`
// rows, each with its period, its amount, the date it took effect, the run it belongs to and the
// journal entry it posted. Before this file the app declared the TYPE and read it nowhere
// (`grep -rn "\.charges\b" apps/web` returned the declaration alone), so AC4's "immutable charge,
// run and correction history" had no surface at all.
//
// APPEND-ONLY MEANS AN UNWIND IS A ROW, NOT AN ERASURE. `clara.fa_depreciation`'s trigger admits
// exactly one mutation — `is_live` true→false — and a correction is a NEW row carrying
// `unwind_of`. So this table shows BOTH: the unwinding row is labelled, and the row it unwound is
// struck through. A ledger that hid either would be telling a reader the books moved when they did
// not, which is the one thing a correction history exists to prevent.
//
// 320px (appendix D row 57): the reading strategy is to WRAP, never to clip a column silently. The
// period pair is one cell, the entry link truncates its uuid to eight characters with the full id
// on the row's title, and the table scrolls horizontally inside its card rather than losing a
// column.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/state";
import { fmtCents } from "@/lib/registers/money";
import { journalEntryHref } from "@/lib/navigation/tree";
import type { FaDepreciationCharge } from "@/lib/registers/fixed-assets";

/** The ids of every charge an unwinding row names. A row in this set was reversed; the row that
 *  reversed it carries `unwind_of`. Both stay visible — the ledger is append-only. */
export function faUnwoundChargeIds(charges: readonly FaDepreciationCharge[]): Set<string> {
  return new Set(charges.filter((c) => c.unwind_of).map((c) => String(c.unwind_of)));
}

export function FaChargeLedger({
  clientId,
  charges,
  particularsComplete,
}: {
  clientId: string;
  charges: readonly FaDepreciationCharge[];
  /** Used only to tell two empty states apart: an asset that has never been charged because its
   *  particulars are still outstanding is a different fact from one that simply has no charges
   *  yet, and only one of them tells the reader what to do next. */
  particularsComplete: boolean;
}) {
  const t = useTranslations("FixedAssetDetail.ledger");
  const tc = useTranslations("Common");
  const dash = "—";

  if (charges.length === 0) {
    return <EmptyState>{particularsComplete ? t("empty") : t("emptyBlockedByParticulars")}</EmptyState>;
  }

  const unwound = faUnwoundChargeIds(charges);
  const rows = [...charges].sort((a, b) => (a.period_start < b.period_start ? -1 : a.period_start > b.period_start ? 1 : 0));

  return (
    <div className="flex flex-col gap-3">
      <DataTableCard label={t("tableCaption")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("period")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("effectiveDate")}</TableHead>
            <TableHead>{t("entry")}</TableHead>
            <TableHead>{t("kind")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => {
            const isUnwind = Boolean(c.unwind_of);
            const isUnwound = unwound.has(c.id);
            return (
              <TableRow key={c.id} data-testid={`fa-charge-row-${c.id}`} data-unwound={isUnwound ? "true" : undefined}>
                <TableCell className={`whitespace-normal text-muted-foreground${isUnwound ? " line-through" : ""}`}>
                  {c.period_start} – {c.period_end}
                </TableCell>
                <TableCell className={isUnwound ? "line-through" : undefined}>
                  {fmtCents(c.amount_cents, tc("centsUnsafe"))}
                </TableCell>
                <TableCell className="text-muted-foreground">{c.effective_date}</TableCell>
                <TableCell>
                  {c.entry_id ? (
                    // …/journals?tab=posted&entry=<id> — the journals workbench's own URL state.
                    <Link
                      href={journalEntryHref(clientId, c.entry_id)}
                      title={c.entry_id}
                      className="font-mono break-all underline-offset-4 hover:underline"
                    >
                      {c.entry_id.slice(0, 8)}
                    </Link>
                  ) : (
                    dash
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {isUnwind ? <Badge variant="outline">{t("unwind")}</Badge> : null}
                  {isUnwound ? <Badge variant="outline">{t("unwound")}</Badge> : null}
                  {!isUnwind && !isUnwound ? t("live") : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </DataTableCard>
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </div>
  );
}
