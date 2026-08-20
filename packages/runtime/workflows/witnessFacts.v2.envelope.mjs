// @frozen
//
// witnessFacts_v2 — WIRE -> WRITER NORMALIZATION + THE COVERAGE RECEIPT (F-A2 opener ①).
//
// Split out of witnessFacts.v2.prompts.mjs at authoring for the same 500-line gate that split
// witnessFacts.v1.dispatch.mjs out of the v1 behaviour, and the seam is real: this file owns what
// happens to a model's ANSWER on its way to `clara.persist_witness_facts`, while the prompts file
// owns what the model was ASKED. Both are imported RELATIVELY by witnessFacts.v2.behavior.mjs, so
// freeze-lint hash-locks both — an edit here is a workflow-body edit exactly as an edit there is.
//
// WHAT F-A2 ① ADDS OVER v1: the `witness.coverage` receipt.
//
//   * LOCK 1 (page coverage complete) needs to know that the text channel saw the WHOLE region
//     list and WHICH OCR generation it read. v1 computed `{shown, truncated}` in
//     `buildWitnessTextPrompt` and used only `.prompt`; the pinned extraction id was validated by
//     the writer and then never written to any row. Re-deriving "the pinned extraction" inside a
//     predicate could resolve a DIFFERENT generation than the one actually read (a later OCR pass
//     moves the `version_n desc, id desc` winner), and a lock whose evidence may describe a
//     different read than the one under judgement is not a lock.
//   * LOCK 3 (no SST registration printed) needs to tell an HONEST `not_printed` from a
//     DOWNGRADED claim. `normalizeAnswer` returns the byte-identical `{state:"not_printed"}` for
//     both, and for a non-belt field nothing downstream separates them — so a model that said
//     "there IS an SST number" and then fumbled the quote would reach lock 3 wearing an honest
//     silence's clothes. `coverage.downgraded_fields` is where that difference survives.
//
// IT NEEDS NO DB CHANGE. The writer stores the envelope VERBATIM (0095:378) and
// `_witness_answers_ok` validates `witness.channel`, `witness.contest` and the `witness.answers`
// key vocabulary only (0095:207-221), so a `witness.coverage` object passes straight through to
// the evaluator that reads it.

import {
  WITNESS_BELT_FIELDS,
  WITNESS_RAW_MAX_CHARS,
  WITNESS_REFERENCE_ANSWER_FIELDS,
  WITNESS_CITATION_FIELDS,
  WITNESS_VALUE_SLOT_FIELDS,
} from "./witnessFacts.v2.prompts.mjs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The `corroboration_ineligible` reason a downgraded BELT answer stamps (M1/D5). */
export const WITNESS_ANSWER_UNUSABLE = "witness_answer_unusable";

// ---------------------------------------------------------------------------------------
// The coverage receipt.
// ---------------------------------------------------------------------------------------

/**
 * The TEXT channel's coverage receipt.
 *
 * EVERY MEMBER IS A READING, NEVER A DEFAULT. A count that is not a non-negative integer, or an
 * extraction id that is not a non-blank string, is OMITTED rather than coerced to 0 or "" — the
 * evaluator reads this receipt positively and refuses what it cannot read, so an omitted member
 * costs the arm (a refusal, the safe direction) while a coerced one would BUY the arm with a
 * number nobody measured.
 *
 * @param {{ ocrExtractionId?: unknown, regionsTotal?: unknown, shown?: unknown,
 *           truncated?: unknown, pages?: unknown }} [args]
 * @returns {Record<string, unknown>}
 */
export function witnessTextCoverage({ ocrExtractionId, regionsTotal, shown, truncated, pages } = {}) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (typeof ocrExtractionId === "string" && ocrExtractionId.trim() !== "") out.ocr_extraction_id = ocrExtractionId;
  if (Number.isInteger(regionsTotal) && Number(regionsTotal) >= 0) out.regions_total = Number(regionsTotal);
  if (Number.isInteger(shown) && Number(shown) >= 0) out.regions_shown = Number(shown);
  // A non-boolean `truncated` is NOT reported as false. The evaluator compares this against the
  // JSON boolean false, so omitting it refuses the arm — the correct verdict for a read that
  // cannot say whether it was truncated.
  if (typeof truncated === "boolean") out.truncated = truncated;
  if (Array.isArray(pages)) out.pages = pages.filter((p) => Number.isInteger(p));
  return out;
}

/**
 * The VISION channel's coverage receipt.
 *
 * The vision read is complete BY CONSTRUCTION and its receipt is STRUCTURAL rather than asserted:
 * `clara.persist_witness_facts` refuses any persist whose vision input pin is not
 * `documents.sha256` (0095:405-407), so a persisted vision row is itself proof the model was
 * handed the whole filed file — and the two pre-egress refusals (an unreadable media type, an
 * oversize payload) are terminal, so such a document never produces a pair at all. Recording the
 * digest here makes that wall READABLE rather than merely inferable; it does not re-litigate it,
 * and `truncated:false` is a fact about this channel rather than a default.
 *
 * The digest is copied THROUGH, never re-cased or re-derived: it must string-equal the
 * `input_pin` the writer checks against `documents.sha256`, and a receipt quietly disagreeing
 * with the pin beside it would be worse than no receipt at all.
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
// Wire -> writer normalization.
// ---------------------------------------------------------------------------------------

/**
 * One wire answer -> the writer's discriminated shape, plus whether it was DOWNGRADED.
 *
 * A downgrade is not a not_printed. `{state:"value"}` with a blank, over-long or otherwise
 * unusable rendering means the model SAID the document prints this field and then failed to quote
 * it — a DERIVED absence. Emitting a bare `not_printed` would dress that derivation in an honest
 * silence's clothes, and every belt treats `not_printed` as a legitimate absence arm. Law 27(2):
 * a derived absence falls to the fail-closed branch, so a BELT downgrade makes the caller stamp
 * `corroboration_ineligible` and the strict reader refuses the read outright.
 *
 * F-A2 ①/R6: FOR A NON-BELT FIELD THE DOWNGRADE IS STILL A FACT, and `toWriterEnvelope` now
 * RECORDS it in `coverage.downgraded_fields` instead of losing it.
 *
 * BYTE-EQUIVALENT TO v1 EXCEPT FOR THE VALUE-SLOT ROSTER: v1 branched on
 * WITNESS_REFERENCE_ANSWER_FIELDS (then exactly the two M3 fields); v2's roster gained the SST
 * field, which takes NO value slot, so the branch reads WITNESS_VALUE_SLOT_FIELDS — still exactly
 * those two names.
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
 * present.
 *
 * `downgraded_fields` IS ALWAYS AN ARRAY, on every channel, even when empty and even when no
 * coverage argument was supplied. Lock 3 reads it POSITIVELY — an absent or non-array list fails
 * the lock, which is the correct answer for a row whose receipt cannot be read (every v1-era row)
 * — so emitting the empty array is precisely what distinguishes "this read looked and downgraded
 * nothing" from "this read never measured".
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
    // R6: EVERY downgrade is recorded, belt or not. The persisted answer of a downgraded
    // reference field is byte-identical to an honest silence, so this receipt is the only place
    // the difference can survive — and it is the difference between "the document prints no SST
    // registration number" and "the model said it prints one and could not quote it".
    if (out.downgraded) downgradedFields.push(f);
    // D5: ONLY A BELT FIELD'S downgrade condemns the read. The reference answers carry no
    // amount and no belt term, so killing the amount verdict over a fumbled invoice-NUMBER quote
    // would refuse a document whose nine monetary members and both tokens are perfectly readable
    // — a far larger refusal than law 27(2) asks for. The reference downgrade still happens (the
    // answer becomes not_printed, its `value` drops); it just does not make the read ineligible.
    downgraded = downgraded || (out.downgraded && WITNESS_BELT_FIELDS.includes(f));
  }
  // N3: CONTEST FAILS TOWARD WITHDRAWAL. It is REQUIRED in the wire schema, so an absent or
  // non-boolean value is a broken read — and the marker's only effect is to WITHDRAW identity
  // fields. Only an explicit boolean false means "I looked and the party blocks agree".
  const receipt = coverage && typeof coverage === "object" && !Array.isArray(coverage) ? { ...coverage } : {};
  receipt.downgraded_fields = downgradedFields;
  const envelope = { witness: { channel, contest: src.contest !== false, answers, coverage: receipt } };
  // M1: one unusable BELT answer makes the whole read corroboration-ineligible and the
  // predicate's own gate (0023:309) refuses it. Whole-read rather than per-field on purpose: the
  // belts are a conjunction, so corroborating the other ten around a hole is the exact
  // permissive-by-omission shape law 27(2) exists to close.
  if (downgraded) envelope.corroboration_ineligible = WITNESS_ANSWER_UNUSABLE;
  return envelope;
}

/**
 * Normalize the TEXT channel's citations into the writer's array.
 *
 * A CONFLICTING DUPLICATE DROPS ITS FIELD ENTIRELY (M3). Two citations for one field_path that
 * differ make the writer forfeit the WHOLE call (0095 §6, the 0023 write-boundary idiom), so the
 * conflict is resolved HERE — by DISCARDING that field's geometry, not by keeping whichever
 * citation arrived first. The model was told a double citation is discarded, and first-wins
 * would promote a coin flip to evidence: picking one of two disagreeing claims and attaching a
 * real polygon to it. The fact persists GEOMETRY-LESS and C2 refuses it. Identical duplicates
 * are not a conflict and collapse silently. An unknown field_path, a non-integer idx, and a
 * reference citation with a missing or over-long quote are DROPPED the same way.
 *
 * F-A2 ①: `invoice.sst_registration` is NOT in WITNESS_CITATION_FIELDS, so a citation naming it
 * is dropped HERE rather than reaching the writer — where the deliberately unwidened allowlist
 * would forfeit the whole persist with CLR10. The model is told never to cite it; this is what
 * makes that instruction structural instead of hopeful.
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
    // `Number(null)` is 0 and `Number.isInteger(0)` is true, so a missing idx would sail through
    // a bare Number() coercion and reach the writer as region_idx 0 — a number the ordinal never
    // produces (it is 1-based), so it would resolve nothing and silently look like a failed
    // citation instead of the absent one it is. Read the type positively.
    if (typeof c?.region_idx !== "number" || !Number.isInteger(c.region_idx)) continue;
    const idx = c.region_idx;
    const isReferenceOnly = !WITNESS_BELT_FIELDS.includes(field);
    const raw = typeof c?.raw === "string" ? c.raw : "";
    /** @type {{field_path: string, region_idx: number, raw?: string}} */
    let entry;
    if (isReferenceOnly) {
      // The seven reference paths carry their quoted rendering in the CITATION (0095 §10) —
      // without one the writer inserts nothing at all, so an empty quote is a dropped citation.
      if (raw.trim() === "" || raw.length > WITNESS_RAW_MAX_CHARS) continue;
      entry = { field_path: field, region_idx: idx, raw };
    } else {
      // For a belt field the writer reads ONLY region_idx; the rendering is the answer's own
      // `raw`, the single locked source (0095 §9). A `raw` here would be a second copy — and it
      // is excluded from the conflict key for the same reason: two belt citations differing only
      // in `raw` name the SAME geometry and are not in conflict.
      entry = { field_path: field, region_idx: idx };
    }
    const key = JSON.stringify([entry.region_idx, entry.raw ?? null]);   // injective + PRINTABLE
    const seen = byField.get(field);
    if (seen === undefined) byField.set(field, { entry, key });
    else if (seen.key !== key) byField.set(field, null);   // CONFLICT -> drop the field outright
  }
  return [...byField.values()].filter((v) => v !== null).map((v) => v.entry);
}
