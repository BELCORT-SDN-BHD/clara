// CounterpartyPicker render tests (the OpeningItemForm.test.tsx pattern: createElement +
// renderToStaticMarkup, initial render only — no jsdom, no effects, no network).
//
// What the initial render must already get right, before any data arrives:
//   - the field is a SELECT with a create action beside it, not the bare uuid text box it
//     replaces. That box is what made an opening payable unfillable at takeover.
//   - the noun follows the KIND. An `ap_open_item` names a supplier; an `ar_open_item` names
//     a customer. Labelling both "counterparty" is what lets someone attach a vendor to a
//     receivable, and both unique indexes are kind-scoped precisely to keep them apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CounterpartyPicker } from "./CounterpartyPicker";

const render = (kind: "vendor" | "customer") => renderToStaticMarkup(createElement(CounterpartyPicker, {
  token: "jwt", clientId: "c1", kind, value: "", onChange: () => {},
}));

test("the picker renders a SELECT plus a create action — not a uuid text box", () => {
  const html = render("vendor");
  assert.ok(html.includes("<select"), "existing parties are chosen, not typed");
  assert.ok(/New supplier/.test(html), "…and a new one can be created inline");
  assert.ok(!html.includes("counterparty id"), "the raw-uuid field is gone");
});

test("an AP item asks for a SUPPLIER", () => {
  const html = render("vendor");
  assert.ok(html.includes("select a supplier"), "the empty option names the right party kind");
  assert.ok(!/customer/i.test(html), "…and never calls it a customer");
});

test("an AR item asks for a CUSTOMER", () => {
  const html = render("customer");
  assert.ok(html.includes("select a customer"), "the empty option follows the item kind");
  assert.ok(!/supplier/i.test(html), "…and never calls it a supplier");
});

test("the select is labelled for a screen reader, naming the party kind", () => {
  assert.ok(render("vendor").includes('aria-label="Supplier for this open item"'));
  assert.ok(render("customer").includes('aria-label="Customer for this open item"'));
});
