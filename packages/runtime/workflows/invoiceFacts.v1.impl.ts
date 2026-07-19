// @frozen
//
// Frozen invoice-facts steps (Slice-6 companion §5, C-13, PIN-AB-6). Infrastructure is
// process-injected (globalThis) so pool/storage/Azure tuning stays outside the
// immutable workflow closure — the exact AB-16 precedent documentIngest_v1 uses.
// Step IO carries only the task id + small receipts (incl. the claim's flat document
// metadata): bytes, credentials, and the engine payload never cross a WDK boundary.

import { getWorkflowMetadata } from "workflow";
import { processInvoiceFactsBehavior, interpretClaimReceipt } from "./invoiceFacts.v1.behavior.mjs";

type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

type ClaraPools = {
  withRuntime<T>(fn: (client: PgExec) => Promise<T>): Promise<T>;
};

type InvoiceFactsServices = {
  taskTempPath(taskId: string): string;
  removeTempFile(path: string): Promise<unknown>;
  downloadCanonical(key: string, destination: string, sha256: string): Promise<unknown>;
  analyzeInvoice(path: string, mime: string, task: Record<string, unknown>): Promise<Record<string, unknown>>;
  noteTaskFailure?(taskId: string, code: string): Promise<unknown>;
};

/** The flat document metadata the claim receipt carries on a 'running'/'replayed'
 *  claim (PIN-AB-6) — the invoice-facts path is receipt-driven, never a sidecar. */
type ClaimDoc = {
  document_id: string;
  firm_id: string;
  lane: string;
  storage_path: string;
  sha256: string;
  mime_type: string;
  byte_size: number;
};

function pools(): ClaraPools {
  const value = (globalThis as unknown as { __claraPools?: ClaraPools }).__claraPools;
  if (!value) throw new Error("runtime pools not injected (globalThis.__claraPools)");
  return value;
}

function services(): InvoiceFactsServices {
  const value = (globalThis as unknown as { __claraInvoiceFactsServices?: InvoiceFactsServices }).__claraInvoiceFactsServices;
  if (!value) throw new Error("invoice-facts services not injected (globalThis.__claraInvoiceFactsServices)");
  return value;
}

/** Claim the invoice-facts task (the 0009 claim fn covers lane in ('ocr','invoice_facts')
 *  for the egress hold + concurrency cap + the per-document attempt cap, and — C-10 —
 *  does NOT touch extraction_status for this lane). A 'running' claim carries the flat
 *  document metadata (PIN-AB-6) and proceeds; 'held_egress' parks; a terminal 'failed'
 *  claim (the DB's attempt_cap ALREADY failed + refunded + evented the task) simply ends
 *  the workflow — never re-fails or loops (interpretClaimReceipt owns this). */
export async function claimInvoiceFactsTaskStep(
  taskId: string,
): Promise<{ claimed: boolean; status: string; doc: ClaimDoc | null }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  const egressApproved = process.env.CLARA_DOC_EGRESS_APPROVED === "1";
  try {
    const result = await pools().withRuntime(async (client) => {
      const row = await client.query("select clara.claim_document_processing_task($1,$2,$3) as receipt", [
        taskId,
        workflowRunId,
        egressApproved,
      ]);
      return (row.rows[0]?.receipt ?? {}) as Record<string, unknown>;
    });
    return interpretClaimReceipt(result) as { claimed: boolean; status: string; doc: ClaimDoc | null };
  } catch (err) {
    // CLR16 covers a missing task or one already claimed by another run — dedupe.
    if ((err as { code?: string })?.code === "CLR16") return { claimed: false, status: "deduped", doc: null };
    throw err;
  }
}

export async function processInvoiceFactsTaskStep(taskId: string, doc: ClaimDoc | null): Promise<{ taskId: string; status: string }> {
  "use step";
  return processInvoiceFactsBehavior(services(), pools().withRuntime, taskId, doc);
}
