"use client";

// #949 — the /bank Matching tab gains a TENANCY panel beside #947's payroll one, and it is the
// surface AC4 and AC5 were owed: without it the Needs-you row for an unpaid month of rent landed
// on a page that said nothing about rent, and the deposit offer had nowhere to be read at all
// (the wave-4 fix round's finding SPEC-14).
//
// TWO LISTS, ONE PANEL, because they are two halves of one question a person asks here — "has
// this tenancy's money moved yet?":
//   · OPEN MONTHS. A month of rent recognised on a confirmed rent plan whose payment has not
//     appeared, with the bank lines that could be it. CONTEXT.md's "Settlement candidate row",
//     third instance after #657's pending line and #947's payroll run: derived, stores nothing,
//     offers candidates and never chooses. There is no dismiss control in this file — declining
//     is not a state, it is just not clicking Accept, and the row keeps reading true until the
//     payable's own balance clears BY ANY ROUTE (this door, a hand-booked cheque, or that entry
//     reconciled through the ordinary matcher below).
//   · DEPOSITS. An OFFER and never a posting: this lane has no write door for a deposit, because
//     signing a tenancy does not say the money moved. The panel names the account the standard
//     chart already ships for it and the bank line that could be it; the coding itself is the
//     ordinary coding lane's act, on the line.
//
// THE ACCEPT BUTTON READS ITS OWN RECEIPT. clara.settle_rent_payable answers `awaiting_checker`
// for a HIGH-STAKES settlement: the entry is drafted and a distinct checker approves it through
// the ordinary door. The panel says so in its own words rather than reloading silently into a row
// that is still there — a person who pressed Accept and saw the row again would otherwise have
// every reason to think the click was lost.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { getRentSettlementCandidates, getTenancyDepositCoding } from "@/lib/bank/rent-settlement-reads";
import { settleRentPayable } from "@/lib/bank/rent-settlement-doors";
import type { RentSettlementMonth, TenancyDepositOffer } from "@/lib/bank/rent-settlement-types";
import { formatMyr } from "@/lib/bank/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionHeader } from "@/components/common/section-header";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";

// `period_month` is a plain 'YYYY-MM-01' calendar month with no instant to convert, so a fixed,
// non-locale month name is the honest tool — never `toLocaleDateString`, which reads the VIEWER's
// own locale and timezone (the house rule lib/business-date.test.ts enforces). #947's own panel
// carries the identical note for the identical reason.
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(periodMonth: string | null): string {
  if (!periodMonth) return "—";
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodMonth);
  if (!m) return periodMonth;
  const name = MONTH_NAMES[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : periodMonth;
}

export function RentSettlementsSection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.rentSettlements");
  const tc = useTranslations("ClientBank.common");
  const errKind = useReadErrKind();
  const [awaiting, setAwaiting] = useState<string | null>(null);

  const months = useHydratedPart<RentSettlementMonth[]>(
    sessionTokenAccessor,
    useCallback((s) => errKind.wrap(() => getRentSettlementCandidates(clientId, { session: s })), [clientId, errKind]),
  );
  const deposits = useHydratedPart<TenancyDepositOffer[]>(
    sessionTokenAccessor,
    useCallback((s) => errKind.wrap(() => getTenancyDepositCoding(clientId, { session: s })), [clientId, errKind]),
  );

  const accept = useCallback(
    async (month: RentSettlementMonth, lineId: string) => {
      await months.act(async () => {
        const receipt = await settleRentPayable(
          { clientId, entryId: month.entry_id, lineId },
          { session: sessionTokenAccessor },
        );
        setAwaiting(receipt.status === "awaiting_checker" ? month.entry_id : null);
      });
    },
    [clientId, months],
  );

  const rows = months.data ?? [];
  const hasMonths = months.data !== null;
  const offers = (deposits.data ?? []).filter((d) => !d.already_coded);
  const hasDeposits = deposits.data !== null;

  return (
    <Card data-testid="rent-settlements-panel">
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasMonths && <ActionRefusal err={months.err} clr={months.clr} />}
        {awaiting !== null && (
          <p data-testid="rent-awaiting-checker" className="text-sm text-muted-foreground">
            {t("awaitingChecker")}
          </p>
        )}
        <ReadState
          err={hasMonths ? null : months.err}
          errKind={hasMonths ? null : errKind.kind}
          hasData={hasMonths}
          isEmpty={hasMonths && rows.length === 0}
          emptyCopy={t("empty")}
          onRetry={() => void months.reload()}
        >
          <div className="flex flex-col gap-4">
            {rows.map((month) => (
              <div
                key={month.entry_id}
                data-testid={`rent-month-${month.entry_id}`}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{t("monthHeading", { period: monthLabel(month.period_month) })}</div>
                  <div className="text-sm text-muted-foreground">{formatMyr(month.unsettled_cents)}</div>
                </div>
                {month.candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {month.candidate_window_days === null
                      ? t("noCandidates")
                      : t("noCandidatesInWindow", { days: month.candidate_window_days })}
                  </p>
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
                      {month.candidates.map((c) => (
                        <TableRow key={c.line_id}>
                          <TableCell>{c.entry_date ?? "—"}</TableCell>
                          <TableCell>{c.description ?? "—"}</TableCell>
                          <TableCell>{formatMyr(c.amount_cents)}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              disabled={months.busy}
                              onClick={() => void accept(month, c.line_id)}
                              aria-label={t("acceptAria", { description: c.description ?? c.line_id })}
                            >
                              {months.busy ? tc("busy") : t("accept")}
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

        {hasDeposits && offers.length > 0 && (
          <div data-testid="tenancy-deposits" className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <SectionHeader level={3}>{t("depositHeading")}</SectionHeader>
            <p className="text-sm text-muted-foreground">{t("depositBody")}</p>
            {offers.map((d) => (
              <div key={d.document_id ?? d.recorded_at ?? ""} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{formatMyr(d.deposit_cents)}</div>
                  <div className="text-sm text-muted-foreground">
                    {d.proposed_account_in_chart
                      ? t("depositCoding", {
                          code: d.proposed_account_code ?? "",
                          name: d.proposed_account_name ?? "",
                        })
                      : t("depositAccountMissing", { code: d.proposed_account_code ?? "" })}
                  </div>
                </div>
                {d.candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("depositNoCandidates")}</p>
                ) : (
                  <ul className="list-disc pl-5 text-sm">
                    {d.candidates.map((c) => (
                      <li key={c.line_id}>
                        {c.entry_date ?? "—"} · {c.description ?? "—"} · {formatMyr(c.amount_cents)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
