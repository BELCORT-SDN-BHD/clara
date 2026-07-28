// The deterministic currency reader (currency-defect design, part 1 §3 / part 2 §8).
//
// WHY THIS EXISTS. `invoiceFacts.v1.azure.mjs` used to emit `invoice.currency` from
// `fields.InvoiceTotal.valueCurrency.currencyCode` alone — a MODEL GUESS presented as a
// reading, and measured wrong on 7 of 40 real documents (6 typed USD, 1 typed EUR) that print
// nothing but Malaysian evidence on their face ("Price is in MYR currency.", "RINGGIT
// MALAYSIA : ...", the `RM` symbol). `0009_coding_floor.sql` raises a TERMINAL CLR21
// `currency_unsupported` refusal on any non-blank non-MYR `invoice.currency` region, with no
// override — so a bare-numeral Malaysian invoice Azure mis-typed could never be coded at all.
// The fix is not a new rule; it is to stop laundering the vendor's inference into a
// page-anchored fact and let the EXISTING merge law (see `mergeCurrencyIntoFields` below,
// mirroring `invoice-totals-merge.mjs`) arbitrate between two readers instead of trusting one.
//
// DOCUMENT-SCOPE, NOT LABEL-ANCHORED — and this is the one structural way this reader differs
// from its X2/X6 siblings. A totals figure is meaningless without knowing which label owns it;
// a currency declaration qualifies the WHOLE document, and the measured evidence proves geometry
// would refuse the very family this fix exists for: on the EZSEC invoice the declaration
// `RINGGIT MALAYSIA : ...` sits twelve lines and well over an inch away from the gross it
// qualifies. So this reader asks one question per document — "does the page vocabulary say MYR,
// foreign, both, or neither" — never which line pairs with which amount.
//
// NO GEOMETRY IS NEEDED TO DECIDE, only to CITE. Every other reader in this family (X2, X6)
// normalizes page coordinates into a shared frame (`pageFrame` in invoice-totals-reader.mjs)
// because it compares TWO boxes against each other. This reader never compares one line's
// position to another's, so it has no threshold to get wrong on a pixel page with no usable
// width — the one shape that refuses X2 and X6 outright (their `pixel:no-width` / `unit_
// unresolved` counters). A matched line's own polygon is carried verbatim for citation, exactly
// as printed by the engine, whatever unit it is in; this reader can read pages the others can't,
// and that asymmetry is deliberate (currency-defect design part 1 §3, refusal case iv).
//
// THE FOUR VERDICTS. Only `myr` is a READING — it is the only verdict this module ever turns
// into an emitted field. `foreign`, `ambiguous` and `absent` are non-readings: a deterministic
// reader that cannot NAME the currency has not earned the right to contradict anyone, so it
// abstains and the typed field (if any) stands exactly as it did before this module existed
// (v5 behaviour, preserved on purpose).
//   - `myr`       one or more MYR-vocabulary tokens, and NO foreign-vocabulary token anywhere.
//   - `foreign`    one or more foreign-vocabulary tokens, and no MYR-vocabulary token.
//   - `ambiguous`  BOTH present. THIS IS THE LOAD-BEARING CASE, not a defensive afterthought:
//                  `openai-0008.pdf` is a genuine USD invoice that prints an MYR convenience
//                  conversion in parentheses — `(RM6.61)` — right next to `$21.60 USD`. A naive
//                  "page contains RM => MYR" reader mis-states that document while looking like
//                  a clean deterministic read. Both tokens present means neither reader wins;
//                  the typed USD stands unopposed and reaches the existing CLR21 refusal, which
//                  is the CORRECT destination for an invoice denominated in USD with a ringgit
//                  conversion printed on it.
//   - `absent`     neither. Measured: 0 of 40 documents holding invoice facts print no currency
//                  vocabulary at all (the trip-wire for owner question O3, not this reader).
//
// THE MYR VOCABULARY IS STRICT (RM, MYR, RINGGIT) — the three tokens the corpus measurement
// resolved every affirmative Malaysian-currency declaration into (part 1 §2): the ISO code, the
// symbol (including its column-header form `Total (RM)`), and the amount-in-words declaration
// (`RINGGIT MALAYSIA : ...`, the ONLY evidence the entire EZSEC family carries — `RM` never
// appears on an EZSEC page at all). SST/GST registration marks are DELIBERATELY EXCLUDED: a
// Malaysian SST registration evidences a tax regime, not the currency any one invoice states
// (part 1 §2) — a Malaysian SST-registered vendor can and does invoice in USD.
//
// THE FOREIGN VOCABULARY IS A CURATED SET of major/regional ISO 4217 codes, not the full
// standard list — and that omission is itself measured, not merely cautious. Scanning this
// reader's own boundary rule (below) against the real corpus turned up TWO genuine false-
// positive hazards that a "just import every ISO code" reader would have shipped with:
//   - `BHD` (Bahraini Dinar) is a SUBSTRING OF EVERY MALAYSIAN COMPANY NAME: "Sendirian
//     Berhad" is universally abbreviated "SDN BHD" on the letterhead of nearly every
//     Malaysian invoice in the corpus, EZSEC's five times over on one document alone.
//   - `ALL` (Albanian Lek) is the common English word "all" — EZSEC and BUSYSTREET both print
//     "All cheques should be crossed and made payable to..." in their boilerplate.
// Both would have turned CG2's EZSEC document `ambiguous` — the reader abstaining on exactly
// the family this design exists to fix, in a way that looks like a passing, deterministic read.
// The same class of risk (an ISO code that is ALSO a common English word or a three-letter
// business term) rules out a further short list by inspection, in the same spirit as the
// AUD-inside-Audit trap the word-boundary rule exists for: `TRY`, `PEN`, `COP`, `MAD`, `BOB`,
// `GEL`, `TOP`, `SOS`, `RUB`, `RON` are all EXACT three-letter English words or common given
// names with no boundary-check escape (unlike `AUD` inside `Audit`, these tokens ARE the whole
// word, so the boundary rule cannot rescue them). Widening this list further is safe on
// accounting-correctness grounds — a false `ambiguous` only costs an abstention, never a wrong
// posting (part 1 §6.4) — but each addition should be MEASURED against real documents first,
// exactly as this list was; that measurement is the job, not an afterthought.
//
// ASCII-WORD-BOUNDARY-EXACT, AND WHY NOT JAVASCRIPT's `\b`. A token is a hit only when the
// character immediately before AND after it is NOT an ASCII letter — crucially, a DIGIT is
// explicitly ALLOWED on either side, because Malaysian invoices print `RM1,700.00` with the
// symbol directly abutting its amount, no space. `\bRM\b` would refuse exactly that shape,
// since `\b` treats a digit as a word character too. The left-boundary rule alone defeats every
// real English word measured to contain `rm`/`aud` adjacent as a substring (farm, firm, form,
// harm, term, warm, worm, storm, terminal, format, permit, audit, audio, audible, ...): none of
// them begins with the two letters in question, so "not preceded by a letter" already refuses
// every one, and the CG4 trap (`Internal Audit`) is caught the same way — `AUD` sits inside
// `Audit` followed by `I`, a letter, so the RIGHT-boundary check refuses it even though the
// left one would have passed. Case-INSENSITIVE on purpose: OCR casing carries no signal here,
// the boundary discipline is what does the actual work.

import { isDbBlank } from "./invoice-amount-grammar.mjs";

const ASCII_LETTER = /[A-Za-z]/;

/** The MYR accept vocabulary — STRICT, per the currency-defect design's exact list (part 1 §2).
 *  Order does not matter: every hit is counted, not just the first. */
const MYR_TOKENS = Object.freeze(["MYR", "RM", "RINGGIT"]);

/** The foreign refusal vocabulary — WIDENED deliberately (part 1 §6.4: for this reader the
 *  foreign vocabulary is the refusal trigger, so normalize wide), but MEASURED against the real
 *  corpus rather than imported wholesale from ISO 4217 — see the header for the two confirmed
 *  hazards (`BHD`, `ALL`) and the further exclusions made by inspection of the same class. */
const FOREIGN_TOKENS = Object.freeze([
  "USD", "SGD", "EUR", "GBP", "AUD", "JPY", "CNY", "HKD", "TWD", "THB",
  "IDR", "VND", "PHP", "INR", "KRW", "NZD", "CHF", "AED", "SAR", "QAR",
  "KWD", "BND", "PKR", "BDT", "LKR", "NPR", "MMK", "KHR", "LAK", "EGP",
  "ZAR", "NGN", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "MXN", "BRL",
  "ARS", "CLP", "UAH",
]);

const content = (line) => String(line?.content ?? "");

/**
 * Does `text` contain `token` at an ASCII-word-boundary-exact position? See the header for why
 * this is not `\b`: a digit immediately before or after the token is explicitly NOT a boundary
 * violation (the canonical Malaysian print form is `RM1,700.00`, symbol abutting amount).
 */
function hasToken(text, token) {
  const upper = text.toUpperCase();
  let from = 0;
  for (;;) {
    const idx = upper.indexOf(token, from);
    if (idx === -1) return false;
    const before = idx > 0 ? upper[idx - 1] : "";
    const after = idx + token.length < upper.length ? upper[idx + token.length] : "";
    if (!ASCII_LETTER.test(before) && !ASCII_LETTER.test(after)) return true;
    from = idx + 1;
  }
}

/** The first vocabulary token (in list order) this line hits, or null. */
function firstHit(text, tokens) {
  for (const token of tokens) {
    if (hasToken(text, token)) return token;
  }
  return null;
}

/**
 * Read the document's currency off `analyzeResult.pages[].lines[]` — the SAME array X2's totals
 * reader already consumes (no new Azure call, no new payload). Document-scope: every line on
 * every page is scanned for both vocabularies; there is no per-line pairing.
 *
 * Returns `fields` (empty unless the verdict is `myr`, in which case it carries exactly one
 * `invoice.currency` row citing the FIRST matching MYR-vocabulary line in document order — page
 * ascending, then line index ascending) and a `receipt` counting every signal seen, for the
 * envelope (contract precedent: `totals_reader`, `vendor_identity`).
 *
 * @param {Array<{pageNumber?:number, lines?:Array<{content?:string, polygon?:number[], confidence?:number}>}>} pages
 * @returns {{fields:Array<{field_path:string,value_raw:string,page:number,polygon:number[],confidence:number|null}>,
 *            receipt:object}}
 */
export function readCurrencyFromLines(pages) {
  const receipt = {
    verdict: "absent",
    myr_hits: 0,
    foreign_hits: 0,
    myr_tokens: [],
    foreign_tokens: [],
    citation: null,
    typed_disagreement: 0,
    typed_collapsed: 0,
    typed_recovered: 0,
    emitted: 0,
    fields: {},
  };
  const myrHits = [];
  const foreignHits = [];

  for (const page of Array.isArray(pages) ? pages : []) {
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    if (lines.length === 0) continue;
    const pageNumber = Number(page?.pageNumber) || 1;
    for (const line of lines) {
      const text = content(line);
      if (!text) continue;
      const myrToken = firstHit(text, MYR_TOKENS);
      if (myrToken) {
        if (!receipt.myr_tokens.includes(myrToken)) receipt.myr_tokens.push(myrToken);
        myrHits.push({
          token: myrToken,
          text,
          page: pageNumber,
          polygon: (line.polygon || []).map(Number),
          confidence: line?.confidence == null ? null : Number(line.confidence),
        });
      }
      const foreignToken = firstHit(text, FOREIGN_TOKENS);
      if (foreignToken) {
        if (!receipt.foreign_tokens.includes(foreignToken)) receipt.foreign_tokens.push(foreignToken);
        foreignHits.push({ token: foreignToken, text, page: pageNumber });
      }
    }
  }

  receipt.myr_hits = myrHits.length;
  receipt.foreign_hits = foreignHits.length;

  let verdict;
  if (myrHits.length > 0 && foreignHits.length > 0) verdict = "ambiguous";
  else if (myrHits.length > 0) verdict = "myr";
  else if (foreignHits.length > 0) verdict = "foreign";
  else verdict = "absent";
  receipt.verdict = verdict;

  if (verdict !== "myr") {
    // A non-reading is still counted, exactly as X2/X6 count every refusal — invisible refusals
    // are how a readable document ends up looking like one that printed nothing.
    receipt.fields["invoice.currency"] = { outcome: verdict, myr_hits: receipt.myr_hits, foreign_hits: receipt.foreign_hits };
    return { fields: [], receipt };
  }

  const [first] = myrHits; // document order: pages iterated ascending, lines within a page as given
  receipt.citation = { token: first.token, text: first.text, page: first.page };
  receipt.fields["invoice.currency"] = {
    outcome: "myr",
    myr_hits: receipt.myr_hits,
    foreign_hits: receipt.foreign_hits,
    citation: receipt.citation,
  };
  return {
    fields: [{
      field_path: "invoice.currency",
      value_raw: "MYR",
      page: first.page,
      polygon: first.polygon,
      confidence: first.confidence,
    }],
    receipt,
  };
}

/** DB-aligned "is this typed currency code MYR". Mirrors `isDbBlank`'s discipline of asking the
 *  DB's own question rather than JavaScript's: uppercase + ASCII-trim, since Azure's typed
 *  `currencyCode` is always a clean 3-letter ISO code and the only normalization worth doing is
 *  the one that lets `" myr "` and `"MYR"` compare equal without touching anything else. */
const isTypedMyr = (raw) => String(raw ?? "").trim().toUpperCase() === "MYR";

/**
 * Merge the reader's emission into the mapper's field list, reconciling against Azure's typed
 * `invoice.currency` row — the SAME four-outcome law as `mergeTotalsIntoFields`
 * (invoice-totals-merge.mjs:16-25), applied to a single non-monetary field compared by STRING
 * identity rather than cents (currency codes are not amounts, so `centsOfRaw` does not apply
 * here; the comparison below is the currency-typed equivalent of that file's cents equality).
 *
 *   - typed row ABSENT            -> emit the reader's row.
 *   - typed row present but BLANK -> the reader fills the hole (never overrides a real typed
 *     hit — same precedent as invoice_id recovery and the X2/X6 mergers).
 *   - typed says MYR (agree)      -> keep the TYPED row (it carries Azure's own bounding region
 *     and confidence); stamp `typed_collapsed` so migration 0023's corroboration predicate can
 *     see that TWO INDEPENDENT sources agreed, not one reader talking to itself.
 *   - typed says anything else (disagree) -> emit NEITHER. Withdrawal is the whole fix: with no
 *     `invoice.currency` region left, `explicit_non_myr` evaluates false and the terminal CLR21
 *     `currency_unsupported` refusal does not fire, while `corroborated` also stays false — the
 *     fix can only ever REMOVE a document from the corroborated set, never add one (design part
 *     1 §4).
 *   - the reader ABSTAINS (`ambiguous`/`absent`/`foreign`) -> `currency.fields` is empty, this
 *     function returns immediately, and the typed row (if any) stands untouched — v5 semantics,
 *     preserved on purpose.
 *
 * Mutates `out` and `currency.receipt`; returns nothing.
 *
 * @param {Array<{field_path:string,value_raw:string}>} out the mapper's accumulated fields
 * @param {{fields:Array, receipt:object}} currency the reader's result
 */
export function mergeCurrencyIntoFields(out, currency) {
  const [row] = currency.fields;
  if (!row) return; // abstain: nothing to reconcile, the typed row (if any) stands as-is

  const typed = out.find((r) => r.field_path === "invoice.currency");
  if (!typed) {
    out.push(row);
    currency.receipt.emitted += 1;
    return;
  }
  // BLANKNESS IS THE DB'S DEFINITION, imported rather than reimplemented — see isDbBlank's own
  // header in invoice-amount-grammar.mjs. A currency code is never legitimately "\t", so the
  // same care that field takes for money tokens is free insurance here, at no extra cost.
  if (isDbBlank(typed.value_raw)) {
    Object.assign(typed, row);
    currency.receipt.typed_recovered += 1;
    currency.receipt.emitted += 1;
    return;
  }
  if (isTypedMyr(typed.value_raw)) {
    currency.receipt.typed_collapsed += 1;
    if (currency.receipt.fields?.["invoice.currency"]) {
      currency.receipt.fields["invoice.currency"].outcome = "typed_collapsed";
      currency.receipt.fields["invoice.currency"].typed_value_raw = typed.value_raw;
    }
    return;
  }
  out.splice(out.indexOf(typed), 1);
  currency.receipt.typed_disagreement += 1;
  if (currency.receipt.fields?.["invoice.currency"]) {
    currency.receipt.fields["invoice.currency"].outcome = "typed_disagreement";
    currency.receipt.fields["invoice.currency"].typed_value_raw = typed.value_raw;
  }
}
