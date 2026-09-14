// #624 — THE XLSX `r=` ATTRIBUTE IS CLAMPED WHERE THE field_path IS BORN.
//
// THE DEFECT THIS BATTERY EXISTS FOR. `parseXlsx` names every region it emits
// `sheets.<sheetIndex>.<cellRef>`, and `<cellRef>` used to be the workbook's `r=` attribute
// interpolated VERBATIM. An `r=` is whatever the file says it is — `A1:B1` on a merged range,
// `$A$1` from a hand edit, an entity-escaped or wholly junk value. None of those is a legal
// `field_path` under the canonical grammar migration 0191 splices into
// `clara.persist_document_extraction`, so the persist would raise CLR10, roll the whole
// transaction back, and leave the task `running` — and the structured lane would pick the same
// workbook up again, and again, until its attempt cap burned. A validator that refuses a live
// producer's path is an ingest outage, not a wall; the fix therefore belongs in the PRODUCER.
//
// WHAT "FIXED" MEANS HERE, and it is deliberately not "throws". The cell's VALUE is real
// evidence and must still be stored, so a rejected `r=` falls back to a synthetic ordinal and
// the raw attribute is preserved in the region's locator. ONE clean normalisation, no refusal,
// no loop: that is what the cells below pin.
//
// THE FALLBACK SHAPE IS LOAD-BEARING. `cell_<n>` contains an underscore, and an A1 reference
// (letters then digits) never can — so a fallback can never collide with a ref another cell in
// the same sheet legitimately declared. There is no unique index on
// (extraction_id, field_path) (0007), so a collision would not be refused: it would silently
// produce two regions claiming the same cell, and the fact→region link in the workbench would
// have two answers. The previous fallback, `C<n>`, collides with the ordinary address C<n>.
//
// THE LAST CELL IS THE REGIONS/ENVELOPE INVARIANT (0007's document_extractions.envelope vs
// document_regions): every region a structured parse emits must CITE a line/cell/row that the
// envelope it ships alongside actually contains, and cite it uniquely. That is the honest
// invariant between a region row and the source line it names, and the ordinal collision above
// is exactly the thing that breaks it.

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCellRef, valuesFromSheet, sheetCellRegion } from "../lib/structured-worker.mjs";

/** clara._assert_field_path's grammar, transcribed from
 *  packages/db/migrations/0191_document_capability_registry.sql (section S5). If these two ever
 *  disagree the ingest lane is the thing that breaks, so the copy is deliberate and pinned. */
const FIELD_PATH = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$/;
const NAMESPACES = new Set([
  "invoice", "statement", "myinvois", "opening_tb", "prior_gl",
  "pages", "tables", "rows", "sheets", "paragraphs",
]);

function grammarRefusal(path) {
  if (path === null || path === undefined) return null;
  if (path.length === 0 || path.length > 128) return "field_path_length";
  if (!FIELD_PATH.test(path)) return "field_path_syntax";
  if (!NAMESPACES.has(path.split(".")[0])) return "field_path_namespace";
  return null;
}

/** A worksheet XML fragment from a list of `r=` attribute spellings. `null` means the element
 *  carries no `r=` at all, which is legal OOXML and what a minimal writer emits. */
function sheetXml(refs) {
  return `<worksheet><sheetData><row>${refs
    .map((r, i) => `<c${r === null ? "" : ` r="${r}"`}><v>${100 + i}</v></c>`)
    .join("")}</row></sheetData></worksheet>`;
}

// ---------------------------------------------------------------------------------------------
// THE CLAMP ITSELF.
// ---------------------------------------------------------------------------------------------

test("#624 an A1 reference is kept EXACTLY as the workbook wrote it", () => {
  for (const ref of ["A1", "C3", "AA128", "XFD1048576", "z9"]) {
    assert.equal(normalizeCellRef(ref, 7), ref, `${ref} is a legal A1 reference and must survive`);
  }
});

test("#624 every shape an `r=` can take that is NOT an A1 reference falls back to the ordinal", () => {
  const rejected = [
    ["A1:B1", "a merged range"],
    ["$A$1", "an absolute reference from a hand edit"],
    ["Sheet1!A1", "a qualified reference"],
    ["'A1'", "a quoted reference"],
    ["A1 ", "trailing whitespace"],
    ["&amp;", "an entity-escaped value"],
    ["../../etc/passwd", "a traversal shape"],
    ["A", "a column with no row"],
    ["1", "a row with no column"],
    ["ABCD1", "four column letters — beyond XFD"],
    ["A12345678", "eight row digits — beyond 1,048,576"],
    ["x".repeat(200), "an unbounded junk value"],
    [null, "no r= attribute at all"],
    [undefined, "an absent capture"],
    [42, "a non-string"],
  ];
  for (const [raw, why] of rejected) {
    assert.equal(normalizeCellRef(raw, 4), "cell_4", `${why}: ${JSON.stringify(raw)} must not reach a field_path`);
  }
});

test("#624 the fallback shape can never collide with a legal A1 reference", () => {
  // The whole point of the underscore. A1 references are letters-then-digits; `cell_9` is not
  // one, so no workbook can declare a ref equal to a fallback this parser would mint.
  for (let ordinal = 1; ordinal <= 200; ordinal++) {
    const fallback = normalizeCellRef(null, ordinal);
    assert.equal(normalizeCellRef(fallback, 1), "cell_1",
      `${fallback} was accepted as a declared A1 reference — the fallback namespace is not disjoint`);
  }
});

// ---------------------------------------------------------------------------------------------
// THE BOUNDARY — what actually reaches clara.persist_document_extraction.
// ---------------------------------------------------------------------------------------------

test("#624 the BLOCKER: a hostile `r=` yields ONE grammar-valid field_path, not a refusal and not a loop", () => {
  const hostile = ["A1:B1", "$A$1", "Sheet1!A1", "&amp;", null, "x".repeat(200), "A1;drop table clara.documents"];
  const cells = valuesFromSheet(sheetXml(hostile), []);

  assert.equal(cells.length, hostile.length, "every cell must still be read — the VALUE is evidence");

  const refused = [];
  cells.forEach((cell, i) => {
    const region = sheetCellRegion(0, cell);
    const reason = grammarRefusal(region.field_path);
    if (reason) refused.push(`${JSON.stringify(hostile[i])} -> ${JSON.stringify(region.field_path)} (${reason})`);
  });
  assert.deepEqual(refused, [],
    "a field_path clara.persist_document_extraction would refuse with CLR10 — the persist rolls back, the task stays `running`, and the lane retries the same workbook until its attempt cap burns");
});

test("#624 a rejected `r=` is NOT discarded — the locator keeps what the workbook actually claimed", () => {
  const cells = valuesFromSheet(sheetXml(["A1:B1", "B2"]), []);
  const merged = sheetCellRegion(0, cells[0]);
  const plain = sheetCellRegion(0, cells[1]);

  assert.equal(merged.field_path, "sheets.0.cell_1");
  assert.equal(merged.locator.range, "cell_1", "the region is NAMED by the ordinal");
  assert.equal(merged.locator.declared_ref, "A1:B1", "…and the raw attribute is preserved beside it");
  assert.equal(merged.text_content, "100", "the cell's value is stored whatever its ref said");

  assert.equal(plain.field_path, "sheets.0.B2");
  assert.equal(plain.locator.range, "B2");
  assert.ok(!("declared_ref" in plain.locator),
    "an accepted ref is already in `range`; repeating it would be noise");
});

test("#624 the locator_kind and sheet ordinal are unchanged — this fix moves no other contract", () => {
  const region = sheetCellRegion(3, valuesFromSheet(sheetXml(["A1"]), [])[0]);
  assert.equal(region.locator_kind, "sheet_cell_range", "0007's document_regions_locator_kind_check");
  assert.equal(region.locator.sheet, 4, "the locator's sheet is 1-based; the field_path's is 0-based");
  assert.equal(region.field_path, "sheets.3.A1");
  assert.equal(region.engine_confidence, null);
  assert.equal(region.monetary_cents, null);
});

// ---------------------------------------------------------------------------------------------
// THE REGIONS/SOURCE-LINE INVARIANT.
// ---------------------------------------------------------------------------------------------

test("#624 every region cites a cell the envelope actually carries, and cites it UNIQUELY", () => {
  // C3 is declared by the third cell AND is what the old `C<n>` fallback would have minted for
  // the third cell — the exact collision that made two regions claim one cell. Declared-C3 sits
  // at ordinal 1 so the two would have landed on the same field_path.
  const refs = ["C3", null, null, "A1:B1", "A1"];
  const cells = valuesFromSheet(sheetXml(refs), []);
  const regions = cells.map((cell) => sheetCellRegion(0, cell));

  const byRef = new Map(cells.map((c) => [c.ref, c]));
  assert.equal(byRef.size, cells.length, "two cells of one sheet share a ref — the envelope is ambiguous");

  const seen = new Set();
  for (const region of regions) {
    const [ns, sheet, ref] = region.field_path.split(".");
    assert.equal(ns, "sheets");
    assert.equal(sheet, "0");
    assert.ok(byRef.has(ref),
      `${region.field_path} cites a cell the envelope does not contain — a region must resolve to its source line`);
    assert.equal(byRef.get(ref).value, region.text_content,
      `${region.field_path} carries text the cited cell does not`);
    assert.ok(!seen.has(region.field_path),
      `${region.field_path} is emitted twice — two regions claiming one cell, and the workbench's fact→region link then has two answers`);
    seen.add(region.field_path);
  }
  assert.equal(seen.size, refs.length);
});

test("#624 the clamp is bounded work, not a scan: 5,000 cells keep one region each", () => {
  const refs = Array.from({ length: 5_000 }, (_, i) => (i % 3 === 0 ? null : `A${i + 1}`));
  const cells = valuesFromSheet(sheetXml(refs), []);
  const paths = new Set(cells.map((c) => sheetCellRegion(0, c).field_path));
  assert.equal(cells.length, refs.length);
  assert.equal(paths.size, refs.length, "a fallback collided with a declared ref at scale");
});
