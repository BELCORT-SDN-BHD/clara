"use client";

// The /bank Statements tab: pick a bank account, see its statements (with
// the cheap GL-vs-unmatched tie banner), enter a new statement
// (enter_bank_statement), void one (void_bank_statement), and view a
// statement's lines read-only — INCLUDING completing a pending match
// (complete_pending_match, N13: this door is built + tested, wiring it here
// is the only place a match's `pending` state is ever visible today). Match/
// unmatch and settle themselves live in the Matching tab — mohe-grill-
// rulings scope split (b)/(c).

import { useCallback, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { useReloadOnChange } from "@/lib/bank/reload-on-change";
import { listBankAccounts, listBankStatements, getBankStatement } from "@/lib/bank/reads";
import { enterBankStatement, voidBankStatement, type BankStatementLineInput } from "@/lib/bank/doors";
import { completePendingMatch } from "@/lib/bank/match-doors";
import { formatMyr } from "@/lib/bank/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionHeader } from "@/components/common/section-header";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { ReadState } from "./read-state";
import { StateBanner } from "@/components/common/state";
import { ActionRefusal } from "./action-refusal";

type LineDraft = {
  entryDate: string;
  description: string;
  amountCents: number | null;
  amountValid: boolean;
};

const EMPTY_LINE: LineDraft = { entryDate: "", description: "", amountCents: null, amountValid: true };

export function StatementsSection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.statements");
  const tc = useTranslations("ClientBank.common");

  const accountsKind = useReadErrKind();
  const accounts = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => accountsKind.wrap(() => listBankAccounts(clientId, { session: s })), [clientId, accountsKind]),
  );
  const [bankAccountId, setBankAccountId] = useState("");
  const activeAccountId = bankAccountId || accounts.data?.[0]?.id || "";

  const statementsKind = useReadErrKind();
  const loadStatements = useCallback(
    (s: SessionTokenAccessor) => (activeAccountId ? statementsKind.wrap(() => listBankStatements(clientId, activeAccountId, { session: s })) : Promise.resolve([])),
    [clientId, activeAccountId, statementsKind],
  );
  const statements = useHydratedPart(sessionTokenAccessor, loadStatements);
  useReloadOnChange(() => void statements.reload(), activeAccountId);

  // BLOCKER-2 fix ("the mirror wart", independent review): enter_bank_
  // statement and void_bank_statement are two DIFFERENT acting forms that
  // would otherwise share ONE useHydratedPart instance's err/clr slot — a
  // void refusal painting inside the unrelated enter-statement form (and
  // vice versa) reads as "my add just failed" when it did not. `enterAction`
  // is a SECOND instance of the SAME mechanism (never a bespoke try/catch —
  // N8's "no second drifting mechanism" law), pointed at the identical
  // read, so its act()/busy/err/clr are entirely independent of the void
  // buttons' — each acting form shows only its own outcome. Voiding still
  // refreshes the visible list via `statements.act` directly; a successful
  // enter ALSO reloads `statements` explicitly in its own onOk, since
  // `enterAction`'s own `data` is not what the list renders from.
  const enterAction = useHydratedPart(sessionTokenAccessor, loadStatements);

  const [openStatementId, setOpenStatementId] = useState<string | null>(null);
  const detailKind = useReadErrKind();
  // N5 fix: getBankStatement legitimately resolves null both for "nothing
  // selected yet" (this component's own sentinel, never a real fetch) AND
  // for a genuinely-not-found statement (a real fetch that found nothing) —
  // `detailLoadedOnce` flips true ONLY inside the real-fetch branch, on a
  // SUCCESSFUL resolution, so ReadState can tell "still loading" apart from
  // "loaded, and there is genuinely nothing" instead of showing "Loading…"
  // forever on that second, rarer case.
  const [detailLoadedOnce, setDetailLoadedOnce] = useState(false);
  const detail = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => {
        if (!openStatementId) return Promise.resolve(null);
        return detailKind.wrap(() =>
          getBankStatement(openStatementId, { session: s }).then((v) => {
            setDetailLoadedOnce(true);
            return v;
          }),
        );
      },
      [openStatementId, detailKind],
    ),
  );
  useReloadOnChange(() => void detail.reload(), openStatementId);

  // --- enter-statement form ---
  const [documentId, setDocumentId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [statementDate, setStatementDate] = useState("");
  const [openingCents, setOpeningCents] = useState<number | null>(null);
  const [openingValid, setOpeningValid] = useState(true);
  const [closingCents, setClosingCents] = useState<number | null>(null);
  const [closingValid, setClosingValid] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([EMPTY_LINE]);
  const [formError, setFormError] = useState<string | null>(null);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submitEnter(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!openingValid || !closingValid || openingCents === null || closingCents === null) {
      setFormError(t("invalidAmount"));
      return;
    }
    const parsedLines: BankStatementLineInput[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.amountValid || l.amountCents === null || !l.entryDate) {
        setFormError(t("invalidLine", { n: i + 1 }));
        return;
      }
      parsedLines.push({
        line_no: i + 1, entry_date: l.entryDate, value_date: null,
        description: l.description || null, amount_cents: l.amountCents, running_balance_cents: null,
      });
    }
    await enterAction.act(
      async () => {
        await enterBankStatement(
          {
            clientId, bankAccountId: activeAccountId, documentId,
            header: {
              period_start: periodStart, period_end: periodEnd, statement_date: statementDate || null,
              opening_cents: openingCents, closing_cents: closingCents,
              total_debit_cents: null, total_credit_cents: null, currency: null,
            },
            lines: parsedLines,
          },
          { session: sessionTokenAccessor },
        );
      },
      () => {
        setDocumentId(""); setPeriodStart(""); setPeriodEnd(""); setStatementDate("");
        setOpeningCents(null); setOpeningValid(true);
        setClosingCents(null); setClosingValid(true);
        setLines([{ ...EMPTY_LINE }]);
        void statements.reload();
      },
    );
  }

  function statusLabel(status: string): string {
    if (status === "void") return t("statusVoid");
    if (status === "live") return t("statusLive");
    return status; // N11: never fabricate an English word for an unrecognized status
  }
  function matchLabel(state: "unmatched" | "pending" | "live"): string {
    if (state === "live") return t("matchLive");
    if (state === "pending") return t("matchPending");
    return t("matchUnmatched");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("accountPickerHeading")}</SectionHeader>
        </CardHeader>
        <CardContent>
          <ReadState hasData={accounts.data !== null} err={accounts.err} errKind={accountsKind.kind} isEmpty={accounts.data?.length === 0} onRetry={() => void accounts.reload()}>
            <NativeSelect
              aria-label={t("accountPickerHeading")}
              className="w-full"
              value={activeAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.bank_name_display} · {a.account_number}</option>
              ))}
            </NativeSelect>
          </ReadState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("enterHeading")}</SectionHeader>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitEnter} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="document-id">{t("documentIdLabel")}</Label>
                <Input id="document-id" value={documentId} onChange={(e) => setDocumentId(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="statement-date">{t("statementDateLabel")}</Label>
                <Input id="statement-date" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="period-start">{t("periodStartLabel")}</Label>
                <Input id="period-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="period-end">{t("periodEndLabel")}</Label>
                <Input id="period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="opening">{t("openingLabel")}</Label>
                <MoneyInput
                  id="opening"
                  mode="signed"
                  cents={openingCents}
                  onValueChange={(change) => {
                    setOpeningValid(change.ok);
                    if (change.ok) setOpeningCents(change.cents);
                  }}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="closing">{t("closingLabel")}</Label>
                <MoneyInput
                  id="closing"
                  mode="signed"
                  cents={closingCents}
                  onValueChange={(change) => {
                    setClosingValid(change.ok);
                    if (change.ok) setClosingCents(change.cents);
                  }}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t("linesLabel")}</Label>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_1fr_auto] items-center gap-2">
                  <Input type="date" aria-label={t("lineDateLabel", { n: i + 1 })} value={l.entryDate} onChange={(e) => updateLine(i, { entryDate: e.target.value })} required />
                  <Input aria-label={t("lineDescriptionLabel", { n: i + 1 })} placeholder={t("descriptionPlaceholder")} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                  <MoneyInput
                    mode="signed"
                    containerClassName="min-w-0"
                    aria-label={t("lineAmountLabel", { n: i + 1 })}
                    cents={l.amountCents}
                    onValueChange={(change) => updateLine(i, {
                      amountValid: change.ok,
                      ...(change.ok ? { amountCents: change.cents } : {}),
                    })}
                    required
                  />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(i)} disabled={lines.length === 1}>×</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLine} className="self-start">{t("addLine")}</Button>
            </div>

            {formError && <StateBanner tone="error">{formError}</StateBanner>}
            <ActionRefusal err={enterAction.err} clr={enterAction.clr} />
            <Button type="submit" disabled={enterAction.busy || !activeAccountId} className="self-start">
              {enterAction.busy ? tc("busy") : t("enterSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("listHeading")}</SectionHeader>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {statements.data !== null && <ActionRefusal err={statements.err} clr={statements.clr} />}
          <ReadState hasData={statements.data !== null} err={statements.err} errKind={statementsKind.kind} isEmpty={statements.data?.length === 0} onRetry={() => void statements.reload()}>
            <ul className="flex flex-col gap-2">
              {(statements.data ?? []).map((st) => (
                <li key={st.id} className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{st.period_start} → {st.period_end}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("openingClosing", { opening: formatMyr(st.opening_cents), closing: formatMyr(st.closing_cents) })}
                        {" · "}
                        <Badge variant={st.status === "void" ? "destructive" : "outline"}>{statusLabel(st.status)}</Badge>
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" variant="outline" onClick={() => setOpenStatementId(openStatementId === st.id ? null : st.id)}>
                        {openStatementId === st.id ? t("hideLines") : t("viewLines")}
                      </Button>
                      {st.status !== "void" && (
                        <Button
                          type="button" size="sm" variant="destructive"
                          disabled={statements.busy}
                          onClick={() => void statements.act(() => voidBankStatement(clientId, st.id, t("defaultVoidReason"), { session: sessionTokenAccessor }))}
                        >
                          {t("void")}
                        </Button>
                      )}
                    </div>
                  </div>
                  {openStatementId === st.id && (
                    <ReadState hasData={detailLoadedOnce} err={detail.err} errKind={detailKind.kind} onRetry={() => void detail.reload()}>
                      {detail.data !== null && <ActionRefusal err={detail.err} clr={detail.clr} />}
                      {/* P3 polish: the last hand-rolled table in the product
                          (its own `w-full text-xs` with p-1 cells) onto the
                          shared primitive. It is inside the statement's own row
                          card, so no DataTableCard here — a card inside a card
                          would be a second edge saying nothing. */}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("colDate")}</TableHead><TableHead>{t("colDescription")}</TableHead>
                            <TableHead>{t("colAmount")}</TableHead><TableHead>{t("colMatch")}</TableHead><TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(detail.data?.lines ?? []).map((ln) => (
                            <TableRow key={ln.id}>
                              <TableCell>{ln.entry_date}</TableCell>
                              <TableCell className="text-muted-foreground">{ln.description ?? "—"}</TableCell>
                              <TableCell>{formatMyr(ln.amount_cents)}</TableCell>
                              <TableCell><Badge variant={ln.match_state === "live" ? "default" : "outline"}>{matchLabel(ln.match_state)}</Badge></TableCell>
                              <TableCell>
                                {/* N13: complete_pending_match is built + tested — this is
                                    the only surface a 'pending' match is visible on today. */}
                                {ln.match_state === "pending" && ln.match_id && (
                                  <Button
                                    type="button" size="xs" variant="outline"
                                    disabled={detail.busy}
                                    onClick={() => void detail.act(async () => { await completePendingMatch(clientId, ln.match_id!, { session: sessionTokenAccessor }); })}
                                  >
                                    {t("completePendingMatch")}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ReadState>
                  )}
                </li>
              ))}
            </ul>
          </ReadState>
        </CardContent>
      </Card>
    </div>
  );
}
