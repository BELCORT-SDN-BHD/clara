// Client Documents workbench — governed writers. Every verb below is a NAMED,
// granted `clara_authenticated` RPC (never a hand-written row) — see each
// function's own citation. All calls ride lib/doors.ts's `callDoor`: a
// `DoorRefusal` (a CLR-shaped SQLSTATE) propagates VERBATIM — this module never
// catches, re-words, or retries one. Every op_key is freshly minted per call
// (house idempotency idiom, apps/dashboard/app/documents/api.ts:153).

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

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
