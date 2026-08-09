// X7 — the deterministic CUSTOMER-identity reader (the F6–F9 fix batch, finding F7 / task #32;
// added to the extraction slice's X-taxonomy by that batch — docs/plan/extraction-slice-contract.md).
//
// WHY THIS EXISTS, measured on real client books (docs/plan/wave-7a-acceptance-h1.md rows 1 and
// 12, exhibit E7). ROME SECRETARY issued two invoices to KONG CHENG RESTAURANTS SDN BHD. Both
// print the company in the bill-to box and a separate `Attn : Lim Xiao Shan` contact line under
// it. Azure's typed `CustomerName` came back as **the person** on BOTH — so
// `invoice.customer_name` read "Lim Xiao Shan" and both drafts sit held `counterparty_unresolved`.
//
// The defect is not a mis-ranked lexicon: BEFORE this module, Clara had NO deterministic
// customer-identity reader at all. `invoice.customer_name` was a byte-for-byte pass-through of
// Azure's typed field, so an ML model's pick of which line in the bill-to box is "the customer"
// went to the books unchallenged. This module supplies the missing second reader: it reads the
// ADDRESSEE PARTY off the layout, label-anchored and geometry-bound, and reads the `Attn` person
// separately as `invoice.contact_person` — a contact is not a counterparty.
//
// THE HAZARD THIS MODULE IS SHAPED AROUND is the mirror of X6's: emitting the WRONG PARTY as the
// customer. On a sales invoice that births a counterparty on real client books (birth happens at
// human approval — `_resolve_counterparty` proposes, the approver creates), and every subsequent
// receipt, statement and ageing line inherits the error. A MISSING customer_name merely returns
// the lane to `customer_name_missing`, where a human already has to look. So every ambiguity
// resolves to REFUSE, and refusing means Azure's typed value stands exactly as before.
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
// PARTY CANDIDACY REQUIRES A POSITIVE REGISTERED-ENTITY SIGNAL — the suffix family and both
// asymmetric predicates live in `invoice-entity-lexicon.mjs`, which carries the full rationale.
// No suffix ⇒ no candidacy ⇒ no override, no contest, no disagreement-withdraw: abstain, and
// Azure's typed value stands. The gate was a BLOCKLIST and both scan paths took the FIRST string
// it admitted, so every round found a new instance of ONE class and every scan widening reopened
// it. The override branch is the only branch that can write a WRONG party, so it demands
// evidence. ONE LEXICON, TWO POLARITIES: the family that ADMITS a party REFUSES a contact.
// A NON-CANDIDATE IS A SKIP, NOT A STOP, so a caption above the party cannot hide it — no
// prefer-last heuristic needed. And (round 4) A SUFFIX PROVES A NAME, NOT THE ADDRESSEE: the
// base must be a name, not a phrase mentioning one (`NON_ADDRESSEE_MARKERS`, enforced in
// `looksLikePartyName` so BOTH polarities inherit it). Residual (5) below is what remains.
//
// THE SURFACE CLAIM, precisely: thirteen refusal predicates now sit BEHIND the two positive walls
// (name shape, entity signal). Only `NON_ADDRESSEE_MARKERS` is still load-bearing BY ABSENCE —
// and that IS residual (5) by construction, not an additional gap.
//
// RECEIPT CONSEQUENCE OF THE CLAIM RULE, recorded for whoever mines these: when a
// contact-CLAIMED line AGREES with the typed value the outcome is `absent`, not
// `typed_collapsed`, because no party is read from a claimed line at all. Anyone counting "how
// often did the reader corroborate Azure" UNDERCOUNTS on that shape. The emitted `customer_name`
// is identical either way; only the receipt differs.
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// ─── THE HONESTY NOTE, NOW DISCHARGED ─────────────────────────────────────────────────────────
// This said the thresholds were UNMEASURED and that the live replay would be the measurement. It
// was, and it failed: v10 read the person on both documents. The real page geometry now lives in
// `tests/x7-kongcheng-real.mjs` and the A1 gate asserts against it, so these defaults ARE measured
// against the capture. What has NOT changed: every threshold is an OPT and a wrong one abstains.
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// FOUR DEFENSES, all required, none silently skipped when its input is unavailable:
//
//   (a) UNIQUENESS-OR-NOTHING over the WHOLE document, party read and contact read independently.
//       Two DISTINCT labelled party blocks ⇒ emit no party; identical readings collapse.
//   (b) THE LABEL GATE + THE PARTY-NAME GATE — `invoice-party-grammar.mjs`, which owns every
//       question about spelling. Where X6's top-band defense would sit; no band analogue here.
//   (c) CUSTOMER-BLOCK ATTRIBUTION, the defense that makes an emission EVIDENCED rather than
//       merely label-shaped. A candidate must sit within the gate of the typed `CustomerName`
//       field's OWN bounding region and must not INTERSECT the typed `VendorName` region. THIS IS
//       X6'S INSIGHT RE-APPLIED, and why it works on the F7 defect: Azure's typed CustomerName
//       picked the WRONG LINE, but a wrong line INSIDE the bill-to box — its CONTENT is wrong
//       while its GEOMETRY points at the block. The vendor term was PROXIMITY until the A1 field
//       test falsified it on the real capture; `invoice-block-geometry.mjs` carries the numbers.
//       FAIL CLOSED: no typed CustomerName region ⇒ no attribution evidence ⇒ no emission.
//   (d) RECONCILIATION with the typed emission — `mergeCustomerIdentity` below, which decides
//       who WINS and is the part of this file to read hardest. Its full matrix is written there.
//
// TWO GENERATION SURFACES, ONE WALL SET. Pass 2 generates from a BILL-TO LABEL; on a page that
// prints NONE, `invoice-anchor-sweep.mjs` generates from the typed CustomerName anchor's
// neighbourhood instead. Read its header before touching either pass — it holds the field test
// that forced it, and the difference between a wall that refused and a wall never asked.
//
// THE MISSING BAND, stated rather than papered over. X6's second defense is "a letterhead sits at
// the top of its page by convention". No such convention exists for the buyer block, so an
// unmeasured band would refuse real documents for a reason no one measured. Attribution (c) does
// the band's work here, against evidence Azure actually produced.
//
// ═══ RECORDED RESIDUALS — five, each a DECISION rather than an oversight ═══════════════════════
//  (1) THE THRESHOLDS ARE OPTS — measured (see the discharged note); a wrong one abstains.
//  (2) NO TYPED CustomerName ⇒ NO READ, INHERITED BY THE SWEEP (the anchor is what it sweeps
//      around). No name is ever supplied where Azure typed none; the FINCARE row (acceptance-h1
//      row 10) is that shape and is NOT fixed by F7. Relaxing to "far from the vendor" would be
//      absence-as-evidence, which review law 2 forbids.
//  (3) TWO GENUINELY DIFFERENT REGISTERED BUYERS on one document withdraw the typed row rather
//      than picking one (`contested`). Eyes-open: a safe hold, never a guess.
//  (4) FAIL-CLOSED NARROWINGS: an UNSUFFIXED buyer (an individual, `SIFU LAB`), a dotted `S.B.`,
//      a same-line `To : X`, and any value carrying a COLON all ABSTAIN. Each leaves Azure's
//      typed value standing — zero loss against today.
//  (5) SUFFIXED RELATIONAL PHRASES — THE OPEN ONE, and the only residual that can still write a
//      WRONG party rather than abstain. `NON_ADDRESSEE_MARKERS` enumerates FIFTEEN measured
//      forms; reviewers constructed 23 distinct more, of which 23 of the 38 pinned entries still
//      pass candidacy, 5 producing a wrong `customer_name` end-to-end (`A division of AMATERUS
//      GROUP SDN BHD` is the realistic one). The base is still validated by ABSENCE-of-known-bad
//      — the LAST such surface in X7. The case-discontinuity proposal was implemented, MEASURED
//      and REJECTED; the predicate is RETAINED and re-run in CI (`x7-path-a-rejected.mjs`), so
//      the rejection is a fact, not a claim: 5/5 end-to-end closed, but 4 of 5 TITLE-CASE names
//      lost (`Bank of China (Malaysia) Berhad`) and 0 of the constructed forms closed once
//      ALL-CAPS, which is how Malaysian invoices usually print.
//      REACHABILITY, re-measured after the A1 field test WIDENED it: load-bearing are the
//      bounded scan window, typed == the reader's own Attn person, and NOW the anchor sweep's
//      radius. The closer-to-buyer comparison is no longer among them: it is RETIRED. Harm
//      ceiling is unchanged and is a wrong DRAFT — counterparty birth is at HUMAN APPROVAL and
//      no unattended-post path reaches `customer_name`. FULL VETO-READY RECORD (38 forms, 5
//      scenarios): docs/plan/extraction-slice-x7-field-record.md. OWNER-VETOABLE.

import { pageFrame } from "./invoice-totals-reader.mjs";
import { asciiTrim } from "./invoice-amount-grammar.mjs";
import { containsEntityToken, hasRegisteredEntitySuffix, looksLikePartyName, identityComparisonForm, partyKey, splitAttnLabel, splitBillToLabel } from "./invoice-party-grammar.mjs";
import { customerAttributionFailure, extentOf, scaleAnchor, xOverlap } from "./invoice-block-geometry.mjs";
import { sweepAnchorNeighbourhood } from "./invoice-anchor-sweep.mjs";

export { looksLikePartyName, partyKey, splitAttnLabel, splitBillToLabel, splitLabelled, BILL_TO_LABELS, ATTN_LABELS } from "./invoice-party-grammar.mjs";

// EVERY GEOMETRIC COMPARISON IN EVERY READER MUST BE UNIT-NORMALIZED — Azure reports PDF geometry
// in inches and IMAGE geometry in pixels. The conversion is imported from the X2 reader
// (`pageFrame`) rather than written again here: one definition, one place to fix it. This is the
// THIRD reader to inherit it; the first two each learned it the expensive way.

export const DEFAULT_CUSTOMER_IDENTITY_OPTS = Object.freeze({
  /** Distance allowed between a candidate line and the typed CustomerName region, in inches —
   *  and the ANCHOR SWEEP'S RADIUS. MEASURED on the real capture: the buyer sits 0.736in from the
   *  typed anchor, the seller's letterhead 2.205in, so 1.0 admits the one and refuses the other
   *  with margin both ways. Still an OPT: too small abstains, too large invites a contest. */
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
  no_customer_anchor: 0, customer_anchor_far: 0, in_vendor_block: 0, is_vendor_name: 0,
  split_line_scanned: 0, split_line_exhausted: 0, no_entity_suffix: 0,
  anchor_sweep_ran: 0, anchor_in_range: 0, anchor_label_skipped: 0,
  anchor_rejected_gate: 0, anchor_no_entity_suffix: 0,
  attn_skipped: 0, column_skipped: 0, reserved_skipped: 0, label_boundary: 0,
  attn_matched: 0, attn_ambiguous: 0, attn_rejected_gate: 0, attn_no_value: 0, attn_unattributed: 0,
  contact_emitted: 0,
  typed_collapsed: 0, typed_overridden_attn: 0, typed_disagreement: 0, typed_withdrawn_attn: 0,
  typed_vs_contested: 0, sole_authorship_refused: 0,
  contact_read_inconclusive: false, attn_inconclusive_hold: 0,
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
      ? {
        vendor: scaleAnchor(anchors?.vendor, frame.scale),
        customer: scaleAnchor(anchors?.customer, frame.scale),
        // The seller's own distinguishing words, tokenized HERE so `invoice-block-geometry.mjs`
        // keeps owning POSITION only and never learns how a name is spelled. Refuse-only.
        vendorIdentity: anchors?.vendorName ? identityComparisonForm(anchors.vendorName) : null,
      }
      : null;
    /** Line indices claimed by PASS 1 as a contact VALUE — never available to the party read. */
    const reserved = new Set();

    /** Attribution (defense c), counted under the right head so the receipt names the refusal. */
    const attributed = (box, label, kind, identity = null) => {
      const failure = customerAttributionFailure({ ...box, page: pageNumber, identity }, scaledAnchors, anchorLimit);
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
      //
      // THE CONTACT SCAN LOOKS FOR THE LABEL'S VALUE, NOT FOR A PERSON. It stops at the first
      // NAME-SHAPED line and hands it to the caller, which then judges whether that value is a
      // person. Keeping the entity test out of the scan is what lets the caller RESERVE the line
      // even when it refuses the value — see the claim/judge split in pass 1. Furniture (an
      // address, a caption) is still skipped, so a person printed under an address still reads.
      const isCandidate = (raw) => (looksLikePartyName(raw)
        && (kind === "party" ? hasRegisteredEntitySuffix(raw) : true));
      const limit = Math.min(lines.length - 1, i + Math.max(0, settings.maxLookaheadLines));
      for (let j = i + 1; j <= limit; j++) {
        const box = boxes[j];
        if (box === null) { receipt.no_geometry += 1; note("no_geometry", label, pageNumber, { kind: `${kind}_value` }); return null; }
        if (box.ymin + skewTol < labelBox.ymin) return null;   // above the label: not this block
        if (box.ymin - labelBox.ymax > blockGap) return null;  // the block ended
        if (xOverlap(box, labelBox) <= 0) { receipt.column_skipped += 1; continue; }
        if (reserved.has(j)) { receipt.reserved_skipped += 1; continue; }
        // ANY RECOGNIZED LABEL TERMINATES THE SCAN — a label starts a NEW block, and a claim
        // never crosses into it. Measured: `Attention:` / `Bill To:` / `ACME SDN BHD` — the
        // CONTACT scan walked past `Bill To:`, claimed and reserved ACME, and the party scan
        // then found nothing, so the F7 repair missed the actual buyer on that layout. Stopping
        // at the label lets the contact read end where its block ends and the bill-to block own
        // its own value. Symmetric on purpose: the party scan stops at an `Attn` label too.
        const nextText = String(lines[j]?.content ?? "");
        if (splitAttnLabel(nextText) || splitBillToLabel(nextText)) {
          receipt.label_boundary += 1;
          note("label_boundary", label, pageNumber, { kind: `${kind}_value` });
          return null;
        }
        const raw = asciiTrim(String(lines[j]?.content ?? ""));
        if (!isCandidate(raw)) {
          // Counted under the head that actually refused it — a receipt that lumps "this is not
          // a name" together with "this is a name but carries no entity signal" cannot tell a
          // reader which wall did the work.
          if (kind !== "party") {
            receipt.attn_rejected_gate += 1;
            if (containsEntityToken(raw)) receipt.contact_read_inconclusive = true;
          }
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

      // ══ CLAIM, THEN JUDGE — AND RESERVE ON THE CLAIM ═════════════════════════════════════
      // A contact LABEL positively claims a LINE: its own, or the first name-shaped line in its
      // block. That claim is GEOMETRIC EVIDENCE about what the line IS, and it stands whatever
      // the value's shape turns out to be. Reservation used to happen only after the value was
      // ACCEPTED, so a refused company (`Attention:` → `ACME SDN BHD`) fell back into the party
      // scan and overrode `customer_name` — the refusal had judged the value's SHAPE, not the
      // label's CLAIM, and those are different facts.
      //
      // THE INVARIANT IS ABOUT LINES, NOT STRINGS. A contact-CLAIMED LINE can never supply the
      // override or drive a withdraw. The SAME STRING on an UNCLAIMED line still qualifies on its
      // own merits — `Bill To:` / `ACME SDN BHD` / `Attention: ACME SDN BHD` / `Attn : <person>`
      // must still override with ACME, because the bare line 2 earned it and the refused line 3
      // contributed nothing. Spelling is not identity, in the pleasant direction.
      let claim = null;
      if (attn.remainder) {
        claim = { raw: attn.remainder, box: boxes[i], lineIndex: i };
      } else {
        claim = scanBelow(i, boxes[i], "attn", attn.label);
        // Counted apart from `attn_rejected_gate`: that head means "a line was examined and
        // refused as a contact VALUE"; this one means "a bare Attn label found no value at all".
        if (!claim) { receipt.attn_no_value += 1; note("attn_no_value", attn.label, pageNumber, { kind: "attn" }); continue; }
      }
      reserved.add(claim.lineIndex);

      // NOW judge the value, with the same BROAD predicate the split seam uses — this seam once
      // shipped with the strict one, so `Attention: ACME SDN BHD (123456-X)` / `P.L.T.` / bare
      // `SDN BHD` were refused there and persisted as people here.
      if (!looksLikePartyName(claim.raw) || containsEntityToken(claim.raw)) {
        if (containsEntityToken(claim.raw)) receipt.contact_read_inconclusive = true;
        receipt.attn_rejected_gate += 1;
        note("attn_rejected_gate", attn.label, pageNumber, { kind: "attn" });
        continue;
      }
      const value = claim;
      if (!attributed(value.box, attn.label, "attn")) continue;
      const src = lines[value.lineIndex];
      contacts.push({
        value_raw: value.raw, key: partyKey(value.raw), page: pageNumber,
        polygon: (src.polygon || []).map(Number),
        confidence: src?.confidence == null ? null : Number(src.confidence),
      });
      note("attn_accepted", attn.label, pageNumber, { kind: "attn", key: partyKey(value.raw) });
    }

    // ══ PASS 2 — THE PARTY READ, from a BILL-TO LABEL.
    const partiesBeforePage = parties.length;
    let sawBillToLabel = false;
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
      sawBillToLabel = true;
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

      if (!attributed(value.box, hit.label, "party", identityComparisonForm(value.raw))) continue;
      const source = lines[value.lineIndex];
      parties.push({
        value_raw: value.raw, key: partyKey(value.raw), page: pageNumber,
        polygon: (source.polygon || []).map(Number),
        confidence: source?.confidence == null ? null : Number(source.confidence),
      });
      note("accepted", hit.label, pageNumber, { kind: "party", key: partyKey(value.raw) });
    }

    // ══ PASS 2b — THE ANCHOR SWEEP, only on a page that PRINTS NO BILL-TO LABEL AT ALL.
    // Not "found no party" — found no LABEL. The distinction is the wall: where a document names
    // its bill-to box, that naming decides, and a candidate the label path REFUSED must not get a
    // second hearing on proximity. (The battery's `NEARER THE SELLER` page is exactly that shape.)
    // A label-less page is the real capture's own condition, so this is the narrowest broadening
    // that reaches it. `invoice-anchor-sweep.mjs` holds the field test and the fallback argument.
    if (!sawBillToLabel && parties.length === partiesBeforePage) {
      parties.push(...sweepAnchorNeighbourhood({
        lines, boxes, pageNumber, reserved, scaledAnchors, anchorLimit, receipt, note, attributed,
      }));
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

// The RECONCILER lives next door — see its header for the seam. Re-exported so the adapter
// and every test keep importing `mergeCustomerIdentity` from this module.
export { mergeCustomerIdentity } from "./invoice-customer-reconcile.mjs";
