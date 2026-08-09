// THE VENDOR-IDENTITY COMPARISON FOLD — the machinery that answers ONE question, in one
// direction: does this buyer candidate say anything the seller's own typed name does not?
//
// Split out of `invoice-entity-lexicon.mjs` (the repo's 500-line limit) on a seam this arc drew
// for itself. That file is the SPELLING lexicon — how a name folds, what a legal suffix is, what
// character class a name may use — and it serves ADMISSION, where the law is that folding
// NARROWS. This file serves REFUSAL, where the law is the opposite: folding MERGES, deliberately
// coarser, because the one outcome that cannot be tolerated is admitting the seller as the buyer.
// Two opposite folding disciplines in one file is what made them easy to confuse.
//
// NOTHING HERE MAY EVER ADMIT. Every function returns refuse or no-opinion; a false match costs
// a visible hold on `is_vendor_name`, never a wrong party. The five named safe-holds that the
// coarseness buys are enumerated on `candidateIsVendorSubset` below.

import { foldUnicode, splitEntitySuffix } from "./invoice-entity-lexicon.mjs";
/**
 * FRAGMENTED GLYPHS REJOIN — a maximal RUN OF TWO OR MORE single-glyph tokens becomes one token.
 *
 * `[a, c, m, e]` → `[acme]` · `[鑫, 旺]` → `[鑫旺]` · `[a, b, trading]` → `[ab, trading]`.
 *
 * THE RUN MUST BE TWO OR MORE, and that bound is load-bearing rather than tidy: a run of ONE must
 * NOT absorb the multi-glyph token beside it, or the two live calibration points invert. Typed
 * `A\nACME` folds to `[a, acme]` and typed `M\nROME\nSECRETARY` to `[m, rome, secretary]`; join
 * either leading fragment forward and `{acme}` / `{rome, secretary}` stop being subsets, which is
 * exactly the wrong-party admission the subset rule exists to refuse.
 *
 * WHY NOT REUSE `containsEntityToken`'s REGEX, which does the same job for `ACME P.L.T.`: it is
 * built on `\b`, and JavaScript's `\b` is defined by ASCII `\w`. MEASURED — that regex folds
 * `a c m e` to `acme` correctly and leaves `鑫 旺` UNJOINED, so a line-split Chinese seller name
 * walked straight through the subset test (Codex N1, all three surfaces). The run-of-tokens form
 * below is the same idea expressed where Unicode cannot silently opt out; codepoint counting
 * (`Array.from`) keeps it right for astral glyphs too.
 */
function joinGlyphRuns(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length;) {
    let j = i;
    while (j < tokens.length && Array.from(tokens[j]).length === 1) j++;
    if (j - i >= 2) { out.push(tokens.slice(i, j).join("")); i = j; }
    else { out.push(tokens[i]); i++; }
  }
  return out;
}

/**
 * THE COMPARISON FOLD — a name reduced to its distinguishing words, for the vendor-identity
 * REFUSAL and nothing else. `KONG CHENG RESTAURANTS SDN BHD` → {kong, cheng, restaurants}.
 *
 * A string with no suffix folds whole, which is what makes it usable on Azure's typed
 * `VendorName`: the real capture types that field as the LOGO, `M\nROME\nSECRETARY` → {m, rome,
 * secretary}. Suffixes are stripped because they carry NO identifying information — every
 * Malaysian company ends in one, so leaving them in makes any two companies look 40% alike.
 *
 * ─── WHY JOINING LIVES ON THE COMPARISON SIDE ONLY ────────────────────────────────────────────
 * The house rule is ADMISSION NARROWS, COMPARISON MERGES, and this function is the comparison
 * half — so it may merge two spellings that `partyKey` (the ADMISSION/contest key) deliberately
 * keeps apart. That asymmetry is not sloppiness, it is the two failure modes pointing opposite
 * ways:
 *
 *   `partyKey` decides whether two readings CONTEST. A false merge there is WRONG-SILENT — it
 *   suppresses a lawful contest and lets one name through unchallenged. So it must be FINE:
 *   punctuation classes and legal suffixes are preserved (`A/B` ≠ `A-B`, `SDN BHD` ≠ `BERHAD`).
 *
 *   This function decides whether to REFUSE a candidate as the seller. It can only ever refuse,
 *   so a false merge is a visible HOLD on `is_vendor_name`. It must therefore be COARSE: every
 *   spelling a seller's name might arrive in has to land on the same tokens, because the one
 *   outcome that cannot be tolerated is admitting the seller as the buyer.
 *
 * NEVER USE THIS FUNCTION TO DECIDE THAT TWO PARTIES ARE THE SAME PARTY. It answers only "does
 * this candidate say anything the vendor's name does not", and only to say no.
 */
function comparisonTokenList(raw) {
  const hit = splitEntitySuffix(raw);
  const base = hit ? hit.base : foldUnicode(raw);
  return joinGlyphRuns(base.split(" ").filter(Boolean));
}

/**
 * The comparison fold in BOTH the shapes the refusal needs:
 *   `tokens` — the distinguishing words, for the SUBSET term (order-insensitive).
 *   `joined` — those words concatenated IN ORDER, for the SUBSTRING term (boundary-insensitive).
 *
 * `joined` is built from the ORDERED LIST, never from the Set: a Set drops duplicates, so
 * `ROME ROME SECRETARY` would concatenate to `romesecretary` and silently become a different
 * name. The two terms answer different questions and need different structures; deriving both
 * from one token list is what keeps them answering about the SAME reading.
 */
export function identityComparisonForm(raw) {
  const list = comparisonTokenList(raw);
  return { tokens: new Set(list), joined: list.join("") };
}

/** The token half alone — kept as its own export because the divergence cell asserts on it. */
export function identityComparisonTokens(raw) {
  return new Set(comparisonTokenList(raw));
}

/**
 * DOES THIS CANDIDATE SAY ANYTHING THE VENDOR'S OWN NAME DOES NOT? If not, it IS the vendor.
 *
 * ─── WHY EXACT EQUALITY WAS NOT ENOUGH (Codex C2 on PR #220, CONFIRMED and reproduced) ────────
 * The first cut refused a candidate whose `partyKey` EQUALLED the typed VendorName's. Azure does
 * not cooperate: on the real capture it types VendorName as a LOGO FRAGMENT (`M\nROME\nSECRETARY`)
 * while the seller's full legal name prints elsewhere as `ROME SECRETARY SDN BHD`. Those two keys
 * are not equal, so exact matching sees two different companies. Executed on the reviewer's probe:
 * typed `A\nACME` with a nearby `ACME SDN BHD` emitted THE SELLER as `customer_name`.
 *
 * SAY PLAINLY WHY THE REAL FIXTURE WAS SAFE: not because this wall held, but because ROME
 * SECRETARY's full seller line happens to sit 2.205in from the customer anchor, outside the 1.0in
 * radius. That is LUCK, not design — the same document with a slightly taller header would have
 * emitted the seller. This function converts that accident into a rule.
 *
 * ─── THE RULE: SUBSET, NO REMAINDER ───────────────────────────────────────────────────────────
 * REFUSE when every distinguishing token of the candidate already appears in the typed vendor's.
 * The asymmetry is the whole design, and each direction is fixed by a calibration point:
 *
 *   REMAINDER ON THE VENDOR SIDE IS OCR NOISE.  typed {a, acme} vs candidate {acme} → the `a` is
 *     a logo fragment, not a distinction. Candidate ⊆ vendor ⇒ REFUSE.
 *   REMAINDER ON THE CANDIDATE SIDE IS A DISTINCTION.  vendor {rome, secretary} vs candidate
 *     {rome, secretary, penang} — a franchisee or branch is a DIFFERENT legal person that may
 *     genuinely be the buyer. The token `penang` is what says so ⇒ ADMIT.
 *
 * Stated "either direction with no remainder beyond the suffix", the rule COLLAPSES to this one
 * direction: vendor ⊆ candidate with no remainder means the two sets are equal, which candidate ⊆
 * vendor already covers. Recorded rather than implemented twice.
 *
 * REFUSE-ONLY, like every term it sits with (review law 3: a name is a projection of the thing).
 *
 * ─── THE FIVE NAMED SAFE-HOLDS — ENUMERATED FROM THE FINAL FOLD ───────────────────────────────
 * Every one is an OVER-refusal: the reader abstains, `is_vendor_name` COUNTS it, and the lane
 * holds on `customer_name_missing` where a human already looks. They are listed so the coarseness
 * of the comparison fold (see `identityComparisonForm` — comparison MERGES, deliberately coarser
 * than the contest key) is a recorded decision and not a surprise on live.
 *
 * THE LIST IS DERIVED FROM THE RULE AS IT FINALLY STANDS, one entry per distinction the fold
 * destroys, not from whichever version happened to ship first. Each round of this arc added a
 * term and therefore widened the merge set; a declaration written against the previous fold is
 * an out-of-date declaration, which is worse than none because it reads as complete.
 *
 *   (a) STRICT TOKEN SUBSET. Buyer `ACME SDN BHD` billed by seller `ACME HOLDINGS SDN BHD`.
 *       Genuinely two legal persons; the buyer carries no token the seller lacks.
 *   (b) PUNCTUATION CLASS. Buyer `A/B TRADING SDN BHD` vs seller `A-B TRADING SDN BHD`. `partyKey`
 *       keeps these APART — they really are two registered names, and it must, because merging
 *       them there would suppress a lawful contest. Here they merge.
 *   (c) LEGAL SUFFIX. Buyer `ACME SDN BHD` vs seller `ACME BERHAD`. A private limited and a public
 *       limited company are different entities; `partyKey` preserves the distinction for the same
 *       contest reason. The suffix is stripped here, so they merge.
 *   (d) INITIALS vs CONCATENATION — from the glyph-run join. Buyer `A & C & M & E TRADING SDN BHD`
 *       vs seller `ACME TRADING SDN BHD`: both fold to {acme, trading}. The join cannot tell an
 *       initialism apart from the word it spells, because on the page neither can a reader who
 *       only sees the fragments.
 *   (e) WHOLE NAME INSIDE A LONGER NAME — from the concatenated-substring term, and the widest of
 *       the five. Buyer `MASTER SDN BHD` vs seller `MASTERCRAFT SDN BHD`; also measured:
 *       `CARS`/`CARSTAR`, `SUN`/`SUNWAY BERHAD`, `WALL`/`GREATWALL`, and CJK `旺发`/`鑫旺发展`.
 *       Throwing away token boundaries is exactly what makes the term robust to OCR moving them,
 *       and it is also what lets a short buyer name collide with a longer seller's.
 *
 * (b) through (e) are the price of a coarse fold, paid deliberately. The alternative to (e) was
 * BUILT AND MEASURED — see `candidateIsVendorIdentity` — and it admits the seller on glued-noise
 * spellings. A wrong counterparty on real books outranks a hold, every time. Note also that each
 * hold needs a COINCIDENCE (this buyer and this seller on this invoice), while the leak needs only
 * that the seller's own name print near the buyer's block in a fragmented form — which the real
 * capture already does, and is saved from only by 2.205in of distance.
 */
export function candidateIsVendorSubset(candidateTokens, vendorTokens) {
  if (!candidateTokens || !vendorTokens || vendorTokens.size === 0) return false;
  for (const t of candidateTokens) if (!vendorTokens.has(t)) return false;
  return true;
}

/**
 * THE VENDOR-IDENTITY REFUSAL, both terms, one direction each. Refuse when EITHER holds.
 *
 * ─── WHY A SECOND TERM: THE JOIN CLOSED ONE DIRECTION AND OPENED THE OTHER ─────────────────────
 * Token-run joining fixed the UNDER-fragmented seller (`A\nC\nM\nE` vs `ACME`) and created the
 * OVER-joined one. A letter-spaced logo — `R O M E  S E C R E T A R Y`, an entirely ordinary way
 * for a wordmark to be set — folds to the SINGLE token {romesecretary}, and the candidate's
 * {rome, secretary} is not a subset of one token. Executed end-to-end: the SELLER was emitted as
 * `customer_name` with `is_vendor_name=0` — the wall never even counted. Mid-word OCR splits
 * (`ROME SECRE TARY`) and uneven fragments (`RO ME SECRETARY`) leak the same way.
 *
 * The lesson is that TOKENISATION ITSELF IS THE UNRELIABLE PART. Any rule comparing token
 * BOUNDARIES can be defeated by moving them, and OCR moves them in both directions. So the second
 * term throws the boundaries away entirely: concatenate each side's ordered tokens and ask whether
 * the candidate's whole name occurs inside the seller's. Same single direction as the subset term,
 * for the same reason — remainder on the vendor side is noise, remainder on the candidate side is
 * a distinction. THE REVERSE DIRECTION MUST NEVER BE ADDED: it inverts the franchise calibration
 * (`romesecretary` IS inside `romesecretarypenang`), turning a legitimate branch buyer into a
 * refusal. Measured, not assumed.
 *
 * ─── A TIGHTER ALTERNATIVE WAS DERIVED, MEASURED, AND REJECTED ────────────────────────────────
 * Plain containment over-refuses (safe-hold (e)), so a narrower clause was built: refuse only when
 * the candidate's joined form is a SUFFIX of the vendor's. MEASURED OVER THE 33-ROW CORPUS
 * (`tests/x7-vendor-identity-derivation.mjs`, re-run in CI, the predicate kept executable):
 *
 *     rule           leaks   false-holds   declared collateral
 *     shipped          0          0                9
 *     subset only      8          0                4   ← what shipped one commit earlier
 *     suffix only      2          0                5   ← TIGHTER, and it leaks
 *     reverse dir      3          1                4   ← forbidden: inverts the franchise
 *
 * SUFFIX-ONLY IS GENUINELY MORE ACCURATE — 5 collateral holds against 9, because it admits the
 * interior-substring companies this rule refuses. Sum the two failure columns and it looks like
 * the better rule, which is exactly why they are never summed. It is rejected on the LEAK column
 * alone: with noise glued INTO a word rather than split off it (`ROME SECRETARYM`,
 * `XROME SECRETARYY`) it ADMITS THE SELLER. A hold is recoverable by the human already looking at
 * the document; a wrong counterparty on real books is not. Same precedence that killed the
 * case-discontinuity proposal in round 5, and it kills this one.
 */
export function candidateIsVendorIdentity(candidate, vendor) {
  if (!candidate || !vendor) return false;
  if (candidateIsVendorSubset(candidate.tokens, vendor.tokens)) return true;
  return vendor.joined.length > 0 && candidate.joined.length > 0
    && vendor.joined.includes(candidate.joined);
}
