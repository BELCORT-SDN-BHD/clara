// @frozen
//
// witnessFacts_v3 — WIRE -> WRITER NORMALIZATION + THE COVERAGE RECEIPT. Split out of
// witnessFacts.v3.prompts.mjs at authoring for the same 500-line gate v1/v2 split on. BYTE-FOR-
// BYTE witnessFacts.v2.envelope.mjs apart from ONE thing: `witnessTextCoverage` no longer accepts
// or emits a `pages` member.
//
// THE FIFTH FIX (the NEXT-ROUND QUEUE's finding 3, `docs/plan/completed/f-a2-window-ab-ceremony-
// asrun.md` §13): `coverage.pages` was emitted EMPTY on every text row in the 2026-08-21
// re-measure (20/20) — well-formed, present, typed as an array, and carrying NO information,
// because the region rows it is built from publish a null `page` on this corpus (0095/0092's own
// `locator->>'page'`-only read; `witnessFacts.v1.dispatch.mjs`'s `readCitationRegions` deliberately
// never substitutes an INFERRED page into the value it hands the prompt builder — "a region whose
// page we only inferred sorts correctly while still showing no page number... sorting is a
// presentation guess; a printed page number is a claim", witnessFacts.v1.dispatch.mjs:226-228).
// Fixing the ROOT CAUSE would mean widening what `clara.witness_citation_regions` publishes — a DB
// change, and a reversal of a deliberate runtime design choice this fix batch does not have a
// ruling to make. The finding's own recommendation names the other option explicitly: "fix in the
// v2 behavior (non-frozen), or DROP THE FIELD — before anything reads it." Verified against the
// live `evaluate_witness_fact_state_v2` body (finding 3's own words): no lock reads `pages`, so
// dropping it changes NO evaluator behaviour, corroborates nothing differently, and costs nothing
// — it only stops emitting a receipt member that always said `[]` and could later be mistaken for
// evidence of a zero-page read. `clara.persist_witness_facts` needs no DB change either way: the
// writer stores `witness.coverage` VERBATIM and validates no key vocabulary inside it (0095:378,
// 0095:207-221 — channel/contest/answers only), so a `coverage` object missing `pages` passes
// through exactly as one carrying `pages: []` always did.
//
// Everything else below — LOCK 1's page-coverage receipt (minus `pages`), LOCK 3's downgrade
// ledger, the wire->writer normalization, the citation conflict resolution — is v2's own logic,
// unmodified. See witnessFacts.v2.envelope.mjs for the full original rationale on each; it is not
// re-derived here because none of it changed.

import {
  WITNESS_BELT_FIELDS,
  WITNESS_RAW_MAX_CHARS,
  WITNESS_REFERENCE_ANSWER_FIELDS,
  WITNESS_CITATION_FIELDS,
  WITNESS_VALUE_SLOT_FIELDS,
} from "./witnessFacts.v3.prompts.mjs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The `corroboration_ineligible` reason a downgraded BELT answer stamps (M1/D5). BYTE-UNCHANGED
 *  FROM v2. */
export const WITNESS_ANSWER_UNUSABLE = "witness_answer_unusable";

// ---------------------------------------------------------------------------------------
// The coverage receipt.
// ---------------------------------------------------------------------------------------

/**
 * The TEXT channel's coverage receipt.
 *
 * EVERY MEMBER IS A READING, NEVER A DEFAULT — unchanged posture from v2. `pages` IS NO LONGER A
 * MEMBER OF THIS RECEIPT (the fifth fix, this file's header): the caller may still compute it
 * (`buildWitnessTextPrompt` still returns it) but this function no longer accepts or forwards it,
 * so `witness.coverage` never carries an always-empty `pages` key that nothing reads.
 *
 * @param {{ ocrExtractionId?: unknown, regionsTotal?: unknown, shown?: unknown,
 *           truncated?: unknown }} [args]
 * @returns {Record<string, unknown>}
 */
export function witnessTextCoverage({ ocrExtractionId, regionsTotal, shown, truncated } = {}) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (typeof ocrExtractionId === "string" && ocrExtractionId.trim() !== "") out.ocr_extraction_id = ocrExtractionId;
  if (Number.isInteger(regionsTotal) && Number(regionsTotal) >= 0) out.regions_total = Number(regionsTotal);
  if (Number.isInteger(shown) && Number(shown) >= 0) out.regions_shown = Number(shown);
  // A non-boolean `truncated` is NOT reported as false. The evaluator compares this against the
  // JSON boolean false, so omitting it refuses the arm — the correct verdict for a read that
  // cannot say whether it was truncated.
  if (typeof truncated === "boolean") out.truncated = truncated;
  return out;
}

/**
 * The VISION channel's coverage receipt. BYTE-UNCHANGED FROM v2 — the fifth fix is a TEXT-channel
 * receipt member only; the vision receipt never carried `pages` in the first place.
 *
 * @param {{ inputSha256?: unknown }} [args]
 * @returns {Record<string, unknown>}
 */
export function witnessVisionCoverage({ inputSha256 } = {}) {
  /** @type {Record<string, unknown>} */
  const out = { truncated: false };
  if (typeof inputSha256 === "string" && inputSha256.trim() !== "") out.input_sha256 = inputSha256;
  return out;
}

// ---------------------------------------------------------------------------------------
// Wire -> writer normalization. BYTE-UNCHANGED FROM v2 — see that file for the full rationale.
// ---------------------------------------------------------------------------------------

/**
 * One wire answer -> the writer's discriminated shape, plus whether it was DOWNGRADED.
 * BYTE-UNCHANGED FROM v2 (witnessFacts.v2.envelope.mjs's `normalizeAnswer`).
 */
function normalizeAnswer(field, wire) {
  const downgrade = { answer: { state: "not_printed" }, downgraded: true };
  if (!wire || typeof wire !== "object") return downgrade;
  if (wire.state === "not_printed") return { answer: { state: "not_printed" }, downgraded: false };
  if (wire.state !== "value") return downgrade;
  const raw = typeof wire.raw === "string" ? wire.raw.trim() : "";
  // A blank or over-long rendering is a REFUSED read, downgraded rather than sent: the writer
  // would refuse the whole call structurally (CLR10) for either, aborting a persist C4 requires
  // to complete. Never truncated — see WITNESS_RAW_MAX_CHARS.
  if (raw === "" || wire.raw.length > WITNESS_RAW_MAX_CHARS) return downgrade;
  const answer = { state: "value", raw: wire.raw };
  if (!WITNESS_VALUE_SLOT_FIELDS.includes(field)) return { answer, downgraded: false };
  const value = typeof wire.value === "string" ? wire.value.trim() : "";
  // A dropped `value` is NOT a downgrade: the reading itself stands on its `raw`, and the value
  // slot is an optional cross-regime convenience (M3). Only the ANSWER going unusable is one.
  if (value === "" || wire.value.length > WITNESS_RAW_MAX_CHARS) return { answer, downgraded: false };
  // The M3 write-verification, pre-applied so a bad `value` costs the KEY and never the call:
  // an id must be something the document actually prints, and a date must be a real ISO date.
  if (field === "invoice.invoice_id" && !wire.raw.includes(value)) return { answer, downgraded: false };
  if (field === "invoice.invoice_date") {
    if (!ISO_DATE.test(value)) return { answer, downgraded: false };
    const [y, m, d] = value.split("-").map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() + 1 !== m || probe.getUTCDate() !== d) {
      return { answer, downgraded: false };
    }
  }
  return { answer: { ...answer, value }, downgraded: false };
}

/**
 * Turn ONE channel's wire object into the envelope `clara.persist_witness_facts` locks
 * (0095 header): `{witness:{channel, contest, answers, coverage}}` with all eleven belt answers
 * present. BYTE-UNCHANGED FROM v2 — the receipt it is HANDED simply carries one fewer member on
 * the text channel now (this file's `witnessTextCoverage`, above).
 *
 * @param {"text"|"vision"} channel
 * @param {unknown} wire
 * @param {Record<string, unknown>} [coverage] the channel's receipt (witnessTextCoverage /
 *   witnessVisionCoverage). Absent or malformed -> only `downgraded_fields` is emitted and lock 1
 *   refuses the read; nothing is invented to fill the gap.
 */
export function toWriterEnvelope(channel, wire, coverage) {
  const src = /** @type {{answers?: Record<string, unknown>, contest?: unknown}} */ (wire ?? {});
  const answersIn = src.answers && typeof src.answers === "object" ? src.answers : {};
  /** @type {Record<string, unknown>} */
  const answers = {};
  /** @type {string[]} */
  const downgradedFields = [];
  let downgraded = false;
  for (const f of [...WITNESS_BELT_FIELDS, ...WITNESS_REFERENCE_ANSWER_FIELDS]) {
    const out = normalizeAnswer(f, answersIn[f]);
    answers[f] = out.answer;
    if (out.downgraded) downgradedFields.push(f);
    downgraded = downgraded || (out.downgraded && WITNESS_BELT_FIELDS.includes(f));
  }
  const receipt = coverage && typeof coverage === "object" && !Array.isArray(coverage) ? { ...coverage } : {};
  receipt.downgraded_fields = downgradedFields;
  const envelope = { witness: { channel, contest: src.contest !== false, answers, coverage: receipt } };
  if (downgraded) envelope.corroboration_ineligible = WITNESS_ANSWER_UNUSABLE;
  return envelope;
}

/**
 * Normalize the TEXT channel's citations into the writer's array. BYTE-UNCHANGED FROM v2 — see
 * witnessFacts.v2.envelope.mjs for the full rationale on the conflict-drop shape.
 *
 * @param {unknown} wire
 */
export function toWriterCitations(wire) {
  const list = Array.isArray(/** @type {{citations?: unknown}} */ (wire ?? {}).citations)
    ? /** @type {Array<Record<string, unknown>>} */ (/** @type {{citations: unknown[]}} */ (wire).citations)
    : [];
  /** @type {Map<string, {entry: {field_path: string, region_idx: number, raw?: string}, key: string} | null>} */
  const byField = new Map();
  for (const c of list) {
    const field = typeof c?.field_path === "string" ? c.field_path : "";
    if (!WITNESS_CITATION_FIELDS.includes(field)) continue;
    if (byField.get(field) === null) continue;      // already conflicted — stays dropped
    if (typeof c?.region_idx !== "number" || !Number.isInteger(c.region_idx)) continue;
    const idx = c.region_idx;
    const isReferenceOnly = !WITNESS_BELT_FIELDS.includes(field);
    const raw = typeof c?.raw === "string" ? c.raw : "";
    /** @type {{field_path: string, region_idx: number, raw?: string}} */
    let entry;
    if (isReferenceOnly) {
      if (raw.trim() === "" || raw.length > WITNESS_RAW_MAX_CHARS) continue;
      entry = { field_path: field, region_idx: idx, raw };
    } else {
      entry = { field_path: field, region_idx: idx };
    }
    const key = JSON.stringify([entry.region_idx, entry.raw ?? null]);   // injective + PRINTABLE
    const seen = byField.get(field);
    if (seen === undefined) byField.set(field, { entry, key });
    else if (seen.key !== key) byField.set(field, null);   // CONFLICT -> drop the field outright
  }
  return [...byField.values()].filter((v) => v !== null).map((v) => v.entry);
}
