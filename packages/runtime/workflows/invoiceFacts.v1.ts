// @frozen
//
// invoiceFacts_v1 (Slice-6 companion §5, C-13) — a NEW registered frozen workflow
// CLASS beside the byte-untouched documentIngest_v1. A human-filed supplier bill's
// invoice-facts task is claimed (lane 'invoice_facts', egress-gated), then the bytes
// are read and Azure DI prebuilt-invoice extracts SEMANTIC facts persisted through
// the audited writer. No LLM participates; no chat concurrency is consumed. Do NOT
// edit this file or its import closure once deployed (Appendix A immutability).

import { claimInvoiceFactsTaskStep, processInvoiceFactsTaskStep } from "./invoiceFacts.v1.impl.js";

export async function invoiceFacts_v1(input: { task_id: string }): Promise<{ task_id: string; outcome: string }> {
  "use workflow";
  const taskId = input.task_id;
  const claim = await claimInvoiceFactsTaskStep(taskId);
  if (!claim.claimed) return { task_id: taskId, outcome: claim.status };
  const result = await processInvoiceFactsTaskStep(taskId, claim.doc);
  return { task_id: taskId, outcome: result.status };
}
