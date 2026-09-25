// Client Documents workbench — governed writers. Every verb below is a NAMED,
// granted `clara_authenticated` RPC (never a hand-written row) — see each
// function's own citation. All calls ride lib/doors.ts's `callDoor`: a
// `DoorRefusal` (a CLR-shaped SQLSTATE) propagates VERBATIM — this module never
// catches, re-words, or retries one. Every op_key is freshly minted per call
// (house idempotency idiom, apps/dashboard/app/documents/api.ts:153).

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { RequestAutodraftResult, RequestReextractionResult, SourceRevisionResult } from "./types";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const opKey = () => crypto.randomUUID();

/** Record a human document-subject resolution → resolution_id. The explicit human
 *  choice IS the attribution act (apps/dashboard/app/documents/api.ts:157-179's
 *  `recordDocumentResolution`, `record_client_resolution` granted at
 *  packages/db/migrations/0004_governed_fns.sql:775). */
export async function recordDocumentResolution(
  documentId: string,
  clientId: string,
  source: string,
  opts: Opts = {},
): Promise<string> {
  const out = (await callDoor<{ resolution_id?: string }>(
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
    opts,
  )) ?? {};
  const id = out.resolution_id;
  if (!id) throw new Error("record_client_resolution returned no resolution_id");
  return id;
}

/** File a document to a client via a recorded resolution — two-step per
 *  apps/dashboard/app/documents/api.ts:181-193/196-199 (`file_document`, granted/
 *  redefined at packages/db/migrations/0124_f_a7_alpha1_file_document_extraction.sql:
 *  160-170; signature unchanged from 0009's live tip). */
export async function fileDocument(
  documentId: string,
  clientId: string,
  resolutionId: string,
  opts: Opts = {},
): Promise<void> {
  await callDoor("file_document", { p_document: documentId, p_client: clientId, p_resolution: resolutionId, p_op_key: opKey() }, opts);
}

/** record → file, the explicit uploader/bookkeeper attribution act. */
export async function fileToClient(documentId: string, clientId: string, source: string, opts: Opts = {}): Promise<void> {
  const resolutionId = await recordDocumentResolution(documentId, clientId, source, opts);
  await fileDocument(documentId, clientId, resolutionId, opts);
}

/** Retire an active filing (`retire_document_filing`,
 *  apps/dashboard/app/documents/api.ts:201-207). */
export async function retireFiling(filingId: string, reason: string, expectedRevision: string, opts: Opts = {}): Promise<void> {
  await callDoor("retire_document_filing", { p_filing_id: filingId, p_reason: reason, p_expected_revision: expectedRevision, p_op_key: opKey() }, opts);
}

/** Confirm a candidate AND file it in one governed call
 *  (`confirm_attribution_candidate`, apps/dashboard/app/documents/api.ts:210-216). */
export async function confirmCandidate(candidateId: string, opts: Opts = {}): Promise<void> {
  await callDoor("confirm_attribution_candidate", { p_candidate: candidateId, p_op_key: opKey(), p_file_document: true }, opts);
}

/** Dismiss an open candidate (`dismiss_attribution_candidate`,
 *  apps/dashboard/app/documents/api.ts:218-220). */
export async function dismissCandidate(candidateId: string, opts: Opts = {}): Promise<void> {
  await callDoor("dismiss_attribution_candidate", { p_candidate: candidateId, p_op_key: opKey() }, opts);
}

/** The audited classify/correction lane — a reason is REQUIRED by the DB (CLR10
 *  otherwise; `set_document_kind`, apps/dashboard/app/documents/api.ts:278-284,
 *  re-cut at packages/db/migrations/0123_f_a7_gamma_egress.sql:1949). */
export async function setDocumentKind(documentId: string, kind: string, reason: string, opts: Opts = {}): Promise<void> {
  await callDoor("set_document_kind", { p_document: documentId, p_kind: kind, p_reason: reason, p_op_key: opKey() }, opts);
}

/** Admin-floor legal hold (`place_legal_hold`/`release_legal_hold`,
 *  apps/dashboard/app/documents/api.ts:286-292). A non-admin token refuses
 *  honestly (CLR) — the door renders that verbatim, never a fabricated success. */
export async function placeLegalHold(documentId: string, reason: string, opts: Opts = {}): Promise<void> {
  await callDoor("place_legal_hold", { p_document: documentId, p_reason: reason, p_op_key: opKey() }, opts);
}
export async function releaseLegalHold(documentId: string, reason: string, opts: Opts = {}): Promise<void> {
  await callDoor("release_legal_hold", { p_document: documentId, p_reason: reason, p_op_key: opKey() }, opts);
}

/** Immutable, hash-bound plan (`propose_wrong_client_correction`,
 *  apps/dashboard/app/documents/api.ts:237-249, re-cut at
 *  packages/db/migrations/0125_f_a7_alpha2_judgement_recut.sql:450). */
export async function proposeCorrection(
  documentId: string, fromClient: string, toClient: string, reason: string, opts: Opts = {},
): Promise<{ correction_id: string; plan_hash: string; books_version: number; status: string }> {
  return (await callDoor(
    "propose_wrong_client_correction",
    { p_document: documentId, p_from_client: fromClient, p_to_client: toClient, p_reason: reason, p_op_key: opKey() },
    opts,
  )) as { correction_id: string; plan_hash: string; books_version: number; status: string };
}

/** Approve by a DISTINCT eligible checker, or a solo-firm attestation
 *  (`approve_wrong_client_correction`, apps/dashboard/app/documents/api.ts:251-262,
 *  re-cut at packages/db/migrations/0125_f_a7_alpha2_judgement_recut.sql:490). CLR19
 *  (same-checker) and every other refusal render verbatim — never retried. */
export async function approveCorrection(
  correctionId: string, planHash: string, attestation: string | null, opts: Opts = {},
): Promise<{ correction_id: string; status: string }> {
  return (await callDoor(
    "approve_wrong_client_correction",
    { p_correction: correctionId, p_plan_hash: planHash, p_attestation: attestation || null, p_op_key: opKey() },
    opts,
  )) as { correction_id: string; status: string };
}

// --- T6 (port-wave plan §4) ------------------------------------------------------

/** clara.request_autodraft(p_filing uuid) -> jsonb — bookkeeper+. Refuses
 *  CLR10 (filing required) and CLR11 (active filing not found); every OTHER
 *  outcome is a 200 response — types.ts's `AutodraftOutcome` header
 *  enumerates the full closed set `admit_autodraft_task` (the core this
 *  delegates to) can return: an admission (`admitted`/`re_admitted`/
 *  `re_admitted_after_withdrawal`), a no-op (`noop_existing`/
 *  `already_done`), or a real, honest hold (`skipped_direction` — the sales
 *  lane isn't open yet; `refused_budget` — today's spend cap;
 *  `refused_attempts` — this filing already burned its attempts;
 *  `lane_changed` — not in a ready coding lane right now). The caller
 *  renders `outcome` (never invents different words for it) rather than
 *  treating anything but the two real CLRs as a failure. */
export async function requestAutodraft(filingId: string, opts: Opts = {}): Promise<RequestAutodraftResult> {
  const out = (await callDoor<Record<string, unknown>>("request_autodraft", { p_filing: filingId }, opts)) ?? {};
  return {
    outcome: String(out.outcome ?? "unknown"),
    task_id: typeof out.task_id === "string" ? out.task_id : null,
    reason: typeof out.reason === "string" ? out.reason : null,
    lane: typeof out.lane === "string" ? out.lane : null,
    reasons: out.reasons ?? null,
    direction: typeof out.direction === "string" ? out.direction : null,
    cap: typeof out.cap === "number" ? out.cap : null,
    used: typeof out.used === "number" ? out.used : null,
  };
}

/** clara.request_reextraction(p_document uuid, p_reason text, p_op_key text)
 *  -> jsonb — bookkeeper+. A non-blank reason is required (CLR10 otherwise —
 *  this module never sends a blank one, but the DB is still the arbiter).
 *  Refuses CLR11 (foreign document) and CLR16 for every kind-mismatch /
 *  no-admissible-door case (the four admission doors — reextraction,
 *  receipt_backfill, filed_bootstrap, failed_retry — governance-doors.ts's
 *  sibling header on this file walks each one; this client-side module
 *  replicates none of that judgement, it only names the verb and renders the
 *  DB's own admission label back). */
export async function requestReextraction(documentId: string, reason: string, opts: Opts = {}): Promise<RequestReextractionResult> {
  const out = (await callDoor<Record<string, unknown>>(
    "request_reextraction",
    { p_document: documentId, p_reason: reason, p_op_key: opKey() },
    opts,
  )) ?? {};
  return {
    task_id: typeof out.task_id === "string" ? out.task_id : null,
    document_id: String(out.document_id ?? documentId),
    version_n: typeof out.version_n === "number" ? out.version_n : null,
    status: typeof out.status === "string" ? out.status : null,
    reused: out.reused === true,
    admission: String(out.admission ?? "unknown"),
    lane: typeof out.lane === "string" ? out.lane : null,
    extraction_id: typeof out.extraction_id === "string" ? out.extraction_id : null,
    reason: typeof out.reason === "string" ? out.reason : null,
  };
}

/** clara.classify_consent_evidence_document(p_document uuid, p_reason text,
 *  p_op_key text) -> jsonb — OWNER-only (`_human_ctx(role_rank('owner'))`,
 *  the highest floor any T6 door carries). A non-blank reason is required.
 *  Refuses CLR11 (foreign document) and CLR28 for both "not an ingested,
 *  bytes-verified document" (`evidence_mismatch`) and "already carries a
 *  CODED kind, not other/consent_evidence" (`evidence_kind_conflict`) — both
 *  rendered verbatim; this module invents no client-side eligibility check
 *  ahead of the DB's own read. */
export async function classifyConsentEvidenceDocument(
  documentId: string, reason: string, opts: Opts = {},
): Promise<{ document_id: string; document_kind: string; prior_kind: string | null }> {
  return (await callDoor(
    "classify_consent_evidence_document",
    { p_document: documentId, p_reason: reason, p_op_key: opKey() },
    opts,
  )) as { document_id: string; document_kind: string; prior_kind: string | null };
}

// --- #646 (migration 0217) -------------------------------------------------------

/** `clara.revise_document_fact(p_document uuid, p_field_path text, p_value jsonb,
 *  p_observed_version int, p_reason text, p_op_key text) -> jsonb` — bookkeeper+.
 *
 *  A human revision of ONE typed fact. The DB appends a whole new `clara-fact-human:v1`
 *  extraction carrying the fact set with this field changed; it never edits a region in place.
 *  `observedVersion` is the facts version the human was READING (`list_source_revisions`'
 *  `facts_version`): if it has moved the door refuses CLR19 `stale_source_version` and hands the
 *  attempted value back in `detail` so this surface can re-show it. Every other refusal
 *  (`field_path_syntax` / `field_path_namespace` from the canonical grammar,
 *  `field_path_not_revisable`, `typed_facts_not_supported`, `no_facts_to_revise`,
 *  `monetary_value_malformed`, `component_must_not_be_negative`, `live_bank_statement_present`,
 *  `value_unchanged`) renders VERBATIM — this module replicates none of that judgement.
 *
 *  `value_unchanged` (#885, widened by #1030's 0321) is the one this list used to omit, and it
 *  renders verbatim like the rest: the door refuses a revision that leaves the recorded value
 *  where it was, BEFORE anything is written — judged per field against whatever canonical form the
 *  estate keeps for it (the cents for money, the ISO 4217 code for `invoice.currency`, the
 *  calendar day for `invoice.invoice_date`, and the trimmed text for everything else, where the
 *  recorded spelling IS the fact). `detail` carries `field_path` and the `value` that was
 *  attempted. */
export async function reviseDocumentFact(
  documentId: string, fieldPath: string, value: string, observedVersion: number, reason: string,
  opts: Opts = {},
): Promise<SourceRevisionResult> {
  return (await callDoor(
    "revise_document_fact",
    {
      p_document: documentId, p_field_path: fieldPath, p_value: value,
      p_observed_version: observedVersion, p_reason: reason, p_op_key: opKey(),
    },
    opts,
  )) as SourceRevisionResult;
}

/** `clara.dismiss_orphaned_classification_question(p_question uuid, p_reason text, p_op_key text)`
 *  — bookkeeper+. Closes a classification question whose (document, client) pair carries ZERO live
 *  filings; a question that still has a live filing refuses CLR10 `filing_still_live` and belongs
 *  to `resolve_open_question` instead. */
export async function dismissOrphanedClassificationQuestion(
  questionId: string, reason: string, opts: Opts = {},
): Promise<{ question_id: string; status: string }> {
  return (await callDoor(
    "dismiss_orphaned_classification_question",
    { p_question: questionId, p_reason: reason, p_op_key: opKey() },
    opts,
  )) as { question_id: string; status: string };
}
