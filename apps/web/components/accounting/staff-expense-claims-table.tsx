"use client";

// #638 — THE STAFF-EXPENSE-CLAIM REGISTER: what this client has claimed, who claimed it, what was
// itemised, when it was incurred and when it posted, how it was settled, and the links to the Work,
// the entry, the receipt and the advance it discharged.
//
// IT IS A RESULT SURFACE, NOT A SECOND FORM. #638's fifth and sixth acceptance lines ask that C3
// and C6 show "the claimant, itemised costs, employee payable/advance and settlement lineage with
// explicit missing facts, source and exact receipt"; this is that half. Every value below is a
// column of `clara.staff_expense_claims` or of the posted entry it names by join — nothing is
// derived in the browser, and nothing is rounded: amounts render through the house `Money`
// component from exact minor units.
//
// IT IS ITS OWN DESTINATION, and that is C6's honest shape rather than a shortcut. An employee
// payable is a NON-CONTROL liability plus this register; it may not appear in `aging-register.tsx`,
// whose AR/AP model is counterparty-keyed and whose ground (0042 tail 20) forbids an employee
// counterparty outright. Putting a claim there would have meant widening a wall four live tail
// assertions re-run. So the claimant's money lives here, and the advance lineage links to the
// SHIPPED statement panel on the registers workbench rather than being re-drawn.
//
// THE DISCLOSURE IS THE NARROW-SCREEN STRATEGY, and it is also the honest one. A claim has a
// claimant, two dates, a settlement, an itemisation and a correction chain; a table that put them
// all in columns would clip at 320 px and hide the meaning rather than carry it. So the row names
// the five facts that identify it (claimant, dates, amount, settlement, state) and a per-row
// `<details>` carries the rest — the same shape `periodic-adjustments-table.tsx` uses, in the same
// place a reader already looks.
//
// A REVERSED CLAIM IS NOT HIDDEN. Its row stays, badged, and names the correction that replaced it
// when there is one — the two-way chain the database keeps precisely so a reader arriving at either
// end can reach the other.
//
// AN ITEM STILL WAITING ON A FACT IS SHOWN AS WAITING, BY NAME. That is AC6's "explicit missing
// facts": the claim posted what it could and says which line is not finished and what it lacks.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/journals/money";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { journalEntryHref, staffAdvancesHref, workDetailHref } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { listStaffExpenseClaims, type StaffExpenseClaimRow } from "@/lib/work/staff-expense-claim-reads";
import type { SessionTokenAccessor } from "@/lib/session";

export function StaffExpenseClaimsTable({
  clientId,
  session = sessionTokenAccessor,
  load,
}: {
  clientId: string;
  session?: SessionTokenAccessor;
  /** Injectable for the cells, the same reason every other read on these surfaces is. */
  load?: () => Promise<StaffExpenseClaimRow[]>;
}) {
  const t = useTranslations("StaffExpenseClaim");
  const read = useAsyncRead<StaffExpenseClaimRow[]>(() =>
    load ? load() : listStaffExpenseClaims(clientId, {}, { session }),
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
            <TableHead>{t("history.claimant")}</TableHead>
            <TableHead>{t("history.dates")}</TableHead>
            <TableHead className="text-right">{t("history.amount")}</TableHead>
            <TableHead>{t("history.settlement")}</TableHead>
            <TableHead>{t("history.state")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-testid={`claim-row-${row.id}`}>
              <TableCell className="align-top">
                <div className="flex flex-col gap-1">
                  <span>{row.claimant_label}</span>
                  {row.claimant_identifier === null ? null : (
                    <span className="font-mono text-xs text-muted-foreground">{row.claimant_identifier}</span>
                  )}
                </div>
              </TableCell>
              {/* TWO DATES, LABELLED DISTINCTLY — they are different facts and the register must not
                  let a reader mistake one for the other. */}
              <TableCell className="align-top">
                <div className="flex flex-col gap-1 font-mono text-xs">
                  <span>{t("history.incurredShort")} {row.incurred_date}</span>
                  <span>{t("history.postedShort")} {row.posting_date}</span>
                </div>
              </TableCell>
              <TableCell className="text-right align-top tabular-nums">
                <Money cents={row.amount_cents} />
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-col gap-1">
                  <span>{t(`settlement.options.${row.settlement}`)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{settlementAccountOf(row)}</span>
                </div>
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-col items-start gap-1">
                  {/* THREE DISTINCT STATES, never collapsed into "done": a claim that has not
                      posted yet is not a claim that was reversed, and neither is a posted one. */}
                  {row.entry_id === null ? (
                    <Badge variant="outline">{t("history.admitted")}</Badge>
                  ) : row.reversed_by === null ? (
                    <Badge variant="outline">{t("history.posted")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("history.reversed")}</Badge>
                  )}
                  {row.pending_item_count > 0 ? (
                    <Badge variant="outline" data-testid={`claim-pending-${row.id}`}>
                      {t("history.itemsWaiting", { count: row.pending_item_count })}
                    </Badge>
                  ) : null}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-primary underline underline-offset-2">
                      {t("history.disclose")}
                    </summary>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <Fact label={t("history.instruction")} value={row.instruction} />
                      <Fact label={t("history.work")}
                        value={<Link className="text-primary underline underline-offset-2"
                          href={workDetailHref(clientId, row.work_id)}>{row.work_id}</Link>} />
                      {row.entry_id === null ? null : (
                        <Fact label={t("history.entry")}
                          value={<Link className="text-primary underline underline-offset-2"
                            href={journalEntryHref(clientId, row.entry_id)}>{row.entry_id}</Link>} />
                      )}
                      {row.receipt_id === null ? null : (
                        <Fact label={t("history.receipt")} value={row.receipt_id} mono />
                      )}
                      <Fact label={t("history.logicalOpId")} value={row.logical_op_id} mono />
                      {row.source_document_id === null ? null : (
                        <Fact label={t("history.source")} value={row.source_document_id} mono />
                      )}
                      {/* THE ADVANCE LINEAGE links to the SHIPPED statement panel rather than being
                          re-drawn here: the register that owns an advance is the one that should
                          show its movements. */}
                      {row.advance_id === null ? null : (
                        <Fact label={t("history.advance")}
                          value={<Link className="text-primary underline underline-offset-2"
                            href={staffAdvancesHref(clientId)}>{row.advance_id}</Link>} />
                      )}
                      {/* THE CORRECTION CHAIN, BOTH WAYS. The database keeps both pointers so a
                          reader arriving at either end can reach the other. */}
                      {row.corrects_claim_id === null ? null : (
                        <Fact label={t("history.corrects")} value={row.corrects_claim_id} mono />
                      )}
                      {row.corrected_by_claim_id === null ? null : (
                        <Fact label={t("history.correctedBy")} value={row.corrected_by_claim_id} mono />
                      )}
                    </dl>
                    {/* THE ITEMISATION, VERBATIM — the "itemised costs with explicit missing facts"
                        half of AC6. A waiting item says WHAT it is waiting for; it is never quietly
                        dropped and never given an invented amount. */}
                    <ul className="mt-2 flex flex-col gap-1">
                      {row.items.map((item, i) => (
                        <li key={`${row.id}-item-${i}`} className="flex flex-wrap items-baseline gap-2">
                          <span className="text-foreground">{item.description}</span>
                          {item.pending_fact ? (
                            <Badge variant="outline">{t("history.waitingOn", { fact: item.pending_fact })}</Badge>
                          ) : (
                            <>
                              <span className="font-mono text-muted-foreground">{item.expense_account_code}</span>
                              <span className="tabular-nums text-foreground">
                                <Money cents={item.amount_cents ?? 0} />
                              </span>
                            </>
                          )}
                          {item.incurred_date ? (
                            <span className="font-mono text-muted-foreground">{item.incurred_date}</span>
                          ) : null}
                          {/* SUPPLIED TAX FACTS, ECHOED. Carried by the estate and shown back
                              unchanged; this beta derives no treatment from them. */}
                          {item.supplied_tax ? (
                            <span className="text-muted-foreground">
                              {t("history.suppliedTax")} {JSON.stringify(item.supplied_tax)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
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

function Fact({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "wrap-anywhere font-mono text-foreground" : "wrap-anywhere text-foreground"}>{value}</dd>
    </>
  );
}

/** The account THIS settlement credited — read off the row, never guessed from the settlement word. */
function settlementAccountOf(row: StaffExpenseClaimRow): string {
  return row.payable_account_code ?? row.advance_account_code ?? row.payment_account_code ?? "";
}
