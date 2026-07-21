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
