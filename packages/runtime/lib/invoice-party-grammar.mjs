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
 * `to` IS THE WEAKEST ENTRY and is **BARE-LABEL ONLY** — see `BARE_ONLY_LABELS` below. It is
 * kept because compact Malaysian invoices genuinely print a bare `To:` above the buyer, and it
 * is restricted because Malaysian invoices ALSO print their line items in the infinitive.
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
 * LABELS THAT ONLY COUNT WHEN THEY STAND ALONE ON THEIR LINE. A hit carrying ANY remainder is
 * not a label hit at all — it is some other kind of line, and this grammar says nothing about it.
 *
 * WHY `to` IS HERE, and it is the most expensive lesson in this module. **Malaysian invoices
 * print their line items in the infinitive**: `To supply and install air-conditioning system`,
 * `To Secretarial fee for the year 2025`, `To professional fee for incorporation of company`,
 * `To render...`, `To carry out annual audit`. Every one of those folds to a legal `to` label
 * hit whose remainder opens with a CONTENT word, so the stop-word opener guard never fires and
 * the line item becomes a live party candidate. Executed against the shipped reader, all four
 * downstream branches then misbehave:
 *   (a) `attn_overridden` births `"supply and install air-conditioning system"` as
 *       `customer_name` — STRICTLY WORSE than the held-at-`counterparty_unresolved` state F7
 *       exists to fix;
 *   (b) the empty-typed branch emits `"Secretarial fee for the year 2025"` as sole authority;
 *   (c) on the 19-of-22 shape where Azure typed the buyer CORRECTLY, a line item as the only
 *       candidate drives `typed_disagreement` and DESTROYS a correct name — a clean invoice
 *       falls to `customer_name_missing`;
 *   (d) KONG CHENG plus one line item reads `ambiguous`, so the fix silently fails on its own
 *       target document.
 *
 * The header's own stated use case for `to` is the SPLIT-LINE form — a bare `To:` sitting above
 * the party — and that is exactly the bare-label shape. Restricting the entry to it keeps the
 * coverage the entry was added for and removes the entire line-item class in one rule. The
 * stop-word opener list below stays: it is a second, independent wall for the labels that DO
 * take a same-line remainder, not a replacement for this one.
 *
 * COST, STATED: `To : ACME SDN BHD` on one line no longer reads. That is a coverage loss and it
 * is the safe direction — the reader abstains and Azure's typed value stands, which is exactly
 * the pre-X7 behaviour.
 */
const BARE_ONLY_LABELS = Object.freeze(new Set(["to"]));

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
const ADDRESS_TERMS = /\b(?:jalan|jln|lorong|lrg|taman|tmn|persiaran|psn|lebuh|lebuhraya|kampung|kampong|kg|bandar|seksyen|section|wisma|menara|plaza|bangunan|plot|road|rd|street|avenue|ave|drive|boulevard|blvd|highway|crescent|terrace|close|court|square|garden|gardens)\b/i;
const NUMBERED_UNIT = /\b(?:no|lot|unit|blok|block|tingkat|level|floor|suite|room|tkt)\b\.?\s*[:.]?\s*\d/i;
const POSTCODE = /\b\d{5}\b/;
const CONTACT_LINE = /\b(?:tel|telephone|telefon|fax|faks|email|e-?mail|mobile|whatsapp)\b/i;
/** `12, Main Road` — a house number opening an address line. Comma-only on purpose: `7-Eleven`
 *  and `3M` are company names, and a dash or a bare digit-letter run must keep reading. */
const HOUSE_NUMBER = /^\d+\s*,/;

/**
 * WORDS THAT ARE A COLUMN HEADER OR A FIELD CAPTION, never an identity. A value that folds to
 * EXACTLY one of these is furniture the OCR picked up, not a party. (`Name:` reached
 * `customer_name` in an executed probe — it carries letters, no address term and no postcode, so
 * every other term in this gate admitted it.)
 */
const HEADER_WORDS = Object.freeze(new Set([
  "name", "customer", "client", "buyer", "company", "attn", "attention", "address", "date",
  "invoice", "bill", "total", "subtotal", "description", "particulars", "item", "items",
  "qty", "quantity", "amount", "price", "unit", "no", "ref", "reference", "terms", "remarks",
  "nama", "alamat", "tarikh", "jumlah", "keterangan", "kuantiti", "harga",
]));

/** The ATTN vocabulary with every separator removed — used to refuse a SPACED-OUT contact label
 *  as a party. `A T T N : Lim Xiao Shan` folds to `a t t n lim xiao shan`, which the ordinary
 *  prefix match cannot see, and it then reached `customer_name` in an executed probe. */
const ATTN_DESPACED = Object.freeze(ATTN_LABELS.map((l) => l.replace(/\s+/g, "")));

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
  if (HOUSE_NUMBER.test(v)) return false;                                          // `12, Main Road`
  if (/^[\d\s,.\-/]+$/.test(v)) return false;                                      // pure punctuation/digits
  if (STOPWORD_OPENERS.has(foldForMatch(v.split(/\s+/)[0] ?? ""))) return false;    // a sentence, not a name
  // A caption, not an identity. `Name:` / `Customer` / `Description` are furniture.
  if (/:\s*$/.test(v)) return false;                                               // a name never ends in a colon
  const folded = foldForMatch(v);
  if (HEADER_WORDS.has(folded)) return false;
  // A SPACED-OUT contact label. `A T T N : Lim Xiao Shan` never reaches the ordinary prefix
  // match, so the party gate is the only thing standing between it and `customer_name`.
  const deSpaced = folded.replace(/\s+/g, "");
  if (ATTN_DESPACED.some((l) => deSpaced.startsWith(l))) return false;
  return true;
}

/**
 * The identity key two readings are compared on: NFKC-normalize, keep only Unicode letters and
 * numbers, lowercase — so `KONG CHENG RESTAURANTS SDN. BHD.` and `Kong Cheng Restaurants Sdn Bhd`
 * are ONE party rather than a contest. Used ONLY to decide whether two readings are the same
 * party; never emitted.
 *
 * UNICODE-AWARE, and that is not cosmetic. The first cut used the DB's registration rule
 * (`[^a-zA-Z0-9]`), which DELETES every non-ASCII letter — so two genuinely different Malaysian
 * Chinese company names, `鑫旺 SDN BHD` and `宏达 SDN BHD`, both keyed to `sdnbhd`. Executed
 * through the real normalizer that read as ONE party matched twice instead of a contest, and
 * emitted `"?? SDN BHD"`. Uniqueness-or-nothing is only a defense if the key can tell two names
 * apart; \p{L}\p{N} is what makes it one. (`registrationKey` in the X6 module keeps the ASCII
 * rule deliberately — it must equal the DB's own `regexp_replace(reg,'[^a-zA-Z0-9]','','g')`,
 * and a registration number has no non-ASCII letters. These two keys are NOT interchangeable.)
 *
 * Legal suffixes are DELIBERATELY NOT stripped: `ACME SDN BHD` and `ACME` may well be two
 * different registered entities, and collapsing them would be this code inventing an identity
 * rather than reading one.
 */
export const partyKey = (s) => String(s ?? "").normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

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
  // BARE-ONLY: a `to` carrying anything after it is a line item, not an addressee. NOT a
  // continuation — a continuation means "this label did not end here"; this means "this was
  // never a label". Returning null keeps the line out of candidacy entirely.
  if (BARE_ONLY_LABELS.has(label) && remainder) return null;
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
