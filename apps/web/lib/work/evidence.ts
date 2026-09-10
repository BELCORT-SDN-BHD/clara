// #634 — THE SOURCE DOCUMENT BEHIND A JOURNAL ENTRY: the pick list, the late
// attachment door, and the journal surface's one links read.
//
// THREE ENTRY POINTS, ONE FACT. A Work may name a document at admission, may
// name none at all, or may gain one LATE against an entry that is already
// posted. All three end in the SAME relation (`clara.entry_evidence_links`) and
// all three are refused by the SAME invariant: one document backs at most one
// posted entry. This module is the browser's half of that contract.
//
// WHY THE LATE PATH IS A DOOR AND NOT AN UPDATE. Measured, in migration 0182's
// header: `clara._tf_entry_immutable` admits exactly
// {reversed_by, reversal_reason, updated_at} on an approved -> approved UPDATE.
// A posted entry is never rewritten (LAW 6), so evidence is RECORDED BESIDE it
// and `attach_entry_evidence` has NO financial effect — not a line moves, not a
// cent, not the revision token.
//
// HYDRATE-NEVER-TRUST: `attachEntryEvidence` reports what the database said and
// nothing more; every caller re-reads the entry and its links afterwards. That
// is why the accepted shape below is small — an id and the document — rather
// than a row to paint.

import { callDoor, isDoorRefusal } from "@/lib/doors";
import { getRows } from "@/lib/read";
import { listActiveFilingsForClient, listDocumentsByIds } from "@/lib/documents/reads";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** One pickable source document, flattened for a chooser: what a preparer needs
 *  to recognise the right file (its NAME, what KIND of document it is, and WHEN
 *  it was filed to this client) and nothing else. */
export type EvidenceDocument = {
  documentId: string;
  filename: string | null;
  kind: string | null;
  /** The document's own business date when it has one, else the filing instant —
   *  a chooser sorted by "when this belongs" reads better than one sorted by
   *  when somebody happened to upload it. Always a plain calendar day or an ISO
   *  instant, never re-formatted here. */
  filedAt: string;
  financialDate: string | null;
};

/**
 * Every document currently FILED to this client, newest first.
 *
 * TWO READS, NOT A JOIN, and the reason is the estate's shape rather than a
 * preference: `clara.documents` has no client column at all — the FILING is what
 * binds a document to a client, and `uq_document_filing_active` admits at most
 * one live filing per (document, client). So the client's documents ARE its
 * active filings, resolved to their document rows. Both reads ride the caller's
 * own RLS through `getRows`.
 *
 * A document with no live filing is deliberately absent: it is not this client's
 * document any more, and `clara.admit_journal_work` would refuse it by name.
 */
export async function listClientEvidenceDocuments(
  clientId: string,
  opts: Opts = {},
): Promise<EvidenceDocument[]> {
  const filings = await listActiveFilingsForClient(clientId, opts);
  if (filings.length === 0) return [];
  const documents = await listDocumentsByIds(filings.map((f) => f.document_id), opts);
  const byId = new Map(documents.map((d) => [d.id, d]));
  return filings
    .map((filing) => {
      const doc = byId.get(filing.document_id);
      // A filing whose document row the caller cannot read is DROPPED rather
      // than rendered as a blank option: an option nobody can identify is worse
      // than one fewer option, and the admission door would refuse it anyway.
      if (!doc) return null;
      return {
        documentId: doc.id,
        filename: doc.original_filename,
        kind: doc.document_kind,
        filedAt: filing.filed_at,
        financialDate: doc.financial_date,
      } satisfies EvidenceDocument;
    })
    .filter((d): d is EvidenceDocument => d !== null);
}

/** One row of `clara.list_entry_links` — purpose, source, Work, receipt and the
 *  correction chain for one journal entry. Every field is nullable because an
 *  entry may have come from any lane: an older manual door, the document-coding
 *  lane, or an accounting Work. */
export type EntryLinkRow = {
  entry_id: string;
  status: string | null;
  origin: string | null;
  work_id: string | null;
  receipt_id: string | null;
  logical_op_id: string | null;
  purpose: string | null;
  basis_origin: string | null;
  initiator: string | null;
  initiator_role: string | null;
  document_id: string | null;
  /** WHICH LANE bound the document: `work_commit` and `late_attachment` are this
   *  ticket's two entry points, `document_coding` is the estate's older
   *  document lane (`journal_entries.document_id`). Null when there is no
   *  source — which is an honest answer, not a missing one. */
  document_source: "work_commit" | "late_attachment" | "document_coding" | null;
  attached_at: string | null;
  reversal_of: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
};

/** THE BATCH CAP IS THE DOOR'S OWN (migration 0182 refuses more by name). Stated
 *  here so a caller pages rather than discovering it as a refusal. */
export const ENTRY_LINKS_BATCH_MAX = 500;

/**
 * The Work / receipt / source / correction facts for a page of journal entries,
 * merged onto the entries read the surface already has.
 *
 * A DOOR RATHER THAN THREE POSTGREST READS: `clara.operation_receipts` reaches a
 * journal entry only through `effects->>'entry_id'`, a jsonb expression
 * PostgREST cannot embed on, so the browser would have to issue three requests
 * and merge them — three chances to paint a half-merged row. Migration 0182's
 * own header records the same tradeoff from the database's side.
 */
export async function listEntryLinks(
  clientId: string,
  entryIds: readonly string[],
  opts: Opts = {},
): Promise<EntryLinkRow[]> {
  const unique = Array.from(new Set(entryIds.filter(Boolean)));
  // An empty ask is an empty answer, and a request the caller can prove is
  // pointless must never be sent (lib/read.ts's absence posture).
  if (unique.length === 0) return [];
  const rows = await callDoor<EntryLinkRow[] | null>(
    "list_entry_links",
    { p_client: clientId, p_entries: unique.slice(0, ENTRY_LINKS_BATCH_MAX) },
    opts,
  );
  return Array.isArray(rows) ? rows : [];
}

/** Every outcome of the late door, typed. The three CONFLICT arms are separate
 *  because their next actions differ: `evidence_already_attached` sends the
 *  human to the document already on THIS entry, `source_already_posted` to the
 *  OTHER entry that already stands on the document they chose, and
 *  `entry_not_approved` is simply not an act this entry can take yet. */
export type AttachEvidenceResult =
  | {
      kind: "attached";
      entryId: string;
      documentId: string;
      linkId: string | null;
      workId: string | null;
      /** True when the door found the SAME document already attached — a lost
       *  response retried under a fresh key. Not an error: it is the state the
       *  caller asked for. */
      alreadyAttached: boolean;
    }
  /** The chosen document is not an active verified filing of this entry's client. */
  | { kind: "invalid_document" }
  /** This entry already carries a DIFFERENT source document. The caller does
   *  not need the id from the refusal: it re-reads the entry's own link (which
   *  is what hydrate-never-trust asks for anyway) and shows what is there. */
  | { kind: "evidence_already_attached" }
  /** The chosen document already backs another posted entry. `findEntryForDocument`
   *  resolves WHICH one from the rows — see its note for why not from here. */
  | { kind: "source_conflict" }
  | { kind: "entry_not_approved" }
  /** CLR06 — the caller's view of the entry is not the current row. */
  | { kind: "stale" }
  | { kind: "denied" }
  | { kind: "not_found" }
  /** Any other refusal, carried verbatim: never re-worded, never retried. */
  | { kind: "refused"; code: string | null; message: string }
  | { kind: "unavailable"; message: string };

/**
 * WHICH POSTED ENTRY ALREADY STANDS ON THIS DOCUMENT — read from the rows, not
 * from the refusal.
 *
 * MEASURED, AND IT IS WHY THE CONFLICT ARMS ABOVE CARRY NO IDS: `lib/wire.ts`'s
 * `parseReasonToken` surfaces ONLY `detail.reason` to a caller; every other
 * field of a governed refusal's typed detail is discarded before it reaches a
 * component (migration 0179's header records the same finding, which is why its
 * own door folds a field path INTO `reason`). So a browser cannot read
 * `entry_id` off a `source_already_posted` refusal — and it does not need to:
 * hydrate-never-trust says re-read the authoritative rows after every action,
 * and BOTH relations that can hold the binding are readable under the caller's
 * own RLS.
 *
 * TWO LANES, one question, the same pair migration 0182's `_document_posting_entry`
 * asks: this ticket's `clara.entry_evidence_links`, and the DOCUMENT-CODING
 * lane's own `clara.journal_entries.document_id` (approved, not reversed).
 * Returns null when nothing holds it — a link is never invented.
 */
export async function findEntryForDocument(
  clientId: string,
  documentId: string,
  opts: Opts = {},
): Promise<string | null> {
  const doc = encodeURIComponent(documentId);
  const client = encodeURIComponent(clientId);
  const links = await getRows<{ entry_id: string }>(
    `entry_evidence_links?document_id=eq.${doc}&client_id=eq.${client}&select=entry_id`,
    opts,
  );
  const link = links[0];
  if (link !== undefined) return link.entry_id;
  const coded = await getRows<{ id: string }>(
    `journal_entries?document_id=eq.${doc}&client_id=eq.${client}&status=eq.approved&reversed_by=is.null&select=id`,
    opts,
  );
  const entry = coded[0];
  return entry === undefined ? null : entry.id;
}

/**
 * Attach ONE client document to ONE posted journal entry.
 *
 * `opKey` IS THE CALLER'S IDENTITY FOR THIS PRESS, minted once per attempt and
 * reused when the same attempt is retried after a lost response — the database
 * reads its stored answer rather than doing the work twice. `expectedRevision`
 * is the entry's `revision_token` as the caller last READ it: the door refuses
 * CLR06 when that is no longer the current row, and it never bumps the token,
 * because a posted entry's columns do not move.
 */
export async function attachEntryEvidence(
  input: { entryId: string; documentId: string; expectedRevision: string; opKey: string },
  opts: Opts = {},
): Promise<AttachEvidenceResult> {
  try {
    const receipt = await callDoor<Record<string, unknown> | null>(
      "attach_entry_evidence",
      {
        p_entry: input.entryId,
        p_document: input.documentId,
        p_expected_revision: input.expectedRevision,
        p_op_key: input.opKey,
      },
      opts,
    );
    const body = receipt ?? {};
    return {
      kind: "attached",
      entryId: typeof body.entry_id === "string" ? body.entry_id : input.entryId,
      documentId: typeof body.document_id === "string" ? body.document_id : input.documentId,
      linkId: typeof body.link_id === "string" ? body.link_id : null,
      workId: typeof body.work_id === "string" ? body.work_id : null,
      alreadyAttached: body.already_attached === true || body.replayed === true,
    };
  } catch (err) {
    if (isDoorRefusal(err)) {
      const reason = err.reason ?? null;
      if (reason === "invalid_source_ref") return { kind: "invalid_document" };
      if (reason === "evidence_already_attached") return { kind: "evidence_already_attached" };
      if (reason === "source_already_posted") return { kind: "source_conflict" };
      if (reason === "entry_not_approved") return { kind: "entry_not_approved" };
      if (err.code === "CLR06") return { kind: "stale" };
      if (reason === "entry_not_found") return { kind: "not_found" };
      if (err.code === "CLR04") return { kind: "denied" };
      // A refusal is the database's considered answer — carried verbatim and
      // never retried by this module (lib/doors.ts's own rule).
      return { kind: "refused", code: err.code ?? null, message: err.message };
    }
    const kind = (err as { kind?: string })?.kind;
    if (kind === "no_session" || kind === "unauthenticated" || kind === "forbidden") {
      return { kind: "denied" };
    }
    if (kind === "not_found") return { kind: "not_found" };
    return { kind: "unavailable", message: (err as Error)?.message ?? "the door did not answer" };
  }
}
