// THE SCROLLABLE TABLE REGION (review-549 item 6, from L13's axe run on the built app).
//
// `components/ui/table.tsx`'s container is `overflow-x-auto`, and the shadcn CLI ships it with
// no `tabIndex`. A scroll container with nothing focusable inside it is unreachable by
// keyboard — axe `scrollable-region-focusable`, SERIOUS — and that is EVERY read-only table in
// this product. A table with a control in a row passes by accident, because the control gives
// the region a tab stop, which is why the class survived until a browser scan found it.
//
// These cells pin the fix at the primitive, where it belongs: one change covers the registers,
// the bank tables, the close plan and the firm activity list at once.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { DataTableCard } from "@/components/common/data-table-card";

/** A PLAIN-TEXT table: no button, no link, no input — the shape that fails the rule. */
function plainRows() {
  return createElement(
    TableBody,
    null,
    createElement(TableRow, null, createElement(TableCell, null, "1500"), createElement(TableCell, null, "Motor vehicles")),
  );
}

function attrsOfContainer(html: string): string {
  const m = /<div[^>]*data-slot="table-container"[^>]*>/.exec(html);
  assert.ok(m, "the scroll container must render");
  return m[0];
}

test("the scroll container is keyboard-reachable — a read-only table can be scrolled without a mouse", () => {
  const html = renderToStaticMarkup(createElement(Table, { "aria-label": "Fixed assets" }, plainRows()));
  const container = attrsOfContainer(html);
  assert.match(container, /overflow-x-auto/, "it really is the scroll container");
  assert.match(container, /tabindex="0"/, "…and it takes a tab stop, which is the whole defect");
});

test("a NAMED table names its region too — an anonymous tab stop is a stop that teaches nothing", () => {
  const html = renderToStaticMarkup(createElement(Table, { "aria-label": "Fixed assets" }, plainRows()));
  const container = attrsOfContainer(html);
  assert.match(container, /role="region"/);
  assert.match(container, /aria-label="Fixed assets"/);
  // The name still reaches the <table> as well — #548's journals cell reads it there, and the
  // region is named AFTER the table it scrolls, which is the pattern, not a duplicate by
  // accident.
  assert.match(html, /<table[^>]*aria-label="Fixed assets"/);
});

test("aria-labelledby is carried the same way, so a caller can point at a heading it already renders", () => {
  const html = renderToStaticMarkup(createElement(Table, { "aria-labelledby": "reg-heading" }, plainRows()));
  const container = attrsOfContainer(html);
  assert.match(container, /role="region"/);
  assert.match(container, /aria-labelledby="reg-heading"/);
});

// MUST-NOT-RED CONTROL, and the reason the `named` branch exists at all: an UNNAMED table
// still gets its tab stop — the keyboard defect is fixed either way — but it must NOT become
// an anonymous landmark. A `region` with no name adds a stop to the landmark list that a
// screen-reader user learns nothing from, and this product renders about twenty of them.
test("an UNNAMED table takes the tab stop but does NOT become an anonymous landmark", () => {
  const html = renderToStaticMarkup(createElement(Table, null, plainRows()));
  const container = attrsOfContainer(html);
  assert.match(container, /tabindex="0"/, "the keyboard fix is unconditional");
  assert.doesNotMatch(container, /role="region"/, "an unnamed region is worse than no region");
  assert.doesNotMatch(container, /aria-label=/, "and nothing is invented to name it");
});

// THE WRAPPER, which is how the read-only tables actually reach the primitive.
test("DataTableCard threads its own label through, so a table presented the read-only way is named", () => {
  // `children` goes in the props object: DataTableCard declares it REQUIRED, and the positional
  // `createElement` overload cannot satisfy a required prop.
  const html = renderToStaticMarkup(
    createElement(DataTableCard, { label: "Bank statements", children: plainRows() }),
  );
  const container = attrsOfContainer(html);
  assert.match(container, /tabindex="0"/);
  assert.match(container, /role="region"/);
  assert.match(container, /aria-label="Bank statements"/);
});
