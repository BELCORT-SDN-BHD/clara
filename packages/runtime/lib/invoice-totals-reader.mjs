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
//
// The byte-level money grammar — what may be handed to the DB at all — lives next door in
// `invoice-amount-grammar.mjs`, calibrated against `_normalize_invoice_cents` rather than
// against geometry. `centsOfRaw` is re-exported here because it is also this module's EMIT
// GATE, and because callers reconciling reader output against typed fields need it.

import { ASCII_SPACE, asciiTrim, centsOfRaw, isDash, isStrictAmount, looksLikeAmountAttempt } from "./invoice-amount-grammar.mjs";

export { centsOfRaw };

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
  /** How far below a "Tax Summary" heading its repeat block reaches, in inches. Measured on
   *  the real receipt: heading top 13.855, last summary line bottom 14.469 — 0.61in. The
   *  default is rounded up to a full inch so a slightly taller block is still covered. */
  taxSummaryBandIn: 1.0,
  /** The amount must be the very next line in reading order. True on 6/6 measured pairs. */
  requireIndexAdjacent: true,
  /** The label box and the amount box must share a horizontal band (positive y overlap). */
  requireVerticalOverlap: true,
});

// A4 portrait width. Azure reports PDF geometry in inches but IMAGE geometry in PIXELS
// (`pages[].unit`), and an image invoice is a fully supported intake type — so a tolerance
// compared straight against raw coordinates silently refuses every total on a photographed
// bill (one pixel apart fails a 0.15 test). Coordinates are therefore normalized to
// FRACTIONS OF THE PAGE WIDTH before any comparison. For an inch page that is algebraically
// identical to comparing inches, so the measured calibration above is untouched; for a pixel
// page the ratified inch tolerance is carried across as the same fraction of width.
// HONEST ASSUMPTION, stated because it is one: a pixel page is assumed to be A4-portrait-
// shaped, which is what a Malaysian bill scan almost always is. A US-Letter or receipt-strip
// scan gets a proportionally tighter or looser window. The measured A4 capture reported
// 8.2639in against A4's nominal 8.2677in — a 0.05% difference, immaterial here.
const A4_WIDTH_IN = 8.2677;

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

// A TAX SUMMARY heading. Malaysian F&B receipts repeat the tax in a summary table whose
// columns are Taxable | Tax — and inside that block the line immediately after the rate label
// is the TAXABLE BASE, not the tax. On the real receipt that is 94.30 sitting exactly where
// the pairing rule expects 5.66. The main totals block states the same figures correctly, so
// refusing to anchor inside the summary costs nothing; what it buys is that an OCR run which
// drops or mangles the MAIN label — which is precisely what happened to the summary label in
// the measured capture — can never fall back to the taxable base and call it the tax.
// WIDE ON PURPOSE, and the mirror image of the accept grammar's ASCII strictness. This is a
// REFUSAL TRIGGER: matching it closes a region to anchoring, so a match can only ever cost a
// field and a miss can cost a wrong tax. The safe direction is therefore to match MORE, not
// less — a heading printed `Tax<NBSP>Summary` (or with a stray U+FEFF, or an ideographic
// space) must still open the band. JavaScript's `\s` covers NBSP, U+FEFF, the U+2000 block and
// U+3000, so it is exactly the right class here and exactly the wrong one three definitions
// away in the accept grammar. Same reasoning as AMOUNT_SHAPED's `\s`.
const TAX_SUMMARY_HEADING = /^tax summary/;
const isTaxSummaryHeading = (text) =>
  TAX_SUMMARY_HEADING.test(String(text ?? "").replace(LABEL_NOISE_PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase());

// Leading item counts / bullets / punctuation are stripped before matching: the real receipt
// prints its subtotal label as "11 SubTotal" (the line's own item count runs into the label).
const LABEL_NOISE_PREFIX = /^[ \t\d.,:;#*|()[\]\-‐-―−]+/;

const SST_RATE = /([0-9]{1,2}(?:\.[0-9]+)?)[ \t]*%/;

/**
 * Axis-aligned bounds of a flat Azure polygon [x1,y1,x2,y2,...], scaled into page-width
 * fractions, or null when unusable. `x0`/`y0` are the FIRST vertex (top-left) — the
 * coordinate the pairing window uses; min/max cover all vertices, which is what makes the
 * overlap test skew-tolerant.
 */
function boxOf(polygon, scale) {
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
  return { x0: xs[0], y0: ys[0], xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
}

/**
 * The coordinate frame for one page: how to scale its polygons, and the pairing tolerances
 * expressed in that same frame. Returns null when the page declares pixels but carries no
 * usable width — the frame is then unknowable, and comparing raw pixel counts against an inch
 * tolerance would refuse every pair on the page while looking like a clean read.
 */
export function pageFrame(page, opts) {
  const unit = String(page?.unit ?? "inch").toLowerCase();
  const width = Number(page?.width);
  const usableWidth = Number.isFinite(width) && width > 0 ? width : null;
  if (unit === "pixel" || unit === "pixels") {
    if (!usableWidth) return null;
    return {
      unit,
      scale: 1 / usableWidth,
      maxTopDelta: opts.maxTopDeltaIn / A4_WIDTH_IN,
      taxSummaryBand: opts.taxSummaryBandIn / A4_WIDTH_IN,
    };
  }
  // Inches (or an engine result that omits the unit, which every pre-X2 fixture does).
  // Dividing coordinates AND tolerances by the same width is an identity on the comparison,
  // so the measured inch calibration is preserved exactly.
  const scale = usableWidth ? 1 / usableWidth : 1;
  return {
    unit: usableWidth ? unit : "inch",
    scale,
    maxTopDelta: opts.maxTopDeltaIn * scale,
    taxSummaryBand: opts.taxSummaryBandIn * scale,
  };
}

/** Shared vertical band between two boxes, in the page's frame; <= 0 means different rows. */
const yOverlap = (a, b) => Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin);

const content = (line) => String(line?.content ?? "");

/** Lowercased, ASCII-whitespace-collapsed, leading-noise-stripped label text. */
function normalizeLabel(text) {
  return String(text ?? "").replace(LABEL_NOISE_PREFIX, "").replace(ASCII_SPACE, " ").trim().toLowerCase();
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
 * Resolve ONE label occurrence to its amount. Returns a per-occurrence outcome:
 *   {status:'paired', value_raw, page, polygon, confidence, sign}
 *   {status:'nil'}           the document printed a dash — explicitly nothing, not 0.00
 *   {status:'absent'}        nothing in the pairing window that could be an amount
 *   {status:'ambiguous'}     more than one acceptable figure — emit nothing (0016:3609-3615)
 *   {status:'unparseable'}   something amount-shaped sat there and the grammar refused it
 *   {status:'sign_unknown'}  a rounding figure whose printed sign was never captured
 */
function resolveOccurrence(lines, boxes, labelIndex, pageNumber, fieldPath, frame, opts) {
  const label = boxes[labelIndex];
  const amounts = [];
  const dashes = [];
  let attempts = 0;
  for (let j = labelIndex + 1; j < lines.length; j++) {
    const box = boxes[j];
    if (!box) continue;
    if (box.x0 <= label.x0) continue; // the amount always sits to the RIGHT of its label
    if (Math.abs(box.y0 - label.y0) > frame.maxTopDelta) continue;
    if (opts.requireVerticalOverlap && yOverlap(label, box) <= 0) continue;
    // READING-ORDER ADJACENCY, modulo a sign glyph ON THIS ROW. The amount is the next line
    // after its label on all six measured true pairs; the one thing that may legitimately sit
    // between them is a minus printed in its own column, which OCR emits as its own line. The
    // waiver is GEOMETRIC, not textual: a dash anywhere else on the page (a bullet, a nil in
    // another table) must never license a jump past the true neighbour to a later column.
    if (opts.requireIndexAdjacent && !onlyRowDashesBetween(lines, boxes, labelIndex, j, label)) continue;
    const text = asciiTrim(content(lines[j]));
    if (isStrictAmount(text)) amounts.push({ index: j, box, text });
    else if (isDash(text)) dashes.push({ index: j, box });
    else if (looksLikeAmountAttempt(text)) attempts += 1;
  }

  if (amounts.length > 1) return { status: "ambiguous" };
  if (amounts.length === 0) {
    // A DASH is the document saying NIL — explicitly nothing, which is not zero. An
    // amount-shaped token alongside it is still counted (see the field merge), so a visible
    // but unreadable component never hides behind the dash as if nothing were printed.
    if (dashes.length > 0) return { status: "nil", attempted: attempts > 0 };
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

  // ROUNDING WITHOUT AN AFFIRMATIVELY CAPTURED SIGN IS NOT A READING. A layout that prints
  // "- 0.40" with the minus in its own table column loses that glyph entirely (measured on the
  // real invoice: no dash line, no dash word, and even the table cell reads "0.40"), so the
  // magnitude survives and the sign does not. Emitting the bare magnitude is NOT refusal-safe:
  // on a taxless supplier bill no identity constrains the rounding leg, so a +0.04 where the
  // face reads -0.04 lets the supplier floor accept a draft whose expense is understated with
  // the rounding on the wrong side — every figure "read off the document" and the posting
  // still wrong. There is no signal left to recover from, so the field is refused and counted.
  // The cost is real and deliberate: a genuinely positive rounding is refused too, and the
  // document goes to a human. That is the correct price for never stating a figure the face
  // contradicts.
  if (!minus && fieldPath === "invoice.rounding") return { status: "sign_unknown" };

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

/**
 * True when everything between two line indices is a dash that BELONGS TO THIS ROW: sharing
 * the label's vertical band and sitting horizontally between the label and the candidate.
 * A dash elsewhere on the page waives nothing.
 */
function onlyRowDashesBetween(lines, boxes, from, to, label) {
  const candidate = boxes[to];
  for (let k = from + 1; k < to; k++) {
    if (!isDash(content(lines[k]))) return false;
    const box = boxes[k];
    if (!box) return false;
    if (yOverlap(label, box) <= 0) return false;
    if (box.x0 <= label.x0 || box.x0 >= candidate.x0) return false;
  }
  return true;
}

/** Vertical bands (in the page's own frame) that a Tax Summary heading closes to anchoring. */
function taxSummaryBands(lines, boxes, frame) {
  const bands = [];
  for (let i = 0; i < lines.length; i++) {
    if (!boxes[i]) continue;
    if (!isTaxSummaryHeading(content(lines[i]))) continue;
    bands.push({ top: boxes[i].ymin, bottom: boxes[i].ymin + frame.taxSummaryBand });
  }
  return bands;
}

/**
 * Read the stated totals off `analyzeResult.pages[].lines[]`.
 *
 * UNIQUENESS-OR-NOTHING ACROSS THE WHOLE PAGE SET, not just per label. A totals figure is
 * commonly printed twice, so two label occurrences resolving to the SAME cents collapse to one
 * emission exactly as the DB collapses identical duplicates. Two occurrences resolving to
 * DIFFERENT cents — or one stating a figure while another states a dash — are a contradiction
 * on the face of the document, and the field is dropped. Any ambiguous, unparseable or
 * unsigned-rounding occurrence drops the field outright: partial confidence in a figure is not
 * a reason to emit it.
 *
 * @param {Array<{pageNumber?:number, unit?:string, width?:number, lines?:Array<{content?:string, polygon?:number[], confidence?:number}>}>} pages
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
    sign_unknown: 0,
    tax_summary_suppressed: 0,
    // Filled by the caller's typed-field reconciliation (see normalizeAzureInvoice).
    typed_disagreement: 0,
    typed_collapsed: 0,
    typed_recovered: 0,
    typed_vs_dash: 0,
    emitted: 0,
    sst_rate: null,
    units: [],
    fields: {},
  };
  const occurrences = new Map();

  for (const page of Array.isArray(pages) ? pages : []) {
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    if (lines.length === 0) continue;
    const pageNumber = Number(page?.pageNumber) || 1;
    const frame = pageFrame(page, settings);
    if (!frame) {
      if (!receipt.units.includes("pixel:no-width")) receipt.units.push("pixel:no-width");
      continue;
    }
    if (!receipt.units.includes(frame.unit)) receipt.units.push(frame.unit);
    const boxes = lines.map((line) => boxOf(line?.polygon, frame.scale));
    const bands = taxSummaryBands(lines, boxes, frame);
    for (let i = 0; i < lines.length; i++) {
      if (!boxes[i]) continue;
      const hit = matchTotalsLabel(content(lines[i]));
      if (!hit) continue; // not a totals label: ignored, never counted (contract §2 X2 D2)
      if (bands.some((b) => boxes[i].ymin >= b.top && boxes[i].ymin <= b.bottom)) {
        receipt.tax_summary_suppressed += 1;
        continue;
      }
      // The stated rate is captured off the LABEL, so it survives even when the amount is a
      // dash (the real invoice states "Service Tax (8%)" against a nil figure).
      if (hit.sst_rate != null && receipt.sst_rate == null) receipt.sst_rate = hit.sst_rate;
      const outcome = resolveOccurrence(lines, boxes, i, pageNumber, hit.field_path, frame, settings);
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
    const record = (outcome, extra = {}) => {
      Object.assign(detail, { outcome }, extra);
      receipt.fields[field_path] = detail;
    };
    // An occurrence the reader could not resolve blocks the field however many others agree.
    const blocked = found.find((o) => o.status === "ambiguous" || o.status === "unparseable" || o.status === "sign_unknown");
    if (blocked) {
      record(blocked.status, blocked.reason ? { reason: blocked.reason } : {});
      if (blocked.status === "sign_unknown") {
        receipt.sign_unknown += 1;
        receipt.absent += 1; // absent-class: nothing is emitted for this field
      } else {
        receipt[blocked.status] += 1;
      }
      continue;
    }
    const paired = found.filter((o) => o.status === "paired");
    const nils = found.filter((o) => o.status === "nil");
    if (paired.length === 0) {
      record(nils.length > 0 ? "nil" : "absent");
      receipt.absent += 1;
      // A refused amount-shaped token sitting beside the dash is counted in its own right, so
      // a visible-but-unreadable component never reads as "nothing was printed here". The two
      // counters therefore describe SIGNALS, not a partition of the fields.
      if (nils.some((o) => o.attempted)) {
        detail.unparseable_attempt = true;
        receipt.unparseable += 1;
      }
      continue;
    }
    const distinct = new Set(paired.map((o) => centsOfRaw(o.value_raw)));
    if (distinct.has(null) || distinct.size > 1 || nils.length > 0) {
      // Two different figures, or a figure contradicted by a printed dash. The DB would
      // forfeit the whole extraction on the former; both are refused here first.
      record("ambiguous", { values: paired.map((o) => o.value_raw), ...(nils.length > 0 ? { reason: "value_vs_nil" } : {}) });
      receipt.ambiguous += 1;
      continue;
    }
    const [{ value_raw, page, polygon, confidence, sign }] = paired;
    // THE EMIT GATE, and the last thing standing between this module and a forfeited
    // extraction. Nothing leaves here whose EXACT emitted bytes fail to normalize under the
    // DB's own grammar — including the detached-minus composition, which is assembled AFTER
    // the accept grammar ran and would otherwise never be re-validated. Components are
    // additionally checked non-negative in cents, mirroring 0022's write boundary (check b2).
    const cents = centsOfRaw(value_raw);
    if (cents === null || (cents < 0 && field_path !== "invoice.rounding")) {
      record("unparseable", { reason: "emit_gate", values: [value_raw] });
      receipt.unparseable += 1;
      continue;
    }
    record("matched", { value_raw, ...(field_path === "invoice.rounding" ? { sign } : {}) });
    receipt.matched += 1;
    fields.push({ field_path, value_raw, page, polygon, confidence });
  }

  return { fields, receipt };
}
