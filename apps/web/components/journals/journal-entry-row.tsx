"use client";

// ONE journal-entry's rows inside the entries table: the summary row, and the
// detail row it discloses. Split out of journal-entries-table.tsx to keep both
// files under this repo's 500-line ceiling — it has no other caller, and it
// holds no state of its own (every piece lives in the table, so a re-read
// after a door call never collapses a row the reader had open).

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { StateBanner } from "@/components/common/state";
import { Money } from "@/components/journals/money";
import { FormattedDate } from "@/components/journals/formatted-date";
import { EntryStatusBadge } from "@/components/journals/entry-status-badge";
import { EntryDiffPanel } from "@/components/journals/entry-diff-panel";
import type { EntryTableRow } from "@/lib/journals/entries-table";
import type { CoaAccountRow, JournalLineRow } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

/** How many columns the table body spans — the detail row's `colSpan`. Kept
 *  beside the row that uses it; journal-entries-table.tsx renders exactly this
 *  many <TableHead> cells and its own test pins the two together. */
export const COLUMN_COUNT = 8;

/** `origin` is the DB's own word. Known members get the product's label; ANY
 *  other value renders VERBATIM — the same law entry-status-badge.tsx:13
 *  follows, and the reason `journal_entries.origin`'s CHECK widening at
 *  0041:766-767 cannot silently blank a cell here. */
export function originLabel(origin: string, to: (key: string) => string): string {
  return origin === "manual" || origin === "document" || origin === "agent" || origin === "reversal" ? to(origin) : origin;
}

/**
 * ONE entry: its summary row, plus the detail row it discloses.
 *
 * THE REVERSAL AFFORDANCE GATE is the same three structural conditions
 * posted-panel.tsx gated on, made explicit now that this table can also show
 * drafts and withdrawn entries: only an APPROVED entry that is neither
 * already reversed nor itself a reversal. It replicates NONE of
 * `reverse_entry`'s other refusal paths (the CLR31 opening-balance preflight,
 * the CLR10 open-allocations wall, the staff-advance / adjustment-pair
 * walls — lib/journals/api.ts's `reverseEntry` header carries the full list);
 * those are real, expected, and render verbatim in the banner below.
 */
export function EntryRows({
  clientId, row, lines, accounts, linesTruncated, busy, err, clr,
  expanded, onToggle, reversing, onStartReverse, onCancelReverse,
  reason, onReasonChange, diffOpen, onToggleDiff, onReverse, onReverseOk,
}: {
  clientId: string;
  row: EntryTableRow;
  lines: JournalLineRow[];
  accounts: CoaAccountRow[];
  linesTruncated: boolean;
  busy: boolean;
  err: string | null;
  clr: PartClr;
  expanded: boolean;
  onToggle: () => void;
  reversing: boolean;
  onStartReverse: () => void;
  onCancelReverse: () => void;
  reason: string;
  onReasonChange: (value: string) => void;
  diffOpen: boolean;
  onToggleDiff: () => void;
  onReverse: (entryId: string, reason: string, onOk: () => void) => void;
  onReverseOk: () => void;
}) {
  const t = useTranslations("JournalsWorkbench.table");
  const tp = useTranslations("JournalsWorkbench.posted");
  const to = useTranslations("JournalsWorkbench.origin");
  const td = useTranslations("DraftsDocumentGovernance.entryDiff");
  const entry = row.entry;
  const reversible = entry.status === "approved" && !row.reversed && !row.isReversal;
  const entryLines = lines.filter((l) => l.entry_id === entry.id);

  return (
    <>
      <TableRow>
        <TableCell>
          <FormattedDate value={entry.posting_date} />
        </TableCell>
        {/* NOT a journal number — the row's own uuid, truncated. See this
            file's header for why inventing one is forbidden. `title` carries
            the whole id so it is still copyable. */}
        <TableCell className="font-mono text-xs text-muted-foreground" title={entry.id}>
          {entry.id.slice(0, 8)}
        </TableCell>
        <TableCell className="max-w-xs whitespace-normal">{entry.memo ?? tp("noMemo")}</TableCell>
        {/* TWO ways these read "—", and they are different facts. `linesTruncated` says the
            LINE READ was incomplete, so every total derived from it is unverifiable. A NULL
            `debitCents` says no line for THIS entry was in the read at all — `<Money>`'s own
            null arm renders the dash, so a zero is never printed for an absence. */}
        <TableCell className="text-right">{linesTruncated ? "—" : <Money cents={row.debitCents} />}</TableCell>
        <TableCell className="text-right">{linesTruncated ? "—" : <Money cents={row.creditCents} />}</TableCell>
        <TableCell>
          <span className="flex flex-wrap items-center gap-1">
            <EntryStatusBadge status={entry.status} />
            {row.reversed && <span className="text-xs text-muted-foreground">{tp("alreadyReversed")}</span>}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {originLabel(entry.origin, to)}
          {entry.coding_kind ? <span className="block text-xs">{entry.coding_kind}</span> : null}
        </TableCell>
        <TableCell className="text-right">
          <span className="flex flex-wrap items-center justify-end gap-1">
            <Button type="button" size="sm" variant="ghost" aria-expanded={expanded} onClick={onToggle}>
              {expanded ? t("hideDetail") : t("viewDetail")}
            </Button>
            {reversible && (
              <Button type="button" size="sm" variant="outline" onClick={onStartReverse}>
                {tp("reverse")}
              </Button>
            )}
          </span>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT} className="whitespace-normal">
            <div className="flex flex-col gap-2">
              <EntryLinesReadout lines={entryLines} accounts={accounts} linesTruncated={linesTruncated} />
              {err && (
                <StateBanner tone="error" code={clr ? clr.code : undefined}>
                  {err}
                </StateBanner>
              )}
              {reversing && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`reverse-reason-${entry.id}`} className="text-xs text-muted-foreground">
                      {tp("reasonLabel")}
                    </Label>
                    <Input
                      id={`reverse-reason-${entry.id}`}
                      placeholder={tp("reasonPlaceholder")}
                      value={reason}
                      onChange={(e) => onReasonChange(e.target.value)}
                      className="w-64"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy || !reason.trim()}
                    // FIX-2 carried over VERBATIM: the reason box closes on
                    // SUCCESS only. Closing it unconditionally (the original
                    // defect) left every real refusal with nowhere to render.
                    onClick={() => onReverse(entry.id, reason.trim(), onReverseOk)}
                  >
                    {tp("confirmReverse")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onCancelReverse}>
                    {tp("cancel")}
                  </Button>
                </div>
              )}
              {row.isReversal && <p className="text-xs text-muted-foreground">{tp("isReversal")}</p>}
              <div>
                <Button type="button" size="sm" variant="ghost" aria-expanded={diffOpen} onClick={onToggleDiff}>
                  {diffOpen ? td("hide") : td("show")}
                </Button>
              </div>
              {diffOpen && <EntryDiffPanel key={entry.id} entryId={entry.id} clientId={clientId} />}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** One entry's own lines, as a plain definition list rather than a nested
 *  <table>: this block already sits inside a table cell, and a table inside a
 *  table is a second grid a screen reader has to escape. Same withholding rule
 *  as the columns above. */
function EntryLinesReadout({
  lines,
  accounts,
  linesTruncated,
}: {
  lines: JournalLineRow[];
  accounts: CoaAccountRow[];
  linesTruncated: boolean;
}) {
  const t = useTranslations("JournalsWorkbench.table");
  if (linesTruncated) return <p className="text-sm text-warning">{t("linesTruncated")}</p>;
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">{t("noLines")}</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {lines
        .slice()
        .sort((a, b) => a.line_no - b.line_no)
        .map((line) => {
          const account = accounts.find((a) => a.account_code === line.account_code);
          return (
            <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                {account ? `${line.account_code} — ${account.name}` : line.account_code}
                {line.description ? <span className="text-muted-foreground"> · {line.description}</span> : null}
              </span>
              <span className="tabular-nums">
                {line.debit_cents ? <Money cents={line.debit_cents} /> : null}
                {line.credit_cents ? <Money cents={line.credit_cents} /> : null}
              </span>
            </li>
          );
        })}
    </ul>
  );
}
