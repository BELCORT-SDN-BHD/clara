"use client";

// The /bank Reconciliation ("certify") tab: pick an account, then a
// statement, then get_bank_reconciliation's receipt-or-preview — the terms
// identity, the tie state, and the server's own can_complete/blockers
// verdict (fail-closed: null reads as "cannot complete", never re-derived
// locally) — plus complete_bank_reconciliation / void_bank_reconciliation.
// The full snapshot (outstanding items/groups breakdown) is the named gap.
//
// BLOCKER-1 (independent review, HIGH, fixed at the mapper — lib/bank/
// recon-types.ts's own header): a COMPLETED reconciliation deliberately
// carries neither difference_cents nor derived_closing_cents (0040:4180-
// 4211). Those two dl rows below now render `formatMyr(null)` -> "—" on a
// receipt missing them (never a fabricated "RM 0.00"), and the tie badge —
// `reconTieState`, unchanged here, fixed at its own source — can only read
// "unavailable" on that same receipt, never "tied" without a real,
// DB-sourced difference.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { useReloadOnChange } from "@/lib/bank/reload-on-change";
import { listBankAccounts, listBankStatements } from "@/lib/bank/reads";
import { getBankReconciliation } from "@/lib/bank/recon-reads";
import { completeBankReconciliation, voidBankReconciliation } from "@/lib/bank/recon-doors";
import { reconTieState, canCompleteReconciliation } from "@/lib/bank/recon-types";
import { formatMyr } from "@/lib/bank/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/common/section-header";
import { NativeSelect } from "@/components/common/native-select";
import { ReadState } from "./read-state";
import { StateBanner } from "@/components/common/state";
import { ActionRefusal } from "./action-refusal";
import { NotBuilt } from "./not-built";

export function ReconciliationSection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.reconciliation");
  const tc = useTranslations("ClientBank.common");

  const accountsKind = useReadErrKind();
  const accounts = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => accountsKind.wrap(() => listBankAccounts(clientId, { session: s })), [clientId, accountsKind]),
  );
  const [bankAccountId, setBankAccountId] = useState("");
  const activeAccountId = bankAccountId || accounts.data?.[0]?.id || "";

  const statementsKind = useReadErrKind();
  const statements = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => (activeAccountId ? statementsKind.wrap(() => listBankStatements(clientId, activeAccountId, { session: s })) : Promise.resolve([])),
      [clientId, activeAccountId, statementsKind],
    ),
  );
  useReloadOnChange(() => void statements.reload(), activeAccountId);
  const [statementId, setStatementId] = useState("");
  const activeStatementId = statementId || statements.data?.[0]?.id || "";

  // N5 fix: get_bank_reconciliation "never null in the open-statement case"
  // per its own doc, but a truly unreadable/gone statement CAN still
  // resolve null on success — `reconLoadedOnce` (set only inside the real-
  // fetch branch, on success) lets ReadState tell that apart from "still
  // loading", instead of rendering "Loading…" forever on that edge case.
  const [reconLoadedOnce, setReconLoadedOnce] = useState(false);
  const reconKind = useReadErrKind();
  const recon = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => {
        if (!activeStatementId) return Promise.resolve(null);
        return reconKind.wrap(() =>
          getBankReconciliation(activeStatementId, { session: s }).then((v) => {
            setReconLoadedOnce(true);
            return v;
          }),
        );
      },
      [activeStatementId, reconKind],
    ),
  );
  useReloadOnChange(() => void recon.reload(), activeStatementId);

  const [ackedStale, setAckedStale] = useState<Set<string>>(new Set());
  const [voidReason, setVoidReason] = useState("");
  // N17 fix: a stale-item acknowledgement (or a half-typed void reason) is
  // scoped to ONE statement's reconciliation — carrying it over to a
  // DIFFERENTLY selected statement would let an ack made for statement A's
  // stale items silently apply to statement B's.
  useEffect(() => {
    setAckedStale(new Set());
    setVoidReason("");
  }, [activeStatementId]);

  function modeLabel(mode: string): string {
    if (mode === "receipt") return t("modeReceipt");
    if (mode === "preview") return t("modePreview");
    return mode;
  }
  function statusLabel(status: string): string {
    if (status === "complete") return t("statusComplete");
    if (status === "void") return t("statusVoid");
    if (status === "open") return t("statusOpen");
    return status; // never fabricate an English word for an unrecognized status
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><SectionHeader level={2}>{t("pickHeading")}</SectionHeader></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ReadState hasData={accounts.data !== null} err={accounts.err} errKind={accountsKind.kind} isEmpty={accounts.data?.length === 0} emptyCopy={t("emptyAccounts")} onRetry={() => void accounts.reload()}>
            <NativeSelect aria-label={t("accountLabel")} value={activeAccountId} onChange={(e) => { setBankAccountId(e.target.value); setStatementId(""); }}>
              {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.bank_name_display} · {a.account_number}</option>)}
            </NativeSelect>
          </ReadState>
          {/* CB-AE2E-034: no accounts means no statements — a DERIVED truth, not a
              second finding. The statements picker's own empty sentence is suppressed
              while the accounts read is empty, so this card renders ONE actionable
              line instead of the same six words twice in a row. */}
          {accounts.data?.length === 0 ? null : (
            <ReadState hasData={statements.data !== null} err={statements.err} errKind={statementsKind.kind} isEmpty={statements.data?.length === 0} emptyCopy={t("emptyStatements")} onRetry={() => void statements.reload()}>
              <NativeSelect aria-label={t("statementLabel")} value={activeStatementId} onChange={(e) => setStatementId(e.target.value)}>
                {(statements.data ?? []).map((st) => <option key={st.id} value={st.id}>{st.period_start} → {st.period_end}</option>)}
              </NativeSelect>
            </ReadState>
          )}
        </CardContent>
      </Card>

      {activeStatementId && (
        <Card>
          <CardHeader><SectionHeader level={2}>{t("reconHeading")}</SectionHeader></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {recon.data !== null && <ActionRefusal err={recon.err} clr={recon.clr} />}
            <ReadState hasData={reconLoadedOnce} err={recon.err} errKind={reconKind.kind} errCopy={(message) => t("errRecon", { message })} onRetry={() => void recon.reload()}>
              {recon.data && (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant={recon.data.mode === "receipt" ? "default" : "outline"}>{modeLabel(recon.data.mode)}</Badge>
                    <Badge variant={recon.data.status === "void" ? "destructive" : "outline"}>{statusLabel(recon.data.status)}</Badge>
                    <Badge variant={reconTieState(recon.data) === "tied" ? "default" : reconTieState(recon.data) === "variance" ? "destructive" : "secondary"}>
                      {t(`tie.${reconTieState(recon.data)}`)}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">{t("openingAnchor")}</dt><dd>{formatMyr(recon.data.terms.opening_anchor_cents)}</dd>
                    <dt className="text-muted-foreground">{t("glBalance")}</dt><dd>{formatMyr(recon.data.terms.gl_prime_cents)}</dd>
                    <dt className="text-muted-foreground">{t("uncleared")}</dt><dd>{formatMyr(recon.data.terms.uncleared_total_cents)}</dd>
                    <dt className="text-muted-foreground">{t("computedClosing")}</dt><dd>{formatMyr(recon.data.terms.computed_closing_cents)}</dd>
                    <dt className="text-muted-foreground">{t("statementClosing")}</dt><dd>{formatMyr(recon.data.terms.statement_closing_cents)}</dd>
                    <dt className="text-muted-foreground">{t("difference")}</dt><dd>{formatMyr(recon.data.terms.difference_cents)}</dd>
                  </dl>
                  {recon.data.blockers.length > 0 && (
                    // The server's own can_complete verdict, rendered verbatim
                    // — now in the shared banner shell, so "the DB says you
                    // cannot certify yet" looks like every other refusal on
                    // this tab rather than a fifth bespoke red box.
                    <StateBanner tone="error" className="text-xs" title={t("blockersHeading")}>
                      <ul className="list-inside list-disc">{recon.data.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                    </StateBanner>
                  )}
                  {recon.data.stale_outstanding_ids.length > 0 && (
                    <fieldset className="flex flex-col gap-1 rounded-lg border border-border p-2 text-xs">
                      <legend className="px-1 text-muted-foreground">{t("staleHeading")}</legend>
                      {/* N12 RULING: the read path this build has (get_bank_
                          reconciliation's flat envelope) exposes NOTHING about
                          each stale id beyond the id itself — no date, amount
                          or description to ground the ack in. Rather than a
                          blind checkbox beside a bare UUID, every row carries
                          this build's own honest limit, and the human is
                          pointed at the ONE place that can show more (the
                          Statements tab's line view) before acknowledging. */}
                      <p className="text-muted-foreground">{t("staleDetailNotBuilt")}</p>
                      {recon.data.stale_outstanding_ids.map((id) => (
                        <label key={id} className="flex items-center gap-2">
                          <input
                            type="checkbox" checked={ackedStale.has(id)}
                            onChange={() => setAckedStale((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
                          />
                          {id}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {recon.data.status === "open" && (
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button" disabled={recon.busy || !canCompleteReconciliation(recon.data, ackedStale)} className="self-start"
                        onClick={() => void recon.act(async () => { await completeBankReconciliation(activeStatementId, [...ackedStale], { session: sessionTokenAccessor }); })}
                      >
                        {recon.busy ? tc("busy") : t("complete")}
                      </Button>
                      {!canCompleteReconciliation(recon.data, ackedStale) && <p className="text-xs text-muted-foreground">{t("cannotCompleteHint")}</p>}
                    </div>
                  )}
                  {recon.data.mode === "receipt" && recon.data.recon_id && (
                    <div className="flex items-end gap-2">
                      <div className="grid flex-1 gap-1.5">
                        <Label htmlFor="void-reason">{t("voidReasonLabel")}</Label>
                        <Input id="void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                      </div>
                      <Button
                        type="button" variant="destructive" disabled={recon.busy}
                        onClick={() => void recon.act(async () => { await voidBankReconciliation(recon.data!.recon_id!, voidReason, { session: sessionTokenAccessor }); }, () => setVoidReason(""))}
                      >
                        {t("void")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </ReadState>
            <NotBuilt missingVerb="get_bank_reconciliation's full snapshot (outstanding items/groups breakdown, clara.bank_reconciliations detail view)" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
