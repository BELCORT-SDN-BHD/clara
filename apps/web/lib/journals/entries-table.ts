// The journal-entries table's SORT / FILTER / PAGE logic, kept out of the
// component so every rule below is testable without a DOM (the same split
// lib/journals/balance.ts already uses for the presentation sum).
//
// WHY NO TABLE LIBRARY. The owner's ask was "没有一个UIUX table for journal
// entry? (go see DataTable shadcn)" — the shadcn DATA-TABLE PATTERN (a
// <Table> on a card, a toolbar above, a pagination row below), not the
// headless library shadcn's own docs pair it with. @tanstack/react-table is
// NOT a dependency of this app (apps/web/package.json lists @base-ui/react,
// supabase, cva, clsx, cmdk, lucide-react, next, next-intl, react, shadcn,
// tailwind-merge, tw-animate-css and nothing else) and adding it would put a
// SECOND state model beside the hydrate-never-trust discipline
// (lib/parts/hooks.ts): column state in the library, row data that must still
// be re-read from the DB after every act. One sort, three filters and a page
// slice over rows already in memory is this file. Add the library the day
// column visibility / reordering / grouping is ruled in, not before.
//
// EVERY NUMBER HERE IS A PRESENTATION VALUE. `debitCents`/`creditCents` are
// client-side sums of `journal_lines` rows the caller already read — the same
// caveat posted-panel.tsx has always carried (hard constraint 2: the DB owns
// every authoritative number). They are WITHHELD, never estimated, when the
// line read was truncated, and this module never sorts on a withheld number
// (see `sortEntryRows`).

import type { JournalEntryRow, JournalLineRow } from "./types";

/** journal_entries.status — the CLOSED three-value CHECK domain, transcribed
 *  from packages/db/migrations/0007_document_pipeline.sql:1012-1014
 *  (`ck_journal_entries_status`, replacing 0003:105's two-value original).
 *  Never a hand-typed guess: `statusOptions` unions this with whatever the
 *  rows actually carry, so a value the DB grows tomorrow is still selectable
 *  rather than silently unreachable (lib/journals/types.ts's own
 *  `JournalEntryStatus` keeps the same honesty on the type side). */
export const ENTRY_STATUS_DOMAIN = ["draft", "approved", "withdrawn"] as const;

/** The sentinel a select uses for "don't filter on this column". Not a status
 *  and not an origin — `""` cannot collide with a DB value, since both columns
 *  are non-empty text where they are set. */
export const ANY = "";

export type EntrySortKey = "posting_date" | "memo" | "status" | "origin" | "debit" | "credit";
export type SortDir = "asc" | "desc";
export type EntriesSort = { key: EntrySortKey; dir: SortDir };

/** posting_date DESC — the ACCOUNTING date, and the fix for the defect the
 *  map found: the Posted list ordered by `created_at.desc`
 *  (lib/journals/api.ts's `listJournalEntries`) while rendering ONLY
 *  `posting_date` (posted-panel.tsx), so a backdated entry entered today sorted
 *  to the top under a date the reader takes as the sort key. The read's order
 *  is unchanged; the TABLE sorts by what it shows. */
export const DEFAULT_SORT: EntriesSort = { key: "posting_date", dir: "desc" };

export type EntriesFilters = {
  /** `ANY`, or a journal_entries.status value. */
  status: string;
  /** `ANY`, or a journal_entries.origin value. */
  origin: string;
  /** `""`, or an inclusive `YYYY-MM-DD` lower bound on posting_date. */
  from: string;
  /** `""`, or an inclusive `YYYY-MM-DD` upper bound on posting_date. */
  to: string;
};

export const NO_FILTERS: EntriesFilters = { status: ANY, origin: ANY, from: "", to: "" };

export type EntryTableRow = {
  entry: JournalEntryRow;
  /**
   * Client-side presentation sums over this entry's own lines — see the module header.
   *
   * NULL, NOT ZERO, when the line read returned no line for this entry at all. Zero is a
   * FIGURE: rendered through `<Money>` it reads "RM 0.00", which tells a professional this
   * entry has no debits — a claim this read never established. The honest answer to "what does
   * it total" when no line was seen is "—", and `<Money>`'s own null arm already renders
   * exactly that. Absence is not evidence, and a derived zero is not a measurement.
   *
   * The two are also the SORT keys for those columns, and null sorts last in both directions
   * (`sortEntryRows`), so an entry with nothing to total never leads a money order either.
   */
  debitCents: number | null;
  creditCents: number | null;
  /** `reversed_by is not null` — this entry has already been reversed. */
  reversed: boolean;
  /** `origin === 'reversal'` — this entry IS a reversal (0003_books_core.sql:108). */
  isReversal: boolean;
};

export function buildEntryRows(entries: JournalEntryRow[], lines: JournalLineRow[]): EntryTableRow[] {
  const byEntry = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const acc = byEntry.get(line.entry_id) ?? { debit: 0, credit: 0 };
    acc.debit += line.debit_cents;
    acc.credit += line.credit_cents;
    byEntry.set(line.entry_id, acc);
  }
  return entries.map((entry) => {
    // `undefined` here means NO LINE for this entry was in the read — distinct from an entry
    // whose lines happen to sum to zero, which keeps its real 0.
    const sums = byEntry.get(entry.id);
    return {
      entry,
      debitCents: sums ? sums.debit : null,
      creditCents: sums ? sums.credit : null,
      reversed: entry.reversed_by !== null,
      isReversal: entry.origin === "reversal",
    };
  });
}

/** Every status the filter offers: the DB's own CHECK domain, plus any value
 *  the rows actually carry that the domain does not name. A closed enumeration
 *  alone would make a future status un-selectable — the row would render (the
 *  badge falls through to the raw string, entry-status-badge.tsx:13) but could
 *  never be filtered TO, which is the "instrument built against a closed
 *  enumeration" mistake. */
export function statusOptions(entries: JournalEntryRow[]): string[] {
  const seen = new Set<string>(ENTRY_STATUS_DOMAIN);
  for (const e of entries) if (e.status) seen.add(e.status);
  return [...seen].sort();
}

/** Every origin the filter offers — DERIVED from the rows, never a typed list.
 *  `journal_entries.origin`'s CHECK was widened by a later ALTER
 *  (0041_wave_d_a_fa_register.sql:766-767, cited in lib/journals/types.ts:42-45)
 *  and this module does not need to know the new members to offer them. */
export function originOptions(entries: JournalEntryRow[]): string[] {
  const seen = new Set<string>();
  for (const e of entries) if (e.origin) seen.add(e.origin);
  return [...seen].sort();
}

/** `posting_date` is a `date` column (0003_books_core.sql:104) — a
 *  `YYYY-MM-DD` string, so a lexicographic compare against the bounds IS the
 *  chronological compare, with no Date parsing and no timezone to shift the
 *  calendar day (components/journals/formatted-date.tsx's own note). A row
 *  with a NULL posting_date is EXCLUDED whenever a bound is set: it cannot be
 *  proven in range, and absence is not evidence. */
export function filterEntryRows(rows: EntryTableRow[], filters: EntriesFilters): EntryTableRow[] {
  return rows.filter((row) => {
    const e = row.entry;
    if (filters.status !== ANY && e.status !== filters.status) return false;
    if (filters.origin !== ANY && e.origin !== filters.origin) return false;
    if (filters.from || filters.to) {
      const d = e.posting_date;
      if (!d) return false;
      if (filters.from && d.slice(0, 10) < filters.from) return false;
      if (filters.to && d.slice(0, 10) > filters.to) return false;
    }
    return true;
  });
}

function cmpText(a: string | null, b: string | null): number {
  // Nulls last in BOTH directions — the caller flips the sign of the comparison
  // for `desc`, so a null pushed to the end here would flip to the FRONT there.
  // `nullLast` below re-applies the rule after the flip.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function valueOf(row: EntryTableRow, key: EntrySortKey): { text: string | null; num: number | null } {
  switch (key) {
    case "posting_date": return { text: row.entry.posting_date, num: null };
    case "memo": return { text: row.entry.memo, num: null };
    case "status": return { text: row.entry.status, num: null };
    case "origin": return { text: row.entry.origin, num: null };
    case "debit": return { text: null, num: row.debitCents };
    case "credit": return { text: null, num: row.creditCents };
  }
}

/**
 * A stable sort with an explicit `id` tiebreak, so two entries sharing a
 * posting date always land in the same order across renders (Array#sort's
 * stability is guaranteed by the spec, but the tiebreak also makes the order
 * deterministic across the FILTERED subsets a page slice sees).
 *
 * `totalsSortable: false` (the caller passes `!linesTruncated`) makes a
 * debit/credit sort a NO-OP that falls back to `DEFAULT_SORT`: sorting rows by
 * a number the UI has withheld would be a claim about data this read never
 * saw. The component does not render the control in that state either — this
 * is the second half of the same rule, so the logic is safe on its own.
 */
export function sortEntryRows(rows: EntryTableRow[], sort: EntriesSort, totalsSortable: boolean): EntryTableRow[] {
  const effective: EntriesSort =
    (sort.key === "debit" || sort.key === "credit") && !totalsSortable ? DEFAULT_SORT : sort;
  const dir = effective.dir === "asc" ? 1 : -1;
  return rows.slice().sort((ra, rb) => {
    const a = valueOf(ra, effective.key);
    const b = valueOf(rb, effective.key);
    let base: number;
    if (a.num !== null && b.num !== null) base = a.num - b.num;
    else base = cmpText(a.text, b.text);
    // nullLast: a null compared against a value always sorts AFTER it,
    // whichever direction the column is running.
    const aNull = a.num === null && a.text === null;
    const bNull = b.num === null && b.text === null;
    if (aNull !== bNull) return aNull ? 1 : -1;
    if (base !== 0) return base * dir;
    return ra.entry.id < rb.entry.id ? -1 : ra.entry.id > rb.entry.id ? 1 : 0;
  });
}

export const PAGE_SIZES = [25, 50, 100] as const;

export type Page = {
  /** 1-based, clamped into `[1, pageCount]`. */
  page: number;
  pageCount: number;
  rows: EntryTableRow[];
};

/** `pageCount` is at least 1 so "Page 1 of 1" is what an empty result reads,
 *  never "Page 1 of 0". */
export function pageOf(rows: EntryTableRow[], page: number, pageSize: number): Page {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const start = (clamped - 1) * pageSize;
  return { page: clamped, pageCount, rows: rows.slice(start, start + pageSize) };
}

/**
 * Has the READER changed anything, compared against the state the tab OPENED on?
 *
 * NOT "is any filter set". The Posted tab opens with `status: "approved"` — that is the tab's
 * own contract, not something a reader did — so a bare "is any filter non-empty" test was true
 * on arrival, which made the Clear control appear over an untouched table AND made clearing it
 * WIDEN the Posted tab into drafts and withdrawn entries. A control named "Clear filters" that
 * shows a reader MORE than the tab promised is doing the opposite of what it says.
 *
 * `initial` is the caller's own opening state, so the same function serves a future tab that
 * opens on a different status without another copy of this rule.
 */
export function filtersActive(filters: EntriesFilters, initial: EntriesFilters = NO_FILTERS): boolean {
  return (
    filters.status !== initial.status ||
    filters.origin !== initial.origin ||
    filters.from !== initial.from ||
    filters.to !== initial.to
  );
}
