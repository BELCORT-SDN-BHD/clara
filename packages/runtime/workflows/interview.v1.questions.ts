// @frozen
//
// FROZEN — the salvaged interview question inventories (BELCORT firm-bootstrap 11-Q +
// client-onboarding 13-Q), adapted to Wave-B law. PURE data + builders (no "workflow"
// import). Content, validators, and echo discipline are salvaged; the old
// clarify-loop mechanics are NOT ported (the durable workflow replaces them).
//
// Wave-B adaptations vs the salvage:
//  - AMB-11: the opening-position question maps to item_keys 'first_year_zero_opening'
//    | 'carry_down_deferred' (the deferred item, item_kind='todo' state='deferred', is
//    the commit vehicle commit_client_onboarding accepts).
//  - FORK-3: must-asks are plan items (required_for_commit=true), never open_questions.
//  - FORK-7: a reported non-straight-line asset records a 'still to capture' TODO item.
//  - O9: the LHDN CoA seed is a DECISION recorded here; the upsert_account writes are the
//    HUMAN dashboard lane (interface note to the dashboard/ceremony lane).

import {
  type Segment,
  type PlanItemInput,
  defaultItem,
  validateSsm,
  validateTin,
  validateEmail,
  validateMsic,
  validateFye,
  validateNonEmpty,
  validateOptionalText,
  validateEnum,
  validateTurnover,
  tinExempt,
} from "./interview.v1.core.js";

const ENTITY_TYPES = ["sdn_bhd", "sole_prop", "partnership", "llp", "other"] as const;
const ENTITY_SYNONYMS: Record<string, string> = {
  "sdn_bhd": "sdn_bhd", "sendirian_berhad": "sdn_bhd",
  "sole_prop": "sole_prop", "sole_proprietor": "sole_prop", "enterprise": "sole_prop",
  "partnership": "partnership", "llp": "llp", "other": "other",
};
const CURRENCIES = ["MYR", "USD", "SGD", "EUR", "GBP", "OTHER"] as const;
const CURRENCY_SYNONYMS: Record<string, string> = { "rm": "MYR", "ringgit": "MYR", "ringgit_malaysia": "MYR", "myr": "MYR" };
const FRAMEWORKS = ["MPERS", "MFRS"] as const;
const FRAMEWORK_SYNONYMS: Record<string, string> = { "mpers": "MPERS", "private_entities": "MPERS", "mfrs": "MFRS" };
const SST_REGIMES = ["not_registered", "sales_tax", "service_tax", "both"] as const;

/** validateTin, but only enforced when the collected turnover band is not <RM1M
 *  (exempt bands may skip provisionally — salvage Q8/Q4). */
function tinValidatorGatedByTurnover(raw: unknown, prior: Readonly<Record<string, unknown>>) {
  if (tinExempt(prior["turnover"]) ) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || s.toLowerCase() === "skip") return { ok: true as const, value: null, echo: "TIN: not registered (turnover < RM1M)" };
  }
  return validateTin(raw);
}

// ---------------------------------------------------------------------------
// FIRM — the 11-question firm-bootstrap interview (pre-firm principal).
// ---------------------------------------------------------------------------

export const FIRM_SEGMENTS: readonly Segment[] = [
  { key: "legal_name", question: "What is the firm's registered legal name?", requiredForCommit: true, skippable: false, validate: validateNonEmpty("legal name") },
  { key: "ssm", question: "What is the firm's SSM registration number?", requiredForCommit: true, skippable: false, validate: validateSsm },
  { key: "entity_type", question: "What is the firm's entity type? (Sdn Bhd / Sole Prop / Partnership / LLP / Other)", requiredForCommit: true, skippable: false, validate: validateEnum("entity type", ENTITY_TYPES, ENTITY_SYNONYMS) },
  { key: "address", question: "What is the firm's registered address?", requiredForCommit: true, skippable: false, validate: validateNonEmpty("registered address") },
  { key: "mia", question: "What is the firm's MIA registration number? (optional — reply skip if none)", requiredForCommit: false, skippable: true, validate: validateOptionalText("MIA registration") },
  { key: "bookkeeper_email", question: "What is the bookkeeper's email address?", requiredForCommit: true, skippable: false, validate: validateEmail },
  { key: "turnover", question: "What is the firm's annual turnover band? (<RM1M / RM1M-5M / RM5M-25M / RM25M-100M / RM100M+)", requiredForCommit: true, skippable: false, validate: validateTurnover },
  { key: "tin", question: "What is the firm's MyInvois TIN? (required unless turnover < RM1M — reply skip only if exempt)", requiredForCommit: false, skippable: false, validate: tinValidatorGatedByTurnover },
  { key: "fye", question: "Which month is the firm's financial year-end? (1–12)", requiredForCommit: true, skippable: false, validate: validateFye },
  { key: "currency", question: "What is the firm's default currency? (MYR default)", requiredForCommit: false, skippable: true, validate: validateEnum("currency", CURRENCIES, CURRENCY_SYNONYMS) },
  { key: "framework", question: "Which accounting framework does the firm use? (MPERS default / MFRS)", requiredForCommit: true, skippable: false, validate: validateEnum("framework", FRAMEWORKS, FRAMEWORK_SYNONYMS) },
];

// ---------------------------------------------------------------------------
// CLIENT — the 13-question identity interview + Wave-B opening-position adaptations.
// ---------------------------------------------------------------------------

const OPENING_CHOICES = ["new_first_year", "ongoing_carry_down"] as const;
const OPENING_SYNONYMS: Record<string, string> = {
  "new": "new_first_year", "first_year": "new_first_year", "first_year_of_trading": "new_first_year",
  "zero": "new_first_year", "skip": "new_first_year",
  "ongoing": "ongoing_carry_down", "carry_down": "ongoing_carry_down", "existing": "ongoing_carry_down",
};

/** AMB-11: the opening-position answer maps to the commit-vehicle item_key. A new /
 *  first-year client asserts a zero opening (must_ask answered); an ongoing client
 *  defers the carry-down (todo/deferred — completed via the human K-lane / B-12). */
function openingItems(value: unknown): PlanItemInput[] {
  if (value === "new_first_year") {
    return [{ item_key: "first_year_zero_opening", item_kind: "must_ask", question: "Opening position", answer: { opening: "zero" }, state: "answered", required_for_commit: true }];
  }
  return [{ item_key: "carry_down_deferred", item_kind: "todo", question: "Carry down the prior-period closing position", answer: { opening: "carry_down", captured: false }, state: "deferred", required_for_commit: false }];
}

/** FORK-7: a reported non-straight-line asset cannot widen fixed_assets yet — record a
 *  'still to capture' TODO (the FA register row is completed later via B-12). */
function nonStraightLineItems(value: unknown): PlanItemInput[] {
  const has = value === "yes" || value === true;
  if (!has) return [{ item_key: "fa_depreciation_method", item_kind: "capture", question: "Non-straight-line fixed assets?", answer: { non_straight_line: false }, state: "answered", required_for_commit: false }];
  return [{ item_key: "fa_nonstraightline_todo", item_kind: "todo", question: "Capture non-straight-line fixed asset(s) (Wave-D depreciation engine pending)", answer: { non_straight_line: true, captured: false }, state: "deferred", required_for_commit: false }];
}

export const CLIENT_SEGMENTS: readonly Segment[] = [
  { key: "legal_name", question: "What is the client's registered legal name?", requiredForCommit: true, skippable: false, validate: validateNonEmpty("legal name") },
  { key: "entity_type", question: "What is the client's entity type? (Sdn Bhd / Sole Prop / Partnership / LLP / Other)", requiredForCommit: true, skippable: false, validate: validateEnum("entity type", ENTITY_TYPES, ENTITY_SYNONYMS) },
  { key: "ssm", question: "What is the client's SSM registration number?", requiredForCommit: true, skippable: false, validate: validateSsm },
  // turnover MUST precede tin: tinValidatorGatedByTurnover reads prior["turnover"] for the
  // <RM1M exemption (adjudication 7; the firm segment order is the same for the same reason).
  { key: "turnover", question: "What is the client's annual turnover band? (<RM1M / RM1M-5M / RM5M-25M / RM25M-100M / RM100M+)", requiredForCommit: true, skippable: false, validate: validateTurnover },
  { key: "tin", question: "What is the client's MyInvois TIN? (required unless turnover < RM1M — reply skip only if exempt)", requiredForCommit: false, skippable: false, validate: tinValidatorGatedByTurnover },
  { key: "msic", question: "What is the client's 5-digit MSIC industry code?", requiredForCommit: false, skippable: true, validate: validateMsic },
  { key: "sst_regime", question: "What is the client's SST registration? (not_registered / sales_tax / service_tax / both)", requiredForCommit: false, skippable: false, validate: validateEnum("SST regime", SST_REGIMES) },
  { key: "sst_no", question: "What is the client's SST registration number? (optional — reply skip if not registered)", requiredForCommit: false, skippable: true, validate: validateOptionalText("SST number") },
  { key: "statutory", question: "EPF / SOCSO / EIS / HRDF numbers? (optional — reply skip if no employees)", requiredForCommit: false, skippable: true, validate: validateOptionalText("statutory numbers") },
  { key: "banks", question: "List the client's bank accounts (bank + account number). (optional — reply skip if none yet)", requiredForCommit: false, skippable: true, validate: validateOptionalText("bank accounts") },
  { key: "currency", question: "What is the client's default currency? (MYR default)", requiredForCommit: false, skippable: true, validate: validateEnum("currency", CURRENCIES, CURRENCY_SYNONYMS) },
  { key: "fye", question: "Which month is the client's financial year-end? (1–12)", requiredForCommit: true, skippable: false, validate: validateFye },
  { key: "framework", question: "Which accounting framework? (MPERS default / MFRS)", requiredForCommit: true, skippable: false, validate: validateEnum("framework", FRAMEWORKS, FRAMEWORK_SYNONYMS) },
  { key: "coa_seed", question: "Apply the standard LHDN-aligned MPERS Chart of Accounts seed for this client? (yes / no)", requiredForCommit: true, skippable: false, validate: validateEnum("CoA seed decision", ["yes", "no"]),
    toItems: (v, seg) => [{ item_key: "coa_seed_decision", item_kind: "must_ask", question: seg.question, answer: { seed: v === "yes" ? "lhdn_mpers_standard" : "manual" }, state: "answered", required_for_commit: true }] },
  { key: "opening_position", question: "Is this a brand-new/first-year client (opening = 0), or an ongoing client with a prior-period closing position to carry down? (new_first_year / ongoing_carry_down)", requiredForCommit: true, skippable: false, validate: validateEnum("opening position", OPENING_CHOICES, OPENING_SYNONYMS), toItems: (v) => openingItems(v) },
  { key: "fa_depreciation", question: "Does the client hold any fixed assets on a NON-straight-line depreciation method? (yes / no)", requiredForCommit: false, skippable: true, validate: validateEnum("non-straight-line assets", ["yes", "no"]), toItems: (v) => nonStraightLineItems(v) },
  { key: "sample_invoices", question: "Do you have sample invoices (purchases / sales / vendor) to seed day-one coding knowledge? Attach them now, or reply skip.", requiredForCommit: false, skippable: true, validate: validateOptionalText("sample invoices"),
    toItems: (v, seg) => [{ item_key: "sample_invoices", item_kind: "capture", question: seg.question, answer: v ? { attached: true } : { attached: false }, state: "answered", required_for_commit: false }] },
];

// ---------------------------------------------------------------------------
// Firm intended-record builder (O7). The firm plan is written AFTER create_firm; the
// pre-commit answers live only in the run (P19, no plan yet), then land as capture items.
// ---------------------------------------------------------------------------

/** Build the firm plan's intended-vs-actual items from the collected pre-commit answers.
 *  Each answered segment becomes an answered capture/must_ask item; a first-client intent
 *  todo records the O7 follow-on (onboard the first client). */
export function buildFirmPlanItems(answers: Readonly<Record<string, unknown>>, answeredFirstClientIntent = false): PlanItemInput[] {
  const items: PlanItemInput[] = [];
  for (const seg of FIRM_SEGMENTS) {
    if (!(seg.key in answers)) continue;
    const value = answers[seg.key];
    items.push(seg.toItems ? seg.toItems(value, seg)[0]! : defaultItem(seg, value));
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

export { ENTITY_TYPES, CURRENCIES, FRAMEWORKS, SST_REGIMES, ENTITY_SYNONYMS, CURRENCY_SYNONYMS, FRAMEWORK_SYNONYMS, OPENING_CHOICES };
export type { PlanItemInput };
