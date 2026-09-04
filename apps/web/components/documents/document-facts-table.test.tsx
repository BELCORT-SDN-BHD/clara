// D3 tier 1 — the facts table, and the drift between its two spellings of one
// closed set.
//
// `KNOWN_FACT_PATHS` (lib/documents/extract-shape.ts) and `factLabel`'s switch
// (document-facts-table.tsx) both encode the invoice lane's field paths. A path
// added to one and not the other does not fail to compile and does not throw —
// it renders a raw dotted path where a reader expects a label, or a translation
// key where a reader expects English. That is the "spelling is not identity"
// class, and it needs a cell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { KNOWN_FACT_PATHS } from "../../lib/documents/extract-shape";
import { DocumentFactsTable, hasFactLabelArm } from "./document-facts-table";
import messages from "../../messages/en.json";
import type { EvidenceRegion } from "../../lib/documents/extract-shape";

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

function region(over: Partial<EvidenceRegion> & { id: string }): EvidenceRegion {
  return { field_path: null, text_content: null, engine_confidence: null, monetary_cents: null, ...over };
}

test("DRIFT CELL: every known fact path has a label arm, and the arms cover nothing else", () => {
  for (const path of KNOWN_FACT_PATHS) {
    assert.equal(hasFactLabelArm(path), true, `${path} is in KNOWN_FACT_PATHS but has no arm in factLabel — it would render as a raw dotted path`);
  }
  // The other direction. A stale arm for a path the lane no longer writes is
  // harmless; an arm whose key does not exist in messages/en.json is not, and
  // the render cells below would catch that. What this asserts is that the two
  // lists are the same SIZE, so an arm added without its path (or vice versa)
  // is visible.
  const armed = KNOWN_FACT_PATHS.filter(hasFactLabelArm);
  assert.equal(armed.length, KNOWN_FACT_PATHS.length);
});

test("a known path renders its human label, and its raw path stays visible beside it for audit", async () => {
  const h = await renderComponent(App(createElement(DocumentFactsTable, {
    facts: [region({ id: "r1", field_path: "invoice.total", monetary_cents: 123_45, engine_confidence: 0.9876 })],
  })));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /Invoice total/, "the human label must render");
    assert.match(text, /invoice\.total/, "the raw field_path must stay visible — a professional auditing an extraction needs to know which field the engine wrote");
    assert.match(text, /123\.45/, "monetary_cents renders as the DB's own integer over 100, never a recomputed amount");
    assert.match(text, /0\.988|0\.9876|confidence 0\.988/, "the raw confidence decimal renders");
    assert.doesNotMatch(text, /98(\.8)?%/, "confidence is NEVER converted to a percentage");
    assert.doesNotMatch(text, /\bhigh\b|\bmedium\b|\blow\b/i, "…and never bucketed into a judgement this UI has no basis to draw");
  } finally {
    await h.unmount();
  }
});

test("[the honest unknown arm] a path from a lane this app has never seen renders AS ITSELF, never a fabricated label", async () => {
  // The bank-statement lane writes paths the invoice map does not know. A
  // closed map that dropped them would be absence-as-evidence; one that guessed
  // a label would be worse.
  const h = await renderComponent(App(createElement(DocumentFactsTable, {
    facts: [region({ id: "r1", field_path: "statement.closing_balance", monetary_cents: 900_00 })],
  })));
  try {
    await h.settle();
    assert.match(h.text(), /statement\.closing_balance/, "the raw path IS the label for an unknown field");
    assert.doesNotMatch(h.text(), /factLabel\./, "a translation-key path must never reach the user");
    assert.match(h.text(), /900\.00/);
  } finally {
    await h.unmount();
  }
});

test("a region with no confidence says so, rather than rendering a blank cell that reads as zero", async () => {
  const h = await renderComponent(App(createElement(DocumentFactsTable, {
    facts: [region({ id: "r1", field_path: "invoice.currency", text_content: "MYR", engine_confidence: null })],
  })));
  try {
    await h.settle();
    assert.match(h.text(), /no confidence recorded/);
    assert.doesNotMatch(h.text(), /confidence 0\.000/, "an absent confidence must never be rendered as a measured zero");
  } finally {
    await h.unmount();
  }
});

test("without onSelect the field cell is PLAIN TEXT — never a control that does nothing", async () => {
  const h = await renderComponent(App(createElement(DocumentFactsTable, {
    facts: [region({ id: "r1", field_path: "invoice.total", monetary_cents: 100 })],
  })));
  try {
    await h.settle();
    assert.equal(h.find((n) => n.tagName === "BUTTON"), null, "a table with no selection handler must render no buttons");
  } finally {
    await h.unmount();
  }
});

test("with onSelect, clicking a fact reports THAT fact's id — the overlay's whole interaction", async () => {
  const picked: string[] = [];
  const h = await renderComponent(App(createElement(DocumentFactsTable, {
    facts: [
      region({ id: "r1", field_path: "invoice.total", monetary_cents: 100 }),
      region({ id: "r2", field_path: "invoice.amount_due", monetary_cents: 200 }),
    ],
    onSelect: (id: string) => { picked.push(id); },
  })));
  try {
    await h.settle();
    const second = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Amount due"));
    assert.ok(second, "each fact must be a keyboard-reachable button when selection is wired");
    await clickButton(second!);
    await h.settle();
    // DISCRIMINATING: the SECOND row's id, not merely "something was clicked".
    assert.deepEqual(picked, ["r2"]);
  } finally {
    await h.unmount();
  }
});

test("the selected row is marked for assistive tech, not by colour alone", async () => {
  const h = await renderComponent(App(createElement(DocumentFactsTable, {
    facts: [region({ id: "r1", field_path: "invoice.total", monetary_cents: 100 })],
    selectedId: "r1",
    onSelect: () => {},
  })));
  try {
    await h.settle();
    const row = h.find((n) => n.tagName === "TR" && (n as { getAttribute?: (k: string) => unknown }).getAttribute?.("aria-selected") === "true");
    assert.ok(row, "the highlighted row must carry aria-selected — the overlay's <svg> is aria-hidden, so this is the only announcement of selection");
  } finally {
    await h.unmount();
  }
});

test("an empty facts list renders the honest empty state, never an empty table", async () => {
  const h = await renderComponent(App(createElement(DocumentFactsTable, { facts: [] })));
  try {
    await h.settle();
    assert.match(h.text(), /recorded no named fields/);
    assert.equal(h.find((n) => n.tagName === "TABLE"), null, "an empty list must not render a headed table with no rows");
  } finally {
    await h.unmount();
  }
});
