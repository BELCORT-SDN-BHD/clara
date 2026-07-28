// SHARED GEOMETRY for the OCR table-cell readers (Wave B R2 · the K-document slice).
//
// WHY A SEAM. Two deterministic readers now consume the `tables.N.cells.M` regions Azure
// produces for a PRINTED accounting document: `prior-gl-cells.mjs` (a general ledger, source
// (c) of the seeding lane) and `opening-tb-cells.mjs` (a trial balance, the `opening_tb.line`
// producer). They ask completely different questions of the page — a ledger is a stream of
// dated transactions under `Code :` block headers; a trial balance is one row per account with
// a Dr and a Cr column — but they recover STRUCTURE from the page in exactly the same way, and
// that recovery is the part that is subtle and measured rather than obvious.
//
// GEOMETRY, NOT READING ORDER. Reading-order text (pdftotext -raw and friends) destroys column
// identity: a Debit and a Credit column collapse into one stream, and a trial balance becomes
// unreadable in the most dangerous way — the numbers survive but the SIDE does not. Azure's
// table cells each carry a `page_polygon`, so the COLUMN a cell belongs to is recoverable from
// its x coordinate, and the ROW from its y. Columns are always LEARNED from the document's own
// header row, never hard-coded, so a different accounting package's column order still works.
//
// LEFT EDGE, and why that is sound even for a right-aligned amount column. These are TABLE
// CELL polygons, not text polygons: Azure's cell bounding region covers the cell RECTANGLE, so
// its left edge is the column's left edge whatever the alignment of the glyphs inside it. The
// measured x-positions in `wave-b-prior-gl-cells.test.mjs` (from RPR's real General Ledger) are
// the calibration behind the default tolerances below.
//
// The tolerances are DEFAULTS, not constants: each reader passes its own so a future divergence
// (a denser trial balance, a wider ledger) is a caller-side change and never a silent shift
// under the other reader.

/** Cells within this many inches of each other vertically belong to the same printed row. */
export const ROW_TOLERANCE = 0.06;
/** A cell is in a column when its left edge is within this of the header's left edge. */
export const COL_TOLERANCE = 0.35;

/** lower-case, single-spaced, trimmed — the shape header synonyms are matched in. */
export const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** One cell's visible text, whitespace-collapsed. Never null — absent reads as "". */
export const cellText = (cell) => String(cell?.text_content ?? "").replace(/\s+/g, " ").trim();

/** Left edge (x) and top edge (y) of a region's page polygon, or null when absent. */
export function anchor(region) {
  const poly = region?.locator?.polygon;
  if (!Array.isArray(poly) || poly.length < 2) return null;
  const x = Number(poly[0]);
  const y = Number(poly[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, page: Number(region?.locator?.page_number) || 0 };
}

/**
 * Group cells into printed rows: by page first, then by vertical proximity. Cells with no
 * usable polygon are dropped (they are not placeable, so they cannot be attributed to a row).
 * @param {Array<object>} cells
 * @param {number} [rowTolerance]
 * @returns {Array<{page:number,y:number,cells:Array<object>}>}
 */
export function groupRows(cells, rowTolerance = ROW_TOLERANCE) {
  const placed = (cells ?? [])
    .map((c) => ({ ...c, at: anchor(c) }))
    .filter((c) => c.at !== null)
    .sort((a, b) => a.at.page - b.at.page || a.at.y - b.at.y || a.at.x - b.at.x);
  const rows = [];
  let current = null;
  for (const cell of placed) {
    if (!current || cell.at.page !== current.page || cell.at.y - current.y > rowTolerance) {
      current = { page: cell.at.page, y: cell.at.y, cells: [] };
      rows.push(current);
    }
    current.cells.push(cell);
  }
  for (const row of rows) row.cells.sort((a, b) => a.at.x - b.at.x);
  return rows;
}

/** The cell whose left edge is nearest a learned column, within tolerance (null when none). */
export function cellAt(row, x, colTolerance = COL_TOLERANCE) {
  if (x === undefined || x === null) return null;
  let best = null;
  let bestDelta = colTolerance;
  for (const cell of row.cells) {
    const delta = Math.abs(cell.at.x - x);
    if (delta <= bestDelta) {
      best = cell;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * The axis-aligned bounding rectangle of a printed row, as a 4-point page polygon in the
 * same [x0,y0,x1,y1,...] order Azure emits. This is the honest anchor for a region DERIVED
 * from a whole row (rather than copied from one cell): it points a reviewer at the printed
 * line the fact was read from, no more and no less.
 * @returns {{page:number, polygon:number[]}|null}
 */
export function rowPolygon(row) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of row?.cells ?? []) {
    const poly = cell?.locator?.polygon;
    if (!Array.isArray(poly)) continue;
    for (let i = 0; i + 1 < poly.length; i += 2) {
      const x = Number(poly[i]);
      const y = Number(poly[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { page: row.page, polygon: [minX, minY, maxX, minY, maxX, maxY, minX, maxY] };
}
