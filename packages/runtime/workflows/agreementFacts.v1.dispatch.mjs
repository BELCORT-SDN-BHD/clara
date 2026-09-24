// @frozen
//
// agreementFacts_v1 — THE DATABASE READS AND THE SETTLE VERBS. #948.
//
// ITS OWN MODULE, NOT AN IMPORT OF witnessFacts.v1.dispatch.mjs OR payrollFacts.v1.dispatch.mjs,
// for the ticket's own reason: a versioned workflow may not couple its shape to another family's
// frozen files. Both of those modules are frozen, and an agreement fix that needed one more read
// there would be an edit to the invoice or payroll lane's frozen closure. The SQL below is
// deliberately close in shape to its siblings — same idioms, same reasons, restated where the
// reason is load-bearing — and points at this family's own doors.
//
// THE REGION NUMBERING IS THE ESTATE'S ONE NUMBERING, NOT A SECOND ONE. `clara.witness_citation_
// regions(uuid)` numbers an OCR extraction's regions in reading order, and
// `clara.persist_agreement_facts` resolves a citation through the SAME ordering. Its name says
// "witness" because it was minted for the witness pair; it is a NUMBERING, not a questionnaire,
// and inventing an agreement-specific one would guarantee the two drift apart the first time
// either changed. Stated here so a reader does not mistake the reuse for an oversight.

/** The typed egress purpose this lane runs under. The SAME purpose the invoice, statement and
 *  payroll witness pairs hold, and migration 0299 §E records why: it is the consent to send a
 *  client's document bytes to a model in order to READ them, which is exactly what this lane
 *  does. A purpose of its own would mean every firm re-consenting for a reading they have already
 *  authorized in exactly those words. */
export const AGREEMENT_PURPOSE = "witness_extraction";

/** The dispatch event type this lane records against an authorization. Its OWN literal: a
 *  revoker reading the dispatch ledger must be able to tell WHICH read spent an authorization,
 *  and the column is free text rather than a roster, so the only thing that makes it honest is
 *  each lane naming itself. */
export const AGREEMENT_EVENT_TYPE = "agreement.extraction";

/** A pre-egress size cap on the vision channel. The same 30MB the witness pair holds. */
export const AGREEMENT_MAX_VISION_BYTES = 30_000_000;

/** How long a claimed task may WAIT (for a missing surface, an absent OCR pass, a kill switch)
 *  before the wait itself becomes the terminal outcome. */
export const AGREEMENT_WAIT_BUDGET_MS = 45 * 60 * 1000;

/** The code a spent wait settles under — admitted by clara.fail_agreement_facts' vocabulary. */
export const AGREEMENT_WAIT_EXHAUSTED = "wait_exhausted";

export function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

export async function callWriter(withRuntime, sql, params) {
  return withRuntime(async (client) => {
    const out = await client.query(sql, params);
    return receipt(out.rows[0]);
  });
}

/** PER-TASK SURFACE GUARD, evaluated per call and never cached. EXACT signatures via
 *  `to_regprocedure` — an overloaded-name check cannot tell one arity from another. Deploy order
 *  for #948 is DATABASE-first, so in practice this image meets a database that already carries
 *  the surface; the guard exists for the rollback direction, where an older database must never
 *  see a model call it cannot bank the result of. */
export async function hasAgreementSurface(client) {
  const r = await client.query(
    "select to_regprocedure('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.witness_citation_regions(uuid)') is not null"
    + " and to_regprocedure('clara.persist_agreement_facts(uuid,jsonb,jsonb,int)') is not null"
    + " and to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is not null"
    + " as surface",
  );
  return r.rows[0]?.surface === true;
}

/** PLAN-TIME verdict, sha-bound. Returns the DB's payload verbatim; a 42501 here is a GRANT GAP
 *  in the deployment, never bad data, and propagates. */
export async function prepareAgreementDispatch(client, { firmId, clientId, eventSeq, documentSha256 }) {
  const r = await client.query("select clara.prepare_egress_dispatch($1,$2,$3,$4,$5,$6) as v", [
    firmId, clientId, AGREEMENT_PURPOSE, eventSeq, AGREEMENT_EVENT_TYPE, documentSha256,
  ]);
  return r.rows[0]?.v ?? { verdict: "unknown", authorization_id: null };
}

/** THE DISPATCH LINEARIZATION POINT, in its OWN committed transaction. A PostgreSQL function
 *  cannot commit its caller's transaction, so on a pooled connection `granted` could come back
 *  from an UNCOMMITTED consume — the model would then be called on an authorization a revoker
 *  still sees as unspent. The explicit begin/commit makes `granted` MEAN committed. The full
 *  intent, sha included, is presented again so an authorization minted for document A cannot be
 *  spent on document B. */
export async function consumeAgreementDispatch(client, { firmId, authorizationId, clientId, eventSeq, documentSha256 }) {
  await client.query("begin");
  let r;
  try {
    r = await client.query("select clara.consume_egress_dispatch($1,$2,$3,$4,$5,$6,$7) as v", [
      firmId, authorizationId, clientId, AGREEMENT_PURPOSE, eventSeq, AGREEMENT_EVENT_TYPE, documentSha256,
    ]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
  return r.rows[0]?.v ?? { verdict: "unknown" };
}

/** The task's own `version_n` and `engine_id` (both DB-owned: clara.persist_agreement_facts reads
 *  them off the same row, so nothing here may invent either), plus the document's single
 *  active-filing client — resolved by the serialized DB verb, never by a read assembled here. */
export async function readAgreementContext(client, taskId, doc) {
  const t = await client.query(
    "select version_n, engine_id, status from clara.document_processing_tasks where id=$1", [taskId]);
  const row = t.rows[0] ?? {};
  const r = await client.query("select clara.resolve_document_client($1,$2) as r", [doc.firm_id, doc.document_id]);
  const resolved = r.rows[0]?.r ?? { status: "unresolved" };
  return {
    versionN: Number(row.version_n ?? 0),
    engineId: row.engine_id == null ? null : String(row.engine_id),
    clientStatus: String(resolved.status ?? "unresolved"),
    clientId: resolved.client_id ?? null,
  };
}

/** THE TASK'S STATUS, READ FRESH. The two channels are separate steps minutes apart, and between
 *  them the global kill switch can flip a claimed task to `held_egress` or a human can settle it.
 *  Re-using a status captured at the start of the first channel would let the second channel
 *  egress on a task the DB has since parked. */
export async function readTaskStatus(client, taskId) {
  const r = await client.query("select status from clara.document_processing_tasks where id=$1", [taskId]);
  return r.rows[0]?.status == null ? null : String(r.rows[0].status);
}

/** Has this claimed task been waiting past its budget? Compared by the DATABASE's clock against
 *  the DB-owned `started_at`, so the answer is the same from every instance in a rolling deploy.
 *  Read POSITIVELY and fail toward CONTINUING to wait: a missing row or a null `started_at`
 *  returns false, because killing a task on the strength of an absence would turn a read failure
 *  into a settled document. */
export async function waitBudgetExhausted(client, taskId, budgetMs = AGREEMENT_WAIT_BUDGET_MS) {
  const r = await client.query(
    "select (started_at is not null and now() - started_at > make_interval(secs => $2::numeric)) as spent,"
    + " extract(epoch from (now() - started_at)) as waited_s"
    + " from clara.document_processing_tasks where id=$1",
    [taskId, budgetMs / 1000],
  );
  return { spent: r.rows[0]?.spent === true, waitedSeconds: Number(r.rows[0]?.waited_s ?? 0) };
}

/** The PINNED OCR extraction the text channel reads and pins itself to: the newest DONE
 *  `engine_kind='ocr'` extraction of this document, by the live generation order, so the pin
 *  names the same generation every other reader would resolve. Its `page_count` rides along as
 *  the pair's honest page count. */
export async function readPinnedOcrExtraction(client, doc) {
  const r = await client.query(
    "select id, page_count from clara.document_extractions"
    + " where document_id=$1 and firm_id=$2 and engine_kind='ocr' and status='done'"
    + " order by version_n desc, id desc limit 1",
    [doc.document_id, doc.firm_id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { id: String(row.id), pageCount: Number.isInteger(row.page_count) ? row.page_count : null };
}

/** The numbered regions, in the DATABASE's own order. The idx a citation names is this idx, and
 *  clara.persist_agreement_facts resolves it through the same ordering. */
export async function readCitationRegions(client, ocrExtractionId) {
  const r = await client.query(
    "select idx, region_id, page, text_content from clara.witness_citation_regions($1)",
    [ocrExtractionId],
  );
  return r.rows.map((row) => ({
    idx: Number(row.idx),
    regionId: String(row.region_id),
    page: row.page == null ? null : Number(row.page),
    text: row.text_content == null ? "" : String(row.text_content),
  }));
}

/** One metering row per channel per attempt. The runtime meters at CALL time because it alone
 *  knows a call that never reaches a persist. */
export async function recordUsage(withRuntime, { doc, taskId, channel, engineId, promptHash, usage, outcome }) {
  try {
    await withRuntime((client) => client.query(
      "select clara.record_llm_usage_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        doc.firm_id, doc.document_id, taskId, channel, engineId, promptHash,
        Number.isInteger(usage?.input_tokens) ? usage.input_tokens : null,
        Number.isInteger(usage?.output_tokens) ? usage.output_tokens : null,
        Number.isInteger(usage?.duration_ms) ? usage.duration_ms : null,
        outcome,
      ],
    ));
  } catch {
    // Metering is a receipt, never a gate: a metering failure must not turn a completed read
    // into a failed one. The same posture the witness lane holds.
  }
}

/** Settle a RUNNING agreement task terminally through the lane's own verb. A database below the
 *  #948 frontier has no such verb; that is a deploy-order window, not a fault, and it is logged
 *  rather than thrown so the caller's own error stays the one that surfaces. */
export async function settleAgreementFailure(withRuntime, taskId, code, log = console.error) {
  try {
    await callWriter(withRuntime, "select clara.fail_agreement_facts($1,$2) as receipt", [taskId, code]);
  } catch (err) {
    log(`[agreement] could not settle task ${taskId} as '${code}': ${err instanceof Error ? err.message : String(err)}`);
  }
}
