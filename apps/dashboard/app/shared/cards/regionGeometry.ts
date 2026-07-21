// Region-geometry parsing for the doc_review overlay (PIN-ADD-2). The
// get_doc_entry_diff field row carries the region's as-built
// document_regions.locator_kind + locator (verbatim jsonb). We ONLY render an overlay
// we can place HONESTLY: a `page_polygon` locator whose points are normalized 0..1
// (or normalizable via page width/height). Any other locator_kind, a shape we cannot
// safely normalize, or an absent locator returns null — the caller degrades to the
// existing chip + page-jump (no misleading overlay). Pure + fully unit-testable.
// (Named regionGeometry, not regionOverlay, to avoid a case-only clash with the
// RegionOverlay.tsx component under forceConsistentCasingInFileNames.)

export type Pt = { x: number; y: number };
export type ParsedPolygon = { page: number | null; points: Pt[] };

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Accept `[[x,y], …]` or `[{x,y}, …]`; drop non-finite pairs. */
function pickPoints(raw: unknown): Pt[] {
  if (!Array.isArray(raw)) return [];
  const out: Pt[] = [];
  for (const el of raw) {
    if (Array.isArray(el) && el.length >= 2 && typeof el[0] === "number" && typeof el[1] === "number") {
      if (Number.isFinite(el[0]) && Number.isFinite(el[1])) out.push({ x: el[0], y: el[1] });
    } else if (el && typeof el === "object") {
      const o = el as Record<string, unknown>;
      if (typeof o.x === "number" && typeof o.y === "number" && Number.isFinite(o.x) && Number.isFinite(o.y)) {
        out.push({ x: o.x, y: o.y });
      }
    }
  }
  return out;
}

/** Parse a `page_polygon` locator into normalized (0..1) points, or null to degrade. */
export function parsePagePolygon(kind: string | null | undefined, locator: unknown): ParsedPolygon | null {
  if (kind !== "page_polygon" || !locator || typeof locator !== "object") return null;
  const o = locator as Record<string, unknown>;
  const page = typeof o.page === "number" && Number.isFinite(o.page) ? o.page : null;
  const raw = pickPoints(o.polygon ?? o.points ?? o.vertices ?? o.coords);
  if (raw.length < 3) return null; // not a polygon

  const w = typeof o.width === "number" && o.width > 0 ? o.width : null;
  const h = typeof o.height === "number" && o.height > 0 ? o.height : null;
  let pts: Pt[];
  if (w && h) {
    pts = raw.map((p) => ({ x: p.x / w, y: p.y / h }));
  } else if (raw.every((p) => p.x >= 0 && p.x <= 1.0001 && p.y >= 0 && p.y <= 1.0001)) {
    pts = raw;
  } else {
    return null; // pixel coords without page dims — cannot place safely; degrade
  }
  return { page, points: pts.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })) };
}

/** The SVG `points` attribute for a normalized-unit-square viewBox. */
export function polygonPointsAttr(points: Pt[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
