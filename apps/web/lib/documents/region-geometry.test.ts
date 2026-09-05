// D2 — the overlay's geometry. REJECT, NEVER GUESS.
//
// Every rejection cell below is a real reachable shape: `locator` is free jsonb
// (0007:209 checks only that it IS an object), so a polygon can be missing, a
// non-array, odd-length, short, or carry a null where a number belongs. A
// polygon drawn at a guessed position over a client's document asserts that the
// engine read a figure from somewhere it did not — worse than drawing nothing.
//
// ONE OF THESE CELLS FOUND A REAL DEFECT IN THE FIRST CUT of the module, and it
// is the reason the coordinate check is by TYPE rather than by
// `Number.isFinite`: `Number(null)`, `Number("")` and `Number(false)` are all
// 0, not NaN, so a null coordinate passed the finite check and put a polygon
// corner at the page origin — a highlight stretching to the top-left of the
// document, drawn confidently, over a client's evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRenderPage,
  locatorPage,
  pageBoxesFromEnvelope,
  polygonPoints,
  scaleRegionPolygon,
  PDF_PAGE_MIME,
  RASTER_PAGE_MIMES,
} from "./region-geometry";
import { VIEWABLE_IN_NEW_TAB } from "./bytes";

const ENVELOPE = JSON.stringify({
  schema_version: 1,
  pages: [
    { page_number: 1, width: 8.5, height: 11, unit: "inch" },
    { page_number: 2, width: 8.5, height: 11, unit: "inch" },
  ],
});

test("page boxes come from the ENVELOPE — the one place the producer keeps width/height", () => {
  // The map's open question said these were dropped. They are dropped from the
  // LOCATOR; `normalizeAzureLayout` writes them into `envelope.pages[]`
  // (egress.mjs:178), and get_document_extract returns that envelope.
  const boxes = pageBoxesFromEnvelope(ENVELOPE);
  assert.equal(boxes.size, 2);
  assert.deepEqual(boxes.get(1), { page: 1, width: 8.5, height: 11, unit: "inch" });
});

test("a TRUNCATED envelope yields no boxes — an empty map, never a throw and never a default page size", () => {
  // p_max_chars cuts the envelope mid-token on any large document. The overlay
  // must then render the page with NO polygons and say so, not scale against an
  // invented 8.5x11.
  assert.equal(pageBoxesFromEnvelope('{"schema_version":1,"pages":[{"page_num').size, 0);
  assert.equal(pageBoxesFromEnvelope("").size, 0);
  assert.equal(pageBoxesFromEnvelope("null").size, 0);
  assert.equal(pageBoxesFromEnvelope('{"pages":"not an array"}').size, 0);
});

test("a zero, negative or non-numeric page size is REJECTED — it would divide the scale to Infinity", () => {
  const bad = JSON.stringify({ pages: [
    { page_number: 1, width: 0, height: 11, unit: "inch" },
    { page_number: 2, width: 8.5, height: -11, unit: "inch" },
    { page_number: 3, width: null, height: 11, unit: "inch" },
    { page_number: 4, width: 8.5, height: 11, unit: "inch" },
  ] });
  const boxes = pageBoxesFromEnvelope(bad);
  assert.deepEqual([...boxes.keys()], [4], "only the well-formed page survives");
});

test("BOTH page spellings are read — the producer writes `page` and `page_number` deliberately and permanently", () => {
  // egress.mjs:113-135's own note: two spellings, each with real readers, and
  // neither is going away. A reader that took only one would silently see no
  // page on half the estate.
  assert.equal(locatorPage({ page: 3, polygon: [] }), 3);
  assert.equal(locatorPage({ page_number: 4, polygon: [] }), 4);
  assert.equal(locatorPage({ page: "5" }), 5, "a jsonb number can arrive as a string");
  assert.equal(locatorPage({}), null);
  assert.equal(locatorPage(undefined), null);
  assert.equal(locatorPage({ page: null }), null);
});

test("polygonPoints accepts a well-formed ring, and a numeric string a jsonb round-trip may deliver", () => {
  assert.deepEqual(polygonPoints({ polygon: [0, 0, 2, 0, 2, 1, 0, 1] }), [[0, 0], [2, 0], [2, 1], [0, 1]]);
  assert.deepEqual(polygonPoints({ polygon: ["0", "0", "2", "0", "2", "1"] }), [[0, 0], [2, 0], [2, 1]]);
});

for (const [label, locator] of [
  ["no polygon key at all", { page: 1 }],
  ["a non-array polygon", { page: 1, polygon: "0,0,1,1" }],
  ["an ODD-length polygon (one coordinate lost)", { page: 1, polygon: [0, 0, 2, 0, 2] }],
  ["fewer than three points (a line is not an area)", { page: 1, polygon: [0, 0, 2, 2] }],
  ["an empty polygon", { page: 1, polygon: [] }],
  // [FOUND BY THIS CELL] A null coordinate does NOT become NaN — `Number(null)`
  // is 0. A plain `Number.isFinite` check therefore ACCEPTED it and drew a
  // polygon corner at the page origin, stretching the highlight to the top-left
  // of the document. `coordinate()` in the module rejects it by TYPE instead.
  ["a null coordinate (Number(null) is 0, not NaN — the trap)", { page: 1, polygon: [0, 0, 2, null, 2, 1] }],
  ["an empty-string coordinate (Number(\"\") is also 0)", { page: 1, polygon: [0, 0, 2, "", 2, 1] }],
  ["a boolean coordinate (Number(false) is 0 too)", { page: 1, polygon: [0, 0, 2, false, 2, 1] }],
  ["a non-numeric string coordinate", { page: 1, polygon: [0, 0, "x", 0, 2, 1] }],
  ["an object coordinate", { page: 1, polygon: [0, 0, { x: 2 }, 0, 2, 1] }],
] as Array<[string, Record<string, unknown>]>) {
  test(`polygonPoints REJECTS ${label} — skipped, never approximated`, () => {
    assert.equal(polygonPoints(locator), null);
  });
}

test("scaleRegionPolygon scales page units into rendered pixels — a pure ratio, no unit branch", () => {
  // Azure documents width/height/polygon as being in the SAME unit per page
  // ("inch" for PDF, "pixel" for images), so the scale is renderedPx/pageWidth
  // and there is no inch-vs-pixel conversion to get wrong.
  const boxes = pageBoxesFromEnvelope(ENVELOPE);
  const scaled = scaleRegionPolygon({ page: 1, polygon: [0, 0, 8.5, 0, 8.5, 11, 0, 11] }, boxes, 850, 1100);
  assert.ok(scaled);
  assert.equal(scaled!.points, "0.00,0.00 850.00,0.00 850.00,1100.00 0.00,1100.00");
  assert.deepEqual(scaled!.bbox, { x: 0, y: 0, width: 850, height: 1100 });
});

test("scaleRegionPolygon returns a correct bounding box for an off-origin region", () => {
  const boxes = pageBoxesFromEnvelope(ENVELOPE);
  const scaled = scaleRegionPolygon({ page: 1, polygon: [1, 2, 2, 2, 2, 3, 1, 3] }, boxes, 850, 1100);
  assert.ok(scaled);
  assert.deepEqual(scaled!.bbox, { x: 100, y: 200, width: 100, height: 100 });
});

test("scaleRegionPolygon REFUSES when there is no scale source — the honest limit, not a guess", () => {
  const boxes = pageBoxesFromEnvelope(ENVELOPE);
  const good = { page: 1, polygon: [0, 0, 1, 0, 1, 1] };

  assert.equal(scaleRegionPolygon(good, boxes, 0, 1100), null, "an unmeasured page element (width 0) draws nothing");
  assert.equal(scaleRegionPolygon(good, boxes, 850, 0), null);
  assert.equal(scaleRegionPolygon({ polygon: [0, 0, 1, 0, 1, 1] }, boxes, 850, 1100), null, "a locator naming no page");
  assert.equal(scaleRegionPolygon({ page: 99, polygon: [0, 0, 1, 0, 1, 1] }, boxes, 850, 1100), null, "a page the envelope never recorded");
  assert.equal(scaleRegionPolygon(good, new Map(), 850, 1100), null, "a truncated envelope's empty box map");
  assert.equal(scaleRegionPolygon({ page: 1, polygon: [0, 0, 1] }, boxes, 850, 1100), null, "malformed geometry");
});

test("VACUITY CONTROL: the same call that returns null above returns a real polygon when the inputs are sound", () => {
  // Without this, every refusal cell above passes identically against a
  // function that returns null unconditionally.
  const boxes = pageBoxesFromEnvelope(ENVELOPE);
  assert.notEqual(scaleRegionPolygon({ page: 1, polygon: [0, 0, 1, 0, 1, 1] }, boxes, 850, 1100), null);
});

test("the renderable-page set is a SUBSET of what the byte gate will hand over (C-07)", () => {
  // Two different questions — "may this be navigated to as a blob" and "can
  // this component draw a page" — but a page renderer for a type the byte gate
  // refuses could never receive bytes, and a widening of one without the other
  // is the drift this cell exists to catch.
  for (const mime of [PDF_PAGE_MIME, ...RASTER_PAGE_MIMES]) {
    assert.equal(VIEWABLE_IN_NEW_TAB.has(mime), true, `${mime} is renderable here but not viewable by lib/documents/bytes.ts`);
    assert.equal(canRenderPage(mime), true);
  }
});

test("canRenderPage refuses every type that has no page to draw", () => {
  for (const mime of [
    "application/xml", "text/csv", "application/x-ofx", "application/octet-stream",
    "image/tiff", "image/heic", "image/svg+xml",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]) {
    assert.equal(canRenderPage(mime), false, `${mime} has no page this component can render`);
  }
});
