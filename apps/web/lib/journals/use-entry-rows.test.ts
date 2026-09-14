// #746 — THE MEMO ACTUALLY HOLDS.
//
// The defect this pins closed is invisible in output: `buildEntryRows` is pure, so a memo that
// recomputes produces an EQUAL row model and nothing on screen differs. The only observable is
// IDENTITY, and only across a re-render with the same props — which is why every cell below
// compares references (`assert.equal`, not `deepEqual`) after `rerender()`, and why the mechanism
// had to move out of the component body to be reachable at all (use-entry-rows.ts's own header).

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHook } from "../../test/hookHarness";
import { useEntryRows } from "./use-entry-rows";
import { NO_ENTRY_LINKS } from "./entries-table";
import type { JournalEntryRow, JournalLineRow } from "./types";
import type { EntryLinkRow } from "../work/evidence";

const ENTRY: JournalEntryRow = {
  id: "a0000000-0000-4000-8000-000000000000", client_id: "c1", status: "approved",
  posting_date: "2026-04-01", memo: "RENT", origin: "manual", document_id: null, coding_kind: null,
  revision_token: "rev-1", maker_actor: null, checker_actor: null, approved_at: null,
  reversal_of: null, reversed_by: null, reversal_reason: null, withdrawn_at: null,
  withdrawal_reason: null, created_at: "2026-04-01T00:00:00Z",
};

const LINE: JournalLineRow = {
  id: "l1", entry_id: ENTRY.id, line_no: 1, account_code: "1000",
  debit_cents: 1_000, credit_cents: 0, description: null, counterparty_id: null,
};

const ENTRIES = [ENTRY];
const LINES = [LINE];

test("#746: with NO links prop, the row model keeps its identity across a re-render", async () => {
  // The regression shape exactly: the caller passes `undefined` (it has no links read), which is
  // where `links = []` used to mint a fresh array into the dependency list on every render.
  const harness = await renderHook(() => useEntryRows(ENTRIES, LINES, undefined));
  try {
    const first = harness.current;
    assert.equal(first.length, 1);
    await harness.rerender();
    assert.equal(harness.current, first, "the memo recomputed for a dependency nothing changed");
  } finally {
    await harness.unmount();
  }
});

test("#746: the same holds when the caller passes its own stable links array", async () => {
  const links: readonly EntryLinkRow[] = [];
  const harness = await renderHook(() => useEntryRows(ENTRIES, LINES, links));
  try {
    const first = harness.current;
    await harness.rerender();
    assert.equal(harness.current, first);
  } finally {
    await harness.unmount();
  }
});

test("#746: a genuinely NEW links array still recomputes — the fix is identity, not caching", async () => {
  let links: readonly EntryLinkRow[] | undefined = undefined;
  const harness = await renderHook(() => useEntryRows(ENTRIES, LINES, links));
  try {
    const first = harness.current;
    links = [
      {
        entry_id: ENTRY.id, status: "approved", origin: "manual", work_id: "w1", receipt_id: "r1",
        logical_op_id: null, purpose: null, basis_origin: null,
        initiated_by: null, initiated_by_role: null, responsible: null,
        document_id: null, document_source: null, attached_at: null, released_at: null,
        reversal_of: null, reversed_by: null, reversal_reason: null,
      },
    ];
    await harness.rerender();
    assert.notEqual(harness.current, first);
    assert.equal(harness.current[0]?.link?.work_id, "w1");
  } finally {
    await harness.unmount();
  }
});

test("#746: the shared empty default is frozen, so no caller can mutate everyone else's", () => {
  assert.ok(Object.isFrozen(NO_ENTRY_LINKS));
  assert.equal(NO_ENTRY_LINKS.length, 0);
});
