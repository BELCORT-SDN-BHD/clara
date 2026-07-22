// Per-reason card copy for the governed CLR refusals the je_review path surfaces
// (INTERFACE-PINS §2/§6). The verbatim DB message always renders too; this maps the
// machine reason discriminant to human guidance for the exact next step.

import { counterpartyNoun, type Direction } from "../shared/direction";

/** CLR21 discriminants (draft/approve line-law refusals). */
export const CLR21_COPY: Record<string, string> = {
  amount_conflict: "The proposed total does not match the machine-corroborated total — resolve below (edit to the corroborated total, or override with a reason).",
  currency_unsupported: "This bill's currency is not MYR — Clara cannot post it (multi-currency is a later slice).",
  vendor_malformed: "The vendor proposal is malformed — fix the vendor before approving.",
  evidence_invalid: "The cited evidence is missing or does not match the document — re-cite before approving.",
  double_coded: "This filing is already coded — an approved entry or another open draft already binds it.",
  duplicate_bill: "This looks like a duplicate of an approved bill (same vendor + invoice number). Override with a reason to proceed, or discard.",
  duplicate_sales: "This looks like a duplicate of an approved sales invoice (same customer + invoice number, or same customer + date + total). Override with a reason to proceed, or discard.",
};

/** §6.2 direction-aware CLR21 copy. Same wording as CLR21_COPY for a null/purchase
 *  direction; a sales direction swaps the counterparty noun (vendor→customer) for the
 *  direction-sensitive discriminant. Keeps CLR21_COPY exported unchanged for any other
 *  caller.
 *
 *  The duplicate discriminants are deliberately NOT remapped by direction: 0016 gates
 *  the `duplicate_bill` raise on `coding_kind='supplier_bill'` (so it is always a
 *  purchase) and raises the DISTINCT `duplicate_sales` token for the sales kinds. Each
 *  token already carries its own direction; a sales remap of `duplicate_bill` would be
 *  copy for a combination the DB cannot produce. */
export function clr21Copy(reason: string, direction: Direction | null): string | undefined {
  if (direction === "sales") {
    const noun = counterpartyNoun(direction); // "customer"
    if (reason === "vendor_malformed") return `The ${noun} proposal is malformed — fix the ${noun} before approving.`;
  }
  return CLR21_COPY[reason];
}

/** CLR05 discriminants. `attestation_required` is the Wave-A (WA-D5) extension:
 *  approving a HIGH-STAKES agent-made draft (no human editor) now requires the
 *  approver's recorded attestation — enter it, then approve again. */
export const CLR05_COPY: Record<string, string> = {
  attestation_required: "This agent-made draft is high-stakes — record your attestation below, then approve.",
  routine_refuses_high_stakes: "High-stakes — review and approve this one individually (routine batch approval is refused).",
  distinct_checker: "A distinct checker is required — a second eligible person must approve this high-stakes entry.",
  self_attestation: "You cannot attest your own draft — a distinct checker must approve.",
};
