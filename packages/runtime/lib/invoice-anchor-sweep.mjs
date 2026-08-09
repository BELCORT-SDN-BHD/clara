// THE ANCHOR SWEEP — X7's SECOND candidate-GENERATION surface, added after the A1 field test
// (2026-08-09) proved the first one could not see the document it was built for.
//
// ─── WHY THIS EXISTS: THE FIELD TEST THAT KILLED THE FIRST FIX ────────────────────────────────
// v10 shipped, both KONG CHENG documents were re-extracted clean, and `customer_name` came back
// BYTE-IDENTICAL to v1 — still the person, same confidence. The receipts said why, in counters:
//
//     outcome: "absent"   attn_matched: 1   contact_emitted: 1   attn_key: "lim xiao shan"
//     split_line_scanned: 0   rejected_gate: 0   no_entity_suffix: 0   label_boundary: 0
//     no_customer_anchor: 0   customer_anchor_far: 0   closer_to_vendor: 0
//
// EVERY refusal head was zero. The reader had not refused the company — it had never SEEN it. The
// whole party read hung off `splitBillToLabel`, one `if (!hit) continue;` in the pass-2 loop, and
// THESE REAL INVOICES CARRY NO BILL-TO LABEL AT ALL: the buyer is simply printed in the box, the
// `Attn` line beneath it, nothing naming either. Six review rounds hardened the WALLS while
// GENERATION quietly stayed at its narrowest — a label the document never prints.
//
// So the walls were never the safety here; they were unreached. This module supplies the
// population they were built to judge, and it is DELIBERATELY a fallback rather than a widening
// of pass 2 (see `sweepAnchorNeighbourhood` below for why).
//
// ─── WHAT THE SWEEP IS ALLOWED TO ASSUME ──────────────────────────────────────────────────────
// Exactly one thing, and Azure produced it: THE TYPED `CustomerName` REGION MARKS THE BUYER'S
// BLOCK. That is defense (c) restated as a GENERATOR instead of only a filter. The F7 defect is
// precisely "the right box, the wrong line inside it" — Azure's content pick is wrong while its
// geometry is right — so lines in that region's neighbourhood are the population, and the six
// rounds' positive walls (registered-entity suffix, name shape, no colon, no non-addressee
// marker, not contact-claimed) decide which of them is a party. Nothing here relaxes a wall.
//
// MEASURED ON THE REAL CAPTURE, both documents, within the 1.0in gate of the typed anchor:
// seventeen and sixteen lines respectively are in range; EXACTLY ONE clears the entity-suffix
// wall — `KONG CHENG RESTAURANTS SDN BHD`. Line items, captions (`Item Code`, `Description`),
// the `TEL :`/`FAX :` rows and the narration paragraphs are all refused by walls that already
// existed. Uniqueness-or-nothing therefore holds with room to spare rather than by luck.

import { asciiTrim } from "./invoice-amount-grammar.mjs";
import { hasRegisteredEntitySuffix, looksLikePartyName, partyBaseTokens, partyKey, splitAttnLabel, splitBillToLabel } from "./invoice-party-grammar.mjs";
import { boxDistance } from "./invoice-block-geometry.mjs";

/**
 * Enumerate party candidates from the NEIGHBOURHOOD OF THE TYPED CustomerName ANCHOR.
 *
 * IT RUNS ONLY ON A PAGE THAT PRINTS NO BILL-TO LABEL AT ALL — the caller's gate, and a
 * fail-closed choice rather than a performance one. A LABEL IS STRONGER EVIDENCE THAN PROXIMITY,
 * in both directions: where a document names its bill-to box that naming decides, and a candidate
 * the LABEL PATH REFUSED must not get a second hearing here on proximity alone. The battery's
 * `a labelled party NEARER THE SELLER` page is that second shape exactly — a `Bill To:` line
 * carrying the seller's own name, refused by identity, with an unlabelled company lower down.
 * A contest also WITHDRAWS the typed row (`typed_vs_contested`), so an always-on sweep could lose
 * a correct name on documents that work today — a fix for two invoices turned into a corpus-wide
 * regression. Gated on the LABEL's absence, the sweep can only ADD readings on pages that produce
 * none today, which is the real capture's own condition.
 *
 * The radius IS `anchorLimit`, so `customer_anchor_far` is a BOUND here rather than a refusal and
 * never fires; the caller's `attributed()` still runs, and on this path only `in_vendor_block`
 * can refuse. Both are counted by the caller under their own heads.
 *
 * @returns {Array<{value_raw:string,key:string,page:number,polygon:number[],confidence:number|null}>}
 */
export function sweepAnchorNeighbourhood(ctx) {
  const { lines, boxes, pageNumber, reserved, scaledAnchors, anchorLimit, receipt, note, attributed } = ctx;
  const anchor = scaledAnchors?.customer;
  // FAIL CLOSED, and identically to residual (2): no typed CustomerName region means no buyer
  // block to sweep. This reader still never supplies a name where Azure typed none.
  if (!anchor || anchor.page !== pageNumber || anchorLimit === null) return [];

  receipt.anchor_sweep_ran += 1;
  const found = [];
  for (let j = 0; j < lines.length; j++) {
    const box = boxes[j];
    if (box === null) continue;                 // unusable geometry is not a refusal, it is not a line
    if (reserved.has(j)) { receipt.reserved_skipped += 1; continue; }
    const distance = boxDistance({ ...box, page: pageNumber }, anchor);
    if (distance === null || distance > anchorLimit) continue;   // the sweep's own bound
    receipt.anchor_in_range += 1;

    const text = String(lines[j]?.content ?? "");
    // A LABEL LINE IS NEVER A PARTY LINE, on either vocabulary. Symmetric with pass 2 and with
    // `scanBelow`'s boundary rule: a label opens a block, it does not name one. (Reaching a
    // bill-to label here would mean pass 2 had already tried and failed on it.)
    if (splitAttnLabel(text) || splitBillToLabel(text)) { receipt.anchor_label_skipped += 1; continue; }

    const raw = asciiTrim(text);
    if (!looksLikePartyName(raw)) { receipt.anchor_rejected_gate += 1; continue; }
    if (!hasRegisteredEntitySuffix(raw)) { receipt.anchor_no_entity_suffix += 1; continue; }
    // Attribution still runs, and on this path only the IDENTITY terms can refuse: the radius
    // above already IS the distance gate. The seller's own name is refused here too.
    if (!attributed(box, null, "party", partyBaseTokens(raw))) continue;

    const source = lines[j];
    found.push({
      value_raw: raw, key: partyKey(raw), page: pageNumber,
      polygon: (source.polygon || []).map(Number),
      confidence: source?.confidence == null ? null : Number(source.confidence),
    });
    note("accepted", null, pageNumber, { kind: "party", source: "anchor", key: partyKey(raw) });
  }
  return found;
}
