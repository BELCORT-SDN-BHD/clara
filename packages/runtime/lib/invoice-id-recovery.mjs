// invoice_id recovery (WA §11) — MOVED HERE from invoiceFacts.v1.azure.mjs by the F6–F9 fix
// batch (F7 / task #32), forced by the repo's 500-line-per-file limit when the X7
// customer-identity wiring landed. It is the tidy direction anyway: every other deterministic
// reader this adapter uses already lives in lib/ (X2 totals, X6 vendor identity, the currency
// reader, X7 customer identity), following the "moved, not rewritten, so the two can never
// drift" precedent that file's own header records for `looksLikeRegistration` (v7 / X6).
//
// THE MOVE IS MECHANICAL WITH DECLARED DELTAS — stated precisely, because the first version of
// this header claimed "byte-for-byte" and a reviewer correctly called that inaccurate. Every
// function BODY below is byte-identical to what the adapter carried. The deltas, all of them:
//   (1) `INVOICE_ID_LABEL`, `looksLikeInvoiceNumber` and `recoverInvoiceId` gained `export`;
//   (2) `recoverInvoiceId` / `recoverFromKeyValuePairs` gained a `firstRegion` parameter, and
//       the adapter's call site passes it;
//   (3) that parameter DEFAULTS to `defaultFirstRegion` below, so a call without it behaves as
//       the original did instead of throwing on a valid key-value hit.
// A verification script proved bodies (1)-(2) equivalent modulo exactly those deltas; a test
// pins (3) against the adapter's own `firstRegion` so the two can never drift apart.

/**
 * The adapter's `firstRegion`, as a FALLBACK for callers that do not inject one.
 *
 * A SECOND DEFINITION IS A DRIFT HAZARD and it is admitted here on purpose: the alternative was
 * a parameter with no default, which turns a caller's omission into a crash on a valid document.
 * The hazard is converted into a pinned invariant instead — `x7-id-recovery.test.mjs` asserts
 * this function and the adapter's produce identical output on the same inputs, the same
 * technique X6 uses to pin `registrationKey` against `normalizeRegistration`. NEVER fabricates
 * geometry: an absent or empty bounding region yields an EMPTY polygon (W3 / finding 3).
 */
function defaultFirstRegion(field) {
  const region = Array.isArray(field?.boundingRegions) ? field.boundingRegions[0] : null;
  if (!region) return { page: 1, polygon: [] };
  const polygon = Array.isArray(region.polygon) && region.polygon.length > 0 ? region.polygon.map(Number) : [];
  return { page: Number(region.pageNumber || 1), polygon };
}
//
// THE ORIGINAL RATIONALE, unedited:
// The prebuilt-invoice `InvoiceId` typed field is high-recall on US templates but
// LOSSY on Malaysian layouts: on the RPR corpus it returned a bounding region with
// an EMPTY value (or no field at all) on most bills, while the number was plainly in
// the OCR content. The typed field stays the source of truth; ONLY when it yields no
// value do we recover the number from the response's own structures — first the
// model's key-value pairs (features=keyValuePairs), then a label-anchored line scan of
// analyzeResult.content. Recovery is conservative (label-anchored + a plausibility
// gate) and NEVER overrides a non-empty typed hit, so the fields Azure did type stay
// byte-identical. A recovered id carries whatever geometry its source had (KV) or an
// empty polygon (content) — invoice_id is non-monetary, so it never affects Tier-A
// total corroboration; it only arms the duplicate-bill + near-dup keys the DB owns.

// Normalizes a label for matching: lowercase, collapse runs to single spaces, trim.
function normLabel(s) {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Label vocabulary for the invoice-number field across the layouts we see (English +
// Malay: "No. Invois", "No. Bil"). Deliberately excludes purchase-order / account /
// customer labels so we never capture a neighbouring number.
// Invoice-number anchors ONLY. `reference/ref/document/doc no.` labels are
// deliberately EXCLUDED: the recovered id feeds the exact-duplicate-bill key, and a
// delivery-order / customer reference sharing across two of a vendor's bills would
// false-positive that gate. Keep to invoice/bill/invois anchors (dual-review LOW).
export const INVOICE_ID_LABEL =
  /\b(?:tax\s+)?inv(?:oice)?\.?\s*(?:no\.?|number|num\.?|#|id)\b|\binvois\b|\bno\.?\s*bil\b|\bbil\s*(?:no\.?|number)\b/i;

// A plausible invoice number: has a digit, sane length, and is not a bare currency
// amount or an ISO date (those are other fields). Invoice numbers may carry slashes,
// dashes and dots (INV2510/10, IV-2512-001, 202509230), so those pass.
export function looksLikeInvoiceNumber(s) {
  const v = String(s ?? "").trim();
  if (v.length < 3 || v.length > 40) return false;
  if (!/[0-9]/.test(v)) return false;
  if (/^\(?\s*(?:rm|myr|usd|sgd)?\s*[\d,]+\.\d{2}\s*\)?$/i.test(v)) return false; // currency total
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; // ISO date == invoice_date, not id
  if (/^[\d\s]+$/.test(v) && v.replace(/\D/g, "").length > 12) return false; // long digit run (phone/acct)
  return true;
}

// Trims label noise and surrounding punctuation, returning the invoice-number token.
function cleanIdToken(s) {
  return String(s ?? "")
    .replace(/^[\s:#.\-–—]+/, "")
    .replace(/[\s:#]+$/, "")
    .trim();
}

// Recover the invoice number from the model's key-value pairs (features=keyValuePairs).
//
// `firstRegion` is INJECTED rather than re-implemented here: it is the adapter's general
// Azure-payload geometry helper (used by the typed loop, the currency emit and both tax-id
// emits as well as this path). It DEFAULTS to the equivalent fallback above so an omission
// degrades to the original behaviour rather than throwing on a valid hit.
function recoverFromKeyValuePairs(result, firstRegion = defaultFirstRegion) {
  const kvps = Array.isArray(result?.keyValuePairs) ? result.keyValuePairs : [];
  for (const kv of kvps) {
    if (!INVOICE_ID_LABEL.test(normLabel(kv?.key?.content))) continue;
    const val = cleanIdToken(kv?.value?.content);
    if (!looksLikeInvoiceNumber(val)) continue;
    const region = firstRegion(kv?.value);
    return {
      value: val,
      page: region.page,
      polygon: region.polygon,
      confidence: kv?.confidence == null ? null : Number(kv.confidence),
    };
  }
  return null;
}

// Recover from a label-anchored scan of the concatenated OCR content. Conservative:
// the value must sit after the label on the SAME line, or be the first plausible token
// on the NEXT line (the common "Invoice No:\nINV2510/10" print shape).
function recoverFromContent(result) {
  const content = typeof result?.content === "string" ? result.content : "";
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = INVOICE_ID_LABEL.exec(lines[i]); // case-insensitive, matched on the raw line
    if (!m) continue;
    // Same-line: the first whitespace-delimited token after the label.
    const sameLine = cleanIdToken(lines[i].slice(m.index + m[0].length)).split(/\s+/)[0];
    if (looksLikeInvoiceNumber(sameLine)) {
      return { value: sameLine, page: 1, polygon: [], confidence: null };
    }
    // Next-line: first whitespace-delimited token on the following line.
    const next = cleanIdToken((lines[i + 1] ?? "").trim().split(/\s+/)[0]);
    if (looksLikeInvoiceNumber(next)) {
      return { value: next, page: 1, polygon: [], confidence: null };
    }
  }
  return null;
}

// Best-effort recovery: KV first (Azure-structured), then content scan. Returns a
// {value, page, polygon, confidence} facts row or null.
export function recoverInvoiceId(result, firstRegion = defaultFirstRegion) {
  return recoverFromKeyValuePairs(result, firstRegion) || recoverFromContent(result);
}

/** Exported ONLY so a test can pin it against the adapter's `firstRegion` (see its header). */
export { defaultFirstRegion as __defaultFirstRegionForTest };
