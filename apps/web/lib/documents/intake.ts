// Client Documents workbench — upload/intake, ported MECHANISM (never look) from
// apps/dashboard/app/shared/intake.ts. The runtime owns store-and-forward: the
// browser never holds a storage credential and never computes the canonical sha256
// (INTERFACE-PINS 1-3). Route topology, three calls — ALL same-origin via
// app/api/runtime/[...path]/route.ts (independent review 2026-08-27, F1/F2/F3):
//   1. begin     — POST /api/runtime/intake/documents (JSON, Bearer session JWT).
//   2. bytes     — PUT /api/runtime/intake/documents/:id/bytes (octet-stream,
//                  Bearer upload_token, streamed).
//   3. finalize  — POST /api/runtime/intake/documents/:id/finalize (JSON,
//                  Bearer upload_token).
// NO `runtimeBase()`/`NEXT_PUBLIC_CLARA_RUNTIME_URL` anywhere in this file — the
// proxy route reads the (server-side-only) runtime destination at REQUEST time and
// allow-lists exactly the headers it forwards; see that route's own header for the
// full finding. Status polling is NOT a runtime route — it rides the masked
// PostgREST views (document_intakes_visible / document_processing_tasks_visible,
// packages/db/migrations/0007_document_pipeline.sql:2233-2241, granted at 0007:2747)
// via lib/read.ts's `getRows` — the HUMAN/JWT lane, no upload token.

import { getRows } from "@/lib/read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { safeRuntimeFetch, expectRuntimeOk } from "./runtime-wire";
import type { SessionTokenAccessor } from "@/lib/session";
import { INTAKE_ADOPTED, type IntakeOrigin, type IntakeRow, type ProcessingTaskRow } from "./types";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };
type BeginOpts = Opts & { origin?: IntakeOrigin; sessionId?: string };

async function requireToken(opts: Opts): Promise<string> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new Error("not signed in — no live session");
  return token;
}

export type BeginIntakeRequest = { filename: string; mime: string; declaredBytes: number };
export type BeginIntakeResponse = { intake_id: string; upload_token: string; expires_at: string | null };

/** Same-origin POST via the runtime proxy (apps/dashboard/app/shared/intake.ts:
 *  106-125's `beginIntake`). `origin` DEFAULTS to `"documents_tab"` and stays that for
 *  every Documents-workbench caller; the Clara composer passes `"chat"` plus the
 *  `sessionId` the runtime authorises against. That pairing is the runtime's own, not a
 *  local convention: `packages/runtime/src/intakeRoutes.ts:94` calls
 *  `assertSessionAccess` for a chat origin, and `packages/runtime/lib/intake.mjs:99-102`
 *  refuses 400 unless `origin === "chat"` and a non-empty `session_id` arrive together —
 *  which is why the guard below refuses locally rather than sending a body the wall will
 *  reject. NO CLIENT IDENTITY rides this body in either case: filing a document to a
 *  client is a separate governed act (`doors.ts`'s `fileToClient`). */
export async function beginIntake(req: BeginIntakeRequest, opts: BeginOpts = {}): Promise<BeginIntakeResponse> {
  const token = await requireToken(opts);
  const origin: IntakeOrigin = opts.origin ?? "documents_tab";
  if (origin === "chat" && !opts.sessionId) throw new Error("chat intake requires a session id");
  const body = {
    filename: req.filename,
    mime: req.mime,
    declared_bytes: req.declaredBytes,
    origin,
    ...(origin === "chat" ? { session_id: opts.sessionId } : {}),
  };
  const res = await safeRuntimeFetch(
    "/api/runtime/intake/documents",
    {
      method: "POST",
      cache: "no-store",
      redirect: "manual", // never silently follow a 307-to-/login (runtime-wire.ts's own note)
      signal: opts.signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    "begin intake",
  );
  await expectRuntimeOk(res, "begin intake");
  return (await res.json()) as BeginIntakeResponse;
}

/** Stream the file bytes with the upload token, same-origin via the runtime proxy
 *  (apps/dashboard/app/shared/intake.ts:129-146's `putIntakeBytes`). `signal`
 *  cancels an in-flight upload (component unmount, the queue's own Remove). */
export async function putIntakeBytes(uploadToken: string, intakeId: string, file: File | Blob, signal?: AbortSignal): Promise<void> {
  const res = await safeRuntimeFetch(
    `/api/runtime/intake/documents/${encodeURIComponent(intakeId)}/bytes`,
    {
      method: "PUT",
      cache: "no-store",
      redirect: "manual",
      signal,
      headers: { authorization: `Bearer ${uploadToken}`, "content-type": "application/octet-stream" },
      body: file,
    },
    "upload bytes",
  );
  await expectRuntimeOk(res, "upload bytes");
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
 *  and the refusal carries the only copy of why. THE RECEIPT IS ADVISORY ONLY —
 *  independent review 2026-08-27 N6: no caller may treat this response as proof of
 *  adoption; only a SUBSEQUENT read of `document_intakes_visible` (readIntake below)
 *  is DB-confirmed truth (hydrate-never-trust extends to the runtime lane too). */
export async function finalizeIntake(uploadToken: string, intakeId: string, signal?: AbortSignal): Promise<IntakeFinalizeReceipt> {
  const res = await safeRuntimeFetch(
    `/api/runtime/intake/documents/${encodeURIComponent(intakeId)}/finalize`,
    {
      method: "POST",
      cache: "no-store",
      redirect: "manual",
      signal,
      headers: { authorization: `Bearer ${uploadToken}`, "content-type": "application/json" },
      body: "{}",
    },
    "finalize intake",
  );
  await expectRuntimeOk(res, "finalize intake");
  return (await res.json().catch(() => ({}))) as IntakeFinalizeReceipt;
}

const INTAKE_COLS = "id,uploaded_by,origin,original_filename,declared_mime,declared_bytes,status,document_id,failure_code,expires_at,created_at,updated_at";

// read RPC — transport via getRows against a MASKED view; not a governed act: no
// confirmation UI, no re-read-after semantics (it IS the poll loop itself, and the
// ONLY DB-confirmed source of truth for whether an intake actually adopted — see
// finalizeIntake's own note).
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
