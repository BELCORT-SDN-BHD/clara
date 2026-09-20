"use client";

// #643 — THE PERIODIC-ADJUSTMENT HISTORY: what this client has recorded, with the exact fields,
// the source of each figure, and the links to the Work, the posted entry and the receipt.
//
// IT IS A RESULT SURFACE, NOT A SECOND FORM. #643's fourth acceptance line asks for "the named
// periodic-adjustment form/type AND result/history with exact fields, sources and Work/JE links";
// this is that half. Every value below is a column of `clara.periodic_adjustments` or of the
// posted entry it names — nothing is derived in the browser, and nothing is rounded: amounts
// render through the house `Money` component from exact minor units.
//
// THE DISCLOSURE IS THE NARROW-SCREEN STRATEGY, and it is also the honest one. A periodic
// adjustment has ten or more particulars and a correction chain; a table that put them all in
// columns would clip at 320 px and hide the meaning rather than carry it. So the row names the
// four facts that identify it (period, what it is, how much, and whether its entry still stands)
// and a per-row `<details>` carries the rest — the same shape `journal-entry-row.tsx` uses for an
// entry's own disclosure, in the same place a reader already looks.
//
// A REVERSED ADJUSTMENT IS NOT HIDDEN. Its row stays, badged, and names the correction that
// replaced it when there is one — the correction chain #643 asks to be "separately linked". The
// database keeps the row through a reversal for exactly this reason.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/journals/money";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { journalEntryHref, workDetailHref } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { listPeriodicAdjustments, type PeriodicAdjustmentRow } from "@/lib/work/periodic-adjustment-reads";
import type { SessionTokenAccessor } from "@/lib/session";

export function PeriodicAdjustmentsTable({
  clientId,
  session = sessionTokenAccessor,
  load,
}: {
  clientId: string;
  session?: SessionTokenAccessor;
  /** Injectable for the cells, the same reason every other read on these surfaces is. */
  load?: () => Promise<PeriodicAdjustmentRow[]>;
}) {
  const t = useTranslations("PeriodicAdjustment");
  const read = useAsyncRead<PeriodicAdjustmentRow[]>(() =>
    load ? load() : listPeriodicAdjustments(clientId, {}, { session }),
  );
  const rows = read.data ?? [];

  return (
    <DataState
      loading={read.loading}
      error={read.error}
      isEmpty={read.data !== null && rows.length === 0}
      emptyMessage={t("history.empty")}
    >
      <Table aria-label={t("history.tableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("history.period")}</TableHead>
            <TableHead>{t("history.kind")}</TableHead>
            <TableHead className="text-right">{t("history.amount")}</TableHead>
            <TableHead>{t("history.state")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="align-top">
                <span className="font-mono text-xs">{row.period_start} — {row.period_end}</span>
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-col gap-1">
                  <span>{t(`purpose.options.${row.purpose}`)}</span>
                  <span className="text-xs text-muted-foreground">{subtitleOf(row, t)}</span>
                </div>
              </TableCell>
              {/* EXACT MINOR UNITS, rendered by the one money component. A stock movement is
                  SIGNED — a count below opening is a real, negative fact — so it is shown with its
                  sign rather than as an absolute value with a word beside it. */}
              <TableCell className="text-right align-top tabular-nums">
                <Money cents={row.amount_cents} />
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-col items-start gap-1">
                  {row.reversed_by === null ? (
                    <Badge variant="outline">{t("history.live")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("history.reversed")}</Badge>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-primary underline underline-offset-2">
                      {t("history.disclose")}
                    </summary>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <Fact label={t("history.postingDate")} value={row.posting_date} mono />
                      <Fact label={t("history.entry")}
                        value={<Link className="text-primary underline underline-offset-2"
                          href={journalEntryHref(clientId, row.entry_id)}>{row.entry_id}</Link>} />
                      <Fact label={t("history.work")}
                        value={<Link className="text-primary underline underline-offset-2"
                          href={workDetailHref(clientId, row.work_id)}>{row.work_id}</Link>} />
                      <Fact label={t("history.receipt")} value={row.receipt_id} mono />
                      <Fact label={t("history.logicalOpId")} value={row.logical_op_id} mono />
                      {row.source_document_id === null ? null : (
                        <Fact label={t("history.source")} value={row.source_document_id} mono />
                      )}
                      {/* THE CORRECTION CHAIN, BOTH WAYS. The database keeps both pointers so a
                          reader arriving at either end can reach the other. */}
                      {row.corrects_adjustment_id === null ? null : (
                        <Fact label={t("history.corrects")} value={row.corrects_adjustment_id} mono />
                      )}
                      {row.corrected_by_adjustment_id === null ? null : (
                        <Fact label={t("history.correctedBy")} value={row.corrected_by_adjustment_id} mono />
                      )}
                      {/* THE PARTICULARS, VERBATIM. Every key the commit stored, rendered as it
                          was stored — this is the "exact fields and sources" half of AC4, and a
                          re-worded summary would be a second account of the same figures.
                          "VERBATIM" STILL MEANS THE HOUSE MONEY COMPONENT for a cents-typed key
                          (#842): CENTS_PARTICULARS below names every basis key migration 0212's
                          `_adjustment_basis_canonical` types as minor units, so none of them
                          renders through `String(value)` as the same figure a column already
                          renders as money, told a second way, in the same disclosure. */}
                      {Object.entries(row.basis)
                        .filter(([, value]) => value !== null && value !== undefined && value !== "")
                        .map(([key, value]) => (
                          <Fact
                            key={key}
                            label={key}
                            value={CENTS_PARTICULARS.has(key) && typeof value === "number"
                              ? <Money cents={value} />
                              : String(value)}
                            mono
                          />
                        ))}
                    </dl>
                  </details>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataState>
  );
}

// #842 — the basis particulars `clara._adjustment_basis_canonical` (migration 0212) types as
// minor units: `amount_cents` (both purposes), `opening_cents`/`closing_cents`/`adjustment_cents`
// (the stock branch) and `settled_cents` (#797, the payroll branch). Measured against that
// function's `jsonb_build_object` calls, not re-guessed from a key's spelling — a future
// cents-typed particular joins this Set because the migration says so, not because it "looks like
// cents".
//
// CRS-07-08 (code-review fix round) — A DECLARED, EVIDENCE-BASED OVERRIDE of #842's own
// out-of-scope line ("Any other basis particular (none is cents-typed today)"). That line's
// premise does not hold: `_adjustment_basis_canonical` builds ALL FIVE keys above — not only
// `settled_cents` — through the same `clara._adjustment_cents_value(p_adjustment, <key>)`
// (0212_payroll_settled_cents.sql:290-332, unchanged from 0194_periodic_adjustments.sql:715+),
// which returns `bigint` or null (0194:470-475) — every one of them is integer-cents today, not
// only the one the ticket named. Rendering `amount_cents`/`opening_cents`/`closing_cents`/
// `adjustment_cents` through `String(value)` while `settled_cents` alone went through `Money`
// would have been the exact defect #842 was opened to fix, repeated four more times in the same
// disclosure. This widening is therefore kept on purpose, verified against the migration rather
// than assumed, and the four extra keys were NOT in #842's own acceptance criteria — flagged
// here, in the commit message, and in the lane's fix report for the owner to rule on, rather
// than closing #842 against a criterion (the out-of-scope line) it no longer literally matches.
const CENTS_PARTICULARS = new Set<string>([
  "amount_cents",
  "opening_cents",
  "closing_cents",
  "adjustment_cents",
  "settled_cents",
]);

function Fact({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "wrap-anywhere font-mono text-foreground" : "wrap-anywhere text-foreground"}>{value}</dd>
    </>
  );
}

/** The one line under the kind that says WHICH adjustment this is — the method for a stocktake,
 *  the obligation kind for a payroll accrual. Read off the stored particulars, never guessed. */
function subtitleOf(row: PeriodicAdjustmentRow, t: (key: string) => string): string {
  if (row.purpose === "periodic_stock_adjustment") {
    const method = row.basis.method;
    return typeof method === "string" ? t(`method.options.${method}`) : "";
  }
  const kind = row.basis.obligation_kind;
  return typeof kind === "string" ? t(`obligationKind.options.${kind}`) : "";
}
