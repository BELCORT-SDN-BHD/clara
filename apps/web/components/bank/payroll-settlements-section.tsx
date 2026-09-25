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
//
// #1059 — A REVERSE PATH, RIGHT WHERE THE ACCEPT HAPPENED. Accepting a candidate wrongly means
// two GENERAL-PURPOSE doors already fix it — `unmatch_bank_match` (frees the bank line), then
// `reverse_entry` (mirrors the settlement's own Dr 2040 / Cr bank leg) — but nothing on this
// panel ever told a person those are the two doors, or the order (`reverse_entry`'s own belt
// refuses a reversal while a live match still rides the entry: unmatch first). There is NO READ
// that lists a settled run — `get_payroll_settlement_candidates` deliberately filters
// `unsettled_cents > 0` (0298) — so this is not a case of "discover it from a fresh read": the
// settlement's own receipt (entry id + match id) is kept in `justSettled`, in memory, for exactly
// as long as this panel is mounted, and the ceremony below acts on THAT pair, never a re-derived
// one. Reversing composes both doors under ONE reason, in the required order, then relies on the
// SAME unconditional reload every other act on this panel already gets: 0298's own ADV-01 finding
// is that the reversal mirror's 2040 leg is a CREDIT, never a debit, so `_payroll_net_pay_
// unsettled` counts the run unpaid again the moment both doors have landed — the run reappearing
// above is the proof, not a separate claim this file has to assert for itself.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { getPayrollSettlementCandidates } from "@/lib/bank/payroll-settlement-reads";
import { settlePayrollNetPay } from "@/lib/bank/payroll-settlement-doors";
import { unmatchBankMatch } from "@/lib/bank/match-doors";
import { reverseEntry } from "@/lib/journals/api";
import type { PayrollSettlementRun } from "@/lib/bank/payroll-settlement-types";
import { formatMyr } from "@/lib/bank/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionHeader } from "@/components/common/section-header";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";

/** The one thing this panel remembers about an accept it just made: enough to reverse it,
 *  never enough to be mistaken for a read's own truth (hydrate-never-trust, doors.ts's header —
 *  this is UI memory of a receipt, not a cached copy of server state). `matchId` is present only
 *  for an ORDINARY-stakes settlement (settlePayrollNetPay's receipt carries `match_id: null` for
 *  the high-stakes `awaiting_checker` arm, which this panel does not surface a reverse path for:
 *  there is no live match yet to unmatch, and the entry is still a draft nobody approved). */
type JustSettled = {
  settlementEntryId: string;
  matchId: string;
  periodMonth: string | null;
  unsettledCents: number;
};

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

  // #1059 — this session's own memory of what it just settled (see the file header). Cleared
  // per entry the moment that entry's reversal act SUCCEEDS; never touched by a mere reload.
  const [justSettled, setJustSettled] = useState<JustSettled[]>([]);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const accept = useCallback(
    async (run: PayrollSettlementRun, lineId: string) => {
      await part.act(async () => {
        const receipt = await settlePayrollNetPay(
          { clientId, entryId: run.entry_id, lineId },
          { session: sessionTokenAccessor },
        );
        // The awaiting-checker arm (match_id null) has no live match to reverse yet — nothing to
        // remember here; the ordinary approve door, not this ceremony, is how that one proceeds.
        if (receipt.match_id) {
          setJustSettled((prev) => [
            ...prev,
            {
              settlementEntryId: receipt.entry_id, matchId: receipt.match_id,
              periodMonth: run.period_month, unsettledCents: run.unsettled_cents,
            },
          ]);
        }
      });
    },
    [clientId, part],
  );

  const startReverse = useCallback((settlementEntryId: string) => {
    setReversingId(settlementEntryId);
    setReverseReason("");
  }, []);
  const cancelReverse = useCallback(() => {
    setReversingId(null);
    setReverseReason("");
  }, []);

  const confirmReverse = useCallback(
    async (settled: JustSettled, reason: string) => {
      await part.act(
        async () => {
          // ORDER, NOT A CHOICE (file header): `reverse_entry`'s own belt refuses an entry that
          // still rides a live bank match, so unmatch happens first — both under the SAME reason.
          await unmatchBankMatch(clientId, settled.matchId, reason, { session: sessionTokenAccessor });
          await reverseEntry(sessionTokenAccessor, settled.settlementEntryId, reason);
        },
        () => {
          setJustSettled((prev) => prev.filter((s) => s.settlementEntryId !== settled.settlementEntryId));
          setReversingId(null);
          setReverseReason("");
        },
      );
    },
    [clientId, part],
  );

  const runs = part.data ?? [];
  const hasData = part.data !== null;
  const isEmpty = hasData && runs.length === 0 && justSettled.length === 0;

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
            {/* #1059 — one card per settlement THIS SESSION just accepted (see the file header:
                there is no read that lists a settled run, by design). Rendered beside the
                unsettled runs above, never inside one of their rows — a reversed settlement is
                not a property of the ORIGINAL payroll run's row, it is its own accepted act. */}
            {justSettled.map((settled) => (
              <div
                key={settled.settlementEntryId}
                data-testid={`payroll-settled-${settled.settlementEntryId}`}
                className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {t("justSettled", {
                      period: periodLabel(settled.periodMonth),
                      amount: formatMyr(settled.unsettledCents),
                    })}
                  </p>
                  {reversingId !== settled.settlementEntryId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startReverse(settled.settlementEntryId)}
                      aria-label={t("reverseAria", { period: periodLabel(settled.periodMonth) })}
                    >
                      {t("reverseSettlement")}
                    </Button>
                  )}
                </div>
                {reversingId === settled.settlementEntryId && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor={`payroll-reverse-reason-${settled.settlementEntryId}`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("reverseReasonLabel")}
                      </Label>
                      <Input
                        id={`payroll-reverse-reason-${settled.settlementEntryId}`}
                        placeholder={t("reverseReasonPlaceholder")}
                        value={reverseReason}
                        onChange={(e) => setReverseReason(e.target.value)}
                        className="w-64"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={part.busy || !reverseReason.trim()}
                      onClick={() => void confirmReverse(settled, reverseReason.trim())}
                    >
                      {part.busy ? tc("busy") : t("confirmReverseSettlement")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={cancelReverse}>
                      {tc("cancel")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ReadState>
      </CardContent>
    </Card>
  );
}
