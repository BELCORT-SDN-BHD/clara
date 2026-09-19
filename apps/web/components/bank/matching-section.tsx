"use client";

// The /bank Matching tab — REBUILT for #657 (migration 0226).
//
// WHAT IT IS NOW. A line/detail composition: a `Table` report of the client's unmatched
// statement lines on the LEFT of the reading order, and a detail pane for the ONE line the human
// is deciding about on the right. The detail pane holds, in this order, the three things a
// decision needs beside each other: the line's own SOURCE facts (its statement's header,
// lineage, filename, coverage), the CANDIDATES with their deterministic basis, and the RESULT.
//
// WHAT CHANGED AND WHY, one line each — every one of these was a real defect, not a preference:
//   * The bank account was derived SILENTLY from `selectedLines[0]`, so the candidate read
//     depended on which row the human happened to tick first and a two-account client could not
//     tell which account it was looking at. There is now an explicit account + period selector
//     (AC6), and the line report is filtered by it.
//   * The line list rendered `date · description · amount` in a `<li>` with a bare checkbox.
//     It is a `Table` with named column headers and a per-row accessible label now (AC13/AC14).
//   * Candidates rendered `memo ?? entry_id · counterparty_name ?? "—"`, where
//     `counterparty_name` was a field the database never emitted and `high_stakes` was
//     hardcoded `false`. Migration 0226 made both real; `matching-candidates.tsx` renders them
//     with the basis, the capacity and the history beside them.
//   * `?line=` addresses the detail pane and `?tab=` addresses the strip, so a reload keeps the
//     human where they were. The SELECTION SET stays out of the URL: a draft is not an address.
//   * The op key was `crypto.randomUUID()` PER CALL, so a lost response followed by an identical
//     resubmit was a second operation that met `already_matched`. It is derived from the intent
//     tuple now (`lib/bank/match-opkey.ts`, D15).
//   * A refusal used to clear nothing and re-read everything; the typed cents now SURVIVE a
//     refusal, because retyping an amount you already typed is how a human ends up typing a
//     different one.
//
// WHAT THIS SURFACE STILL DOES NOT DO, deliberately, with the owner of each named:
//   no adjustment/difference control (#671 refunds and write-offs, #675 certification);
//   no exception RESOLVE control (#671) — it links into the Exceptions tab instead;
//   no suspense account and no write-off anywhere (no bank verb has one, and none is invented);
//   no page/region citation (0038's lane contract states per-line region citations are not
//   carried, and `bank_statement_lines` has no region column) — a named residual, not a gap
//   filled with an invented number;
//   no settlement door (`SettleLineForm` is unchanged and still mounted per line).

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { useReloadOnChange } from "@/lib/bank/reload-on-change";
import { listUnmatchedLines, listBankMatchCandidates, getBankLineMatchingContext } from "@/lib/bank/match-reads";
import { listBankAccounts, listBankStatements } from "@/lib/bank/reads";
import { matchBankLine, unmatchBankMatch } from "@/lib/bank/match-doors";
import { entryGeneration } from "@/lib/bank/match-opkey";
import { formatMyr } from "@/lib/bank/money";
import type { MatchReceipt } from "@/lib/bank/matching-context-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";
import { SettleLineForm } from "./settle-line-form";
import { MatchingCandidates } from "./matching-candidates";
import { MatchingResidual } from "./matching-residual";
import { MatchingExceptionFace } from "./matching-exception-face";
import { MatchingOutcome } from "./matching-outcome";

export function MatchingSection({
  clientId,
  selectedLineId = null,
  onSelectLine,
}: {
  clientId: string;
  /** `?line=` — the ONE line whose detail pane is open. Null is a legitimate state: the human
   *  is reading the report and has not chosen yet. */
  selectedLineId?: string | null;
  onSelectLine?: (lineId: string | null) => void;
}) {
  const t = useTranslations("ClientBank.matching");
  const tc = useTranslations("ClientBank.common");

  // --- the explicit account + period selector (AC6) ------------------------------------
  const accountsKind = useReadErrKind();
  const accounts = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => accountsKind.wrap(() => listBankAccounts(clientId, { session: s })), [clientId, accountsKind]),
  );
  const [accountId, setAccountId] = useState<string | null>(null);
  const activeAccounts = useMemo(() => (accounts.data ?? []).filter((a) => a.active), [accounts.data]);
  const effectiveAccountId = accountId ?? activeAccounts[0]?.id ?? null;

  const statementsKind = useReadErrKind();
  const statements = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => (effectiveAccountId
        ? statementsKind.wrap(() => listBankStatements(clientId, effectiveAccountId, { session: s }))
        : Promise.resolve([])),
      [clientId, effectiveAccountId, statementsKind],
    ),
  );
  useReloadOnChange(() => void statements.reload(), effectiveAccountId);
  const [statementId, setStatementId] = useState<string | null>(null);
  const liveStatements = useMemo(() => (statements.data ?? []).filter((s) => s.status === "live"), [statements.data]);

  // --- the unmatched-line report ---------------------------------------------------------
  const linesKind = useReadErrKind();
  const unmatchedLines = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => linesKind.wrap(() => listUnmatchedLines(clientId, { session: s })), [clientId, linesKind]),
  );
  const allLines = unmatchedLines.data ?? [];
  const visibleLines = useMemo(
    () => allLines.filter((l) =>
      (effectiveAccountId === null || l.bank_account_id === effectiveAccountId)
      && (statementId === null || l.statement_id === statementId)),
    [allLines, effectiveAccountId, statementId],
  );
  const filtered = effectiveAccountId !== null || statementId !== null;

  // --- the detail pane -------------------------------------------------------------------
  const contextKind = useReadErrKind();
  const context = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => (selectedLineId
        ? contextKind.wrap(() => getBankLineMatchingContext(selectedLineId, { session: s }))
        : Promise.resolve(null)),
      [selectedLineId, contextKind],
    ),
  );
  useReloadOnChange(() => void context.reload(), selectedLineId);

  const candidateAccountId = context.data?.line.bank_account_id ?? effectiveAccountId;
  const candidatesKind = useReadErrKind();
  const candidates = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => (candidateAccountId
        ? candidatesKind.wrap(() => listBankMatchCandidates(clientId, candidateAccountId, { session: s }))
        : Promise.resolve([])),
      [clientId, candidateAccountId, candidatesKind],
    ),
  );
  useReloadOnChange(() => void candidates.reload(), candidateAccountId);

  // --- the decision ----------------------------------------------------------------------
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [matchedCents, setMatchedCents] = useState<Record<string, number | null>>({});
  const [matchedMoneyValid, setMatchedMoneyValid] = useState<Record<string, boolean>>({});
  const [ackPeriodExceptions, setAckPeriodExceptions] = useState(false);
  const [matchFormError, setMatchFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<MatchReceipt | null>(null);
  const [settlingLineId, setSettlingLineId] = useState<string | null>(null);

  function toggleLine(lineId: string) {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
      return next;
    });
  }
  function toggleEntry(entryId: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      return next;
    });
  }

  const selectedLines = allLines.filter((l) => selectedLineIds.has(l.line_id));
  const lineCents = selectedLines.reduce((sum, l) => sum + (l.amount_cents ?? 0), 0);
  const entryCents = [...selectedEntryIds].reduce((sum, id) => sum + (matchedCents[id] ?? 0), 0);

  async function submitMatch() {
    setMatchFormError(null);
    const entries: { entry_id: string; matched_cents: number }[] = [];
    for (const entryId of selectedEntryIds) {
      const cents = matchedCents[entryId] ?? null;
      if (matchedMoneyValid[entryId] === false || cents === null || cents === 0) {
        setMatchFormError(t("invalidMatchedCents"));
        return;
      }
      entries.push({ entry_id: entryId, matched_cents: cents });
    }
    if (selectedLineIds.size === 0 || entries.length === 0) {
      setMatchFormError(t("selectLinesAndEntries"));
      return;
    }
    // #657 fix-round (review SP1 / A1) — each selected entry's WORLD GENERATION, read off the
    // candidate row the human is looking at. It is key material only and never reaches the wire
    // body: it is what makes `match -> unmatch -> re-decide the same selection` a NEW operation
    // instead of a replay of the dead match's receipt. An entry the current candidate read does
    // not carry contributes `null` — a value, so the key stays stable.
    const entryGenerations: Record<string, string | null> = {};
    for (const e of entries) {
      entryGenerations[e.entry_id] = entryGeneration(
        (candidates.data ?? []).find((c) => c.entry_id === e.entry_id) ?? null,
      );
    }
    let receipt: MatchReceipt | null = null;
    await unmatchedLines.act(
      async () => {
        receipt = await matchBankLine(
          { clientId, lineIds: [...selectedLineIds], entries, ackPeriodExceptions, entryGenerations },
          { session: sessionTokenAccessor },
        );
      },
      () => {
        // ONLY ON SUCCESS is the draft cleared. A REFUSAL keeps the typed cents, the ticked
        // rows and the ack flag exactly as the human left them — retyping an amount you have
        // already typed is how a human ends up typing a different one, and the op key is
        // derived from that same tuple, so an unchanged draft resubmits as the SAME operation.
        setOutcome(receipt);
        setSelectedLineIds(new Set());
        setSelectedEntryIds(new Set());
        setMatchedCents({});
        setMatchedMoneyValid({});
        setAckPeriodExceptions(false);
        // N7: a landed match changes every candidate's remaining capacity and every line's
        // state — re-read both, never trust the pre-match figures to still hold.
        void candidates.reload();
        void context.reload();
        void statements.reload();
      },
    );
  }

  // --- unmatch-by-id utility (unchanged contract) -----------------------------------------
  const [unmatchId, setUnmatchId] = useState("");
  const [unmatchReason, setUnmatchReason] = useState("");
  async function submitUnmatch(e: React.FormEvent) {
    e.preventDefault();
    await unmatchedLines.act(
      async () => { await unmatchBankMatch(clientId, unmatchId, unmatchReason, { session: sessionTokenAccessor }); },
      () => { setUnmatchId(""); setUnmatchReason(""); void candidates.reload(); },
    );
  }

  const ctx = context.data;
  const busy = unmatchedLines.busy;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("scopeHeading")}</SectionHeader>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="matching-account">{t("accountLabel")}</Label>
            {accounts.data === null && !accounts.err ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={effectiveAccountId ?? ""} onValueChange={(v) => { setAccountId(v); setStatementId(null); onSelectLine?.(null); }}>
                <SelectTrigger id="matching-account" className="w-full">
                  <SelectValue placeholder={t("accountPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.bank_name_display} {a.account_number} · {a.coa_account_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="matching-period">{t("periodLabel")}</Label>
            <Select value={statementId ?? "__all"} onValueChange={(v) => setStatementId(v === "__all" ? null : v)}>
              <SelectTrigger id="matching-period" className="w-full">
                <SelectValue placeholder={t("periodPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t("periodAll")}</SelectItem>
                {liveStatements.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.period_start} → {s.period_end}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {accounts.data !== null && activeAccounts.length === 0 && (
            <StateBanner tone="neutral">{t("noActiveAccount")}</StateBanner>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("unmatchedHeading")}</SectionHeader>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {unmatchedLines.data !== null && <ActionRefusal err={unmatchedLines.err} clr={unmatchedLines.clr} />}
          <ReadState
            hasData={unmatchedLines.data !== null}
            err={unmatchedLines.err}
            errKind={linesKind.kind}
            isEmpty={allLines.length === 0}
            emptyCopy={t("emptyUnmatchedLines")}
            onRetry={() => void unmatchedLines.reload()}
          >
            {visibleLines.length === 0 && filtered ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-muted-foreground">{t("noLinesForFilter")}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAccountId(null); setStatementId(null); }}>
                  {t("clearFilters")}
                </Button>
              </div>
            ) : (
              <Table aria-label={t("linesTableLabel")}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t("colSelect")}</TableHead>
                    <TableHead scope="col">{t("colDate")}</TableHead>
                    <TableHead scope="col">{t("colDescription")}</TableHead>
                    <TableHead scope="col">{t("colDirection")}</TableHead>
                    <TableHead scope="col">{t("colAmount")}</TableHead>
                    <TableHead scope="col">{t("colClassHint")}</TableHead>
                    <TableHead scope="col">{t("colOpen")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLines.map((l) => (
                    <TableRow
                      key={l.line_id}
                      data-testid={`line-${l.line_id}`}
                      data-selected={selectedLineIds.has(l.line_id) ? "true" : "false"}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={t("selectLineNamed", { description: l.description ?? l.line_id })}
                          checked={selectedLineIds.has(l.line_id)}
                          onChange={() => toggleLine(l.line_id)}
                        />
                      </TableCell>
                      <TableCell>{l.entry_date ?? "—"}</TableCell>
                      <TableCell>{l.description ?? "—"}</TableCell>
                      <TableCell>{(l.amount_cents ?? 0) >= 0 ? t("inflow") : t("outflow")}</TableCell>
                      <TableCell>{formatMyr(l.amount_cents ?? 0)}</TableCell>
                      <TableCell>{l.class_hint ?? "—"}</TableCell>
                      <TableCell className="flex flex-wrap gap-1">
                        <Button
                          type="button" size="sm"
                          variant={selectedLineId === l.line_id ? "default" : "outline"}
                          onClick={() => onSelectLine?.(selectedLineId === l.line_id ? null : l.line_id)}
                        >
                          {t("openDetail")}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setSettlingLineId(settlingLineId === l.line_id ? null : l.line_id)}>
                          {t("settle")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ReadState>
          {settlingLineId && (
            <SettleLineForm
              clientId={clientId} lineId={settlingLineId}
              onDone={() => {
                setSettlingLineId(null);
                // N7: a settled line leaves the unmatched report — re-read it, never assume
                // the settle door's own receipt is the new truth.
                void unmatchedLines.reload();
              }}
            />
          )}
        </CardContent>
      </Card>

      {selectedLineId && (
        <Card data-testid="matching-detail">
          <CardHeader>
            <SectionHeader level={2}>{t("detailHeading")}</SectionHeader>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ReadState
              hasData={context.data !== null || context.err !== null}
              err={context.err}
              errKind={contextKind.kind}
              isEmpty={context.data === null && context.err === null}
              emptyCopy={t("lineNotAvailable")}
              onRetry={() => void context.reload()}
            >
              {ctx && (
                <>
                  <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
                    <dt className="text-muted-foreground">{t("srcLine")}</dt>
                    <dd>{ctx.line.entry_date ?? "—"} · {ctx.line.description ?? "—"} · {formatMyr(ctx.line.amount_cents ?? 0)}</dd>
                    <dt className="text-muted-foreground">{t("srcAccount")}</dt>
                    <dd>{ctx.line.bank_account_display ?? "—"} · {ctx.line.coa_account_code ?? "—"}</dd>
                    <dt className="text-muted-foreground">{t("srcPeriod")}</dt>
                    <dd>{ctx.statement.period_start ?? "—"} → {ctx.statement.period_end ?? "—"} · {ctx.statement.status ?? "—"}</dd>
                    <dt className="text-muted-foreground">{t("srcFilename")}</dt>
                    <dd data-testid="detail-filename" className="break-all">{ctx.statement.original_filename ?? "—"}</dd>
                    <dt className="text-muted-foreground">{t("srcSha")}</dt>
                    <dd className="break-all font-mono">{ctx.statement.source_doc_sha256 ?? "—"}</dd>
                    <dt className="text-muted-foreground">{t("srcLineage")}</dt>
                    <dd>{ctx.statement.superseded_by ? t("supersededBy", { id: ctx.statement.superseded_by }) : t("notSuperseded")}</dd>
                    <dt className="text-muted-foreground">{t("srcCoverage")}</dt>
                    <dd data-testid="detail-coverage">
                      {t("coverageFigures", {
                        lines: ctx.coverage.line_count ?? 0,
                        debit: formatMyr(ctx.coverage.total_debit_cents ?? 0),
                        credit: formatMyr(ctx.coverage.total_credit_cents ?? 0),
                        unmatched: formatMyr(ctx.coverage.tie?.unmatched_cents ?? 0),
                      })}
                    </dd>
                  </dl>

                  <MatchingExceptionFace clientId={clientId} exception={ctx.exception} block={ctx.booking_block} />

                  <ReadState
                    hasData={candidates.data !== null}
                    err={candidates.err}
                    errKind={candidatesKind.kind}
                    isEmpty={candidates.data?.length === 0}
                    emptyCopy={t("emptyCandidates")}
                    onRetry={() => void candidates.reload()}
                  >
                    <MatchingCandidates
                      candidates={candidates.data ?? []}
                      basis={ctx.candidate_basis}
                      selectedEntryIds={selectedEntryIds}
                      matchedCents={matchedCents}
                      centsValid={matchedMoneyValid}
                      disabled={busy}
                      onToggleEntry={toggleEntry}
                      onCentsChange={(entryId, cents, ok) => {
                        setMatchedMoneyValid((prev) => ({ ...prev, [entryId]: ok }));
                        setMatchedCents((prev) => ({ ...prev, [entryId]: cents }));
                      }}
                    />
                  </ReadState>

                  <MatchingResidual lineCents={lineCents} entryCents={entryCents} />

                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={ackPeriodExceptions} onChange={(e) => setAckPeriodExceptions(e.target.checked)} />
                    {t("ackPeriodExceptions")}
                  </label>

                  {matchFormError && <StateBanner tone="error">{matchFormError}</StateBanner>}
                  {/* BLOCKER-2 (independent review) kept: match_bank_line and unmatch_bank_match
                      act through the SAME part, so a refusal from EITHER renders in every card
                      that acts on it, never only in one scrolled out of view. */}
                  <ActionRefusal err={unmatchedLines.err} clr={unmatchedLines.clr} />
                  <Button type="button" disabled={busy} onClick={() => void submitMatch()} className="self-start">
                    {busy ? tc("busy") : t("matchSubmit")}
                  </Button>

                  {outcome && (
                    <MatchingOutcome
                      receipt={outcome}
                      filename={ctx.statement.original_filename}
                      counterpartyName={
                        (candidates.data ?? []).find((c) => (outcome.entry_ids ?? []).includes(c.entry_id))?.counterparty_name ?? null
                      }
                    />
                  )}
                </>
              )}
            </ReadState>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("unmatchHeading")}</SectionHeader>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitUnmatch} className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">{t("unmatchHint")}</p>
            <div className="grid gap-1.5">
              <Label htmlFor="unmatch-id">{t("matchIdLabel")}</Label>
              <Input id="unmatch-id" value={unmatchId} onChange={(e) => setUnmatchId(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="unmatch-reason">{t("reasonLabel")}</Label>
              <Input id="unmatch-reason" value={unmatchReason} onChange={(e) => setUnmatchReason(e.target.value)} required />
            </div>
            <ActionRefusal err={unmatchedLines.err} clr={unmatchedLines.clr} />
            <Button type="submit" disabled={busy} className="self-start">
              {busy ? tc("busy") : t("unmatchSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
