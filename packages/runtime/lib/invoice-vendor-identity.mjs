// X6 — the deterministic vendor-identity reader (extraction slice §2 X6 / ADR-047 Q3).
//
// WHY THIS EXISTS, measured rather than assumed (`docs/plan/research/extraction-slice/
// x6-diagnosis-2026-07-27.md`). On the Gate-P vehicle the auto-draft lane cannot resolve the
// supplier, and the reason is NOT a defect in `_resolve_counterparty`: it is that the
// extraction hands resolution nothing to resolve with. Azure typed no `VendorTaxId` at all on
// that layout, and typed `VendorName` came back as the OCR garbage `"CONSULTANCY\nrightpath"`
// at confidence 0.922 — while `Company No. 202401047756 (1593602-X)` sits cleanly OCR'd in the
// letterhead of BOTH pages. Stripped of separators and lowercased, that reads
// `2024010477561593602x` — byte-for-byte the registry's `registration_normalized`. The
// identity was on the page the whole time; nothing was reading it.
//
// Name-only matching against a REGISTERED counterparty is exactly what CLR23 doctrine refuses,
// and refuses correctly — the R2 ceremony proved that refusal against 6 of 12 ticks. So the
// fix is not to loosen resolution; it is to supply the registration the document prints.
//
// SAME-LINE, unlike the totals reader. Measured: a letterhead prints its label and number on
// ONE line (`Company No. 202401047756 (1593602-X)`), where a totals block splits label and
// amount into two. A split-line registration is therefore out of scope for v1 and counted as
// absent rather than guessed at.
//
// THE HAZARD THIS MODULE IS SHAPED AROUND: emitting the BUYER's registration as the vendor's.
// That is not a missing fact but a WRONG identity — it resolves the counterparty to the wrong
// party, and every downstream coding decision inherits the error. A missing registration
// merely returns the lane to where it already is. FOUR independent defenses, all required,
// and they COMPOSE — none is ever silently skipped when its input is unavailable:
//
//   (a) UNIQUENESS-OR-NOTHING over the WHOLE document. Two DISTINCT registration-shaped
//       candidates anywhere ⇒ emit nothing. Identical candidates collapse, which is the
//       measured two-page letterhead case (the same line on page 1 and page 2).
//   (b) THE TOP BAND. A letterhead sits at the top of its page by convention; a bill-to block
//       does not. Measured at y≈0.88 of an 11.68in page — comfortably inside the default 25%.
//       An opt, like every other threshold here, so it can be re-measured rather than argued.
//       A page whose height is missing or unusable cannot be banded, so its candidates are
//       REFUSED — the wall never becomes a no-op just because its input went missing. (The
//       X2 reader's `pixel:no-width` page refusal is the same shape and the right one.)
//   (c) VENDOR-BLOCK ATTRIBUTION, and this is the one that makes the emission EVIDENCED
//       rather than merely positional. Uniqueness and the band both pass a document whose
//       ONLY registration is the buyer's — a compact invoice with a bill-to block near the
//       top has exactly that shape, and it resolves to the wrong party. So a candidate must
//       sit next to the typed `VendorName` field's own bounding region, and — when a typed
//       `CustomerName` region also exists — closer to the vendor's than to the customer's.
//       THE INSIGHT THAT MAKES THIS WORK: VendorName's GEOMETRY is trustworthy even when its
//       CONTENT is garbage. On the vehicle that field reads "CONSULTANCY\nrightpath", pure
//       OCR noise, while its region sits at y=[1.057,1.497] — a 0.015in gap from the
//       letterhead line, against 1.33in to the customer block. Attribution by position, never
//       by text. FAIL CLOSED: no typed VendorName region means no attribution evidence, and
//       no evidence means no emission.
//   (d) RECONCILIATION with the typed emission, because `invoice.vendor_registration` is in
//       the DB's conflicting-duplicate forfeit list: two differing values for that one
//       field_path forfeit the ENTIRE extraction (0016, widened by 0022), destroying the
//       working `invoice.total` capture along with the new fact. Agreement collapses to one
//       row; disagreement emits neither — and so does a CONTESTED document: when the reader
//       finds two distinct registrations, a typed row that picked one of them is not
//       evidence, it is a coin toss that already landed, and it is withdrawn too.
//
// The accept gate is deliberately NOT a new grammar: it is the SAME `looksLikeRegistration`
// the v3 typed emit has used since Wave A.1, moved here so both callers share one definition
// rather than drifting apart. Moving it changes no behaviour — `invoiceFacts.v1.azure.mjs`
// imports it back.

import { pageFrame } from "./invoice-totals-reader.mjs";
import { asciiTrim, DASH_CHARS } from "./invoice-amount-grammar.mjs";

// EVERY GEOMETRIC COMPARISON IN EVERY READER MUST BE UNIT-NORMALIZED. Azure reports PDF
// geometry in inches and IMAGE geometry in pixels, so an inch threshold compared against raw
// coordinates refuses every candidate on a photographed bill — a legitimate 2px gap on an
// 1100px page reads as 2.0 "inches". This is the SECOND time that class has fired (X2's
// pixel-units finding was the first), which is why the normalization is imported from the X2
// reader rather than written again here: one definition, one place to fix it.

export const DEFAULT_VENDOR_IDENTITY_OPTS = Object.freeze({
  /** How far down a page a letterhead may sit, as a fraction of page height. Unit-free by
   *  construction: a fraction of the page's own height means the same thing in either unit. */
  topBandFraction: 0.25,
  /** Vertical gap allowed between a candidate line and the typed VendorName region, in
   *  inches. Measured on the vehicle: 0.015in — so this default is still 33x generous, while
   *  being narrow enough that a bill-to block cannot reach the vendor name. That second
   *  property is what it is for: when Azure fails to type CustomerName there is no customer
   *  anchor to be "closer to", and this gap becomes the only thing holding the buyer block
   *  out. At 0.5in the buyer's registration must sit essentially INSIDE the letterhead to
   *  pass. An opt, so a layout that genuinely prints its number further from the name can be
   *  re-measured rather than argued about. */
  vendorAnchorGapIn: 0.5,
});

// The CLOSED label vocabulary, EN + BM. Matching is exact-prefix on a form where every run of
// non-alphanumerics collapses to one space, so `Company No.`, `Company No :` and `COMPANY  NO`
// all reach the same string.
//
// `sst no` IS DELIBERATELY ABSENT, and that absence is load-bearing. A Malaysian invoice
// prints its SST registration in the same letterhead block, one letter away from `ssm no`:
// the measured receipt carries `SST Number : W10-2408-32000157` at y=3.16 of a 17.78in page,
// INSIDE the top band, and `looksLikeRegistration` accepts that token quite happily. Nothing
// but this vocabulary stops a tax registration being filed as a company registration, so the
// exclusion has its own test. (Same shape as the X2 identifier guard, opposite direction:
// there the trailing word disqualifies a label, here the label itself must be exact.)
const LABEL_VOCABULARY = Object.freeze([
  "company registration no",
  "company reg no",
  "company no",
  "co reg no",
  "co no",
  "registration no",
  "reg no",
  "ssm no",
  "no syarikat",
  "no pendaftaran",
]);

/** Collapse every run of non-alphanumerics to one space; lowercase. Index-free, match-only. */
const foldForMatch = (s) => String(s ?? "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();

/** Leading separators between a label and its value: `. `, ` : `, ` - `, `# `. */
const LEADING_SEPARATORS = new RegExp(`^[ \t.:#${DASH_CHARS}]+`);

/**
 * A plausible Malaysian company registration / tax id. VERBATIM from
 * `invoiceFacts.v1.azure.mjs` (Wave A.1 / AB-16), moved here so the typed emit and this reader
 * share ONE gate rather than two that drift. Deliberately permissive on token shape: the
 * coding lane only ever uses it to match an EXISTING registered counterparty by normalized
 * registration, so a non-match falls back to name-only ambiguity — never a wrong resolution.
 */
export function looksLikeRegistration(s) {
  const v = String(s ?? "").trim();
  if (v.length < 3 || v.length > 40) return false;
  if (v.replace(/[^a-zA-Z0-9]/g, "").length < 3) return false; // substantive alnum content
  if (/^\(?\s*(?:rm|myr|usd|sgd)?\s*[\d,]+\.\d{2}\s*\)?$/i.test(v)) return false; // currency amount
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; // ISO date, not a registration
  return true;
}

/**
 * The STRICT sibling of `looksLikeRegistration`, added for the durable onboarding interview
 * (interview_v2 / F1) and re-exported here so this module remains the one place a reader looks
 * for "what counts as a Malaysian registration". The two gates are deliberately different and
 * neither replaces the other: `looksLikeRegistration` above is a MATCHING gate (a loose token
 * filter whose worst case is a non-match against the registry), while
 * `looksLikeBusinessRegistration` is a DATA-ENTRY gate that enumerates the printed forms —
 * legacy `1475415-P`, state-prefixed `SA1234567-X`, unified `202401001234`, and the combined
 * `202401047756 (1593602-X)` this module measured in a live letterhead. The definition lives in
 * the dependency-free leaf `malaysian-registration.mjs` because the interview's frozen closure
 * imports it, and that closure must not swallow this module's own imports (the X2 readers) into
 * the freeze; see that file's header. `looksLikeRegistration` is untouched.
 */
export { looksLikeBusinessRegistration, classifyBusinessRegistration, normalizeRegistration } from "./malaysian-registration.mjs";

/** The DB's own registration key: strip separators, lowercase (0009:359-360). Used ONLY to
 *  decide whether two readings are the same registration — never emitted. Identical in rule to
 *  `normalizeRegistration` re-exported above; a test pins the two together so they cannot drift. */
export const registrationKey = (s) => String(s ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

/**
 * Split a line into {label, remainder} when it opens with a vocabulary label, else null.
 *
 * The remainder is cut from the ORIGINAL text, not the folded one, so `value_raw` stays
 * verbatim. The cut point is found by consuming characters until as many ALPHANUMERICS have
 * passed as the label contains — which is exact regardless of how the document punctuated or
 * spaced the label.
 */
export function splitRegistrationLabel(text) {
  const folded = foldForMatch(text);
  if (!folded) return null;
  let label = null;
  for (const candidate of LABEL_VOCABULARY) {
    if (!folded.startsWith(candidate)) continue;
    if (label && label.length >= candidate.length) continue;
    label = candidate;
  }
  if (!label) return null;
  const want = label.replace(/[^a-z0-9]/g, "").length;
  const original = String(text ?? "");
  let seen = 0;
  let cut = 0;
  for (let i = 0; i < original.length && seen < want; i++) {
    if (/[a-zA-Z0-9]/.test(original[i])) seen += 1;
    cut = i + 1;
  }
  if (seen < want) return null;
  const remainder = asciiTrim(asciiTrim(original.slice(cut)).replace(LEADING_SEPARATORS, ""));
  // THE REMAINDER MUST BE THE VALUE, not more label. Prefix matching alone lets a tax-qualified
  // continuation through the vocabulary that was supposed to exclude it: measured bypasses were
  // `Registration No. (SST): W10-2408-32000157` and `No. Pendaftaran Cukai Perkhidmatan: …`,
  // both of which emitted an SST registration as the company registration — precisely what the
  // omission of `sst no` exists to prevent. A registration begins with its number: a leading
  // parenthesised qualifier, or a leading word carrying no digit, means the label has not ended.
  if (remainder.startsWith("(")) return { label, remainder, continuation: true };
  const firstToken = remainder.split(/\s+/)[0] ?? "";
  if (firstToken && !/[0-9]/.test(firstToken)) return { label, remainder, continuation: true };
  return { label, remainder, continuation: false };
}

/**
 * TWO-DIMENSIONAL gap between two boxes on the same page — 0 when they overlap in both axes,
 * else the Euclidean distance between their nearest edges. Null when the anchor is absent or
 * on another page, which is no evidence rather than a near miss.
 *
 * MEASURING ONLY y WAS A WRONG-PARTY PATH. A vendor name printed on the left of a page and a
 * buyer registration printed on the right can share a horizontal band exactly, and a
 * y-only gap calls that adjacency: distance 0, attributed, emitted. It also ran the other
 * way — a remote buyer registration became a second "vendor" candidate and manufactured a
 * false ambiguity that WITHDREW a correct typed row, forfeiting an identity the document
 * stated plainly. A page is two-dimensional and so is proximity on it.
 */
function boxDistance(candidate, anchor) {
  if (!anchor || anchor.page !== candidate.page) return null;
  const dx = Math.max(0, anchor.xmin - candidate.xmax, candidate.xmin - anchor.xmax);
  const dy = Math.max(0, anchor.ymin - candidate.ymax, candidate.ymin - anchor.ymax);
  return Math.hypot(dx, dy);
}

/**
 * Is this candidate attributable to the VENDOR block? Returns null when it is, else the
 * reason it is not — so the receipt can say which defense refused it.
 *
 * `limit` arrives already converted into the page's own frame; see the unit note above.
 */
function vendorAttributionFailure(candidate, anchors, limit) {
  const vendorDistance = boxDistance(candidate, anchors?.vendor);
  if (vendorDistance === null) return "no_vendor_anchor";
  if (vendorDistance > limit) return "vendor_anchor_far";
  const customerDistance = boxDistance(candidate, anchors?.customer);
  // STRICTLY closer, and a tie refuses. The law is "nearer the vendor than the customer";
  // equidistant is not nearer, and resolving a coin toss in the vendor's favour is exactly
  // the guess this defense exists to prevent.
  //
  // THE MARGIN IS NOT DECORATION. A candidate exactly equidistant between the two blocks
  // measured 0.024201648132237796 against 0.024201648132237852 — a difference of 5.6e-17,
  // pure floating-point dust from scaling, and a bare `<` handed the document to the vendor
  // on the strength of it. A tie decided by rounding error is still a tie. The epsilon sits
  // ~8 orders above that dust and ~9 orders below any real page feature (coordinates here are
  // fractions of page width, so this is sub-nanometre on paper).
  const TIE_EPSILON = 1e-9;
  if (customerDistance !== null && !(vendorDistance + TIE_EPSILON < customerDistance)) return "closer_to_customer";
  return null;
}

/**
 * The typed VendorName / CustomerName regions, reduced to what attribution needs. Content is
 * deliberately ignored: on the vehicle VendorName reads as OCR garbage while its geometry is
 * exact, and geometry is the only thing being asked for here.
 */
export function anchorsFromTypedFields(fields) {
  const regionOf = (field) => {
    const region = Array.isArray(field?.boundingRegions) ? field.boundingRegions[0] : null;
    const polygon = region?.polygon;
    if (!Array.isArray(polygon) || polygon.length < 8 || polygon.length % 2 !== 0) return null;
    const ys = [];
    for (let i = 1; i < polygon.length; i += 2) {
      const y = Number(polygon[i]);
      if (!Number.isFinite(y)) return null;
      ys.push(y);
    }
    const xs = [];
    for (let i = 0; i < polygon.length; i += 2) {
      const x = Number(polygon[i]);
      if (!Number.isFinite(x)) return null;
      xs.push(x);
    }
    return {
      page: Number(region.pageNumber || 1),
      xmin: Math.min(...xs), xmax: Math.max(...xs),
      ymin: Math.min(...ys), ymax: Math.max(...ys),
    };
  };
  // `vendorName` is the ONE piece of vendor CONTENT that crosses into attribution, and it crosses
  // in ONE direction only: X7 uses it to REFUSE a buyer candidate that IS the seller's own name.
  // Review law 3 says a name is a projection of the thing, not the thing — which is exactly why
  // it may only ever refuse. A false match costs an abstain (Azure's typed value stands); it can
  // never admit anything. See `customerAttributionFailure` for the measurement that forced it.
  return {
    vendor: regionOf(fields?.VendorName),
    customer: regionOf(fields?.CustomerName),
    vendorName: String(fields?.VendorName?.content ?? fields?.VendorName?.valueString ?? ""),
  };
}

/** Full 2D extent of a flat polygon, scaled into the page's frame, or null when unusable. */
function extentOf(polygon, scale) {
  if (!Array.isArray(polygon) || polygon.length < 8 || polygon.length % 2 !== 0) return null;
  const xs = [];
  const ys = [];
  for (let i = 0; i < polygon.length; i += 2) {
    const x = Number(polygon[i]);
    const y = Number(polygon[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    xs.push(x * scale);
    ys.push(y * scale);
  }
  return { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
}

/** The anchor boxes, scaled into the same frame as the candidates. */
function scaleAnchor(anchor, scale) {
  if (!anchor) return null;
  return {
    page: anchor.page,
    xmin: anchor.xmin * scale, xmax: anchor.xmax * scale,
    ymin: anchor.ymin * scale, ymax: anchor.ymax * scale,
  };
}

/**
 * Read the vendor's registration off `analyzeResult.pages[].lines[]`.
 *
 * Returns at most ONE field — `invoice.vendor_registration` — carrying the matched line's own
 * polygon and the label-stripped remainder verbatim. Every refusal is counted; nothing is
 * capped silently.
 *
 * @param {Array<{pageNumber?:number, height?:number, lines?:Array<{content?:string, polygon?:number[], confidence?:number}>}>} pages
 * @param {object} [opts] see DEFAULT_VENDOR_IDENTITY_OPTS
 * @returns {{fields:Array, receipt:object}}
 */
export function readVendorIdentityFromLines(pages, anchors = null, opts = {}) {
  const settings = { ...DEFAULT_VENDOR_IDENTITY_OPTS, ...opts };
  const receipt = {
    matched: 0,
    absent: 0,
    ambiguous: 0,
    rejected_gate: 0,
    below_band: 0,
    height_missing: 0,
    unit_unresolved: 0,
    no_geometry: 0,
    label_continuation: 0,
    no_vendor_anchor: 0,
    vendor_anchor_far: 0,
    closer_to_customer: 0,
    typed_collapsed: 0,
    typed_disagreement: 0,
    typed_vs_ambiguous: 0,
    emitted: 0,
    candidates: [],
  };
  const accepted = [];
  const note = (outcome, hit, pageNumber, extra = {}) => {
    receipt.candidates.push({ label: hit.label, outcome, page: pageNumber, ...extra });
  };

  for (const page of Array.isArray(pages) ? pages : []) {
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    if (lines.length === 0) continue;
    const pageNumber = Number(page?.pageNumber) || 1;
    // The page's own coordinate frame — imported from the X2 reader so there is exactly one
    // definition of how an inch threshold crosses into pixel geometry. A pixel page with no
    // usable width has no knowable frame, so it is refused rather than measured in the wrong
    // unit (the X2 `pixel:no-width` precedent).
    const frame = pageFrame(page);
    const height = Number(page?.height);
    // A page with no usable height cannot be banded, and a wall that quietly disappears when
    // its input is missing is not a wall. Every candidate on such a page is refused.
    const bandLimit = frame && Number.isFinite(height) && height > 0
      ? height * settings.topBandFraction * frame.scale
      : null;
    const anchorLimit = frame ? frame.inchToFrame(settings.vendorAnchorGapIn) : null;
    const scaledAnchors = frame
      ? { vendor: scaleAnchor(anchors?.vendor, frame.scale), customer: scaleAnchor(anchors?.customer, frame.scale) }
      : null;
    for (const line of lines) {
      const hit = splitRegistrationLabel(line?.content);
      if (!hit) continue;
      if (hit.continuation) {
        receipt.label_continuation += 1;
        note("label_continuation", hit, pageNumber);
        continue;
      }
      if (!frame) {
        receipt.unit_unresolved += 1;
        note("unit_unresolved", hit, pageNumber);
        continue;
      }
      const extent = extentOf(line?.polygon, frame.scale);
      if (extent === null) {
        // A recognised label with unusable geometry is a REFUSAL, and it has to be visible:
        // silently continuing made a readable document look like one that printed nothing.
        receipt.no_geometry += 1;
        note("no_geometry", hit, pageNumber);
        continue;
      }
      if (bandLimit === null) {
        receipt.height_missing += 1;
        note("height_missing", hit, pageNumber);
        continue;
      }
      if (extent.ymin > bandLimit) {
        receipt.below_band += 1;
        note("below_band", hit, pageNumber);
        continue;
      }
      if (!looksLikeRegistration(hit.remainder)) {
        receipt.rejected_gate += 1;
        note("rejected_gate", hit, pageNumber);
        continue;
      }
      const candidate = { ...extent, page: pageNumber };
      const attributionFailure = vendorAttributionFailure(candidate, scaledAnchors, anchorLimit);
      if (attributionFailure) {
        receipt[attributionFailure] += 1;
        note(attributionFailure, hit, pageNumber, { key: registrationKey(hit.remainder) });
        continue;
      }
      accepted.push({
        value_raw: hit.remainder,
        key: registrationKey(hit.remainder),
        page: pageNumber,
        polygon: (line.polygon || []).map(Number),
        confidence: line?.confidence == null ? null : Number(line.confidence),
      });
      note("accepted", hit, pageNumber, { key: registrationKey(hit.remainder) });
    }
  }

  if (accepted.length === 0) {
    receipt.absent += 1;
    receipt.outcome = "absent";
    return { fields: [], receipt };
  }
  const distinct = new Set(accepted.map((c) => c.key));
  if (distinct.size > 1) {
    // Two different registrations, both attributable to the vendor block. There is no basis
    // for preferring one, so neither is emitted — and the document is now CONTESTED, which
    // the merge below uses to withdraw a typed row that picked a side.
    receipt.ambiguous += 1;
    receipt.outcome = "ambiguous";
    receipt.distinct_keys = [...distinct];
    return { fields: [], receipt };
  }
  // Identical readings collapse — the measured case is the same letterhead line on both pages.
  const [first] = accepted;
  receipt.matched += 1;
  receipt.outcome = "matched";
  receipt.value_raw = first.value_raw;
  receipt.occurrences = accepted.length;
  return {
    fields: [{
      field_path: "invoice.vendor_registration",
      value_raw: first.value_raw,
      page: first.page,
      polygon: first.polygon,
      confidence: first.confidence,
    }],
    receipt,
  };
}

/**
 * Merge the reader's emission into the mapper's field list, reconciling against the typed
 * `VendorTaxId` row. Mutates `out` and `identity.receipt`.
 *
 * `invoice.vendor_registration` sits in the DB's TEXT conflicting-duplicate set, compared on
 * the trimmed value — so two rows that differ by so much as a hyphen forfeit the whole
 * extraction. Reconciliation compares on the DB's own registration key (separators stripped,
 * lowercased), which is the comparison resolution itself performs: `202401047756 (1593602-X)`
 * and `2024-01047756-1593602X` are the same registration and must collapse, not collide.
 */
export function mergeVendorIdentity(out, identity) {
  const [row] = identity.fields;
  if (!row) {
    // A CONTESTED document withdraws the typed row too. When the reader found two distinct
    // registrations, Azure's typed value is not a tie-break — it is one of the contested
    // readings, and on the measured shape (supplier A, buyer B, typed = B) leaving it standing
    // registration-matches the WRONG counterparty. Only `ambiguous` does this: `absent`,
    // `rejected_gate` and the attribution refusals are the reader having nothing to say, and a
    // typed row stands there exactly as it did before this module existed.
    if (identity.receipt.outcome === "ambiguous") {
      const contested = out.find((r) => r.field_path === "invoice.vendor_registration");
      if (contested && String(contested.value_raw ?? "").trim()) {
        out.splice(out.indexOf(contested), 1);
        identity.receipt.typed_vs_ambiguous += 1;
      }
    }
    return;
  }
  const typed = out.find((r) => r.field_path === "invoice.vendor_registration");
  if (!typed) {
    out.push(row);
    identity.receipt.emitted += 1;
    return;
  }
  if (registrationKey(typed.value_raw) === registrationKey(row.value_raw)) {
    // Same registration read twice. Keep the TYPED row: it carries Azure's own region.
    identity.receipt.typed_collapsed += 1;
    return;
  }
  // Two identities, one document. Emit neither, and withdraw the typed row as well — leaving
  // it would let a contested identity resolve a counterparty on its own authority.
  out.splice(out.indexOf(typed), 1);
  identity.receipt.typed_disagreement += 1;
  identity.receipt.outcome = "typed_disagreement";
}
