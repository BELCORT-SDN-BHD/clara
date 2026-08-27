// Row/wire shapes for the client Documents workbench (P3). Every field name and
// every enum member is COPIED from a live migration or the apps/dashboard mechanism
// this ports (never invented) — see reads.ts/doors.ts/intake.ts headers for the
// file:line grounding of each read/verb. This module carries no logic.

export type ExtractionStatus =
  | "pending" | "running" | "done" | "failed"
  | "skipped_structured_done" | "stored_unparsed" | "held_egress";

// clara.documents (packages/db/migrations/0003_books_core.sql:64-77, widened by
// 0007's document_kind/financial_date/retention/legal_hold columns and 0123's
// documents_document_kind_check, packages/db/migrations/0123_f_a7_gamma_egress.sql:2054-2061).
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
  extraction_status: ExtractionStatus;
  document_kind: string | null;
  financial_date: string | null;
  retention_state: "unanchored" | "anchored";
  retain_until: string | null;
  retention_basis: string | null;
  legal_hold: boolean;
  legal_hold_reason: string | null;
};

// clara.document_filings — basis widened with 'judgement' by
// packages/db/migrations/0125_f_a7_alpha2_judgement_recut.sql:167-170 (an agent-lane
// filing under the F-A7 wake surface; apps/dashboard's own FilingRow predates that
// widening and is missing it).
export type FilingRow = {
  id: string;
  document_id: string;
  client_id: string;
  filed_at: string;
  filed_by: string | null;
  basis: "legacy-0007" | "human" | "rule" | "correction" | "seed-0007" | "judgement";
  retired_at: string | null;
  retirement_reason: string | null;
  revision_token: string;
};

export type ClientRow = { id: string; name: string | null; status: string };

// clara.attribution_attempts (packages/db/migrations/0007_document_pipeline.sql:256-...).
export type AttemptRow = {
  id: string;
  document_id: string;
  matcher_version: string;
  outcome: "abstained" | "candidate" | "rule_resolved";
  conflict_reason: string | null;
  created_at: string;
};

// clara.attribution_candidates.
export type CandidateRow = {
  id: string;
  attempt_id: string;
  client_id: string;
  rank: number;
  rule_kind: "name_exact" | "alias_exact";
  disposition: "open" | "confirmed" | "dismissed";
  created_at: string;
};

// clara.document_extractions (0007_document_pipeline.sql:183-199).
export type ExtractionRow = {
  id: string;
  document_id: string;
  engine_id: string;
  engine_kind: "ocr" | "structured_parse";
  version_n: number;
  superseded_by: string | null;
  status: "done" | "failed";
  page_count: number | null;
  extracted_at: string;
};

// clara.document_regions (0007_document_pipeline.sql:203-221) — read-only evidence;
// this workbench never overlays these onto a page image (see the "not built yet"
// evidence-overlay note in document-detail.tsx — that viewer exists only for the
// chat-wire doc_review card today).
export type RegionRow = {
  id: string;
  extraction_id: string;
  locator_kind: "page_polygon" | "sheet_cell_range" | "row_col" | "paragraph_run";
  field_path: string | null;
  text_content: string | null;
  engine_confidence: number | null;
  monetary_raw: string | null;
  monetary_cents: number | null;
};

// clara.journal_entries (0003_books_core.sql:101-128) — table-readable directly by
// clara_authenticated (grant select …, 0003_books_core.sql:522-525), RLS-scoped by
// firm_id = jwt_firm() only (0003:514) — this module adds the client_id/document_id
// filter itself, same pattern as apps/dashboard/app/shared/openingApi.ts:187-190's
// direct journal_entries read.
export type JournalEntryRow = {
  id: string;
  client_id: string;
  status: "draft" | "approved";
  posting_date: string;
  memo: string | null;
  origin: "manual" | "document" | "agent" | "reversal";
  document_id: string | null;
  is_opening_balance: boolean;
  tax_affecting: boolean;
  approved_at: string | null;
  reversal_of: string | null;
  reversed_by: string | null;
  created_at: string;
};

// clara.document_intakes_visible masked view (apps/dashboard/app/shared/intake.ts:46-73).
export type IntakeOrigin = "chat" | "documents_tab";
export type IntakeStatus =
  | "uploading" | "received" | "verifying" | "verified"
  | "duplicate" | "finalized" | "adopted" | "failed";
export type IntakeFailureCode =
  | "too_large" | "bad_type" | "limit" | "checksum_mismatch" | "storage_error"
  | "expired" | "malware_detected" | "quarantined" | "internal";

export type IntakeRow = {
  id: string;
  uploaded_by: string;
  origin: IntakeOrigin;
  original_filename: string;
  declared_mime: string;
  declared_bytes: number;
  status: IntakeStatus;
  document_id: string | null;
  failure_code: IntakeFailureCode | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

// clara.document_processing_tasks_visible masked view (apps/dashboard/app/shared/intake.ts:81-93).
export type ProcessingLane = "ocr" | "structured_parse" | "none";
export type ProcessingStatus = "queued" | "held_egress" | "running" | "done" | "failed";
export type ProcessingErrorCode =
  | "engine_error" | "timeout" | "engine_lost" | "storage_error" | "corrupt"
  | "encrypted" | "bad_type" | "limit" | "internal";

export type ProcessingTaskRow = {
  id: string;
  document_id: string;
  lane: ProcessingLane;
  status: ProcessingStatus;
  version_n: number;
  attempt_count: number;
  error_code: ProcessingErrorCode | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

// clara.documents_document_kind_check, verbatim
// (packages/db/migrations/0123_f_a7_gamma_egress.sql:2056-2061 — the 20-value form;
// apps/dashboard/app/documents/api.ts:268-274's copy predates 'identity_document' and
// is one short). The DB re-validates on every write; this is a UI convenience only.
export const DOCUMENT_KINDS = [
  "invoice", "receipt", "credit_note", "debit_note", "bank_statement",
  "payment_voucher", "claim_form", "payroll_summary", "tax_correspondence",
  "ssm_company_doc", "agreement_contract", "e_invoice_xml", "management_account",
  "opening_balance_doc", "knowledge_artifact", "handwritten_note", "consent_evidence",
  "prior_gl", "other", "identity_document",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const INTAKE_ADOPTED: ReadonlySet<IntakeStatus> = new Set(["finalized", "adopted"]);

/** Per-turn admission budget mirrored from the runtime's own cap
 *  (apps/dashboard/app/shared/intake.ts:99-100). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
