// The injected service bundle for invoiceFacts_v1 (Slice-6 / PIN-AB-6). INFRASTRUCTURE
// — NOT frozen; assembled here and injected into globalThis.__claraInvoiceFactsServices
// by the supervisor (plugins/startWorld.ts), exactly as makeDocumentServices() is for
// documentIngest. The invoice-facts path is RECEIPT-DRIVEN (no sidecar), so this bundle
// carries only the temp-file lifecycle, canonical download, and the Azure prebuilt-
// invoice adapter — NOT the sidecar meta readers documentIngest uses. Keeping it out of
// the frozen closure means vendor/pool tuning is never a workflow-version change (AB-16).

import { makeDocumentServices } from "../lib/intake.mjs";
import { analyzeInvoice } from "./invoiceFacts.v1.azure.mjs";

export function makeInvoiceFactsServices() {
  const base = makeDocumentServices();
  return Object.freeze({
    taskTempPath: base.taskTempPath,
    removeTempFile: base.removeTempFile,
    downloadCanonical: base.downloadCanonical,
    analyzeInvoice,
    noteTaskFailure: base.noteTaskFailure,
  });
}
