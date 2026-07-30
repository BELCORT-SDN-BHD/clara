// @frozen
//
// Frozen statement-facts steps (Wave C-b design §4.3 / part2 §5). Infrastructure is
// process-injected (globalThis) so pool / storage / reader / vendor tuning stays OUTSIDE the
// immutable workflow closure — the exact AB-16 precedent documentIngest_v1 and
// invoiceFacts_v1 both use. Step IO carries only the task id and small receipts (including
// the claim's flat document metadata): bytes, credentials, reader payloads and the
// corroborated fact set never cross a WDK boundary.
//
// THE CLAIM ARITY IS PINNED (3-arg, `claim_document_processing_task(uuid,text,boolean)`).
// The statement lane is NOT the global-boolean lane — the kill switch that boolean feeds
// answers "is the vendor safe right now", while the TYPED consent answers "did this client
// authorize this purpose"; they are orthogonal and the design requires BOTH (§4.3). The
// boolean is passed anyway because the pinned arity demands it and because the DB, not this
// file, is what decides: the claim body's own lane list is what makes the kill switch bind
// on `statement_facts` and skip the free local `statement_parse` lane. Passing it here is a
// call-shape obligation, never an authorization this workflow grants itself.

import { getWorkflowMetadata } from "workflow";
import { processStatementFactsBehavior, interpretClaimReceipt } from "./statementFacts.v1.behavior.mjs";

type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

type ClaraPools = {
  withRuntime<T>(fn: (client: PgExec) => Promise<T>): Promise<T>;
};

type StatementFactsServices = {
  taskTempPath(taskId: string): string;
  removeTempFile(path: string): Promise<unknown>;
  downloadCanonical(key: string, destination: string, sha256: string): Promise<unknown>;
  /** Reader-1: the deterministic read over the STORED layout geometry (no egress). */
  readStatementLayout(client: PgExec, ref: { documentId: string; firmId: string }): Promise<Record<string, unknown>>;
  /** Reader-2: the typed vendor engine behind the service seam (the ONLY egress). */
  analyzeBankStatement(path: string, mime: string, task: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** The structured lane's deterministic in-process parser (csv/ofx). */
  parseStatementFile(path: string, format: string): Promise<Record<string, unknown>>;
  /** Judges ONE read, so the workflow can refuse before spending a vendor call or a
   *  single-use governed-egress authorization. Null when the read is fit to corroborate. */
  preflightRead(read: unknown, options?: { requireTotals?: boolean }): { code: string; detail: unknown } | null;
  corroborateTwoReaders(reader1: unknown, reader2: unknown): Record<string, unknown>;
  corroborateChain(reader: unknown): Record<string, unknown>;
  buildStatementPersistPayload(input: Record<string, unknown>): Record<string, unknown>;
  noteTaskFailure?(taskId: string, code: string): Promise<unknown>;
};

/** The flat document metadata the claim receipt carries on a 'running'/'replayed' claim
 *  (PIN-AB-6) — this lane is receipt-driven, never a spool sidecar. `lane` is load-bearing
 *  here: ONE workflow serves both statement lanes and branches on it. */
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

function services(): StatementFactsServices {
  const value = (globalThis as unknown as { __claraStatementFactsServices?: StatementFactsServices }).__claraStatementFactsServices;
  if (!value) throw new Error("statement-facts services not injected (globalThis.__claraStatementFactsServices)");
  return value;
}

/** Claim the statement task. A 'running' claim carries the flat document metadata
 *  (PIN-AB-6) and proceeds; 'held_egress' parks (the kill switch, or a DB-side hold);
 *  a terminal 'failed' claim (the DB's attempt cap ALREADY failed + refunded + evented the
 *  task) simply ends the workflow — never re-fails, never loops. */
export async function claimStatementFactsTaskStep(
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

export async function processStatementFactsTaskStep(
  taskId: string,
  doc: ClaimDoc | null,
): Promise<{ taskId: string; status: string; lane?: string; code?: string }> {
  "use step";
  return processStatementFactsBehavior(services(), pools().withRuntime, taskId, doc);
}
