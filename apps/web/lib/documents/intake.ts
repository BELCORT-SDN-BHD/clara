// Client Documents workbench — upload/intake, ported MECHANISM (never look) from
// apps/dashboard/app/shared/intake.ts. The runtime owns store-and-forward: the
// browser never holds a storage credential and never computes the canonical sha256
// (INTERFACE-PINS 1-3). Route topology, three calls:
//   1. begin     — POST /api/intake/documents (JSON, Bearer session JWT). ALWAYS
//                  same-origin relative — rides next.config.ts's `/api/intake/:path*`
//                  rewrite to the runtime (no browser CORS involved).
//   2. bytes     — PUT ${runtimeBase()}/api/intake/documents/:id/bytes (octet-stream,
//                  Bearer upload_token, streamed).
//   3. finalize  — POST ${runtimeBase()}/api/intake/documents/:id/finalize (JSON,
//                  Bearer upload_token).
// Status polling is NOT a runtime route — it rides the masked PostgREST views
// (document_intakes_visible / document_processing_tasks_visible,
// packages/db/migrations/0007_document_pipeline.sql:2233-2241, granted at 0007:2747)
// via lib/read.ts's `getRows` — the HUMAN/JWT lane, no upload token.

import { getRows } from "@/lib/read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";
import { INTAKE_ADOPTED, type IntakeFailureCode, type IntakeOrigin, type IntakeRow, type IntakeStatus, type ProcessingTaskRow } from "./types";

function runtimeBase(): string {
  return (process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL ?? "").replace(/\/+$/, "");
}

type Opts = { session?: SessionTokenAccessor };

async function requireToken(opts: Opts): Promise<string> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new Error("not signed in — no live session");
  return token;
}

export type BeginIntakeRequest = { filename: string; mime: string; declaredBytes: number };
export type BeginIntakeResponse = { intake_id: string; upload_token: string; expires_at: string | null };

/** Same-origin relative POST — rides the Next `/api/intake` proxy
 *  (apps/dashboard/app/shared/intake.ts:106-125's `beginIntake`, origin fixed to
 *  `"documents_tab"` — this workbench never begins a chat-origin intake). */
export async function beginIntake(req: BeginIntakeRequest, opts: Opts = {}): Promise<BeginIntakeResponse> {
  const token = await requireToken(opts);
  const origin: IntakeOrigin = "documents_tab";
  const res = await fetch("/api/intake/documents", {
    method: "POST",
    cache: "no-store",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ filename: req.filename, mime: req.mime, declared_bytes: req.declaredBytes, origin }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`begin intake failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as BeginIntakeResponse;
}

/** Stream the file bytes with the upload token (apps/dashboard/app/shared/intake.ts:
 *  129-146's `putIntakeBytes`). Direct-to-runtime when `NEXT_PUBLIC_CLARA_RUNTIME_URL`
 *  is set; same-origin proxy otherwise (local dev only — see that file's own note on
 *  why a Vercel-style body-size cap makes the runtime URL mandatory in production;
 *  apps/web ships on Cloudflare Workers, whose own limits are documented in
 *  packages/runtime/README.md). */
export async function putIntakeBytes(uploadToken: string, intakeId: string, file: File | Blob, signal?: AbortSignal): Promise<void> {
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

/** What `finalize_document_intake` reports back about the 0051 §2 recovery door
 *  (apps/dashboard/app/shared/intake.ts:148-160). Both keys are CONDITIONAL. */
export type IntakeRecovery = { mode?: string | null; lane?: string | null; task_id?: string | null };
export type IntakeRecoveryRefused = {
  reason?: string | null; remedy?: string | null; error_code?: string | null;
  document_mime?: string | null; upload_mime?: string | null; attempts?: number | null;
};
export type IntakeFinalizeReceipt = {
  status?: string | null; document_id?: string | null;
  recovery?: IntakeRecovery | null; recovery_refused?: IntakeRecoveryRefused | null;
};

/** Seal the intake — the runtime hashes, scans, uploads once, reads back, finalizes.
 *  RETURNS THE RECEIPT (apps/dashboard/app/shared/intake.ts:162-182's own 0051 §2
 *  note): a re-upload the recovery door refuses still answers 202 `status:'adopted'`,
 *  and the refusal carries the only copy of why. */
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

/** Human copy for a finalize receipt's recovery outcome, ported verbatim
 *  (apps/dashboard/app/shared/intake.ts:190-208). The DB's own `remedy` text is
 *  preferred wherever present — it is careful never to assert the file is bad. */
export function recoveryCopy(receipt: IntakeFinalizeReceipt | null | undefined): { label: string; detail: string | null } | null {
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
      default: return { label: "Stored — not re-read", detail };
    }
  }
  if (receipt?.recovery) return { label: "Stored — re-reading this document…", detail: null };
  return null;
}

const INTAKE_COLS = "id,uploaded_by,origin,original_filename,declared_mime,declared_bytes,status,document_id,failure_code,expires_at,created_at,updated_at";

// read RPC — transport via getRows against a MASKED view; not a governed act: no
// confirmation UI, no re-read-after semantics (it IS the poll loop itself).
export async function readIntake(intakeId: string, opts: Opts = {}): Promise<IntakeRow | null> {
  const rows = await getRows<IntakeRow>(`document_intakes_visible?id=eq.${encodeURIComponent(intakeId)}&select=${INTAKE_COLS}`, opts);
  return rows[0] ?? null;
}

const TASK_COLS = "id,document_id,lane,status,version_n,attempt_count,error_code,created_at,started_at,finished_at,updated_at";

// read RPC — transport via getRows against a MASKED view; not a governed act.
export async function listProcessingTasksForDocument(documentId: string, opts: Opts = {}): Promise<ProcessingTaskRow[]> {
  return getRows<ProcessingTaskRow>(
    `document_processing_tasks_visible?document_id=eq.${encodeURIComponent(documentId)}&select=${TASK_COLS}&order=version_n.desc`,
    opts,
  );
}

export { INTAKE_ADOPTED };

/** Honest status copy — every state named, never a fabricated percentage
 *  (apps/dashboard/app/shared/intake.ts:254-268). "verified" is deliberately NOT
 *  "filed": finalize lands the document UNASSIGNED; "Filed" is reserved for an
 *  actual active filing this tab makes afterward. */
export function intakeStatusCopy(status: IntakeStatus, failureCode: IntakeFailureCode | null): string {
  switch (status) {
    case "uploading": return "Uploading…";
    case "received": return "Received — scanning…";
    case "verifying": return "Verifying…";
    case "verified": return "Verified — storing…";
    case "finalized": return "Stored — not yet filed";
    case "duplicate": return "Duplicate — adopting…";
    case "adopted": return "Stored — matched an existing document";
    case "failed": return `Failed${failureCode ? `: ${failureCode}` : ""}`;
  }
}
