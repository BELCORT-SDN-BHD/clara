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
//
// #719 — AND IT IS THE ONE PLACE THE ADDRESSED ENTRY IS MERGED. `?entry=<id>` can name an entry
// older than the workbench's 1,000-row browse page (lib/journals/api.ts's `FETCH_CAP`), which the
// table could only ever filter, never fetch. `useAddressedEntry` reads that one entry beside the
// browse read and this panel folds it into the rows the table receives — so "composition, and it
// fetches nothing of its own" is no longer quite true of this file, and the reason is stated rather
// than left to be discovered. The merge happens HERE rather than in the workbench above because the
// address is this panel's prop and the table below is its only consumer; the browse read, the cap
// and every filter are untouched.

import { useMemo } from "react";

import { JournalEntriesTable } from "@/components/journals/journal-entries-table";
import { useAddressedEntry, type AddressedEntry } from "@/lib/journals/use-addressed-entry";
import type { CoaAccountRow, JournalEntryRow, JournalLineRow } from "@/lib/journals/types";
import type { EntryLinkRow } from "@/lib/work/evidence";
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
  links,
  linksUnavailable = false,
  initialEntryId = "",
  loadAddressedEntry,
}: {
  clientId: string;
  /** #634 — read by the workbench above (one hydration per tab), passed through
   *  here: this panel is composition, and it fetches nothing of its own.
   *
   *  #746 — and passed through UNDEFAULTED. This used to be `links = []`, a fresh array per
   *  render handed to a child that feeds it into a `useMemo` dependency; the absent case is
   *  resolved once, in `useEntryRows`, against the one frozen `NO_ENTRY_LINKS`. */
  links?: readonly EntryLinkRow[];
  linksUnavailable?: boolean;
  initialEntryId?: string;
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
  /** Injected by the cells; production reads `clara.journal_entries` by id. */
  loadAddressedEntry?: (entryId: string) => Promise<AddressedEntry | null>;
}) {
  // Already on the page ⇒ nothing to fetch. `entries` is the whole browse read (every status), so
  // this is "did the read see it", not "is it currently visible through the filters".
  const onPage = initialEntryId !== "" && entries.some((e) => e.id === initialEntryId);
  const addressed = useAddressedEntry({
    entryId: initialEntryId === "" ? null : initialEntryId,
    skip: onPage,
    load: loadAddressedEntry,
  });

  // THE FOREIGN-CLIENT CHECK LIVES HERE, not in the read: the read is by primary key and RLS scopes
  // by FIRM, so an id that belongs to a DIFFERENT client of the same firm resolves happily — and
  // merging it into this client's table would put another client's figures on this page. It is
  // treated exactly like an id that does not exist (the honest "outside this page" state), which is
  // also the only answer this surface can defend.
  const merged = addressed.addressed?.entry.client_id === clientId ? addressed.addressed : null;
  const foreign = addressed.addressed !== null && merged === null;

  const mergedEntries = useMemo(
    () => (merged ? [merged.entry, ...entries] : entries),
    [merged, entries],
  );
  const mergedLines = useMemo(
    () => (merged ? [...merged.lines, ...lines] : lines),
    [merged, lines],
  );

  return (
    <JournalEntriesTable
      clientId={clientId}
      entries={mergedEntries}
      lines={mergedLines}
      linesTruncated={linesTruncated}
      entriesTruncated={entriesTruncated}
      accounts={accounts}
      busy={busy}
      err={err}
      clr={clr}
      actingId={actingId}
      onReverse={onReverse}
      links={links}
      linksUnavailable={linksUnavailable}
      initialEntryId={initialEntryId}
      addressedLoading={addressed.loading}
      addressedUnreachable={addressed.notFound || foreign || addressed.error !== null}
      defaultStatus="approved"
    />
  );
}
