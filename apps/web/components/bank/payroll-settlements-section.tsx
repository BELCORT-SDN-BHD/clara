"use client";

// #947 — the /bank Matching tab gains a PAYROLL SETTLEMENT panel, above the ordinary line/entry
// matcher. A posted payroll run's own net pay sits in 2040 Salaries Payable until the bank shows
// it left — this panel is where a person finds that bank line and accepts it, or sees the run is
// still waiting.
//
// THE SHAPE (CONTEXT.md's "Settlement candidate row", #657's own, second instance): derived,
// stores nothing, offers candidates and never chooses. There is no "dismiss" control anywhere in
// this file — the row simply keeps reading true from the DB until the balance clears, by any of
// the three routes the ticket names (this door, a hand-booked entry, or that entry reconciled
// through the ordinary matcher below). Declining is not a state; it is just not clicking Accept.
//
// AMBIGUITY IS SHOWN, NEVER RESOLVED (AC4): every candidate line the read offers for a run is
// rendered, with its own Accept button. Nothing is pre-selected, nothing is ranked, and accepting
// one candidate leaves every other candidate of every OTHER run untouched — the surface reloads
// unconditionally afterward (useHydratedPart's own contract), so a line another accept just
// claimed simply stops appearing anywhere else it was offered.

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { getPayrollSettlementCandidates } from "@/lib/bank/payroll-settlement-reads";
import { settlePayrollNetPay } from "@/lib/bank/payroll-settlement-doors";
import type { PayrollSettlementRun } from "@/lib/bank/payroll-settlement-types";
import { formatMyr } from "@/lib/bank/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionHeader } from "@/components/common/section-header";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";

// business-date.ts's businessDate()/businessDateTime() format an INSTANT (now, or a stored
// timestamp) — `period_month` is a plain 'YYYY-MM-01' calendar month with no instant to convert,
// so a fixed, non-locale month name (never `toLocaleDateString`, which reads the VIEWER's own
// locale/timezone — the house rule `lib/business-date.test.ts` enforces) is the honest tool here.
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function periodLabel(periodMonth: string | null): string {
  if (!periodMonth) return "—";
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodMonth);
  if (!m) return periodMonth;
  const monthIndex = Number(m[2]) - 1;
  const name = MONTH_NAMES[monthIndex];
  return name ? `${name} ${m[1]}` : periodMonth;
}

export function PayrollSettlementsSection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.payrollSettlements");
  const tc = useTranslations("ClientBank.common");
  const errKind = useReadErrKind();

  const part = useHydratedPart<PayrollSettlementRun[]>(
    sessionTokenAccessor,
    useCallback((s) => errKind.wrap(() => getPayrollSettlementCandidates(clientId, { session: s })), [clientId, errKind]),
  );

  const accept = useCallback(
    async (run: PayrollSettlementRun, lineId: string) => {
      await part.act(async () => {
        await settlePayrollNetPay(
          { clientId, entryId: run.entry_id, lineId },
          { session: sessionTokenAccessor },
        );
      });
    },
    [clientId, part],
  );

  const runs = part.data ?? [];
  const hasData = part.data !== null;
  const isEmpty = hasData && runs.length === 0;

  return (
    <Card data-testid="payroll-settlements-panel">
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Gated on hasData, the read-state.tsx idiom: before the first successful read, err is a
            plain READ failure ReadState already renders below — painting it here too would
            double-paint it as if a write had also refused. */}
        {hasData && <ActionRefusal err={part.err} clr={part.clr} />}
        <ReadState
          err={hasData ? null : part.err}
          errKind={hasData ? null : errKind.kind}
          hasData={hasData}
          isEmpty={isEmpty}
          emptyCopy={t("empty")}
          onRetry={() => void part.reload()}
        >
          <div className="flex flex-col gap-4">
            {runs.map((run) => (
              <div key={run.entry_id} data-testid={`payroll-run-${run.entry_id}`} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{t("runHeading", { period: periodLabel(run.period_month) })}</div>
                  <div className="text-sm text-muted-foreground">{formatMyr(run.unsettled_cents)}</div>
                </div>
                {run.candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noCandidates")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colDate")}</TableHead>
                        <TableHead>{t("colDescription")}</TableHead>
                        <TableHead>{t("colAmount")}</TableHead>
                        <TableHead className="w-1">{t("colAccept")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {run.candidates.map((c) => (
                        <TableRow key={c.line_id}>
                          <TableCell>{c.entry_date ?? "—"}</TableCell>
                          <TableCell>{c.description ?? "—"}</TableCell>
                          <TableCell>{formatMyr(c.amount_cents)}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              disabled={part.busy}
                              onClick={() => void accept(run, c.line_id)}
                              aria-label={t("acceptAria", { description: c.description ?? c.line_id })}
                            >
                              {part.busy ? tc("busy") : t("accept")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </div>
        </ReadState>
      </CardContent>
    </Card>
  );
}
