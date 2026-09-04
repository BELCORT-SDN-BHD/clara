"use client";

// Posted entries (SCOPE c) — the journal-entries TABLE plus the reversal door.
//
// WHAT CHANGED, and why the panel is now four lines of composition. The owner's
// finding was "没有一个UIUX table for journal entry? (go see DataTable shadcn)":
// this surface was a stack of <Card>s with no sort, no filter and no
// pagination, and its own read ordered by `created_at` while rendering
// `posting_date`. The table (components/journals/journal-entries-table.tsx)
// owns all of that now, including the reversal ceremony, which moved ROW-WISE
// and unchanged in substance.
//
// LAW 6 (reverse-not-delete, lib/journals/api.ts's `reverseEntry` header)
// still holds and is still the reason there is no delete affordance anywhere
// on this surface: a posted entry is corrected only by reversing it.
//
// N2 (independent review, carried forward): the affordance gate covers only
// the THREE conditions that make reversing structurally impossible — already
// reversed, is itself a reversal, or is not approved. `reverse_entry` carries
// at least four MORE refusal paths (a CLR31 opening-balance preflight, a CLR10
// open-allocations wall, the staff-advance and adjustment-pair walls; full
// citations in api.ts's `reverseEntry` header) and this panel replicates none
// of them — they render verbatim, per row, when the door answers.
//
// THE STATUS FILTER OPENS ON `approved`, which is exactly what the tab
// promises. It stays LIVE rather than being baked into the read, because
// `withdrawn` entries had no surface anywhere in the product before this: the
// drafts queue carries only `row_kind === 'draft'` rows and this panel used to
// filter to `approved` and stop.

import { JournalEntriesTable } from "@/components/journals/journal-entries-table";
import type { CoaAccountRow, JournalEntryRow, JournalLineRow } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

export function PostedPanel({
  clientId,
  entries,
  lines,
  linesTruncated,
  entriesTruncated,
  accounts,
  busy,
  err,
  clr,
  actingId,
  onReverse,
}: {
  clientId: string;
  entries: JournalEntryRow[];
  lines: JournalLineRow[];
  /** FIX-1 (independent review): see lib/journals/types.ts's `JournalsData`
   *  header — `lines` may be an INCOMPLETE page of `journal_lines`, and its
   *  sort order (entry_id) has no relation to recency, so truncation can
   *  silently drop lines from ANY posted entry, not only the newest. */
  linesTruncated: boolean;
  /** The sibling flag `linesTruncated` always had and this surface never
   *  rendered — lib/journals/api.ts:248. */
  entriesTruncated: boolean;
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  /** FIX-2 / N1: which entry's busy/err/clr this render belongs to. */
  actingId: string | null;
  onReverse: (entryId: string, reason: string, onOk: () => void) => void;
}) {
  return (
    <JournalEntriesTable
      clientId={clientId}
      entries={entries}
      lines={lines}
      linesTruncated={linesTruncated}
      entriesTruncated={entriesTruncated}
      accounts={accounts}
      busy={busy}
      err={err}
      clr={clr}
      actingId={actingId}
      onReverse={onReverse}
      defaultStatus="approved"
    />
  );
}
