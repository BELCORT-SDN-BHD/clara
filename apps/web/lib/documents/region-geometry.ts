// D2 — the page-overlay evidence viewer's geometry, as pure functions.
//
// REJECT, NEVER GUESS. This module's whole discipline is the one
// `packages/runtime/lib/invoice-block-geometry.mjs:96-107` already applies at
// the producer: geometry that is missing, short, odd-length or non-finite is
// SKIPPED, and nothing is ever drawn at an assumed position. A polygon drawn in
// the wrong place over a document is worse than no polygon at all — it tells a
// professional that the engine read a number from somewhere it did not.
//
// WHERE THE NUMBERS COME FROM, measured rather than assumed:
//
//  * THE POLYGON. `clara.document_regions.locator` is free jsonb (0007:203-221).
//    The real producer writes `{page, page_number, polygon:[x0,y0,x1,y1,…]}` per
//    Azure Document Intelligence boundingRegion
//    (packages/runtime/lib/egress.mjs:142-146 and :157-163). BOTH page spellings
//    are written, deliberately and permanently — egress.mjs:113-135 is a long
//    note on why — so a reader must accept either. `clara.get_document_extract`
//    returns `locator` verbatim per region (0090:1661).
//
//  * THE PAGE SIZE. The map's own open question said Azure's page width/height/
//    unit are dropped. They are dropped from the LOCATOR, but NOT from the
//    envelope: `normalizeAzureLayout` writes
//    `envelope.pages[] = {page_number, width, height, unit}` (egress.mjs:178).
//    `get_document_extract` returns that envelope as `envelope_text`, so the
//    page box IS reachable — from the envelope, never from the region rows.
//
//  * THE UNIT DOES NOT ENTER THE ARITHMETIC. Azure documents `width`, `height`
//    and `polygon` as being in the SAME unit for a given page ("inch" for PDF,
//    "pixel" for images). The scale this module computes is therefore
//    `renderedPixels / pageWidth` — a pure ratio, correct for both, with no
//    inch-vs-pixel branch to get wrong. `unit` is carried through for display
//    only.
//
// WHEN THE ENVELOPE DOES NOT PARSE (the read budgets `envelope_text` to
// `p_max_chars` and can cut it mid-token) OR CARRIES NO SIZE FOR THAT PAGE,
// there is NO source for the scale and this module returns null. The caller
// renders the page WITHOUT an overlay and says so — it does not fall back to a
// guessed page size.

/** One page's box, as the extraction envelope recorded it. */
export type PageBox = { page: number; width: number; height: number; unit: string | null };

/** Every page box in an extraction envelope, keyed by page number. Returns an
 *  EMPTY map — never a throw and never a fabricated default — when the envelope
 *  is truncated, is not an object, or carries no `pages` array. An empty map is
 *  the honest "no scale source", and the caller's overlay stays off. */
export function pageBoxesFromEnvelope(envelopeText: string): Map<number, PageBox> {
  const out = new Map<number, PageBox>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelopeText);
  } catch {
    return out; // truncated mid-token by p_max_chars — an ordinary outcome
  }
  const pages = (parsed as { pages?: unknown } | null)?.pages;
  if (!Array.isArray(pages)) return out;

  for (const raw of pages) {
    if (typeof raw !== "object" || raw === null) continue;
    const p = raw as Record<string, unknown>;
    const page = Number(p.page_number);
    const width = Number(p.width);
    const height = Number(p.height);
    // A zero or negative page size is not a page size. It would divide the
    // scale to Infinity or flip the drawing, so it is rejected here rather
    // than producing a polygon somewhere off-canvas.
    if (!Number.isFinite(page) || !(width > 0) || !(height > 0)) continue;
    out.set(page, { page, width, height, unit: typeof p.unit === "string" ? p.unit : null });
  }
  return out;
}

/** The page a region's locator names. Accepts BOTH spellings the producer
 *  writes (`page` and `page_number`, egress.mjs:113-135's own note on why both
 *  exist permanently), and returns null when neither is a finite number. */
export function locatorPage(locator: Record<string, unknown> | undefined): number | null {
  if (!locator) return null;
  for (const key of ["page", "page_number"]) {
    const v = locator[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/** One polygon coordinate, or null when the value is not a number.
 *
 *  STRICTER THAN `Number()` ON PURPOSE, and the strictness is the point.
 *  `Number(null)` is 0 and `Number("")` is 0 and `Number(false)` is 0 — so a
 *  locator carrying a NULL coordinate (entirely reachable: `locator` is free
 *  jsonb, checked only for being an object at 0007:209) would coerce to a
 *  corner at the page ORIGIN and draw a polygon stretching to the top-left of
 *  the page. That is the "guessed position" this module exists to refuse, and
 *  it passes a `Number.isFinite` check silently. A numeric STRING is accepted:
 *  jsonb round-trips can deliver one, and it is unambiguous. */
function coordinate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A region's polygon as [x, y] pairs in PAGE UNITS, or null when the geometry
 *  is anything other than a well-formed closed ring of at least three points.
 *
 *  Every rejection below is a real shape reachable from free jsonb: a missing
 *  key, a non-array, an odd length (one coordinate lost), fewer than three
 *  points (a line or a dot is not an area to highlight), and any coordinate
 *  that is not a number — see `coordinate` above for why that last one is not
 *  a plain `Number.isFinite` check. */
export function polygonPoints(locator: Record<string, unknown> | undefined): Array<[number, number]> | null {
  const raw = locator?.polygon;
  if (!Array.isArray(raw)) return null;
  if (raw.length < 6 || raw.length % 2 !== 0) return null;

  const points: Array<[number, number]> = [];
  for (let i = 0; i < raw.length; i += 2) {
    const x = coordinate(raw[i]);
    const y = coordinate(raw[i + 1]);
    if (x === null || y === null) return null;
    points.push([x, y]);
  }
  return points;
}

export type ScaledPolygon = {
  /** An SVG `points` attribute value, in RENDERED PIXELS. */
  points: string;
  /** The rendered-pixel bounding box, so the caller can scroll a highlighted
   *  region into view without re-deriving it. */
  bbox: { x: number; y: number; width: number; height: number };
};

/**
 * Scales one region's polygon from page units into the rendered page's pixel
 * box. Returns null — the region is SKIPPED — when the locator names no page,
 * when the envelope recorded no box for that page, or when the polygon is
 * malformed by `polygonPoints` above.
 *
 * `renderedWidth`/`renderedHeight` are the on-screen size of the page element
 * (a <canvas> for a PDF, an <img> for a raster), measured from the DOM rather
 * than assumed — the layout decides it, and it changes on resize.
 */
export function scaleRegionPolygon(
  locator: Record<string, unknown> | undefined,
  boxes: Map<number, PageBox>,
  renderedWidth: number,
  renderedHeight: number,
): ScaledPolygon | null {
  if (!(renderedWidth > 0) || !(renderedHeight > 0)) return null;

  const page = locatorPage(locator);
  if (page === null) return null;

  const box = boxes.get(page);
  if (!box) return null;

  const points = polygonPoints(locator);
  if (!points) return null;

  const sx = renderedWidth / box.width;
  const sy = renderedHeight / box.height;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const parts: string[] = [];
  for (const [x, y] of points) {
    const px = x * sx;
    const py = y * sy;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    parts.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }

  return {
    points: parts.join(" "),
    bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

/** The MIME types this viewer can render a page for at all.
 *
 *  Deliberately a SUBSET of `bytes.ts`'s `VIEWABLE_IN_NEW_TAB`, not a copy of
 *  it: that set answers "may this be navigated to as a blob"; this one answers
 *  "can this component draw a page". They agree today, and
 *  `region-geometry.test.ts` pins the containment so the pair cannot drift into
 *  a state where this component tries to render something the byte gate refused
 *  to hand it. */
export const RASTER_PAGE_MIMES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp"]);
export const PDF_PAGE_MIME = "application/pdf";

export function canRenderPage(mime: string): boolean {
  return mime === PDF_PAGE_MIME || RASTER_PAGE_MIMES.has(mime);
}
