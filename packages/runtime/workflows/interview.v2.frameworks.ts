// @frozen
//
// F2 — the reporting-framework OPTION TABLE, as DATA. Imported by interview.v2.questions.ts;
// pure (no "workflow" / "use step" import), so the whole thing is closure-testable.
//
// WHY A TABLE AND NOT A LIST OF IF-STATEMENTS. The v1 question offered exactly two answers,
// MPERS or MFRS, which is a Sdn Bhd's choice presented as if it were everyone's. A sole
// proprietor has no MASB-mandated framework at all (ROBA 1956 is a registration regime; ITA
// 1967 s.82 asks for sufficient records, not a standard), and an LLP is told by SSM in terms
// that no approved accounting standard is imposed on it. Answering "MPERS" for either is not a
// small inaccuracy — it is a compliance assertion the firm did not make. So the question became
// TWO recorded axes over an entity-type-conditional table, and everything a future ruling might
// change (the option list, the labels, the entity defaults, the version dates, which
// combinations block and which warn) is a row here rather than a branch in the driver.
//
// THE TWO AXES, and why they are not one question (research memo, 2026-07-27, statute-anchored):
// MPERS/MFRS are REPORTING FRAMEWORKS; accrual/cash is a RECOGNITION BASIS. Offering them in one
// list invites "cash basis" to be recorded where a framework belongs, which is how a company
// ends up with a basis its statutory accounts cannot lawfully use. `framework_code` and
// `accounting_basis` are asked and recorded separately.
//
// STATUTORY ANCHORS (owner-adjudicated 2026-07-27; the memo lands separately as a docs receipt):
//   · CA 2016 s.244 — a company applies applicable MASB-approved standards; s.245 — records.
//   · MASB private-entity scope — MPERS is available to a PRIVATE entity, in its entirety, or
//     it may elect MFRS in its entirety. No size test. A public company (Bhd), or a Sdn Bhd
//     that is a subsidiary/associate/JCE of a listed or SC/BNM-regulated entity, is NOT a
//     private entity and applies MFRS.
//   · LLP Act 2012 s.69 — true-and-fair records, seven-year retention; no approved standard
//     imposed. LHDN PR 8/2022 expects normal-format P&L/BS or detailed alternative records.
//   · ITA 1967 s.82 + LHDN PR 5/2000 (Rev) — sufficient records; the simplified cashbook is
//     permitted for a defined small business and is NOT blanket authority for cash-basis
//     financial statements (year-end stock/WIP is still required).
//   · MPERS (2025) is mandatory for periods beginning on or after 2027-01-01, early adoption
//     permitted — a DATED rule in the version table below, never an enum value.
//
// VALIDATION POSTURE (house doctrine — refuse nothing silently): exactly TWO combinations are
// refused outright, both statutory impossibilities, and both refuse LOUDLY (the question is
// re-asked carrying the reason). Everything else that is unusual is recorded WITH a visible
// warning the answerer must acknowledge, and the acknowledgement is persisted next to the
// answer. The listed options for an entity type are GUIDANCE, not a whitelist: an option
// outside the listed set is still accepted (subject to the rules), because a table that
// silently refuses a real-world answer is the v1 bug with more rows.

import { normalizeRegistration } from "../lib/malaysian-registration.mjs";

// ---------------------------------------------------------------------------
// Entity types — v1's five, plus the three the memo's defaults need to be expressible.
// ---------------------------------------------------------------------------

export const ENTITY_TYPES_V2 = [
  "sdn_bhd", "bhd", "sole_prop", "partnership", "llp", "society", "cooperative", "other",
] as const;
export type EntityType = (typeof ENTITY_TYPES_V2)[number];

/** v1's synonym map, widened. `sendirian_berhad` and `berhad` are distinct keys, so the Sdn Bhd
 *  reading of "Berhad" never collides with the public-company one. */
export const ENTITY_SYNONYMS_V2: Record<string, string> = {
  "sdn_bhd": "sdn_bhd", "sendirian_berhad": "sdn_bhd", "sdn": "sdn_bhd", "private_limited": "sdn_bhd",
  "bhd": "bhd", "berhad": "bhd", "public_company": "bhd", "public_limited": "bhd", "listed": "bhd",
  "sole_prop": "sole_prop", "sole_proprietor": "sole_prop", "sole_proprietorship": "sole_prop", "enterprise": "sole_prop", "roba": "sole_prop",
  "partnership": "partnership", "conventional_partnership": "partnership",
  "llp": "llp", "plt": "llp", "perkongsian_liabiliti_terhad": "llp",
  "society": "society", "persatuan": "society", "association": "society",
  "cooperative": "cooperative", "co_op": "cooperative", "coop": "cooperative", "koperasi": "cooperative",
  "other": "other",
};

/** Companies under CA 2016 — the shapes a statutory framework/basis rule can bind to. */
const COMPANY_TYPES: readonly EntityType[] = ["sdn_bhd", "bhd"];
export const isCompanyEntity = (entity: unknown): boolean => COMPANY_TYPES.includes(entity as EntityType);

// ---------------------------------------------------------------------------
// Axis 1 — framework_code.
// ---------------------------------------------------------------------------

export type FrameworkCode =
  | "MPERS" | "MFRS" | "SPECIAL_PURPOSE_TAX_MANAGEMENT" | "MPERS_ALIGNED_SPECIAL_PURPOSE"
  | "REGULATOR_CONTRACTUAL" | "OTHER" | "UNDETERMINED";

/** A dated version rule. The DATE is the config (adjudication 4): a standard's edition changes
 *  by commencement date, so the date lives here and the editions stay plain codes. */
export type FrameworkVersionRule = {
  question: string;
  options: readonly { code: string; label: string; aliases: readonly string[] }[];
  /** ISO date; the successor edition binds for reporting periods beginning on or after it. */
  mandatoryFrom: string;
  mandatoryVersion: string;
};

export type FreeTextRule = { key: string; question: string; label: string };

export type FrameworkOption = {
  code: FrameworkCode;
  label: string;
  /** Typed forms accepted for this code (normalized: lowercased, whitespace → underscore). */
  aliases: readonly string[];
  /** Entity types for which this option is LISTED in the question. Not a whitelist — the
   *  validator accepts any code in this table and lets the rules below speak. */
  listedFor: readonly EntityType[];
  /** The statutory/practice anchor, echoed into warnings so a person sees WHY. */
  authority?: string;
  /** When set, a confirmed answer must supply free text (the memo's "mandatory free text"). */
  freeText?: FreeTextRule;
  /** When set, a confirmed answer is followed by the edition question. */
  versions?: FrameworkVersionRule;
};

const ALL_ENTITIES: readonly EntityType[] = ENTITY_TYPES_V2;

export const FRAMEWORK_OPTIONS: readonly FrameworkOption[] = [
  {
    code: "MPERS",
    label: "MPERS — Malaysian Private Entities Reporting Standard",
    aliases: ["mpers", "private_entities", "private_entity", "mpers_full"],
    listedFor: ["sdn_bhd", "other"],
    authority: "CA 2016 s.244 + MASB private-entity scope (a private entity may apply MPERS in its entirety)",
    versions: {
      question:
        "Which edition of MPERS applies? (2016 / 2025 / undetermined)\n" +
        "MPERS (2025) is mandatory for reporting periods beginning on or after 1 January 2027; early adoption is permitted.",
      options: [
        { code: "MPERS_2016", label: "MPERS (2016)", aliases: ["2016", "mpers_2016", "current", "existing"] },
        { code: "MPERS_2025", label: "MPERS (2025)", aliases: ["2025", "mpers_2025", "new", "revised"] },
        { code: "UNDETERMINED", label: "undetermined — to confirm at the first close", aliases: ["undetermined", "unknown", "not_sure", "tbd", "skip"] },
      ],
      mandatoryFrom: "2027-01-01",
      mandatoryVersion: "MPERS_2025",
    },
  },
  {
    code: "MFRS",
    label: "MFRS — Malaysian Financial Reporting Standards",
    aliases: ["mfrs", "full_mfrs", "ifrs", "mfrs_full"],
    listedFor: ["sdn_bhd", "bhd", "other"],
    authority: "CA 2016 s.244 — mandatory for a public company or a Sdn Bhd outside the private-entity scope; an eligible private entity may elect it in its entirety",
  },
  {
    code: "SPECIAL_PURPOSE_TAX_MANAGEMENT",
    label: "Special-purpose tax / management accounts",
    aliases: [
      "special_purpose", "special_purpose_tax_management", "tax_basis", "tax", "management_accounts",
      "management", "full_set", "tax_management", "income_tax_basis",
    ],
    listedFor: ["sole_prop", "partnership", "llp", "society", "cooperative", "other"],
    authority: "ITA 1967 s.82 record-keeping (sole prop / partnership) · LLP Act 2012 s.69 (no approved standard imposed)",
  },
  {
    code: "MPERS_ALIGNED_SPECIAL_PURPOSE",
    label: "MPERS-aligned special purpose (NOT an MPERS-compliance assertion)",
    aliases: ["mpers_aligned", "mpers_aligned_special_purpose", "aligned", "mpers_like", "mpers_based"],
    listedFor: ["sole_prop", "partnership", "llp", "other"],
    authority: "a voluntary benchmark — recording it asserts alignment, never MPERS compliance",
  },
  {
    code: "REGULATOR_CONTRACTUAL",
    label: "Regulator / contractual framework (e.g. ROS rules, SKM GP23, a lender's terms)",
    aliases: ["regulator", "contractual", "regulator_contractual", "ros", "skm", "gp23", "lender"],
    listedFor: ["society", "cooperative", "other"],
    authority: "the regulator's own rules or the contract that imposes them",
    freeText: { key: "authority_source", question: "Name the regulator, rule or contract that imposes the framework.", label: "authority" },
  },
  {
    code: "OTHER",
    label: "Other (name it)",
    aliases: ["other", "lain_lain"],
    listedFor: ALL_ENTITIES,
    freeText: {
      key: "framework_other",
      question: "Name the framework AND the authority or source that requires it (e.g. “IFRS for SMEs — parent's group-reporting instruction”).",
      label: "framework",
    },
  },
  {
    code: "UNDETERMINED",
    label: "Undetermined — a practitioner review is required",
    aliases: ["undetermined", "unknown", "not_sure", "tbd", "review", "not_yet"],
    listedFor: ALL_ENTITIES,
  },
];

// ---------------------------------------------------------------------------
// Axis 2 — accounting_basis.
// ---------------------------------------------------------------------------

export type BasisCode = "ACCRUAL" | "CASH_RECEIPTS_PAYMENTS" | "MODIFIED_CASH" | "OTHER" | "UNDETERMINED";

export type BasisOption = {
  code: BasisCode;
  label: string;
  aliases: readonly string[];
  listedFor: readonly EntityType[];
  freeText?: FreeTextRule;
};

export const BASIS_OPTIONS: readonly BasisOption[] = [
  { code: "ACCRUAL", label: "Accrual", aliases: ["accrual", "accruals", "accrual_basis", "full_accrual"], listedFor: ALL_ENTITIES },
  {
    code: "CASH_RECEIPTS_PAYMENTS",
    label: "Cash — receipts and payments",
    aliases: ["cash", "cash_basis", "receipts_and_payments", "receipts_payments", "cash_receipts_payments", "cashbook"],
    listedFor: ALL_ENTITIES,
  },
  { code: "MODIFIED_CASH", label: "Modified cash", aliases: ["modified_cash", "modified", "hybrid", "modified_cash_basis"], listedFor: ALL_ENTITIES },
  {
    code: "OTHER",
    label: "Other (describe)",
    aliases: ["other", "lain_lain"],
    listedFor: ALL_ENTITIES,
    freeText: { key: "basis_other", question: "Describe the basis of preparation.", label: "basis" },
  },
  {
    code: "UNDETERMINED",
    label: "Undetermined — a practitioner review is required",
    aliases: ["undetermined", "unknown", "not_sure", "tbd", "review"],
    listedFor: ALL_ENTITIES,
  },
];

/** The cash family — the codes a company's TARGET statutory basis can never be. */
const CASH_FAMILY: readonly BasisCode[] = ["CASH_RECEIPTS_PAYMENTS", "MODIFIED_CASH"];
export const isCashFamily = (code: unknown): boolean => CASH_FAMILY.includes(code as BasisCode);

// ---------------------------------------------------------------------------
// Entity-type defaults — they PRE-SELECT (they are named in the question as the usual answer);
// they never lock, and nothing here refuses a different answer.
// ---------------------------------------------------------------------------

export type EntityDefault = { framework: FrameworkCode; basis: BasisCode; because: string };

export const ENTITY_DEFAULTS: Readonly<Record<EntityType, EntityDefault>> = {
  sdn_bhd: { framework: "MPERS", basis: "ACCRUAL", because: "an eligible private entity ordinarily applies MPERS (CA 2016 s.244)" },
  bhd: { framework: "MFRS", basis: "ACCRUAL", because: "a public company is not a private entity — MFRS is mandatory" },
  sole_prop: { framework: "SPECIAL_PURPOSE_TAX_MANAGEMENT", basis: "ACCRUAL", because: "ROBA 1956 imposes no reporting framework; firms keep tax/management accounts (ITA 1967 s.82)" },
  partnership: { framework: "SPECIAL_PURPOSE_TAX_MANAGEMENT", basis: "ACCRUAL", because: "a conventional partnership has no imposed framework; firms keep tax/management accounts" },
  llp: { framework: "SPECIAL_PURPOSE_TAX_MANAGEMENT", basis: "ACCRUAL", because: "LLP Act 2012 s.69 requires true-and-fair records; SSM imposes no approved standard" },
  society: { framework: "REGULATOR_CONTRACTUAL", basis: "ACCRUAL", because: "societies report under ROS rules / their own constitution" },
  cooperative: { framework: "REGULATOR_CONTRACTUAL", basis: "ACCRUAL", because: "co-operatives follow SKM GP23" },
  other: { framework: "UNDETERMINED", basis: "ACCRUAL", because: "the entity shape is unknown — record it for review" },
};

/** The default for an entity, refined by the MPERS-eligibility determination when one was made
 *  (an INELIGIBLE Sdn Bhd defaults to MFRS exactly as a Bhd does). */
export function defaultsFor(entity: unknown, eligibility: MpersEligibility): EntityDefault {
  const key = (ENTITY_TYPES_V2 as readonly string[]).includes(String(entity)) ? (entity as EntityType) : "other";
  if (key === "sdn_bhd" && eligibility === "ineligible") {
    return { framework: "MFRS", basis: "ACCRUAL", because: "a Sdn Bhd outside the private-entity scope applies MFRS (CA 2016 s.244)" };
  }
  return ENTITY_DEFAULTS[key];
}

// ---------------------------------------------------------------------------
// The MPERS-eligibility determination (CA 2016 s.244 private-entity test), asked only where it
// can change the answer — a Sdn Bhd. A Bhd is ineligible as a matter of law and is never asked.
// ---------------------------------------------------------------------------

export type MpersEligibility = "eligible" | "ineligible" | "not_determined";

export const ELIGIBILITY_QUESTION =
  "Is the company a subsidiary, associate or jointly-controlled entity of a listed or SC/BNM-regulated entity, " +
  "or otherwise required to prepare or lodge financial statements under securities or banking law? (yes / no)\n" +
  "This is the CA 2016 s.244 private-entity test: “no” means MPERS is available; “yes” means MFRS applies.";

export const ELIGIBILITY_CHOICES = ["yes", "no"] as const;
export const ELIGIBILITY_SYNONYMS: Record<string, string> = {
  "y": "yes", "true": "yes", "listed": "yes", "regulated": "yes", "subsidiary": "yes",
  "n": "no", "false": "no", "independent": "no", "none": "no", "standalone": "no",
};

/** The determination recorded by the eligibility segment, read back out of prior answers. */
export function eligibilityOf(prior: Readonly<Record<string, unknown>>): MpersEligibility {
  const entity = prior["entity_type"];
  if (entity === "bhd") return "ineligible"; // a public company is never a private entity
  const rec = prior["mpers_eligibility"] as { determination?: unknown } | null | undefined;
  const d = rec && typeof rec === "object" ? rec.determination : undefined;
  return d === "eligible" || d === "ineligible" ? d : "not_determined";
}

// ---------------------------------------------------------------------------
// Option lookup + question building.
// ---------------------------------------------------------------------------

/**
 * Normalize a typed answer to an alias key: lowercase, and every run of non-alphanumerics
 * becomes ONE underscore.
 *
 * The separator rule is the whole point and was got wrong once already: stripping punctuation
 * instead of separating on it turns "MPERS-aligned" into `mpersaligned`, which matches no alias
 * and refuses a person who typed the option's own printed label. Hyphens are how these answers
 * are actually written ("MPERS-aligned", "receipts-and-payments", "co-op"), so a hyphen must
 * mean what a space means.
 */
export const normalizeChoice = (raw: unknown): string =>
  String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Free text as recorded: the submission VERBATIM plus a comparison key (case- and
 *  whitespace-folded). Both are kept — the verbatim is what the firm said, the normalized is
 *  what a later lane can match on without re-deriving it. */
export function recordFreeText(raw: unknown): { verbatim: string; normalized: string } {
  const verbatim = String(raw ?? "").trim().replace(/\s+/g, " ");
  return { verbatim, normalized: verbatim.toLowerCase() };
}

/** Registration-style normalization, re-exported so the questions module has ONE import for
 *  every normalizer it records. (The grammar itself lives in lib/malaysian-registration.mjs.) */
export { normalizeRegistration };

export function frameworkByAnswer(raw: unknown): FrameworkOption | null {
  const n = normalizeChoice(raw);
  if (!n) return null;
  for (const o of FRAMEWORK_OPTIONS) {
    if (normalizeChoice(o.code) === n || o.aliases.includes(n)) return o;
  }
  return null;
}

export function basisByAnswer(raw: unknown): BasisOption | null {
  const n = normalizeChoice(raw);
  if (!n) return null;
  for (const o of BASIS_OPTIONS) {
    if (normalizeChoice(o.code) === n || o.aliases.includes(n)) return o;
  }
  return null;
}

export const frameworkByCode = (code: unknown): FrameworkOption | null =>
  FRAMEWORK_OPTIONS.find((o) => o.code === code) ?? null;
export const basisByCode = (code: unknown): BasisOption | null =>
  BASIS_OPTIONS.find((o) => o.code === code) ?? null;

/** The options LISTED for an entity type, default first. */
export function frameworkOptionsFor(entity: unknown, eligibility: MpersEligibility): FrameworkOption[] {
  const key = (ENTITY_TYPES_V2 as readonly string[]).includes(String(entity)) ? (entity as EntityType) : "other";
  const listed = FRAMEWORK_OPTIONS.filter((o) => o.listedFor.includes(key));
  // An ineligible company must not be offered MPERS as if it were a choice — it is refused
  // below by the hard rule, and offering it would be an invitation to a refusal.
  const usable = eligibility === "ineligible" ? listed.filter((o) => o.code !== "MPERS") : listed;
  const def = defaultsFor(key, eligibility).framework;
  return [...usable].sort((a, b) => Number(b.code === def) - Number(a.code === def));
}

export function basisOptionsFor(entity: unknown): BasisOption[] {
  const key = (ENTITY_TYPES_V2 as readonly string[]).includes(String(entity)) ? (entity as EntityType) : "other";
  return BASIS_OPTIONS.filter((o) => o.listedFor.includes(key));
}

/** The framework question, built for the entity type in hand. */
export function frameworkQuestionFor(prior: Readonly<Record<string, unknown>>, subject: string): string {
  const entity = prior["entity_type"];
  const eligibility = eligibilityOf(prior);
  const options = frameworkOptionsFor(entity, eligibility);
  const def = defaultsFor(entity, eligibility);
  const lines = options.map((o) => `  · ${o.label}${o.code === def.framework ? "  ← usual for this entity type" : ""}`);
  return (
    `On which reporting framework are ${subject} financial statements prepared?\n` +
    `${lines.join("\n")}\n` +
    `(${def.because}. The usual answer is pre-selected, not fixed — answer whatever is true.)`
  );
}

/** The accounting-basis question, built for the entity type in hand. */
export function basisQuestionFor(prior: Readonly<Record<string, unknown>>, subject: string): string {
  const entity = prior["entity_type"];
  const def = defaultsFor(entity, eligibilityOf(prior));
  const lines = basisOptionsFor(entity).map((o) => `  · ${o.label}${o.code === def.basis ? "  ← usual for this entity type" : ""}`);
  return (
    `On what BASIS are ${subject} accounts prepared? (this is the recognition basis, separate from the framework above)\n` +
    `${lines.join("\n")}`
  );
}

// ---------------------------------------------------------------------------
// The rules. Two hard refusals (statutory impossibilities), the rest visible warnings.
// ---------------------------------------------------------------------------

export type Warning = { code: string; message: string };

/**
 * HARD RULE 1 — an ineligible company cannot apply MPERS. Returns the refusal reason, or null.
 *
 * Fires only on a determination the interview actually HOLDS: a Bhd (ineligible by law) or a
 * Sdn Bhd screened ineligible by the s.244 question. An undetermined Sdn Bhd is not refused —
 * refusing on an assumption is how a correct answer gets blocked.
 */
export function mpersEligibilityRefusal(code: FrameworkCode, prior: Readonly<Record<string, unknown>>): string | null {
  if (code !== "MPERS") return null;
  const entity = prior["entity_type"];
  const eligibility = eligibilityOf(prior);
  if (!isCompanyEntity(entity) || eligibility !== "ineligible") return null;
  const who = entity === "bhd" ? "A public company (Bhd)" : "A Sdn Bhd outside the private-entity scope";
  return (
    `${who} is not a “private entity”, so MPERS is not available to it — MFRS applies ` +
    `(CA 2016 s.244 + the MASB private-entity scope). Answer MFRS, or another option if these are not statutory accounts.`
  );
}

/**
 * HARD RULE 2 — a company's TARGET statutory basis cannot be cash or modified cash. Returns the
 * refusal reason, or null.
 *
 * Reached only after the observed-state question has established that the answer describes the
 * basis the entity will REPORT on. When it describes the records AS THEY STAND, nothing is
 * refused: the state is recorded with its explanation and the target is left UNDETERMINED (the
 * memo's observed-state path — an accurate record of a defective book is not an error to block,
 * it is the fact the remediation starts from).
 */
export function companyCashBasisRefusal(code: BasisCode, prior: Readonly<Record<string, unknown>>): string | null {
  if (!isCashFamily(code) || !isCompanyEntity(prior["entity_type"])) return null;
  const label = basisByCode(code)?.label ?? String(code);
  return (
    `A company's statutory financial statements must be prepared on the accrual basis under the applicable ` +
    `MASB-approved standards (CA 2016 s.244) — “${label}” cannot be the basis it reports on. ` +
    `Answer accrual, or say the cash records are the CURRENT state and it will be recorded as observed with a remediation note.`
  );
}

/** The framework-side warnings — visible, acknowledged, and recorded next to the answer. */
export function frameworkWarnings(code: FrameworkCode, prior: Readonly<Record<string, unknown>>): Warning[] {
  const entity = prior["entity_type"];
  const out: Warning[] = [];
  if (code === "MPERS" && !isCompanyEntity(entity)) {
    out.push({
      code: "non_company_mpers",
      message:
        "MPERS is a framework for companies under CA 2016 — no approved standard is imposed on an LLP (LLP Act 2012 s.69) " +
        "or on a business registered under ROBA 1956. Recording “MPERS” here asserts full MPERS compliance; the usual label " +
        "for these accounts is “MPERS-aligned special purpose”, which asserts alignment without the compliance claim.",
    });
  }
  if (code === "SPECIAL_PURPOSE_TAX_MANAGEMENT" && isCompanyEntity(entity)) {
    out.push({
      code: "company_special_purpose",
      message:
        "A company's STATUTORY accounts must still be prepared under an applicable MASB-approved framework (CA 2016 s.244). " +
        "Recording special-purpose tax/management accounts is right for that engagement, but it does not replace the statutory framework.",
    });
  }
  if (code === "UNDETERMINED") {
    out.push({
      code: "framework_undetermined",
      message: "Recorded as UNDETERMINED — a practitioner must determine the framework before any statutory output is produced.",
    });
  }
  return out;
}

/** The basis-side warnings. */
export function basisWarnings(code: BasisCode, prior: Readonly<Record<string, unknown>>): Warning[] {
  const entity = prior["entity_type"];
  const out: Warning[] = [];
  if (entity === "llp" && isCashFamily(code)) {
    out.push({
      code: "llp_cash_basis",
      message:
        "HIGH SEVERITY — LLP Act 2012 s.69 requires records sufficient to show a true and fair profit-and-loss account and " +
        "balance sheet. A pure cash basis rarely supports that, and LHDN PR 8/2022 expects normal-format statements. Flag this for review.",
    });
  }
  if (!isCompanyEntity(entity) && entity !== "llp" && isCashFamily(code)) {
    out.push({
      code: "unincorporated_cash_basis",
      message:
        "LHDN PR 5/2000 (Rev) allows a simplified cashbook only for its defined “small business”, and still requires records " +
        "capable of supporting a true-and-fair profit-and-loss account and balance sheet, including year-end stock and WIP. " +
        "Confirm the client qualifies, or expect to convert to accrual at the year end.",
    });
  }
  if (code === "UNDETERMINED") {
    out.push({ code: "basis_undetermined", message: "Recorded as UNDETERMINED — a practitioner must settle the basis before the first close." });
  }
  return out;
}

/** The observed-state question a company + cash answer must pass through before it can be
 *  refused (HARD RULE 2). Data, so the wording is a table edit. */
export const OBSERVED_STATE_QUESTION =
  "Is that the basis the accounts will be REPORTED on, or a description of the records as they stand today? " +
  "(reporting / records_today)";

export const OBSERVED_STATE_CHOICES = ["reporting", "records_today"] as const;
export const OBSERVED_STATE_SYNONYMS: Record<string, string> = {
  "report": "reporting", "target": "reporting", "will_report": "reporting", "statutory": "reporting",
  "records": "records_today", "current": "records_today", "today": "records_today", "as_is": "records_today",
  "current_state": "records_today", "observed": "records_today",
};

export const OBSERVED_STATE_NOTE_QUESTION =
  "Describe the records as they stand and the remediation planned — this is recorded as OBSERVED state, and the " +
  "reporting basis is left undetermined until a practitioner settles it.";
