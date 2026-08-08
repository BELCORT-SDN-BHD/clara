// PATH (A) — THE REJECTED PREDICATE, RETAINED AS AN EXECUTABLE ARTIFACT.
//
// Round 5 proposed a "case discontinuity" rule for the residual-(5) relational-phrase class: a
// lowercase relational segment preceding an upper/title-cased entity name refuses candidacy.
// It was implemented, MEASURED against a named corpus, and REJECTED by the decision rule
// (close >= the 5 end-to-end leaks with ZERO legitimate-name loss).
//
// WHY IT IS KEPT RATHER THAN DELETED. A reviewer could only rate the recorded figures PLAUSIBLE
// because the predicate had not been retained — the rejection was a claim, not a re-runnable
// fact. It now runs in CI (`x7-path-a-rejected.test.mjs`) against a corpus defined HERE, by
// name, so anyone can re-derive the table and challenge the decision on evidence.
//
// THE CORPUS IS EXPLICIT, NOT SCRAPED. An earlier version of this measurement harvested
// entity-suffixed literals out of the battery files; as the batteries grew they began to include
// the leak forms themselves, and the "legitimate names lost" figure drifted. A measurement whose
// denominator moves with unrelated edits is not a measurement.

import { looksLikePartyName } from "../lib/invoice-party-grammar.mjs";
import { hasRegisteredEntitySuffix, splitEntitySuffix } from "../lib/invoice-entity-lexicon.mjs";

/** Candidacy as it SHIPS today (the baseline the proposal would have modified). */
export const shippedCandidate = (s) => looksLikePartyName(s) && hasRegisteredEntitySuffix(s);

/**
 * THE REJECTED PREDICATE. Refuse when the base (the text before the entity suffix) contains a
 * lowercase-cased run followed by an upper/title-cased token — the shape of
 * `A division of AMATERUS GROUP`, `t/a AMATERUS GROUP`.
 */
export function caseDiscontinuity(raw) {
  const hit = splitEntitySuffix(raw);
  if (!hit || !hit.base) return false;
  const wordCount = hit.base.split(" ").filter(Boolean).length;
  const tokens = String(raw ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, wordCount);
  let seenLower = false;
  for (const t of tokens) {
    if (/^\p{Ll}[\p{Ll}\p{N}]*$/u.test(t)) { seenLower = true; continue; }
    if (seenLower && /\p{Lu}/u.test(t)) return true;
  }
  return false;
}

/** Candidacy as it WOULD HAVE BEEN under path (A). */
export const candidateUnderA = (s) => shippedCandidate(s) && !caseDiscontinuity(s);

// ── THE NAMED CORPUS ────────────────────────────────────────────────────────────────────────
/**
 * THE CONSTRUCTED RELATIONAL FORMS the measurement runs over — 20 from the native lane plus 4
 * from Codex, of which ONE (`trading as`) is a duplicate: the DISTINCT union is 23, not 24.
 *
 * Every earlier record — mine and the round-6 order alike — said "24". That figure double-counted
 * the overlap between the two lanes. Corrected here rather than padded to 24, because a corpus
 * whose size is asserted rather than derived is the thing this artifact exists to prevent.
 */
export const CONSTRUCTED_23 = [
  "A division of ACME SDN BHD", "A unit of ACME SDN BHD", "An affiliate of ACME SDN BHD",
  "Associate of ACME SDN BHD", "o/b/o ACME SDN BHD", "trading as ACME SDN BHD",
  "t/a ACME SDN BHD", "d/b/a ACME SDN BHD", "Sub-contractor to ACME SDN BHD",
  "Successor to ACME SDN BHD", "Nominee for ACME SDN BHD", "Representing ACME SDN BHD",
  "wholly owned by ACME SDN BHD", "Authorised dealer of ACME SDN BHD", "Remit to ACME SDN BHD",
  "Beneficiary ACME SDN BHD", "Bankers ACME SDN BHD", "Insured by ACME SDN BHD",
  "Parent company ACME SDN BHD", "A wholly-owned subsidiary ACME SDN BHD",
  "acting on behalf of ACME SDN BHD", "division of ACME SDN BHD", "T/A ACME SDN BHD",
];

/** The 5 phrases proven to produce a wrong `customer_name` end-to-end. */
export const E2E_5 = [
  "A division of AMATERUS GROUP SDN BHD", "t/a AMATERUS GROUP SDN BHD",
  "A wholly-owned subsidiary AMATERUS GROUP SDN BHD", "Parent company AMATERUS GROUP SDN BHD",
  "Successor to AMATERUS GROUP SDN BHD",
];

/** LEGITIMATE registered names that must remain candidates — the loss side of the decision rule.
 *  Three casings, because the proposal's whole mechanism is case-sensitive. */
export const LEGIT_ALLCAPS = [
  "KONG CHENG RESTAURANTS SDN BHD", "AMATERUS GROUP SDN BHD", "D&D DEVELOPMENT SDN BHD",
  "DD ECORISE SDN BHD", "SELANGOR ENTERPRISE SDN BHD", "THE ROOF SDN BHD", "ACME (M) SDN BHD",
  "BANK OF CHINA (MALAYSIA) BERHAD", "BANK OF AMERICA MALAYSIA BERHAD",
  "UNITED OVERSEAS BANK MALAYSIA BHD", "CHAMBER OF COMMERCE SDN BHD",
  "INSTITUTE OF TECHNOLOGY SDN BHD", "HOUSE OF FURNITURE SDN BHD", "BOARD OF DIRECTORS SDN BHD",
  "MINISTRY OF SOUND SDN BHD", "鑫旺 SDN BHD", "ATTNAM SDN BHD",
];
export const LEGIT_TITLECASE = [
  "Bank of China (Malaysia) Berhad", "Kong Cheng Restaurants Sdn Bhd", "House of Furniture Sdn Bhd",
  "Institute of Technology Sdn Bhd", "Chamber of Commerce Sdn Bhd",
];
export const LEGIT_LOWERCASE = [
  "bank of china (malaysia) berhad", "kong cheng restaurants sdn bhd",
  "house of furniture sdn bhd", "acme sdn bhd",
];

/** Run the full measurement. Returns the table the contract doc quotes. */
export function measurePathA() {
  const closed = (list) => list.filter((s) => shippedCandidate(s) && !candidateUnderA(s)).length;
  const lost = (list) => list.filter((s) => shippedCandidate(s) && !candidateUnderA(s));
  return {
    e2eClosed: closed(E2E_5),
    e2eTotal: E2E_5.length,
    constructedClosed: closed(CONSTRUCTED_23),
    constructedCandidates: CONSTRUCTED_23.filter(shippedCandidate).length,
    allCapsClosed: closed(CONSTRUCTED_23.map((s) => s.toUpperCase())),
    allCapsCandidates: CONSTRUCTED_23.map((s) => s.toUpperCase()).filter(shippedCandidate).length,
    lostAllCaps: lost(LEGIT_ALLCAPS),
    lostTitleCase: lost(LEGIT_TITLECASE),
    lostLowercase: lost(LEGIT_LOWERCASE),
  };
}
