// Slice-6 rig — coding-floor fixture WRAPPERS (NOT a test file). Re-exports the
// s6-helpers CORE so a test file imports ONE module, and adds the growing set of
// 0009 fn wrappers (invoice-facts lane, coding-tasks, read fns). Contract-blind:
// every 0009 fn is called by its pinned name (INTERFACE-PINS §1); a named call to
// a not-yet-built signature throws 42883 and callers SKIP via s6Ready(). Split out
// of s6-helpers so each module stays under the repo's 500-line cap.

import { randomUUID } from "node:crypto";
import { ROLES, roleQuery, rootQuery, humanQuery, namedCall, opk, digestOf, INVOICE_FACTS_LANE, firmOf, seedCitedDocument } from "./s6-helpers.mjs";

export * from "./s6-helpers.mjs";

// ---------------------------------------------------------------------------
// FIX-round readiness (INTERFACE-PINS §6.6). The post-Codex fix batch (W1–W5)
// lands as an orchestrator-applied 0009 body edit AFTER the author lane exits.
// Its marker: revise_entry gains p_amount_override (W1). New-behavior tests gate
// on this so they SKIP against the pre-fix 0009 currently on clara_blind_test and
// RUN once the orchestrator signals the fix batch is applied.
// ---------------------------------------------------------------------------

export async function s6FixReady() {
  const r = await rootQuery(
    "select pg_get_function_identity_arguments(p.oid) as a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='revise_entry'",
  );
  return (r.rows[0]?.a ?? "").includes("p_amount_override");
}

/** The internal invoice fact-state helper (ungranted → root). Returns
 *  {currency, total_cents, corroborated, invoice_id?, ...} or null. */
export async function invoiceFactState(document) {
  const r = await rootQuery("select clara._invoice_fact_state($1) as s", [document]).catch(() => ({ rows: [{ s: null }] }));
  return r.rows[0]?.s ?? null;
}

// ---------------------------------------------------------------------------
// Invoice-facts lane writers (clara_runtime) — pinned signatures (§1).
// ---------------------------------------------------------------------------

/** enqueue_invoice_facts(p_document) — coding-time backstop; idempotent by the
 *  partial unique (document_id, lane) over live states [N-F10]. */
export async function enqueueInvoiceFacts(document) {
  const r = await roleQuery(ROLES.runtime, "select clara.enqueue_invoice_facts(p_document => $1) as r", [document]);
  return r.rows[0].r;
}

/** The invoice_facts processing task for a document (root readback). */
export async function invoiceFactsTask(document) {
  const r = await rootQuery(
    "select to_jsonb(t) as row from clara.document_processing_tasks t where t.document_id=$1 and t.lane=$2 order by t.created_at desc limit 1",
    [document, INVOICE_FACTS_LANE],
  );
  return r.rows[0]?.row ?? null;
}

/** claim_document_processing_task (runtime) — queued→running under the egress
 *  gate (p_egress_approved now covers lane invoice_facts too, N-F1). */
export async function claimTask(task, { egressApproved = true, workflowRunId = null } = {}) {
  const r = await roleQuery(
    ROLES.runtime,
    "select clara.claim_document_processing_task(p_task => $1, p_workflow_run_id => $2, p_egress_approved => $3) as r",
    [task, workflowRunId ?? `wf-${randomUUID()}`, egressApproved],
  );
  return r.rows[0].r;
}

/** [WA-D1] Ensure a live client_egress consent exists for `client` so the
 *  invoice_facts claim lane-carve does not fail closed (a claim of an invoice_facts
 *  task otherwise parks at held_egress/CLR28 no_consent, and persist then raises
 *  CLR16). The grant is IDEMPOTENT: a second live grant raises CLR28 duplicate_live
 *  (one live consent per client), which is swallowed. Cites a freshly seeded doc
 *  (status='ingested' + bytes_verified) as evidence. `sub` must be the firm OWNER. */
export async function ensureClientEgress(sub, { client }) {
  const firm = await firmOf(client);
  const evidence = await seedCitedDocument(sub, { firm, client });
  try {
    const r = await humanQuery(
      sub,
      "select clara.grant_client_egress(p_client => $1, p_evidence_document => $2, p_scope_note => $3, p_op_key => $4) as r",
      [client, evidence.documentId, "rig standing consent", opk("egress")],
    );
    return r.rows[0].r;
  } catch (e) {
    if (e.code === "CLR28") return null; // already holds a live consent (one-per-client)
    throw e;
  }
}

/** persist_invoice_facts (runtime) — inserts the OWN invoice_facts extraction +
 *  semantic regions (monetary_cents normalized in-DB), rotates open drafts'
 *  tokens. p_fields: [{field_path, value_raw, page, polygon, confidence}]. The
 *  FIX-round W3 added p_envelope (the mapper's corroboration eligibility — e.g.
 *  {corroboration_ineligible:true} for a multi-doc result). */
export async function persistInvoiceFacts(task, fields, { rawSha = null, normVersion = "norm-2026-01", pagesUsed = 1, envelope = {} } = {}) {
  const r = await roleQuery(
    ROLES.runtime,
    "select clara.persist_invoice_facts(p_task => $1, p_fields => $2::jsonb, p_raw_sha256 => $3, p_normalization_version => $4, p_pages_used => $5, p_envelope => $6::jsonb) as r",
    [task, JSON.stringify(fields), rawSha ?? digestOf(randomUUID()), normVersion, pagesUsed, JSON.stringify(envelope ?? {})],
  );
  return r.rows[0].r;
}

/** fail_invoice_facts (runtime) — task→failed + refund + invoice_facts_failed. */
export async function failInvoiceFacts(task, reason = "budget") {
  const r = await roleQuery(ROLES.runtime, "select clara.fail_invoice_facts(p_task => $1, p_reason => $2) as r", [task, reason]);
  return r.rows[0].r;
}

/** A facts field element (field_path + raw value + physical locator). */
export function factField(fieldPath, valueRaw, { page = 1, polygon = [0, 0, 1, 1], confidence = 0.98 } = {}) {
  return { field_path: fieldPath, value_raw: valueRaw, page, polygon, confidence };
}

/** The invoice_facts extraction's semantic region for a field_path (id + text) —
 *  a Tier-A draft must cite the MACHINE total's region, not the OCR region. */
export async function factsRegion(document, fieldPath = "invoice.total") {
  const r = await rootQuery(
    `select rg.id, rg.text_content from clara.document_regions rg
       join clara.document_extractions ex on ex.id=rg.extraction_id
      where ex.document_id=$1 and ex.engine_kind='invoice_facts' and rg.field_path=$2
      order by ex.version_n desc limit 1`,
    [document, fieldPath],
  );
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Draft-lifecycle writers (clara_authenticated, bookkeeper+) — pinned §1/§8.
// ---------------------------------------------------------------------------

/** revise_entry(p_entry, p_lines, p_proposed_counterparty, p_evidence,
 *  p_expected_revision, p_op_key [, p_amount_override, p_duplicate_override]) → new
 *  token; stamps last_human_editor [C-4]. The two override args are the FIX-round
 *  W1/W2 additions (§6.6); they are appended only when supplied so the call binds
 *  against both the pre-fix (6-arg) and post-fix (8-arg) signatures. */
export async function reviseEntry(sub, { entry, lines, vendor = null, evidence = null, expectedRevision, opKey = null, amountOverride = undefined, duplicateOverride = undefined }) {
  const specs = [
    { name: "p_entry" }, { name: "p_lines", cast: "jsonb" }, { name: "p_proposed_counterparty", cast: "jsonb" },
    { name: "p_evidence", cast: "jsonb" }, { name: "p_expected_revision" }, { name: "p_op_key" },
  ];
  const vals = [entry, JSON.stringify(lines), vendor == null ? null : JSON.stringify(vendor), evidence == null ? null : JSON.stringify(evidence), expectedRevision, opKey ?? opk("revise")];
  if (amountOverride !== undefined) { specs.push({ name: "p_amount_override", cast: "jsonb" }); vals.push(amountOverride == null ? null : JSON.stringify(amountOverride)); }
  if (duplicateOverride !== undefined) { specs.push({ name: "p_duplicate_override", cast: "jsonb" }); vals.push(duplicateOverride == null ? null : JSON.stringify(duplicateOverride)); }
  const r = await humanQuery(sub, namedCall("revise_entry", specs), vals);
  return r.rows[0].result; // namedCall aliases the return as `result`
}

/** withdraw_draft(p_entry, p_reason, p_expected_revision, p_op_key). */
export async function withdrawDraft(sub, { entry, reason = "rig withdraw", expectedRevision, opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.withdraw_draft(p_entry => $1, p_reason => $2, p_expected_revision => $3, p_op_key => $4) as r",
    [entry, reason, expectedRevision, opKey ?? opk("withdraw")],
  );
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// coding_tasks writers (clara_authenticated, bookkeeper+) — pinned §1 / §4.
// ---------------------------------------------------------------------------

/** open_coding_task(p_client, p_document, p_filing, p_reason, p_op_key) → origin='manual'. */
export async function openCodingTask(sub, { client, document, filing, reason = "rig coding task", opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.open_coding_task(p_client => $1, p_document => $2, p_filing => $3, p_reason => $4, p_op_key => $5) as r",
    [client, document, filing, reason, opKey ?? opk("opentask")],
  );
  return r.rows[0].r;
}

/** complete_coding_task(p_task, p_result_entry, p_op_key) — proves the result entry. */
export async function completeCodingTask(sub, { task, resultEntry, opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.complete_coding_task(p_task => $1, p_result_entry => $2, p_op_key => $3) as r",
    [task, resultEntry, opKey ?? opk("donetask")],
  );
  return r.rows[0].r;
}

/** dismiss_coding_task(p_task, p_reason, p_op_key). */
export async function dismissCodingTask(sub, { task, reason = "rig dismiss", opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.dismiss_coding_task(p_task => $1, p_reason => $2, p_op_key => $3) as r",
    [task, reason, opKey ?? opk("dismisstask")],
  );
  return r.rows[0].r;
}

/** The masked coding_tasks_visible view rows for a client (root readback). */
export async function codingTaskRows(client) {
  const r = await rootQuery("select to_jsonb(t) as row from clara.coding_tasks t where t.client_id=$1 order by t.created_at", [client]);
  return r.rows.map((x) => x.row);
}

// ---------------------------------------------------------------------------
// Read fns — invoker security; called under a persona (human/agent) with the
// wake GUC set for the agent lane. Return the raw jsonb/setof result.
// ---------------------------------------------------------------------------

/** get_draft_review(p_entry, p_client) — human lane (broad RLS) or agent lane. */
export async function getDraftReview(sub, { entry, client = null }) {
  const r = await humanQuery(sub, "select clara.get_draft_review(p_entry => $1, p_client => $2) as r", [entry, client]);
  return r.rows[0].r;
}

/** list_uncoded_filings(p_client) — human lane. */
export async function listUncodedFilings(sub, { client = null } = {}) {
  const r = await humanQuery(sub, "select clara.list_uncoded_filings(p_client => $1) as r", [client]);
  return r.rows.map((x) => x.r);
}

/** get_document_extract(p_document, p_client, p_max_chars) — human lane. */
export async function getDocumentExtract(sub, { document, client = null, maxChars = 20000 }) {
  const r = await humanQuery(sub, "select clara.get_document_extract(p_document => $1, p_client => $2, p_max_chars => $3) as r", [document, client, maxChars]);
  return r.rows[0].r;
}
