// @frozen
//
// F2 — the SEGMENT BUILDERS: the registration segment (F1 grammar + the escape hatch), the
// framework segment and its follow-ups, the accounting-basis segment and the observed-state path,
// and the CA 2016 s.244 private-entity screen. Plus the shared validators the inventories reuse.
//
// The option TABLE is interview.v2.frameworks.ts and the GATES are interview.v2.rules.ts; this
// module is where a table row becomes a question a person is actually asked. Split out of
// interview.v2.questions.ts when it outgrew the repo size gate — that file now holds the two
// INVENTORIES (which segments, in which order) and nothing else.

import {
  insistUnverifiedRegistration,
  isUnverifiedRegistration,
  validateBusinessRegistration,
  validateEnum,
  validateTin,
  tinExempt,
  registrationFormsSentence,
  type FollowUp,
  type SegmentV2,
  type Validation,
} from "./interview.v2.core.js";
import {
  BASIS_OPTIONS,
  ELIGIBILITY_CHOICES,
  ELIGIBILITY_PARENT_CHOICES,
  ELIGIBILITY_PARENT_QUESTION,
  ELIGIBILITY_PARENT_SYNONYMS,
  ELIGIBILITY_QUESTION,
  ELIGIBILITY_SYNONYMS,
  FRAMEWORK_OPTIONS,
  basisByAnswer,
  basisByCode,
  basisQuestionFor,
  eligibilityOf,
  frameworkByAnswer,
  frameworkByCode,
  frameworkQuestionFor,
  normalizeChoice,
  recordFreeText,
  type BasisCode,
  type FrameworkCode,
} from "./interview.v2.frameworks.js";
import {
  OBSERVED_STATE_CHOICES,
  OBSERVED_STATE_NOTE_QUESTION,
  OBSERVED_STATE_QUESTION,
  OBSERVED_STATE_SYNONYMS,
  basisCodeFromFreeText,
  basisWarnings,
  companyCashBasisRefusal,
  frameworkCodeFromFreeText,
  frameworkWarnings,
  mpersEligibilityRefusal,
} from "./interview.v2.rules.js";

// ---------------------------------------------------------------------------
// Shared validators.
// ---------------------------------------------------------------------------

/** validateTin, enforced only when the collected turnover band is not <RM1M (salvage Q8/Q4).
 *  Byte-for-byte the v1 rule; v1 keeps it private, so it is restated rather than diverged. */
export function tinValidatorGatedByTurnover(raw: unknown, prior: Readonly<Record<string, unknown>>): Validation {
  if (tinExempt(prior["turnover"])) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || s.toLowerCase() === "skip") return { ok: true as const, value: null, echo: "TIN: not registered (turnover < RM1M)" };
  }
  return validateTin(raw);
}

export const entityTypeQuestion = (subject: string): string =>
  `What is ${subject} entity type? (Sdn Bhd / Bhd (public) / Sole Prop / Partnership / LLP / Society / Co-operative / Other)`;

const registrationQuestion = (subject: string): string =>
  `What is ${subject} SSM registration number?\nAccepted: ${registrationFormsSentence()}.`;

/**
 * The registration segment, shared by both inventories.
 *
 * It carries the ESCAPE HATCH (owner ruling 2026-07-27, "warning + record unverified"): the first
 * unrecognised answer is refused with the accepted formats; the same answer typed again is
 * recorded, marked `verified: false`, behind a warning the person must acknowledge. Widening the
 * grammar fixed the four families we know of and cannot fix the one nobody has met — so onboarding
 * never blocks on the validator's ignorance, and the record says plainly which identities the
 * product recognised and which it merely took down.
 */
export const registrationSegment = (subject: string): SegmentV2 => ({
  key: "ssm",
  question: registrationQuestion(subject),
  requiredForCommit: true,
  skippable: false,
  validate: validateBusinessRegistration,
  onInsist: (raw, previouslyRefused) => insistUnverifiedRegistration(raw, previouslyRefused),
  warn: (value) =>
    isUnverifiedRegistration(value)
      ? [{
          code: "registration_unverified",
          message:
            `“${(value as { registration?: string }).registration ?? ""}” is not a registration format this system recognises ` +
            `(${registrationFormsSentence()}). It will be recorded EXACTLY as you typed it and marked UNVERIFIED for a ` +
            `practitioner to check against the certificate. Nothing downstream will treat it as a confirmed identity.`,
        }]
      : [],
});

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
  /** Present when the code was reached by typing free text under OTHER (L2) — the record keeps
   *  the route as well as the destination, so a reviewer can see what was actually typed. */
  entered_as?: string;
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
const frameworkFreeTextFollowUp = (value: unknown, prior: Readonly<Record<string, unknown>>): FollowUp | null => {
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
      // L2 — SCREEN THE FREE TEXT BACK THROUGH THE SAME TABLE. `OTHER` is for naming something the
      // list does not carry, not for reaching a listed option without its gates: a Bhd could
      // answer OTHER and type "MPERS" and be recorded clean. If the text resolves to a real
      // option, the answer BECOMES that option here — so the hard refusals, the warnings and the
      // edition follow-up (evaluated after this one) all see the code they would have seen had it
      // been typed directly.
      const resolved = base.framework_code === "OTHER" ? frameworkCodeFromFreeText(free.verbatim) : null;
      if (resolved) {
        const refusal = mpersEligibilityRefusal(resolved, prior);
        if (refusal) return { restart: refusal };
        const option = frameworkByCode(resolved);
        const promoted: FrameworkAnswer = {
          ...base,
          framework_code: resolved,
          framework_label: option?.label ?? resolved,
          entered_as: "OTHER",
          free_text: free,
        };
        if (option?.authority) promoted.authority = option.authority;
        return { value: promoted, echo: `framework ${promoted.framework_label} (typed as “${free.verbatim}”)` };
      }
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

export const frameworkSegment = (subject: string): SegmentV2 => ({
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
  entered_as?: string;
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
      // L2, the basis half: "cash basis" typed under OTHER must reach the SAME reporting-vs-observed
      // flow and the same hard refusal it would have hit if typed directly. This follow-up is
      // ordered FIRST for exactly that reason — the observed-state follow-up runs after it and
      // reads the promoted code.
      const resolved = base.accounting_basis === "OTHER" ? basisCodeFromFreeText(note.verbatim) : null;
      if (resolved) {
        const option = basisByCode(resolved);
        return {
          value: { ...base, accounting_basis: resolved, accounting_basis_label: option?.label ?? resolved, entered_as: "OTHER", note },
          echo: `accounting basis ${option?.label ?? resolved} (typed as “${note.verbatim}”)`,
        };
      }
      return { value: { ...base, note }, echo: `accounting basis ${base.accounting_basis_label} — “${note.verbatim}”` };
    },
  };
};

export const accountingBasisSegment = (subject: string): SegmentV2 => ({
  key: "accounting_basis",
  question: `On what basis are ${subject} accounts prepared? (accrual / cash receipts-and-payments / modified cash / other)`,
  questionFor: (prior) => basisQuestionFor(prior, subject),
  requiredForCommit: true,
  skippable: false,
  validate: validateBasis,
  // ORDER IS LOAD-BEARING (L2): the free-text screen runs FIRST so an OTHER answer whose text
  // resolves to a real basis is promoted before the observed-state gate reads the code. With the
  // old order ("cash basis" typed under OTHER) the gate had already declined by the time the
  // promotion happened, and the company cash-basis rule never fired at all.
  followUps: [basisFreeTextFollowUp, observedStateFollowUp, observedNoteFollowUp],
  warn: (value, prior) => basisWarnings(basisAnswerOf(value).accounting_basis, prior),
});

/** The CA 2016 s.244 private-entity screen — a Sdn Bhd's question only. A Bhd is ineligible as
 *  a matter of law (no question can change that) and an unincorporated entity has no statutory
 *  framework to be eligible for. */
export const eligibilitySegment: SegmentV2 = {
  key: "mpers_eligibility",
  question: ELIGIBILITY_QUESTION,
  appliesTo: (prior) => prior["entity_type"] === "sdn_bhd",
  requiredForCommit: false,
  skippable: false,
  validate: (raw: unknown): Validation => {
    const v = validateEnum("that", ELIGIBILITY_CHOICES, ELIGIBILITY_SYNONYMS)(raw);
    if (!v.ok) return v;
    if (v.value === "parent_unknown") {
      // Not a determination yet — the follow-up below asks the limb that decides it.
      return { ok: true, value: { determination: "parent_unknown", test: "ca2016_s244_private_entity" }, echo: "a subsidiary/associate — of whom?" };
    }
    const determination = v.value === "yes" ? "ineligible" : "eligible";
    return { ok: true, value: { determination, test: "ca2016_s244_private_entity" }, echo: eligibilityEcho(determination) };
  },
  followUps: [
    (value) => {
      const rec = value as { determination?: string };
      if (rec.determination !== "parent_unknown") return null;
      return {
        question: ELIGIBILITY_PARENT_QUESTION,
        validate: validateEnum("that", ELIGIBILITY_PARENT_CHOICES, ELIGIBILITY_PARENT_SYNONYMS),
        fold: (v, followUpValue) => {
          const determination = followUpValue === "yes" ? "ineligible" : "eligible";
          return {
            value: { ...(v as Record<string, unknown>), determination, parent_test: followUpValue === "yes" ? "regulated_or_listed_parent" : "ordinary_private_parent" },
            echo: eligibilityEcho(determination),
          };
        },
      };
    },
  ],
};

const eligibilityEcho = (determination: string): string =>
  determination === "eligible"
    ? "a private entity — MPERS is available (MFRS may still be elected)"
    : "NOT a private entity — MFRS applies";

