// PIN-ADD-2 region-geometry tests: the polygon parser's placeable-only contract, the
// overlay SVG, and the derivation-row affordances — polygon → overlay badge, other/
// absent locator → page-jump only, no_region → the unchanged WA-L7 marker. All pure /
// presentational: renderToStaticMarkup, no token, no byte fetch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePagePolygon, polygonPointsAttr } from "./regionGeometry";
import { RegionOverlay } from "./RegionOverlay";
import { pickDocView } from "./DocViewer";
import { DerivationTable } from "./DerivationTable";
import { extractXmlLeafFields, isXmlMime } from "./xmlFields";
import type { DocEntryField } from "../reviewTypes";

function mkField(p: Partial<DocEntryField>): DocEntryField {
  return {
    field: "invoice.total", doc_value: "1,350.00", doc_region_id: "reg1", doc_page: 2,
    doc_region_locator_kind: null, doc_region_locator: null,
    entry_value: "1,350.00", delta_cents: 0, no_region: false, ...p,
  };
}

// --- parsePagePolygon (placeable-only) -----------------------------------------

test("page_polygon with normalized points parses", () => {
  const parsed = parsePagePolygon("page_polygon", { page: 2, polygon: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.3]] });
  assert.equal(parsed?.page, 2);
  assert.equal(parsed?.points.length, 3);
  assert.deepEqual(parsed?.points[0], { x: 0.1, y: 0.1 });
});
test("page_polygon with pixel points + page dims normalizes", () => {
  const parsed = parsePagePolygon("page_polygon", { page: 1, width: 1000, height: 2000, points: [{ x: 100, y: 200 }, { x: 900, y: 200 }, { x: 900, y: 600 }] });
  assert.deepEqual(parsed?.points[0], { x: 0.1, y: 0.1 });
  assert.deepEqual(parsed?.points[1], { x: 0.9, y: 0.1 });
});
test("page_polygon with pixel points but NO dims is not placeable → null (degrade)", () => {
  assert.equal(parsePagePolygon("page_polygon", { polygon: [[100, 200], [900, 200], [900, 600]] }), null);
});
test("non-polygon locator kinds and absent/short locators → null", () => {
  assert.equal(parsePagePolygon("row_col", { row: 3, col: 2 }), null);
  assert.equal(parsePagePolygon("sheet_cell_range", { a1: "B2:C4" }), null);
  assert.equal(parsePagePolygon("page_polygon", { polygon: [[0.1, 0.1]] }), null); // < 3 points
  assert.equal(parsePagePolygon(null, null), null);
  assert.equal(parsePagePolygon("page_polygon", "not-an-object"), null);
});
test("polygonPointsAttr formats the SVG points attribute", () => {
  assert.equal(polygonPointsAttr([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]), "0.1,0.2 0.3,0.4");
});

// --- RegionOverlay (presentational) --------------------------------------------

test("RegionOverlay renders an svg polygon; too few points renders nothing", () => {
  const html = renderToStaticMarkup(createElement(RegionOverlay, { points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.3 }] }));
  assert.ok(html.includes("<svg"), "expected an svg");
  assert.ok(html.includes("<polygon"), "expected a polygon");
  assert.equal(renderToStaticMarkup(createElement(RegionOverlay, { points: [{ x: 0.1, y: 0.1 }] })), "");
});

// --- DerivationTable affordances -----------------------------------------------

function renderRows(fields: DocEntryField[]): string {
  return renderToStaticMarkup(createElement(DerivationTable, { fields, activeIndex: null, onPickRegion: () => {} }));
}

test("a page_polygon field shows the polygon overlay badge", () => {
  const html = renderRows([mkField({ doc_region_locator_kind: "page_polygon", doc_region_locator: { page: 2, polygon: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.3]] } })]);
  assert.ok(html.includes(">polygon<"), "expected the polygon badge");
  assert.ok(html.includes("<button"), "polygon field is still a page-jump button");
});
test("a region field WITHOUT a placeable polygon keeps page-jump only (no badge)", () => {
  const html = renderRows([mkField({ doc_region_locator_kind: "row_col", doc_region_locator: { row: 1, col: 1 } })]);
  assert.ok(html.includes("<button"), "expected the page-jump button");
  assert.ok(!html.includes(">polygon<"), "no polygon badge without a placeable page_polygon");
});
test("a region field with ABSENT locator degrades to today's page-jump (no badge)", () => {
  const html = renderRows([mkField({ doc_region_locator_kind: null, doc_region_locator: null })]);
  assert.ok(html.includes("<button"), "expected the page-jump button");
  assert.ok(!html.includes(">polygon<"), "no badge when the envelope predates the locator fields");
});
test("a no_region field renders the WA-L7 marker unchanged, no button", () => {
  const html = renderRows([mkField({ no_region: true, doc_region_id: null, doc_page: null, doc_value: null })]);
  assert.ok(html.includes("no captured region — verify against the document"), "expected the WA-L7 marker");
  assert.ok(!html.includes("<button"), "no region → no page-jump button");
});

// --- pickDocView (honest degradation between image / pdf-canvas / object) --------

test("an image always uses the aligned-overlay image view", () => {
  assert.equal(pickDocView({ mime: "image/png", hasOverlay: true, pdfFailed: false }), "image");
  assert.equal(pickDocView({ mime: "image/jpeg", hasOverlay: false, pdfFailed: false }), "image");
});
test("a PDF WITH a placeable region renders the cited page on a pdf.js canvas", () => {
  assert.equal(pickDocView({ mime: "application/pdf", hasOverlay: true, pdfFailed: false }), "pdf-canvas");
});
test("a PDF WITHOUT a region falls back to the inert object viewer (page-jump)", () => {
  assert.equal(pickDocView({ mime: "application/pdf", hasOverlay: false, pdfFailed: false }), "object");
});
test("a PDF whose pdf.js render FAILED degrades to the object viewer — never a blank pane", () => {
  assert.equal(pickDocView({ mime: "application/pdf", hasOverlay: true, pdfFailed: true }), "object");
});
test("an unknown type falls back to the object viewer", () => {
  assert.equal(pickDocView({ mime: "application/octet-stream", hasOverlay: true, pdfFailed: false }), "object");
});

// --- pickDocView XML branch (Wave-A2 §7: e_invoice_xml structured view) ----------

test("an XML e-invoice routes to the structured xml view — never a canvas or overlay", () => {
  assert.equal(pickDocView({ mime: "application/xml", hasOverlay: false, pdfFailed: false }), "xml");
  assert.equal(pickDocView({ mime: "text/xml", hasOverlay: false, pdfFailed: false }), "xml");
  // A charset parameter still routes (isXmlMime strips it, mirroring intake canonicalization).
  assert.equal(pickDocView({ mime: "application/xml; charset=utf-8", hasOverlay: true, pdfFailed: false }), "xml");
});
test("a scriptable *+xml type is NOT the xml view — it falls through to the inert object viewer (FIX-10 narrowing)", () => {
  // application/xhtml+xml / any `*+xml` can carry active markup — it must never reach the
  // raw-XML render path; the intake allowlist admits only application/xml + text/xml.
  assert.equal(pickDocView({ mime: "application/xhtml+xml", hasOverlay: false, pdfFailed: false }), "object");
  assert.equal(pickDocView({ mime: "application/ubl+xml", hasOverlay: true, pdfFailed: false }), "object");
});
test("an SVG image stays an image (image-first ordering wins over any xml match)", () => {
  assert.equal(pickDocView({ mime: "image/svg+xml", hasOverlay: false, pdfFailed: false }), "image");
});

// --- xmlFields (presentational leaf reader; no DOMParser, node-pure) --------------

const UBL_SAMPLE = `<?xml version="1.0"?>
<Invoice xmlns:cbc="urn:oasis">
  <cbc:ID>INV-001</cbc:ID>
  <cbc:IssueDate>2025-04-30</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <AccountingSupplierParty><Party><PartyName><cbc:Name>ROME PROPERTIES</cbc:Name></PartyName></Party></AccountingSupplierParty>
  <cbc:PayableAmount>1000.00</cbc:PayableAmount>
  <ds:SignatureValue>AAAABBBBCCCCDDDD</ds:SignatureValue>
  <cbc:Empty>   </cbc:Empty>
</Invoice>`;

test("extractXmlLeafFields reads local leaf names + values, strips namespaces", () => {
  const fields = extractXmlLeafFields(UBL_SAMPLE);
  const byPath = Object.fromEntries(fields.map((f) => [f.path, f.value]));
  assert.equal(byPath.ID, "INV-001");
  assert.equal(byPath.IssueDate, "2025-04-30");
  assert.equal(byPath.Name, "ROME PROPERTIES");
  assert.equal(byPath.PayableAmount, "1000.00");
});
test("extractXmlLeafFields drops signature noise + empty leaves, marks every field no_region", () => {
  const fields = extractXmlLeafFields(UBL_SAMPLE);
  assert.ok(!fields.some((f) => f.path === "SignatureValue"), "signature block must be dropped");
  assert.ok(!fields.some((f) => f.path === "Empty"), "whitespace-only leaf must be dropped");
  assert.ok(fields.every((f) => f.no_region === true), "every XML fact has no page geometry");
});
test("extractXmlLeafFields decodes entities and is empty-safe", () => {
  assert.deepEqual(extractXmlLeafFields(""), []);
  const f = extractXmlLeafFields("<a>D &amp; D &lt;PROPERTIES&gt;</a>");
  assert.equal(f[0]?.value, "D & D <PROPERTIES>");
});
test("isXmlMime matches ONLY exact application/xml + text/xml (not scriptable *+xml)", () => {
  assert.ok(isXmlMime("application/xml"));
  assert.ok(isXmlMime("text/xml"));
  assert.ok(isXmlMime("application/xml; charset=utf-8"), "a charset param is stripped before matching");
  assert.ok(isXmlMime("TEXT/XML"), "case-insensitive");
  assert.ok(!isXmlMime("application/ubl+xml"), "a *+xml suffix is NOT admitted (could be scriptable)");
  assert.ok(!isXmlMime("application/xhtml+xml"));
  assert.ok(!isXmlMime("image/svg+xml"));
  assert.ok(!isXmlMime("application/pdf"));
  assert.ok(!isXmlMime("image/png"));
});

// --- xmlFields dedup key (FIX-11: a text-safe JSON.stringify key, never a NUL byte) ----

test("extractXmlLeafFields dedupes identical path+value pairs but keeps distinct ones", () => {
  // Same local name, SAME value → one row (deduped). Same local name, DIFFERENT value →
  // two rows (the [local, value] key is collision-free without any control-char separator).
  const dup = extractXmlLeafFields("<Amt>100.00</Amt><x:Amt>100.00</x:Amt><y:Amt>250.00</y:Amt>");
  const amts = dup.filter((f) => f.path === "Amt").map((f) => f.value).sort();
  assert.deepEqual(amts, ["100.00", "250.00"], "identical pairs collapse; distinct values are both kept");
});
test("extractXmlLeafFields output carries no NUL byte (the dedup key never leaks into a row)", () => {
  const NUL = String.fromCharCode(0); // constructed at runtime — never a literal control char in source
  const fields = extractXmlLeafFields(UBL_SAMPLE);
  assert.ok(fields.length > 0, "sanity: the sample yields rows");
  assert.ok(fields.every((f) => !f.path.includes(NUL) && !f.value.includes(NUL)), "no field path/value carries a NUL");
});
