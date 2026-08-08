// Slice-5 intake transport client (contract §4.1 / S5-D1 / INTERFACE-PINS 1-3).
// The runtime owns store-and-forward: the browser NEVER holds a storage
// credential and never computes the canonical sha — it only holds the short-lived
// intake upload token and streams bytes.
//
// Route topology (INTERFACE-PINS §1-3), three calls:
//   1. begin  — POST /api/intake/documents (JSON, Bearer JWT). ALWAYS same-origin
//               relative: only PUT+finalize get CORS on the Fly origin, so
//               begin-intake must ride the Next proxy (dev AND prod — server-side
//               rewrite reaches the runtime with no browser CORS involved).
//   2. bytes  — PUT ${runtimeBase()}/api/intake/documents/:id/bytes (octet-stream,
//               Bearer upload_token, streamed). When NEXT_PUBLIC_CLARA_RUNTIME_URL
//               is SET the browser goes DIRECT to Fly (bypasses the 4.5MB Vercel
//               proxy body cap). When it is EMPTY the PUT is same-origin and rides
//               the Next proxy — which is fine ONLY for a LOCAL runtime (`next dev`
//               has no 4.5MB cap); a Vercel deployment MUST set the runtime URL so
//               bytes never transit a serverless function.
//   3. finalize — POST ${runtimeBase()}/api/intake/documents/:id/finalize (JSON,
//               Bearer upload_token). Same origin rules as the byte PUT (the token
//               lane stays on one origin per §3.2 capability split).
//
// Status is NOT a runtime route: the chip/lane polls the masked PostgREST views on
// the JWT lane (the §3.2 token/poll split — the upload token authorizes PUT +
// finalize ONLY).

import { pgrestSelect, runtimeBase } from "./wire";

export type IntakeOrigin = "chat" | "documents_tab";

export type BeginIntakeRequest = {
  filename: string;
  mime: string;
  declaredBytes: number;
  origin: IntakeOrigin;
  sessionId?: string; // required when origin === 'chat'
};

export type BeginIntakeResponse = {
  intake_id: string;
  upload_token: string;
  expires_at: string | null;
};

// The masked definer view (0007 §7): the lane sees the uploader + firm rows, never
// the chat_session_id (S5-R6). document_id appears only at finalized/adopted.
export type IntakeStatus =
  | "uploading"
  | "received"
  | "verifying"
  | "verified"
  | "duplicate"
  | "finalized"
  | "adopted"
  | "failed";

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

export const INTAKE_TERMINAL: ReadonlySet<IntakeStatus> = new Set(["finalized", "adopted", "failed"]);
export const INTAKE_ADOPTED: ReadonlySet<IntakeStatus> = new Set(["finalized", "adopted"]);

/** Per-turn admission budget (S5-R8): chat = 5 files, 20MB each. */
export const CHAT_MAX_FILES = 5;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Transport (AGENT lane).
// ---------------------------------------------------------------------------

/** Begin an intake. Same-origin relative POST — rides the Next /api/intake proxy. */
export async function beginIntake(jwt: string, req: BeginIntakeRequest): Promise<BeginIntakeResponse> {
  const res = await fetch("/api/intake/documents", {
    method: "POST",
    cache: "no-store",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({
      filename: req.filename,
      mime: req.mime,
      declared_bytes: req.declaredBytes,
      origin: req.origin,
      ...(req.origin === "chat" ? { session_id: req.sessionId } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`begin intake failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as BeginIntakeResponse;
}

/** Stream the file bytes with the upload token. Direct-to-Fly when the runtime URL
 *  is set; the File/Blob body is streamed by the browser (no whole-file buffering). */
export async function putIntakeBytes(
  uploadToken: string,
  intakeId: string,
  file: File | Blob,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${runtimeBase()}/api/intake/documents/${encodeURIComponent(intakeId)}/bytes`, {
    method: "PUT",
    cache: "no-store",
    signal,
    headers: { authorization: `Bearer ${uploadToken}`, "content-type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`upload bytes failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

/** What clara.finalize_document_intake reports back about the 0051 §2 recovery door. Both
 *  keys are CONDITIONAL — an ordinary intake carries neither. */
export type IntakeRecovery = { mode?: string | null; lane?: string | null; task_id?: string | null };
export type IntakeRecoveryRefused = {
  reason?: string | null; remedy?: string | null; error_code?: string | null;
  document_mime?: string | null; upload_mime?: string | null; attempts?: number | null;
};
export type IntakeFinalizeReceipt = {
  status?: string | null;
  document_id?: string | null;
  recovery?: IntakeRecovery | null;
  recovery_refused?: IntakeRecoveryRefused | null;
};

/** Seal the intake (the runtime hashes, scans, uploads once, reads back, finalizes).
 *  The body is empty JSON — the runtime knows the spooled bytes; the browser never
 *  supplies the canonical sha (the sha↔bytes bond is the runtime's, HIGH-12).
 *
 *  RETURNS THE RECEIPT rather than discarding it (0051 §2). The recovery door answers HTTP
 *  202 with `status:'adopted'` whether it retried the document or refused to — and the refusal
 *  carries the only copy of WHY and what to do instead. Throwing that body away made a
 *  re-upload of a corrupt file look like a success to the person who sent it. */
export async function finalizeIntake(uploadToken: string, intakeId: string): Promise<IntakeFinalizeReceipt> {
  const res = await fetch(`${runtimeBase()}/api/intake/documents/${encodeURIComponent(intakeId)}/finalize`, {
    method: "POST",
    cache: "no-store",
    headers: { authorization: `Bearer ${uploadToken}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`finalize intake failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json().catch(() => ({}))) as IntakeFinalizeReceipt;
}

/** Human copy for a finalize receipt's recovery outcome, or null when the receipt carries
 *  none (every ordinary upload). Kept next to the wire type so the two move together.
 *
 *  The DB's own `remedy` text is preferred wherever it is present: it is the authoritative
 *  wording, and it is deliberately careful never to assert that the file is bad — a read can
 *  also fail because the reading service refused the request. */
export function recoveryCopy(receipt: IntakeFinalizeReceipt | null | undefined):
  { label: string; detail: string | null } | null {
  const refused = receipt?.recovery_refused;
  if (refused) {
    const detail = refused.remedy
      ?? (refused.reason === "mime_mismatch"
        ? `This document was stored as ${refused.document_mime ?? "another type"}; it was re-sent as ${refused.upload_mime ?? "a different type"}. Re-upload it in its original form.`
        : null);
    switch (refused.reason) {
      case "mime_mismatch": return { label: "Stored — not re-read (different file type)", detail };
      case "attempt_cap": return { label: "Stored — not re-read (retry attempts used up)", detail };
      case "lane_busy": return { label: "Stored — a read is already in progress", detail };
      case "not_retryable": return { label: "Stored — not re-read", detail };
      default: return { label: "Stored — not re-read", detail };
    }
  }
  if (receipt?.recovery) return { label: "Stored — re-reading this document…", detail: null };
  return null;
}

// ---------------------------------------------------------------------------
// Status polling (HUMAN/JWT lane — the masked views; no upload token).
// ---------------------------------------------------------------------------

const INTAKE_COLS =
  "id,uploaded_by,origin,original_filename,declared_mime,declared_bytes,status," +
  "document_id,failure_code,expires_at,created_at,updated_at";

export async function readIntake(jwt: string, intakeId: string): Promise<IntakeRow | null> {
  const rows = await pgrestSelect<IntakeRow>(
    `document_intakes_visible?id=eq.${encodeURIComponent(intakeId)}&select=${INTAKE_COLS}`,
    jwt,
  );
  return rows[0] ?? null;
}

/** Batch read intakes by id (hydrate persisted attachment chips — D-4/D-5). */
export async function readIntakesByIds(jwt: string, intakeIds: string[]): Promise<Map<string, IntakeRow>> {
  const ids = intakeIds.filter(Boolean);
  if (ids.length === 0) return new Map();
  const list = ids.map((i) => encodeURIComponent(i)).join(",");
  const rows = await pgrestSelect<IntakeRow>(
    `document_intakes_visible?id=in.(${list})&select=${INTAKE_COLS}`,
    jwt,
  );
  return new Map(rows.map((r) => [r.id, r]));
}

const TASK_COLS =
  "id,document_id,lane,status,version_n,attempt_count,error_code,created_at,started_at,finished_at,updated_at";

export async function readProcessingTasks(jwt: string, documentId: string): Promise<ProcessingTaskRow[]> {
  return pgrestSelect<ProcessingTaskRow>(
    `document_processing_tasks_visible?document_id=eq.${encodeURIComponent(documentId)}` +
      `&select=${TASK_COLS}&order=version_n.desc`,
    jwt,
  );
}

// ---------------------------------------------------------------------------
// Honest status copy (contract §4.4/§8: every state honest; held_egress reads
// "awaiting egress approval"; failures name the code; confidence NEVER a percent).
// ---------------------------------------------------------------------------

export function intakeStatusCopy(status: IntakeStatus, failureCode: IntakeFailureCode | null): string {
  switch (status) {
    case "uploading": return "Uploading…";
    case "received": return "Received — scanning…";
    case "verifying": return "Verifying…";
    // Honest-state law (§4.5 / MED-1): the transport NEVER files to a client —
    // finalize lands the document UNASSIGNED; "Filed" is reserved for an actual
    // active filing made later on the documents tab.
    case "verified": return "Verified — storing…";
    case "finalized": return "Stored — not yet filed";
    case "duplicate": return "Duplicate — adopting…";
    case "adopted": return "Stored — matched an existing document";
    case "failed": return `Failed${failureCode ? `: ${failureCode}` : ""}`;
  }
}

export function processingStatusCopy(status: ProcessingStatus, code: ProcessingErrorCode | null): string {
  switch (status) {
    case "queued": return "Extraction queued";
    case "held_egress": return "Awaiting egress approval";
    case "running": return "Extracting…";
    case "done": return "Extraction complete";
    case "failed": return `Extraction failed${code ? `: ${code}` : ""}`;
  }
}

// ---------------------------------------------------------------------------
// Client-side dedupe key (D-10 — "where cheap"). The server adopt path is the
// real dedupe; this only stops the SAME bytes being queued twice in one batch.
// Real sha256 for small files; cheap identity for large ones (no 20MB buffering).
// ---------------------------------------------------------------------------

const CHEAP_HASH_LIMIT = 8 * 1024 * 1024;

export async function dedupeKey(file: File): Promise<string> {
  if (file.size <= CHEAP_HASH_LIMIT && typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return `sha:${hex}`;
    } catch {
      // fall through to the cheap identity
    }
  }
  return `id:${file.name}:${file.size}:${file.lastModified}`;
}
