// THE VENDOR-IDENTITY REFUSAL, DERIVED IN THE OPEN — the corpus, the shipped rule, and the two
// rules that were built, MEASURED and REJECTED.
//
// WHY THE REJECTED PREDICATES STAY EXECUTABLE. Round 5 of this arc measured a proposed
// case-discontinuity rule, killed it on evidence, and KEPT IT RUNNING IN CI so the rejection is a
// fact rather than a remembered argument (`x7-path-a-rejected.mjs`, the same shape as this file).
// Every later round has been able to re-run that decision instead of re-litigating it. The two
// alternatives below get the same treatment: anyone who thinks the shipped rule is too coarse can
// execute the tighter one and read exactly which document it lets through.
//
// THE CORPUS IS THE UNION OF EVERY SHAPE ANY LANE PRODUCED — four calibration points, both
// fragment directions, both reviewers' probes, my own adversarial constructions, the controls, and
// all five declared safe-holds. It is the artefact to extend when a new shape turns up; adding a
// row here measures it against all three rules at once.

import { candidateIsVendorSubset, identityComparisonForm } from "../lib/invoice-identity-fold.mjs";

/** THE SHIPPED RULE: token subset OR concatenated substring, both in the SAME single direction. */
export const shipped = (c, v) => {
  const C = identityComparisonForm(c), V = identityComparisonForm(v);
  return candidateIsVendorSubset(C.tokens, V.tokens)
    || (V.joined.length > 0 && C.joined.length > 0 && V.joined.includes(C.joined));
};

/** REJECTED #1 — subset only. What shipped before the substring clause; the over-joined leak. */
export const subsetOnly = (c, v) =>
  candidateIsVendorSubset(identityComparisonForm(c).tokens, identityComparisonForm(v).tokens);

/** REJECTED #2 — subset OR SUFFIX-only containment. Tighter (one false hold instead of five), and
 *  it holds every fragment shape whose noise LEADS. Rejected because noise glued into the END of
 *  a word admits the seller — a constructible wrong-party path. */
export const suffixOnly = (c, v) => {
  const C = identityComparisonForm(c), V = identityComparisonForm(v);
  return candidateIsVendorSubset(C.tokens, V.tokens)
    || (V.joined.length > 0 && C.joined.length > 0 && V.joined.endsWith(C.joined));
};

/** FORBIDDEN — the reverse containment direction. Inverts the franchise calibration. */
export const reverseDirection = (c, v) => {
  const C = identityComparisonForm(c), V = identityComparisonForm(v);
  return candidateIsVendorSubset(C.tokens, V.tokens)
    || (C.joined.length > 0 && C.joined.includes(V.joined));
};

/**
 * [typed VendorName, candidate buyer, expected, label] — and the expectation has THREE values,
 * not two. Collapsing them to REFUSE/ADMIT was this file's own first cut, and it scored the
 * rejected alternative unfairly by counting its BETTER answers as failures:
 *
 *   `REFUSE` — SAFETY. The candidate really is the seller. Admitting it is a wrong counterparty
 *              on real books: the one forbidden outcome.
 *   `HOLD`   — DECLARED COLLATERAL. The candidate is a genuinely different company that the
 *              coarse fold merges anyway (safe-holds a–e). The shipped rule refuses it and that
 *              is accepted eyes-open — but a rule that ADMITS it is being MORE ACCURATE, not
 *              less safe, so it must never be scored as a leak.
 *   `ADMIT`  — a real buyer that must stay readable.
 */
export const CORPUS = Object.freeze([
  // the four calibration points
  ["A\nACME", "ACME SDN BHD", "REFUSE", "cal-1 partial logo"],
  ["ROME SECRETARY SDN BHD", "ROME SECRETARY (PENANG) SDN BHD", "ADMIT", "cal-2 franchise"],
  ["M\nROME\nSECRETARY", "ROME SECRETARY SDN BHD", "REFUSE", "cal-3 capture mirror"],
  ["M\nROME\nSECRETARY", "KONG CHENG RESTAURANTS SDN BHD", "ADMIT", "cal-4 the real buyer"],
  // N1 round 1 — UNDER-fragmented (closed by the glyph-run join)
  ["A\nC\nM\nE", "ACME SDN BHD", "REFUSE", "N1a line-split latin"],
  ["A.C.M.E.", "ACME SDN BHD", "REFUSE", "N1a dotted initials"],
  ["ACME", "A.C.M.E. SDN BHD", "REFUSE", "N1a reverse fragment"],
  ["鑫\n旺", "鑫旺 SDN BHD", "REFUSE", "N1a CJK split"],
  ["鑫旺", "鑫 旺 SDN BHD", "REFUSE", "N1a CJK reverse"],
  // N1 round 2 — OVER-joined (closed by the substring clause)
  ["R O M E  S E C R E T A R Y", "ROME SECRETARY SDN BHD", "REFUSE", "N1b letter-spaced logo"],
  ["ROME SECRETARY", "R O M E  S E C R E T A R Y SDN BHD", "REFUSE", "N1b letter-spaced reverse"],
  ["ROME SECRE TARY", "ROME SECRETARY SDN BHD", "REFUSE", "N1b mid-word split"],
  ["RO ME SECRETARY", "ROME SECRETARY SDN BHD", "REFUSE", "N1b uneven fragments"],
  ["R\nO\nME SECRETARY", "ROME SECRETARY SDN BHD", "REFUSE", "N1b mixed fragments"],
  // glued noise — the shapes that killed the suffix-only alternative
  ["ROME SECRETARYM", "ROME SECRETARY SDN BHD", "REFUSE", "glued at the END"],
  ["XROME SECRETARYY", "ROME SECRETARY SDN BHD", "REFUSE", "glued at BOTH ends"],
  ["MROME SECRETARY", "ROME SECRETARY SDN BHD", "REFUSE", "glued at the START"],
  // trailing fragments as separate tokens — caught by the SUBSET term, not the substring one
  ["ROME SECRETARY\nM", "ROME SECRETARY SDN BHD", "REFUSE", "trailing logo glyph"],
  ["ACME\nA", "ACME SDN BHD", "REFUSE", "trailing fragment"],
  // the five declared safe-holds — over-refusals, accepted eyes-open
  ["ACME HOLDINGS SDN BHD", "ACME SDN BHD", "HOLD", "hold-a strict subset"],
  ["A-B TRADING SDN BHD", "A/B TRADING SDN BHD", "HOLD", "hold-b punctuation class"],
  ["ACME BERHAD", "ACME SDN BHD", "HOLD", "hold-c legal suffix"],
  ["ACME TRADING SDN BHD", "A & C & M & E TRADING SDN BHD", "HOLD", "hold-d initials vs concat"],
  ["MASTERCRAFT SDN BHD", "MASTER SDN BHD", "HOLD", "hold-e prefix inside word"],
  ["CARSTAR SDN BHD", "CARS SDN BHD", "HOLD", "hold-e prefix inside word 2"],
  ["SUNWAY BERHAD", "SUN SDN BHD", "HOLD", "hold-e short latin interior"],
  ["GREATWALL SDN BHD", "WALL SDN BHD", "HOLD", "hold-e suffix inside word"],
  ["鑫旺发展 SDN BHD", "旺发 SDN BHD", "HOLD", "hold-e CJK interior"],
  // controls — real buyers that must stay readable
  ["ROME SECRETARY SDN BHD", "D&D DEVELOPMENT SDN BHD", "ADMIT", "ctl initialed D&D"],
  ["ROME SECRETARY SDN BHD", "A-B TRADING SDN BHD", "ADMIT", "ctl initialed A-B"],
  ["ROME SECRETARY SDN BHD", "A/B TRADING SDN BHD", "ADMIT", "ctl initialed A/B"],
  ["M\nROME\nSECRETARY", "D & D ENTERPRISE SDN BHD", "ADMIT", "ctl spaced initials"],
  ["ROME SECRETARY SDN BHD", "KONG CHENG RESTAURANTS SDN BHD", "ADMIT", "ctl unrelated buyer"],
]);

/**
 * Score a rule over the corpus, splitting failures by DIRECTION — the whole point of the exercise.
 * A `leak` is a seller admitted as the buyer: a wrong counterparty on real books, the one
 * forbidden outcome. A `falseHold` is a real buyer refused: visible on `is_vendor_name`, and the
 * cheap failure. The two are NEVER summed into one score, because a rule with fewer total errors
 * can still be the worse rule.
 */
export function measure(rule) {
  const leaks = [], falseHolds = [], collateral = [];
  for (const [vendor, candidate, want, label] of CORPUS) {
    const refused = rule(candidate, vendor);
    if (want === "REFUSE" && !refused) leaks.push(label);
    else if (want === "ADMIT" && refused) falseHolds.push(label);
    else if (want === "HOLD" && refused) collateral.push(label);
  }
  return { leaks, falseHolds, collateral };
}
