// The currency defect fix — the READER side. Pure unit tests, no DB.
// (currency-defect design part 1 §3/§8; ADR pending — see docs/plan/currency-defect-design.md
// and -part2.md, ratified 2026-07-28.)
//
// Every pinned line below is COPIED VERBATIM from a real Azure prebuilt-invoice OCR capture,
// pulled read-only from the live `document_regions` table (`pages.N.lines.M`) for the exact
// documents the design measured. Only the specific load-bearing lines are reproduced — never a
// whole document — and the raw captures stay OUT of git, following the x2-totals-reader.test.mjs
// / x6-vendor-identity.test.mjs precedent.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { readCurrencyFromLines, mergeCurrencyIntoFields } from "../lib/invoice-currency-reader.mjs";

const line = (content, polygon) => ({ content, polygon });
const onePage = (lines, pageNumber = 1) => [{ pageNumber, lines }];

// --- real fixtures, one per named gate document -------------------------------------------

/** `39d786a0` / `JAN 2025-Invoice.pdf` — one of the 6 real Lucy-family bills Azure typed USD.
 *  This exact sentence is the only currency evidence on the page. */
const LUCY_JAN_MYR_LINE = line("Price is in MYR currency.", [3.3099, 7.7822, 4.9362, 7.797, 4.9348, 7.948, 3.3085, 7.9332]);
/** The remaining 5 Lucy-family / MEDICAL documents CG9 requires cleared, same declaration. */
const LUCY_1550_MYR_LINE = line("Price is in MYR currency.", [3.3103, 7.7823, 4.9361, 7.7971, 4.9347, 7.9478, 3.3089, 7.9329]);
const LUCY_MAR_MYR_LINE = line("Price is in MYR currency.", [3.3098, 7.782, 4.9361, 7.7967, 4.9347, 7.9482, 3.3084, 7.9335]);
const LUCY_1130_MYR_LINE = line("Price is in MYR currency.", [3.3109, 7.7825, 4.9362, 7.7977, 4.9348, 7.9477, 3.3101, 7.9325]);
const LUCY_FEB_MYR_LINE = line("Price is in MYR currency.", [3.3101, 7.7823, 4.936, 7.797, 4.9346, 7.948, 3.3087, 7.9333]);
const LUCY_3090_MYR_LINE = line("Price is in MYR currency.", [3.3113, 7.7827, 4.9362, 7.7979, 4.9348, 7.9481, 3.3101, 7.9329]);
/** `f3245804` / `MEDICAL - RM526.00 - 20042024.pdf` — typed EUR; bare `RM` symbol on the face. */
const MEDICAL_RM_LINE = line("RM", [10.4722, 26.7064, 11.5355, 26.7158, 11.5285, 27.5055, 10.4652, 27.4961]);

/** `616388d4` / EZSEC-IV-00721 — the EZSEC family's ONLY currency evidence: no `RM` token
 *  anywhere on the page (part 1 §2), the amount-in-words declaration instead. */
const EZSEC_RINGGIT_LINE = line(
  "RINGGIT MALAYSIA : ONE THOUSAND AND SEVEN HUNDRED ONLY",
  [0.3222, 8.171, 4.1293, 8.1692, 4.1293, 8.3159, 0.3223, 8.3178],
);

/** `0cb7c1f1` / `openai-0008.pdf` — a GENUINE USD invoice printing an MYR convenience
 *  conversion in parentheses (part 1 §6.1, the case the `ambiguous` rule exists for). */
const OPENAI_USD_DUE_LINE = line("$21.60 USD due November 30, 2025", [0.4119, 3.4179, 3.719, 3.4224, 3.7188, 3.6166, 0.4117, 3.6121]);
const OPENAI_RM_CONVERSION_LINE = line("(RM6.61)", [7.5615, 5.8031, 8.08, 5.8024, 8.0802, 5.9393, 7.5617, 5.9401]);
const OPENAI_USD_TOTAL_LINE = line("$21.60 USD", [7.3721, 6.2002, 8.0865, 6.1993, 8.0866, 6.3301, 7.3722, 6.331]);

/** `94a0fd0d` / BUSYSTREET Cost of Good Sold Invoice — the CG4 trap, measured as a real
 *  false-positive hit in the design's own first measurement pass (part 1 §6.4). */
const BUSYSTREET_AUDIT_LINE = line("- Risk Management/Internal Audit", [2.0055, 4.8962, 3.8863, 4.8904, 3.8865, 5.0319, 2.0059, 5.0361]);
const BUSYSTREET_RINGGIT_LINE = line(
  "RINGGIT MALAYSIA : TWENTY NINE THOUSAND AND TWO HUNDRED ONLY",
  [0.5196, 8.0556, 4.8211, 8.0562, 4.8211, 8.2012, 0.5196, 8.2006],
);
const BUSYSTREET_TOTAL_RM_LINE = line("Total (RM)", [5.9665, 8.0811, 6.6476, 8.0846, 6.6469, 8.2359, 5.9657, 8.2324]);

// ======================================================================================
// CG1 / CG9 — the 7 real currency-defect-affected documents each read `myr`
// ======================================================================================

test("CG1 / CG9 — the 39d786a0 Lucy-family MYR declaration reads myr", () => {
  const { fields, receipt } = readCurrencyFromLines(onePage([LUCY_JAN_MYR_LINE]));
  assert.equal(receipt.verdict, "myr");
  assert.equal(fields.length, 1);
  assert.equal(fields[0].field_path, "invoice.currency");
  assert.equal(fields[0].value_raw, "MYR");
  assert.equal(fields[0].page, 1);
  assert.deepEqual(fields[0].polygon, [3.3099, 7.7822, 4.9362, 7.797, 4.9348, 7.948, 3.3085, 7.9332], "the citation carries the REAL matched line's own polygon");
  assert.equal(fields[0].confidence, null, "Azure returns no confidence on pages[].lines[]");
  assert.deepEqual(receipt.myr_tokens, ["MYR"]);
  assert.equal(receipt.foreign_hits, 0);
});

test("CG9 — the reader alone reads myr on every one of the 7 real affected documents", () => {
  const perDocument = [
    ["434a6cf1 (Lucy RM1550)", LUCY_1550_MYR_LINE],
    ["4406fd56 (Lucy MAR)", LUCY_MAR_MYR_LINE],
    ["75b54473 (Lucy RM1130)", LUCY_1130_MYR_LINE],
    ["882fc179 (Lucy FEB)", LUCY_FEB_MYR_LINE],
    ["93fb8243 (Lucy RM3090)", LUCY_3090_MYR_LINE],
    ["f3245804 (MEDICAL, EUR-mistyped)", MEDICAL_RM_LINE],
  ];
  for (const [label, fixture] of perDocument) {
    const { fields, receipt } = readCurrencyFromLines(onePage([fixture]));
    assert.equal(receipt.verdict, "myr", `${label} must read myr`);
    assert.equal(fields[0]?.value_raw, "MYR", label);
  }
});

// ======================================================================================
// CG2 — EZSEC: RINGGIT-no-RM
// ======================================================================================

test("CG2 — the EZSEC RINGGIT declaration reads myr with NO `RM` token counted", () => {
  const { fields, receipt } = readCurrencyFromLines(onePage([EZSEC_RINGGIT_LINE]));
  assert.equal(receipt.verdict, "myr");
  assert.deepEqual(receipt.myr_tokens, ["RINGGIT"], "the EZSEC family carries no RM token anywhere (part 1 §2)");
  assert.equal(fields[0].value_raw, "MYR");
  assert.equal(fields[0].page, 1);
  assert.deepEqual(fields[0].polygon, [0.3222, 8.171, 4.1293, 8.1692, 4.1293, 8.3159, 0.3223, 8.3178]);
});

// ======================================================================================
// CG3 — openai-0008: RM conversion + its own USD token -> ambiguous, reader silent
// ======================================================================================

test("CG3 — openai-0008's RM conversion alongside its own USD reads ambiguous, not myr", () => {
  const { fields, receipt } = readCurrencyFromLines(onePage([OPENAI_USD_DUE_LINE, OPENAI_RM_CONVERSION_LINE, OPENAI_USD_TOTAL_LINE]));
  assert.equal(receipt.verdict, "ambiguous");
  assert.equal(fields.length, 0, "an ambiguous verdict emits NOTHING — the reader has not earned the right to contradict anyone");
  assert.deepEqual(receipt.myr_tokens, ["RM"]);
  assert.deepEqual(receipt.foreign_tokens, ["USD"]);
  assert.equal(receipt.myr_hits, 1);
  assert.equal(receipt.foreign_hits, 2);
});

// ======================================================================================
// CG4 — the AUD-inside-Audit trap (word-boundary discipline)
// ======================================================================================

test("CG4 — `AUD` inside `Internal Audit` does not trip the foreign vocabulary", () => {
  // Fed ALONE (no other vocabulary on the line/page): if the boundary rule failed, this would
  // read `foreign`. It must read `absent` instead — proof that AUD was never counted.
  const { fields, receipt } = readCurrencyFromLines(onePage([BUSYSTREET_AUDIT_LINE]));
  assert.equal(receipt.verdict, "absent");
  assert.equal(receipt.foreign_hits, 0, "AUD embedded in Audit must not be counted as a foreign hit");
  assert.equal(fields.length, 0);
});

test("CG4 — on the real BUSYSTREET page, the Audit line coexists with real MYR evidence and the verdict is still myr", () => {
  const { fields, receipt } = readCurrencyFromLines(onePage([BUSYSTREET_AUDIT_LINE, BUSYSTREET_RINGGIT_LINE, BUSYSTREET_TOTAL_RM_LINE]));
  assert.equal(receipt.verdict, "myr");
  assert.equal(receipt.foreign_hits, 0);
  assert.deepEqual(receipt.myr_tokens.sort(), ["RINGGIT", "RM"]);
  assert.equal(fields[0].value_raw, "MYR");
  // The FIRST myr hit in document order is cited — BUSYSTREET_AUDIT_LINE is not an MYR hit, so
  // the citation is the RINGGIT declaration (the first of the two real MYR lines fed here).
  assert.deepEqual(fields[0].polygon, [0.5196, 8.0556, 4.8211, 8.0562, 4.8211, 8.2012, 0.5196, 8.2006]);
});

// ======================================================================================
// The four verdicts, and the boundary rule in general (not just the one measured trap)
// ======================================================================================

test("the reader abstains — absent — when neither vocabulary appears anywhere", () => {
  const { fields, receipt } = readCurrencyFromLines(onePage([line("Thank you for your business !", [0, 0, 1, 0, 1, 1, 0, 1])]));
  assert.equal(receipt.verdict, "absent");
  assert.equal(fields.length, 0);
});

test("the reader abstains — foreign — when only a foreign token appears, no MYR evidence at all", () => {
  const { fields, receipt } = readCurrencyFromLines(onePage([line("Total: $100.00 USD", [0, 0, 1, 0, 1, 1, 0, 1])]));
  assert.equal(receipt.verdict, "foreign");
  assert.equal(fields.length, 0, "foreign is a non-reading — never emitted, only counted");
  assert.deepEqual(receipt.foreign_tokens, ["USD"]);
});

test("a bare document (no pages, no lines) reads absent, not a crash", () => {
  assert.equal(readCurrencyFromLines(null).receipt.verdict, "absent");
  assert.equal(readCurrencyFromLines([]).receipt.verdict, "absent");
  assert.equal(readCurrencyFromLines([{ pageNumber: 1, lines: [] }]).receipt.verdict, "absent");
});

test("RM directly abutting its amount (the canonical Malaysian print form) is read — this is NOT `\\bRM\\b`", () => {
  // `\bRM\b` treats a digit as a word character, so it would refuse `RM1,700.00` outright — the
  // exact shape a Malaysian totals column prints with no space between symbol and figure.
  const { receipt } = readCurrencyFromLines(onePage([line("RM1,700.00", [0, 0, 1, 0, 1, 1, 0, 1])]));
  assert.equal(receipt.verdict, "myr");
  assert.deepEqual(receipt.myr_tokens, ["RM"]);
});

test("RM/AUD-shaped substrings inside ordinary English words are refused, not just the one measured trap", () => {
  for (const word of ["FARM", "FIRM", "FORM", "CONFIRM", "TERMINAL", "PERFORM", "AUDIT", "AUDITOR", "AUDIBLE"]) {
    const { receipt } = readCurrencyFromLines(onePage([line(`This document mentions ${word} in passing.`, [0, 0, 1, 0, 1, 1, 0, 1])]));
    assert.equal(receipt.verdict, "absent", `${word} must not be read as a currency token`);
  }
});

test("P1 — CONDITIONAL exclusions: on the REAL EZSEC/BUSYSTREET/MEDICAL boilerplate, BHD and ALL never fire even amount-adjacency-gated", () => {
  // BHD (Bahraini Dinar) is a substring of "SDN BHD" — universal on Malaysian letterheads. ALL
  // (Albanian Lek) is the common English word "all". Both are TIER 2 (amount-adjacency-gated,
  // not dropped outright — see P1/the module header) and every REAL occurrence measured in the
  // corpus is proven here to stay excluded: none sits directly next to a digit.
  for (const text of [
    'EZACCOUNT & SECRETARY SDN BHD (202301030264 (1524187-D))', // EZSEC letterhead + signature
    'CNT BEAUTY & AESTHETIC SDN. BHD. 1292628-P', // MEDICAL — a full stop AND a space separate BHD from the digits
    'CNT BEAUTY & AESTHETIC SDN BHD', // MEDICAL — end of line, nothing follows
    'BUSYSTREET CONSULTANCY SDN BHD', // BUSYSTREET
  ]) {
    assert.equal(readCurrencyFromLines(onePage([line(text, [0, 0, 1, 0, 1, 1, 0, 1])])).receipt.verdict, "absent", text);
  }
  for (const text of [
    "All cheques should be crossed and made payable to", // EZSEC
    "1. All cheques should be crossed and made payable to", // BUSYSTREET — the "1." prefix is not digit-adjacent to ALL either
  ]) {
    assert.equal(readCurrencyFromLines(onePage([line(text, [0, 0, 1, 0, 1, 1, 0, 1])])).receipt.verdict, "absent", text);
  }
});

test("P1 — CG2/CG4 regression wall: the real EZSEC/BUSYSTREET fixtures still read myr after the amount-adjacency gate", () => {
  // The exact regression Codex named: this change must not flip CG2 or CG4. Re-run both through
  // the reader directly (the dedicated CG2/CG4 cells above already cover this; this cell pins
  // the SAME real lines specifically against the conditional-token change).
  assert.equal(readCurrencyFromLines(onePage([EZSEC_RINGGIT_LINE])).receipt.verdict, "myr");
  assert.equal(readCurrencyFromLines(onePage([BUSYSTREET_AUDIT_LINE, BUSYSTREET_RINGGIT_LINE, BUSYSTREET_TOTAL_RM_LINE])).receipt.verdict, "myr");
});

test("P1 — an excluded code DOES count as foreign when genuinely amount-adjacent (closes the counterexample class)", () => {
  const bhd = readCurrencyFromLines(onePage([line("BHD 100 (RM330)", [0, 0, 1, 0, 1, 1, 0, 1])]));
  assert.equal(bhd.receipt.verdict, "ambiguous", "a genuinely Bahraini-denominated line must not be invisible to the foreign side");
  assert.deepEqual(bhd.receipt.foreign_tokens, ["BHD"]);
  // Reversed order and no space also count — the amount marker shape, not a fixed template.
  const bhdCompact = readCurrencyFromLines(onePage([line("BHD100.00", [0, 0, 1, 0, 1, 1, 0, 1])]));
  assert.equal(bhdCompact.receipt.verdict, "foreign");
  const amountFirst = readCurrencyFromLines(onePage([line("100.00 BHD due", [0, 0, 1, 0, 1, 1, 0, 1])]));
  assert.equal(amountFirst.receipt.verdict, "foreign");
});

test("P1 — the design's own §6.2 symbol form: S$ alongside RM reads ambiguous, not myr", () => {
  const { fields, receipt } = readCurrencyFromLines(onePage([line("S$100 (RM330)", [0, 0, 1, 0, 1, 1, 0, 1])]));
  assert.equal(receipt.verdict, "ambiguous");
  assert.equal(fields.length, 0);
  assert.deepEqual(receipt.foreign_tokens, ["S$"]);
});

test("P1 — bare-numeral Singapore invoice (design part 1 §6.2): S$/SGD alone reads foreign, refused", () => {
  for (const text of ["S$50.00 due", "Amount: SGD 50.00"]) {
    const { fields, receipt } = readCurrencyFromLines(onePage([line(text, [0, 0, 1, 0, 1, 1, 0, 1])]));
    assert.equal(receipt.verdict, "foreign", text);
    assert.equal(fields.length, 0, text);
  }
});

test("P1 — other symbol forms Malaysia never prints (US$, HK$, bare $, €, £, ¥) are foreign, unconditionally", () => {
  for (const text of ["US$21.60 due", "HK$500.00", "Total: $21.60", "€50.00", "£40.00", "¥1000"]) {
    assert.equal(readCurrencyFromLines(onePage([line(text, [0, 0, 1, 0, 1, 1, 0, 1])])).receipt.verdict, "foreign", text);
  }
});

test("document-scope: a hit on page 2 counts exactly as one on page 1", () => {
  const { fields, receipt } = readCurrencyFromLines([
    { pageNumber: 1, lines: [line("Invoice", [0, 0, 1, 0, 1, 1, 0, 1])] },
    { pageNumber: 2, lines: [MEDICAL_RM_LINE] },
  ]);
  assert.equal(receipt.verdict, "myr");
  assert.equal(fields[0].page, 2, "the citation is on the page the hit actually occurred");
});

test("the FIRST myr-vocabulary line in document order is cited, not the last", () => {
  const first = line("RM100.00", [1, 1, 2, 1, 2, 2, 1, 2]);
  const second = line("Price is in MYR currency.", [3.3099, 7.7822, 4.9362, 7.797, 4.9348, 7.948, 3.3085, 7.9332]);
  const { fields } = readCurrencyFromLines(onePage([first, second]));
  assert.deepEqual(fields[0].polygon, [1, 1, 2, 1, 2, 2, 1, 2], "the first hit wins the citation");
});

test("a matched line with no usable polygon cites an honest empty region, never a fabricated one", () => {
  const { fields } = readCurrencyFromLines(onePage([line("Price is in MYR currency.", [])]));
  assert.deepEqual(fields[0].polygon, []);
  const noPolygonAtAll = readCurrencyFromLines(onePage([{ content: "Price is in MYR currency." }]));
  assert.deepEqual(noPolygonAtAll.fields[0].polygon, []);
});

// ======================================================================================
// mergeCurrencyIntoFields — the THREE-outcome merge law, unit-level (P2: a deliberate,
// documented delta from the X2 totals law — see the module header for why hole-filling is
// unsafe for currency specifically: it is a corroboration WALL input, so a reader-only
// emission could FLIP a document into `corroborated` that never had two independent sources,
// violating the design's part 1 §4 claim that this fix can only ever REMOVE a document from
// the corroborated set, never add one).
// ======================================================================================

/** A real `myr`-verdict reader result — the shape `mergeCurrencyIntoFields` reconciles. */
const myrReading = () => readCurrencyFromLines(onePage([LUCY_JAN_MYR_LINE]));

test("merge: typed row ABSENT -> NOTHING is emitted, ever (no reader-only emission)", () => {
  const out = [];
  const currency = myrReading();
  mergeCurrencyIntoFields(out, currency);
  assert.equal(out.length, 0, "an absent typed currency stays absent — the reader never asserts on its own authority");
  assert.equal(currency.receipt.typed_collapsed, 0);
  assert.equal(currency.receipt.typed_disagreement, 0);
});

test("merge: typed row present but BLANK -> still nothing is emitted (blank stays blank)", () => {
  const out = [{ field_path: "invoice.currency", value_raw: "   " }];
  const currency = myrReading();
  mergeCurrencyIntoFields(out, currency);
  assert.equal(out.length, 1, "the blank row itself is untouched — not removed, not filled");
  assert.equal(out[0].value_raw, "   ");
  assert.equal(currency.receipt.typed_collapsed, 0);
  assert.equal(currency.receipt.typed_disagreement, 0);
});

test("P2 regression — a RINGGIT page with NO typed currency at all: still nothing emitted, the document cannot corroborate on currency alone", () => {
  // The exact counterexample class this fix must never open: real net/tax agreement plus a
  // reader-only MYR currency reading would flip `corroborated` for a document that never had
  // two independent sources on ITS currency. `v_currency` must stay '' (coalesced), never 'MYR'.
  const out = [{ field_path: "invoice.total_excl_tax", value_raw: "1,700.00" }, { field_path: "invoice.tax_total", value_raw: "0.00" }];
  const currency = readCurrencyFromLines(onePage([EZSEC_RINGGIT_LINE]));
  assert.equal(currency.receipt.verdict, "myr", "the reader DOES read myr here — the wall is in the merge, not the reader");
  mergeCurrencyIntoFields(out, currency);
  assert.equal(out.find((f) => f.field_path === "invoice.currency"), undefined, "no invoice.currency region is ever created out of the reader's authority alone");
  assert.equal(out.length, 2, "the unrelated totals fields are untouched");
});

test("merge: typed MYR AGREES -> the typed row is KEPT verbatim, typed_collapsed stamped", () => {
  const typedRow = { field_path: "invoice.currency", value_raw: "MYR", page: 9, polygon: [9], confidence: 0.5 };
  const out = [typedRow];
  const currency = myrReading();
  mergeCurrencyIntoFields(out, currency);
  assert.equal(out.length, 1);
  assert.equal(out[0], typedRow, "the TYPED object is kept unchanged — Azure's own region/confidence survive");
  assert.equal(currency.receipt.typed_collapsed, 1);
  assert.equal(currency.receipt.typed_disagreement, 0);
  assert.equal(currency.receipt.fields["invoice.currency"].outcome, "typed_collapsed");
  assert.equal(currency.receipt.fields["invoice.currency"].typed_value_raw, "MYR");
});

test("merge: typed USD DISAGREES -> emits NEITHER (both rows withdrawn)", () => {
  const out = [{ field_path: "invoice.currency", value_raw: "USD", page: 1, polygon: [], confidence: 0.9 }];
  const currency = myrReading();
  mergeCurrencyIntoFields(out, currency);
  assert.equal(out.length, 0, "the false USD row dies here — and the reader's row never lands beside it");
  assert.equal(currency.receipt.typed_disagreement, 1);
  assert.equal(currency.receipt.fields["invoice.currency"].outcome, "typed_disagreement");
  assert.equal(currency.receipt.fields["invoice.currency"].typed_value_raw, "USD");
});

test("merge: the reader ABSTAINS (ambiguous/absent/foreign) -> the typed row stands untouched (v5 semantics)", () => {
  for (const verdict of ["ambiguous", "absent", "foreign"]) {
    const typedRow = { field_path: "invoice.currency", value_raw: "USD", page: 1, polygon: [], confidence: 0.9 };
    const out = [typedRow];
    const currency = { fields: [], receipt: { ...readCurrencyFromLines([]).receipt, verdict, typed_disagreement: 0, typed_collapsed: 0 } };
    mergeCurrencyIntoFields(out, currency);
    assert.equal(out.length, 1, `verdict=${verdict} must leave the typed row standing`);
    assert.equal(out[0], typedRow);
    assert.equal(currency.receipt.typed_disagreement, 0);
    assert.equal(currency.receipt.typed_collapsed, 0);
  }
  // No typed row at all, reader abstains: absolutely nothing is emitted.
  const out2 = [];
  mergeCurrencyIntoFields(out2, { fields: [], receipt: readCurrencyFromLines([]).receipt });
  assert.equal(out2.length, 0);
});
