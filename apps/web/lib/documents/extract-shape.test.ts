// D3 — the region partition and the envelope pretty-printer.
//
// The property that matters most here is TOTALITY: `facts` plus every layout
// group must account for every input region, on every fixture, including
// fixtures of `field_path` values this module has never seen. A partition that
// silently drops a row would make the count on screen disagree with the DB's —
// absence presented as evidence, which is exactly the class the map flagged as
// the risk of a closed label map.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_FACT_PATHS,
  isKnownFactPath,
  layoutPageOf,
  partitionRegions,
  prettyEnvelope,
  regionTier,
  type EvidenceRegion,
} from "./extract-shape";

function region(over: Partial<EvidenceRegion> & { id: string }): EvidenceRegion {
  return {
    field_path: null,
    text_content: null,
    engine_confidence: null,
    monetary_cents: null,
    ...over,
  };
}

test("a layout path is LAYOUT even though it is dotted — the producer's own two shapes", () => {
  // egress.mjs:147 and :163 verbatim. Without this arm every OCR line would
  // land in the facts table, which is the surface the tiering exists to unclog.
  assert.equal(regionTier(region({ id: "a", field_path: "pages.1.lines.0" })), "layout");
  assert.equal(regionTier(region({ id: "b", field_path: "tables.0.cells.14" })), "layout");
});

test("the layout patterns are ANCHORED — a fact whose path merely starts with the same word is not swallowed", () => {
  // A `startsWith("pages.")` would put every one of these in the layout tier,
  // where a professional would never find them.
  assert.equal(regionTier(region({ id: "a", field_path: "pages.summary.total" })), "fact");
  assert.equal(regionTier(region({ id: "b", field_path: "pages.1.lines.0.extra" })), "fact");
  assert.equal(regionTier(region({ id: "c", field_path: "tables.0.cells" })), "fact");
});

test("money is ALWAYS a fact, and any other dotted path is too", () => {
  assert.equal(regionTier(region({ id: "a", field_path: "invoice.total", monetary_cents: 12345 })), "fact");
  assert.equal(regionTier(region({ id: "b", field_path: "statement.closing_balance" })), "fact",
    "a lane this app has never seen still produces facts — an unknown path is labelled by itself, never dropped");
  assert.equal(regionTier(region({ id: "c", field_path: null, monetary_cents: 500 })), "fact",
    "a money region with no path at all is still money");
});

test("an unlabelled, money-free fragment is LAYOUT — the honest fall-through", () => {
  assert.equal(regionTier(region({ id: "a", field_path: null, text_content: "SDN BHD" })), "layout");
  assert.equal(regionTier(region({ id: "b", field_path: "vendor" })), "layout",
    "an UNDOTTED path is not a structured fact — it falls through rather than being promoted");
});

test("TOTALITY: every region lands in exactly one tier, on a mixed fixture including unknown paths", () => {
  const regions = [
    region({ id: "1", field_path: "invoice.total", monetary_cents: 100_00 }),
    region({ id: "2", field_path: "pages.1.lines.0", text_content: "INVOICE" }),
    region({ id: "3", field_path: "pages.1.lines.1", text_content: "Acme Sdn Bhd" }),
    region({ id: "4", field_path: "pages.2.lines.0", text_content: "page two" }),
    region({ id: "5", field_path: "tables.0.cells.0", text_content: "Qty" }),
    region({ id: "6", field_path: "statement.closing_balance", monetary_cents: 900_00 }),
    region({ id: "7", field_path: null, text_content: "stray" }),
    region({ id: "8", field_path: "a.brand.new.lane.field" }),
  ];
  const { facts, layout } = partitionRegions(regions);

  const seen = [...facts.map((r) => r.id), ...layout.flatMap((g) => g.regions.map((r) => r.id))].sort();
  assert.deepEqual(seen, ["1", "2", "3", "4", "5", "6", "7", "8"], "every input region must appear exactly once across both tiers");
  assert.equal(
    facts.length + layout.reduce((n, g) => n + g.regions.length, 0),
    regions.length,
    "the counts must add up — a screen that shows fewer rows than the DB holds is absence presented as evidence",
  );
  assert.deepEqual(facts.map((r) => r.id), ["1", "6", "8"]);
});

test("layout groups come out in ascending page order, with the pageless group LAST", () => {
  const regions = [
    region({ id: "cell", field_path: "tables.0.cells.0" }),
    region({ id: "p2", field_path: "pages.2.lines.0" }),
    region({ id: "p1", field_path: "pages.1.lines.0" }),
    region({ id: "loose", field_path: null }),
  ];
  const { layout } = partitionRegions(regions);
  assert.deepEqual(layout.map((g) => g.page), [1, 2, null]);
  assert.deepEqual(layout[2]!.regions.map((r) => r.id), ["cell", "loose"],
    "table cells and unlabelled fragments share the pageless group — never folded into page 1");
});

test("READING ORDER is preserved inside a group — re-sorting would turn a paragraph into a word salad", () => {
  const regions = [
    region({ id: "c", field_path: "pages.1.lines.2", text_content: "third" }),
    region({ id: "a", field_path: "pages.1.lines.0", text_content: "first" }),
    region({ id: "b", field_path: "pages.1.lines.1", text_content: "second" }),
  ];
  // The producer emits in reading order; this module must not re-order, so the
  // group comes out in the order it was GIVEN, not sorted by path.
  const { layout } = partitionRegions(regions);
  assert.deepEqual(layout[0]!.regions.map((r) => r.text_content), ["third", "first", "second"]);
});

test("layoutPageOf reads the page from the path, and refuses to guess one it was not given", () => {
  assert.equal(layoutPageOf(region({ id: "a", field_path: "pages.7.lines.3" })), 7);
  assert.equal(layoutPageOf(region({ id: "b", field_path: "tables.0.cells.0" })), null,
    "a table cell's path carries NO page — the producer writes the table index there, not a page number");
  assert.equal(layoutPageOf(region({ id: "c", field_path: null })), null);
});

test("prettyEnvelope pretty-prints valid JSON", () => {
  const { text, parsed } = prettyEnvelope('{"schema_version":1,"pages":[{"page_number":1}]}');
  assert.equal(parsed, true);
  assert.match(text, /\n {2}"schema_version": 1/);
});

test("[the defect] prettyEnvelope falls back to the VERBATIM string on a budget-truncated envelope", () => {
  // `envelope_text` is `c.envelope::text` cut to p_max_chars (0090:1612-1615),
  // so a large document arrives cut mid-token. A JSON.parse that was allowed to
  // throw would blank the whole panel; asserting "malformed" would be this UI
  // claiming the DB wrote bad JSON when the truncation was its own.
  const truncated = '{"schema_version":1,"content":"a very long OCR conte';
  const { text, parsed } = prettyEnvelope(truncated);
  assert.equal(parsed, false);
  assert.equal(text, truncated, "the reader must still see everything the budget admitted");
});

test("prettyEnvelope's fallback is not vacuous — it reports parsed:true for real JSON and false for the truncation", () => {
  assert.notEqual(prettyEnvelope("{}").parsed, prettyEnvelope("{").parsed);
});

test("the known-fact-path set is the invoice lane's closed set, and the predicate answers BOTH ways", () => {
  assert.deepEqual([...KNOWN_FACT_PATHS].sort(), [
    "invoice.amount_due", "invoice.currency", "invoice.deposit", "invoice.invoice_date",
    "invoice.invoice_id", "invoice.total", "invoice.vendor_name",
  ], "the set is 0009:2069-2071's — widening it needs a label arm in document-facts-table.tsx, which its own test pins");
  assert.equal(isKnownFactPath("invoice.total"), true);
  assert.equal(isKnownFactPath("statement.closing_balance"), false);
  assert.equal(isKnownFactPath(null), false);
});
