"use client";

// THE JOURNAL-ENTRIES TABLE (owner: "没有一个UIUX table for journal entry? (go
// see DataTable shadcn)"). The shadcn DATA-TABLE PATTERN — a <Table> on a
// DataTableCard, a filter toolbar above it, a pagination row below — with NO
// new dependency; the sort/filter/page rules are lib/journals/entries-table.ts
// and that module's header prices @tanstack/react-table and declines it.
//
// WHAT THIS TABLE IS HONEST ABOUT, and it is most of the file:
//   · REFERENCE. There is NO human-facing journal number in
//     clara.journal_entries (0003_books_core.sql:101-128, plus every later
//     ALTER lib/journals/types.ts:6-13 enumerates). The Reference column shows
//     the row's OWN id, truncated, and says "system id" in its header. A
//     rendered "JE-0001" would be a model-invented numeral standing in a place
//     a reader takes for the books — hard constraint 2 forbids it. Giving the
//     firm a real journal number is a MIGRATION, not a UI change.
//   · TOTALS. A posted entry has no DB-computed total (a DRAFT does —
//     `amount_cents`, summed inside clara.list_review_queue). The Dr/Cr columns
//     are client-side presentation sums, labelled as such in the header, and
//     WITHHELD entirely (the "—" + the unavailable label posted-panel.tsx has
//     always used) when `linesTruncated` says the line read was incomplete.
//     The sort control on those two columns disappears in that state:
//     ordering rows by a number the UI refuses to show is a claim about data
//     this read never saw.
//   · THE READ'S OWN CEILING. `entriesTruncated` (lib/journals/api.ts:248)
//     was computed, typed and rendered NOWHERE — so a client with more than
//     FETCH_CAP entries saw a complete-looking list. It is a warning line here,
//     worded like its sibling `linesTruncated`, because "page 40 of 40" must
//     not read as the end of the books when it is the end of the first page of
//     a truncated read.
//   · THE DEFAULT SORT. posting_date DESC — the accounting date, which is also
//     the only date this table shows. The READ still orders by created_at
//     (api.ts:83); this table no longer inherits that mismatch.
//
// The reversal ceremony is carried over from posted-panel.tsx UNCHANGED in
// substance: a required reason, one governed call, the refusal rendered
// verbatim per row, and the form closing ONLY on success (FIX-2 — closing it
// unconditionally left a CLR10/CLR31 refusal nowhere to render). LAW 6 still
// holds: there is no delete affordance anywhere on this surface.

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableCard } from "@/components/common/data-table-card";
import { NativeSelect } from "@/components/common/native-select";
import { EmptyState } from "@/components/common/state";
import { EntryRows, originLabel } from "@/components/journals/journal-entry-row";
import {
  ANY,
  DEFAULT_SORT,
  NO_FILTERS,
  PAGE_SIZES,
  buildEntryRows,
  filterEntryRows,
  filtersActive,
  originOptions,
  pageOf,
  sortEntryRows,
  statusOptions,
  type EntriesFilters,
  type EntriesSort,
  type EntrySortKey,
} from "@/lib/journals/entries-table";
import type { CoaAccountRow, JournalEntryRow, JournalLineRow } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

/** Text columns read best ascending on a first click; a date or a money
 *  column reads best descending (newest / largest first). */
const FIRST_CLICK_DESC: ReadonlySet<EntrySortKey> = new Set(["posting_date", "debit", "credit"]);

/**
 * A sortable column header: a real `<button>` inside the `<th>`, with the
 * `<th>` itself carrying `aria-sort`. This is the FIRST `aria-sort` in the
 * product (measured: a grep for aria-sort across apps/web returned only
 * test/a11yRules.ts's attribute allow-list), so it gets its own a11y cell
 * rather than riding on a neighbour's.
 *
 * It lives here, not in components/ui/table.tsx: that file is vendored shadcn
 * and a future `shadcn add table` would overwrite anything added to it.
 */
function SortHead({
  label,
  columnKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  columnKey: EntrySortKey;
  sort: EntriesSort;
  onSort: (key: EntrySortKey) => void;
  className?: string;
}) {
  const active = sort.key === columnKey;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        // `min-h-8`/`px-1` keeps the hit target at the 裁-13 floor once the
        // header cell's own h-10 is shared with the button's padding box.
        className="motion-fast -mx-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-medium transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/70"
      >
        {label}
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </TableHead>
  );
}

export function JournalEntriesTable({
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
  defaultStatus,
}: {
  clientId: string;
  entries: JournalEntryRow[];
  lines: JournalLineRow[];
  linesTruncated: boolean;
  /** lib/journals/api.ts:248 — `true` means `entries` is an INCOMPLETE page of
   *  clara.journal_entries, not the whole client's history. */
  entriesTruncated: boolean;
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  /** FIX-2 / N1: whose busy/err/clr this render belongs to. */
  actingId: string | null;
  onReverse: (entryId: string, reason: string, onOk: () => void) => void;
  /** The status the tab opens on. The Posted tab passes `"approved"`; the
   *  filter stays live so a reader can widen to draft/withdrawn — WITHDRAWN
   *  entries have no other surface in the product at all (the drafts queue
   *  carries only `row_kind === 'draft'` rows, and the old posted card stack
   *  filtered to `approved`), so this is the first place they are reachable. */
  defaultStatus: string;
}) {
  const t = useTranslations("JournalsWorkbench.table");
  const tp = useTranslations("JournalsWorkbench.posted");
  const ts = useTranslations("JournalsWorkbench.status");
  const to = useTranslations("JournalsWorkbench.origin");

  // The state the tab OPENS on, and what "Clear filters" returns to. Clearing to NO_FILTERS
  // would widen the Posted tab into drafts and withdrawn entries — a control named "Clear"
  // showing MORE than the tab promised.
  const initialFilters = useMemo<EntriesFilters>(() => ({ ...NO_FILTERS, status: defaultStatus }), [defaultStatus]);
  const [sort, setSort] = useState<EntriesSort>(DEFAULT_SORT);
  const [filters, setFilters] = useState<EntriesFilters>(initialFilters);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [diffId, setDiffId] = useState<string | null>(null);

  const totalsSortable = !linesTruncated;
  const all = useMemo(() => buildEntryRows(entries, lines), [entries, lines]);
  const filtered = useMemo(() => filterEntryRows(all, filters), [all, filters]);
  const sorted = useMemo(() => sortEntryRows(filtered, sort, totalsSortable), [filtered, sort, totalsSortable]);
  const current = pageOf(sorted, page, pageSize);

  function update(next: Partial<EntriesFilters>): void {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }

  function onSort(key: EntrySortKey): void {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_CLICK_DESC.has(key) ? "desc" : "asc" }));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-2">
      {entriesTruncated && <p className="text-sm text-warning">{t("entriesTruncated")}</p>}
      {linesTruncated && <p className="text-sm text-warning">{t("linesTruncated")}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <FilterField id="je-filter-status" label={t("filterStatus")}>
          <NativeSelect id="je-filter-status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value={ANY}>{t("filterAny")}</option>
            {statusOptions(entries).map((s) => (
              <option key={s} value={s}>
                {s === "draft" || s === "approved" || s === "withdrawn" ? ts(s) : s}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField id="je-filter-source" label={t("filterSource")}>
          <NativeSelect id="je-filter-source" value={filters.origin} onChange={(e) => update({ origin: e.target.value })}>
            <option value={ANY}>{t("filterAny")}</option>
            {originOptions(entries).map((o) => (
              <option key={o} value={o}>
                {originLabel(o, to)}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField id="je-filter-from" label={t("filterFrom")}>
          <Input id="je-filter-from" type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} className="w-40" />
        </FilterField>
        <FilterField id="je-filter-to" label={t("filterTo")}>
          <Input id="je-filter-to" type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} className="w-40" />
        </FilterField>
        {filtersActive(filters, initialFilters) && (
          <Button type="button" size="sm" variant="outline" onClick={() => update(initialFilters)}>
            {t("clearFilters")}
          </Button>
        )}
      </div>

      {/* The count line rides on a FACT, not on whether the reader touched anything: rows are
          being hidden, whoever hid them. On arrival that is the tab's own status filter, and
          the select beside it reads "Posted", so the line is never orphaned. The Clear control
          above is the half that keys on the reader's own edits. */}
      {filtered.length !== all.length && (
        <p className="text-sm text-muted-foreground">{t("showingOf", { shown: filtered.length, total: all.length })}</p>
      )}

      {all.length === 0 ? (
        <EmptyState>{tp("empty")}</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>{t("noMatches")}</EmptyState>
      ) : (
        <>
          <DataTableCard label={t("tableLabel")}>
            <TableHeader>
              <TableRow>
                <SortHead label={t("colDate")} columnKey="posting_date" sort={sort} onSort={onSort} />
                <TableHead>{t("colReference")}</TableHead>
                <SortHead label={t("colDescription")} columnKey="memo" sort={sort} onSort={onSort} />
                {totalsSortable ? (
                  <>
                    <SortHead label={t("colDebit")} columnKey="debit" sort={sort} onSort={onSort} className="text-right" />
                    <SortHead label={t("colCredit")} columnKey="credit" sort={sort} onSort={onSort} className="text-right" />
                  </>
                ) : (
                  <>
                    <TableHead className="text-right">{t("colDebit")}</TableHead>
                    <TableHead className="text-right">{t("colCredit")}</TableHead>
                  </>
                )}
                <SortHead label={t("colStatus")} columnKey="status" sort={sort} onSort={onSort} />
                <SortHead label={t("colSource")} columnKey="origin" sort={sort} onSort={onSort} />
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.rows.map((row) => (
                <EntryRows
                  key={row.entry.id}
                  clientId={clientId}
                  row={row}
                  lines={lines}
                  accounts={accounts}
                  linesTruncated={linesTruncated}
                  busy={busy}
                  err={actingId === row.entry.id ? err : null}
                  clr={actingId === row.entry.id ? clr : null}
                  expanded={expandedId === row.entry.id}
                  onToggle={() => setExpandedId(expandedId === row.entry.id ? null : row.entry.id)}
                  reversing={reversingId === row.entry.id}
                  onStartReverse={() => {
                    setExpandedId(row.entry.id);
                    setReversingId(row.entry.id);
                    setReason("");
                  }}
                  onCancelReverse={() => setReversingId(null)}
                  reason={reason}
                  onReasonChange={setReason}
                  diffOpen={diffId === row.entry.id}
                  onToggleDiff={() => setDiffId(diffId === row.entry.id ? null : row.entry.id)}
                  onReverse={onReverse}
                  onReverseOk={() => {
                    setReversingId(null);
                    setReason("");
                  }}
                />
              ))}
            </TableBody>
          </DataTableCard>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t("pageOf", { page: current.page, pages: current.pageCount, total: filtered.length })}
            </p>
            <div className="flex items-center gap-2">
              <FilterField id="je-page-size" label={t("pageSize")}>
                <NativeSelect
                  id="je-page-size"
                  value={String(pageSize)}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </FilterField>
              <Button type="button" size="sm" variant="outline" disabled={current.page <= 1} onClick={() => setPage(current.page - 1)}>
                {t("previousPage")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={current.page >= current.pageCount}
                onClick={() => setPage(current.page + 1)}
              >
                {t("nextPage")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FilterField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
