// The journal-entries table, driven for real (owner: "没有一个UIUX table for
// journal entry? (go see DataTable shadcn)"). Every cell asserts a
// DISCRIMINATING post-condition — something true only after the click it
// follows — because a table's rows all say similar things and a lazy match
// would survive deleting the very control under test.
//
// Mounted through PostedPanel, the real consumer, so the default status filter
// and the props the workbench actually passes are part of what is proven.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { PostedPanel } from "./posted-panel";
import type { CoaAccountRow, JournalEntryRow, JournalLineRow } from "../../lib/journals/types";

enableDomInspection();

type El = { getAttribute(name: string): string | null; querySelectorAll(selector: string): El[] };

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: "c1", account_code: "1000", name: "Cash", account_type: "asset", is_active: true },
];

function entry(over: Partial<JournalEntryRow> & { id: string }): JournalEntryRow {
  return {
    client_id: "c1", status: "approved", posting_date: "2026-04-01", memo: null,
    origin: "manual", document_id: null, coding_kind: null, revision_token: `rev-${over.id}`,
    maker_actor: null, checker_actor: null, approved_at: null, reversal_of: null, reversed_by: null,
    reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: "2026-04-01T00:00:00Z",
    ...over,
  };
}

// Named memos, because the sort assertions read the FIRST ROW'S TEXT — the
// only post-condition that discriminates one order from the other.
const BACKDATED = entry({ id: "b0000000-0000-4000-8000-000000000000", posting_date: "2026-01-15", memo: "BACKDATED january", created_at: "2026-04-09T00:00:00Z" });
const RECENT = entry({ id: "a0000000-0000-4000-8000-000000000000", posting_date: "2026-04-08", memo: "RECENT april", created_at: "2026-04-08T00:00:00Z" });
const WITHDRAWN = entry({ id: "c0000000-0000-4000-8000-000000000000", posting_date: "2026-03-03", memo: "ABANDONED march", status: "withdrawn" });
const FROM_DOC = entry({ id: "d0000000-0000-4000-8000-000000000000", posting_date: "2026-02-02", memo: "DOCUMENT february", origin: "document", document_id: "doc-1" });

const LINES: JournalLineRow[] = [
  { id: "l1", entry_id: BACKDATED.id, line_no: 1, account_code: "1000", debit_cents: 90_000, credit_cents: 0, description: "big", counterparty_id: null },
  { id: "l2", entry_id: RECENT.id, line_no: 1, account_code: "1000", debit_cents: 100, credit_cents: 0, description: "small", counterparty_id: null },
];

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children });
}

type Over = {
  entries?: JournalEntryRow[];
  lines?: JournalLineRow[];
  linesTruncated?: boolean;
  entriesTruncated?: boolean;
  onReverse?: (entryId: string, reason: string, onOk: () => void) => void;
  err?: string | null;
  clr?: { code: string; reason: string | null } | null;
  actingId?: string | null;
};

function panel(over: Over = {}) {
  return App(
    createElement(PostedPanel, {
      clientId: "c1",
      entries: over.entries ?? [BACKDATED, RECENT],
      lines: over.lines ?? LINES,
      linesTruncated: over.linesTruncated ?? false,
      entriesTruncated: over.entriesTruncated ?? false,
      accounts: ACCOUNTS,
      busy: false,
      err: over.err ?? null,
      clr: over.clr ?? null,
      actingId: over.actingId ?? null,
      onReverse: over.onReverse ?? (() => {}),
    }),
  );
}

/** The memo of the table's first BODY row — the discriminating read for every
 *  ordering claim below. */
function firstRowText(container: unknown): string {
  const body = (container as El).querySelectorAll("tbody")[0];
  assert.ok(body, "the table must render a body");
  const row = body!.querySelectorAll("tr")[0];
  assert.ok(row, "the table body must hold at least one row");
  return textOf(row as never);
}

/**
 * `\s`, NOT a literal space, between the symbol and the digits.
 *
 * `<Money>` formats through `Intl.NumberFormat` with `currencyDisplay: "narrowSymbol"`, which
 * separates "RM" from the number with a NARROW NO-BREAK SPACE (U+202F), not U+0020. A literal
 * `/RM 0\.00/` therefore never matches a rendered amount — which makes an `assert.doesNotMatch`
 * against it VACUOUS: it would have gone green over a real "RM 0.00" on screen, proving the
 * opposite of what it claims. Caught by the must-not-red half of the cell below, which is the
 * whole reason a positive control sits beside every absence assertion.
 */
const MONEY_ZERO = /RM\s0\.00/;
const MONEY_ONE = /RM\s1\.00/;

function buttonsNamed(container: unknown, name: RegExp): unknown[] {
  return (container as El).querySelectorAll("button").filter((n) => name.test(textOf(n as never)));
}

function headerNamed(container: unknown, name: RegExp): El {
  const th = (container as El).querySelectorAll("th").find((n) => name.test(textOf(n as never)));
  assert.ok(th, `no column header matched ${name}`);
  return th!;
}

test("the Posted tab renders a TABLE ordered by posting_date desc — not by the read's created_at order", async () => {
  const h = await renderComponent(panel());
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.ok((h.container as unknown as El).querySelectorAll("table").length === 1, "exactly one table");
    // BACKDATED is first in the props (the read's created_at.desc order) and
    // LAST on screen, which is the whole point of the fix.
    assert.match(firstRowText(h.container), /RECENT april/);
  } finally {
    await h.unmount();
  }
});

test("clicking a sortable header FLIPS the order, and aria-sort follows it", async () => {
  const h = await renderComponent(panel());
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const dateHeader = headerNamed(h.container, /Posting date/);
    assert.equal(dateHeader.getAttribute("aria-sort"), "descending");

    const button = dateHeader.querySelectorAll("button")[0];
    await clickButton(button as never);
    await h.settle();

    assert.equal(headerNamed(h.container, /Posting date/).getAttribute("aria-sort"), "ascending");
    assert.match(firstRowText(h.container), /BACKDATED january/, "ascending must put the OLDEST posting date first");
  } finally {
    await h.unmount();
  }
});

test("a filter narrows the rows, says how many it hid, and the status filter reaches a WITHDRAWN entry that has no other surface", async () => {
  const h = await renderComponent(panel({ entries: [BACKDATED, RECENT, WITHDRAWN] }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    // The tab opens on `approved`, so the withdrawn entry is not on screen…
    assert.doesNotMatch(h.text(), /ABANDONED march/);
    assert.match(h.text(), /Showing 2 of 3 entries/);

    const statusSelect = h.find((n) => n.tagName === "SELECT" && (n as unknown as El).getAttribute("id") === "je-filter-status");
    assert.ok(statusSelect, "the status filter must be a real <select>");
    await h.fireEvent(statusSelect!, "change", (n) => { (n as unknown as { value: string }).value = "withdrawn"; });
    await h.settle();

    // …and widening the filter is the ONLY way it becomes reachable at all.
    assert.match(h.text(), /ABANDONED march/);
    assert.doesNotMatch(h.text(), /RECENT april/);
    assert.match(h.text(), /Showing 1 of 3 entries/);
  } finally {
    await h.unmount();
  }
});

test("the source filter narrows by the DB's own origin, labelled but never relabelled away", async () => {
  const h = await renderComponent(panel({ entries: [RECENT, FROM_DOC], lines: [] }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const sourceSelect = h.find((n) => n.tagName === "SELECT" && (n as unknown as El).getAttribute("id") === "je-filter-source");
    assert.ok(sourceSelect, "the source filter must be a real <select>");
    await h.fireEvent(sourceSelect!, "change", (n) => { (n as unknown as { value: string }).value = "document"; });
    await h.settle();
    assert.match(h.text(), /DOCUMENT february/);
    assert.doesNotMatch(h.text(), /RECENT april/);
  } finally {
    await h.unmount();
  }
});

// The Posted tab opens on `status: "approved"` because that is what the tab promises. A "Clear
// filters" control over an untouched table would, on being clicked, WIDEN Posted into drafts
// and withdrawn entries — showing a reader MORE than the tab said it holds.
test("an untouched Posted tab offers nothing to clear, and clearing returns to the tab's own status", async () => {
  const h = await renderComponent(panel({ entries: [BACKDATED, RECENT, WITHDRAWN] }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.equal(buttonsNamed(h.container, /^Clear filters$/).length, 0, "nothing to clear on arrival");
    // The count line is a FACT about hidden rows and does still render.
    assert.match(h.text(), /Showing 2 of 3 entries/);

    const statusSelect = h.find((n) => n.tagName === "SELECT" && (n as unknown as El).getAttribute("id") === "je-filter-status");
    await h.fireEvent(statusSelect!, "change", (n) => { (n as unknown as { value: string }).value = "withdrawn"; });
    await h.settle();
    assert.equal(buttonsNamed(h.container, /^Clear filters$/).length, 1, "the reader's own change is what offers the control");

    await h.act(async () => { await clickButton(buttonsNamed(h.container, /^Clear filters$/)[0] as never); });
    await h.settle();
    assert.match(h.text(), /RECENT april/);
    assert.doesNotMatch(h.text(), /ABANDONED march/, "clearing returns to Posted, it does not widen past the tab");
    assert.equal(buttonsNamed(h.container, /^Clear filters$/).length, 0);
  } finally {
    await h.unmount();
  }
});

test("an entry with NO lines in an untruncated read shows '—', never RM 0.00", async () => {
  const noLines = entry({ id: "e0000000-0000-4000-8000-000000000000", posting_date: "2026-05-01", memo: "NOLINES may" });
  const h = await renderComponent(panel({ entries: [noLines, RECENT], lines: LINES }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const rows = (h.container as unknown as El).querySelectorAll("tbody")[0]!.querySelectorAll("tr");
    const row = rows.find((r) => /NOLINES may/.test(textOf(r as never)));
    assert.ok(row, "the no-lines entry must render");
    const text = textOf(row as never);
    assert.doesNotMatch(text, MONEY_ZERO, `a zero is a FIGURE, and this read never saw one: ${text}`);
    assert.match(text, /—/, "the honest answer to 'what does it total' when no line was read is a dash");

    // MUST-NOT-RED half: the entry that DOES have lines still shows its money. This half is
    // also what caught the regex bug — a literal `RM 0.00` never matches the rendered string,
    // so the doesNotMatch above would have passed over a real zero. See MONEY_ZERO's note.
    const withLines = rows.find((r) => /RECENT april/.test(textOf(r as never)));
    assert.match(textOf(withLines as never), MONEY_ONE);
  } finally {
    await h.unmount();
  }
});

test("a posting-date range excludes what falls outside it", async () => {
  const h = await renderComponent(panel({ entries: [BACKDATED, RECENT, FROM_DOC], lines: [] }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const from = h.find((n) => (n as unknown as El).getAttribute?.("id") === "je-filter-from");
    assert.ok(from, "the from-date filter must render");
    await h.act(() => { setFieldValue(from!, "2026-03-01"); });
    await h.settle();
    assert.match(h.text(), /RECENT april/);
    assert.doesNotMatch(h.text(), /BACKDATED january/);
    assert.doesNotMatch(h.text(), /DOCUMENT february/);
  } finally {
    await h.unmount();
  }
});
