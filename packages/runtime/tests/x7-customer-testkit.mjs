// Shared fixtures for the X7 customer-identity battery (the x2-totals-testkit.mjs precedent).
//
// THE GEOMETRY HERE IS CONSTRUCTED, NOT MEASURED, and that is stated rather than implied. X6's
// fixtures are copied from a real Azure capture; the F7 vehicles (ROME SECRETARY's two KONG CHENG
// invoices — wave-7a-acceptance-h1.md rows 1 and 12) are real client documents that are not in
// this repo and must not be. So these boxes reproduce the SHAPE the acceptance record describes —
// a bill-to box carrying the company on its own line, an address under it, and a separate
// `Attn : Lim Xiao Shan` contact line, all inside an A4 page whose dimensions ARE the ones X6
// measured (8.2639 x 11.6806) — while the exact inch offsets are chosen, not observed.
//
// What that costs, and what it does not: these cells prove the reader's LOGIC (which line wins,
// which refusal fires, what the receipt says), and they cannot prove the DEFAULT THRESHOLDS are
// right for the real capture. That measurement is the live replay's job; the reader is built so
// that a wrong threshold abstains rather than mis-reads (see the module header).

/** A flat 4-corner polygon from an axis-aligned box, in the page's own units. */
export const box = (xmin, ymin, xmax, ymax) => [xmin, ymin, xmax, ymin, xmax, ymax, xmin, ymax];

export const line = (content, polygon) => ({ content, polygon });

export const A4 = Object.freeze({ width: 8.2639, height: 11.6806 });

export const page = (lines, pageNumber = 1, extra = {}) => ({ pageNumber, lines, unit: "inch", ...A4, ...extra });

// ── The KONG CHENG-shaped bill-to box ────────────────────────────────────────────────────────
export const VENDOR_LETTERHEAD = line("ROME SECRETARY SDN BHD", box(0.70, 0.65, 3.50, 0.81));
export const BILL_TO_LABEL = line("Bill To:", box(0.72, 2.10, 1.45, 2.24));
export const KONG_CHENG = line("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.30, 3.30, 2.45));
export const ADDRESS_STREET = line("No 12, Jalan Ampang", box(0.72, 2.50, 2.60, 2.64));
export const ADDRESS_CITY = line("50450 Kuala Lumpur", box(0.72, 2.70, 2.40, 2.84));
export const ATTN_PERSON = line("Attn : Lim Xiao Shan", box(0.72, 2.90, 2.20, 3.04));

/** The whole measured-shape block, in printed order. */
export const KONG_CHENG_BLOCK = [
  VENDOR_LETTERHEAD, BILL_TO_LABEL, KONG_CHENG, ADDRESS_STREET, ADDRESS_CITY, ATTN_PERSON,
];

/**
 * The typed VendorName / CustomerName regions as Azure returned them on the F7 shape — and THIS
 * IS THE WHOLE POINT OF THE FIXTURE: the typed CustomerName region sits on the `Attn` line, i.e.
 * its CONTENT names the wrong party while its GEOMETRY points straight at the bill-to box. That
 * is the X6 insight (garbage content, sound geometry) reappearing on the buyer side, and it is
 * what lets attribution work at all on the very documents whose typed value is wrong.
 */
export const ANCHORS = Object.freeze({
  vendor: { page: 1, xmin: 0.70, xmax: 3.50, ymin: 0.65, ymax: 0.81 },
  customer: { page: 1, xmin: 1.10, xmax: 2.20, ymin: 2.90, ymax: 3.04 },
  // `vendorName` MUST mirror TYPED_VENDOR_NAME.content below — it is what `anchorsFromTypedFields`
  // builds from that very field, and a unit fixture that omits it would test a reader the adapter
  // never constructs. Attribution uses it to REFUSE a candidate that is the seller's own name.
  vendorName: "ROME SECRETARY SDN BHD",
});

/** The same two regions in Azure's own typed-field shape, for mapper-level payloads. */
export const TYPED_VENDOR_NAME = Object.freeze({
  content: "ROME SECRETARY SDN BHD",
  boundingRegions: [{ pageNumber: 1, polygon: box(0.70, 0.65, 3.50, 0.81) }],
  confidence: 0.94,
});

/** Azure's typed CustomerName on the F7 vehicles: THE CONTACT PERSON, not the party. */
export const typedCustomerName = (content = "Lim Xiao Shan", confidence = 0.91) => ({
  content,
  boundingRegions: [{ pageNumber: 1, polygon: box(1.10, 2.90, 2.20, 3.04) }],
  confidence,
});

export const TYPED_TOTAL = Object.freeze({
  content: "2,800.00",
  valueCurrency: { amount: 2800, currencyCode: "MYR" },
  boundingRegions: [{ pageNumber: 1, polygon: box(6.5, 8.0, 7.7, 8.15) }],
  confidence: 0.93,
});

/** A full analyzeResult carrying typed fields AND layout lines (x2-totals-mapper's `payloadWith`). */
export function payloadWith(typedFields, lines, pageExtra = {}) {
  return {
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: { InvoiceTotal: TYPED_TOTAL, VendorName: TYPED_VENDOR_NAME, ...typedFields } }],
      pages: [page(lines, 1, pageExtra)],
    },
  };
}

export const pathOf = (out, fieldPath) => out.fields.find((f) => f.field_path === fieldPath);
export const customerOf = (out) => pathOf(out, "invoice.customer_name");
export const contactOf = (out) => pathOf(out, "invoice.contact_person");
