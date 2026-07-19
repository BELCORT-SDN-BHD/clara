// @frozen
//
// Behavioral closure for invoiceFacts_v1 (Slice-6 D-1 / companion §5 / PIN-AB-6). A
// SECOND, additive engine pass over a human-filed supplier bill: it reads the canonical
// bytes, calls Azure DI prebuilt-invoice, and persists SEMANTIC invoice facts through
// the audited writer so a later coding turn can corroborate the amount (Tier A).
//
// PIN-AB-6: the invoice-facts path is RECEIPT-DRIVEN — the document metadata
// (storage_path / sha256 / mime_type, plus document_id / firm_id / byte_size) comes
// FLAT from the claim receipt, never a spool sidecar (documentIngest keeps its sidecar
// path unchanged). `services` holds infrastructure adapters only (temp-file lifecycle /
// storage / the Azure invoice adapter); `withRuntime` is the injected pool boundary.
// This lane NEVER touches documents.extraction_status (C-10) — the facts state is read
// from the extraction row itself.

function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

// Transient vendor/storage faults THROW so the step is retried (WDK step retry within
// the run + the reconciler's stranded-run sweep across runs; the DB's per-document
// vendor-call cap bounds the total). A bad/corrupt document is terminal immediately —
// Tier B is the honest permanent fallback and the coding-time backstop re-enqueues.
const RETRYABLE = new Set(["engine_error", "timeout", "engine_lost", "storage_error"]);

function factsFailureCode(err) {
  const code = String(err?.code || "internal");
  return ["engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted", "bad_type", "limit", "internal"].includes(code)
    ? code
    : "internal";
}

async function callWriter(withRuntime, sql, params) {
  return withRuntime(async (client) => {
    const out = await client.query(sql, params);
    return receipt(out.rows[0]);
  });
}

/**
 * Process one claimed invoice-facts task from its CLAIM-RECEIPT metadata (`doc`).
 * Success → persist_invoice_facts (the DB normalizes raw field values to cents).
 * Transient failure → rethrow (retried). Terminal failure → fail_invoice_facts
 * (task→failed + refund + document.invoice_facts_failed). Filing NEVER blocks on this
 * enrichment: a failed facts task simply leaves the next coding turn at Tier B.
 * A claim outcome without metadata (held_egress/deduped) is no-work.
 */
export async function processInvoiceFactsBehavior(services, withRuntime, taskId, doc) {
  if (!doc || !doc.storage_path || !doc.sha256) {
    return { taskId, status: "no_work" };
  }
  const tempPath = services.taskTempPath(taskId);
  try {
    await services.downloadCanonical(doc.storage_path, tempPath, doc.sha256);
    const result = await services.analyzeInvoice(tempPath, doc.mime_type, doc);
    await callWriter(withRuntime, "select clara.persist_invoice_facts($1,$2::jsonb,$3,$4,$5) as receipt", [
      taskId,
      JSON.stringify(result.fields),
      result.rawSha256,
      result.normalizationVersion,
      result.pagesUsed,
    ]);
    return { taskId, status: "done" };
  } catch (err) {
    const code = factsFailureCode(err);
    if (RETRYABLE.has(code)) throw err; // transient: retried (WDK step + reconciler; DB caps)
    try {
      await callWriter(withRuntime, "select clara.fail_invoice_facts($1,$2) as receipt", [taskId, code]);
    } catch {
      await services.noteTaskFailure?.(taskId, code)?.catch?.(() => {});
    }
    return { taskId, status: "failed", code };
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}

/** Pull the flat document metadata off a claim receipt (present only on the
 *  'running'/'replayed' branch, PIN-AB-6); null when the claim carried none. */
export function docFromReceipt(r) {
  if (!r || r.storage_path == null || r.sha256 == null) return null;
  return {
    document_id: String(r.document_id ?? ""),
    firm_id: String(r.firm_id ?? ""),
    lane: String(r.lane ?? "invoice_facts"),
    storage_path: String(r.storage_path),
    sha256: String(r.sha256),
    mime_type: String(r.mime_type ?? ""),
    byte_size: Number(r.byte_size ?? 0),
  };
}

/**
 * Interpret a claim receipt (pure). Only a 'running' claim (incl. the same-run
 * 'replayed' branch — the DB neither increments nor re-checks the attempt cap on a
 * reattach) is claimed + carries metadata and proceeds to processing. 'held_egress'
 * parks; a terminal 'failed' outcome (the DB's attempt_cap: it ALREADY failed +
 * refunded + evented the task) is NOT claimed — the workflow simply ends with that
 * status, never re-failing or error-looping. Anything else is treated as not-claimed
 * (safe: the workflow ends with the observed status).
 */
export function interpretClaimReceipt(r) {
  const status = String(r?.status ?? "held_egress");
  const claimed = status === "running";
  return { claimed, status, doc: claimed ? docFromReceipt(r) : null };
}
