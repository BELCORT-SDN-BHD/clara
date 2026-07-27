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
// merely returns the lane to where it already is. Three independent defenses, all required:
//
//   (a) UNIQUENESS-OR-NOTHING over the WHOLE document. Two DISTINCT registration-shaped
//       candidates anywhere ⇒ emit nothing. Identical candidates collapse, which is the
//       measured two-page letterhead case (the same line on page 1 and page 2).
//   (b) THE TOP BAND. A letterhead sits at the top of its page by convention; a bill-to block
//       does not. Measured at y≈0.88 of an 11.68in page — comfortably inside the default 25%.
//       An opt, like every other threshold here, so it can be re-measured rather than argued.
//   (c) RECONCILIATION with the typed emission, because `invoice.vendor_registration` is in
//       the DB's conflicting-duplicate forfeit list: two differing values for that one
//       field_path forfeit the ENTIRE extraction (0016, widened by 0022), destroying the
//       working `invoice.total` capture along with the new fact. Agreement collapses to one
//       row; disagreement emits neither.
//
// The accept gate is deliberately NOT a new grammar: it is the SAME `looksLikeRegistration`
// the v3 typed emit has used since Wave A.1, moved here so both callers share one definition
// rather than drifting apart. Moving it changes no behaviour — `invoiceFacts.v1.azure.mjs`
// imports it back.

/** How far down a page a letterhead may sit, as a fraction of page height. */
export const DEFAULT_VENDOR_IDENTITY_OPTS = Object.freeze({
  topBandFraction: 0.25,
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
const LEADING_SEPARATORS = /^[\s.:#\-–—]+/;

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

/** The DB's own registration key: strip separators, lowercase (0009:359-360). Used ONLY to
 *  decide whether two readings are the same registration — never emitted. */
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
  return { label, remainder: original.slice(cut).replace(LEADING_SEPARATORS, "").trim() };
}

/** Axis-aligned top edge of a flat polygon, or null when the polygon is unusable. */
function topOf(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 8 || polygon.length % 2 !== 0) return null;
  const ys = [];
  for (let i = 1; i < polygon.length; i += 2) {
    const y = Number(polygon[i]);
    if (!Number.isFinite(y)) return null;
    ys.push(y);
  }
  return Math.min(...ys);
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
export function readVendorIdentityFromLines(pages, opts = {}) {
  const settings = { ...DEFAULT_VENDOR_IDENTITY_OPTS, ...opts };
  const receipt = {
    matched: 0,
    absent: 0,
    ambiguous: 0,
    rejected_gate: 0,
    below_band: 0,
    typed_collapsed: 0,
    typed_disagreement: 0,
    emitted: 0,
    candidates: [],
  };
  const accepted = [];

  for (const page of Array.isArray(pages) ? pages : []) {
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    if (lines.length === 0) continue;
    const pageNumber = Number(page?.pageNumber) || 1;
    const height = Number(page?.height);
    // With no page height the band cannot be applied. Refusing the page outright would drop
    // the measured letterhead on any engine result that omits height, so the band is skipped
    // and the fact is recorded — uniqueness and the accept gate still apply, and the receipt
    // says the weakest defense was unavailable.
    const bandLimit = Number.isFinite(height) && height > 0 ? height * settings.topBandFraction : null;
    for (const line of lines) {
      const hit = splitRegistrationLabel(line?.content);
      if (!hit) continue;
      const top = topOf(line?.polygon);
      if (top === null) continue; // no geometry: cannot place it, cannot emit it
      if (bandLimit !== null && top > bandLimit) {
        receipt.below_band += 1;
        receipt.candidates.push({ label: hit.label, outcome: "below_band", page: pageNumber });
        continue;
      }
      if (!looksLikeRegistration(hit.remainder)) {
        receipt.rejected_gate += 1;
        receipt.candidates.push({ label: hit.label, outcome: "rejected_gate", page: pageNumber });
        continue;
      }
      accepted.push({
        value_raw: hit.remainder,
        key: registrationKey(hit.remainder),
        page: pageNumber,
        polygon: (line.polygon || []).map(Number),
        confidence: line?.confidence == null ? null : Number(line.confidence),
      });
      receipt.candidates.push({ label: hit.label, outcome: "accepted", page: pageNumber, key: registrationKey(hit.remainder) });
    }
  }

  if (accepted.length === 0) {
    receipt.absent += 1;
    receipt.outcome = "absent";
    return { fields: [], receipt };
  }
  const distinct = new Set(accepted.map((c) => c.key));
  if (distinct.size > 1) {
    // Two different registrations on one document. The second is very often the BUYER's, and
    // filing it as the vendor's resolves the counterparty to the wrong party — worse by far
    // than resolving nothing. There is no basis here for preferring one over the other, so
    // neither is emitted.
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
  if (!row) return;
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
