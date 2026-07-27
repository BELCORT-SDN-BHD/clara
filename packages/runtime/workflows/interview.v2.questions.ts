// @frozen
//
// FROZEN — the v2 question inventories (firm bootstrap + client onboarding). PURE data +
// builders (no "workflow" import).
//
// WHAT CHANGED FROM v1, and nothing else did:
//   F1  `ssm` validates through the full Malaysian registration grammar and records
//       { registration, normalized, form } instead of a bare string.
//   F2  `framework` became entity-type-aware over the option table, and gained a sibling
//       `accounting_basis` — two recorded axes, because a framework and a recognition basis are
//       not the same question. A Sdn Bhd is additionally asked the CA 2016 s.244 private-entity
//       screen (`mpers_eligibility`), which is the only fact that can turn an MPERS answer into
//       a statutory impossibility, and is asked of nobody else.
//       `entity_type` widened to eight shapes so those defaults are expressible at all.
//
// Everything else is v1 verbatim, and deliberately so: the salvaged wording, the turnover-gated
// TIN exemption and its ordering law, the AMB-11 opening-position ITEM KEYS (`first_year_zero_
// opening` / `carry_down_deferred` — read by name inside commit_client_onboarding, so they are
// a DB contract, not a label), the FORK-7 non-straight-line todo, and the O9 CoA-seed decision.
//
// The unchanged shared vocabularies (currencies, SST regimes, opening choices) are imported
// from the FROZEN v1 module rather than re-typed — one definition, hash-locked, no drift.

import {
  defaultItem,
  validateBusinessRegistration,
  validateEmail,
  validateEnum,
  validateFye,
  validateMsic,
  validateNonEmpty,
  validateOptionalText,
  validateTin,
  validateTurnover,
  tinExempt,
  registrationFormsSentence,
  type FollowUp,
  type PlanItemInput,
  type SegmentV2,
  type Validation,
} from "./interview.v2.core.js";
import { CURRENCIES, CURRENCY_SYNONYMS, SST_REGIMES, OPENING_CHOICES } from "./interview.v1.questions.js";
import {
  BASIS_OPTIONS,
  ELIGIBILITY_CHOICES,
  ELIGIBILITY_QUESTION,
  ELIGIBILITY_SYNONYMS,
  ENTITY_SYNONYMS_V2,
  ENTITY_TYPES_V2,
  FRAMEWORK_OPTIONS,
  OBSERVED_STATE_CHOICES,
  OBSERVED_STATE_NOTE_QUESTION,
  OBSERVED_STATE_QUESTION,
  OBSERVED_STATE_SYNONYMS,
  basisByAnswer,
  basisByCode,
  basisQuestionFor,
  basisWarnings,
  companyCashBasisRefusal,
  eligibilityOf,
  frameworkByAnswer,
  frameworkByCode,
  frameworkQuestionFor,
  frameworkWarnings,
  mpersEligibilityRefusal,
  normalizeChoice,
  recordFreeText,
  type BasisCode,
  type FrameworkCode,
} from "./interview.v2.frameworks.js";

// ---------------------------------------------------------------------------
// Shared validators.
// ---------------------------------------------------------------------------

/** validateTin, enforced only when the collected turnover band is not <RM1M (salvage Q8/Q4).
 *  Byte-for-byte the v1 rule; v1 keeps it private, so it is restated rather than diverged. */
function tinValidatorGatedByTurnover(raw: unknown, prior: Readonly<Record<string, unknown>>): Validation {
  if (tinExempt(prior["turnover"])) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || s.toLowerCase() === "skip") return { ok: true as const, value: null, echo: "TIN: not registered (turnover < RM1M)" };
  }
  return validateTin(raw);
}

const entityTypeQuestion = (subject: string): string =>
  `What is ${subject} entity type? (Sdn Bhd / Bhd (public) / Sole Prop / Partnership / LLP / Society / Co-operative / Other)`;

const registrationQuestion = (subject: string): string =>
  `What is ${subject} SSM registration number?\nAccepted: ${registrationFormsSentence()}.`;

// ---------------------------------------------------------------------------
// F2 — the framework segment (axis 1) and its follow-ups.
// ---------------------------------------------------------------------------

type FrameworkAnswer = {
  framework_code: FrameworkCode;
  framework_label: string;
  entity_type: unknown;
  mpers_eligibility: string;
  authority?: string;
  free_text?: { verbatim: string; normalized: string };
  framework_version?: string;
  framework_version_rule?: { mandatory_from: string; mandatory_version: string };
};

const frameworkAnswerOf = (value: unknown): FrameworkAnswer => value as FrameworkAnswer;

/** The listed-option sentence used in a refusal, so a refused answer always shows the way out. */
function frameworkChoiceList(): string {
  return FRAMEWORK_OPTIONS.map((o) => o.code).join(" / ");
}

function validateFramework(raw: unknown, prior: Readonly<Record<string, unknown>>): Validation {
  const option = frameworkByAnswer(raw);
  if (!option) {
    return { ok: false, reason: `I did not recognise that framework. Answer one of: ${frameworkChoiceList()} (or “other” to name a different one).` };
  }
  const refusal = mpersEligibilityRefusal(option.code, prior);
  if (refusal) return { ok: false, reason: refusal };
  const value: FrameworkAnswer = {
    framework_code: option.code,
    framework_label: option.label,
    entity_type: prior["entity_type"] ?? null,
    mpers_eligibility: eligibilityOf(prior),
  };
  if (option.authority) value.authority = option.authority;
  return { ok: true, value, echo: `framework ${option.label}` };
}

/** MANDATORY free text on the options that carry one (OTHER, and the regulator/contractual
 *  option's authority) — the memo's "mandatory free text and authority/source". Recorded
 *  verbatim AND normalized. */
const frameworkFreeTextFollowUp = (value: unknown): FollowUp | null => {
  const answer = frameworkAnswerOf(value);
  const option = frameworkByCode(answer.framework_code);
  const rule = option?.freeText;
  if (!rule) return null;
  return {
    question: rule.question,
    validate: (raw: unknown): Validation => {
      const s = String(raw ?? "").trim();
      if (!s || s.toLowerCase() === "skip") {
        return { ok: false, reason: `Naming the ${rule.label} is required for this option — it is what makes the record mean anything. Name it, or answer the framework question again with a listed option.` };
      }
      return { ok: true, value: s, echo: s };
    },
    fold: (v, followUpValue) => {
      const base = frameworkAnswerOf(v);
      const free = recordFreeText(followUpValue);
      return {
        value: { ...base, free_text: free },
        echo: `framework ${base.framework_label} — “${free.verbatim}”`,
      };
    },
  };
};

/** The EDITION question, for a framework that has more than one live edition. The dated rule
 *  (MPERS 2025 from 2027-01-01) is config, recorded alongside so a later reader knows which
 *  rule was in force when the answer was given. */
const frameworkVersionFollowUp = (value: unknown): FollowUp | null => {
  const answer = frameworkAnswerOf(value);
  const option = frameworkByCode(answer.framework_code);
  const rule = option?.versions;
  if (!rule) return null;
  return {
    question: rule.question,
    validate: (raw: unknown): Validation => {
      const n = normalizeChoice(raw);
      const hit = rule.options.find((o) => normalizeChoice(o.code) === n || o.aliases.includes(n));
      if (!hit) return { ok: false, reason: `Answer one of: ${rule.options.map((o) => o.label).join(" / ")}.` };
      return { ok: true, value: hit.code, echo: hit.label };
    },
    fold: (v, followUpValue) => {
      const base = frameworkAnswerOf(v);
      const hit = rule.options.find((o) => o.code === followUpValue);
      return {
        value: {
          ...base,
          framework_version: String(followUpValue),
          framework_version_rule: { mandatory_from: rule.mandatoryFrom, mandatory_version: rule.mandatoryVersion },
        },
        echo: `framework ${base.framework_label} — ${hit?.label ?? String(followUpValue)}`,
      };
    },
  };
};

const frameworkSegment = (subject: string): SegmentV2 => ({
  key: "framework",
  question: `On which reporting framework are ${subject} financial statements prepared?`,
  questionFor: (prior) => frameworkQuestionFor(prior, subject),
  requiredForCommit: true,
  skippable: false,
  validate: validateFramework,
  followUps: [frameworkFreeTextFollowUp, frameworkVersionFollowUp],
  warn: (value, prior) => frameworkWarnings(frameworkAnswerOf(value).framework_code, prior),
});

// ---------------------------------------------------------------------------
// F2 — the accounting-basis segment (axis 2) and the observed-state path.
// ---------------------------------------------------------------------------

type BasisAnswer = {
  accounting_basis: BasisCode;
  accounting_basis_label: string;
  entity_type: unknown;
  observed_basis?: BasisCode;
  observed_note?: { verbatim: string; normalized: string };
  remediation_required?: boolean;
  note?: { verbatim: string; normalized: string };
};

const basisAnswerOf = (value: unknown): BasisAnswer => value as BasisAnswer;

function validateBasis(raw: unknown, prior: Readonly<Record<string, unknown>>): Validation {
  const option = basisByAnswer(raw);
  if (!option) {
    return { ok: false, reason: `I did not recognise that basis. Answer one of: ${BASIS_OPTIONS.map((o) => o.code).join(" / ")}.` };
  }
  // A company + cash answer is NOT refused here: the observed-state follow-up must run first,
  // because "the records are on cash today" is a fact worth recording and "we will report on
  // cash" is the statutory impossibility. Refusing both would lose the first one.
  const value: BasisAnswer = {
    accounting_basis: option.code,
    accounting_basis_label: option.label,
    entity_type: prior["entity_type"] ?? null,
  };
  return { ok: true, value, echo: `accounting basis ${option.label}` };
}

/** HARD RULE 2's gate: only a COMPANY answering cash/modified-cash reaches this question. */
const observedStateFollowUp = (value: unknown, prior: Readonly<Record<string, unknown>>): FollowUp | null => {
  const answer = basisAnswerOf(value);
  const refusal = companyCashBasisRefusal(answer.accounting_basis, prior);
  if (!refusal) return null;
  return {
    question: OBSERVED_STATE_QUESTION,
    validate: validateEnum("that", OBSERVED_STATE_CHOICES, OBSERVED_STATE_SYNONYMS),
    fold: (v, followUpValue) => {
      const base = basisAnswerOf(v);
      if (followUpValue === "reporting") return { restart: refusal };
      const observed = base.accounting_basis;
      return {
        value: {
          ...base,
          accounting_basis: "UNDETERMINED" as BasisCode,
          accounting_basis_label: basisByCode("UNDETERMINED")?.label ?? "Undetermined",
          observed_basis: observed,
          remediation_required: true,
        },
        echo: `accounting basis UNDETERMINED — records observed on ${basisByCode(observed)?.label ?? observed}, remediation required`,
      };
    },
  };
};

/** The observed-state explanation. Asked only once the observed path is taken, and mandatory:
 *  an observed defect recorded without its explanation is a flag nobody can act on. */
const observedNoteFollowUp = (value: unknown): FollowUp | null => {
  const answer = basisAnswerOf(value);
  if (!answer.observed_basis || answer.observed_note) return null;
  return {
    question: OBSERVED_STATE_NOTE_QUESTION,
    validate: (raw: unknown): Validation => {
      const s = String(raw ?? "").trim();
      if (!s || s.toLowerCase() === "skip") return { ok: false, reason: "An explanation is required before an observed cash-basis record can be accepted — describe the records and the remediation planned." };
      return { ok: true, value: s, echo: s };
    },
    fold: (v, followUpValue) => {
      const base = basisAnswerOf(v);
      const note = recordFreeText(followUpValue);
      return {
        value: { ...base, observed_note: note },
        echo: `accounting basis UNDETERMINED — observed ${basisByCode(base.observed_basis)?.label ?? base.observed_basis}: “${note.verbatim}”`,
      };
    },
  };
};

/** The OTHER basis's mandatory description. */
const basisFreeTextFollowUp = (value: unknown): FollowUp | null => {
  const answer = basisAnswerOf(value);
  const rule = basisByCode(answer.accounting_basis)?.freeText;
  if (!rule) return null;
  return {
    question: rule.question,
    validate: (raw: unknown): Validation => {
      const s = String(raw ?? "").trim();
      if (!s || s.toLowerCase() === "skip") return { ok: false, reason: `Describing the ${rule.label} is required for this option. Describe it, or answer again with a listed option.` };
      return { ok: true, value: s, echo: s };
    },
    fold: (v, followUpValue) => {
      const base = basisAnswerOf(v);
      const note = recordFreeText(followUpValue);
      return { value: { ...base, note }, echo: `accounting basis ${base.accounting_basis_label} — “${note.verbatim}”` };
    },
  };
};

const accountingBasisSegment = (subject: string): SegmentV2 => ({
  key: "accounting_basis",
  question: `On what basis are ${subject} accounts prepared? (accrual / cash receipts-and-payments / modified cash / other)`,
  questionFor: (prior) => basisQuestionFor(prior, subject),
  requiredForCommit: true,
  skippable: false,
  validate: validateBasis,
  followUps: [observedStateFollowUp, observedNoteFollowUp, basisFreeTextFollowUp],
  warn: (value, prior) => basisWarnings(basisAnswerOf(value).accounting_basis, prior),
});

/** The CA 2016 s.244 private-entity screen — a Sdn Bhd's question only. A Bhd is ineligible as
 *  a matter of law (no question can change that) and an unincorporated entity has no statutory
 *  framework to be eligible for. */
const eligibilitySegment: SegmentV2 = {
  key: "mpers_eligibility",
  question: ELIGIBILITY_QUESTION,
  appliesTo: (prior) => prior["entity_type"] === "sdn_bhd",
  requiredForCommit: false,
  skippable: false,
  validate: (raw: unknown): Validation => {
    const v = validateEnum("that", ELIGIBILITY_CHOICES, ELIGIBILITY_SYNONYMS)(raw);
    if (!v.ok) return v;
    const determination = v.value === "yes" ? "ineligible" : "eligible";
    return {
      ok: true,
      value: { determination, test: "ca2016_s244_private_entity" },
      echo:
        determination === "eligible"
          ? "a private entity — MPERS is available (MFRS may still be elected)"
          : "NOT a private entity — MFRS applies",
    };
  },
};

// ---------------------------------------------------------------------------
// FIRM — the firm-bootstrap interview (v1's 11 questions, plus the two F2 axes).
// ---------------------------------------------------------------------------

export const FIRM_SEGMENTS_V2: readonly SegmentV2[] = [
  { key: "legal_name", question: "What is the firm's registered legal name?", requiredForCommit: true, skippable: false, validate: validateNonEmpty("legal name") },
  { key: "ssm", question: registrationQuestion("the firm's"), requiredForCommit: true, skippable: false, validate: validateBusinessRegistration },
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
  { key: "ssm", question: registrationQuestion("the client's"), requiredForCommit: true, skippable: false, validate: validateBusinessRegistration },
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
