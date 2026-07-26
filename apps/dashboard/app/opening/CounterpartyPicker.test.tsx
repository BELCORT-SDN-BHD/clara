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

// ---------------------------------------------------------------------------
// Found on the live Gate-K run (2026-07-26): the opening page rendered TWO inputs both
// labelled "Amount in cents" — one on the keyed trial-balance-target form, one on the
// opening-item form. A sighted user has the section headings to tell them apart; a screen
// reader announces the same name twice with nothing to distinguish them (WCAG 1.3.1).
// Pinned here because the two forms live in different files, so nothing else would notice
// them colliding again.
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("no two inputs on the opening page share an aria-label", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const seen = new Map<string, string[]>();
  for (const f of ["OpeningItemForm.tsx", "OpeningTargets.tsx", "OpeningCeremony.tsx",
                   "SeedWorkbench.tsx", "CounterpartyPicker.tsx"]) {
    const src = readFileSync(join(here, f), "utf8");
    for (const m of src.matchAll(/aria-label="([^"]+)"/g)) {
      const label = m[1];
      if (!label) continue;
      const at = seen.get(label) ?? [];
      at.push(f);
      seen.set(label, at);
    }
  }
  const dupes = [...seen.entries()].filter(([, files]) => files.length > 1);
  assert.deepEqual(dupes, [],
    `these aria-labels appear on more than one control: ${dupes.map(([l, f]) => `${l} (${f.join(", ")})`).join("; ")}`);
});
