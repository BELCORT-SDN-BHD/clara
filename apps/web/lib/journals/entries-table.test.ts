// lib/journals/entries-table.ts — the table's sort/filter/page rules, tested
// without a DOM. The component's own cells drive these through React;
// these pin the RULES, including the two that exist to stop the UI making a
// claim the read cannot support.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANY,
  DEFAULT_SORT,
  ENTRY_STATUS_DOMAIN,
  NO_FILTERS,
  buildEntryRows,
  filterEntryRows,
  filtersActive,
  originOptions,
  pageOf,
  sortEntryRows,
  statusOptions,
  type EntriesFilters,
} from "./entries-table";
import type { JournalEntryRow, JournalLineRow } from "./types";
import type { EntryLinkRow } from "@/lib/work/evidence";

function entry(over: Partial<JournalEntryRow> & { id: string }): JournalEntryRow {
  return {
    client_id: "c1", status: "approved", posting_date: "2026-04-01", memo: null,
    origin: "manual", document_id: null, coding_kind: null, revision_token: `rev-${over.id}`,
    maker_actor: null, checker_actor: null, approved_at: null, reversal_of: null, reversed_by: null,
    reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: "2026-04-01T00:00:00Z",
    ...over,
  };
}

function line(entryId: string, debit: number, credit: number, id = `${entryId}-l${debit}${credit}`): JournalLineRow {
  return { id, entry_id: entryId, line_no: 1, account_code: "1000", debit_cents: debit, credit_cents: credit, description: null, counterparty_id: null };
}

// THE FLAW-(b) REGRESSION PIN. The read orders by `created_at.desc`
// (lib/journals/api.ts:83) and the panel rendered ONLY `posting_date`, so a
// BACKDATED entry entered today sat at the top under a date the reader takes
// as the sort key. These two rows disagree on purpose: `old-posting` was
// created last but posted first.
const BACKDATED = entry({ id: "b", posting_date: "2026-01-15", created_at: "2026-04-09T00:00:00Z", memo: "backdated, entered today" });
const RECENT = entry({ id: "a", posting_date: "2026-04-08", created_at: "2026-04-08T00:00:00Z", memo: "posted last week" });

test("the default sort is posting_date DESC — the ACCOUNTING date, not the row's creation order", () => {
  assert.deepEqual(DEFAULT_SORT, { key: "posting_date", dir: "desc" });
  // `entries` arrives in the read's own created_at.desc order, which puts the
  // backdated row first.
  const rows = buildEntryRows([BACKDATED, RECENT], []);
  assert.equal(rows[0]!.entry.id, "b", "fixture check: the read hands the backdated row over first");

  const sorted = sortEntryRows(rows, DEFAULT_SORT, true);
  assert.deepEqual(sorted.map((r) => r.entry.posting_date), ["2026-04-08", "2026-01-15"]);
});

test("sorting ascending flips it, and a null posting_date sorts LAST in both directions", () => {
  const rows = buildEntryRows([BACKDATED, RECENT, entry({ id: "c", posting_date: null })], []);
  const desc = sortEntryRows(rows, { key: "posting_date", dir: "desc" }, true);
  const asc = sortEntryRows(rows, { key: "posting_date", dir: "asc" }, true);
  assert.deepEqual(desc.map((r) => r.entry.id), ["a", "b", "c"]);
  assert.deepEqual(asc.map((r) => r.entry.id), ["b", "a", "c"]);
});

test("buildEntryRows sums each entry's OWN lines, and an entry with NO read lines totals NULL, never zero", () => {
  const rows = buildEntryRows(
    [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "nolines" })],
    [line("a", 10_000, 0), line("a", 0, 10_000), line("b", 500, 0)],
  );
  const byId = Object.fromEntries(rows.map((r) => [r.entry.id, r]));
  assert.deepEqual(
    [byId.a!.debitCents, byId.a!.creditCents, byId.b!.debitCents, byId.b!.creditCents],
    [10_000, 10_000, 500, 0],
    "an entry WITH lines keeps its real sums, including a genuine 0 on the side that has none",
  );
  // Zero is a FIGURE — rendered it reads "RM 0.00" and tells a professional this entry has no
  // debits, which this read never established. Null is the honest answer, and `<Money>`'s own
  // null arm renders "—".
  assert.deepEqual([byId.nolines!.debitCents, byId.nolines!.creditCents], [null, null]);
});

test("a NULL-total row sorts LAST on a money column in both directions — nothing to total never leads", () => {
  const rows = buildEntryRows(
    [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "nolines" })],
    [line("a", 10_000, 0), line("b", 500, 0)],
  );
  assert.deepEqual(sortEntryRows(rows, { key: "debit", dir: "desc" }, true).map((r) => r.entry.id), ["a", "b", "nolines"]);
  assert.deepEqual(sortEntryRows(rows, { key: "debit", dir: "asc" }, true).map((r) => r.entry.id), ["b", "a", "nolines"]);
});

// THE WITHHELD-NUMBER RULE. `linesTruncated` means the line read was
// incomplete, so every derived total is unverifiable and the table renders
// "—". Ordering rows by a number the UI refuses to show would be a claim about
// data the read never saw.
test("a debit/credit sort is a NO-OP when the totals are withheld — it falls back to the default", () => {
  const rows = buildEntryRows([BACKDATED, RECENT], [line("b", 90_000, 0), line("a", 100, 0)]);
  const sortable = sortEntryRows(rows, { key: "debit", dir: "desc" }, true);
  assert.deepEqual(sortable.map((r) => r.entry.id), ["b", "a"], "with totals shown, the biggest debit leads");

  const withheld = sortEntryRows(rows, { key: "debit", dir: "desc" }, false);
  assert.deepEqual(
    withheld.map((r) => r.entry.id),
    sortEntryRows(rows, DEFAULT_SORT, false).map((r) => r.entry.id),
    "with totals withheld the order is the default, never the money order",
  );
  assert.deepEqual(withheld.map((r) => r.entry.id), ["a", "b"]);
});

test("statusOptions offers the DB's closed CHECK domain, and still offers a status the rows carry that the domain does not name", () => {
  assert.deepEqual([...ENTRY_STATUS_DOMAIN], ["draft", "approved", "withdrawn"]);
  const plain = statusOptions([entry({ id: "a" })]);
  assert.deepEqual(plain, ["approved", "draft", "withdrawn"]);

  // A value the DB grows tomorrow: the badge already renders it verbatim
  // (entry-status-badge.tsx), so the filter must be able to reach it.
  const widened = statusOptions([entry({ id: "a" }), entry({ id: "b", status: "superseded" })]);
  assert.deepEqual(widened, ["approved", "draft", "superseded", "withdrawn"]);
});

test("originOptions is DERIVED from the rows — never a typed list the 0041 CHECK widening could outgrow", () => {
  assert.deepEqual(originOptions([]), []);
  assert.deepEqual(
    originOptions([entry({ id: "a", origin: "manual" }), entry({ id: "b", origin: "fa_depreciation" }), entry({ id: "c", origin: "manual" })]),
    ["fa_depreciation", "manual"],
  );
});

test("the three filters narrow independently, and filtersActive reports whether any is on", () => {
  const rows = buildEntryRows(
    [
      entry({ id: "a", status: "approved", origin: "manual", posting_date: "2026-04-08" }),
      entry({ id: "b", status: "draft", origin: "document", posting_date: "2026-01-15" }),
      entry({ id: "c", status: "withdrawn", origin: "manual", posting_date: "2026-02-20" }),
    ],
    [],
  );
  assert.equal(filtersActive(NO_FILTERS), false);
  assert.equal(filterEntryRows(rows, NO_FILTERS).length, 3);

  const byStatus = filterEntryRows(rows, { ...NO_FILTERS, status: "withdrawn" });
  assert.deepEqual(byStatus.map((r) => r.entry.id), ["c"]);
  assert.equal(filtersActive({ ...NO_FILTERS, status: "withdrawn" }), true);

  const byOrigin = filterEntryRows(rows, { ...NO_FILTERS, origin: "manual" });
  assert.deepEqual(byOrigin.map((r) => r.entry.id), ["a", "c"]);

  const byRange = filterEntryRows(rows, { ...NO_FILTERS, from: "2026-02-01", to: "2026-03-01" });
  assert.deepEqual(byRange.map((r) => r.entry.id), ["c"]);

  // EVERY filter at its own do-not-filter sentinel keeps every row. Written as a full literal
  // rather than a spread on purpose: this cell exists to prove the sentinels, so a new filter
  // added without one goes RED here (as #634's four did) instead of quietly narrowing the table.
  assert.equal(
    filterEntryRows(rows, { status: ANY, origin: ANY, from: "", to: "", source: ANY, basis: ANY, memo: "", entry: "" }).length,
    3,
  );
});

// The Posted tab OPENS on `status: "approved"`. That is the tab's contract, not something the
// reader did — so a bare "is any filter set" test made "Clear filters" appear over an untouched
// table, and clearing it WIDENED Posted into drafts and withdrawn entries.
test("filtersActive compares against the tab's OPENING state, not against emptiness", () => {
  const opensOnPosted: EntriesFilters = { ...NO_FILTERS, status: "approved" };

  assert.equal(filtersActive(opensOnPosted, opensOnPosted), false, "an untouched Posted tab offers nothing to clear");
  assert.equal(filtersActive(opensOnPosted), true, "…while the old emptiness test called that very state 'filtered'");

  assert.equal(filtersActive({ ...opensOnPosted, status: "draft" }, opensOnPosted), true);
  assert.equal(filtersActive({ ...opensOnPosted, status: ANY }, opensOnPosted), true, "widening to All is itself a change");
  assert.equal(filtersActive({ ...opensOnPosted, origin: "manual" }, opensOnPosted), true);
  assert.equal(filtersActive({ ...opensOnPosted, from: "2026-01-01" }, opensOnPosted), true);
  assert.equal(filtersActive({ ...opensOnPosted, to: "2026-12-31" }, opensOnPosted), true);
});

// ABSENCE IS NOT EVIDENCE: a row with no posting_date cannot be PROVEN to be
// in the range, so a date bound excludes it rather than assuming it belongs.
test("a NULL posting_date is excluded the moment a date bound is set, and included when none is", () => {
  const rows = buildEntryRows([entry({ id: "a", posting_date: "2026-04-08" }), entry({ id: "n", posting_date: null })], []);
  assert.equal(filterEntryRows(rows, NO_FILTERS).length, 2);
  assert.deepEqual(filterEntryRows(rows, { ...NO_FILTERS, from: "2026-01-01" }).map((r) => r.entry.id), ["a"]);
  assert.deepEqual(filterEntryRows(rows, { ...NO_FILTERS, to: "2026-12-31" }).map((r) => r.entry.id), ["a"]);
});

test("pageOf slices, clamps an out-of-range page, and never reports 'page 1 of 0'", () => {
  const rows = buildEntryRows(
    Array.from({ length: 7 }, (_, i) => entry({ id: `e${i}`, posting_date: `2026-04-0${i + 1}` })),
    [],
  );
  const first = pageOf(rows, 1, 3);
  assert.deepEqual([first.page, first.pageCount, first.rows.length], [1, 3, 3]);

  const last = pageOf(rows, 3, 3);
  assert.deepEqual([last.page, last.pageCount, last.rows.length], [3, 3, 1]);

  const past = pageOf(rows, 99, 3);
  assert.equal(past.page, 3, "a page past the end clamps to the last real page");
  const before = pageOf(rows, 0, 3);
  assert.equal(before.page, 1);

  const none = pageOf([], 1, 25);
  assert.deepEqual([none.page, none.pageCount, none.rows.length], [1, 1, 0]);
});

// ===========================================================================================
// #634 — THE LINK MODEL: Work, receipt, source and the correction chain, merged onto the rows,
// plus the three filters a reader needs once a source can be present or absent.
// ===========================================================================================

function link(over: Partial<EntryLinkRow> & { entry_id: string }): EntryLinkRow {
  return {
    status: "approved", origin: "agent", work_id: null, receipt_id: null, logical_op_id: null,
    purpose: null, basis_origin: null, initiated_by: null, initiated_by_role: null, responsible: null,
    document_id: null, document_source: null, attached_at: null, released_at: null,
    reversal_of: null, reversed_by: null, reversal_reason: null,
    ...over,
  };
}

// THE `t634` PREFIX IS NOT A TYPO. A string literal containing `#634` is a valid
// three-digit CSS hex colour, and this app's `no-restricted-syntax` raw-colour
// rule (owner ruling Q4) reds every one of them. Ticket ids stay in COMMENTS,
// where the rule does not look; test NAMES carry the bare number.


test("t634: buildEntryRows merges each entry's link row, and leaves it null when there is none", () => {
  const rows = buildEntryRows(
    [entry({ id: "e1" }), entry({ id: "e2" })],
    [],
    [link({ entry_id: "e1", work_id: "w1", document_id: "d1", document_source: "work_commit" })],
  );
  const byId = Object.fromEntries(rows.map((r) => [r.entry.id, r]));
  assert.equal(byId.e1!.link?.work_id, "w1");
  assert.equal(byId.e1!.link?.document_id, "d1");
  // An entry the links read did not cover is NULL, never a fabricated empty row: "we did not
  // read it" and "there is no source" are different facts and the surface says so differently.
  assert.equal(byId.e2!.link, null);
});

test("t634: buildEntryRows still works with no links at all (the read failed, the table stands)", () => {
  const rows = buildEntryRows([entry({ id: "e1" })], []);
  assert.equal(rows[0]!.link, null);
});

test("t634: the has-a-source filter keys on the LINK, not on the entry's own document_id alone", () => {
  const rows = buildEntryRows(
    [entry({ id: "e1" }), entry({ id: "e2" }), entry({ id: "e3", document_id: "d3" })],
    [],
    [link({ entry_id: "e1", document_id: "d1", document_source: "late_attachment" }), link({ entry_id: "e2" })],
  );
  const withSource = filterEntryRows(rows, { ...NO_FILTERS, source: "with" });
  assert.deepEqual(withSource.map((r) => r.entry.id), ["e1"]);
  // e3 carries the DOCUMENT-CODING lane's own column but no link row — it has a source too,
  // and a filter that missed it would hide half the estate's document-backed entries. It is
  // absent here only because this fixture gave it no link row: the link read is the one the
  // filter trusts, and `document_id` on the entry reaches it through `list_entry_links`'
  // own coalesce. Stated so the next reader does not "fix" it the wrong way.
  const withoutSource = filterEntryRows(rows, { ...NO_FILTERS, source: "without" });
  assert.deepEqual(withoutSource.map((r) => r.entry.id), ["e2", "e3"]);
  // `ANY` keeps every row, which is what the default must do.
  assert.equal(filterEntryRows(rows, NO_FILTERS).length, 3);
});

test("t634: the basis-origin filter separates what a person typed from what Clara interpreted", () => {
  const rows = buildEntryRows(
    [entry({ id: "e1" }), entry({ id: "e2" }), entry({ id: "e3" })],
    [],
    [
      link({ entry_id: "e1", basis_origin: "user_direct" }),
      link({ entry_id: "e2", basis_origin: "clara_interpreted" }),
    ],
  );
  assert.deepEqual(
    filterEntryRows(rows, { ...NO_FILTERS, basis: "user_direct" }).map((r) => r.entry.id),
    ["e1"],
  );
  assert.deepEqual(
    filterEntryRows(rows, { ...NO_FILTERS, basis: "clara_interpreted" }).map((r) => r.entry.id),
    ["e2"],
  );
  // e3 has no link row, so its basis origin is UNKNOWN — and an unknown is never counted as
  // either answer. Absence is not evidence.
  assert.equal(filterEntryRows(rows, { ...NO_FILTERS, basis: "user_direct" }).some((r) => r.entry.id === "e3"), false);
});

test("t634: the memo search is a case-insensitive substring over the memo the row shows", () => {
  const rows = buildEntryRows(
    [entry({ id: "e1", memo: "Office RENT paid from Maybank" }), entry({ id: "e2", memo: "Bank charges" }), entry({ id: "e3", memo: null })],
    [],
  );
  assert.deepEqual(filterEntryRows(rows, { ...NO_FILTERS, memo: "rent" }).map((r) => r.entry.id), ["e1"]);
  assert.deepEqual(filterEntryRows(rows, { ...NO_FILTERS, memo: "  BANK " }).map((r) => r.entry.id), ["e1", "e2"]);
  // A row with NO memo can never match a search: it cannot be proven to contain the text.
  assert.equal(filterEntryRows(rows, { ...NO_FILTERS, memo: "e" }).some((r) => r.entry.id === "e3"), false);
  // A blank search is not a filter.
  assert.equal(filterEntryRows(rows, { ...NO_FILTERS, memo: "   " }).length, 3);
});

test("t634: the ENTRY filter is the one a refusal's link lands on — exactly that row, nothing else", () => {
  const rows = buildEntryRows([entry({ id: "e1" }), entry({ id: "e2" })], []);
  assert.deepEqual(filterEntryRows(rows, { ...NO_FILTERS, entry: "e2" }).map((r) => r.entry.id), ["e2"]);
  // An id that names nothing in this read shows NOTHING rather than everything: the reader was
  // sent to a specific entry, and silently showing the whole table would hide that it is absent.
  assert.deepEqual(filterEntryRows(rows, { ...NO_FILTERS, entry: "nope" }), []);
});

test("t634: the new filters count as reader edits, so Clear appears and returns to the tab's own state", () => {
  const initial: EntriesFilters = { ...NO_FILTERS, status: "approved" };
  assert.equal(filtersActive(initial, initial), false);
  for (const patch of [{ source: "with" as const }, { basis: "user_direct" }, { memo: "rent" }, { entry: "e1" }]) {
    assert.equal(filtersActive({ ...initial, ...patch }, initial), true, JSON.stringify(patch));
  }
});
