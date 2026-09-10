// #634 — OPTIONAL AND LATE EVIDENCE on the accounting-work journal lane: the battery's extra
// gate, verb wrappers and readers (NOT a test file: the name does not end in `.test.mjs`).
//
// It sits BESIDE `work-journal-fixtures.mjs` rather than inside it: #634's migration is a
// separate frontier from #623's, and the two lanes' cells must be able to skip independently
// when `db-slice-frontiers` runs this package against a database pinned between them.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (all of it derived from ticket #634's own acceptance
// criteria and the C3 contract, never by reading the migration):
//
//   clara.admit_journal_work(..., p_source_refs, ...)   now validates each element and refuses a
//                                                       document already backing a posted entry
//   clara.attach_entry_evidence(p_entry, p_document, p_expected_revision, p_op_key) -> jsonb
//   clara.list_entry_links(p_client, p_entries uuid[])  -> jsonb array

import { rootQuery, humanQuery, opk } from "./work-journal-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export * from "./work-journal-fixtures.mjs";

// ===========================================================================================
// 1 · The #634 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

/** The #634 migration's STABLE STEM. */
export const EVIDENCE_STEM = "journal_work_evidence$";

let _ready = null;
export async function evidenceLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [EVIDENCE_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateEvidence(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateEvidence(t) {
  if (await evidenceLaneReady()) return false;
  markSkip();
  t.skip(`#634 journal-evidence lane absent (no ${EVIDENCE_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The vocabulary this battery asserts on. Closed set, exactly as #623's REASON is.
// ===========================================================================================

export const EVIDENCE_REASON = {
  invalidSourceRef: "invalid_source_ref",
  sourceAlreadyPosted: "source_already_posted",
  sourceConflict: "source_conflict",
  evidenceAlreadyAttached: "evidence_already_attached",
  entryNotFound: "entry_not_found",
  entryNotApproved: "entry_not_approved",
  staleRevision: "stale_revision",
  invalidOpKey: "invalid_op_key",
  clientNotFound: "client_not_found",
  tooManyEntries: "too_many_entries",
  operationInFlight: "operation_in_flight",
  operationConflict: "operation_payload_conflict",
};

/** CLR06 is the estate's optimistic-concurrency refusal (`approve_entry`'s revision token). */
export const EVIDENCE_CLR = { stale: "CLR06" };

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only.
// ===========================================================================================

export async function attachEntryEvidence(sub, { entry, document, expectedRevision, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.attach_entry_evidence(p_entry => $1::uuid, p_document => $2::uuid,"
    + " p_expected_revision => $3::uuid, p_op_key => $4::text) as result",
    [entry, document, expectedRevision, opKey ?? opk("w634-attach")]);
  return r.rows[0].result;
}

export async function listEntryLinks(sub, { client, entries }) {
  const r = await humanQuery(sub,
    "select clara.list_entry_links(p_client => $1::uuid, p_entries => $2::uuid[]) as result",
    [client, entries]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · World helpers — documents, filings and their retirement, through the estate's OWN doors.
// ===========================================================================================

/** A verified document FILED to this client, through clara.file_document (the estate's door).
 *  Returns `{ documentId, filingId, sha256 }`. */
export async function evidenceDocument(sub, { firm, client, kind = "invoice" }) {
  const { filedDocument } = await import("./s6-helpers.mjs");
  return filedDocument(sub, { firm, client, kind });
}

/** Retire a filing through clara.retire_document_filing — the estate's own human door, never a
 *  hand-set `retired_at` (which `ck_document_filings_retirement` would refuse anyway). */
export async function retireFiling(sub, { filing, reason = "#634 rig: source withdrawn" }) {
  const rev = await rootQuery(
    "select revision_token from clara.document_filings where id=$1", [filing]);
  const r = await humanQuery(sub,
    "select clara.retire_document_filing(p_filing_id => $1::uuid, p_reason => $2::text,"
    + " p_expected_revision => $3::uuid, p_op_key => $4::text) as result",
    [filing, reason, rev.rows[0].revision_token, opk("w634-retire")]);
  return r.rows[0].result;
}

/** A `document` source ref, in the shape admission accepts. */
export const docRef = (documentId) => ({ kind: "document", document_id: documentId });

// ===========================================================================================
// 5 · Readers.
// ===========================================================================================

export async function linksForEntry(entry) {
  const r = await rootQuery(
    "select * from clara.entry_evidence_links where entry_id=$1 order by attached_at", [entry]);
  return r.rows;
}

export async function linksForDocument(document) {
  const r = await rootQuery(
    "select * from clara.entry_evidence_links where document_id=$1", [document]);
  return r.rows;
}

export async function linkCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.entry_evidence_links where client_id=$1", [client]);
  return r.rows[0].n;
}

export async function entryRow(entry) {
  const r = await rootQuery(
    "select id, status, origin, document_id, filing_id, source_doc_sha256, revision_token,"
    + " reversal_of, reversed_by, reversal_reason from clara.journal_entries where id=$1", [entry]);
  return r.rows[0] ?? null;
}

/** The op_receipts row one human door reserved under one key — the "nothing was reserved"
 *  half of a BEFORE-any-reservation refusal. */
export async function opReceiptCount(fn, opKey) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn=$1 and op_key=$2", [fn, opKey]);
  return r.rows[0].n;
}
