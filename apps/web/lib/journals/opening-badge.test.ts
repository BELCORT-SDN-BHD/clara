// #656 — C3's half: an opening entry says so on the client's own books.
//
// An approved opening item posts an ordinary `clara.journal_entries` row with `origin='manual'`
// (0017:3375-3384), so before this ticket the Journals tab showed a client's OPENING POSITION and a
// journal a colleague typed this morning under the same word, with nothing to tell them apart.
// `ENTRY_SELECT` did not even read the column that could.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isOpeningEntry, openingBasisHref } from "./opening-badge";

test("isOpeningEntry reads the DATABASE'S OWN COLUMN and never infers from origin or memo", () => {
  assert.equal(isOpeningEntry({ is_opening_balance: true }), true);
  assert.equal(isOpeningEntry({ is_opening_balance: false }), false);
  // ABSENT IS NOT TRUE. The column is optional on the row type (eight fixtures across four other
  // lanes build the row literally, and making it required would have turned a one-column read into
  // a cross-ticket edit mid-wave), so an absent value must read as "not opening" rather than as
  // unknown-therefore-badge.
  assert.equal(isOpeningEntry({}), false);
  assert.equal(isOpeningEntry({ is_opening_balance: null }), false);
});

test("the badge links back to the basis, on the tab that already exists", () => {
  // `?tab=opening` is a real, reload-stable URL `RegistersWorkbench` already owns — deliberately
  // absent from the sidebar, which is exactly why a link FROM the books matters.
  assert.equal(openingBasisHref("c1"), "/clients/c1/registers?tab=opening");
  assert.equal(openingBasisHref("0f3e"), "/clients/0f3e/registers?tab=opening");
});

test("ENTRY_SELECT actually reads the column the badge depends on", () => {
  // A badge whose column the read never asked for is a badge that never appears. This is the ONE
  // cell binding the face to #656's single hunk in lib/journals/api.ts — #655's file this wave —
  // so a merge that drops that hunk reds here rather than shipping a silent no-op.
  const src = readFileSync(fileURLToPath(new URL("./api.ts", import.meta.url)), "utf8");
  const start = src.indexOf("const ENTRY_SELECT");
  assert.ok(start >= 0, "ENTRY_SELECT must still exist in lib/journals/api.ts");
  const select = src.slice(start, src.indexOf("export async function listJournalEntries"));
  assert.match(select, /is_opening_balance/,
    "ENTRY_SELECT must read is_opening_balance, or the badge can never render");
});
