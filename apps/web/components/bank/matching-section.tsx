"use client";

// The /bank Matching tab: the cross-statement unmatched-line report
// (list_unmatched_lines), match_bank_line (any selected lines against any
// selected candidate entries — the post-0129 single arity), unmatch_bank_
// match (by match id — a matched line's id is read from a statement's line
// view in the Statements tab, which is the only surface that carries
// match_id today), and settle_from_bank_line (per line, SettleLineForm).

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { useReloadOnChange } from "@/lib/bank/reload-on-change";
import { listUnmatchedLines, listBankMatchCandidates } from "@/lib/bank/match-reads";
import { matchBankLine, unmatchBankMatch } from "@/lib/bank/match-doors";
import { formatMyr } from "@/lib/bank/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";
import { SettleLineForm } from "./settle-line-form";

export function MatchingSection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.matching");
  const tc = useTranslations("ClientBank.common");

  const linesKind = useReadErrKind();
  const unmatchedLines = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => linesKind.wrap(() => listUnmatchedLines(clientId, { session: s })), [clientId, linesKind]),
  );

  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [settlingLineId, setSettlingLineId] = useState<string | null>(null);
  const [ackPeriodExceptions, setAckPeriodExceptions] = useState(false);
  const [matchedCents, setMatchedCents] = useState<Record<string, string>>({});

  function toggleLine(lineId: string) {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
      return next;
    });
  }

  const selectedLines = (unmatchedLines.data ?? []).filter((l) => selectedLineIds.has(l.line_id));
  const bankAccountId = selectedLines[0]?.bank_account_id ?? null;

  const candidatesKind = useReadErrKind();
  const candidates = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => (bankAccountId ? candidatesKind.wrap(() => listBankMatchCandidates(clientId, bankAccountId, { session: s })) : Promise.resolve([])),
      [clientId, bankAccountId, candidatesKind],
    ),
  );
  useReloadOnChange(() => void candidates.reload(), bankAccountId);

  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  function toggleEntry(entryId: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      return next;
    });
  }

  const [matchFormError, setMatchFormError] = useState<string | null>(null);

  async function submitMatch() {
    setMatchFormError(null);
    const entries: { entry_id: string; matched_cents: number }[] = [];
    for (const entryId of selectedEntryIds) {
      const raw = matchedCents[entryId];
      const cents = raw ? Number.parseInt(raw, 10) : NaN;
      if (!Number.isFinite(cents) || cents === 0) {
        setMatchFormError(t("invalidMatchedCents"));
        return;
      }
      entries.push({ entry_id: entryId, matched_cents: cents });
    }
    if (selectedLineIds.size === 0 || entries.length === 0) {
      setMatchFormError(t("selectLinesAndEntries"));
      return;
    }
    await unmatchedLines.act(
      async () => {
        await matchBankLine(
          { clientId, lineIds: [...selectedLineIds], entries, ackPeriodExceptions },
          { session: sessionTokenAccessor },
        );
      },
      () => {
        setSelectedLineIds(new Set());
        setSelectedEntryIds(new Set());
        setMatchedCents({});
        setAckPeriodExceptions(false);
      },
    );
  }

  // --- unmatch-by-id utility ---
  const [unmatchId, setUnmatchId] = useState("");
  const [unmatchReason, setUnmatchReason] = useState("");
  async function submitUnmatch(e: React.FormEvent) {
    e.preventDefault();
    await unmatchedLines.act(
      async () => { await unmatchBankMatch(clientId, unmatchId, unmatchReason, { session: sessionTokenAccessor }); },
      () => { setUnmatchId(""); setUnmatchReason(""); },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("unmatchedHeading")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {unmatchedLines.data !== null && <ActionRefusal err={unmatchedLines.err} clr={unmatchedLines.clr} />}
          <ReadState hasData={unmatchedLines.data !== null} err={unmatchedLines.err} errKind={linesKind.kind} isEmpty={unmatchedLines.data?.length === 0} onRetry={() => void unmatchedLines.reload()}>
            <ul className="flex flex-col gap-2">
              {(unmatchedLines.data ?? []).map((l) => (
                <li key={l.line_id} className="flex flex-col gap-2 rounded-lg border border-border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={t("selectLine")}
                      checked={selectedLineIds.has(l.line_id)}
                      onChange={() => toggleLine(l.line_id)}
                    />
                    <span className="flex-1">{l.entry_date} · {l.description ?? "—"} · {formatMyr(l.amount_cents)}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSettlingLineId(settlingLineId === l.line_id ? null : l.line_id)}>
                      {t("settle")}
                    </Button>
                  </div>
                  {settlingLineId === l.line_id && (
                    <SettleLineForm clientId={clientId} lineId={l.line_id} onDone={() => setSettlingLineId(null)} />
                  )}
                </li>
              ))}
            </ul>
          </ReadState>
        </CardContent>
      </Card>

      {selectedLineIds.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("matchHeading", { count: selectedLineIds.size })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <ReadState hasData={candidates.data !== null} err={candidates.err} errKind={candidatesKind.kind} isEmpty={candidates.data?.length === 0} onRetry={() => void candidates.reload()}>
              <ul className="flex flex-col gap-1">
                {(candidates.data ?? []).map((c) => (
                  <li key={c.entry_id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" aria-label={t("selectEntry")} checked={selectedEntryIds.has(c.entry_id)} onChange={() => toggleEntry(c.entry_id)} />
                    <span className="flex-1">{c.memo ?? c.entry_id} · {c.counterparty_name ?? "—"}</span>
                    <Input
                      className="h-7 w-28" inputMode="numeric" placeholder={t("matchedCentsPlaceholder")}
                      aria-label={t("matchedCentsLabel")}
                      value={matchedCents[c.entry_id] ?? ""}
                      onChange={(e) => setMatchedCents((prev) => ({ ...prev, [c.entry_id]: e.target.value }))}
                    />
                  </li>
                ))}
              </ul>
            </ReadState>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={ackPeriodExceptions} onChange={(e) => setAckPeriodExceptions(e.target.checked)} />
              {t("ackPeriodExceptions")}
            </label>
            {matchFormError && <p role="alert" className="text-sm text-destructive">{matchFormError}</p>}
            <Button type="button" disabled={unmatchedLines.busy} onClick={() => void submitMatch()} className="self-start">
              {unmatchedLines.busy ? tc("busy") : t("matchSubmit")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("unmatchHeading")}</CardTitle>
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
            <Button type="submit" disabled={unmatchedLines.busy} className="self-start">
              {unmatchedLines.busy ? tc("busy") : t("unmatchSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
