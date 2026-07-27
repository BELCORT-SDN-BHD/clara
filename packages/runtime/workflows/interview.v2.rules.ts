// @frozen
//
// F2 — THE GATES. The option TABLE lives in interview.v2.frameworks.ts; this module holds what
// the table means: which combinations are statutory impossibilities (refused, loudly), which are
// merely unusual (recorded with an acknowledged warning), and the free-text screening that stops
// OTHER being a door around either. Pure data + predicates, no "workflow" import.
//
// Split out of the table module when it outgrew the repo size gate — table and gates are the
// natural seam: a ruling that changes an OPTION edits the table, a ruling that changes what an
// option MEANS edits this file.

import {
  basisByAnswer,
  basisByCode,
  frameworkByAnswer,
  isCashFamily,
  isCompanyEntity,
  eligibilityOf,
  REGULATOR_BASIS_ENTITIES,
  UNINCORPORATED_TAX_BASIS_ENTITIES,
  type BasisCode,
  type EntityType,
  type FrameworkCode,
} from "./interview.v2.frameworks.js";
// ---------------------------------------------------------------------------
// The rules. Two hard refusals (statutory impossibilities), the rest visible warnings.
// ---------------------------------------------------------------------------

export type Warning = { code: string; message: string };

/**
 * SCREEN FREE TEXT BACK THROUGH THE SAME TABLES (finding L2 — the worst of the round).
 *
 * `OTHER` exists so a person can name something the list does not carry. It is not a door around
 * the statute, and it was: a Bhd could answer OTHER and type "MPERS", and a Sdn Bhd could answer
 * basis OTHER and type "cash basis" — both recorded clean, because the gates read the ENUM and the
 * free text arrived afterwards. Anything a person types is now re-read through the very alias
 * tables the direct answer would have hit, and if it resolves to a real option the answer IS that
 * option for every gate that follows: the same hard refusals, the same observed-state flow, the
 * same warnings, the same edition follow-up.
 *
 * Text that resolves to nothing stays OTHER, which is what OTHER is for.
 *
 * Returns the resolved code, or null when the text is genuinely other.
 */
export function frameworkCodeFromFreeText(text: unknown): FrameworkCode | null {
  const hit = frameworkByAnswer(text);
  return hit && hit.code !== "OTHER" ? hit.code : null;
}

export function basisCodeFromFreeText(text: unknown): BasisCode | null {
  const hit = basisByAnswer(text);
  return hit && hit.code !== "OTHER" ? hit.code : null;
}

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
  // PR 5/2000 is an INCOME-TAX ruling about businesses, so it reaches sole proprietors and
  // conventional partnerships and nobody else. Applying it to "every non-company except an LLP"
  // told a society keeping receipts-and-payments — exactly what ROS rules ask of it — that it
  // should check whether it qualifies as an LHDN "small business", and persisted that as an
  // acknowledged warning. A warning that cites the wrong authority is worse than none: it teaches
  // the reader to distrust the warnings that are right.
  if (UNINCORPORATED_TAX_BASIS_ENTITIES.includes(entity as EntityType) && isCashFamily(code)) {
    out.push({
      code: "unincorporated_cash_basis",
      message:
        "LHDN PR 5/2000 (Rev) allows a simplified cashbook only for its defined “small business”, and still requires records " +
        "capable of supporting a true-and-fair profit-and-loss account and balance sheet, including year-end stock and WIP. " +
        "Confirm the client qualifies, or expect to convert to accrual at the year end.",
    });
  }
  if (REGULATOR_BASIS_ENTITIES.includes(entity as EntityType) && isCashFamily(code)) {
    out.push({
      code: "regulator_basis_cash",
      message:
        "A society reports as its constitution and the Registrar of Societies require (commonly audited receipts and payments); " +
        "a co-operative follows SKM GP23. Confirm the basis against THAT authority — the LHDN small-business cashbook rule is " +
        "not the one that governs here.",
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
