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
                          (#842): `settled_cents` (#797) is the one particular the estate types as
                          minor units today, and rendering it through `String(value)` showed the
                          same figure `amount_cents` renders as money, told a second way, in the
                          same disclosure. */}
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

// #842 — the basis particulars the estate types as minor units. `settled_cents` (#797) is the
// only one today (see periodic-adjustment.ts's ADJUSTMENT_FIELDS comment); a future cents-typed
// particular joins this Set, not a re-guess of "looks like cents" from the key's spelling.
const CENTS_PARTICULARS = new Set<string>(["settled_cents"]);

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
