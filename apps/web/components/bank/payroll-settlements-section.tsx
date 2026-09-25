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
// #1059 — A REVERSE PATH, RIGHT WHERE THE ACCEPT HAPPENED, AND IT SURVIVES A RELOAD. Accepting a
// candidate wrongly means two GENERAL-PURPOSE doors already fix it — `unmatch_bank_match` (frees
// the bank line), then `reverse_entry` (mirrors the settlement's own Dr 2040 / Cr bank leg) — but
// nothing on this panel ever told a person those are the two doors, or the order (`reverse_entry`'s
// own belt refuses a reversal while a live match still rides the entry: unmatch first).
//
// FIX ROUND (spec finding L04-SPEC-01): the first cut kept the accept receipt in React state, so
// the route existed only inside the mount that did the Accept — a reload left the person back on
// the two general-purpose doors the ticket exists to replace, while AC1 asks that a settled run be
// DISCOVERABLE from this panel. `lib/bank/payroll-settlement-reversals.ts` now derives the list
// from the server on every hydration, through RLS-scoped table reads this estate already grants;
// see that module's header for why no migration and no jsonb filter operator was needed. This
// panel remembers nothing.
//
// FIX ROUND (adversarial finding ADV-03): the ceremony is two doors in two transactions, and a
// reverse_entry refusal after a successful unmatch used to leave a half-reversed ledger whose only
// visible next step — press Confirm again — could NEVER succeed, because `clara.unmatch_bank_match`
// refuses an already-unmatched match by name (CLR10 `already_unmatched`). It is RESUMABLE now, in
// two independent ways: the durable read reports a settlement with no live match as `unmatched`, so
// the retry skips straight to `reverse_entry`; and an `already_unmatched` refusal DURING the
// composition is treated as "that half is already done" rather than as a failure, because it says
// exactly that. Every other refusal from either door still surfaces verbatim and stops the act.
//
// AND THE HIGH-STAKES ARM IS NOT INVISIBLE (spec finding L04-SPEC-04). `settle_payroll_net_pay`
// leaves a DRAFT for a distinct checker when the settlement is high-stakes (0298:494), which has no
// match to unmatch and no posting to reverse. The durable read surfaces it as `awaiting_checker`,
// and the route offered is the estate's own `clara.withdraw_draft` — abandoning the draft, which is
// what "undo" means before anything is posted.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { isDoorRefusal } from "@/lib/doors";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { getPayrollSettlementCandidates } from "@/lib/bank/payroll-settlement-reads";
import { settlePayrollNetPay } from "@/lib/bank/payroll-settlement-doors";
import {
  listPayrollSettlementReversals,
  type PayrollSettlementReversal,
} from "@/lib/bank/payroll-settlement-reversals";
import { unmatchBankMatch } from "@/lib/bank/match-doors";
import { reverseEntry } from "@/lib/journals/api";
import { withdrawDraft } from "@/lib/journals/governance-doors";
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

/** What ONE hydration of this panel reads: the runs still owed a settlement, and the settlements a
 *  person could still undo. Both come from the server, in one cycle, so a single `reload()` after
 *  any act re-derives the whole panel (hydrate-never-trust, doors.ts's header). */
type PanelData = {
  runs: PayrollSettlementRun[];
  reversals: readonly PayrollSettlementReversal[];
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

/** `clara._unmatch_bank_match_core`'s own word for "this match is already unmatched; re-matching
 *  writes a NEW group" (CLR10, detail reason `already_unmatched`). Read as a REPORT that the first
 *  half of this ceremony has already landed — which is what it is — rather than as a failure. */
function isAlreadyUnmatched(e: unknown): boolean {
  return isDoorRefusal(e) && e.code === "CLR10" && e.reason === "already_unmatched";
}

export function PayrollSettlementsSection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.payrollSettlements");
  const tc = useTranslations("ClientBank.common");
  const errKind = useReadErrKind();

  const part = useHydratedPart<PanelData>(
    sessionTokenAccessor,
    useCallback(
      (session) =>
        errKind.wrap(async () => {
          const [runs, reversals] = await Promise.all([
            getPayrollSettlementCandidates(clientId, { session }),
            listPayrollSettlementReversals(clientId, { session }),
          ]);
          return { runs, reversals: reversals.rows };
        }),
      [clientId, errKind],
    ),
  );

  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const accept = useCallback(
    async (run: PayrollSettlementRun, lineId: string) => {
      // Nothing is remembered from the receipt: the unconditional reload that follows re-derives
      // the settlement from the ledger, and THAT is what the reverse route below acts on.
      await part.act(async () => {
        await settlePayrollNetPay(
          { clientId, entryId: run.entry_id, lineId },
          { session: sessionTokenAccessor },
        );
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
    async (settled: PayrollSettlementReversal, reason: string) => {
      await part.act(
        async () => {
          if (settled.status === "awaiting_checker") {
            // No match, no posting: the draft is abandoned through the estate's own door. A draft
            // with no revision token is not addressable by that door, and this ceremony refuses to
            // guess one.
            if (!settled.revisionToken) throw new Error("this draft has no revision token to address");
            await withdrawDraft(settled.settlementEntryId, reason, settled.revisionToken, {
              session: sessionTokenAccessor,
            });
            return;
          }
          // ORDER, NOT A CHOICE (file header): `reverse_entry`'s own belt refuses an entry that
          // still rides a live bank match, so unmatch happens first — both under the SAME reason.
          // An `already_unmatched` refusal means that half landed in an earlier attempt; anything
          // else is a real refusal and stops the act with its own message.
          if (settled.matchId) {
            try {
              await unmatchBankMatch(clientId, settled.matchId, reason, { session: sessionTokenAccessor });
            } catch (e) {
              if (!isAlreadyUnmatched(e)) throw e;
            }
          }
          await reverseEntry(sessionTokenAccessor, settled.settlementEntryId, reason);
        },
        () => {
          setReversingId(null);
          setReverseReason("");
        },
      );
    },
    [clientId, part],
  );

  const runs = part.data?.runs ?? [];
  const reversals = part.data?.reversals ?? [];
  const hasData = part.data !== null;
  const isEmpty = hasData && runs.length === 0 && reversals.length === 0;

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
            {/* #1059 — one card per settlement this CLIENT still has open, read from the ledger on
                every hydration (see the file header). Rendered beside the unsettled runs above,
                never inside one of their rows — a reversed settlement is not a property of the
                ORIGINAL payroll run's row, it is its own accepted act. */}
            {reversals.map((settled) => (
              <div
                key={settled.settlementEntryId}
                data-testid={`payroll-settled-${settled.settlementEntryId}`}
                className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {settled.status === "awaiting_checker"
                      ? t("settledAwaitingChecker", { period: periodLabel(settled.periodMonth) })
                      : settled.status === "unmatched"
                        ? t("settledUnmatched", { period: periodLabel(settled.periodMonth) })
                        : t("justSettled", {
                            period: periodLabel(settled.periodMonth),
                            amount: formatMyr(settled.amountCents),
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
                      {settled.status === "awaiting_checker" ? t("withdrawSettlementDraft") : t("reverseSettlement")}
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
                      {part.busy
                        ? tc("busy")
                        : settled.status === "awaiting_checker"
                          ? t("confirmWithdrawSettlementDraft")
                          : t("confirmReverseSettlement")}
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
