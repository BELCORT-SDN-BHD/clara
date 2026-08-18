// ExtractionResult — the formalized OCR-read seam (F-A1 design §3.8).
//
// WHAT THIS IS. Wave-F demotes OCR from "the reader of invoice facts" to "the producer of
// COORDINATES AND TEXT" that a witness pair reads over. That demotion needs a NAME for the
// shape the OCR adapters already return, so the witness lane can consume it without importing
// the Azure adapter, and so a second producer (a local OCR, a different vendor) can be written
// against a stated contract instead of by imitation.
//
// THE REFERENCE PRODUCER IS `normalizeAzureLayout` in lib/egress.mjs, and it is deliberately
// NOT moved here (design §3.8: "egress.mjs's normalizeAzureLayout is the reference producer").
// This module TYPES and DOCUMENTS that shape; it does not own it. Everything below was written
// by reading that function's bytes (egress.mjs:113-159) plus the DB writer that consumes it
// (clara.persist_document_extraction, 0007:2190-2192) — never from the design's prose alone.
//
// NOT FROZEN. This is a lib module, outside every workflow's frozen import closure, so a second
// producer or a new accessor is not a workflow-version change (the AB-16 line the whole runtime
// draws between orchestration and reading a page).
//
// ---------------------------------------------------------------------------------------
// THE LOCATOR-KEY DIVERGENCE, STATED HERE BECAUSE IT IS LIVE AND LOAD-BEARING.
//
// `document_regions.locator` is a free jsonb object (0007:209 checks only that it IS an
// object). Two page-key spellings exist in the live estate and NEITHER is wrong-by-contract:
//
//   * `page_number` — what normalizeAzureLayout writes (egress.mjs:122), and what the vendor
//     identity geometry reads (0028:275-276, 0028:306-307, 0030:268-269).
//   * `page`        — what the evidence surfaces read (0011:3736, 0015:2543/2577) and what the
//     F-A1 witness estate reads (0091:150/166, 0095:301/565/605).
//
// So a region produced by the REAL Azure pass carries `page_number` and is invisible to a
// `->>'page'` read. `regionPage()` below reads BOTH — it is the honest accessor for anything
// that merely wants to know which page a region sits on. It is NOT a fix for the DB-side
// readers, which this module cannot reach; the divergence is reported as an F-A1 finding.
// Nothing here silently rewrites a producer's locator to paper over it: a normalizer that
// quietly renamed the key would make the two DB reader families disagree about the same row.
// ---------------------------------------------------------------------------------------

/**
 * @typedef {object} ExtractionRegion
 * @property {string} locator_kind  one of the 0007:207-208 closed set; 'page_polygon' for layout
 * @property {Record<string, unknown>} locator  free jsonb; see the locator-key note above
 * @property {string} field_path    the producer's own path (`pages.1.lines.0`, `tables.0.cells.3`)
 * @property {string} text_content  the region's exact rendering, verbatim from the producer
 * @property {number|null} engine_confidence  producer confidence, or null when it states none
 * @property {string|null} monetary_raw   set only by a SEMANTIC producer; null for layout OCR
 * @property {number|null} monetary_cents set only by a SEMANTIC producer; null for layout OCR
 */

/**
 * @typedef {object} ExtractionResult
 * @property {number} pageCount  pages the producer actually read (>= 1)
 * @property {Record<string, unknown>} envelope  the whole-document blob stored verbatim as
 *   `document_extractions.envelope`; carries at least `content` (the full text) for a layout
 *   producer, plus whatever else that producer states
 * @property {ExtractionRegion[]} regions  per-region geometry + text, in the producer's order
 * @property {string|null} [vendorOpRef]  the vendor's own operation id, when it names one
 */

/** The producer field names an ExtractionResult must carry. Asserted, never assumed. */
export const EXTRACTION_RESULT_KEYS = Object.freeze(["pageCount", "envelope", "regions"]);

/** The region field names `clara.persist_document_extraction` reads (0007:2190-2192). */
export const EXTRACTION_REGION_KEYS = Object.freeze([
  "locator_kind",
  "locator",
  "field_path",
  "text_content",
  "engine_confidence",
  "monetary_raw",
  "monetary_cents",
]);

/**
 * The page a region sits on, or null when the locator states none.
 *
 * Reads BOTH live spellings (see the header): `page` first — the spelling the witness estate
 * and the evidence surfaces publish — then `page_number`, the spelling the Azure producer
 * writes. A non-integer, negative, or absent value is NULL, never a guess: "absence is not
 * evidence" applies to a page number as much as to anything else, and a fabricated page 1 on a
 * multi-page bill would put a citation's highlight on the wrong sheet.
 *
 * @param {Record<string, unknown>|null|undefined} locator
 * @returns {number|null}
 */
export function regionPage(locator) {
  if (!locator || typeof locator !== "object") return null;
  for (const key of ["page", "page_number"]) {
    const raw = /** @type {Record<string, unknown>} */ (locator)[key];
    if (raw == null) continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

/**
 * True when `value` has the ExtractionResult shape. STRUCTURAL only — it judges the container,
 * never the reading: an empty region list from a blank page is a valid result, and this
 * function must not be the thing that decides a document was unreadable.
 * @param {unknown} value
 */
export function isExtractionResult(value) {
  if (!value || typeof value !== "object") return false;
  const r = /** @type {Partial<ExtractionResult>} */ (value);
  if (!Number.isFinite(r.pageCount) || Number(r.pageCount) < 1) return false;
  if (!r.envelope || typeof r.envelope !== "object" || Array.isArray(r.envelope)) return false;
  if (!Array.isArray(r.regions)) return false;
  return r.regions.every(isExtractionRegion);
}

/** True when `value` has the ExtractionRegion shape the DB writer accepts. @param {unknown} value */
export function isExtractionRegion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = /** @type {Partial<ExtractionRegion>} */ (value);
  if (typeof r.locator_kind !== "string" || r.locator_kind === "") return false;
  if (!r.locator || typeof r.locator !== "object" || Array.isArray(r.locator)) return false;
  if (typeof r.field_path !== "string") return false;
  if (typeof r.text_content !== "string") return false;
  return true;
}

/**
 * Assert the shape, with a message that names WHICH key failed. Producers call this at their
 * own boundary so a malformed result dies where it was built, not three layers downstream in a
 * persist that has already spent a vendor call.
 * @param {unknown} value
 * @param {string} [label]
 * @returns {ExtractionResult}
 */
export function assertExtractionResult(value, label = "extraction result") {
  if (!value || typeof value !== "object") throw new TypeError(`${label}: not an object`);
  const r = /** @type {Partial<ExtractionResult>} */ (value);
  if (!Number.isFinite(r.pageCount) || Number(r.pageCount) < 1) {
    throw new TypeError(`${label}: pageCount must be a number >= 1`);
  }
  if (!r.envelope || typeof r.envelope !== "object" || Array.isArray(r.envelope)) {
    throw new TypeError(`${label}: envelope must be an object`);
  }
  if (!Array.isArray(r.regions)) throw new TypeError(`${label}: regions must be an array`);
  for (const [i, region] of r.regions.entries()) {
    if (!isExtractionRegion(region)) throw new TypeError(`${label}: regions[${i}] is malformed`);
  }
  return /** @type {ExtractionResult} */ (value);
}

/**
 * The whole-document text of an ExtractionResult, for a reader that wants prose rather than
 * geometry. Prefers the producer's own `envelope.content` (the ONE string it says is the
 * document); falls back to the regions joined in producer order, which is what a producer that
 * states no `content` has actually given us. Returns '' when there is neither — an empty
 * string a caller can test, never a thrown error, because "this page had no text" is a real
 * and reportable outcome.
 * @param {ExtractionResult} result
 * @returns {string}
 */
export function extractionResultText(result) {
  const content = /** @type {{content?: unknown}} */ (result?.envelope ?? {}).content;
  if (typeof content === "string" && content.length > 0) return content;
  const regions = Array.isArray(result?.regions) ? result.regions : [];
  return regions.map((r) => String(r?.text_content ?? "")).filter(Boolean).join("\n");
}
