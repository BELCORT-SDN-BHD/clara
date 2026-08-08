// The BYTE-LEVEL PARTY GRAMMAR for the X7 customer-identity reader — what counts as a bill-to
// label, what counts as an `Attn` contact label, and what may be handed to the DB as an identity
// at all. Split out of `invoice-customer-identity.mjs` on the same seam X2 uses between
// `invoice-amount-grammar.mjs` (what a money token IS) and `invoice-totals-reader.mjs` (which
// token belongs to which label, by geometry): this file knows nothing about pages, polygons or
// anchors, and the reader knows nothing about spelling.
//
// Full rationale for the reader as a whole — the F7 defect, the four defenses, the honesty note
// about unmeasured thresholds — lives in `invoice-customer-identity.mjs`'s header.

import { asciiTrim, DASH_CHARS } from "./invoice-amount-grammar.mjs";

/**
 * THE CLOSED BILL-TO LABEL VOCABULARY, EN + BM. Matching is exact-prefix on a form where every
 * run of non-alphanumerics collapses to one space, lowercased — so `Bill To:`, `BILL  TO -` and
 * `bill.to` all reach the same string — AND the match must end on a WORD BOUNDARY (see
 * `splitLabelled`).
 *
 * THE BOUNDARY IS LOAD-BEARING, not tidiness. Without it the entry `to` matches `TOTAL PAYABLE`
 * (folded: `total payable`, which starts with `to`) and the reader emits `TAL PAYABLE` as the
 * customer of record. That is not hypothetical — it is the first thing that happens if the
 * boundary check is removed, and it has its own cell in the battery.
 *
 * VENDOR-SIDE LABELS ARE DELIBERATELY ABSENT and no entry here is a prefix of one: `sold to` is
 * the buyer, `sold by` is the seller, and the boundary rule keeps them distinct rather than
 * letting one shadow the other. `From`, `Supplier`, `Seller`, `Vendor`, `Remit To` and `Pay To`
 * appear nowhere, so a seller block can never open a buyer candidate on the label alone — and
 * the reader's attribution defense refuses it a second time even if a layout invents a spelling.
 *
 * `to` IS THE WEAKEST ENTRY and is kept only because compact Malaysian invoices genuinely print
 * a bare `To:` above the buyer. It is held by three independent walls: the word boundary, the
 * party-name gate below, and attribution to the typed CustomerName region — a stray `To ...` in
 * a totals or terms block is nowhere near that region.
 */
export const BILL_TO_LABELS = Object.freeze([
  "bill to",
  "billed to",
  "bill to name",
  "invoice to",
  "invoiced to",
  "sold to",
  "charge to",
  "customer",
  "customer name",
  "client",
  "client name",
  "buyer",
  "buyer name",
  "to",
  // Bahasa Malaysia.
  "kepada",
  "invois kepada",
  "pelanggan",
  "nama pelanggan",
]);

/**
 * THE CLOSED ATTN VOCABULARY. Its value is a CONTACT PERSON and is emitted as
 * `invoice.contact_person` — never, under any circumstance, as `invoice.customer_name`.
 *
 * `M/s` and `Messrs` are NOT here and are NOT folded into `BILL_TO_LABELS` either: they are
 * matched by `MS_PREFIX` below, as literal punctuation, because folding `M/s` to `m s` would
 * ALSO match a company genuinely named `M S DEVELOPMENT SDN BHD` and hand back `DEVELOPMENT SDN
 * BHD` as the party. A wrong party is the one outcome this reader exists to prevent, so that
 * form is matched precisely or not at all.
 */
export const ATTN_LABELS = Object.freeze([
  "attn",
  "attn to",
  "attention",
  "attention to",
  "for the attention of",
  "kind attention",
  // Bahasa Malaysia.
  "untuk perhatian",
  "perhatian",
]);

/** `M/s ACME SDN BHD` / `M.S. ACME` / `Messrs ACME` — a bill-to label written as punctuation.
 *  Matched literally (see ATTN_LABELS' note on why this is not folded). */
const MS_PREFIX = /^\s*(?:m\s*[/.]\s*s|mess(?:rs|ers))\b[\s.:,-]*/i;

/**
 * Tokens that, when they OPEN a same-line remainder, mean the label has not ended — the X6
 * `label_continuation` guard, re-aimed. `Customer Service: call 03-...` must not read as a
 * customer named "Service"; `Bill To Address:` is an address header, not a party.
 *
 * A CONTINUATION REFUSES THE LINE OUTRIGHT — it does not fall through to the reader's split-line
 * scan. That is the fail-closed choice and it matches X6: if the label did not end where this
 * grammar thought it did, the reader does not know where the block begins either.
 */
const CONTINUATION_TOKENS = Object.freeze(new Set([
  "address", "addr", "alamat",
  "no", "number", "num", "id", "code", "kod",
  "ref", "reference", "rujukan",
  "po", "order", "date", "tarikh",
  "service", "care", "support",
  "contact", "person", "tel", "telephone", "fax", "faks", "email", "e",
  "acc", "account", "akaun",
  "type", "terms", "term", "copy",
]));

/** Collapse every run of non-alphanumerics to one space; lowercase. Index-free, match-only.
 *  Identical in rule to X6's, duplicated rather than imported because the two grammars must be
 *  free to diverge on what counts as a label without silently moving each other. */
const foldForMatch = (s) => String(s ?? "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();

/** Leading separators between a label and its value: `. `, ` : `, ` - `, `# `. */
const LEADING_SEPARATORS = new RegExp(`^[ \t.:#${DASH_CHARS}]+`);

/**
 * THE PARTY-NAME / PERSON-NAME GATE — what may be handed to the DB as an identity at all.
 *
 * Deliberately a REFUSAL gate rather than a recogniser: it enumerates what a party name is NOT
 * (an address, a postcode, a phone/fax/email line, a URL, an amount, a date, a stub) and admits
 * everything else that carries substantive letters. A recogniser would have to know that
 * `SIFU LAB` and `Lim Xiao Shan` are both legitimate identities on this client's real books
 * (wave-7a-acceptance-h1.md rows 13 and 1) while `SDN BHD` alone is not, and no suffix rule
 * survives that.
 *
 * The ADDRESS terms are the load-bearing half: the split-line scan's whole risk is promoting the
 * first line of a street address to `customer_name`. Malaysian address lines almost always carry
 * a street noun, a postcode, or a numbered unit — all three are refused. State and city names
 * are deliberately NOT refused: `SELANGOR ENTERPRISE SDN BHD` is a company, not an address, and
 * refusing it would cost a real identity to catch nothing a postcode does not already catch.
 */
const ADDRESS_TERMS = /\b(?:jalan|jln|lorong|lrg|taman|tmn|persiaran|psn|lebuh|lebuhraya|kampung|kampong|kg|bandar|seksyen|section|wisma|menara|plaza|bangunan|plot)\b/i;
const NUMBERED_UNIT = /\b(?:no|lot|unit|blok|block|tingkat|level|floor|suite|tkt)\b\.?\s*[:.]?\s*\d/i;
const POSTCODE = /\b\d{5}\b/;
const CONTACT_LINE = /\b(?:tel|telephone|telefon|fax|faks|email|e-?mail|mobile|whatsapp)\b/i;

/**
 * FUNCTION WORDS THAT NO PARTY NAME OPENS WITH — the guard that earns the weakest vocabulary
 * entry, `to`, its place.
 *
 * The hazard is a bare `To` matching a SENTENCE rather than an addressee: `TO BE PAID BY 30
 * DAYS` folds to a legal label hit with the remainder `BE PAID BY 30 DAYS`, which carries
 * letters, no address term, no postcode and no amount — so every other term in this gate admits
 * it. If that phrase is then the document's ONLY candidate, it can reach `customer_name` through
 * the empty-typed or Attn-override branches. A refusal here is free (the reader abstains and
 * Azure's typed value stands, i.e. today's behaviour); an admission is a wrong party.
 *
 * `the` is DELIBERATELY ABSENT: `THE ROOF SDN BHD` is a real Malaysian trading-name shape, and
 * refusing it would cost a genuine identity to catch a phrase the rest of this list already
 * covers. Titles (`Mr`, `Ms`, `Puan`, `Encik`) are absent too — this gate is shared with the
 * `Attn` person read, and a contact line legitimately opens with one.
 */
const STOPWORD_OPENERS = Object.freeze(new Set([
  "be", "been", "being", "is", "are", "was", "were",
  "whom", "whose", "which", "who",
  "all", "any", "each", "every", "both",
  "our", "your", "their", "its", "his", "her", "my",
  "this", "that", "these", "those",
  "and", "or", "if", "as", "per", "with", "without", "within",
  "from", "at", "on", "in", "by", "of", "for", "into", "onto",
  "above", "below", "under", "over", "before", "after",
  "please", "kindly", "note", "notes", "attn", "attention",
  // Bahasa Malaysia function words.
  "dan", "atau", "kepada", "dari", "daripada", "untuk", "dengan", "sila",
]));

export function looksLikePartyName(s) {
  const v = asciiTrim(String(s ?? ""));
  if (v.length < 3 || v.length > 120) return false;
  // Substantive ALPHABETIC content — an identity is a name, not a number.
  if (v.replace(/[^A-Za-z]/g, "").length < 3) return false;
  if (/^\(?\s*(?:rm|myr|usd|sgd)?\s*[\d,]+\.\d{2}\s*\)?$/i.test(v)) return false; // currency amount
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;                                // ISO date
  if (/@/.test(v)) return false;                                                   // email
  if (/(?:https?:\/\/|www\.)/i.test(v)) return false;                              // url
  if (CONTACT_LINE.test(v)) return false;                                          // tel/fax/email line
  if (POSTCODE.test(v)) return false;                                              // Malaysian postcode
  if (NUMBERED_UNIT.test(v)) return false;                                         // No. 12 / Lot 3 / Level 5
  if (ADDRESS_TERMS.test(v)) return false;                                         // street/building noun
  if (/^[\d\s,.\-/]+$/.test(v)) return false;                                      // pure punctuation/digits
  if (STOPWORD_OPENERS.has(foldForMatch(v.split(/\s+/)[0] ?? ""))) return false;    // a sentence, not a name
  return true;
}

/**
 * The identity key two readings are compared on: strip every non-alphanumeric, lowercase. The
 * SAME rule the DB's registration key uses (0009:359-360), applied to names — so
 * `KONG CHENG RESTAURANTS SDN. BHD.` and `Kong Cheng Restaurants Sdn Bhd` are ONE party rather
 * than a contest. Used ONLY to decide whether two readings are the same party; never emitted.
 *
 * Legal suffixes are DELIBERATELY NOT stripped: `ACME SDN BHD` and `ACME` may well be two
 * different registered entities, and collapsing them would be this code inventing an identity
 * rather than reading one.
 */
export const partyKey = (s) => String(s ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

/**
 * Split a line into {label, remainder, continuation} when it opens with a vocabulary label on a
 * WORD BOUNDARY, else null. Longest matching prefix wins.
 *
 * The remainder is cut from the ORIGINAL text, not the folded one, so `value_raw` stays verbatim.
 * The cut point is found by consuming characters until as many ALPHANUMERICS have passed as the
 * label contains — exact regardless of how the document punctuated or spaced the label (the X6
 * technique, reused unchanged).
 */
export function splitLabelled(text, vocabulary) {
  const folded = foldForMatch(text);
  if (!folded) return null;
  let label = null;
  for (const candidate of vocabulary) {
    if (!folded.startsWith(candidate)) continue;
    // THE WORD BOUNDARY. `to` must not match `total`; `attn` must not match `attnxyz`. In the
    // folded form every separator is a single space, so the character after the label must be
    // that space (or the string must end there — a bare label on its own line).
    if (folded.length > candidate.length && /[a-z0-9]/.test(folded[candidate.length])) continue;
    if (label && label.length >= candidate.length) continue;
    label = candidate;
  }
  if (!label) return null;
  const want = label.replace(/[^a-z0-9]/g, "").length;
  const original = String(text ?? "");
  let seen = 0;
  let cut = 0;
  for (let i = 0; i < original.length && seen < want; i++) {
    if (/[a-zA-Z0-9]/.test(original[i])) seen += 1;
    cut = i + 1;
  }
  if (seen < want) return null;
  const remainder = asciiTrim(asciiTrim(original.slice(cut)).replace(LEADING_SEPARATORS, ""));
  if (remainder.startsWith("(")) return { label, remainder, continuation: true };
  const firstToken = foldForMatch(remainder.split(/\s+/)[0] ?? "");
  if (firstToken && CONTINUATION_TOKENS.has(firstToken)) return { label, remainder, continuation: true };
  return { label, remainder, continuation: false };
}

/** A bill-to label hit, including the `M/s` punctuation form. */
export function splitBillToLabel(text) {
  const raw = String(text ?? "");
  const ms = MS_PREFIX.exec(raw);
  if (ms) return { label: "m/s", remainder: asciiTrim(raw.slice(ms[0].length)), continuation: false };
  return splitLabelled(raw, BILL_TO_LABELS);
}

/** An `Attn` label hit. Its value is a CONTACT PERSON, never a party. */
export function splitAttnLabel(text) {
  return splitLabelled(String(text ?? ""), ATTN_LABELS);
}
