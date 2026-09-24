// #941 — THE DEFERRED-REVENUE FORM'S PURE MIRROR, driven as pure functions.
//
// WHAT EACH CELL PINS:
//   tokens.*     every refusal token this surface renders a message for is one the create path
//                actually raises, spelled the DATABASE's way, and every one of them resolves to a
//                message this build ships. A token invented here would be a message that never
//                appears; a token missed would be a refusal the surface cannot name; a token whose
//                key is absent from `en.json` would put a key path on a bookkeeper's screen — and
//                `check-message-keys.mjs` cannot catch that one, because these keys are computed.
//   mirror.*     the validator refuses only what the door refuses, and nothing the door accepts. It
//                is deliberately shallow: everything that needs a ROW is the database's.
//   derived.*    the cadence is a CONSTANT this module states rather than a control the form
//                offers, and it is the one migration 0308 derives.
//   allocation.* which line carries the cent remainder — read off the evaluator's own
//                `remainder_placement: 'final_period'`, never recomputed from the amounts.
//   axis.*       the one axis whose remedy lives on ANOTHER page, in the database's own spelling.

import { test } from "node:test";
import assert from "node:assert/strict";

import messages from "../../messages/en.json";
import {
  EMPTY_RECOGNITION_DRAFT, NOT_ENROLLED_AXIS, RECOGNITION_DAY_RULE, RECOGNITION_FREQUENCY,
  RECOGNITION_REFUSAL, RECOGNITION_TIMEZONE, firstInvalidRecognitionField,
  recognitionFieldElementId, recognitionRefusalKey, residualIndex, validateRecognitionDraft,
  type RecognitionDraft,
} from "./schedule";

const VALID: RecognitionDraft = {
  sourceEntryId: "9f1d8e2c-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  authorityWorkId: "2b7c6d5e-4f3a-4b2c-8d1e-0f9a8b7c6d5e",
  revenueAccountCode: "4500",
  revenueAccountBasis: "a membership fee is membership income",
  purpose: "Annual membership recognition",
};

const CHART = new Set(["4500", "4600"]);

// ==============================================================================================
// 1 · The tokens.
// ==============================================================================================

test("941.tokens.database — every token this surface can render a message for is one the create path raises, in the DATABASE's own spelling", () => {
  // Eleven are migration 0308's own; `authority_ref_unresolved` is raised by
  // `clara.create_accounting_plan` (0193, recut by 0250) which this door calls, and
  // `client_not_found` / `client_inactive` / `operation_in_flight` are the shared preamble's.
  assert.deepEqual(Object.values(RECOGNITION_REFUSAL).sort(), [
    "authority_ref_unresolved",
    "client_inactive",
    "client_not_found",
    "deferred_revenue_amount_below_period_granularity",
    "deferred_revenue_schedule_exists",
    "deferred_revenue_source_unfit",
    "deferred_revenue_term_underivable",
    "invalid_purpose",
    "operation_in_flight",
    "recognition_pattern_unsupported",
    "revenue_recognition_period_line_missing",
    "revenue_recognition_schedule_not_found",
    "revenue_target_ineligible",
    "revenue_target_underivable",
  ]);
});

test("941.tokens.messages — each enumerated token answers its own key and ANYTHING else answers `unknown`, so an un-enumerated refusal still reaches the screen in the database's words", () => {
  for (const token of Object.values(RECOGNITION_REFUSAL)) {
    assert.equal(recognitionRefusalKey(token), `refusal_${token}`);
  }
  assert.equal(recognitionRefusalKey("a_token_this_build_has_never_seen"), "refusal_unknown");
  assert.equal(recognitionRefusalKey(null), "refusal_unknown");
  assert.equal(recognitionRefusalKey(undefined), "refusal_unknown");
});

test("941.tokens.copy — every key those tokens resolve to is a real sentence in en.json: these keys are COMPUTED, so the message-key lint cannot see them", () => {
  const copy = messages.DeferredRevenue as unknown as Record<string, string | undefined>;
  for (const token of Object.values(RECOGNITION_REFUSAL)) {
    const key = recognitionRefusalKey(token);
    assert.equal(typeof copy[key], "string", `no sentence for ${key}`);
  }
  // The FALLBACK deliberately has no sentence of its own: an unknown refusal renders the
  // database's own message beside the generic title, rather than a key path.
  assert.equal(copy.refusal_unknown, undefined);
});

// ==============================================================================================
// 2 · The mirror.
// ==============================================================================================

test("941.mirror.accepts — a well-formed draft passes, and passes WITHOUT a chart too: a failed chart read must not refuse every account", () => {
  assert.deepEqual(validateRecognitionDraft(VALID, CHART), []);
  assert.deepEqual(validateRecognitionDraft(VALID, null), []);
});

test("941.mirror.refuses — each of the five fields is refused when blank, with the code the form renders", () => {
  const cases: ReadonlyArray<[Partial<RecognitionDraft>, string, string]> = [
    [{ sourceEntryId: "" }, "sourceEntry", "sourceRequired"],
    [{ authorityWorkId: "" }, "authority", "authorityRequired"],
    [{ revenueAccountCode: "" }, "revenueAccount", "accountRequired"],
    [{ revenueAccountBasis: "   " }, "revenueBasis", "basisRequired"],
    [{ purpose: "  " }, "purpose", "purposeRequired"],
  ];
  for (const [patch, field, code] of cases) {
    const issues = validateRecognitionDraft({ ...VALID, ...patch }, CHART);
    assert.deepEqual(issues, [{ field, code }]);
  }
});

test("941.mirror.account_unknown — a code this client's chart does not hold is named HERE, because the door answers revenue_target_ineligible for it", () => {
  assert.deepEqual(
    validateRecognitionDraft({ ...VALID, revenueAccountCode: "9999" }, CHART),
    [{ field: "revenueAccount", code: "accountUnknown" }],
  );
});

test("941.mirror.shallow — the mirror NEVER claims a receipt is unfit, a term missing, an account unenrolled or an amount below granularity: all four need a row and are the database's", () => {
  const issues = validateRecognitionDraft(VALID, CHART);
  assert.deepEqual(issues, [],
    "a draft the door may still refuse for a reason that needs a row passes here");
  const codes = validateRecognitionDraft(EMPTY_RECOGNITION_DRAFT, CHART).map((i) => i.code);
  for (const invented of [
    "sourceUnfit", "termUnderivable", "notEnrolled", "belowGranularity", "patternUnsupported",
  ]) {
    assert.ok(!codes.includes(invented), `${invented} is the database's judgement, not this form's`);
  }
});

test("941.mirror.focus_order — a failed submit focuses the FIRST invalid control in the order the form reads, and the empty draft starts at the receipt", () => {
  assert.equal(
    firstInvalidRecognitionField(validateRecognitionDraft(EMPTY_RECOGNITION_DRAFT, CHART)),
    "sourceEntry");
  assert.equal(
    firstInvalidRecognitionField(validateRecognitionDraft(
      { ...EMPTY_RECOGNITION_DRAFT, sourceEntryId: VALID.sourceEntryId }, CHART)),
    "authority");
  assert.equal(
    firstInvalidRecognitionField(validateRecognitionDraft(
      { ...VALID, revenueAccountBasis: "", purpose: "" }, CHART)),
    "revenueBasis", "…and it walks the fields in reading order, not in issue order");
  assert.equal(firstInvalidRecognitionField([]), "sourceEntry",
    "a caller that asks with no issues at all is answered, never left undefined");
});

test("941.mirror.element_ids — each field's control id is stable, so a failed submit's focus target and its aria-describedby cannot drift apart", () => {
  assert.equal(recognitionFieldElementId("sourceEntry"), "deferred-revenue-sourceEntry");
  assert.equal(recognitionFieldElementId("authority"), "deferred-revenue-authority");
  assert.equal(recognitionFieldElementId("revenueAccount"), "deferred-revenue-revenueAccount");
  assert.equal(recognitionFieldElementId("revenueBasis"), "deferred-revenue-revenueBasis");
  assert.equal(recognitionFieldElementId("purpose"), "deferred-revenue-purpose");
});

// ==============================================================================================
// 3 · The derived cadence, and the remainder.
// ==============================================================================================

test("941.derived.cadence — the cadence is a CONSTANT this module states rather than a control the form offers, and it is the one 0308 derives", () => {
  assert.equal(RECOGNITION_FREQUENCY, "monthly");
  assert.equal(RECOGNITION_DAY_RULE, "last_day_of_month");
  assert.equal(RECOGNITION_TIMEZONE, "Asia/Kuala_Lumpur");
});

test("941.allocation.residual — the FINAL period carries the remainder, by the evaluator's own remainder_placement, and an empty allocation names no period at all", () => {
  assert.equal(residualIndex([{}, {}, {}]), 2);
  assert.equal(residualIndex([{}]), 0);
  assert.equal(residualIndex([]), -1,
    "nothing to mark is answered with 'no line', never with the last index of an empty list");
});

test("941.axis.not_enrolled — the one axis whose remedy lives on another page is spelled the database's way", () => {
  assert.equal(NOT_ENROLLED_AXIS, "deferred_account_not_enrolled");
});
