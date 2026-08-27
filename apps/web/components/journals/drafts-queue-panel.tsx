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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StateBanner } from "@/components/common/state";
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
    return <EmptyState>{t("empty")}</EmptyState>;
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
          <Card key={row.id} className="enter-content">
            <CardContent className="flex flex-col gap-2">
              {/* Stays a raw <button>: the whole row IS the disclosure, and
                  the Button primitive is a fixed-height, nowrap control. What
                  it was missing is the product's focus idiom — it fell through
                  to the browser/global outline while every other control drew
                  the 3px ring — and `aria-expanded`, which a disclosure owes
                  a screen reader. */}
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : (entryId ?? null))}
                className="-m-1 flex w-full items-center justify-between gap-2 rounded-md p-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
              {expanded && !entry && <StateBanner tone="error">{t("entryUnavailable")}</StateBanner>}
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
          {/* P3 polish: the shared Table primitive, so a draft's lines have the
              same density and hairlines as every other table in the product.
              No DataTableCard here — this table is already INSIDE the draft's
              own Card, and a card inside a card is a second edge saying
              nothing. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("account")}</TableHead>
                <TableHead>{t("description")}</TableHead>
                <TableHead className="text-right">{t("debit")}</TableHead>
                <TableHead className="text-right">{t("credit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const account = accounts.find((a) => a.account_code === line.account_code);
                return (
                  <TableRow key={line.id}>
                    <TableCell>{account ? `${line.account_code} — ${account.name}` : line.account_code}</TableCell>
                    <TableCell className="text-muted-foreground">{line.description ?? ""}</TableCell>
                    <TableCell className="text-right">{line.debit_cents ? <Money cents={line.debit_cents} /> : ""}</TableCell>
                    <TableCell className="text-right">{line.credit_cents ? <Money cents={line.credit_cents} /> : ""}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-right text-muted-foreground">
                  {linesTruncated ? t("presentationSumUnavailable") : t("presentationSumLabel")}
                </TableCell>
                <TableCell className="text-right">{linesTruncated ? "—" : <Money cents={balance.debitCents} />}</TableCell>
                <TableCell className="text-right">{linesTruncated ? "—" : <Money cents={balance.creditCents} />}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </>
      )}
      {/* P3 polish: the same <StateBanner> shell every other refusal in the
          product uses — the CLR code becomes the chip rather than a "CLR41: "
          prefix glued onto the message, which is how Bank, Documents, Close
          and the Clara `refusal` part have all rendered it. The message text
          itself is still the DB's own bytes, verbatim. */}
      {err && (
        <StateBanner tone="error" code={clr ? clr.code : undefined}>
          {err}
        </StateBanner>
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
