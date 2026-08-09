// BLOCK-ATTRIBUTION GEOMETRY for the X7 customer-identity reader — the primitives that answer
// "is this line part of the buyer's block?" and nothing else. Split out of
// `invoice-customer-identity.mjs` (the repo's 500-line file limit) on the module's third natural
// seam: `invoice-party-grammar.mjs` owns SPELLING, this file owns POSITION, and the reader owns
// which line wins and what happens when two readings disagree.
//
import { candidateIsVendorIdentity } from "./invoice-identity-fold.mjs";

// Every threshold that crosses into this file arrives ALREADY CONVERTED into the page's own
// frame by the caller (via X2's `pageFrame`), so nothing here knows about inches or pixels —
// which is exactly why the unit lesson that bit X2 and then X6 cannot bite a third time here.

/**
 * TWO-DIMENSIONAL gap between two boxes on the same page — 0 when they overlap in both axes,
 * else the Euclidean distance between their nearest edges. Null when the anchor is absent or on
 * another page, which is NO EVIDENCE rather than a near miss. Identical in rule to X6's, for the
 * identical reason: a y-only gap calls a name on the left and a name on the right "adjacent".
 */
export function boxDistance(candidate, anchor) {
  if (!anchor || anchor.page !== candidate.page) return null;
  const dx = Math.max(0, anchor.xmin - candidate.xmax, candidate.xmin - anchor.xmax);
  const dy = Math.max(0, anchor.ymin - candidate.ymax, candidate.ymin - anchor.ymax);
  return Math.hypot(dx, dy);
}

/** Shared horizontal extent between two boxes; <= 0 means different columns. */
export const xOverlap = (a, b) => Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin);

/** Do two boxes on the SAME page intersect at all? A missing/off-page other box is not an overlap. */
export function boxesOverlap(a, b) {
  if (!b || b.page !== a.page) return false;
  return !(a.xmax < b.xmin || a.xmin > b.xmax || a.ymax < b.ymin || a.ymin > b.ymax);
}

/**
 * Is this candidate attributable to the CUSTOMER block? Returns null when it is, else the reason
 * it is not — so the receipt can name which defense refused it.
 *
 * FAILS CLOSED on a missing customer anchor: no typed CustomerName region means no attribution
 * evidence, and no evidence means no emission.
 *
 * ─── THE VENDOR TERM IS IDENTITY, NOT PROXIMITY (the A1 field test, 2026-08-09) ────────────────
 * It used to mirror X6's tie rule: refuse anything not STRICTLY closer to the customer anchor than
 * to the vendor anchor (`closer_to_vendor`). THE REAL KONG CHENG CAPTURE FALSIFIED THAT TERM and
 * it was the wall that defeated the whole F7 fix on live. Measured, both documents, inches:
 *
 *     typed VendorName region   0.395,0.302 → 2.815,1.190   ← the LEFT-COLUMN LOGO, "M/ROME/SECRETARY"
 *     line 7, THE ACTUAL BUYER  0.523,1.524 → 2.977,1.688
 *     typed CustomerName region 0.928,2.424 → 1.804,2.574   ← printed ON the `Attn` line
 *
 *     buyer → customer anchor = 0.736in      buyer → vendor anchor = 0.334in   ⇒ `closer_to_vendor`
 *
 * Azure typed VendorName onto the LOGO, which on this (entirely ordinary) Malaysian layout sits
 * directly ABOVE the bill-to box — so the buyer is nearer the seller's mark than the buyer's own
 * mis-typed anchor.
 *
 * AND POSITION CANNOT BE REPAIRED INTO A DISCRIMINATOR HERE, which is the finding that decided the
 * shape of this function. The battery's own wrong-party cell (`a labelled party NEARER THE SELLER`)
 * is geometrically THE SAME SHAPE as the real capture — a candidate sitting between the two
 * anchors, nearer the vendor's. The real buyer is at 0.334 / 0.736; the synthetic seller-name at
 * 0.91 / 0.95. The one that must be ADMITTED is the more vendor-ward of the two, so no threshold,
 * ratio or midpoint on those distances separates them in the right direction. Anything tuned to
 * pass both would be a number chosen to make two tests green.
 *
 * SO THE TERM ASKS ABOUT IDENTITY INSTEAD, in the two ways the evidence can actually answer:
 *   `in_vendor_block` — the candidate INTERSECTS the region where Azure found the vendor's name,
 *                       so it IS that text. Positive, geometric, and what the read actually SAW.
 *   `is_vendor_name`  — the candidate says NOTHING the typed VendorName does not already say
 *                       (`candidateIsVendorIdentity` in `invoice-identity-fold.mjs`, whose header
 *                       carries the calibration points and the five named safe-holds). Exact key
 *                       equality was the first cut; two review rounds replaced it with a token
 *                       SUBSET term and then a concatenated-SUBSTRING term, because OCR moves
 *                       token boundaries in both directions and neither term alone survives that.
 * Both only ever REFUSE (review law 3: a name is a projection, so it may not admit anything), so
 * a false match costs an abstain and Azure's typed value stands — never a wrong party.
 *
 * What still refuses a seller LETTERHEAD that the typed field did not name is `customer_anchor_far`
 * plus uniqueness-or-nothing. On the same capture the letterhead line (`ROME SECRETARY SDN BHD`,
 * 2.949,0.313) sits 2.205in from the customer anchor against a 1.0in gate, and a second registered
 * name reaching the ballot is a CONTEST, which emits nothing. Both measured, not assumed.
 *
 * @param {{page:number,xmin:number,xmax:number,ymin:number,ymax:number,identity?:object}} candidate
 *        `identity` is the candidate's comparison FORM ({tokens, joined}), supplied by the caller
 *        so this file keeps owning POSITION only and never learns how a name is spelled.
 */
export function customerAttributionFailure(candidate, anchors, limit) {
  const customerDistance = boxDistance(candidate, anchors?.customer);
  if (customerDistance === null) return "no_customer_anchor";
  if (customerDistance > limit) return "customer_anchor_far";
  if (boxesOverlap(candidate, anchors?.vendor)) return "in_vendor_block";
  if (candidateIsVendorIdentity(candidate.identity, anchors?.vendorIdentity)) return "is_vendor_name";
  return null;
}

/** Full 2D extent of a flat polygon, scaled into the page's frame, or null when unusable. */
export function extentOf(polygon, scale) {
  if (!Array.isArray(polygon) || polygon.length < 8 || polygon.length % 2 !== 0) return null;
  const xs = [];
  const ys = [];
  for (let i = 0; i < polygon.length; i += 2) {
    const x = Number(polygon[i]);
    const y = Number(polygon[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    xs.push(x * scale);
    ys.push(y * scale);
  }
  return { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
}

/** The anchor boxes, scaled into the same frame as the candidates. */
export function scaleAnchor(anchor, scale) {
  if (!anchor) return null;
  return {
    page: anchor.page,
    xmin: anchor.xmin * scale, xmax: anchor.xmax * scale,
    ymin: anchor.ymin * scale, ymax: anchor.ymax * scale,
  };
}
