// X7 — the MAPPER side: THE RECONCILIATION MATRIX. Who wins when the deterministic reader and
// Azure's typed `CustomerName` disagree, driven through `normalizeAzureInvoice`. Pure unit tests.
//
// This is the judgement half of the fix, so every branch of the matrix in
// `mergeCustomerIdentity`'s header gets its own cell, INCLUDING the two branches that emit
// nothing. Each cell exists because of a real consequence, not a style preference:
//   * two rows for one text field_path forfeit the WHOLE extraction (persist_invoice_facts,
//     0026:810-819) — which would destroy the working `invoice.total` capture along with the
//     customer name, so "never two rows" is pinned everywhere it could go wrong;
//   * a WRONG customer_name births a wrong counterparty on real client books at approval;
//   * a MISSING customer_name merely holds the document for a human, which is the safe failure.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureInvoice, NORMALIZATION_VERSION } from "../workflows/invoiceFacts.v1.azure.mjs";
import {
  ADDRESS_CITY, ADDRESS_STREET, ATTN_PERSON, BILL_TO_LABEL, KONG_CHENG, KONG_CHENG_BLOCK,
  TYPED_TOTAL, TYPED_VENDOR_NAME, box, contactOf, customerOf, line, page, payloadWith,
  typedCustomerName,
} from "./x7-customer-testkit.mjs";

const receiptOf = (out) => out.envelope.customer_identity;
const rowsFor = (out, fieldPath) => out.fields.filter((f) => f.field_path === fieldPath);

// ======================================================================================
// THE F7 DEFECT, END TO END — the branch this whole fix exists for
// ======================================================================================

test("F7: the typed CustomerName is the Attn PERSON — the boxed party overrides it", () => {
  // Both real KONG CHENG invoices (wave-7a-acceptance-h1.md rows 1 and 12) extracted
  // `customer_name` = "Lim Xiao Shan" and both drafts are still held `counterparty_unresolved`.
  const out = normalizeAzureInvoice(payloadWith({ CustomerName: typedCustomerName() }, KONG_CHENG_BLOCK));
  assert.equal(customerOf(out).value_raw, "KONG CHENG RESTAURANTS SDN BHD", "the party in the box, not the person addressed");
  assert.equal(contactOf(out).value_raw, "Lim Xiao Shan", "the person is not lost — she becomes the CONTACT");
  assert.equal(rowsFor(out, "invoice.customer_name").length, 1, "never two rows for one field_path");
  assert.equal(rowsFor(out, "invoice.contact_person").length, 1);
  assert.equal(receiptOf(out).typed_overridden_attn, 1);
  assert.equal(receiptOf(out).contact_emitted, 1);
  assert.equal(receiptOf(out).outcome, "attn_overridden");
  // The overriding row carries the PARTY LINE's own geometry, not Azure's Attn-line region.
  assert.deepEqual(customerOf(out).polygon, KONG_CHENG.polygon);
  // The rest of the extraction is untouched — one corrected field never costs the document.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "2,800.00");
  assert.equal(out.fields.find((f) => f.field_path === "invoice.currency").value_raw, "MYR");
});

test("F7's override is the ONLY licence to overrule Azure: it needs the reader's OWN Attn read", () => {
  // If the Attn line cannot be read (here: two different named contacts, so the contact read
  // refuses), the disagreement is no longer EXPLAINED and the override branch is unreachable —
  // the document falls to the contested-identity branch instead of guessing.
  const second = line("Attn : Tan Wei Ming", box(0.72, 3.10, 2.20, 3.24));
  const out = normalizeAzureInvoice(
    payloadWith({ CustomerName: typedCustomerName() }, [...KONG_CHENG_BLOCK, second]),
  );
  assert.equal(customerOf(out), undefined, "unexplained, so contested, so neither");
  assert.equal(contactOf(out), undefined);
  assert.equal(receiptOf(out).typed_overridden_attn, 0);
  assert.equal(receiptOf(out).typed_disagreement, 1);
});

// ======================================================================================
// THE REST OF THE MATRIX
// ======================================================================================

test("reader ABSENT: the typed value passes through byte-identically — the pre-X7 behaviour", () => {
  // A document with no bill-to label at all. This is the majority shape and it must be a PURE
  // widening: the same row, the same region, the same confidence Azure gave it.
  const out = normalizeAzureInvoice(
    payloadWith({ CustomerName: typedCustomerName("D&D DEVELOPMENT SDN BHD", 0.93) }, [ADDRESS_STREET, ADDRESS_CITY]),
  );
  const row = customerOf(out);
  assert.equal(row.value_raw, "D&D DEVELOPMENT SDN BHD");
  assert.equal(row.confidence, 0.93, "Azure's own score survives — the reader had nothing to say");
  assert.deepEqual(row.polygon, box(1.10, 2.90, 2.20, 3.04), "Azure's own region, untouched");
  assert.equal(contactOf(out), undefined, "no Attn line, no contact fabricated");
  assert.equal(receiptOf(out).outcome, "absent");
  assert.equal(receiptOf(out).typed_disagreement, 0);
});

test("reader AGREES: one row survives and it is the TYPED one (it carries Azure's region)", () => {
  const out = normalizeAzureInvoice(
    payloadWith({ CustomerName: typedCustomerName("KONG CHENG RESTAURANTS SDN. BHD.", 0.88) }, KONG_CHENG_BLOCK),
  );
  const rows = rowsFor(out, "invoice.customer_name");
  assert.equal(rows.length, 1, "duplicate distinct facts forfeit the extraction — never emit two");
  assert.equal(rows[0].value_raw, "KONG CHENG RESTAURANTS SDN. BHD.", "the TYPED row survives verbatim");
  assert.equal(rows[0].confidence, 0.88);
  assert.equal(receiptOf(out).typed_collapsed, 1);
  assert.equal(receiptOf(out).typed_overridden_attn, 0);
  assert.equal(receiptOf(out).typed_disagreement, 0);
  // Agreement is compared the DB's way — on the identity key, so punctuation is not a contest.
  assert.equal(contactOf(out).value_raw, "Lim Xiao Shan", "the contact is emitted either way");
});

test("CONTESTED landscape: the typed row is WITHDRAWN — a coin toss that already landed is not evidence", () => {
  // OVERRULE 2. The first cut left the typed row standing on ≥2 distinct labelled parties, on the
  // reasoning that ambiguity is "no assertion". It is one: the reader positively measured that
  // the document's buyer is not settled. The executed counterexample that ended the argument —
  // `Bill To: WRONG HOLDING` + `Bill To: ACTUAL SUBSIDIARY` with typed `WRONG HOLDING` persisted
  // the WRONG identity while cheerfully recording the contest in its receipt.
  const wrong = line("Bill To: WRONG HOLDING SDN BHD", box(0.72, 2.15, 3.60, 2.29));
  const actual = line("Bill To: ACTUAL SUBSIDIARY SDN BHD", box(0.72, 2.32, 3.90, 2.46));
  const out = normalizeAzureInvoice(
    payloadWith({ CustomerName: typedCustomerName("WRONG HOLDING SDN BHD") }, [wrong, actual]),
  );
  assert.equal(customerOf(out), undefined, "neither labelled party, and not the typed one either");
  assert.equal(receiptOf(out).outcome, "contested");
  assert.equal(receiptOf(out).typed_vs_contested, 1);
  assert.equal(receiptOf(out).typed_collapsed, 0);
  // The rest of the extraction is untouched — one contested field never costs the document.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "2,800.00");
});

test("typed EMPTY but regioned: the reader REFUSES to author — it is a check layer, not a source", () => {
  // OVERRULE 1, and the single most important cell in this file. Both review lanes broke the old
  // "empty typed → reader supplies" arm by executing it: with an empty-but-regioned CustomerName
  // the reader emitted a line item, a contact person, a caption (`Name:`) and a street address as
  // the customer of record — each a WRONG identity manufactured where pass-through had supplied
  // none. Sole authorship is DELETED, not patched.
  const out = normalizeAzureInvoice(payloadWith({ CustomerName: typedCustomerName("", 0.3) }, KONG_CHENG_BLOCK));
  const rows = rowsFor(out, "invoice.customer_name");
  assert.equal(rows.length, 1, "the typed row is left exactly as Azure produced it");
  assert.equal(rows[0].value_raw, "", "…empty, so the document stays customer_name_missing for a human");
  assert.equal(receiptOf(out).sole_authorship_refused, 1);
  assert.equal(receiptOf(out).outcome, "sole_authorship_refused");
  assert.equal(receiptOf(out).typed_overridden_attn, 0);
  // The CONTACT is still emitted — it has no typed counterpart, so it authors nothing.
  assert.equal(contactOf(out).value_raw, "Lim Xiao Shan");
});

test("the four shapes that reached customer_name through an EMPTY typed field are all dead", () => {
  // Every one of these was an executed review probe that manufactured a wrong identity.
  const attnLabel = line("Attention:", box(0.72, 2.25, 1.60, 2.39));
  const person = line("Lim Xiao Shan", box(0.72, 2.40, 2.20, 2.54));
  for (const [name, lines] of [
    ["a LINE ITEM", [BILL_TO_LABEL, line("To supply and install air-conditioning system", box(0.72, 2.30, 4.60, 2.45))]],
    ["a split-Attn CONTACT", [BILL_TO_LABEL, attnLabel, person]],
    ["a CAPTION", [BILL_TO_LABEL, line("Name:", box(0.72, 2.30, 1.40, 2.45))]],
    ["an ADDRESS", [BILL_TO_LABEL, line("12, Main Road", box(0.72, 2.30, 2.40, 2.45))]],
    ["a SPACED contact label", [BILL_TO_LABEL, line("A T T N : Lim Xiao Shan", box(0.72, 2.30, 3.00, 2.45))]],
  ]) {
    const out = normalizeAzureInvoice(payloadWith({ CustomerName: typedCustomerName("", 0.2) }, lines));
    assert.equal(customerOf(out).value_raw, "", `${name} must never become the customer`);
    assert.equal(rowsFor(out, "invoice.customer_name").length, 1);
  }
});

test("UNEXPLAINED disagreement: EMIT NEITHER — a contested buyer resolves nothing on its own authority", () => {
  // Two readers, two different buyers, and nothing on the page explains the difference. The
  // document falls to `customer_name_missing`, where a human reads the actual page — the same
  // answer X6 gives a contested vendor registration, and the safe failure by construction.
  const out = normalizeAzureInvoice(
    payloadWith({ CustomerName: typedCustomerName("AMATERUS GROUP SDN BHD") }, KONG_CHENG_BLOCK),
  );
  assert.equal(customerOf(out), undefined, "neither reading wins a contest");
  assert.equal(receiptOf(out).typed_disagreement, 1);
  assert.equal(receiptOf(out).outcome, "typed_disagreement");
  // The CONTACT still stands: who the invoice is addressed to is not what the two readers
  // disagreed about, and it is exactly the fact a human needs to settle the contest.
  assert.equal(contactOf(out).value_raw, "Lim Xiao Shan");
  // The rest of the extraction is untouched.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "2,800.00");
});

test("NO typed CustomerName at all: the reader stays silent — attribution has no anchor", () => {
  // A recorded LIMIT, not an oversight: attribution anchors on the typed CustomerName region, so
  // a document Azure typed no customer on (acceptance-h1 row 10, FINCARE, held
  // `customer_name_missing`) is NOT fixed by F7. Relaxing the anchor to "far from the vendor"
  // would be absence-as-evidence, which review law 2 forbids.
  const out = normalizeAzureInvoice(payloadWith({}, KONG_CHENG_BLOCK));
  assert.equal(customerOf(out), undefined, "no anchor, no emission — fail closed");
  assert.equal(contactOf(out), undefined);
  assert.equal(receiptOf(out).no_customer_anchor, 1);
  assert.equal(receiptOf(out).attn_unattributed, 1);
});

// ======================================================================================
// ZERO REGRESSION — the reader must be a pure widening everywhere it is not the fix
// ======================================================================================

test("R6-A end-to-end: a compatibility glyph can no longer corrupt customer_name", () => {
  // THE SPLIT-LINE PATH is where this bit: the value line's own text becomes `value_raw`
  // VERBATIM, so a glyph that merely NFKC-folded into the allowed class survived into the
  // emitted name. Measured: `Bill To:` / `ACME︰SDN BHD` produced
  // `customer_name = "ACME︰SDN BHD"` — a corrupted counterparty, not merely a wrong one.
  for (const v of ["ACME︰SDN BHD", "︰ ACME SDN BHD", "ACME‥SDN BHD", "ACME﹐SDN BHD", "ACME﹒SDN BHD"]) {
    const out = normalizeAzureInvoice(payloadWith({ CustomerName: typedCustomerName() },
      [BILL_TO_LABEL, line(v, box(0.72, 2.30, 3.60, 2.45)), ATTN_PERSON]));
    assert.equal(customerOf(out).value_raw, "Lim Xiao Shan", `${JSON.stringify(v)} must not be emitted`);
    assert.notEqual(receiptOf(out).outcome, "attn_overridden");
  }
  // The SAME-LINE form is unaffected and still correct — there the glyph is a label separator,
  // consumed by the label cut, and the clean company name is what gets read.
  const sameLine = normalizeAzureInvoice(payloadWith({ CustomerName: typedCustomerName() },
    [line("Bill To︰ ACME SDN BHD", box(0.72, 2.30, 4.20, 2.45)), ATTN_PERSON]));
  assert.equal(sameLine.fields.find((f) => f.field_path === "invoice.customer_name").value_raw, "ACME SDN BHD",
    "a glyph-separated LABEL still reads, and reads clean");
});

test("NORMALIZATION_VERSION is bumped to v10 — v9 and v10 fact sets must stay distinguishable", () => {
  // The version is hashed with the raw response, so a re-extraction is a genuinely new fact set
  // rather than a silent supersede. On the F7 shape the SAME document now yields a DIFFERENT
  // customer_name and one extra fact, which is the strongest possible reason to bump.
  assert.equal(NORMALIZATION_VERSION, "clara-invoice-norm:v10");
  const out = normalizeAzureInvoice(payloadWith({ CustomerName: typedCustomerName() }, KONG_CHENG_BLOCK));
  assert.equal(out.normalizationVersion, "clara-invoice-norm:v10");
});

test("a legacy payload with NO pages[].lines[] is a pure widening of v9", () => {
  // Every pre-X7 fixture and every non-layout engine result has this shape.
  const legacy = {
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: {
        InvoiceTotal: TYPED_TOTAL,
        VendorName: TYPED_VENDOR_NAME,
        CustomerName: { content: "DD ELITE HOME SDN BHD", confidence: 0.9 },
      } }],
      pages: [{ pageNumber: 1 }],
    },
  };
  const out = normalizeAzureInvoice(legacy);
  assert.equal(customerOf(out).value_raw, "DD ELITE HOME SDN BHD", "the typed emit is untouched");
  assert.equal(customerOf(out).confidence, 0.9);
  assert.equal(contactOf(out), undefined);
  const receipt = receiptOf(out);
  assert.equal(receipt.outcome, "absent");
  assert.equal(receipt.sole_authorship_refused, 0);
  assert.equal(receipt.contact_emitted, 0);
  assert.equal(receipt.typed_collapsed, 0);
  assert.deepEqual(receipt.candidates, []);
});

test("a MULTI-DOCUMENT bundle runs no customer reader at all", () => {
  // Typed fields come from documents[0] while pages span the whole scan, so document B's bill-to
  // box would be filed as document A's buyer — a WRONG party, the exact hazard.
  const out = normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [
        { fields: { InvoiceTotal: TYPED_TOTAL, CustomerName: typedCustomerName() } },
        { fields: { InvoiceTotal: TYPED_TOTAL } },
      ],
      pages: [page([], 1), page(KONG_CHENG_BLOCK, 2)],
    },
  });
  assert.equal(customerOf(out).value_raw, "Lim Xiao Shan", "wrong, but not overridden by another document's box");
  assert.equal(contactOf(out), undefined);
  assert.equal(receiptOf(out).outcome, "multi_document");
  assert.equal(receiptOf(out).sole_authorship_refused, 0);
  assert.equal(receiptOf(out).contact_emitted, 0);
});

test("the reader never touches the corroboration-ineligibility envelope, and rides beside X2/X6", () => {
  const out = normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ docType: "invoice.creditNote", fields: { InvoiceTotal: TYPED_TOTAL, CustomerName: typedCustomerName() } }],
      pages: [page(KONG_CHENG_BLOCK)],
    },
  });
  assert.equal(out.envelope.corroboration_ineligible, "credit_note");
  assert.equal(customerOf(out).value_raw, "KONG CHENG RESTAURANTS SDN BHD", "facts are still captured; the DB decides eligibility");
  // All four reader receipts ride the same envelope, and the new key is additive.
  for (const key of ["totals_reader", "vendor_identity", "currency_reader", "customer_identity"]) {
    assert.ok(out.envelope[key], `envelope.${key} is present`);
  }
});

test("`invoice.contact_person` is emitted ONLY by this reader, and only once", () => {
  // It has no typed counterpart in the Document Intelligence vocabulary and no other producer in
  // the repo, so it is purely additive — but it is also a NEW field_path, and the DB's allowlist
  // is closed (CLR10). The migration that admits it and this emission ship together.
  const out = normalizeAzureInvoice(payloadWith({ CustomerName: typedCustomerName() }, KONG_CHENG_BLOCK));
  assert.equal(rowsFor(out, "invoice.contact_person").length, 1);
  assert.deepEqual(contactOf(out).polygon, ATTN_PERSON.polygon, "the contact rides the Attn line's own geometry");
  assert.equal(contactOf(out).page, 1);
  // A document with no Attn line emits no such row at all — never fabricated.
  const none = normalizeAzureInvoice(payloadWith({ CustomerName: typedCustomerName() }, [BILL_TO_LABEL, KONG_CHENG]));
  assert.equal(rowsFor(none, "invoice.contact_person").length, 0);
});
