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
import { QueueSectionBadge } from "@/components/journals/entry-status-badge";
import { EntryLinesEditor } from "@/components/journals/entry-lines-editor";
import { formatCents, sumLines } from "@/lib/journals/balance";
import type { CoaAccountRow, EntryLineInput, JournalEntryRow, JournalLineRow, ReviewQueueRow } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

export function DraftsQueuePanel({
  queueRows,
  entries,
  lines,
  accounts,
  busy,
  err,
  clr,
  onApprove,
  onRevise,
}: {
  queueRows: ReviewQueueRow[];
  entries: JournalEntryRow[];
  lines: JournalLineRow[];
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  onApprove: (entryId: string, expectedRevision: string, attestation: string | null) => void;
  onRevise: (entryId: string, lines: EntryLineInput[], expectedRevision: string) => void;
}) {
  const t = useTranslations("JournalsWorkbench.drafts");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (queueRows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {queueRows.map((row) => {
        const entryId = row.entry_id;
        const entry = entryId ? entries.find((e) => e.id === entryId) : undefined;
        const entryLines = entryId ? lines.filter((l) => l.entry_id === entryId) : [];
        const expanded = expandedId === entryId;
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
                <span className="text-sm font-medium">{formatCents(row.amount_cents)}</span>
              </button>
              {expanded && entry && (
                <DraftDetail
                  entry={entry}
                  lines={entryLines}
                  accounts={accounts}
                  busy={busy}
                  err={err}
                  clr={clr}
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
  accounts,
  busy,
  err,
  clr,
  onApprove,
  onRevise,
}: {
  entry: JournalEntryRow;
  lines: JournalLineRow[];
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  onApprove: (entryId: string, expectedRevision: string, attestation: string | null) => void;
  onRevise: (entryId: string, lines: EntryLineInput[], expectedRevision: string) => void;
}) {
  const t = useTranslations("JournalsWorkbench.drafts");
  const [editing, setEditing] = useState(false);
  const [draftLines, setDraftLines] = useState<EntryLineInput[]>(() => toInput(lines));
  const [attestation, setAttestation] = useState("");
  const balance = sumLines(lines);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      {editing ? (
        <EntryLinesEditor lines={draftLines} onChange={setDraftLines} accounts={accounts} />
      ) : (
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
                  <td className="text-right">{line.debit_cents ? formatCents(line.debit_cents) : ""}</td>
                  <td className="text-right">{line.credit_cents ? formatCents(line.credit_cents) : ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-sm font-medium">
              <td colSpan={2} className="pt-1 text-right text-muted-foreground">
                {t("presentationSumLabel")}
              </td>
              <td className="pt-1 text-right">{formatCents(balance.debitCents)}</td>
              <td className="pt-1 text-right">{formatCents(balance.creditCents)}</td>
            </tr>
          </tfoot>
        </table>
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
              onClick={() => {
                onRevise(entry.id, draftLines, entry.revision_token);
                setEditing(false);
              }}
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
