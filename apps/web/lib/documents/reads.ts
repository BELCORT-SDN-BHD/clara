// Client Documents workbench — read side (mohe-grill-rulings-2026-08-27.md Q8:
// "workbench-first … direct RLS reads, zero wire change"). Every relation/view name
// below is the LIVE one, grounded against apps/dashboard/app/documents/api.ts (the
// human-lane plumbing page this ports MECHANISM from, never look) and the migrations
// that grant it — cited per function. All reads ride lib/read.ts's `getRows`
// (RLS-scoped GETs); hydrate-never-trust binds every caller (lib/parts/hooks.ts's
// `useHydratedPart`, wired by components/documents/*).

import { getRows } from "@/lib/read";
import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type {
  AttemptRow, CandidateRow, ClientRow, DocumentExtractResult, DocumentRow, ExtractionRow,
  FilingRow, JournalEntryRow, RegionRow,
} from "./types";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const DOC_COLS =
  "id,sha256,original_filename,mime_type,byte_size,storage_path,uploaded_by,created_at," +
  "bytes_verified_at,page_count,extraction_status,document_kind,financial_date," +
  "retention_state,retain_until,retention_basis,legal_hold,legal_hold_reason";

/** Batch-read documents by id (apps/dashboard/app/shared/intake.ts:227-236's
 *  readIntakesByIds batching pattern, ported to `documents`). Empty input short-circuits
 *  to `[]` WITHOUT a request — an `in.()` PostgREST filter is malformed, and a request
 *  the caller can prove is pointless must never be sent (read.ts header, law 2's
 *  absence posture). */
export async function listDocumentsByIds(ids: string[], opts: Opts = {}): Promise<DocumentRow[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const list = unique.map((i) => encodeURIComponent(i)).join(",");
  return getRows<DocumentRow>(`documents?id=in.(${list})&select=${DOC_COLS}`, opts);
}

const FILING_COLS = "id,document_id,client_id,filed_at,filed_by,basis,retired_at,retirement_reason,revision_token";

/** This client's ACTIVE filings — grounded on
 *  apps/dashboard/app/documents/api.ts:107-113's `listActiveFilings`, narrowed from
 *  firm-wide to `client_id=eq.` (0007_document_pipeline.sql:780-781 grants the RLS
 *  read firm-wide; this module adds the client scope itself, same pattern as
 *  apps/dashboard/app/shared/openingApi.ts's direct table reads). */
export async function listActiveFilingsForClient(clientId: string, opts: Opts = {}): Promise<FilingRow[]> {
  return getRows<FilingRow>(
    `document_filings?client_id=eq.${encodeURIComponent(clientId)}&retired_at=is.null&select=${FILING_COLS}&order=filed_at.desc`,
    opts,
  );
}

/** Every filing (active + retired) for one document — the detail panel's history,
 *  grounded on apps/dashboard/app/documents/api.ts:116-123's `filingsForDocument`. */
export async function listFilingsForDocument(documentId: string, opts: Opts = {}): Promise<FilingRow[]> {
  return getRows<FilingRow>(
    `document_filings?document_id=eq.${encodeURIComponent(documentId)}&select=${FILING_COLS}&order=filed_at.desc`,
    opts,
  );
}

/** Open (unresolved) attribution candidates for this client — "needs your
 *  confirmation" (attribution_candidates.disposition, a DB-named state; grounded on
 *  apps/dashboard/app/documents/api.ts:138-146's `openCandidates`, narrowed by
 *  client_id instead of attempt_id since this surface is client-scoped). */
export async function listOpenCandidatesForClient(clientId: string, opts: Opts = {}): Promise<CandidateRow[]> {
  return getRows<CandidateRow>(
    `attribution_candidates?client_id=eq.${encodeURIComponent(clientId)}&disposition=eq.open` +
      `&select=id,attempt_id,client_id,rank,rule_kind,disposition,created_at&order=rank.asc`,
    opts,
  );
}

/** Batch-read attribution attempts by id — resolves a candidate's `document_id`
 *  (attribution_candidates carries no document_id of its own; it points at the
 *  attempt, which does — apps/dashboard/app/documents/api.ts:50-57's AttemptRow). */
export async function listAttemptsByIds(ids: string[], opts: Opts = {}): Promise<AttemptRow[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const list = unique.map((i) => encodeURIComponent(i)).join(",");
  return getRows<AttemptRow>(
    `attribution_attempts?id=in.(${list})&select=id,document_id,matcher_version,outcome,conflict_reason,created_at`,
    opts,
  );
}

/** Every extraction for a document, newest version first — the detail panel picks
 *  the highest `version_n` with `status='done'` and no `superseded_by` as "current".
 *  Grants: 0007_document_pipeline.sql:784-787 (`p_document_extractions_human`). */
export async function listExtractionsForDocument(documentId: string, opts: Opts = {}): Promise<ExtractionRow[]> {
  return getRows<ExtractionRow>(
    `document_extractions?document_id=eq.${encodeURIComponent(documentId)}` +
      `&select=id,document_id,engine_id,engine_kind,version_n,superseded_by,status,page_count,extracted_at` +
      `&order=version_n.desc`,
    opts,
  );
}

/** Batch-read extracted regions by extraction id — the plain-text evidence list
 *  (no page-overlay viewer; see document-detail.tsx's "not built yet" note). Grants:
 *  0007_document_pipeline.sql:788-791 (`p_document_regions_human`). */
export async function listRegionsForExtractionIds(extractionIds: string[], opts: Opts = {}): Promise<RegionRow[]> {
  const unique = Array.from(new Set(extractionIds.filter(Boolean)));
  if (unique.length === 0) return [];
  const list = unique.map((i) => encodeURIComponent(i)).join(",");
  return getRows<RegionRow>(
    `document_regions?extraction_id=in.(${list})` +
      `&select=id,extraction_id,locator_kind,field_path,text_content,engine_confidence,monetary_raw,monetary_cents`,
    opts,
  );
}

/** Journal entries citing this document, FILED TO THIS CLIENT — a DIRECT
 *  `journal_entries` read (clara_authenticated holds SELECT, RLS-scoped to firm
 *  ONLY: packages/db/migrations/0003_books_core.sql:507-525 — client-scoping is
 *  this module's OWN filter, not an RLS boundary). Independent review 2026-08-27,
 *  F4: `client_id` is REQUIRED, not optional — a document a wrong-client correction
 *  moved elsewhere still carries entries under its OLD client_id, and this is a
 *  client-scoped surface; omitting the filter would list another client's entries
 *  unlabeled. No RPC answers "entries for a document" — get_doc_entry_diff/
 *  get_entry_diff both need an entry_id, not a document_id
 *  (packages/db/migrations/0011_daily_loop.sql:3621,3681) — so this is a
 *  first-party table read, not a port of an existing dashboard call site. */
export async function listEntriesForDocument(documentId: string, clientId: string, opts: Opts = {}): Promise<JournalEntryRow[]> {
  return getRows<JournalEntryRow>(
    `journal_entries?document_id=eq.${encodeURIComponent(documentId)}&client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id,client_id,status,posting_date,memo,origin,document_id,is_opening_balance,tax_affecting,approved_at,reversal_of,reversed_by,created_at` +
      `&order=posting_date.desc,created_at.desc`,
    opts,
  );
}

/** Firm clients — the correction wizard's "move to" picker (apps/dashboard/app/
 *  documents/api.ts:125-127's `listClients`). */
export async function listFirmClients(opts: Opts = {}): Promise<ClientRow[]> {
  return getRows<ClientRow>(`clients?select=id,name,status&order=name.asc`, opts);
}

export type CorrectionPreview = {
  document_id: string;
  from_client: string;
  to_client: string;
  filing_id: string;
  books_version: number;
  items: Array<{
    entry_id: string; entry_state_hash: string;
    action: "reverse" | "already_reversed" | "withdraw_draft";
    posting_date: string | null; status: string; period_state: string;
  }>;
  period_model: string;
  closed_period_blockers: unknown[];
  subledger_model: string;
};

// read RPC — transport via callDoor; not a governed act: no confirmation UI, no
// re-read-after semantics. `preview_wrong_client_correction` takes no op_key and
// mutates nothing (apps/dashboard/app/documents/api.ts:224-235's own "Read-only
// blast-radius preview" comment) — it rides callDoor only because it is a POST
// .../rpc/ call like any other PostgREST RPC, not because it is a write.
export async function readCorrectionPreview(
  documentId: string, fromClient: string, toClient: string, opts: Opts = {},
): Promise<CorrectionPreview> {
  return (await callDoor<CorrectionPreview>(
    "preview_wrong_client_correction",
    { p_document: documentId, p_from_client: fromClient, p_to_client: toClient },
    opts,
  ))!;
}

// --- T6 (port-wave plan §4) ------------------------------------------------------

/** clara.get_document_extract(p_document uuid, p_client uuid, p_max_chars
 *  integer) -> jsonb, STABLE — read RPC (transport via callDoor; not a
 *  governed act: no confirmation UI, no re-read-after semantics). The same
 *  budgeted envelope+region text the agent reads under (types.ts's own
 *  header). `p_max_chars` defaults to 20000 server-side; this module always
 *  passes it explicitly so the UI's own "budgeted to N characters" note is
 *  never guessing at the DB's default. */
export async function getDocumentExtract(
  documentId: string, clientId: string | null, maxChars = 20000, opts: Opts = {},
): Promise<DocumentExtractResult> {
  return (await callDoor<DocumentExtractResult>(
    "get_document_extract",
    { p_document: documentId, p_client: clientId, p_max_chars: maxChars },
    opts,
  ))!;
}
