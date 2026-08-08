// X7 — the PARTY GRAMMAR battery. Spelling only: what is a label, what may be a value, what two
// readings of one name have in common. Split from the reader battery on the same seam the lib
// uses (`invoice-party-grammar.mjs` = spelling · `invoice-block-geometry.mjs` = position · the
// reader = judgement).
//
// ── WHAT THESE CELLS DO AND DO NOT PROVE, stated because an earlier claim of mine was overstated
// and two reviewers disproved it by executing the real normalizer. Since round 3 these functions
// DO NOT decide party candidacy — `hasRegisteredEntitySuffix` does. So a string this file shows
// `looksLikePartyName` ADMITTING may still never become a party, and a green grammar cell is
// therefore NOT evidence about what reaches `customer_name`. Every executed failure scenario from
// all three review rounds is pinned END-TO-END in `x7-customer-mapper.test.mjs`, through
// `normalizeAzureInvoice`. These cells exist to pin the vocabulary itself, nothing wider.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  splitBillToLabel, splitAttnLabel, looksLikePartyName, partyKey, hasRegisteredEntitySuffix,
  containsEntityToken,
} from "../lib/invoice-party-grammar.mjs";
import { hasColon, APOSTROPHES } from "../lib/invoice-entity-lexicon.mjs";

test("C3-1: a COLON anywhere means a caption — the root closer for the possessive class", () => {
  // The tokenizer knew four apostrophe glyphs; OCR produces more. NFKC folds the FULLWIDTH form
  // (U+FF07) and nothing else here — U+2018/U+2019/U+02BC/U+2032/U+00B4 all survive it — so an
  // enumeration will always lag some rendering. Refusing a colon closes the class in one rule:
  // registered company names do not contain one.
  for (const glyph of ["'", "‘", "’", "ʼ", "′", "´", "＇"]) {
    const text = `Customer${glyph}s Ref: ACME SDN BHD`;
    const hit = splitBillToLabel(text);
    const remainder = hit?.remainder ?? "";
    assert.equal(looksLikePartyName(remainder), false, `${JSON.stringify(text)} -> ${JSON.stringify(remainder)}`);
  }
  // The missing-space variant too, and a bare caption.
  assert.equal(looksLikePartyName("Ref:ACME SDN BHD"), false);
  assert.equal(looksLikePartyName("Invoice No: RS-0041"), false);
  assert.equal(looksLikePartyName("客户：ACME SDN BHD"), false, "the fullwidth colon counts as well");
  // A real name is unaffected — company names carry no colon.
  assert.equal(looksLikePartyName("KONG CHENG RESTAURANTS SDN BHD"), true);
  assert.equal(looksLikePartyName("BANK OF CHINA (MALAYSIA) BERHAD"), true);
});

test("S2: the COLON class is complete — NFKC first, then the enumerated residue", () => {
  // The rule recognized only ASCII + fullwidth, so `Reference﹕` (U+FE55), `∶` (U+2236) and
  // `꞉` (U+A789) each reached customer_name. A root rule with an incomplete character class is
  // not a root rule — it reopens one glyph at a time.
  for (const [name, glyph] of [["U+003A ascii", ":"], ["U+FF1A fullwidth", "："],
    ["U+FE55 small", "﹕"], ["U+2236 ratio", "∶"], ["U+A789 modifier letter", "꞉"],
    ["U+05C3 sof pasuq", "׃"], ["U+0589 armenian", "։"]]) {
    assert.equal(looksLikePartyName(`Reference${glyph} ACME SDN BHD`), false, name);
  }
  // NFKC is the ROOT half — it folds the presentation/fullwidth forms with no enumeration at all.
  assert.equal("﹕".normalize("NFKC"), ":", "U+FE55 folds, so it needs no listing");
  assert.equal("：".normalize("NFKC"), ":", "U+FF1A folds too");
  assert.equal("∶".normalize("NFKC"), "∶", "U+2236 does NOT fold — hence the class");
  assert.equal("꞉".normalize("NFKC"), "꞉", "U+A789 does NOT fold either");
  // U+02F8 MODIFIER LETTER RAISED COLON. An initial adjudication left it out on the ground that
  // the continuation guard catches the realistic shape. MEASURED: that holds for `Customer Ref˸`
  // (remainder opens with the continuation token `Ref`) but NOT for `Bill To˸` / `Customer˸`,
  // where the remainder survived as `˸ ACME SDN BHD` and was emitted as customer_name — a
  // CORRUPTED party. Both halves pinned so the reason for including it stays checkable.
  assert.equal("˸".normalize("NFKC"), "˸", "U+02F8 does not fold, so it must be listed");
  assert.equal(splitBillToLabel("Customer Ref˸ ACME SDN BHD")?.continuation, true, "the guard DOES catch this shape");
  assert.equal(looksLikePartyName("˸ ACME SDN BHD"), false, "…and the class catches the shape it does not");
  // "COMPLETE" means complete for the OCR-producible glyphs measured so far — a closed
  // enumeration over an open world, which is why an unlisted glyph must ABSTAIN, never assert.
  assert.equal(looksLikePartyName("BANK OF CHINA (MALAYSIA) BERHAD"), true);
});

test("R6-A: the positive class normalizes with NFC — COMPATIBILITY folding must not widen it", () => {
  // The class ran on the NFKC form and admitted anything that COMPATIBILITY-folded into it,
  // while the RAW glyph was what got emitted. Four measured leaks, each folding to an allowed
  // character: U+FE30→`..`, U+2025→`..`, U+FE50→`,`, U+FE52→`.`.
  for (const [name, glyph] of [["U+FE30 vertical two-dot leader", "︰"], ["U+2025 two-dot leader", "‥"],
    ["U+FE50 small comma", "﹐"], ["U+FE52 small full stop", "﹒"]]) {
    assert.equal(looksLikePartyName(`ACME${glyph}SDN BHD`), false, `${name} inside a name`);
    assert.equal(looksLikePartyName(`${glyph} ACME SDN BHD`), false, `${name} leading`);
    // Each one really does compatibility-fold into the class — that is the mechanism, pinned.
    assert.ok(/^[.,]+$/.test(glyph.normalize("NFKC")), `${name} folds to allowed punctuation under NFKC`);
    assert.equal(glyph.normalize("NFC"), glyph, "…and NFC leaves it alone, which is why NFC is the right fold here");
  }
  // THE KEEP-SET. NFC must not cost a legitimate name.
  for (const good of ["José Silva Sdn Bhd", "José Silva Sdn Bhd", "鑫旺 SDN BHD",
    "ＡＣＭＥ SDN BHD", "２０２０ VISION SDN BHD", "ACME (M) SDN BHD", "D&D DEVELOPMENT SDN BHD",
    "KONG CHENG RESTAURANTS SDN BHD"]) {
    assert.equal(looksLikePartyName(good), true, good);
  }
  // THE ONE RECORDED BEHAVIOUR CHANGE: a non-breaking space inside a name now abstains.
  assert.equal(looksLikePartyName("ACME SDN BHD"), false, "NBSP is a formatting artefact — fail-closed");
});

test("R6-A: the OTHER normalizations stay NFKC — admission narrows, comparison merges", () => {
  // The asymmetry is deliberate and load-bearing: a class that ADMITS must not merge distinct
  // characters, while a fold used for COMPARISON must. Unifying them would break one or the other.
  assert.equal(hasColon("Ref： ACME"), true, "hasColon still catches the FULLWIDTH colon…");
  assert.equal(hasColon("Ref﹕ ACME"), true, "…and the small colon, via NFKC");
  // …and the comparison fold still lets two renderings of one name meet.
  assert.equal(partyKey("ＡＣＭＥ SDN BHD"), partyKey("ACME SDN BHD"), "fullwidth and ASCII are one party");
});

test("C6-2: label matching is PUNCTUATION-INSENSITIVE — `Att'n` ≡ `Attn`", () => {
  // WHY THIS MATTERED, and why the colon rule did not cover it. The variants were not recognized
  // as contact labels, so their lines were never CLAIMED — and an unclaimed `Att'n ACME SDN BHD`
  // is name-shaped (the apostrophe is an ADMITTED character) and entity-suffixed, so it became a
  // party candidate and the override wrote the whole contact-labelled string as customer_name.
  // The colon rule only fires on a line that carries a colon: `Att'n : Lim` dies on it, but
  // `Att'n ACME SDN BHD` has none — which is exactly the shape the reviewer probed.
  for (const lbl of ["Att'n", "Att.n", "Att-n", "Att/n", "Att’n", "Attn"]) {
    assert.ok(splitAttnLabel(`${lbl} : Lim Xiao Shan`), `${lbl} must be a contact label`);
    assert.equal(splitAttnLabel(`${lbl} : Lim Xiao Shan`).remainder, "Lim Xiao Shan");
    assert.ok(splitAttnLabel(`${lbl} ACME SDN BHD`), `${lbl} must claim even a company value`);
  }
  // OVER-CLAIMING IS SAFE BY CONSTRUCTION under claim -> reserve -> judge: a false label match
  // can only RESERVE a line, and a reserved line abstains. The word boundary still holds, so
  // ordinary words are not swallowed.
  assert.equal(splitAttnLabel("ATTNXYZ SDN BHD"), null);
  assert.equal(splitBillToLabel("TOTAL PAYABLE : 2,800.00"), null, "the `to` boundary survives the second fold");
  assert.equal(splitBillToLabel("Bill To: ACME SDN BHD").remainder, "ACME SDN BHD");
});

test("C6-4: every apostrophe rendering folds identically — one name, one key", () => {
  // `U+02BC` is category Lm — a LETTER — so the `[^\p{L}\p{N}]` folds PRESERVED it while ASCII,
  // curly and fullwidth apostrophes collapsed to a space. `O'BRIEN` and `OʼBRIEN` keyed
  // differently, so one company written two lawful ways read as a CONTEST and withdrew a correct
  // typed name. A character the positive class ADMITS must fold the same way in every comparison.
  const keys = ["O'BRIEN SDN BHD", "O‘BRIEN SDN BHD", "O’BRIEN SDN BHD", "OʼBRIEN SDN BHD"].map(partyKey);
  assert.equal(new Set(keys).size, 1, `all renderings must key alike, got ${JSON.stringify(keys)}`);
  // …and the class does not over-merge: a genuinely different name still keys apart.
  assert.notEqual(partyKey("O'BRIEN SDN BHD"), partyKey("OBRIEN HOLDINGS SDN BHD"));
  // THE INVARIANT: the ADMITTED set and the FOLDED set are one string literal in the lexicon, so
  // they cannot drift. Every admitted rendering folds alike; nothing folds that is not admitted.
  for (const glyph of APOSTROPHES) {
    assert.equal(looksLikePartyName(`O${glyph}BRIEN SDN BHD`), true, `${glyph} is admitted…`);
    assert.equal(partyKey(`O${glyph}BRIEN SDN BHD`), partyKey("O'BRIEN SDN BHD"), "…and folds alike");
  }
  // The FULLWIDTH apostrophe is in NEITHER set: admission normalizes with NFC, which does not
  // fold it, so a name printed with it ABSTAINS. Fail-closed, and recorded rather than silent.
  assert.equal(looksLikePartyName("O＇BRIEN SDN BHD"), false, "U+FF07 abstains — not admitted, not folded");
});

test("R6-B: `@` is not in the class — the email guard already owns that character", () => {
  // The allowance was justified with a real Malaysian alias shape and could never fire: the
  // email guard refuses every `@`-bearing value thirteen lines earlier. A permission no input
  // can reach is a comment that looks like one.
  assert.equal(looksLikePartyName("AHMAD @ JOHN SDN BHD"), false);
  assert.equal(looksLikePartyName("accounts@acme.com.my"), false, "the guard that owns `@` still works");
});

test("C3-2: the contact refusal is a CONTAINS test, not the negation of party candidacy", () => {
  // `!hasRegisteredEntitySuffix` is a different proposition from `is a person`: every
  // company-shaped string that failed candidacy for some OTHER reason landed in the contact
  // bucket. All four were executed and emitted as `contact_person`.
  for (const company of ["SDN BHD", "ACME SDN BHD (123456-X)", "ACME SDN BHD, Kuala Lumpur",
    "ACME P.L.T.", "ACME S/B", "ACME SDN. BHD.", "ACME BERHAD - KL BRANCH"]) {
    assert.equal(containsEntityToken(company), true, `${company} must never be read as a person`);
  }
  // …while a genuine person still passes, INCLUDING the initials forms that R3-2 rescued.
  for (const person of ["Lim Xiao Shan", "Lim S B", "Tan S.B.", "Wong K L", "Tan C K",
    "Ms Tan Wei Ming", "Muhammad Bin Abdullah", "Lee Chong Wei"]) {
    assert.equal(containsEntityToken(person), false, `${person} is a person`);
  }
  // The two predicates are ASYMMETRIC on purpose — strict for admission, broad for refusal.
  assert.equal(hasRegisteredEntitySuffix("ACME SDN BHD (123456-X)"), false, "strict: not a party candidate");
  assert.equal(containsEntityToken("ACME SDN BHD (123456-X)"), true, "broad: and not a contact either");
});

test("C3-3 / S4: punctuation preserves a boundary, and its CLASS is part of the identity", () => {
  // C3-3: collapsing punctuation away made `A-B SDN BHD` ≡ `AB SDN BHD`, so a document naming two
  // different companies read as `matched` and SUPPRESSED a lawful contest — wrong-silent.
  assert.notEqual(partyKey("A-B SDN BHD"), partyKey("AB SDN BHD"));
  assert.notEqual(partyKey("A.B. SDN BHD"), partyKey("AB SDN BHD"));
  // S4: folding hyphen and slash to the SAME boundary left `A/B` ≡ `A-B` — the same suppression
  // one level down. The classes now sign the key distinctly, so they HOLD instead of merging.
  assert.notEqual(partyKey("A/B TRADING SDN BHD"), partyKey("A-B TRADING SDN BHD"));
  assert.notEqual(partyKey("A/B TRADING SDN BHD"), partyKey("AB TRADING SDN BHD"));
  assert.notEqual(partyKey("A-B TRADING SDN BHD"), partyKey("AB TRADING SDN BHD"));
  // The same rendering keys the same, whichever class it uses.
  assert.equal(partyKey("A/B TRADING SDN BHD"), partyKey("a/b trading sdn bhd"));
  assert.equal(partyKey("A-B TRADING SDN BHD"), partyKey("a-b trading sdn bhd"));
  // COMMAS AND DOTS STAY HARMLESS — only the two classes that can carry a distinct registered
  // name are signed. NARROWING RECORDED: `KONG-CHENG` no longer keys as `KONG CHENG`, so two
  // renderings of one name now HOLD rather than merge. Fail-closed by the S4 ruling.
  assert.equal(partyKey("KONG, CHENG SDN BHD"), partyKey("KONG CHENG SDN BHD"));
  assert.notEqual(partyKey("KONG-CHENG SDN BHD"), partyKey("KONG CHENG SDN BHD"));
  // Suffix-variant canonicalization is untouched: the S/B suffix's own slash must not sign the
  // key, or every `S/B` name would stop collapsing with its `SDN BHD` spelling.
  assert.equal(partyKey("KONG CHENG RESTAURANTS S/B"), partyKey("KONG CHENG RESTAURANTS SDN BHD"));
  assert.equal(partyKey("ACME S/B"), partyKey("ACME SDN BHD"));
});

test("`M/s` is matched as PUNCTUATION, so a company named `M S ...` keeps its own name", () => {
  // Folding `M/s` to `m s` would also match `M S DEVELOPMENT SDN BHD` and hand back
  // `DEVELOPMENT SDN BHD` as the party — a wrong identity, the one outcome this module exists to
  // prevent. The literal form is matched precisely or not at all.
  assert.equal(splitBillToLabel("M S DEVELOPMENT SDN BHD"), null);
  assert.equal(splitBillToLabel("MS DEVELOPMENT SDN BHD"), null);
  assert.equal(splitBillToLabel("M/s ACME SDN BHD").remainder, "ACME SDN BHD");
  assert.equal(splitBillToLabel("M.S. ACME SDN BHD").remainder, "ACME SDN BHD");
  assert.equal(splitBillToLabel("Messrs ACME SDN BHD").remainder, "ACME SDN BHD");
});

test("the vocabulary reads the printed variants, and only those", () => {
  for (const [text, expected] of [
    ["Bill To: ACME SDN BHD", "ACME SDN BHD"],
    ["BILL  TO - ACME SDN BHD", "ACME SDN BHD"],
    ["Billed To : ACME SDN BHD", "ACME SDN BHD"],
    ["Invoice To: ACME SDN BHD", "ACME SDN BHD"],
    ["Sold To : ACME SDN BHD", "ACME SDN BHD"],
    ["Customer Name : ACME SDN BHD", "ACME SDN BHD"],
    ["Buyer: ACME SDN BHD", "ACME SDN BHD"],
    ["Kepada : ACME SDN BHD", "ACME SDN BHD"],
    ["Pelanggan : ACME SDN BHD", "ACME SDN BHD"],
  ]) {
    assert.equal(splitBillToLabel(text)?.remainder, expected, text);
  }
  // VENDOR-side labels are absent from the vocabulary by construction — a seller block can never
  // open a buyer candidate on the label alone.
  for (const text of ["From: ROME SECRETARY SDN BHD", "Sold By: ROME SECRETARY SDN BHD",
    "Supplier : ROME SECRETARY SDN BHD", "Remit To: MAYBANK 5123", "Pay To: MAYBANK 5123"]) {
    assert.equal(splitBillToLabel(text), null, text);
  }
});

test("the NAME gate refuses everything that is not a plausible name", () => {
  for (const bad of ["RM 2,800.00", "2025-10-14", "2026-01-01", "accounts@acme.com.my",
    "www.acme.com.my", "Tel : 017-472 9637", "Fax: 03-2100 1000", "No. 12", "Lot 3A",
    "Level 5, Wisma ACME", "50450 Kuala Lumpur", "12, Jalan Ampang", "--", "  ",
    "Name:", "Customer", "Description", "Particulars", "Amount", "Qty",
    "12, Main Road", "45, Main Street", "8, Park Avenue",
    "A T T N : Lim Xiao Shan", "A T T E N T I O N : Lim Xiao Shan",
    "BE PAID BY 30 DAYS", "WHOM IT MAY CONCERN", "ALL AMOUNTS IN RINGGIT",
    "OUR REF ABC123", "PLEASE MAKE CHEQUES PAYABLE", "AS PER AGREEMENT", "UNTUK BAYARAN PENUH"]) {
    assert.equal(looksLikePartyName(bad), false, bad);
  }
  // …and admits the identities this client's REAL books actually carry (acceptance-h1 rows).
  for (const good of ["KONG CHENG RESTAURANTS SDN BHD", "D&D DEVELOPMENT SDN BHD", "SIFU LAB",
    "Lim Xiao Shan", "AMATERUS GROUP SDN BHD", "DD ECORISE SDN BHD", "SELANGOR ENTERPRISE SDN BHD",
    "THE ROOF SDN BHD", "Ms Tan Wei Ming",
    // Unicode: the ASCII letter-count refused this outright, which nobody reasoned about — it was
    // the gate being blind to the script. It is a plausible NAME; the entity gate decides candidacy.
    "鑫旺有限公司",
    // The de-spaced ATTN guard is scoped to genuinely spaced-out text, so an ordinary company
    // whose name merely STARTS with those letters is not eaten.
    "ATTNAM SDN BHD"]) {
    assert.equal(looksLikePartyName(good), true, good);
  }
});

test("PARTY CANDIDACY REQUIRES A POSITIVE ENTITY SIGNAL — the round-3 design law", () => {
  // A blocklist can only enumerate the past. Three review rounds each found a fresh instance of
  // ONE class — a label whose remainder is furniture — so the override branch, the only branch
  // that can write a wrong party onto real books, now demands positive evidence instead.
  for (const yes of [
    "KONG CHENG RESTAURANTS SDN BHD", "KONG CHENG RESTAURANTS SDN. BHD.", "KONG CHENG S/B",
    "ACME SENDIRIAN BERHAD", "AMATERUS GROUP BERHAD", "MAYBANK BHD", "ACME PLT", "ACME LLP",
    "鑫旺 SDN BHD", "ATTNAM SDN BHD", "THE ROOF SDN BHD",
  ]) assert.equal(hasRegisteredEntitySuffix(yes), true, yes);
  for (const no of [
    "Signature", "Declaration", "Since 2019", "Master Account", "Feedback Form",
    "DELIVERY ADDRESS", "MAILING ADDRESS", "Payment Terms", "Name:", "12, Main Road",
    "supply and install air-conditioning system", "Secretarial fee for the year 2025",
    "Lim Xiao Shan", "SIFU LAB", "鑫旺有限公司", "SDN BHD",
  ]) assert.equal(hasRegisteredEntitySuffix(no), false, no);
  // THE HONEST NARROWING, pinned so it is a decision and not a surprise: an unsuffixed buyer —
  // an individual, or this client's own real `SIFU LAB` — never overrides. It abstains, typed
  // stands, and that is ZERO loss against today, where the typed value stands unconditionally.
  assert.equal(looksLikePartyName("SIFU LAB"), true, "still a plausible NAME…");
  assert.equal(hasRegisteredEntitySuffix("SIFU LAB"), false, "…but never a party CANDIDATE");
  // A bare suffix with no name in front of it is the ending of an identity, not one.
  assert.equal(hasRegisteredEntitySuffix("SDN BHD"), false);
});

test("A NON-ADDRESSEE PHRASE is not a party — a suffix proves a NAME, not the ADDRESSEE", () => {
  // Measured class: 11 of 11 passed candidacy. The executed defect — `Bill To:` / `SIFU LAB` /
  // `c/o AMATERUS GROUP SDN BHD` — skipped a REAL unsuffixed buyer and birthed the c/o line.
  for (const phrase of [
    "c/o AMATERUS GROUP SDN BHD", "C/O ACME SDN BHD", "care of ACME SDN BHD",
    "A subsidiary of AMATERUS GROUP SDN BHD", "A member of ACME SDN BHD",
    "Group Company: AMATERUS GROUP SDN BHD", "Managed by ACME SDN BHD",
    "Agent for ACME SDN BHD", "Formerly known as OLD NAME SDN BHD",
    "Payable to ROME SECRETARY SDN BHD", "Cheque payable to ROME SECRETARY SDN BHD",
  ]) {
    assert.equal(looksLikePartyName(phrase), false, `${phrase} — a phrase that mentions a company is not one`);
    // The rule lives in the NAME gate, so it closes BOTH polarities: demoting a party without
    // demoting a contact would merely hand every one of these to the contact read instead.
    assert.equal(looksLikePartyName(phrase) && hasRegisteredEntitySuffix(phrase), false);
  }
  // REQUIRED COUNTER-CELL: bare ` of ` mid-name is NOT a marker. These are legitimate registered
  // names and must remain candidates.
  for (const real of ["BANK OF CHINA (MALAYSIA) BERHAD", "BANK OF AMERICA MALAYSIA BERHAD",
    "UNITED OVERSEAS BANK (MALAYSIA) BHD", "CHAMBER OF COMMERCE SDN BHD",
    "INSTITUTE OF TECHNOLOGY SDN BHD"]) {
    assert.equal(looksLikePartyName(real), true, real);
    assert.equal(hasRegisteredEntitySuffix(real), true, real);
  }
});

test("`S/B` is matched on its PUNCTUATED form only — the folded `s b` swallowed a person", () => {
  // `Attn : Lim S B` folded to `lim s b`, read as an entity, so the CONTACT polarity refused the
  // person, attn_key was never set, and the reconciler REMOVED a correct customer name on
  // exactly the F7 shape. `S/B` is printed with a slash; the spaced form is a folding artefact.
  assert.equal(hasRegisteredEntitySuffix("KONG CHENG RESTAURANTS S/B"), true);
  assert.equal(hasRegisteredEntitySuffix("ACME S/B"), true);
  assert.equal(partyKey("KONG CHENG RESTAURANTS S/B"), partyKey("KONG CHENG RESTAURANTS SDN BHD"),
    "the canonicalization that dissolved the false contest still holds");
  // A PERSON written with initials is never an entity — the point of the change.
  for (const person of ["Lim S B", "Tan S.B.", "Wong K L", "Tan C K", "Lim Xiao Shan"]) {
    assert.equal(hasRegisteredEntitySuffix(person), false, person);
    assert.equal(looksLikePartyName(person), true, `${person} is still a readable contact`);
  }
  // THE RECORDED TENSION, resolved fail-closed: `S.B.` with dots is the same shape as a person's
  // initials, so a company printing it ABSTAINS rather than risk swallowing `Tan S.B.`.
  assert.equal(hasRegisteredEntitySuffix("KONG CHENG RESTAURANTS S.B."), false,
    "a false abstain leaves typed standing — zero loss; a wrong party is the forbidden outcome");
});

test("the POSSESSIVE belongs to the label — `Customer's Ref:` is not a party named `'s Ref`", () => {
  // The tokenizer cut after `Customer` and left `'s Ref: PO-8891` as the remainder, which then
  // read as a name because `'s` is not a separator and `s` is not a continuation token.
  for (const text of ["Customer's Ref: PO-8891", "Client's Ref : DO-2231",
    "Buyer's Order dated 01/09/2025", "Customer’s Ref: PO-8891"]) {
    const hit = splitBillToLabel(text);
    assert.equal(hit?.continuation, true, `${text} — possessive consumed, then the continuation guard refuses`);
    assert.ok(!/^['‘’]/.test(hit?.remainder ?? ""), `${text} — no remainder may start with an apostrophe`);
  }
  // The possessive must not eat a genuine value.
  assert.equal(splitBillToLabel("Customer's ACME SDN BHD")?.remainder, "ACME SDN BHD");
});

test("SUFFIX VARIANTS CANONICALIZE — one company, two lawful spellings, is one identity", () => {
  // The strict key made `KONG CHENG…SDN BHD` and `KONG CHENG…S/B` two identities, so the reader
  // declared a CONTEST and withdrew a correct typed name.
  assert.equal(partyKey("KONG CHENG RESTAURANTS SDN BHD"), partyKey("KONG CHENG RESTAURANTS S/B"));
  assert.equal(partyKey("ACME SDN BHD"), partyKey("ACME SDN. BHD."));
  assert.equal(partyKey("ACME SDN BHD"), partyKey("ACME Sendirian Berhad"));
  assert.equal(partyKey("ACME BHD"), partyKey("ACME BERHAD"));
  assert.equal(partyKey("ACME PLT"), partyKey("ACME plt."));
  // NEVER STRIPPED: a bare name and a suffixed name stay two entities.
  assert.notEqual(partyKey("ACME"), partyKey("ACME SDN BHD"));
  // …and the SDN BHD family never decomposes into a bare BHD (longest-variant-first is load-bearing).
  assert.notEqual(partyKey("ACME SDN BHD"), partyKey("ACME BHD"));
  // Punctuation and case still collapse, and the key stays UNICODE-AWARE.
  assert.equal(partyKey("KONG CHENG RESTAURANTS SDN. BHD."), partyKey("Kong Cheng Restaurants Sdn Bhd"));
  assert.notEqual(partyKey("鑫旺 SDN BHD"), partyKey("宏达 SDN BHD"));
  assert.equal(partyKey("鑫旺 SDN BHD"), "鑫旺 sdnbhd");
});

test("the ATTN vocabulary keeps its own word boundary", () => {
  assert.equal(splitAttnLabel("ATTNXYZ SDN BHD"), null);
  assert.equal(splitAttnLabel("Attention: Ms Tan").remainder, "Ms Tan");
  assert.equal(splitAttnLabel("Attn : Lim Xiao Shan").remainder, "Lim Xiao Shan");
  assert.equal(splitAttnLabel("Untuk Perhatian : Lim Xiao Shan").remainder, "Lim Xiao Shan");
});
