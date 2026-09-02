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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/common/money-input";
import { SectionHeader } from "@/components/common/section-header";
import { ReadState } from "./read-state";
import { StateBanner } from "@/components/common/state";
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
  const [matchedCents, setMatchedCents] = useState<Record<string, number | null>>({});
  const [matchedMoneyValid, setMatchedMoneyValid] = useState<Record<string, boolean>>({});

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
      // N9 fix (independent review): matched_cents is a signed RM amount the
      // human types like every OTHER money field in this build — parsed via
      // the same parseAmountToCents (comma-grouped, up to 2 decimals) rather
      // than a raw `Number.parseInt`, whose "1,234" -> 1 truncation-at-comma
      // is exactly the hostile-parsing shape a thousands-grouped amount hits.
      const cents = matchedCents[entryId] ?? null;
      if (!matchedMoneyValid[entryId] || cents === null || cents === 0) {
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
        setMatchedMoneyValid({});
        setAckPeriodExceptions(false);
        // N7: a landed match changes every candidate's remaining capacity —
        // re-read it, never trust the pre-match figures to still hold.
        void candidates.reload();
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
          <SectionHeader level={2}>{t("unmatchedHeading")}</SectionHeader>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {unmatchedLines.data !== null && <ActionRefusal err={unmatchedLines.err} clr={unmatchedLines.clr} />}
          <ReadState hasData={unmatchedLines.data !== null} err={unmatchedLines.err} errKind={linesKind.kind} isEmpty={unmatchedLines.data?.length === 0} onRetry={() => void unmatchedLines.reload()}>
            <ul className="flex flex-col gap-2">
              {(unmatchedLines.data ?? []).map((l) => (
                <li key={l.line_id} className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
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
                    <SettleLineForm
                      clientId={clientId} lineId={l.line_id}
                      onDone={() => {
                        setSettlingLineId(null);
                        // N7: a settled line leaves the unmatched report — re-read it,
                        // never assume the settle door's own receipt is the new truth.
                        void unmatchedLines.reload();
                      }}
                    />
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
            <SectionHeader level={2}>{t("matchHeading", { count: selectedLineIds.size })}</SectionHeader>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <ReadState hasData={candidates.data !== null} err={candidates.err} errKind={candidatesKind.kind} isEmpty={candidates.data?.length === 0} onRetry={() => void candidates.reload()}>
              <ul className="flex flex-col gap-1">
                {(candidates.data ?? []).map((c) => (
                  <li key={c.entry_id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" aria-label={t("selectEntry")} checked={selectedEntryIds.has(c.entry_id)} onChange={() => toggleEntry(c.entry_id)} />
                    <span className="flex-1">{c.memo ?? c.entry_id} · {c.counterparty_name ?? "—"}</span>
                    <MoneyInput
                      containerClassName="w-28 shrink-0"
                      className="h-7 w-full" placeholder={t("matchedCentsPlaceholder")}
                      aria-label={t("matchedCentsLabel")}
                      cents={matchedCents[c.entry_id] ?? null}
                      mode="signed"
                      onValueChange={(change) => {
                        setMatchedMoneyValid((prev) => ({ ...prev, [c.entry_id]: change.ok }));
                        if (change.ok) {
                          setMatchedCents((prev) => ({ ...prev, [c.entry_id]: change.cents }));
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            </ReadState>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={ackPeriodExceptions} onChange={(e) => setAckPeriodExceptions(e.target.checked)} />
              {t("ackPeriodExceptions")}
            </label>
            {matchFormError && <StateBanner tone="error">{matchFormError}</StateBanner>}
            {/* BLOCKER-2 fix (independent review): match_bank_line and
                unmatch_bank_match both act through the SAME unmatchedLines
                hook (one part, one lifecycle, hooks.ts's own design) — a
                refusal from EITHER now renders in every card that acts on
                it (here, the unmatch form below, AND the unmatched-lines
                list card above), never only in a card scrolled out of view
                when the acting button un-busies. */}
            <ActionRefusal err={unmatchedLines.err} clr={unmatchedLines.clr} />
            <Button type="button" disabled={unmatchedLines.busy} onClick={() => void submitMatch()} className="self-start">
              {unmatchedLines.busy ? tc("busy") : t("matchSubmit")}
            </Button>
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
            <Button type="submit" disabled={unmatchedLines.busy} className="self-start">
              {unmatchedLines.busy ? tc("busy") : t("unmatchSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
