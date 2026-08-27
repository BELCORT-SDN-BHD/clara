"use client";

// The drafts list + the review queue's approve/revise doors (mission SCOPE a+b —
// one section: the queue row IS the draft, its expanded detail IS the review
// surface). Rows come from lib/journals/api.ts's `listReviewQueue` (the DB's own
// pending-review union, filtered to row_kind==='draft'); a row's full lines,
// memo and revision_token come from the direct table reads (journal_entries/
// journal_lines) the same combined loader already fetched — hydrate-never-trust
// means BOTH reads land together on every mount and after every action.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/journals/money";
import { EntryStatusBadge, QueueSectionBadge } from "@/components/journals/entry-status-badge";
import { EntryLinesEditor } from "@/components/journals/entry-lines-editor";
import { sumLines } from "@/lib/journals/balance";
import type {
  CoaAccountRow,
  EntryLineInput,
  JournalEntryRow,
  JournalLineRow,
  ReviewQueueCounts,
  ReviewQueueRow,
} from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

export function DraftsQueuePanel({
  queueRows,
  queueCounts,
  entries,
  lines,
  linesTruncated,
  accounts,
  busy,
  err,
  clr,
  actingId,
  onApprove,
  onRevise,
}: {
  queueRows: ReviewQueueRow[];
  queueCounts: ReviewQueueCounts;
  entries: JournalEntryRow[];
  lines: JournalLineRow[];
  linesTruncated: boolean;
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  /** FIX-2 / N1: which row's busy/err/clr this render belongs to — a page-wide
   *  hook state, attributed per action so entry A's refusal never paints onto
   *  entry B's still-open detail panel. */
  actingId: string | null;
  onApprove: (entryId: string, expectedRevision: string, attestation: string | null) => void;
  onRevise: (entryId: string, lines: EntryLineInput[], expectedRevision: string, onOk: () => void) => void;
}) {
  const t = useTranslations("JournalsWorkbench.drafts");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // FIX-6 (independent review): `queueRows` is what fit under `p_limit` —
  // `queueCounts.open_drafts` is the TRUE total, computed pre-limit. Only ever
  // say "no drafts" when the TRUE total says so; a tail-loss (more drafts
  // exist than this page could show) gets its own honest note instead of a
  // silently-empty page.
  if (queueCounts.open_drafts === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {queueRows.length < queueCounts.open_drafts && (
        <p className="text-sm text-warning">
          {t("showingOf", { shown: queueRows.length, total: queueCounts.open_drafts })}
        </p>
      )}
      {queueRows.map((row) => {
        const entryId = row.entry_id;
        const entry = entryId ? entries.find((e) => e.id === entryId) : undefined;
        const entryLines = entryId ? lines.filter((l) => l.entry_id === entryId) : [];
        const expanded = expandedId === entryId;
        const isActing = entryId !== null && actingId === entryId;
        return (
          <Card key={row.id}>
            <CardContent className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : (entryId ?? null))}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="flex items-center gap-2">
                  <QueueSectionBadge section={row.section} />
                  {row.high_stakes && (
                    <span className="text-xs font-medium text-warning">{t("highStakes")}</span>
                  )}
                  <span className="text-sm text-foreground">{entry?.memo ?? t("noMemo")}</span>
                </span>
                <span className="text-sm font-medium">
                  <Money cents={row.amount_cents} />
                </span>
              </button>
              {expanded && entry && (
                <DraftDetail
                  key={entry.revision_token}
                  entry={entry}
                  lines={entryLines}
                  linesTruncated={linesTruncated}
                  accounts={accounts}
                  busy={busy}
                  err={isActing ? err : null}
                  clr={isActing ? clr : null}
                  onApprove={onApprove}
                  onRevise={onRevise}
                />
              )}
              {expanded && !entry && <p className="text-sm text-destructive">{t("entryUnavailable")}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DraftDetail({
  entry,
  lines,
  linesTruncated,
  accounts,
  busy,
  err,
  clr,
  onApprove,
  onRevise,
}: {
  entry: JournalEntryRow;
  lines: JournalLineRow[];
  linesTruncated: boolean;
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  onApprove: (entryId: string, expectedRevision: string, attestation: string | null) => void;
  onRevise: (entryId: string, lines: EntryLineInput[], expectedRevision: string, onOk: () => void) => void;
}) {
  const t = useTranslations("JournalsWorkbench.drafts");
  // FIX-5 (independent review): this whole component is now KEYED on
  // `entry.revision_token` by the parent — a revise success rotates the
  // token, which REMOUNTS this component from scratch (fresh `editing`,
  // fresh `draftLines` seeded from the JUST-RELOADED `lines`). Before this
  // fix, `draftLines` was a lazy initializer that never resynced: a reload
  // could bring a FRESH revision_token while `draftLines` still held the
  // STALE pre-reload snapshot, so a submit sent stale lines under a fresh
  // token — revise_entry accepted it and silently erased whatever the stale
  // read had already missed (worse than no token at all, since the token
  // existed exactly to catch this).
  const [editing, setEditing] = useState(false);
  const [draftLines, setDraftLines] = useState<EntryLineInput[]>(() => toInput(lines));
  const [attestation, setAttestation] = useState("");
  const balance = sumLines(lines);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <EntryStatusBadge status={entry.status} />
      {editing ? (
        <EntryLinesEditor lines={draftLines} onChange={setDraftLines} accounts={accounts} />
      ) : (
        <>
          {linesTruncated && <p className="text-sm text-warning">{t("linesTruncated")}</p>}
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-1 font-medium">{t("account")}</th>
                <th className="pb-1 font-medium">{t("description")}</th>
                <th className="pb-1 text-right font-medium">{t("debit")}</th>
                <th className="pb-1 text-right font-medium">{t("credit")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const account = accounts.find((a) => a.account_code === line.account_code);
                return (
                  <tr key={line.id}>
                    <td>{account ? `${line.account_code} — ${account.name}` : line.account_code}</td>
                    <td>{line.description ?? ""}</td>
                    <td className="text-right">{line.debit_cents ? <Money cents={line.debit_cents} /> : ""}</td>
                    <td className="text-right">{line.credit_cents ? <Money cents={line.credit_cents} /> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-sm font-medium">
                <td colSpan={2} className="pt-1 text-right text-muted-foreground">
                  {linesTruncated ? t("presentationSumUnavailable") : t("presentationSumLabel")}
                </td>
                <td className="pt-1 text-right">{linesTruncated ? "—" : <Money cents={balance.debitCents} />}</td>
                <td className="pt-1 text-right">{linesTruncated ? "—" : <Money cents={balance.creditCents} />}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
      {clr && (
        <p role="alert" className="text-sm text-destructive">
          {clr.code}: {err}
        </p>
      )}
      {!clr && err && (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => onRevise(entry.id, draftLines, entry.revision_token, () => setEditing(false))}
            >
              {t("saveRevision")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            <Input
              aria-label={t("attestation")}
              placeholder={t("attestationPlaceholder")}
              value={attestation}
              onChange={(e) => setAttestation(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => onApprove(entry.id, entry.revision_token, attestation.trim() || null)}
            >
              {t("approve")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t("revise")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function toInput(lines: JournalLineRow[]): EntryLineInput[] {
  return lines
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({ account_code: l.account_code, debit_cents: l.debit_cents, credit_cents: l.credit_cents, description: l.description }));
}
