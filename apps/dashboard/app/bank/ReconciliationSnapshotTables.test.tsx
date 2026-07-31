// [F15/CX6#4 fix] SnapshotTables render-branch tests (the ReconciliationPanel.
// test.tsx pattern: createElement + renderToStaticMarkup, no jsdom). Pins the
// fix's SECOND half — shapeOk===false must return the unavailable state
// UNCONDITIONALLY, not only when every mapped array happens to be empty. The
// FIRST half (the exact allowlist itself) is covered in reconModel.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SnapshotTables } from "./ReconciliationSnapshotTables";
import { toSnapshot } from "./reconSnapshotModel";

function render(snapshotRaw: unknown): string {
  return renderToStaticMarkup(createElement(SnapshotTables, { snapshot: toSnapshot(snapshotRaw) }));
}

test("[F15/CX6#4 fix] SnapshotTables returns the unavailable state whenever shapeOk===false, EVEN WITH a non-empty mapped collection in hand", () => {
  const html = render({
    outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [],
    // `exceptions` carries a REAL row — the old code only fell back to
    // shapeOk when every mapped array was empty, so this row would have
    // rendered partially despite the unknown collection below.
    exceptions: [{ exception_id: "exc1", line_id: "l1", kind: "bank_error", status: "open" }],
    bank_uncleared_opening: [],
    outstanding_adjustments: [{ surprise: true }], // a FUTURE, unmapped collection
  });
  assert.ok(html.includes("unexpected shape"), "the fail-closed message must render");
  assert.ok(!html.includes("Exceptions (1)"), "the exception section must NEVER render partially under an unknown-shape snapshot");
  assert.ok(!html.includes(">Nothing outstanding"), "shapeOk=false must never render the genuinely-empty state's own message either");
});

test("SnapshotTables still renders that same exception normally when the shape is otherwise genuinely well-formed (the differentiator for the test above)", () => {
  const html = render({
    outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [],
    exceptions: [{ exception_id: "exc1", line_id: "l1", kind: "bank_error", status: "open" }],
    bank_uncleared_opening: [],
  });
  assert.ok(html.includes("Exceptions (1)"), "a genuinely well-formed shape renders the exception normally");
});

test("SnapshotTables still renders the genuinely clean-period message when shapeOk=true and every collection is empty", () => {
  const html = render({
    outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [],
    exceptions: [], bank_uncleared_opening: [],
  });
  assert.ok(html.includes("a clean period"));
});

test("SnapshotTables still returns unavailable when a KNOWN collection is simply missing (the original [D7] fail-closed law, unchanged)", () => {
  const html = render({ outstanding_entry_sides: [] });
  assert.ok(html.includes("unexpected shape"));
});
