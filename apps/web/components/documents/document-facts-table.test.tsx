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
import { DocumentPageOverlayContent } from "./document-page-overlay";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import type { EvidenceRegion } from "../../lib/documents/extract-shape";
import type { DocumentExtractResult } from "../../lib/documents/types";

// The overlay cell below mounts @base-ui/react-backed primitives; without this
// their floating-ui internals throw "Element is not defined" (test/domInspect.ts).
enableDomInspection();

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

function region(over: Partial<EvidenceRegion> & { id: string }): EvidenceRegion {
  return { field_path: null, text_content: null, engine_confidence: null, monetary_cents: null, ...over };
}

/** One extraction with a real page box and two facts — enough for the overlay to
 *  render its facts table and its selection controls. */
const OVERLAY_FIXTURE = {
  document: {
    id: "doc-1", sha256: "a", original_filename: "invoice.pdf", mime_type: "application/pdf",
    byte_size: 1, bytes_verified_at: null, page_count: 1, extraction_status: "done",
    document_kind: "invoice", financial_date: null,
  },
  unassigned: false,
  filing: null,
  extractions: [{
    id: "ext-1", engine_id: "e", engine_kind: "ocr", version_n: 1, status: "done",
    page_count: 1, extracted_at: "2026-04-01T00:00:00Z",
    envelope_text: JSON.stringify({ pages: [{ page_number: 1, width: 8.5, height: 11, unit: "inch" }] }),
    raw_sha256: null, normalization_version: null,
  }],
  regions: [{
    idx: 0, id: "r-total", extraction_id: "ext-1", engine_kind: "ocr", version_n: 1,
    extracted_at: "2026-04-01T00:00:00Z", locator_kind: "page_polygon",
    locator: { page: 1, polygon: [1, 1, 2, 1, 2, 2, 1, 2] },
    field_path: "invoice.total", text_content: "RM 1.00", engine_confidence: 0.9,
    monetary_raw: "1.00", monetary_cents: 100,
  }],
  max_chars: 20000,
} satisfies DocumentExtractResult;

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

/**
 * Settle until `condition` holds — bounded by PASSES, never by the clock (#706).
 *
 * WHY THE [N1] CELL NEEDED THIS. It drove the overlay with fixed tick counts (`for (i < 4)
 * settle()`, then a single `settle()` after each click) and asserted straight afterwards. That is
 * a guess about how many act()-flushes the overlay's mount chain takes, and the guess is the only
 * thing standing between the cell and a red: it failed once under three-way host load on
 * "control: clicking a fact must select its row", and passed alone every time. Polling the
 * CONDITION removes the guess in both directions — it stops as soon as the state is there, and
 * keeps going when a pass was not enough.
 *
 * Each pass is one macrotask flush, a fixed amount of work, so the bound says nothing about the
 * host's speed: a red here means the state never arrived.
 */
const MAX_SETTLE_PASSES = 200;

async function settleUntil(
  h: { settle: () => Promise<void> },
  condition: () => boolean,
  label: string,
): Promise<void> {
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
    if (condition()) return;
    await h.settle();
  }
  if (condition()) return;
  throw new Error(`${label} never arrived within ${MAX_SETTLE_PASSES} settle passes (a bound on WORK, not on wall-clock time — read a red here as a stall, never as a slow host)`);
}

test("[N1] clearing the highlight passes NULL, and the overlay ends with no row selected", async () => {
  // The overlay's "Clear the highlight" control used to call `onSelect("")`,
  // because the prop was typed `(id: string) => void` and there was no way to
  // say "nothing". An empty string is not an id; it only LOOKED harmless
  // because every real region id is a uuid, so `"" === region.id` happened to
  // be false. The prop is `string | null` now and the caller passes null.
  //
  // Asserted at the OVERLAY, which is the only caller that selects, and by
  // BEHAVIOUR rather than by type: select a fact, clear it, and both the mark
  // and the control go. A fixture with an artificially empty region id would
  // have proved a defect that cannot occur instead of the one that did.
  //
  // THE TWO HALVES DIFFER, and only one of them catches the sentinel. The
  // aria-selected assertion does NOT: `"" === region.id` is false for every
  // real uuid, so the mark clears either way. The CONTROL assertion does: the
  // button renders on `selectedId !== null`, which an empty string satisfies,
  // so the sentinel leaves a "Clear the highlight" button standing over
  // nothing. The mutant panel is what separated them.
  //
  // The byte fetch has no server here, so the page pane renders its honest
  // failure arm — irrelevant to this cell, and itself a state worth mounting.
  const h = await renderComponent(App(createElement(DocumentPageOverlayContent, {
    data: OVERLAY_FIXTURE,
    documentId: "doc-1",
    // EXPLICIT, not omitted (#620): the client scope is a required prop, because an omitted one
    // meant the overlay's byte read was admitted on firm membership alone while the controls
    // beside it required an active filing to this client.
    clientId: "c1111111-1111-4111-8111-111111111111",
    mimeType: "application/pdf",
  })));
  const selectedRow = () =>
    h.find((n) => n.tagName === "TR" && (n as { getAttribute?: (k: string) => unknown }).getAttribute?.("aria-selected") === "true");
  const clearControl = () => h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Clear the highlight"));
  try {
    await settleUntil(
      h,
      () => h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Invoice total")) !== null,
      "the overlay's facts table offering selectable rows",
    );

    const fact = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Invoice total"));
    assert.ok(fact, "the overlay's facts table must offer selectable rows");
    await clickButton(fact!);
    await settleUntil(
      h,
      () => selectedRow() !== null,
      "control: clicking a fact must select its row, or the clear below proves nothing",
    );

    const clear = clearControl();
    assert.ok(clear, "a standing selection must offer a way out of it");
    await clickButton(clear!);
    await settleUntil(h, () => selectedRow() === null, "the row's selection mark clearing");
    assert.equal(selectedRow(), null, "after clearing, no row may remain marked");

    // AND THE CONTROL ITSELF RETIRES. This is the half that discriminates: the
    // clear button renders on `selectedId !== null`, so an empty-string
    // sentinel leaves it standing forever — a control offering to clear a
    // selection that is already gone. The aria half above cannot see the
    // sentinel (no region id is ever ""), but this can.
    await settleUntil(h, () => clearControl() === null, "the clear control retiring with its selection");
    assert.equal(clearControl(), null, "the clear control must retire with the selection it clears");
  } finally {
    await h.unmount();
  }
});

// =============================================================================================
// #646 — THE PER-ROW REVISION CONTROL, and the two reasons a row does not get one.
//
// The affordance is gated TWICE, and both gates are the database's own rather than this table's:
//
//   * BY ROLE. The caller passes `revise` only when `clara.list_source_revisions` answered — and
//     that read holds the SAME bookkeeper floor as `clara.revise_document_fact`. A viewer's read
//     refuses, the caller has no source version to hand over, and NO COLUMN IS RENDERED. An
//     affordance whose door would refuse is worse than no affordance.
//   * BY FIELD. `clara._revisable_invoice_field` is a closed set; a layout fragment or a path from
//     another lane is not in it, so those rows say "Read-only" instead of offering a control that
//     would refuse CLR10 on confirm.
// =============================================================================================

test("646 · no `revise` affordance means the table renders exactly as it did before this ticket", async () => {
  const h = await renderComponent(App(createElement(DocumentFactsTable, {
    facts: [region({ id: "r1", field_path: "invoice.total", monetary_cents: 105000 })],
  })));
  try {
    await h.settle();
    const headers = [] as string[];
    const collect = (n: { tagName?: string; childNodes?: unknown[] }) => {
      if (n.tagName === "TH") headers.push(textOf(n as never));
      for (const c of (n.childNodes ?? []) as { tagName?: string; childNodes?: unknown[] }[]) collect(c);
    };
    collect(h.container as never);
    assert.deepEqual(headers, ["Field", "Value", "Engine confidence"],
      "three columns, no fourth header — a viewer sees the table ticket 624 shipped");
    assert.doesNotMatch(h.text(), /Read-only/, "and no placeholder where a control would have been");
  } finally {
    await h.unmount();
  }
});

test("646 · with the affordance, a revisable path gets a control and an unrevisable one says so", async () => {
  const h = await renderComponent(App(createElement(DocumentFactsTable, {
    facts: [
      region({ id: "r1", field_path: "invoice.total", monetary_cents: 105000 }),
      region({ id: "r2", field_path: "statement.closing_balance", text_content: "RM 12.00" }),
    ],
    revise: { documentId: "d1", factsVersion: 2, busy: false, onRevised: () => {} },
  })));
  try {
    for (let i = 0; i < 4; i++) await h.settle();
    const text = h.text();
    assert.match(text, /Revise/, "the revisable row carries the control");
    assert.match(text, /Read-only/,
      "and the statement-lane path says so rather than offering a control the door would refuse");
    const triggers: unknown[] = [];
    const collect = (n: { tagName?: string; childNodes?: unknown[] }) => {
      if (n.tagName === "BUTTON" && /^Revise$/.test(textOf(n as never))) triggers.push(n);
      for (const c of (n.childNodes ?? []) as { tagName?: string; childNodes?: unknown[] }[]) collect(c);
    };
    collect(h.container as never);
    assert.equal(triggers.length, 1, "exactly one control, on exactly the row the DB admits");
  } finally {
    await h.unmount();
  }
});
