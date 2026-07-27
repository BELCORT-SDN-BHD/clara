// X2 — the deterministic totals reader (extraction slice, contract v1.0 §2 X2 / ADR-047).
//
// WHY THIS EXISTS. Azure's prebuilt-invoice TYPED fields produced `invoice.tax_total` on
// 0 of 29 real extractions and `invoice.total_excl_tax` only sporadically: the model simply
// does not type the totals block on Malaysian F&B / consultancy layouts. Everything
// downstream that needs the net/tax split — Gate P's 3-leg SST close, the corrected
// sum-of-stated-components tie (X3, migration 0022), the auto-draft lane — is therefore
// starved of facts the document plainly prints. This module reads those figures off the
// layout the way `prior-gl-cells.mjs` reads a printed ledger: label-anchored and
// geometry-bound, never by reading order and never by a model.
//
// WHAT IT IS NOT. It does not compute anything. Every emitted `value_raw` is the verbatim
// content of one OCR line, carrying that line's own polygon; the DB normalizes to cents and
// owns every identity (`_normalize_invoice_cents`, `persist_invoice_facts`). The reader's
// only judgement is WHICH line is the amount for WHICH label — and its bias, everywhere, is
// to refuse. A field it cannot resolve uniquely is omitted and counted, never guessed.
//
// WHY REFUSAL IS THE ONLY SAFE FAILURE. Three DB behaviours make a sloppy emit catastrophic
// rather than merely wrong (all in 0016, widened by 0022):
//   * conflicting duplicates for ONE field_path forfeit the WHOLE extraction — which would
//     destroy today's working 29/29 `invoice.total` capture, not just the new field;
//   * a present-but-unparseable monetary value forfeits the whole extraction too;
//   * the stated components must be non-negative in cents at the write boundary.
// So: a strict subset of the DB's grammar, uniqueness-or-nothing, and no emission at all
// where the geometry is not unambiguous.
//
// GEOMETRY, MEASURED — NOT ASSUMED. Calibrated against two real Azure captures (a 2-page
// consultancy invoice and a 1-page F&B receipt, both api 2024-11-30, `unit: "inch"`). Three
// facts drove the pairing rule, and each is load-bearing; dropping any one produces a
// measurably wrong or lost field on real data:
//
//   1. TOTALS ARE SPLIT-LINE. The label and its amount are separate `lines[]` entries. The
//      amount is the NEXT line in reading order (index+1 on all six measured true pairs).
//   2. A PAGE IS SKEWED, so comparing one y across a wide x gap conflates skew with row
//      separation. On the receipt (page angle -1.31°) the amount's top-left y sits 0.10-0.14in
//      ABOVE its own label's; on the invoice (+0.21°) it sits 0.01in below. Hence the
//      absolute top-delta window, and hence rule 3.
//   3. THE BOXES OF ONE PRINTED ROW OVERLAP VERTICALLY. This is the term that refuses the
//      dangerous case: on the real invoice, `Service Tax (8%)` (whose amount is a DASH the
//      OCR captured NOWHERE) sits 0.1497in below the ROUNDING row's `0.40` — INSIDE a
//      0.15in window, so a top-delta-only rule pairs them and emits `tax_total = 0.40` for a
//      document whose tax is nil. Their boxes do not overlap (-0.038in), so the overlap term
//      refuses it. Every true pair overlaps by 0.11-0.24in (60-100% of the shorter box).
//
// Conversely the top-delta window is what keeps the receipt honest: there, the NEXT row's
// amount overlaps the label's box by 0.117in, so an overlap-only rule would see two
// candidates for `Sub Total` and refuse a field that is plainly readable. Both terms, plus
// reading-order adjacency, are required. All three are options with ratified defaults so the
// thresholds can be re-measured against a wider corpus without editing this file.
//
// SCOPE. `analyzeResult.pages[].lines[]` only — one region shape, per contract. Tables and
// key-value pairs are deliberately out of scope: measured on the same captures, neither held
// the missing tax amount either (the table cell for it is the empty string), so consuming
// them would add surface without adding a fact. `invoice.total` is NOT this reader's
// business — the typed field captures it 29/29 already.

/** The CLOSED set of field_paths this reader may emit (contract §2 X3 taxonomy; the DB's
 *  allowlist in 0022 is the enforcing copy). `invoice.total` is deliberately absent. */
export const TOTALS_FIELD_PATHS = Object.freeze([
  "invoice.total_excl_tax",
  "invoice.tax_total",
  "invoice.rounding",
  "invoice.service_charge",
  "invoice.discount",
  "invoice.delivery",
]);

/** Pairing thresholds. Defaults are the ratified/measured values; see the header. */
export const DEFAULT_READER_OPTS = Object.freeze({
  /** |Δ top-edge y| between a label line and its amount line, in inches. Measured true
   *  pairs span 0.008-0.139; the nearest wrong neighbour measured is 0.150. */
  maxTopDeltaIn: 0.15,
  /** The amount must be the very next line in reading order. True on 6/6 measured pairs. */
  requireIndexAdjacent: true,
  /** The label box and the amount box must share a horizontal band (positive y overlap). */
  requireVerticalOverlap: true,
});

// Label vocabulary, bilingual EN/BM (the INVOICE_ID_LABEL precedent in
// invoiceFacts.v1.azure.mjs). Matching is EXACT-PREFIX on the noise-stripped, whitespace-
// collapsed, lowercased line — which is what makes OCR's dropped-first-letter noise safe for
// free: the real receipt's Tax-Summary repeat reads "ervice Tax@6%" and matches nothing, so
// the block is skipped rather than mis-anchored. Longest prefix wins, so "rounding adj"
// resolves before "rounding" and "service charge" can never be read as "service tax".
const LABEL_VOCABULARY = Object.freeze([
  ["invoice.total_excl_tax", ["sub total", "subtotal", "sub-total", "jumlah kecil"]],
  ["invoice.tax_total", ["service tax", "sst", "cukai perkhidmatan"]],
  ["invoice.rounding", ["rounding adj", "rounding", "pembundaran"]],
  ["invoice.service_charge", ["service charge", "caj perkhidmatan"]],
  ["invoice.discount", ["discount", "diskaun"]],
  ["invoice.delivery", ["delivery charge", "delivery", "penghantaran", "handling"]],
]);

// An IDENTIFIER, not a money label. Measured: every Malaysian invoice that charges SST also
// prints its registration as "SST Number : W10-2408-32000157", which prefix-matches `sst`
// exactly. Without this guard that line becomes a tax_total anchor and whatever sits to its
// right becomes the tax. The same shape covers "Delivery Order No.", "Discount Code", etc.
const IDENTIFIER_WORDS = new Set(["no", "number", "num", "reg", "registration", "id", "code", "ref", "order", "account"]);

// Leading item counts / bullets / punctuation are stripped before matching: the real receipt
// prints its subtotal label as "11 SubTotal" (the line's own item count runs into the label).
const LABEL_NOISE_PREFIX = /^[\s\d.,:;#*|()[\]\-‐-―−]+/;

// A DASH standing alone is the document saying NIL — never zero. Kept as its own token class
// so a printed "-" can never normalize to 0.00 and satisfy an identity the face refuses.
const DASH_ONLY = /^[-‐‑‒–—―−]{1,3}$/;

// THE ACCEPT GRAMMAR — a strict subset of the DB's `_normalize_invoice_cents` (0009:102-123),
// which also accepts bare integers, one decimal place and the accounting parenthesis form.
// Narrower on purpose: exactly two decimals with grouped thousands is the shape a Malaysian
// totals column prints, and requiring the grouping is what stops a 4-digit reference or a
// "2025.10"-style token from being read as money. Anything outside it is refused, because a
// present-but-unparseable monetary value forfeits the entire extraction at the DB.
const AMOUNT_STRICT = /^(?:RM\s*)?[0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}$/;

// Amount-SHAPED but outside the accept grammar (a negative, a parenthesised figure, a bare
// integer, three decimals, an OCR-mangled digit run). Never emitted — its only job is to make
// the refusal VISIBLE as `unparseable` instead of silently indistinguishable from "the
// document printed nothing here" (contract §2 X2: no silent caps).
const AMOUNT_SHAPED = /^(?:RM|MYR)?[\s(]*[-‐-―−]?\s*[0-9][0-9,.\s]*\)?$/i;

const SST_RATE = /([0-9]{1,2}(?:\.[0-9]+)?)\s*%/;

/** Axis-aligned bounds of a flat Azure polygon [x1,y1,x2,y2,...], or null when unusable.
 *  `x0`/`y0` are the FIRST vertex (top-left) — the coordinate the pairing window uses;
 *  min/max cover all vertices, which is what makes the overlap test skew-tolerant. */
function boxOf(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 8 || polygon.length % 2 !== 0) return null;
  const xs = [];
  const ys = [];
  for (let i = 0; i < polygon.length; i += 2) {
    const x = Number(polygon[i]);
    const y = Number(polygon[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    xs.push(x);
    ys.push(y);
  }
  return { x0: xs[0], y0: ys[0], xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
}

/** Inches of shared vertical band between two boxes; <= 0 means different printed rows. */
const yOverlap = (a, b) => Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin);

const content = (line) => String(line?.content ?? "");

/** Lowercased, whitespace-collapsed, leading-noise-stripped label text. */
function normalizeLabel(text) {
  return String(text ?? "").replace(LABEL_NOISE_PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A line's field_path when it is a totals LABEL, else null. Also returns the printed SST rate
 * when the label states one (6% and 8% both exist in the corpus) — diagnostic metadata for
 * the receipt, never a region and never used to compute anything.
 */
export function matchTotalsLabel(text) {
  const norm = normalizeLabel(text);
  if (!norm) return null;
  let best = null;
  for (const [field, prefixes] of LABEL_VOCABULARY) {
    for (const prefix of prefixes) {
      if (!norm.startsWith(prefix)) continue;
      if (best && best.prefix.length >= prefix.length) continue;
      best = { field, prefix };
    }
  }
  if (!best) return null;
  // "SST Number : ..." is an identity, not an amount. Reject before any geometry runs.
  const rest = norm.slice(best.prefix.length).replace(/^[^a-z0-9]+/, "");
  const word = /^[a-z]+/.exec(rest);
  if (word && IDENTIFIER_WORDS.has(word[0])) return null;
  const rate = best.field === "invoice.tax_total" ? SST_RATE.exec(String(text ?? "")) : null;
  return { field_path: best.field, prefix: best.prefix, sst_rate: rate ? Number(rate[1]) : null };
}

/**
 * Cents for the accepted grammar, mirroring `_normalize_invoice_cents` so that "identical"
 * here means identical to the DB (which collapses duplicates on normalized cents, not on
 * text). Returns null for anything the DB would also refuse. Used ONLY to compare two
 * readings of the same field — never to emit a computed figure.
 */
export function centsOfRaw(raw) {
  const t = String(raw ?? "").trim().toUpperCase().replace(/MYR|RM/g, "").replace(/[,\s]/g, "");
  if (!t) return null;
  let negative = false;
  let v = t;
  if (/^\([0-9]+(?:\.[0-9]{1,2})?\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  } else if (!/^-?[0-9]+(?:\.[0-9]{1,2})?$/.test(v)) {
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

/** Is this a bare dash — the document's own "nil"? */
const isDash = (s) => DASH_ONLY.test(String(s ?? "").trim());

/** Amount-shaped but refused by the accept grammar (drives the `unparseable` counter). */
function looksLikeAmountAttempt(s) {
  const t = String(s ?? "").trim();
  if (!t || t.length > 24 || !/[0-9]/.test(t)) return false;
  return AMOUNT_SHAPED.test(t);
}

/**
 * Resolve ONE label occurrence to its amount. Returns a per-occurrence outcome:
 *   {status:'paired', value_raw, page, polygon, confidence, sign}
 *   {status:'nil'}          the document printed a dash — explicitly nothing, not 0.00
 *   {status:'absent'}       nothing in the pairing window that could be an amount
 *   {status:'ambiguous'}    more than one acceptable figure — emit nothing (0016:3609-3615)
 *   {status:'unparseable'}  something amount-shaped sat there and the grammar refused it
 */
function resolveOccurrence(lines, boxes, labelIndex, pageNumber, fieldPath, opts) {
  const label = boxes[labelIndex];
  const amounts = [];
  const dashes = [];
  let attempts = 0;
  for (let j = labelIndex + 1; j < lines.length; j++) {
    const box = boxes[j];
    if (!box) continue;
    if (box.x0 <= label.x0) continue; // the amount always sits to the RIGHT of its label
    if (Math.abs(box.y0 - label.y0) > opts.maxTopDeltaIn) continue;
    if (opts.requireVerticalOverlap && yOverlap(label, box) <= 0) continue;
    // READING-ORDER ADJACENCY, modulo sign glyphs. The amount is the next line after its
    // label on all six measured true pairs; a standalone dash is the one thing that may sit
    // between them, because a layout that prints its minus in a separate column emits that
    // glyph as its own line. Any OTHER intervening line means these are not one printed row.
    if (opts.requireIndexAdjacent && !onlyDashesBetween(lines, labelIndex, j)) continue;
    const text = content(lines[j]).trim();
    if (AMOUNT_STRICT.test(text)) amounts.push({ index: j, box, text });
    else if (isDash(text)) dashes.push({ index: j, box });
    else if (looksLikeAmountAttempt(text)) attempts += 1;
  }

  if (amounts.length > 1) return { status: "ambiguous" };
  if (amounts.length === 0) {
    // A DASH is the document saying NIL — explicitly nothing, which is not zero. Several
    // dashes are one statement; a dash plus an amount-shaped refusal is still a refusal.
    if (dashes.length > 0) return { status: "nil" };
    return { status: attempts > 0 ? "unparseable" : "absent" };
  }

  const [hit] = amounts;
  // A dash to the RIGHT of the figure is a second, competing statement about the same row.
  if (dashes.some((d) => d.box.x0 > hit.box.x0)) return { status: "ambiguous" };

  // The DETACHED MINUS: a dash between the label and the figure is that figure's sign, not a
  // value. `_normalize_invoice_cents` accepts "-0.40", and `invoice.rounding` is deliberately
  // the one component the DB's non-negative guard excludes (0022, check b2).
  //
  // For the five stated COMPONENTS a detached minus is not a sign to carry but a refusal:
  // ADR-047 fixes them positive-as-printed and the DB refuses negative cents outright, so a
  // component that appears to be negative is a document this reader cannot honestly read.
  const minus = dashes.length > 0;
  if (minus && fieldPath !== "invoice.rounding") return { status: "unparseable", reason: "detached_minus_on_component" };

  return {
    status: "paired",
    value_raw: minus ? `-${hit.text}` : hit.text,
    page: pageNumber,
    polygon: (lines[hit.index].polygon || []).map(Number),
    // Measured: Azure returns NO confidence on `pages[].lines[]` (only on words and typed
    // fields), so this is null in practice. Null is honest; a fabricated score is not, and
    // ADR-047 Q1 drops vendor confidence from gating entirely in any case.
    confidence: lines[hit.index]?.confidence == null ? null : Number(lines[hit.index].confidence),
    sign: minus ? "detached_minus" : "unsigned",
  };
}

/** True when nothing but standalone dashes lies between two line indices. */
function onlyDashesBetween(lines, from, to) {
  for (let k = from + 1; k < to; k++) {
    if (!isDash(content(lines[k]))) return false;
  }
  return true;
}

/**
 * Read the stated totals off `analyzeResult.pages[].lines[]`.
 *
 * UNIQUENESS-OR-NOTHING ACROSS THE WHOLE PAGE SET, not just per label. A totals figure is
 * commonly printed twice (the real receipt repeats its tax in a Tax Summary block), so two
 * label occurrences resolving to the SAME cents collapse to one emission exactly as the DB
 * collapses identical duplicates. Two occurrences resolving to DIFFERENT cents — or one
 * stating a figure while another states a dash — are a contradiction on the face of the
 * document, and the field is dropped. Any ambiguous or unparseable occurrence drops the
 * field outright: partial confidence in a figure is not a reason to emit it.
 *
 * @param {Array<{pageNumber?:number, lines?:Array<{content?:string, polygon?:number[], confidence?:number}>}>} pages
 * @param {object} [opts] pairing thresholds; see DEFAULT_READER_OPTS
 * @returns {{fields:Array<{field_path:string,value_raw:string,page:number,polygon:number[],confidence:number|null}>,
 *            receipt:object}}
 */
export function readTotalsFromLines(pages, opts = {}) {
  const settings = { ...DEFAULT_READER_OPTS, ...opts };
  const receipt = {
    matched: 0,
    absent: 0,
    ambiguous: 0,
    unparseable: 0,
    // Filled by the caller's typed-field reconciliation (see normalizeAzureInvoice).
    typed_disagreement: 0,
    typed_collapsed: 0,
    typed_recovered: 0,
    emitted: 0,
    sst_rate: null,
    fields: {},
  };
  const occurrences = new Map();

  for (const page of Array.isArray(pages) ? pages : []) {
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    if (lines.length === 0) continue;
    const pageNumber = Number(page?.pageNumber) || 1;
    const boxes = lines.map((line) => boxOf(line?.polygon));
    for (let i = 0; i < lines.length; i++) {
      if (!boxes[i]) continue;
      const hit = matchTotalsLabel(content(lines[i]));
      if (!hit) continue; // not a totals label: ignored, never counted (contract §2 X2 D2)
      // The stated rate is captured off the LABEL, so it survives even when the amount is a
      // dash (the real invoice states "Service Tax (8%)" against a nil figure).
      if (hit.sst_rate != null && receipt.sst_rate == null) receipt.sst_rate = hit.sst_rate;
      const outcome = resolveOccurrence(lines, boxes, i, pageNumber, hit.field_path, settings);
      outcome.label = content(lines[i]).trim();
      if (!occurrences.has(hit.field_path)) occurrences.set(hit.field_path, []);
      occurrences.get(hit.field_path).push(outcome);
    }
  }

  const fields = [];
  for (const field_path of TOTALS_FIELD_PATHS) {
    const found = occurrences.get(field_path);
    if (!found || found.length === 0) continue; // never printed: not a refusal, not counted
    const detail = { occurrences: found.length, labels: found.map((o) => o.label) };
    const blocked = found.find((o) => o.status === "ambiguous" || o.status === "unparseable");
    if (blocked) {
      detail.outcome = blocked.status;
      if (blocked.reason) detail.reason = blocked.reason;
      receipt[blocked.status] += 1;
      receipt.fields[field_path] = detail;
      continue;
    }
    const paired = found.filter((o) => o.status === "paired");
    const nils = found.filter((o) => o.status === "nil");
    if (paired.length === 0) {
      detail.outcome = nils.length > 0 ? "nil" : "absent";
      receipt.absent += 1;
      receipt.fields[field_path] = detail;
      continue;
    }
    const distinct = new Set(paired.map((o) => centsOfRaw(o.value_raw)));
    if (distinct.has(null) || distinct.size > 1 || nils.length > 0) {
      // Two different figures, or a figure contradicted by a printed dash. The DB would
      // forfeit the whole extraction on the former; both are refused here first.
      detail.outcome = "ambiguous";
      detail.values = paired.map((o) => o.value_raw);
      if (nils.length > 0) detail.reason = "value_vs_nil";
      receipt.ambiguous += 1;
      receipt.fields[field_path] = detail;
      continue;
    }
    const [{ value_raw, page, polygon, confidence, sign }] = paired;
    detail.outcome = "matched";
    detail.value_raw = value_raw;
    // The sign of a rounding adjustment is only knowable when the document prints it in a
    // place OCR captured. Recorded so a consumer can see that an unsigned rounding is a
    // reading of the glyphs present, not an assertion that the adjustment is positive.
    if (field_path === "invoice.rounding") detail.sign = sign;
    receipt.matched += 1;
    receipt.fields[field_path] = detail;
    fields.push({ field_path, value_raw, page, polygon, confidence });
  }

  return { fields, receipt };
}
