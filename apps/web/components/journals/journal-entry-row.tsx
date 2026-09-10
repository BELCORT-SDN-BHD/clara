"use client";

// ONE journal-entry's rows inside the entries table: the summary row, and the
// detail row it discloses. Split out of journal-entries-table.tsx to keep both
// files under this repo's 500-line ceiling — it has no other caller, and it
// holds no state of its own (every piece lives in the table, so a re-read
// after a door call never collapses a row the reader had open).

import Link from "next/link";
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
import { journalEntryHref, workDetailHref } from "@/lib/navigation/tree";
import type { EntryTableRow } from "@/lib/journals/entries-table";
import type { EntryLinkRow } from "@/lib/work/evidence";
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
  reason, onReasonChange, diffOpen, onToggleDiff, onReverse, onReverseOk, link = null,
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
  /** #634 — this entry's Work, operation receipt, source document and correction
   *  chain. NULL means the links read did not cover this entry, which the table
   *  says once above itself rather than as a per-row "no source". */
  link?: EntryLinkRow | null;
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
              <EntryLinksReadout clientId={clientId} link={link} />
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

/**
 * #634 — WHERE THIS ENTRY CAME FROM AND WHAT STANDS BEHIND IT: the purpose, who
 * authored the figures, the source document, the durable Work, the operation
 * receipt, and the correction chain in both directions.
 *
 * IT RENDERS NOTHING IT WAS NOT TOLD. A null `link` means the links read did not
 * cover this entry — the table says that once, above itself — so this block is
 * simply absent rather than filled with dashes that would read as "there is
 * none". Every value below is a column of `clara.list_entry_links`; nothing here
 * is derived and nothing is invented, which is why an entry with no Work behind
 * it shows no Work row at all instead of an empty one.
 */
function EntryLinksReadout({ clientId, link }: { clientId: string; link: EntryLinkRow | null }) {
  const tm = useTranslations("ManualJournal");
  if (link === null) return null;
  const sourceNote =
    link.document_source === "work_commit"
      ? tm("links.sourceWorkCommit")
      : link.document_source === "late_attachment"
        ? tm("links.sourceLateAttachment")
        : link.document_source === "document_coding"
          ? tm("links.sourceDocumentCoding")
          : null;
  const basis =
    link.basis_origin === "user_direct"
      ? tm("links.basisUserDirect")
      : link.basis_origin === "clara_interpreted"
        ? tm("links.basisClaraInterpreted")
        : // A value outside the pair renders VERBATIM rather than crashing on a
          // missing message key — `accounting_work.basis_origin`'s CHECK may
          // widen, and the honest answer to an unknown word is the word.
          link.basis_origin;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted-foreground">{tm("links.source")}</dt>
      <dd className="wrap-anywhere text-foreground">
        {link.document_id === null ? (
          // "No document" IN WORDS. An entry recorded without evidence is a
          // legitimate state of this journey, and an empty cell would read as a
          // gap in the record rather than as a choice somebody made.
          tm("links.noSource")
        ) : (
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono">{link.document_id.slice(0, 8)}</span>
            {sourceNote === null ? null : <span className="text-muted-foreground">{sourceNote}</span>}
          </span>
        )}
      </dd>
      {basis === null ? null : (
        <>
          <dt className="text-muted-foreground">{tm("links.basisOrigin")}</dt>
          <dd className="text-foreground">{basis}</dd>
        </>
      )}
      {link.work_id === null ? null : (
        <>
          <dt className="text-muted-foreground">{tm("links.work")}</dt>
          <dd>
            <Link
              href={workDetailHref(clientId, link.work_id)}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {tm("links.openWork")}
            </Link>
          </dd>
        </>
      )}
      {link.receipt_id === null ? null : (
        <>
          <dt className="text-muted-foreground">{tm("links.receipt")}</dt>
          {/* THE SHORT ID PLUS THE WHOLE ONE IN `title`, the same treatment the
              Reference column gives the entry's own uuid — a receipt id is a
              thing a professional quotes to somebody else, so it must be
              selectable in full rather than only recognisable. */}
          <dd className="wrap-anywhere font-mono text-foreground" title={link.receipt_id}>
            {link.receipt_id.slice(0, 8)}
          </dd>
        </>
      )}
      {link.reversed_by === null ? null : (
        <>
          <dt className="text-muted-foreground">{tm("links.correction")}</dt>
          <dd className="flex flex-wrap items-baseline gap-2">
            <Link
              href={journalEntryHref(clientId, link.reversed_by)}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {tm("links.reversedBy")}
            </Link>
            {link.reversal_reason === null ? null : (
              <span className="text-muted-foreground">{tm("links.reversalReason", { reason: link.reversal_reason })}</span>
            )}
          </dd>
        </>
      )}
      {link.reversal_of === null ? null : (
        <>
          <dt className="text-muted-foreground">{tm("links.correction")}</dt>
          <dd>
            <Link
              href={journalEntryHref(clientId, link.reversal_of)}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {tm("links.reversalOf")}
            </Link>
          </dd>
        </>
      )}
    </dl>
  );
}
