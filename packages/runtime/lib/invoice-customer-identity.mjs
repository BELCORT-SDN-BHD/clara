// X7 — the deterministic CUSTOMER-identity reader (the F6–F9 fix batch, finding F7 / task #32;
// added to the extraction slice's X-taxonomy by that batch — docs/plan/extraction-slice-contract.md).
//
// WHY THIS EXISTS, measured on real client books (docs/plan/wave-7a-acceptance-h1.md rows 1 and
// 12, exhibit E7). ROME SECRETARY issued two invoices to KONG CHENG RESTAURANTS SDN BHD. Both
// print the company in the bill-to box and a separate `Attn : Lim Xiao Shan` contact line under
// it. Azure Document Intelligence's typed `CustomerName` came back as **the person** on BOTH —
// so `invoice.customer_name` read "Lim Xiao Shan", the sales lane could not resolve a
// counterparty, and both drafts sit held on `counterparty_unresolved` to this day.
//
// The defect is not a mis-ranked lexicon: BEFORE this module, Clara had NO deterministic
// customer-identity reader at all. `invoice.customer_name` was a byte-for-byte pass-through of
// Azure's typed field (`FIELD_MAP` in invoiceFacts.v1.azure.mjs), so an ML model's pick of which
// line in the bill-to box is "the customer" went to the books unchallenged. This module supplies
// the missing second reader: it reads the ADDRESSEE PARTY off the layout, label-anchored and
// geometry-bound, and reads the `Attn` person separately as `invoice.contact_person` — a contact
// is not a counterparty, and the two must never be the same field.
//
// THE HAZARD THIS MODULE IS SHAPED AROUND is the mirror of X6's: emitting the WRONG PARTY as the
// customer. On a sales invoice that births a counterparty on real client books (birth happens at
// human approval — `_resolve_counterparty` proposes, the approver creates), and every subsequent
// receipt, statement and ageing line inherits the error. A MISSING customer_name merely returns
// the lane to `customer_name_missing`, where a human already has to look. So every ambiguity
// resolves to REFUSE, and refusing means Azure's typed value stands exactly as it did before
// this module existed.
//
// ─── HONESTY NOTE, STATED BECAUSE IT IS A REAL DIFFERENCE FROM X6 ─────────────────────────────
// X6's thresholds were CALIBRATED against two real Azure captures (a measured 0.015in vendor
// gap; a letterhead at y≈0.88 of an 11.68in page). THE THRESHOLDS BELOW ARE NOT MEASURED — the
// KONG CHENG captures are real client documents, they are not in this repo, and no synthetic
// corpus can stand in for a measurement. They are therefore conservative, every one is an OPT,
// and the module is built so that a WRONG threshold produces an ABSTAIN (typed passes through,
// today's behaviour) rather than a wrong party. The live replay of the KONG CHENG pair IS the
// measurement; its acceptance should re-read these defaults against the real capture rather than
// assume them.
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// FOUR DEFENSES, all required, none silently skipped when its input is unavailable:
//
//   (a) UNIQUENESS-OR-NOTHING over the WHOLE document, for the party read and the contact read
//       independently. Two DISTINCT labelled party blocks ⇒ emit no party. Identical readings
//       collapse (the two-page invoice that repeats its bill-to box).
//   (b) THE LABEL GATE + THE PARTY-NAME GATE — `invoice-party-grammar.mjs`, which owns every
//       question about spelling. This is where X6's top-band defense would sit; there is
//       deliberately NO band analogue here (see THE MISSING BAND below).
//   (c) CUSTOMER-BLOCK ATTRIBUTION, the defense that makes an emission EVIDENCED rather than
//       merely label-shaped. A candidate must sit next to the typed `CustomerName` field's OWN
//       bounding region and — when a typed `VendorName` region also exists — closer to the
//       customer's than to the vendor's. THIS IS X6'S INSIGHT RE-APPLIED, and it is exactly why
//       it works on the F7 defect: on those documents Azure's typed CustomerName picked the
//       WRONG LINE, but it picked a wrong line INSIDE the bill-to box — its CONTENT is wrong
//       while its GEOMETRY points straight at the block. Attribution by position, never by text.
//       FAIL CLOSED: no typed CustomerName region ⇒ no attribution evidence ⇒ no emission.
//   (d) RECONCILIATION with the typed emission — `mergeCustomerIdentity` below, which decides
//       who WINS and is therefore the part of this file to read hardest. Its full matrix is
//       written out there rather than left to be inferred from the branches.
//
// THE MISSING BAND, stated rather than papered over. X6's second defense is "a letterhead sits
// at the top of its page by convention". No such convention exists for the buyer block — it sits
// upper-left on one layout, upper-right on the next, lower on a letterhead-heavy one. Inventing
// an unmeasured band would refuse real documents for a reason no one measured, and X6's own
// lesson cuts both ways: a wall that vanishes when its input goes missing is not a wall, and a
// wall no measurement supports is not one either — it is a guess wearing a threshold.
// Attribution (c) does the work the band did for X6, against evidence Azure actually produced.
//
// A KNOWN LIMIT, recorded now rather than discovered later: because attribution anchors on the
// typed CustomerName region, this reader can NEVER supply a customer_name for a document where
// Azure typed no CustomerName at all. The FINCARE row (acceptance-h1 row 10, held
// `customer_name_missing`) is exactly that shape and is NOT fixed by F7. Relaxing the anchor to
// "far from the vendor" would be absence-as-evidence, which the house's review law 2 forbids.
// That document needs a different door.

import { pageFrame } from "./invoice-totals-reader.mjs";
import { asciiTrim } from "./invoice-amount-grammar.mjs";
import { looksLikePartyName, partyKey, splitAttnLabel, splitBillToLabel } from "./invoice-party-grammar.mjs";

export { looksLikePartyName, partyKey, splitAttnLabel, splitBillToLabel, splitLabelled, BILL_TO_LABELS, ATTN_LABELS } from "./invoice-party-grammar.mjs";

// EVERY GEOMETRIC COMPARISON IN EVERY READER MUST BE UNIT-NORMALIZED — Azure reports PDF geometry
// in inches and IMAGE geometry in pixels. The conversion is imported from the X2 reader
// (`pageFrame`) rather than written again here: one definition, one place to fix it. This is the
// THIRD reader to inherit it; the first two each learned it the expensive way.

export const DEFAULT_CUSTOMER_IDENTITY_OPTS = Object.freeze({
  /** Distance allowed between a candidate line and the typed CustomerName region, in inches.
   *  UNMEASURED (see the honesty note above). Sized for the F7 shape the acceptance record
   *  describes — a party line one or two printed rows above an `Attn` line Azure typed over,
   *  roughly 0.2-0.5in on an A4 bill — plus headroom for a two- or three-line address between
   *  them. What keeps this generous number safe is the vendor-comparison term below plus the
   *  label vocabulary: nothing in a supplier's letterhead opens with `Bill To`. */
  customerAnchorGapIn: 1.0,
  /** How far BELOW a bare label line (`Bill To:` on its own row) the party name may sit, in
   *  inches, for the split-line scan. One or two printed rows on an A4 bill. */
  blockGapIn: 0.6,
  /** How many following lines the split-line scan may examine before giving up. The party name
   *  is conventionally the first line of the block; the allowance covers an `Attn` line printed
   *  ABOVE the name plus one stray OCR fragment. */
  maxLookaheadLines: 3,
  /** Skew tolerance when deciding whether a line sits BELOW another, in inches. X2 measured page
   *  angles of -1.31° and +0.21°, moving a same-row box up to 0.14in against its neighbour; 0.15
   *  is that measurement's own ratified window, carried across rather than re-derived. */
  skewToleranceIn: 0.15,
});

/**
 * TWO-DIMENSIONAL gap between two boxes on the same page — 0 when they overlap in both axes,
 * else the Euclidean distance between their nearest edges. Null when the anchor is absent or on
 * another page, which is NO EVIDENCE rather than a near miss. Identical in rule to X6's, for the
 * identical reason: a y-only gap calls a name on the left and a name on the right "adjacent".
 */
function boxDistance(candidate, anchor) {
  if (!anchor || anchor.page !== candidate.page) return null;
  const dx = Math.max(0, anchor.xmin - candidate.xmax, candidate.xmin - anchor.xmax);
  const dy = Math.max(0, anchor.ymin - candidate.ymax, candidate.ymin - anchor.ymax);
  return Math.hypot(dx, dy);
}

/** Shared horizontal extent between two boxes; <= 0 means different columns. */
const xOverlap = (a, b) => Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin);

/**
 * Is this candidate attributable to the CUSTOMER block? Returns null when it is, else the reason
 * it is not — so the receipt can name which defense refused it.
 *
 * The mirror of X6's `vendorAttributionFailure`, including its tie rule: STRICTLY closer to the
 * customer than to the vendor, with an epsilon, because a tie decided by floating-point dust is
 * still a tie and resolving it in the buyer's favour is exactly the guess this defense prevents.
 */
function customerAttributionFailure(candidate, anchors, limit) {
  const customerDistance = boxDistance(candidate, anchors?.customer);
  if (customerDistance === null) return "no_customer_anchor";
  if (customerDistance > limit) return "customer_anchor_far";
  const vendorDistance = boxDistance(candidate, anchors?.vendor);
  const TIE_EPSILON = 1e-9;
  if (vendorDistance !== null && !(customerDistance + TIE_EPSILON < vendorDistance)) return "closer_to_vendor";
  return null;
}

/** Full 2D extent of a flat polygon, scaled into the page's frame, or null when unusable. */
function extentOf(polygon, scale) {
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
function scaleAnchor(anchor, scale) {
  if (!anchor) return null;
  return {
    page: anchor.page,
    xmin: anchor.xmin * scale, xmax: anchor.xmax * scale,
    ymin: anchor.ymin * scale, ymax: anchor.ymax * scale,
  };
}

const emptyReceipt = () => ({
  matched: 0, absent: 0, ambiguous: 0,
  rejected_gate: 0, label_continuation: 0, no_geometry: 0, unit_unresolved: 0,
  no_customer_anchor: 0, customer_anchor_far: 0, closer_to_vendor: 0,
  split_line_scanned: 0, split_line_exhausted: 0, attn_skipped: 0,
  attn_matched: 0, attn_ambiguous: 0, attn_rejected_gate: 0, attn_unattributed: 0,
  emitted: 0, contact_emitted: 0,
  typed_collapsed: 0, typed_overridden_attn: 0, typed_disagreement: 0,
  candidates: [],
});

/**
 * Read the addressee PARTY and the `Attn` CONTACT PERSON off `analyzeResult.pages[].lines[]`.
 *
 * Returns at most TWO fields — `invoice.customer_name` and `invoice.contact_person` — each
 * carrying its own source line's polygon and the label-stripped remainder verbatim. Every
 * refusal is counted; nothing is capped silently.
 *
 * @param {Array<{pageNumber?:number, width?:number, unit?:string, lines?:Array<{content?:string, polygon?:number[], confidence?:number}>}>} pages
 * @param {{vendor:object|null, customer:object|null}|null} anchors from X6's `anchorsFromTypedFields`
 * @param {object} [opts] see DEFAULT_CUSTOMER_IDENTITY_OPTS
 * @returns {{fields:Array, receipt:object}}
 */
export function readCustomerIdentityFromLines(pages, anchors = null, opts = {}) {
  const settings = { ...DEFAULT_CUSTOMER_IDENTITY_OPTS, ...opts };
  const receipt = emptyReceipt();
  const parties = [];
  const contacts = [];
  const note = (outcome, label, page, extra = {}) => { receipt.candidates.push({ label, outcome, page, ...extra }); };

  for (const page of Array.isArray(pages) ? pages : []) {
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    if (lines.length === 0) continue;
    const pageNumber = Number(page?.pageNumber) || 1;
    // The page's own coordinate frame — the X2 definition. A pixel page with no usable width has
    // no knowable frame, so its candidates are refused rather than measured in the wrong unit.
    const frame = pageFrame(page);
    const boxes = frame ? lines.map((l) => extentOf(l?.polygon, frame.scale)) : lines.map(() => null);
    const anchorLimit = frame ? frame.inchToFrame(settings.customerAnchorGapIn) : null;
    const blockGap = frame ? frame.inchToFrame(settings.blockGapIn) : null;
    const skewTol = frame ? frame.inchToFrame(settings.skewToleranceIn) : null;
    const scaledAnchors = frame
      ? { vendor: scaleAnchor(anchors?.vendor, frame.scale), customer: scaleAnchor(anchors?.customer, frame.scale) }
      : null;

    /** Attribution (defense c), counted under the right head so the receipt names the refusal. */
    const attributed = (box, label, kind) => {
      const failure = customerAttributionFailure({ ...box, page: pageNumber }, scaledAnchors, anchorLimit);
      if (!failure) return true;
      if (kind === "party") receipt[failure] += 1;
      else receipt.attn_unattributed += 1;
      note(failure, label, pageNumber, { kind });
      return false;
    };

    for (let i = 0; i < lines.length; i++) {
      const text = String(lines[i]?.content ?? "");

      // ── THE CONTACT READ. An `Attn` line is claimed FIRST and unconditionally: whatever else
      // it might look like, a line naming a contact person is not the party, and taking it out of
      // party candidacy HERE is the structural form of "the boxed party beats the Attn person".
      // The ranking is not a tie-break applied later — the person is never in the race.
      const attn = splitAttnLabel(text);
      if (attn) {
        if (attn.continuation || !attn.remainder || !looksLikePartyName(attn.remainder)) {
          receipt.attn_rejected_gate += 1;
          note("attn_rejected_gate", attn.label, pageNumber, { kind: "attn" });
          continue;
        }
        if (!frame) { receipt.unit_unresolved += 1; note("unit_unresolved", attn.label, pageNumber, { kind: "attn" }); continue; }
        if (boxes[i] === null) { receipt.no_geometry += 1; note("no_geometry", attn.label, pageNumber, { kind: "attn" }); continue; }
        if (!attributed(boxes[i], attn.label, "attn")) continue;
        contacts.push({
          value_raw: attn.remainder, key: partyKey(attn.remainder), page: pageNumber,
          polygon: (lines[i].polygon || []).map(Number),
          confidence: lines[i]?.confidence == null ? null : Number(lines[i].confidence),
        });
        note("attn_accepted", attn.label, pageNumber, { kind: "attn", key: partyKey(attn.remainder) });
        continue;
      }

      // ── THE PARTY READ.
      const hit = splitBillToLabel(text);
      if (!hit) continue;
      if (hit.continuation) {
        receipt.label_continuation += 1;
        note("label_continuation", hit.label, pageNumber, { kind: "party" });
        continue;
      }
      if (!frame) { receipt.unit_unresolved += 1; note("unit_unresolved", hit.label, pageNumber, { kind: "party" }); continue; }
      const labelBox = boxes[i];
      if (labelBox === null) {
        // A recognised label with unusable geometry is a REFUSAL and it has to be visible: a
        // readable document must not look like one that printed nothing (X6's lesson, verbatim).
        receipt.no_geometry += 1;
        note("no_geometry", hit.label, pageNumber, { kind: "party" });
        continue;
      }

      let value = null; // {raw, box, lineIndex}
      if (hit.remainder) {
        // SAME-LINE: `Bill To: KONG CHENG RESTAURANTS SDN BHD`.
        if (!looksLikePartyName(hit.remainder)) {
          receipt.rejected_gate += 1;
          note("rejected_gate", hit.label, pageNumber, { kind: "party" });
          continue;
        }
        value = { raw: hit.remainder, box: labelBox, lineIndex: i };
      } else {
        // SPLIT-LINE: a bare `Bill To:` with the party on a following row. Unlike X6 — where a
        // letterhead prints label and number on ONE line, so a split shape is out of scope — the
        // bill-to BOX is split-line by construction, so this path is not optional. It is bounded
        // on every axis: reading order, a line count, a vertical gap, column overlap, and the
        // party gate. It STOPS at the first line that is not a name, because once the address has
        // begun the name portion has ended.
        receipt.split_line_scanned += 1;
        const limit = Math.min(lines.length - 1, i + Math.max(0, settings.maxLookaheadLines));
        for (let j = i + 1; j <= limit; j++) {
          const box = boxes[j];
          if (box === null) { receipt.no_geometry += 1; note("no_geometry", hit.label, pageNumber, { kind: "party_value" }); break; }
          if (box.ymin + skewTol < labelBox.ymin) break;   // above the label: not this block
          if (box.ymin - labelBox.ymax > blockGap) break;  // the block ended
          if (xOverlap(box, labelBox) <= 0) break;         // a different column
          if (splitAttnLabel(String(lines[j]?.content ?? ""))) { receipt.attn_skipped += 1; continue; }
          const raw = asciiTrim(String(lines[j]?.content ?? ""));
          if (!looksLikePartyName(raw)) {
            receipt.rejected_gate += 1;
            note("rejected_gate", hit.label, pageNumber, { kind: "party_value" });
            break;
          }
          value = { raw, box, lineIndex: j };
          break;
        }
        if (!value) {
          receipt.split_line_exhausted += 1;
          note("split_line_exhausted", hit.label, pageNumber, { kind: "party" });
          continue;
        }
      }

      if (!attributed(value.box, hit.label, "party")) continue;
      const source = lines[value.lineIndex];
      parties.push({
        value_raw: value.raw, key: partyKey(value.raw), page: pageNumber,
        polygon: (source.polygon || []).map(Number),
        confidence: source?.confidence == null ? null : Number(source.confidence),
      });
      note("accepted", hit.label, pageNumber, { kind: "party", key: partyKey(value.raw) });
    }
  }

  const fields = [];

  // ── THE CONTACT, uniqueness-or-nothing. Two DIFFERENT named contacts is not a fact about one
  // person; identical repeats (a two-page invoice) collapse.
  const contactKeys = new Set(contacts.map((c) => c.key));
  if (contactKeys.size === 1) {
    const [first] = contacts;
    receipt.attn_matched += 1;
    receipt.attn_key = first.key;
    receipt.attn_value_raw = first.value_raw;
    fields.push({ field_path: "invoice.contact_person", value_raw: first.value_raw, page: first.page, polygon: first.polygon, confidence: first.confidence });
  } else if (contactKeys.size > 1) {
    receipt.attn_ambiguous += 1;
    receipt.attn_distinct_keys = [...contactKeys];
  }

  // ── THE PARTY, uniqueness-or-nothing.
  if (parties.length === 0) {
    receipt.absent += 1;
    receipt.outcome = "absent";
    return { fields, receipt };
  }
  const partyKeys = new Set(parties.map((c) => c.key));
  if (partyKeys.size > 1) {
    // Two different labelled parties, both attributable to the customer block. There is no basis
    // for preferring one, so neither is emitted.
    receipt.ambiguous += 1;
    receipt.outcome = "ambiguous";
    receipt.distinct_keys = [...partyKeys];
    return { fields, receipt };
  }
  const [first] = parties;
  receipt.matched += 1;
  receipt.outcome = "matched";
  receipt.value_raw = first.value_raw;
  receipt.occurrences = parties.length;
  fields.push({ field_path: "invoice.customer_name", value_raw: first.value_raw, page: first.page, polygon: first.polygon, confidence: first.confidence });
  return { fields, receipt };
}

/**
 * Merge the reader's emissions into the mapper's field list, reconciling `invoice.customer_name`
 * against Azure's typed row. Mutates `out` and `identity.receipt`.
 *
 * THE FULL MATRIX — this is the judgement half of the module, so it is written out rather than
 * left to be inferred from the branches below:
 *
 *   reader ABSENT / refused   → typed stands, byte-identical to pre-X7 behaviour. The reader
 *                               having nothing to say is not evidence about Azure.
 *   reader AMBIGUOUS          → typed stands. DELIBERATELY UNLIKE X6, which withdraws the typed
 *                               row when its own reader is contested. The asymmetry is reasoned:
 *                               ambiguity is the reader making NO assertion, and one assertion is
 *                               not a contest. X6's case is genuinely different — there the typed
 *                               value is by construction one of the two contested readings,
 *                               because both come from the same closed registration grammar; a
 *                               typed CustomerName need not be either of two labelled blocks.
 *   typed ABSENT / empty      → the reader supplies the identity. `emitted`.
 *   reader AGREES with typed  → ONE row survives and it is the TYPED one: it carries Azure's own
 *                               region. `typed_collapsed`. Never two rows for one field_path —
 *                               `persist_invoice_facts` forfeits the WHOLE extraction on
 *                               conflicting text duplicates (0026:810-819), which would destroy
 *                               the working `invoice.total` capture along with this one.
 *   typed == the reader's OWN
 *     Attn person, party
 *     differs                 → THE F7 DEFECT, named and fixed: the reader's party REPLACES the
 *                               typed row and the person is emitted separately as
 *                               `invoice.contact_person`. `typed_overridden_attn`. This is the
 *                               ONLY branch where one machine reading overrides another of the
 *                               same field, and the document itself licenses it — the person is
 *                               labelled `Attn`, and a contact line is not a party under any
 *                               reading of the page.
 *   UNEXPLAINED disagreement  → EMIT NEITHER (X6's semantics). Two readers, two different buyers,
 *                               and nothing on the page explains the difference: a contested
 *                               identity resolves no counterparty on its own authority. The
 *                               document falls to `customer_name_missing`, where a human reads
 *                               the actual page. `typed_disagreement`.
 */
export function mergeCustomerIdentity(out, identity) {
  const receipt = identity.receipt;
  const contact = identity.fields.find((f) => f.field_path === "invoice.contact_person");
  const party = identity.fields.find((f) => f.field_path === "invoice.customer_name");

  // `invoice.contact_person` has NO typed counterpart in the Document Intelligence vocabulary and
  // no other producer anywhere in the repo, so it is purely additive: nothing to reconcile
  // against, nothing it can collide with.
  if (contact && !out.some((r) => r.field_path === "invoice.contact_person")) {
    out.push(contact);
    receipt.contact_emitted += 1;
  }
  if (!party) return;

  const typed = out.find((r) => r.field_path === "invoice.customer_name");
  const typedRaw = String(typed?.value_raw ?? "").trim();
  if (!typed || !typedRaw) {
    if (typed) Object.assign(typed, party);
    else out.push(party);
    receipt.emitted += 1;
    return;
  }
  if (partyKey(typedRaw) === partyKey(party.value_raw)) {
    receipt.typed_collapsed += 1;
    return;
  }
  if (receipt.attn_key && partyKey(typedRaw) === receipt.attn_key) {
    Object.assign(typed, party);
    receipt.typed_overridden_attn += 1;
    receipt.outcome = "attn_overridden";
    return;
  }
  out.splice(out.indexOf(typed), 1);
  receipt.typed_disagreement += 1;
  receipt.outcome = "typed_disagreement";
}
