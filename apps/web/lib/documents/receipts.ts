// #633 AC1(c) — THE DURABLE UPLOAD RECEIPT, RECOVERED AT MOUNT.
//
// The defect this closes is a QUEUE-LIFECYCLE gap, not a missing read: `readIntake`
// has existed since the port (`intake.ts:136`) and `document_intakes_visible` has been
// granted since 0007 (`0007:2747`). But it was only ever called from INSIDE the poll
// loop (`useUploadQueue.ts:212`), and the queue lives in a React ref — so a reload
// lost every receipt, and a person who closed the tab mid-batch had no way to learn
// what had happened to their files.
//
// THE PREDICATE IS THE WHOLE DESIGN, AND "MY UPLOADS" IS THE WRONG ONE.
// `clara.document_intakes` has NO client column: attribution is a separate act, so an
// intake row cannot say which client it belongs to. Filtering by uploader alone would
// therefore show this client's tab every intake the person had ever uploaded — for
// every OTHER client too. A receipt is shown here when either:
//
//   (a) its document is FILED TO THIS CLIENT on the last settled read — the document
//       genuinely belongs to this client's shelf; or
//   (b) it is MINE and its document is UNATTRIBUTED — nothing has claimed it yet, so
//       the person who uploaded it is the one who still owes it an act. "Mine" is the
//       caller's own `user_id` from `clara.caller_context` (self-only by construction,
//       0141:544), never a guess.
//
// An intake that is neither (a colleague's upload already filed to another client) is
// not this surface's business, and the firm leaf is where it is answered instead.
//
// FOUR READS AT MOUNT, ONE ON THE POLL. Only `document_intakes_visible` changes while
// a batch is settling, so the bounded settle-poll re-reads THAT ALONE; the filing set,
// the unassigned set and the document metadata are re-derived once when the batch
// settles. That is what keeps an open tab from becoming a hot read loop under the
// caller's own JWT.

import { getRows } from "@/lib/read";
import { callDoor } from "@/lib/doors";
import { loadCallerContext } from "@/lib/firm/caller-context";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";
import type { DocumentRow, IntakeRow, IntakeStatus } from "./types";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** VERBATIM the projection `intake.ts`'s own `readIntake` uses. The two reads MUST
 *  agree: one is the single-row poll, the other the list-form rehydration, and a
 *  column in one but not the other would make a rehydrated row render differently
 *  from the same row while it was live. Pinned by a DB cell (p633.receipt.mask). */
export const INTAKE_RECEIPT_COLS =
  "id,uploaded_by,origin,original_filename,declared_mime,declared_bytes,status,document_id,failure_code,expires_at,created_at,updated_at";

/** The statuses that can still change on their own. A receipt list with none of these
 *  is SETTLED, and the poll stops — that is the whole stopping condition. */
export const INTAKE_NON_TERMINAL: ReadonlySet<IntakeStatus> = new Set<IntakeStatus>([
  "uploading", "received", "verifying", "verified",
]);

export type IntakeReceipt = {
  intake: IntakeRow;
  /** True when this document has an active filing to the client being viewed. */
  filedHere: boolean;
  /** True when the document exists and no active filing claims it anywhere. */
  unassigned: boolean;
  /** From `clara.documents` (filed here) or from `list_unassigned_documents`'
   *  own projection — never invented, `null` when no document exists yet. */
  documentKind: string | null;
  mimeType: string | null;
};

export type IntakeReceiptsLoad = {
  receipts: IntakeReceipt[];
  /** The instant this derivation was READ, for the surface's own watermark. */
  readAt: string;
  /** How many of the returned receipts can still change by themselves. */
  unsettled: number;
};

export function isSettled(load: IntakeReceiptsLoad | null): boolean {
  return load !== null && load.unsettled === 0;
}

/** The list-form re-read of the masked view — the ONLY read the settle-poll repeats. */
export async function listIntakeReceipts(opts: Opts & { limit?: number } = {}): Promise<IntakeRow[]> {
  return getRows<IntakeRow>(
    `document_intakes_visible?select=${INTAKE_RECEIPT_COLS}&order=created_at.desc&limit=${opts.limit ?? 50}`,
    opts,
  );
}

type UnassignedProjection = {
  id: string;
  mime_type: string | null;
  document_kind: string | null;
  extraction_status: string | null;
  unassigned: boolean;
};

/** `clara.list_unassigned_documents(p_limit)` — SETOF jsonb, SECURITY INVOKER, granted
 *  to `clara_authenticated` + `clara_agent_ro` since 0009 (`0009:2590`, `:2908-2913`).
 *  `apps/web` had never called it before #633; this ticket adds the caller, not the
 *  function. The DB clamps `p_limit` to [0, 500] itself (`0009:2610`). */
export async function listUnassignedDocuments(limit = 50, opts: Opts = {}): Promise<UnassignedProjection[]> {
  const out = await callDoor<UnassignedProjection[] | null>("list_unassigned_documents", { p_limit: limit }, opts);
  return Array.isArray(out) ? out : [];
}

export async function loadIntakeReceipts(
  clientId: string,
  opts: Opts & { limit?: number } = {},
): Promise<IntakeReceiptsLoad> {
  const [intakes, filings, unassigned, caller] = await Promise.all([
    listIntakeReceipts(opts),
    getRows<{ document_id: string }>(
      `document_filings?client_id=eq.${encodeURIComponent(clientId)}&retired_at=is.null&select=document_id`,
      opts,
    ),
    listUnassignedDocuments(opts.limit ?? 50, opts),
    // EXACTLY ONE active membership is a DB guarantee (`uq_membership_active_user`),
    // and `loadCallerContext` deliberately does not collapse 0/1/>1 — so a surprising
    // >1 becomes "no identity" here, which makes arm (b) fail CLOSED rather than
    // picking whichever row arrived first.
    loadCallerContext(opts.session ?? sessionTokenAccessor, opts.signal).catch(() => []),
  ]);

  const filedHere = new Set(filings.map((f) => f.document_id));
  const unassignedById = new Map(unassigned.map((u) => [u.id, u]));
  const me = caller.length === 1 ? caller[0]!.user_id : null;

  const shown = intakes.filter((row) => {
    if (row.document_id && filedHere.has(row.document_id)) return true;
    if (me === null || row.uploaded_by !== me) return false;
    // MINE AND UNATTRIBUTED. A row with no document yet (still uploading, or refused)
    // is mine to watch; a row whose document exists is only mine to watch while
    // nothing has claimed it.
    return row.document_id === null || unassignedById.has(row.document_id);
  });

  // ONE metadata read for the documents filed to this client — the unassigned half
  // already carries its own `mime_type`/`document_kind` in the function's projection.
  const needMeta = shown
    .map((r) => r.document_id)
    .filter((id): id is string => typeof id === "string" && filedHere.has(id));
  const meta = new Map<string, Pick<DocumentRow, "mime_type" | "document_kind">>();
  if (needMeta.length > 0) {
    const rows = await getRows<Pick<DocumentRow, "id" | "mime_type" | "document_kind">>(
      `documents?id=in.(${needMeta.map(encodeURIComponent).join(",")})&select=id,mime_type,document_kind`,
      opts,
    );
    for (const row of rows) meta.set(row.id, { mime_type: row.mime_type, document_kind: row.document_kind });
  }

  const receipts: IntakeReceipt[] = shown.map((intake) => {
    const doc = intake.document_id;
    const un = doc ? unassignedById.get(doc) : undefined;
    const filed = doc !== null && filedHere.has(doc);
    return {
      intake,
      filedHere: filed,
      unassigned: un !== undefined,
      // The intake's own `declared_mime` is already the canonical spelling, so it is
      // the fallback rather than a blank when no document row was read.
      mimeType: (filed ? meta.get(doc!)?.mime_type : un?.mime_type) ?? intake.declared_mime ?? null,
      documentKind: (filed ? meta.get(doc!)?.document_kind : un?.document_kind) ?? null,
    };
  });

  return {
    receipts,
    readAt: new Date().toISOString(),
    unsettled: receipts.filter((r) => INTAKE_NON_TERMINAL.has(r.intake.status)).length,
  };
}
