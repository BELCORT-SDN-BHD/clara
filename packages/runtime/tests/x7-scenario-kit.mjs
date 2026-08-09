// Shared harness for the X7 EXECUTED-PROBE corpus, split out when the corpus outgrew one file.
//
// The fixtures and the `run()` helper live here so the two corpus files cannot drift apart —
// two copies of this page geometry would be two different documents wearing one name, and the
// whole point of the corpus is that every cell is executed against the SAME page.
//
// Fixture geometry follows x7-customer-testkit.mjs's A4 page; the honest limits on that
// geometry are stated in its header.
process.env.RELAY_TEST_MODE ??= "1";

import { normalizeAzureInvoice } from "../workflows/invoiceFacts.v1.azure.mjs";

export const box = (x1, y1, x2, y2) => [x1, y1, x2, y1, x2, y2, x1, y2];
export const L = (content, polygon) => ({ content, polygon });

export const VENDOR = L("ROME SECRETARY SDN BHD", box(0.70, 0.65, 3.50, 0.81));
export const BILL_TO = L("Bill To:", box(0.72, 2.10, 1.45, 2.24));
export const KONG_CHENG = L("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.30, 3.30, 2.45));
export const ATTN = L("Attn : Lim Xiao Shan", box(0.72, 2.90, 2.20, 3.04));
export const ATTN_BOX = box(0.72, 2.90, 2.20, 3.04);
export const ITEM = L("To Secretarial fee for the year 2025", box(0.72, 3.80, 4.20, 3.95));

// RULING 2 OF THE A1 FIELD TEST. When the reader ACCEPTED the `Attn` person and Azure's typed
// CustomerName IS that person, a page with no reachable party emits NO `customer_name` — the row
// is WITHDRAWN rather than shipping the same human twice. Cells reading "typed stands as 'Lim Xiao
// Shan'" now read WITHDRAWN; each CLAIM IS UNCHANGED AND STRICTLY STRONGER (the probe used to
// merely lose to the person; now nothing is manufactured AND the person cannot pass through).
// Cells whose contact read was refused/inconclusive keep the person: `attn_key` is unset there.
export const WITHDRAWN = undefined;

/** Run a page of lines through the REAL normalizer with a typed CustomerName at `tbox`. */
export function run(lines, typed, tbox = ATTN_BOX) {
  const out = normalizeAzureInvoice({ status: "succeeded", analyzeResult: {
    documents: [{ fields: {
      InvoiceTotal: { content: "2,800.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: box(6.5, 8.0, 7.7, 8.15) }], confidence: 0.93 },
      VendorName: { content: "ROME SECRETARY SDN BHD", boundingRegions: [{ pageNumber: 1, polygon: box(0.70, 0.65, 3.50, 0.81) }], confidence: 0.94 },
      CustomerName: { content: typed, boundingRegions: [{ pageNumber: 1, polygon: tbox }], confidence: 0.91 },
    } }],
    pages: [{ pageNumber: 1, unit: "inch", width: 8.2639, height: 11.6806, lines }],
  } });
  const g = (p) => out.fields.find((r) => r.field_path === p)?.value_raw;
  return { customer: g("invoice.customer_name"), contact: g("invoice.contact_person"),
    outcome: out.envelope.customer_identity.outcome, rows: out.fields, envelope: out.envelope };
}
