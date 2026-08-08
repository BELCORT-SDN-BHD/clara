// BLOCK-ATTRIBUTION GEOMETRY for the X7 customer-identity reader — the primitives that answer
// "is this line part of the buyer's block?" and nothing else. Split out of
// `invoice-customer-identity.mjs` (the repo's 500-line file limit) on the module's third natural
// seam: `invoice-party-grammar.mjs` owns SPELLING, this file owns POSITION, and the reader owns
// which line wins and what happens when two readings disagree.
//
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

/**
 * Is this candidate attributable to the CUSTOMER block? Returns null when it is, else the reason
 * it is not — so the receipt can name which defense refused it.
 *
 * The mirror of X6's `vendorAttributionFailure`, including its tie rule: STRICTLY closer to the
 * customer than to the vendor, with an epsilon, because a tie decided by floating-point dust is
 * still a tie and resolving it in the buyer's favour is exactly the guess this defense prevents.
 *
 * FAILS CLOSED on a missing customer anchor: no typed CustomerName region means no attribution
 * evidence, and no evidence means no emission.
 */
export function customerAttributionFailure(candidate, anchors, limit) {
  const customerDistance = boxDistance(candidate, anchors?.customer);
  if (customerDistance === null) return "no_customer_anchor";
  if (customerDistance > limit) return "customer_anchor_far";
  const vendorDistance = boxDistance(candidate, anchors?.vendor);
  const TIE_EPSILON = 1e-9;
  if (vendorDistance !== null && !(customerDistance + TIE_EPSILON < vendorDistance)) return "closer_to_vendor";
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
