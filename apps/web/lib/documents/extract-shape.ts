// D3 — the shape of an extraction, as the human needs to read it.
//
// `clara.get_document_extract` hands back two things that were both being
// rendered raw: the extraction ENVELOPE (`c.envelope::text`, budgeted to
// `p_max_chars` = 20000, so up to 20k characters of JSON in a <pre>) and a flat
// list of REGIONS rendered as a two-column <dl> with `truncate`. The OCR
// producer emits one region PER LINE and per table cell
// (packages/runtime/lib/egress.mjs:142-165), so a one-page invoice is
// dozens-to-hundreds of truncated rows with no grouping and no ordering that
// means anything to a reader.
//
// This module does the one thing the renderers cannot do honestly by
// themselves: it PARTITIONS the regions. The partition is TOTAL — every region
// lands in exactly one tier, and the fall-through tier is the honest one, not
// the dropped one. That is deliberate: a closed label map that silently
// discarded an unrecognised `field_path` would be an absence-as-evidence bug (a
// bank-statement lane writes different paths than the invoice lane), and the
// count on screen would quietly disagree with the DB's.

/** The structural subset both region shapes share. `RegionRow` (the detail
 *  panel's own read, types.ts:90) and `DocumentExtractRegion` (the extract
 *  read, types.ts:207) differ in what ELSE they carry — the extract read alone
 *  returns `locator`, which is why the page-overlay viewer drives off it — but
 *  they agree on every field a fact or a line of layout text needs. Typing on
 *  the subset is what lets ONE renderer serve both, closing the two
 *  near-identical RegionRowView/RegionEntry copies that used to live in
 *  document-evidence.tsx and document-extract-panel.tsx. */
export type EvidenceRegion = {
  id: string;
  field_path: string | null;
  text_content: string | null;
  engine_confidence: number | null;
  monetary_cents: number | null;
};

/** The OCR producer's own two layout `field_path` shapes, verbatim from
 *  packages/runtime/lib/egress.mjs:
 *    `pages.${pageNumber}.lines.${index}`   (egress.mjs:147)
 *    `tables.${tableIndex}.cells.${cellIndex}` (egress.mjs:163)
 *  Matched as anchored patterns, not by a `startsWith("pages.")` — a FACT whose
 *  path merely began with the same word would otherwise be swallowed into the
 *  layout tier and vanish from the facts table. */
const LAYOUT_LINE = /^pages\.(\d+)\.lines\.\d+$/;
const LAYOUT_CELL = /^tables\.(\d+)\.cells\.\d+$/;

export type RegionTier = "fact" | "layout";

/**
 * Which tier a region belongs to. Evaluated in this order, and the order is the
 * whole design:
 *
 *  1. A layout path (the two shapes above) is LAYOUT — even though it is
 *     dotted, and even in the impossible case that it carried a money value.
 *  2. Anything carrying `monetary_cents` is a FACT. Money is the thing a
 *     professional came to check; it never hides inside a collapsed section.
 *  3. Any other DOTTED path is a FACT, whatever the lane wrote it. An
 *     unrecognised path is still a fact — it is labelled by its own raw path
 *     rather than dropped or given an invented name.
 *  4. Everything else (no path, no money — an unlabelled OCR fragment) is
 *     LAYOUT. It is text off the page, and that is what the layout tier is.
 */
export function regionTier(region: EvidenceRegion): RegionTier {
  const path = region.field_path;
  if (path !== null && (LAYOUT_LINE.test(path) || LAYOUT_CELL.test(path))) return "layout";
  if (region.monetary_cents !== null) return "fact";
  if (path !== null && path.includes(".")) return "fact";
  return "layout";
}

/** The page a layout region belongs to, taken from its own `field_path`, or
 *  `null` when the path carries no page (a table cell, or an unlabelled
 *  fragment). NEVER guessed from position in the list: the producer emits
 *  table cells after every page's lines, so an index-derived page would be
 *  confidently wrong for exactly the rows a reader would check. */
export function layoutPageOf(region: EvidenceRegion): number | null {
  const path = region.field_path;
  if (path === null) return null;
  const m = LAYOUT_LINE.exec(path);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export type LayoutGroup<T> = {
  /** `null` groups the rows whose page the producer did not write — table cells
   *  and unlabelled fragments. Rendered under its own honest heading, never
   *  folded into page 1. */
  page: number | null;
  regions: T[];
};

export type PartitionedRegions<T> = {
  facts: T[];
  layout: LayoutGroup<T>[];
};

/**
 * Splits a region list into the facts tier and the page-grouped layout tier.
 *
 * ORDER IS PRESERVED WITHIN EVERY GROUP — the producer emits lines in reading
 * order (egress.mjs walks `page.lines` in order), and re-sorting them would
 * turn a readable paragraph into a word salad. Groups themselves come out in
 * ascending page order with the pageless group LAST.
 *
 * TOTALITY IS THE CONTRACT: `facts.length + every group's length` equals the
 * input length, always. `extract-shape.test.ts` asserts it on every fixture,
 * including a fixture of paths this module has never seen.
 */
export function partitionRegions<T extends EvidenceRegion>(regions: readonly T[]): PartitionedRegions<T> {
  const facts: T[] = [];
  const byPage = new Map<number | null, T[]>();

  for (const region of regions) {
    if (regionTier(region) === "fact") {
      facts.push(region);
      continue;
    }
    const page = layoutPageOf(region);
    const bucket = byPage.get(page);
    if (bucket) bucket.push(region);
    else byPage.set(page, [region]);
  }

  const layout = [...byPage.entries()]
    .map(([page, rows]) => ({ page, regions: rows }))
    .sort((a, b) => {
      if (a.page === b.page) return 0;
      if (a.page === null) return 1; // the pageless group goes last
      if (b.page === null) return -1;
      return a.page - b.page;
    });

  return { facts, layout };
}

/** The closed set of `field_path` values the invoice-facts lane writes
 *  (packages/db/migrations/0009:2069-2071). A path IN this set gets a real
 *  human label from next-intl; a path OUTSIDE it renders as its own raw dotted
 *  path — auditable, and never a fabricated name for a field this app has
 *  never seen. The CALLER does the lookup (the strings live in messages/), so
 *  this module stays free of presentation. */
export const KNOWN_FACT_PATHS: readonly string[] = [
  "invoice.total",
  "invoice.amount_due",
  "invoice.currency",
  "invoice.vendor_name",
  "invoice.invoice_id",
  "invoice.invoice_date",
  "invoice.deposit",
];

export function isKnownFactPath(path: string | null): boolean {
  return path !== null && KNOWN_FACT_PATHS.includes(path);
}

/**
 * The raw extraction envelope, pretty-printed — or the verbatim string when it
 * cannot be parsed.
 *
 * THE PARSE MUST BE ALLOWED TO FAIL. `envelope_text` is `c.envelope::text` cut
 * to `p_max_chars` characters by the read itself, so a large envelope arrives
 * TRUNCATED MID-TOKEN and `JSON.parse` throws on a perfectly ordinary document.
 * Falling back to the raw text is the honest outcome — the reader still sees
 * everything the budget admitted. Returning an error message instead would be
 * this UI asserting the envelope is malformed when the truncation was its own.
 */
export function prettyEnvelope(envelopeText: string): { text: string; parsed: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(envelopeText), null, 2), parsed: true };
  } catch {
    return { text: envelopeText, parsed: false };
  }
}
