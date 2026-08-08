// THE REGISTERED-ENTITY LEXICON — the one place that knows what a Malaysian registered business
// is CALLED, and the two deliberately asymmetric predicates built from it. Split out of
// `invoice-party-grammar.mjs` (the 500-line limit) on a real seam: that file knows LABELS and
// NAMES, this one knows ENTITIES, and the reader knows judgement.
//
// ══ THE ROUND-3 DESIGN LAW: POSITIVE EVIDENCE, NOT ENUMERATION ══
// A scanned or labelled string may become a PARTY CANDIDATE only if it ENDS in one of these
// suffixes. No suffix ⇒ no candidacy ⇒ no override, no contest, no disagreement-withdraw: the
// reader abstains and Azure's typed value stands, which is exactly today's behaviour.
//
// WHY THE SHAPE OF THE GATE CHANGED, the lesson three review rounds paid for. The party gate was
// a BLOCKLIST, and both scan paths took the FIRST string it admitted. A blocklist can only
// enumerate the past, so every round found a fresh instance of ONE class — a label whose
// remainder is FURNITURE (`Customer's Ref: PO-8891` → `'s Ref: PO-8891`, `Buyer Signature` →
// `Signature`: fifteen in one probe) — and every widening of the scan reopened it. The OVERRIDE
// branch is the only branch that can write a WRONG party onto real client books, so it demands
// POSITIVE evidence that the string names a registered business — review law 2 in grammar form.
//
// THE SET IS THE MALAYSIAN LEGAL-ENTITY SUFFIX FAMILY AND NOTHING ELSE:
//   · SDN BHD (Sendirian Berhad, private limited) + `SDN. BHD.`, `SDN.BHD.`, `S/B`;
//   · BHD / BERHAD (public limited);  · PLT (Perkongsian Liabiliti Terhad) and LLP.
// DELIBERATELY EXCLUDED: `ENTERPRISE`, `TRADING`, `RESOURCES`, `HOLDINGS`, `SERVICES` — those are
// conventional ROB trade-name words, not entity suffixes, and admitting them reopens the very
// class this gate closes (`TRADING TERMS` is a caption). Also excluded: `有限公司` and other
// non-romanized renderings — an SSM-registered name is romanized.
//
// THE HONEST NARROWING: an UNSUFFIXED buyer — an individual, a sole proprietor, an unregistered
// trade name (`SIFU LAB` on this client's own books) — can never override a typed name. It
// abstains, typed stands, and that is ZERO loss against today. The measured F7 defect still
// fixes: `KONG CHENG RESTAURANTS SDN BHD` carries the signal.

/** The fold for VALUES — Unicode letters and numbers survive. `鑫旺 SDN BHD` must fold to
 *  `鑫旺 sdn bhd`, not to `sdn bhd`; an ASCII fold silently deletes the only part of that name
 *  that identifies the party. */
export const foldUnicode = (s) => String(s ?? "").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();

/**
 * EVERY COLON A DOCUMENT CAN PRINT. A colon means a CAPTION, and a caption is never an identity —
 * that rule is the root closer for the possessive/caption class, so the character class it
 * matches has to be complete or the class reopens one glyph at a time.
 *
 * ROOT-FIRST, RESIDUE ENUMERATED — the method this reader now uses for every character class.
 * NFKC folds the presentation and fullwidth forms: U+FE55 SMALL COLON and U+FF1A FULLWIDTH COLON
 * both normalize to U+003A, so normalizing the value FIRST removes them without enumeration.
 * What NFKC does NOT fold is enumerated with its codepoint and reason:
 *   · U+003A COLON                    — ASCII, the base case
 *   · U+2236 RATIO                    — a distinct math character, no compatibility mapping; OCR
 *                                       emits it for a colon on some engines
 *   · U+A789 MODIFIER LETTER COLON    — a letter-class character, so it also survives \p{L} folds
 *   · U+02F8 MODIFIER LETTER RAISED COLON — same family as U+A789, and INCLUDED ON MEASUREMENT
 *   · U+05C3 HEBREW PUNCTUATION SOF PASUQ, U+0589 ARMENIAN FULL STOP — same shape, no mapping
 *
 * WHY U+02F8 IS IN, against an initial adjudication to leave it out. The stated ground for
 * excluding it was that the continuation guard catches the realistic shape. Measured, that holds
 * for `Customer Ref˸ …` (remainder opens with `Ref`, a continuation token) but NOT for
 * `Bill To˸ ACME SDN BHD` or `Customer˸ ACME SDN BHD` — there the label matches, the glyph is not
 * in `LEADING_SEPARATORS`, and the remainder survives as `˸ ACME SDN BHD`, which was emitted as
 * `customer_name` end-to-end. That is a CORRUPTED party rather than a wrong one, but it would
 * still birth a counterparty under a mangled name, so the class takes it and the value abstains.
 *
 * "COMPLETE" MEANS: complete for the OCR-producible colon glyphs measured so far. It is a
 * closed enumeration over an open world, which is exactly why the rule is fail-closed — an
 * unlisted glyph makes the reader ABSTAIN on that value, never assert a party from it.
 */
export const COLON_CLASS = /[:∶꞉˸׃։]/u;

/** Does this value carry a colon in ANY of its printed forms? NFKC first, then the residue. */
export const hasColon = (s) => COLON_CLASS.test(String(s ?? "").normalize("NFKC"));

const ENTITY_SUFFIXES = Object.freeze([
  ["sdnbhd", "sendirian berhad"],
  ["sdnbhd", "sdn berhad"],
  ["sdnbhd", "sdn bhd"],
  ["sdnbhd", "sdnbhd"],
  ["berhad", "berhad"],
  ["berhad", "bhd"],
  ["plt", "perkongsian liabiliti terhad"],
  ["plt", "plt"],
  ["llp", "llp"],
]);

/**
 * `S/B` IS MATCHED ON ITS PUNCTUATED FORM ONLY — the M/s argument, carried across.
 *
 * The folded variant `s b` was in the table above and it SWALLOWED A PERSON'S INITIALS:
 * `Attn : Lim S B` folds to `lim s b`, read as an entity, so the CONTACT polarity refused the
 * person, `attn_key` was never set, the override could not fire, and the reconciler removed a
 * correct customer name — on exactly the F7 shape this reader exists to fix. `S/B` is PRINTED
 * with a slash; the spaced form is an artefact of folding, not a spelling anyone uses.
 *
 * SLASH ONLY, and the dotted `S.B.` is deliberately NOT accepted. `KONG CHENG RESTAURANTS S.B.`
 * and `Tan S.B.` are the same shape — a two-letter abbreviation after a name — and no rule
 * separates them without counting tokens, which would refuse the ordinary `ACME S/B`. The
 * tension is real and resolved fail-closed: a company writing `S.B.` with dots ABSTAINS (typed
 * stands, zero loss), while `Tan S.B.` stays readable as a contact person.
 */
const SB_PUNCTUATED = /\s+S\s*\/\s*B\.?\s*$/i;
/** The same abbreviation ANYWHERE in the string — used only by the contact refusal below. */
const SB_ANYWHERE = /\bS\s*\/\s*B\b/i;

/** Longest variant first, so `sdn bhd` is matched as the SDN BHD family and never decomposed
 *  into a bare `bhd` — which would canonicalize the same company two different ways. */
const ENTITY_SUFFIXES_BY_LENGTH = Object.freeze([...ENTITY_SUFFIXES].sort((a, b) => b[1].length - a[1].length));

/** Every word that only ever appears in a registered-entity name. Used by the CONTACT refusal,
 *  which is deliberately BROADER than party candidacy — see `containsEntityToken`. */
const ENTITY_TOKENS = Object.freeze(new Set([
  "sdn", "bhd", "berhad", "sendirian", "plt", "llp", "perkongsian", "liabiliti", "terhad",
]));

/**
 * Split a folded value into {base, canonical} when it ENDS in a registered-entity suffix, else
 * null. The canonical form is what makes `KONG CHENG…SDN BHD` and `KONG CHENG…S/B` — one company,
 * two lawful Malaysian spellings — a single identity instead of a contest that withdrew a
 * correct typed name.
 */
export function splitEntitySuffix(raw) {
  const original = String(raw ?? "");
  // The punctuated S/B is read off the ORIGINAL, before folding destroys the slash. `baseRaw` is
  // the ORIGINAL text of the base — the punctuation signature below needs it, and for this path
  // it must EXCLUDE the suffix, whose own slash would otherwise sign every `S/B` name.
  const sb = SB_PUNCTUATED.exec(original);
  if (sb) {
    const baseRaw = original.slice(0, sb.index);
    return { base: foldUnicode(baseRaw), baseRaw, canonical: "sdnbhd" };
  }
  const folded = foldUnicode(original);
  for (const [canonical, variant] of ENTITY_SUFFIXES_BY_LENGTH) {
    if (folded === variant) return { base: "", baseRaw: "", canonical };
    if (folded.endsWith(` ${variant}`)) {
      // Every non-S/B suffix form is letters and spaces only, so the whole original is a safe
      // signature source — no slash or hyphen can come from the suffix region.
      return { base: folded.slice(0, folded.length - variant.length - 1).trim(), baseRaw: original, canonical };
    }
  }
  return null;
}

/**
 * PUNCTUATION CLASSES FOLD DISTINCTLY. `A/B TRADING SDN BHD` and `A-B TRADING SDN BHD` are two
 * different registered names; both folded to `a b`, keyed the same, and the reader reported
 * `matched` — SUPPRESSING a lawful contest. A silent merge of two identities is strictly worse
 * than a hold, so the slash class and the hyphen class each leave their own mark on the key.
 * They still differ from `AB` (no punctuation at all), and ordinary noise punctuation — commas,
 * dots, brackets — still folds to a boundary and stays harmless.
 */
const punctSignature = (s) => {
  const t = String(s ?? "").normalize("NFKC");
  return (/[/／]/.test(t) ? "s" : "") + (/[-‐‑‒–—―−]/.test(t) ? "h" : "");
};

/**
 * PARTY CANDIDACY — STRICT: the string must END in a suffix, with a name in front of it.
 *
 * A bare suffix (`SDN BHD` alone, an OCR fragment) is the ENDING of an identity, not one.
 */
export function hasRegisteredEntitySuffix(s) {
  const hit = splitEntitySuffix(s);
  return hit !== null && hit.base.length > 0;
}

/**
 * CONTACT REFUSAL — BROAD: does an entity token appear ANYWHERE?
 *
 * TWO DIFFERENT PREDICATES FROM ONE LEXICON, DELIBERATELY ASYMMETRIC, BOTH FAIL-CLOSED. The
 * contact polarity used to be `!hasRegisteredEntitySuffix`, i.e. the NEGATION of a candidacy
 * test — so every company-shaped string that failed candidacy for some OTHER reason landed in
 * the contact bucket. Executed: `SDN BHD`, `ACME SDN BHD (123456-X)`, `ACME SDN BHD, Kuala
 * Lumpur` and `ACME P.L.T.` were all emitted as `contact_person`, persisting companies as people.
 * That is the house's "spelling is not identity" law biting my own predicate: `not a valid party`
 * is not the same proposition as `is a person`.
 *
 * So candidacy stays STRICT (endsWith — a party must look like a party) while refusal is BROAD
 * (contains — anything smelling of an entity is not a person). Both directions fail closed.
 *
 * SINGLE-LETTER RUNS ARE JOINED so `ACME P.L.T.` folds to `acme p l t` and is seen as `plt`. The
 * join deliberately does NOT admit `s b`: `Lim S B` and `Tan S.B.` are people, and only the
 * SLASHED `S/B` counts as the abbreviation (see SB_PUNCTUATED's note).
 */
export function containsEntityToken(s) {
  if (SB_ANYWHERE.test(String(s ?? ""))) return true;
  const folded = foldUnicode(s);
  const joined = folded.replace(/(?:\b\p{L}\s+)+\p{L}\b/gu, (m) => m.replace(/\s+/g, ""));
  for (const token of [...folded.split(" "), ...joined.split(" ")]) {
    if (ENTITY_TOKENS.has(token)) return true;
  }
  return false;
}

/**
 * The identity key two readings are compared on.
 *
 * Legal suffixes are NEVER STRIPPED (`ACME SDN BHD` ≠ `ACME` — plausibly two entities), but
 * EQUIVALENT SPELLINGS OF THE SAME SUFFIX ARE CANONICALIZED: `KONG CHENG…SDN BHD` and
 * `KONG CHENG…S/B` are one company written two lawful ways, and keying them apart made the
 * reader declare a CONTEST and withdraw a correct typed name.
 *
 * PUNCTUATION IN THE BASE FOLDS TO A SPACE, NEVER TO NOTHING. Collapsing it away made `A-B SDN
 * BHD` and `AB SDN BHD` one key, so a document naming two different companies read as `matched`
 * and SUPPRESSED a lawful contest — a wrong-silent outcome, which loses to a safe hold. Folding
 * to a space keeps the boundary (`a b` ≠ `ab`) while leaving noise commas harmless
 * (`KONG, CHENG` ≡ `KONG CHENG`).
 *
 * TWO GENUINELY DIFFERENT-KEYED ENTITIES STILL CONTEST — that residual is held EYES-OPEN.
 */
export const partyKey = (s) => {
  const hit = splitEntitySuffix(s);
  const sig = punctSignature(hit ? hit.baseRaw : s);
  const body = hit ? `${hit.base} ${hit.canonical}`.trim() : foldUnicode(s);
  return sig ? `${body}#${sig}` : body;
};
