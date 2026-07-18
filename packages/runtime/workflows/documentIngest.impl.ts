// @frozen
//
// Frozen document-ingest steps. Infrastructure is process-injected so pool,
// storage, scanner, and vendor tuning stay outside the immutable workflow import
// closure. Step IO contains only task identifiers and small status receipts:
// credentials, document bytes, and extraction envelopes never cross a WDK boundary.

import { getWorkflowMetadata } from "workflow";

type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

type ClaraPools = {
  withRuntime<T>(fn: (client: PgExec) => Promise<T>): Promise<T>;
};

type DocumentServices = {
  noteClaim(taskId: string, status: string, runId: string | null): Promise<unknown>;
  process(taskId: string): Promise<{ taskId: string; status: string; lane: string }>;
};

function pools(): ClaraPools {
  const value = (globalThis as unknown as { __claraPools?: ClaraPools }).__claraPools;
  if (!value) throw new Error("runtime pools not injected (globalThis.__claraPools)");
  return value;
}

function services(): DocumentServices {
  const value = (globalThis as unknown as { __claraDocumentServices?: DocumentServices }).__claraDocumentServices;
  if (!value) throw new Error("document services not injected (globalThis.__claraDocumentServices)");
  return value;
}

export async function claimDocumentTaskStep(
  taskId: string,
): Promise<{ claimed: boolean; status: "running" | "held_egress" | "deduped" }> {
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
      return (row.rows[0]?.receipt ?? {}) as { status?: string };
    });
    const status = result.status === "held_egress" ? "held_egress" : "running";
    await services().noteClaim(taskId, status, status === "running" ? workflowRunId : null);
    return { claimed: status === "running", status };
  } catch (err) {
    // The SQL owns the CAS. CLR16 covers a missing task or a task already claimed
    // by another run; either way this duplicate run exits without vendor work.
    if ((err as { code?: string })?.code === "CLR16") return { claimed: false, status: "deduped" };
    throw err;
  }
}

export async function processDocumentTaskStep(taskId: string): Promise<{ taskId: string; status: string; lane: string }> {
  "use step";
  return services().process(taskId);
}
