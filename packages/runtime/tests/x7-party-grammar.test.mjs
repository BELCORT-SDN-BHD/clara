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
} from "../lib/invoice-party-grammar.mjs";

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
  assert.equal(partyKey("鑫旺 SDN BHD"), "鑫旺sdnbhd");
});

test("the ATTN vocabulary keeps its own word boundary", () => {
  assert.equal(splitAttnLabel("ATTNXYZ SDN BHD"), null);
  assert.equal(splitAttnLabel("Attention: Ms Tan").remainder, "Ms Tan");
  assert.equal(splitAttnLabel("Attn : Lim Xiao Shan").remainder, "Lim Xiao Shan");
  assert.equal(splitAttnLabel("Untuk Perhatian : Lim Xiao Shan").remainder, "Lim Xiao Shan");
});
