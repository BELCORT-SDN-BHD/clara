// HUMAN-lane wire client for the /documents plumbing page (contract §4.5). All
// reads are firm-scoped PostgREST SELECTs (RLS pins them to jwt_firm()); all
// mutations are the named governed writers granted to clara_authenticated in 0007
// §11 — never a hand-written row. 0007 + INTERFACE-PINS are the authority for
// every view/rpc name; nothing here is invented.

import { pgrestSelect, rpc } from "../shared/wire";

// ---------------------------------------------------------------------------
// Row types (mirror the granted tables/views).
// ---------------------------------------------------------------------------

export type DocumentRow = {
  id: string;
  sha256: string;
  original_filename: string | null;
  mime_type: string | null;
  byte_size: number | null;
  storage_path: string | null;
  uploaded_by: string | null;
  created_at: string;
  bytes_verified_at: string | null;
  page_count: number | null;
  extraction_status:
    | "pending" | "running" | "done" | "failed"
    | "skipped_structured_done" | "stored_unparsed" | "held_egress";
  document_kind: string | null;
  financial_date: string | null;
  retention_state: "unanchored" | "anchored";
  retain_until: string | null;
  retention_basis: string | null;
  legal_hold: boolean;
  legal_hold_reason: string | null;
};

export type FilingRow = {
  id: string;
  document_id: string;
  client_id: string;
  filed_at: string;
  filed_by: string | null;
  basis: "legacy-0007" | "human" | "rule" | "correction" | "seed-0007";
  retired_at: string | null;
  retirement_reason: string | null;
  revision_token: string;
};

export type ClientRow = { id: string; name: string | null; status: string };

export type AttemptRow = {
  id: string;
  document_id: string;
  matcher_version: string;
  outcome: "abstained" | "candidate" | "rule_resolved";
  conflict_reason: string | null;
  created_at: string;
};

export type CandidateRow = {
  id: string;
  attempt_id: string;
  client_id: string;
  rank: number;
  rule_kind: "name_exact" | "alias_exact";
  disposition: "open" | "confirmed" | "dismissed";
  created_at: string;
};

export type CorrectionItem = {
  entry_id: string;
  entry_state_hash: string;
  action: "reverse" | "already_reversed" | "withdraw_draft";
  posting_date: string | null;
  status: string;
  period_state: string;
};

export type CorrectionPreview = {
  document_id: string;
  from_client: string;
  to_client: string;
  filing_id: string;
  books_version: number;
  items: CorrectionItem[];
  period_model: string;
  closed_period_blockers: unknown[];
  subledger_model: string;
};

// ---------------------------------------------------------------------------
// Reads (firm-scoped).
// ---------------------------------------------------------------------------

const DOC_COLS =
  "id,sha256,original_filename,mime_type,byte_size,storage_path,uploaded_by,created_at," +
  "bytes_verified_at,page_count,extraction_status,document_kind,financial_date," +
  "retention_state,retain_until,retention_basis,legal_hold,legal_hold_reason";

/** Firm documents, newest first (the detail source). */
export async function listDocuments(jwt: string, limit = 200): Promise<DocumentRow[]> {
  return pgrestSelect<DocumentRow>(
    `documents?select=${DOC_COLS}&order=created_at.desc&limit=${limit}`,
    jwt,
  );
}

/** Every ACTIVE filing in the firm — the anti-join input for the unassigned lane. */
export async function listActiveFilings(jwt: string): Promise<FilingRow[]> {
  return pgrestSelect<FilingRow>(
    `document_filings?retired_at=is.null&select=id,document_id,client_id,filed_at,filed_by,basis,retired_at,retirement_reason,revision_token`,
    jwt,
  );
}

/** All filings (active + retired) for one document — the detail filing history. */
export async function filingsForDocument(jwt: string, documentId: string): Promise<FilingRow[]> {
  return pgrestSelect<FilingRow>(
    `document_filings?document_id=eq.${encodeURIComponent(documentId)}` +
      `&select=id,document_id,client_id,filed_at,filed_by,basis,retired_at,retirement_reason,revision_token` +
      `&order=filed_at.desc`,
    jwt,
  );
}

export async function listClients(jwt: string): Promise<ClientRow[]> {
  return pgrestSelect<ClientRow>(`clients?select=id,name,status&order=name.asc`, jwt);
}

export async function attemptsForDocument(jwt: string, documentId: string): Promise<AttemptRow[]> {
  return pgrestSelect<AttemptRow>(
    `attribution_attempts?document_id=eq.${encodeURIComponent(documentId)}` +
      `&select=id,document_id,matcher_version,outcome,conflict_reason,created_at&order=created_at.desc`,
    jwt,
  );
}

/** Open candidates for the document's attempts (grouping input; confirm/dismiss). */
export async function openCandidates(jwt: string, attemptIds: string[]): Promise<CandidateRow[]> {
  if (attemptIds.length === 0) return [];
  const list = attemptIds.map((i) => encodeURIComponent(i)).join(",");
  return pgrestSelect<CandidateRow>(
    `attribution_candidates?attempt_id=in.(${list})&disposition=eq.open` +
      `&select=id,attempt_id,client_id,rank,rule_kind,disposition,created_at&order=rank.asc`,
    jwt,
  );
}

// ---------------------------------------------------------------------------
// Governed writers (HUMAN lane — 0007 §11 grants). Every call carries a fresh
// op_key; the writers are idempotent on (firm, fn, op_key).
// ---------------------------------------------------------------------------

const opKey = () => crypto.randomUUID();

/** Record a human document-subject resolution for a client → resolution_id.
 *  The uploader's explicit choice IS the human attribution act (contract §4.5). */
export async function recordDocumentResolution(
  jwt: string,
  documentId: string,
  clientId: string,
  source: string,
): Promise<string> {
  const out = (await rpc(
    "record_client_resolution",
    {
      p_client: clientId,
      p_subject_kind: "document",
      p_subject: documentId,
      p_confidence: 1.0,
      p_method: "human",
      p_evidence: { source },
      p_op_key: opKey(),
    },
    jwt,
  )) as { resolution_id?: string } | null;
  const id = out?.resolution_id;
  if (!id) throw new Error("record_client_resolution returned no resolution_id");
  return id;
}

/** File a document to a client via a recorded resolution (two-step per §4.5). */
export async function fileDocument(
  jwt: string,
  documentId: string,
  clientId: string,
  resolutionId: string,
): Promise<void> {
  await rpc(
    "file_document",
    { p_document: documentId, p_client: clientId, p_resolution: resolutionId, p_op_key: opKey() },
    jwt,
  );
}

/** record → file, the explicit uploader attribution act (contract §4.5). */
export async function fileToClient(jwt: string, documentId: string, clientId: string): Promise<void> {
  const resolutionId = await recordDocumentResolution(jwt, documentId, clientId, "documents_tab_file_to_client");
  await fileDocument(jwt, documentId, clientId, resolutionId);
}

export async function retireFiling(jwt: string, filingId: string, reason: string, expectedRevision: string): Promise<void> {
  await rpc(
    "retire_document_filing",
    { p_filing_id: filingId, p_reason: reason, p_expected_revision: expectedRevision, p_op_key: opKey() },
    jwt,
  );
}

/** Confirm a candidate AND file the document to its client in one governed call. */
export async function confirmCandidate(jwt: string, candidateId: string): Promise<void> {
  await rpc(
    "confirm_attribution_candidate",
    { p_candidate: candidateId, p_op_key: opKey(), p_file_document: true },
    jwt,
  );
}

export async function dismissCandidate(jwt: string, candidateId: string): Promise<void> {
  await rpc("dismiss_attribution_candidate", { p_candidate: candidateId, p_op_key: opKey() }, jwt);
}

// --- Wrong-client correction wizard (preview → record dest → propose → approve) --

export async function previewCorrection(
  jwt: string,
  documentId: string,
  fromClient: string,
  toClient: string,
): Promise<CorrectionPreview> {
  return (await rpc(
    "preview_wrong_client_correction",
    { p_document: documentId, p_from_client: fromClient, p_to_client: toClient },
    jwt,
  )) as CorrectionPreview;
}

export async function proposeCorrection(
  jwt: string,
  documentId: string,
  fromClient: string,
  toClient: string,
  reason: string,
): Promise<{ correction_id: string; plan_hash: string; books_version: number; status: string }> {
  return (await rpc(
    "propose_wrong_client_correction",
    { p_document: documentId, p_from_client: fromClient, p_to_client: toClient, p_reason: reason, p_op_key: opKey() },
    jwt,
  )) as { correction_id: string; plan_hash: string; books_version: number; status: string };
}

export async function approveCorrection(
  jwt: string,
  correctionId: string,
  planHash: string,
  attestation: string | null,
): Promise<{ correction_id: string; status: string }> {
  return (await rpc(
    "approve_wrong_client_correction",
    { p_correction: correctionId, p_plan_hash: planHash, p_attestation: attestation || null, p_op_key: opKey() },
    jwt,
  )) as { correction_id: string; status: string };
}

export async function placeLegalHold(jwt: string, documentId: string, reason: string): Promise<void> {
  await rpc("place_legal_hold", { p_document: documentId, p_reason: reason, p_op_key: opKey() }, jwt);
}

export async function releaseLegalHold(jwt: string, documentId: string, reason: string): Promise<void> {
  await rpc("release_legal_hold", { p_document: documentId, p_reason: reason, p_op_key: opKey() }, jwt);
}

// ---------------------------------------------------------------------------
// Slice-6 coding surfaces (contract §7 / INTERFACE-PINS §1/§4): a read-only
// uncoded-bills view + the coding-tasks list (AB-9's recode carrier as a real
// durable task). Writers are the governed human-lane fns; house act()/re-load
// idiom, no optimistic UI.
//
// Cross-lane note: list_uncoded_filings' jsonb shape and coding_tasks_visible's
// masked columns are 0009's (L1). The mappings/column lists below are the single
// place to reconcile at integration; reads are defensive.
// ---------------------------------------------------------------------------

/** A filing with no draft and no unreversed approved entry bound to it (C-15). */
export type UncodedFiling = {
  filing_id: string;
  document_id: string | null;
  client_id: string | null;
  filename: string | null;
  filed_at: string | null;
};

export type CodingTaskRow = {
  id: string;
  client_id: string | null;
  document_id: string | null;
  filing_id: string | null;
  origin: "correction" | "manual" | string;
  correction_id: string | null;
  status: "open" | "done" | "dismissed" | string;
  closed_reason: string | null; // open-reason is NOT exposed by the masked view
  result_entry_id: string | null;
  created_at: string | null;
  closed_at: string | null;
};

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** ACTIVE filings needing coding (read-only). p_client null = firm-wide. */
export async function listUncodedFilings(jwt: string, clientId?: string | null): Promise<UncodedFiling[]> {
  const rows = (await rpc("list_uncoded_filings", { p_client: clientId ?? null }, jwt)) as unknown;
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    return {
      filing_id: s(o.filing_id) ?? s(o.id) ?? "",
      document_id: s(o.document_id),
      client_id: s(o.client_id),
      filename: s(o.original_filename) ?? s(o.filename),
      filed_at: s(o.filed_at),
    };
  });
}

const CODING_TASK_COLS =
  "id,client_id,document_id,filing_id,origin,correction_id,status,closed_reason,result_entry_id,created_at,closed_at";

/** Coding tasks via the masked view. taskId lets the chat recode notification
 *  render one task's state by id (N-F18 — one surface, two rows). */
export async function listCodingTasks(jwt: string, opts?: { clientId?: string | null; taskId?: string }): Promise<CodingTaskRow[]> {
  const filters: string[] = [];
  if (opts?.taskId) filters.push(`id=eq.${encodeURIComponent(opts.taskId)}`);
  if (opts?.clientId) filters.push(`client_id=eq.${encodeURIComponent(opts.clientId)}`);
  const q = `coding_tasks_visible?${filters.length ? filters.join("&") + "&" : ""}select=${CODING_TASK_COLS}&order=created_at.desc`;
  return pgrestSelect<CodingTaskRow>(q, jwt);
}

/** Close a coding task as done, optionally referencing the coded result entry. */
export async function completeCodingTask(jwt: string, taskId: string, resultEntry: string | null): Promise<void> {
  await rpc("complete_coding_task", { p_task: taskId, p_result_entry: resultEntry, p_op_key: opKey() }, jwt);
}

export async function dismissCodingTask(jwt: string, taskId: string, reason: string): Promise<void> {
  await rpc("dismiss_coding_task", { p_task: taskId, p_reason: reason, p_op_key: opKey() }, jwt);
}
