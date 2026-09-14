"use client";

// #746 — THE JOURNALS TABLE'S ROW MODEL, memoised in ONE place that a cell can hold.
//
// WHAT WAS WRONG. `journal-entries-table.tsx` and `posted-panel.tsx` both declared their `links`
// prop as `links = []`, and the table fed that value into `useMemo(..., [entries, lines, links])`.
// A default parameter is evaluated on EVERY call, so on the (normal) path where no links prop is
// passed, the dependency was a brand-new array each render and the memo recomputed the whole row
// model every time. Not a loop and not wrong output — the same identity class as #727's
// `TurnProgress` defect, one severity down: a defeated memo, which is exactly as invisible as it
// is pointless.
//
// WHY A HOOK RATHER THAN A CONSTANT AT THE CALL SITE. The fix itself is one frozen array
// (`NO_ENTRY_LINKS`, lib/journals/entries-table.ts), but a fix whose whole claim is "this value
// keeps its identity" has to be ASSERTABLE, and a `useMemo` buried in a 500-line component body is
// not reachable from any cell: nothing a render puts in the DOM distinguishes a memo that held
// from one that recomputed to an equal value. Moving the one memo here makes the claim a returned
// value, and `use-entry-rows.test.ts` re-renders it with the same props and compares references.
// It is also where the ABSENT case is resolved now — the components pass their prop through
// untouched, so there is no second place for a `[]` default to reappear.

import { useMemo } from "react";

import { buildEntryRows, NO_ENTRY_LINKS, type EntryTableRow } from "./entries-table";
import type { JournalEntryRow, JournalLineRow } from "./types";
import type { EntryLinkRow } from "@/lib/work/evidence";

/** The table's rows (entry + its presentation sums + its `clara.list_entry_links` row), recomputed
 *  only when one of the three reads behind them actually changes. `links` accepts `undefined` — a
 *  caller that has no links read at all passes it through rather than minting its own empty array. */
export function useEntryRows(
  entries: JournalEntryRow[],
  lines: JournalLineRow[],
  links: readonly EntryLinkRow[] | undefined,
): EntryTableRow[] {
  const resolved = links ?? NO_ENTRY_LINKS;
  return useMemo(() => buildEntryRows(entries, lines, resolved), [entries, lines, resolved]);
}
