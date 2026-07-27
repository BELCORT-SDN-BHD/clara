// @frozen
//
// FROZEN — the v2 question INVENTORIES: which segments each interview asks, and in what order.
// The segments themselves are built in interview.v2.segments.ts, over the option table
// (interview.v2.frameworks.ts) and its gates (interview.v2.rules.ts).
//
// WHAT CHANGED FROM v1, and nothing else did:
//   F1  the `ssm` segment validates through the full Malaysian registration grammar, records
//       { registration, normalized, form, format_verified }, and can record an insisted
//       unrecognised value behind an acknowledged warning rather than blocking onboarding.
//   F2  `framework` became entity-type-aware over the option table, and gained a sibling
//       `accounting_basis` — two recorded axes, because a framework and a recognition basis are
//       not the same question. A Sdn Bhd is additionally asked the CA 2016 s.244 private-entity
//       screen (`mpers_eligibility`), which is the only fact that can turn an MPERS answer into a
//       statutory impossibility, and is asked of nobody else.
//       `entity_type` widened to eight shapes so those defaults are expressible at all.
//
// Everything else is v1 verbatim, and deliberately so: the salvaged wording, the turnover-gated
// TIN exemption and its ordering law, the AMB-11 opening-position ITEM KEYS
// (`first_year_zero_opening` / `carry_down_deferred` — read BY NAME inside
// commit_client_onboarding, so they are a DB contract, not a label), the FORK-7
// non-straight-line todo, and the O9 CoA-seed decision.

import { defaultItem, validateEnum, validateEmail, validateFye, validateMsic, validateNonEmpty, validateOptionalText, validateTurnover, type PlanItemInput, type SegmentV2 } from "./interview.v2.core.js";
import { CURRENCIES, CURRENCY_SYNONYMS, SST_REGIMES, OPENING_CHOICES } from "./interview.v1.questions.js";
import { ENTITY_SYNONYMS_V2, ENTITY_TYPES_V2 } from "./interview.v2.frameworks.js";
import { accountingBasisSegment, eligibilitySegment, entityTypeQuestion, frameworkSegment, registrationSegment, tinValidatorGatedByTurnover } from "./interview.v2.segments.js";

// ---------------------------------------------------------------------------
// FIRM — the firm-bootstrap interview (v1's 11 questions, plus the two F2 axes).
// ---------------------------------------------------------------------------

export const FIRM_SEGMENTS_V2: readonly SegmentV2[] = [
  { key: "legal_name", question: "What is the firm's registered legal name?", requiredForCommit: true, skippable: false, validate: validateNonEmpty("legal name") },
  registrationSegment("the firm's"),
  { key: "entity_type", question: entityTypeQuestion("the firm's"), requiredForCommit: true, skippable: false, validate: validateEnum("entity type", ENTITY_TYPES_V2, ENTITY_SYNONYMS_V2) },
  { key: "address", question: "What is the firm's registered address?", requiredForCommit: true, skippable: false, validate: validateNonEmpty("registered address") },
  { key: "mia", question: "What is the firm's MIA registration number? (optional — reply skip if none)", requiredForCommit: false, skippable: true, validate: validateOptionalText("MIA registration") },
  { key: "bookkeeper_email", question: "What is the bookkeeper's email address?", requiredForCommit: true, skippable: false, validate: validateEmail },
  { key: "turnover", question: "What is the firm's annual turnover band? (<RM1M / RM1M-5M / RM5M-25M / RM25M-100M / RM100M+)", requiredForCommit: true, skippable: false, validate: validateTurnover },
  { key: "tin", question: "What is the firm's MyInvois TIN? (required unless turnover < RM1M — reply skip only if exempt)", requiredForCommit: false, skippable: false, validate: tinValidatorGatedByTurnover },
  { key: "fye", question: "Which month is the firm's financial year-end? (1–12)", requiredForCommit: true, skippable: false, validate: validateFye },
  { key: "currency", question: "What is the firm's default currency? (MYR default)", requiredForCommit: false, skippable: true, validate: validateEnum("currency", CURRENCIES, CURRENCY_SYNONYMS) },
  eligibilitySegment,
  frameworkSegment("the firm's"),
  accountingBasisSegment("the firm's"),
];

// ---------------------------------------------------------------------------
// CLIENT — the 13-question identity interview + the Wave-B adaptations, plus the F2 axes.
// ---------------------------------------------------------------------------

const OPENING_SYNONYMS: Record<string, string> = {
  "new": "new_first_year", "first_year": "new_first_year", "first_year_of_trading": "new_first_year",
  "zero": "new_first_year", "skip": "new_first_year",
  "ongoing": "ongoing_carry_down", "carry_down": "ongoing_carry_down", "existing": "ongoing_carry_down",
};

/** AMB-11 — VERBATIM from v1: these item_keys are read BY NAME inside commit_client_onboarding
 *  (0017), so they are a DB contract. A rename here silently breaks the client-activation gate. */
function openingItems(value: unknown): PlanItemInput[] {
  if (value === "new_first_year") {
    return [{ item_key: "first_year_zero_opening", item_kind: "must_ask", question: "Opening position", answer: { opening: "zero" }, state: "answered", required_for_commit: true }];
  }
  return [{ item_key: "carry_down_deferred", item_kind: "todo", question: "Carry down the prior-period closing position", answer: { opening: "carry_down", captured: false }, state: "deferred", required_for_commit: false }];
}

/** FORK-7 — VERBATIM from v1. */
function nonStraightLineItems(value: unknown): PlanItemInput[] {
  const has = value === "yes" || value === true;
  if (!has) return [{ item_key: "fa_depreciation_method", item_kind: "capture", question: "Non-straight-line fixed assets?", answer: { non_straight_line: false }, state: "answered", required_for_commit: false }];
  return [{ item_key: "fa_nonstraightline_todo", item_kind: "todo", question: "Capture non-straight-line fixed asset(s) (Wave-D depreciation engine pending)", answer: { non_straight_line: true, captured: false }, state: "deferred", required_for_commit: false }];
}

export const CLIENT_SEGMENTS_V2: readonly SegmentV2[] = [
  { key: "legal_name", question: "What is the client's registered legal name?", requiredForCommit: true, skippable: false, validate: validateNonEmpty("legal name") },
  { key: "entity_type", question: entityTypeQuestion("the client's"), requiredForCommit: true, skippable: false, validate: validateEnum("entity type", ENTITY_TYPES_V2, ENTITY_SYNONYMS_V2) },
  registrationSegment("the client's"),
  // turnover MUST precede tin (adjudication 7): the <RM1M exemption reads prior["turnover"].
  { key: "turnover", question: "What is the client's annual turnover band? (<RM1M / RM1M-5M / RM5M-25M / RM25M-100M / RM100M+)", requiredForCommit: true, skippable: false, validate: validateTurnover },
  { key: "tin", question: "What is the client's MyInvois TIN? (required unless turnover < RM1M — reply skip only if exempt)", requiredForCommit: false, skippable: false, validate: tinValidatorGatedByTurnover },
  { key: "msic", question: "What is the client's 5-digit MSIC industry code?", requiredForCommit: false, skippable: true, validate: validateMsic },
  { key: "sst_regime", question: "What is the client's SST registration? (not_registered / sales_tax / service_tax / both)", requiredForCommit: false, skippable: false, validate: validateEnum("SST regime", SST_REGIMES) },
  { key: "sst_no", question: "What is the client's SST registration number? (optional — reply skip if not registered)", requiredForCommit: false, skippable: true, validate: validateOptionalText("SST number") },
  { key: "statutory", question: "EPF / SOCSO / EIS / HRDF numbers? (optional — reply skip if no employees)", requiredForCommit: false, skippable: true, validate: validateOptionalText("statutory numbers") },
  { key: "banks", question: "List the client's bank accounts (bank + account number). (optional — reply skip if none yet)", requiredForCommit: false, skippable: true, validate: validateOptionalText("bank accounts") },
  { key: "currency", question: "What is the client's default currency? (MYR default)", requiredForCommit: false, skippable: true, validate: validateEnum("currency", CURRENCIES, CURRENCY_SYNONYMS) },
  { key: "fye", question: "Which month is the client's financial year-end? (1–12)", requiredForCommit: true, skippable: false, validate: validateFye },
  eligibilitySegment,
  frameworkSegment("the client's"),
  accountingBasisSegment("the client's"),
  { key: "coa_seed", question: "Apply the standard LHDN-aligned MPERS Chart of Accounts seed for this client? (yes / no)", requiredForCommit: true, skippable: false, validate: validateEnum("CoA seed decision", ["yes", "no"]),
    toItems: (v, seg) => [{ item_key: "coa_seed_decision", item_kind: "must_ask", question: seg.question, answer: { seed: v === "yes" ? "lhdn_mpers_standard" : "manual" }, state: "answered", required_for_commit: true }] },
  { key: "opening_position", question: "Is this a brand-new/first-year client (opening = 0), or an ongoing client with a prior-period closing position to carry down? (new_first_year / ongoing_carry_down)", requiredForCommit: true, skippable: false, validate: validateEnum("opening position", OPENING_CHOICES, OPENING_SYNONYMS), toItems: (v) => openingItems(v) },
  { key: "fa_depreciation", question: "Does the client hold any fixed assets on a NON-straight-line depreciation method? (yes / no)", requiredForCommit: false, skippable: true, validate: validateEnum("non-straight-line assets", ["yes", "no"]), toItems: (v) => nonStraightLineItems(v) },
  { key: "sample_invoices", question: "Do you have sample invoices (purchases / sales / vendor) to seed day-one coding knowledge? Attach them now, or reply skip.", requiredForCommit: false, skippable: true, validate: validateOptionalText("sample invoices"),
    toItems: (v, seg) => [{ item_key: "sample_invoices", item_kind: "capture", question: seg.question, answer: v ? { attached: true } : { attached: false }, state: "answered", required_for_commit: false }] },
];

// ---------------------------------------------------------------------------
// Firm intended-record builder (O7) — v1's, with two corrections that only v2 can carry.
// ---------------------------------------------------------------------------

/**
 * Build the firm plan's intended-vs-actual items from the collected pre-commit answers.
 *
 * Unlike v1 this keeps EVERY item a segment produces (v1 took `toItems(...)[0]` and would have
 * dropped the rest had a firm segment ever produced two), and it records each segment's question
 * as the segment declares it. A skipped or inapplicable segment simply has no key in `answers`
 * and contributes nothing — which is how the Sdn Bhd-only eligibility screen stays absent from a
 * sole proprietor's plan rather than appearing unanswered.
 */
export function buildFirmPlanItemsV2(answers: Readonly<Record<string, unknown>>, answeredFirstClientIntent = false): PlanItemInput[] {
  const items: PlanItemInput[] = [];
  for (const seg of FIRM_SEGMENTS_V2) {
    if (!(seg.key in answers)) continue;
    const value = answers[seg.key];
    if (seg.toItems) items.push(...seg.toItems(value, seg));
    else items.push(defaultItem(seg, value));
  }
  items.push({
    item_key: "first_client_onboarding",
    item_kind: "todo",
    question: "Onboard the firm's first client",
    answer: { intended: answeredFirstClientIntent },
    state: answeredFirstClientIntent ? "answered" : "deferred",
    required_for_commit: false,
  });
  return items;
}

export { CURRENCIES, CURRENCY_SYNONYMS, SST_REGIMES, OPENING_CHOICES, ENTITY_TYPES_V2, ENTITY_SYNONYMS_V2 };
export type { PlanItemInput, SegmentV2 };
