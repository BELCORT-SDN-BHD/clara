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
// ─── THE READER IS A CHECK/OVERRIDE LAYER, NEVER A SOLE AUTHOR ────────────────────────────────
// (orchestrator ruling on the two-lane review, 2026-08-09.) Two behaviours the original work
// order specified were OVERRULED toward fail-closed after both review lanes broke them by
// executing this code, and the overrules are recorded here rather than only in the ADR:
//   1. SOLE AUTHORSHIP IS DELETED. The reader may never fill an empty or absent typed
//      `CustomerName`. With an empty-but-regioned typed field the first cut emitted a line item,
//      a contact person, a caption (`Name:`) and a street address as the customer of record —
//      each a WRONG identity manufactured where pass-through had supplied none.
//   2. A CONTESTED landscape (≥2 distinct labelled parties) WITHDRAWS the typed row instead of
//      leaving it standing. A contest is something the reader positively measured, not an
//      absence of opinion.
// The full lawful-action set lives on `mergeCustomerIdentity` below.
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// ─── ROUND-3 DESIGN LAW: POSITIVE EVIDENCE, NOT ENUMERATION ───────────────────────────────────
// PARTY CANDIDACY REQUIRES A POSITIVE REGISTERED-ENTITY SIGNAL (`hasRegisteredEntitySuffix`, the
// documented Malaysian suffix family in `invoice-party-grammar.mjs`). No suffix ⇒ no candidacy ⇒
// no override, no contest, no disagreement-withdraw: the reader abstains and typed stands.
//
// WHY, the structural lesson three rounds paid for. The party gate was a BLOCKLIST and both scan
// paths took the FIRST string it admitted. A blocklist only enumerates the past, so every round
// found a fresh instance of ONE class — a label whose remainder is furniture (`Customer's Ref:
// PO-8891`, `Buyer Signature`: fifteen in a single probe) — and every scan widening reopened it
// (the two-column skip repair let the caption `DELIVERY ADDRESS` win). The override branch is the
// only branch that can write a WRONG party onto real books, so it demands positive evidence.
//
// ONE LEXICON, TWO POLARITIES. The same suffix family that ADMITS a party REFUSES a contact: an
// entity-suffixed string is never a person. Without that symmetry, `Attention:` → `ACME SDN BHD`
// emitted the company as BOTH `customer_name` and `contact_person`.
//
// A NON-CANDIDATE IS A SKIP, NOT A STOP. The scan walks past anything without the signal, within
// its existing bounds, so a caption printed ABOVE the party no longer hides it — and no
// prefer-last heuristic is needed: the first line carrying the signal still wins.
//
// A SUFFIX PROVES A NAME IS PRESENT, NOT THAT THE NAME IS THE ADDRESSEE (round 4). Skipping is
// what made this bite: `Bill To:` / `SIFU LAB` / `c/o AMATERUS GROUP SDN BHD` skipped a REAL
// unsuffixed buyer and birthed the c/o line. So the base must be a NAME, not a phrase mentioning
// one — `NON_ADDRESSEE_MARKERS`, enforced in `looksLikePartyName` so BOTH polarities inherit it.
// ──────────────────────────────────────────────────────────────────────────────────────────────
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
//       question about spelling. Where X6's top-band defense would sit; there is deliberately
//       NO band analogue (see THE MISSING BAND below).
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
// at the top of its page by convention". No such convention exists for the buyer block, so an
// unmeasured band would refuse real documents for a reason no one measured — X6's lesson cuts
// both ways: a wall no measurement supports is a guess wearing a threshold. Attribution (c) does
// the band's work here, against evidence Azure actually produced.
//
// A KNOWN LIMIT, recorded now rather than discovered later: because attribution anchors on the
// typed CustomerName region, this reader can NEVER supply a customer_name where Azure typed none.
// The FINCARE row (acceptance-h1 row 10, held `customer_name_missing`) is that shape and is NOT
// fixed by F7. Relaxing the anchor to "far from the vendor" would be absence-as-evidence, which
// review law 2 forbids. That document needs a different door.

import { pageFrame } from "./invoice-totals-reader.mjs";
import { asciiTrim } from "./invoice-amount-grammar.mjs";
import { containsEntityToken, hasRegisteredEntitySuffix, looksLikePartyName, partyKey, splitAttnLabel, splitBillToLabel } from "./invoice-party-grammar.mjs";
import { customerAttributionFailure, extentOf, scaleAnchor, xOverlap } from "./invoice-block-geometry.mjs";

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
   *  is conventionally the first line of the block; the allowance covers an `Attn` label and its
   *  reserved value line printed ABOVE the name, plus an interleaved right-hand meta column
   *  (Azure emits lines in reading order, so a two-column header alternates). RAISED FROM 3
   *  because SKIPPED lines now spend budget where they used to end the scan — the bound is what
   *  matters, not its exact size, and a pathological page still terminates in `maxLookaheadLines`
   *  steps per label. */
  maxLookaheadLines: 5,
  /** Skew tolerance when deciding whether a line sits BELOW another, in inches. X2 measured page
   *  angles of -1.31° and +0.21°, moving a same-row box up to 0.14in against its neighbour; 0.15
   *  is that measurement's own ratified window, carried across rather than re-derived. */
  skewToleranceIn: 0.15,
});

const emptyReceipt = () => ({
  matched: 0, absent: 0, contested: 0,
  rejected_gate: 0, label_continuation: 0, no_geometry: 0, unit_unresolved: 0,
  no_customer_anchor: 0, customer_anchor_far: 0, closer_to_vendor: 0,
  split_line_scanned: 0, split_line_exhausted: 0, no_entity_suffix: 0,
  attn_skipped: 0, column_skipped: 0, reserved_skipped: 0,
  attn_matched: 0, attn_ambiguous: 0, attn_rejected_gate: 0, attn_no_value: 0, attn_unattributed: 0,
  contact_emitted: 0,
  typed_collapsed: 0, typed_overridden_attn: 0, typed_disagreement: 0,
  typed_vs_contested: 0, sole_authorship_refused: 0,
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
    /** Line indices claimed by PASS 1 as a contact VALUE — never available to the party read. */
    const reserved = new Set();

    /** Attribution (defense c), counted under the right head so the receipt names the refusal. */
    const attributed = (box, label, kind) => {
      const failure = customerAttributionFailure({ ...box, page: pageNumber }, scaledAnchors, anchorLimit);
      if (!failure) return true;
      if (kind === "party") receipt[failure] += 1;
      else receipt.attn_unattributed += 1;
      note(failure, label, pageNumber, { kind });
      return false;
    };

    /**
     * The BOUNDED FORWARD SCAN shared by both split-line reads (`Bill To:` / `Attention:` alone
     * on a row, value beneath). Bounded on every axis — reading order, a line budget, a vertical
     * gap, column cohesion and the value gate — and it distinguishes SKIP from STOP:
     *
     *   SKIP (keep looking, spend budget): a line in another COLUMN, an `Attn` label line, a line
     *     already reserved as a contact value, or — for a PARTY read — anything that is not a
     *     registered-entity candidate. Azure emits lines in READING ORDER, so a two-column header
     *     interleaves the right-hand meta column between a `Bill To:` label and the party beneath
     *     it. The first cut BROKE on the first non-overlapping line, which fails closed but means
     *     the fix may never FIRE on a real two-column KONG CHENG layout.
     *   STOP (out of bounds): unusable geometry, a line above the label, a line past the vertical
     *     gap, or the line budget.
     *
     * A NON-CANDIDATE IS A SKIP, NOT A STOP, and that is what the entity gate bought. The old
     * scan stopped at the first line failing the name gate, on the theory "once the address has
     * begun, the name portion is over" — so a caption printed ABOVE the party (`DELIVERY ADDRESS`
     * on the reviewer's own two-column layout) either ENDED the scan or, once it passed the
     * blocklist, WON as the party. With a positive entity signal neither happens: the caption
     * simply is not a candidate, the scan steps over it, and the suffixed line beneath is found.
     * NO prefer-last heuristic is involved — the first line carrying the signal wins, as before.
     */
    const scanBelow = (i, labelBox, kind, label) => {
      // ONE LEXICON, TWO DIFFERENT PREDICATES — deliberately asymmetric, both fail-closed.
      // A party must END in the entity signal (strict); a contact must not CONTAIN one anywhere
      // (broad). The contact side used to be the NEGATION of party candidacy, which is a
      // different proposition: company-shaped strings that failed candidacy for some other
      // reason (`SDN BHD` alone, `ACME SDN BHD (123456-X)`, `ACME SDN BHD, Kuala Lumpur`,
      // `ACME P.L.T.`) all landed in the contact bucket and were persisted as people.
      const isCandidate = (raw) => (looksLikePartyName(raw)
        && (kind === "party" ? hasRegisteredEntitySuffix(raw) : !containsEntityToken(raw)));
      const limit = Math.min(lines.length - 1, i + Math.max(0, settings.maxLookaheadLines));
      for (let j = i + 1; j <= limit; j++) {
        const box = boxes[j];
        if (box === null) { receipt.no_geometry += 1; note("no_geometry", label, pageNumber, { kind: `${kind}_value` }); return null; }
        if (box.ymin + skewTol < labelBox.ymin) return null;   // above the label: not this block
        if (box.ymin - labelBox.ymax > blockGap) return null;  // the block ended
        if (xOverlap(box, labelBox) <= 0) { receipt.column_skipped += 1; continue; }
        if (reserved.has(j)) { receipt.reserved_skipped += 1; continue; }
        if (splitAttnLabel(String(lines[j]?.content ?? ""))) { receipt.attn_skipped += 1; continue; }
        const raw = asciiTrim(String(lines[j]?.content ?? ""));
        if (!isCandidate(raw)) {
          // Counted under the head that actually refused it — a receipt that lumps "this is not
          // a name" together with "this is a name but carries no entity signal" cannot tell a
          // reader which wall did the work.
          if (kind !== "party") receipt.attn_rejected_gate += 1;
          else if (!looksLikePartyName(raw)) receipt.rejected_gate += 1;
          else receipt.no_entity_suffix += 1;
          note(kind === "party" && looksLikePartyName(raw) ? "no_entity_signal" : "rejected_gate",
            label, pageNumber, { kind: `${kind}_value` });
          continue;
        }
        return { raw, box, lineIndex: j };
      }
      return null;
    };

    // ══ PASS 1 — THE CONTACT READ, and it runs FIRST for a structural reason.
    // A line the document labelled as a contact is not the party, whatever else it looks like.
    // Claiming those lines up front is the structural form of "the boxed party beats the Attn
    // person": the ranking is not a tie-break applied later — the person is never in the race.
    // THE SPLIT FORM IS WHY THIS IS A SEPARATE PASS. `Attention:` alone on a row, with the name
    // beneath it, reserves only its LABEL line under a single interleaved pass — so the value
    // line stayed a live party candidate and an executed probe emitted `Lim Xiao Shan` as
    // `customer_name`. Reserving the VALUE line is the fix, and it must happen before any party
    // scan can reach it.
    for (let i = 0; i < lines.length; i++) {
      const attn = splitAttnLabel(String(lines[i]?.content ?? ""));
      if (!attn) continue;
      if (attn.continuation) {
        receipt.attn_rejected_gate += 1;
        note("attn_rejected_gate", attn.label, pageNumber, { kind: "attn" });
        continue;
      }
      if (!frame) { receipt.unit_unresolved += 1; note("unit_unresolved", attn.label, pageNumber, { kind: "attn" }); continue; }
      if (boxes[i] === null) { receipt.no_geometry += 1; note("no_geometry", attn.label, pageNumber, { kind: "attn" }); continue; }

      let value = null;
      if (attn.remainder) {
        // The contact polarity: a person, and NEVER an entity-suffixed string (see scanBelow).
        if (!looksLikePartyName(attn.remainder) || hasRegisteredEntitySuffix(attn.remainder)) {
          receipt.attn_rejected_gate += 1;
          note("attn_rejected_gate", attn.label, pageNumber, { kind: "attn" });
          continue;
        }
        value = { raw: attn.remainder, box: boxes[i], lineIndex: i };
      } else {
        value = scanBelow(i, boxes[i], "attn", attn.label);
        // Counted apart from `attn_rejected_gate`: that head means "a line was examined and
        // refused as a contact VALUE"; this one means "a bare Attn label found no value at all".
        // Spending one counter on both makes the receipt double-count a single line.
        if (!value) { receipt.attn_no_value += 1; note("attn_no_value", attn.label, pageNumber, { kind: "attn" }); continue; }
      }
      // RESERVE THE VALUE LINE UNCONDITIONALLY — before attribution, and whether or not
      // attribution goes on to accept it. The document labelled that line a contact; attribution
      // failing says something about GEOMETRY, nothing about what the line IS. Reserving only on
      // success would hand the party read exactly the lines the contact read could not vouch for.
      reserved.add(value.lineIndex);
      if (!attributed(value.box, attn.label, "attn")) continue;
      const src = lines[value.lineIndex];
      contacts.push({
        value_raw: value.raw, key: partyKey(value.raw), page: pageNumber,
        polygon: (src.polygon || []).map(Number),
        confidence: src?.confidence == null ? null : Number(src.confidence),
      });
      note("attn_accepted", attn.label, pageNumber, { kind: "attn", key: partyKey(value.raw) });
    }

    // ══ PASS 2 — THE PARTY READ.
    for (let i = 0; i < lines.length; i++) {
      // A reserved line cannot open a party read either. NOT counted here: `reserved_skipped`
      // means "a candidate VALUE line was stepped over", which is what `scanBelow` records —
      // counting the same line twice from two different positions makes the receipt lie about
      // how many candidates the scan actually passed.
      if (reserved.has(i)) continue;
      const text = String(lines[i]?.content ?? "");
      if (splitAttnLabel(text)) continue;      // an Attn LABEL line is never a party line
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
        // SAME-LINE: `Bill To: KONG CHENG RESTAURANTS SDN BHD`. The entity signal is required
        // HERE too, not only on the split-line value path — this is where the fifteen furniture
        // remainders (`Buyer Signature` → `Signature`, `Customer Since 2019` → `Since 2019`)
        // entered, and no blocklist enumerated them all.
        if (!looksLikePartyName(hit.remainder)) {
          receipt.rejected_gate += 1;
          note("rejected_gate", hit.label, pageNumber, { kind: "party" });
          continue;
        }
        if (!hasRegisteredEntitySuffix(hit.remainder)) {
          receipt.no_entity_suffix += 1;
          note("no_entity_signal", hit.label, pageNumber, { kind: "party" });
          continue;
        }
        value = { raw: hit.remainder, box: labelBox, lineIndex: i };
      } else {
        // SPLIT-LINE: a bare `Bill To:` with the party on a following row. Unlike X6 — where a
        // letterhead prints label and number on ONE line, so a split shape is out of scope — the
        // bill-to BOX is split-line by construction, so this path is not optional.
        receipt.split_line_scanned += 1;
        value = scanBelow(i, labelBox, "party", hit.label);
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
    // A CONTEST, not an abstention — and the distinction is the whole point. Two DIFFERENT
    // labelled parties, both attributable to the customer block, is something the reader
    // POSITIVELY MEASURED about the document: its buyer identity is not settled. Neither is
    // emitted, and `mergeCustomerIdentity` withdraws the typed row too (Ruling 3): leaving it
    // standing lets a typed value that happens to equal ONE of two conflicting labelled parties
    // resolve a counterparty on its own authority — `Bill To: WRONG HOLDING` +
    // `Bill To: ACTUAL SUBSIDIARY` with typed `WRONG HOLDING` persisted the wrong identity.
    // Same-key repeats across pages are ONE candidate (see `occurrences`), never a contest.
    receipt.contested += 1;
    receipt.outcome = "contested";
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
 * THE READER IS A CHECK/OVERRIDE LAYER, NEVER A SOLE AUTHOR — the two overrules and the
 * positive-evidence law are recorded in the module header above. THE LAWFUL ACTIONS ARE FOUR:
 *   COLLAPSE   reader AGREES with typed → ONE row survives and it is the TYPED one (it carries
 *              Azure's own region). `typed_collapsed`. Never two rows for one field_path —
 *              `persist_invoice_facts` forfeits the WHOLE extraction on conflicting text
 *              duplicates (0026:810-819), which would destroy the working `invoice.total`
 *              capture along with this one.
 *   OVERRIDE   typed (non-empty) == the reader's OWN Attn person, and a distinct party block
 *              exists → THE F7 DEFECT: the party REPLACES the typed row and the person is
 *              emitted separately as `invoice.contact_person`. `typed_overridden_attn`. The only
 *              branch where one machine reading overrules another of the same field, and the
 *              document itself licenses it — a line labelled `Attn` is not a party under any
 *              reading of the page.
 *   WITHDRAW   unexplained disagreement → EMIT NEITHER (X6's semantics). Two readers, two
 *              different buyers, nothing on the page explaining it. `typed_disagreement`.
 *   WITHDRAW   contested landscape → EMIT NEITHER. `typed_vs_contested`.
 *
 * And its two lawful silences: reader ABSENT/refused → typed stands byte-identically (the reader
 * having nothing to say is not evidence about Azure); reader has a party but typed is
 * empty/absent → nothing emitted, `sole_authorship_refused`.
 *
 * `invoice.contact_person` is unaffected by all of the above: it has no typed counterpart in the
 * Document Intelligence vocabulary and no other producer in the repo, so it is purely additive.
 */
export function mergeCustomerIdentity(out, identity) {
  const receipt = identity.receipt;
  const contact = identity.fields.find((f) => f.field_path === "invoice.contact_person");
  const party = identity.fields.find((f) => f.field_path === "invoice.customer_name");
  const typed = out.find((r) => r.field_path === "invoice.customer_name");
  const typedRaw = String(typed?.value_raw ?? "").trim();

  if (contact && !out.some((r) => r.field_path === "invoice.contact_person")) {
    out.push(contact);
    receipt.contact_emitted += 1;
  }

  // A CONTEST is a positive measurement, so it is handled BEFORE the no-party return — the
  // reader emits no party precisely because it found two.
  if (receipt.outcome === "contested") {
    if (typed && typedRaw) {
      out.splice(out.indexOf(typed), 1);
      receipt.typed_vs_contested += 1;
    }
    return;
  }
  if (!party) return;

  if (!typed || !typedRaw) {
    // RECONCILIATION-ONLY. There is nothing to reconcile against, and the reader does not get to
    // author an identity on its own. Recorded rather than silent so the refusal is inspectable
    // on live without re-running the engine.
    receipt.sole_authorship_refused += 1;
    receipt.outcome = "sole_authorship_refused";
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
