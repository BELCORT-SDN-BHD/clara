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
      // …and so is one whose BYTES WERE NEVER VERIFIED. Migration 0182's
      // `clara._journal_document_filed` applies the estate's custody floor
      // (`bytes_verified_at is not null`, `clara._active_document_filing`'s own
      // rule since 0007:982): an unverified upload is not evidence. Offering it
      // here builds a chooser whose option can only ever come back
      // `invalid_source_ref` / `not_filed` — the form inviting a refusal it
      // could have predicted. Cross-model review, confirmed against the
      // migration and against `listDocumentsByIds`' own column list.
      if (doc.bytes_verified_at === null) return null;
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

// ── #728 finding 5 — which of these documents already back a posted entry ──────────────────────
//
// ADVISORY ONLY. `clara.list_spoken_for_documents` (migration 0183) is a NEW read the pickers
// consult ALONGSIDE `listClientEvidenceDocuments`, never a replacement for the door's own check:
// `attach_entry_evidence`'s CLR13 `source_already_posted` (this file's own `AttachEvidenceResult`,
// `source_conflict`) and `admit_journal_work`'s equivalent stay the law. A caller that could not
// read this list still lets a person choose freely — the door refuses the real conflict on
// submit exactly as it does today; this list only lets the picker say so BEFORE that round trip.

/** One row of `clara.list_spoken_for_documents` — copied field-for-field from the function's own
 *  `returns table(...)` declaration (0183). `via` names WHICH lane already claimed the document:
 *  `evidence_link` is this ticket's own late-attachment/#623-commit relation
 *  (`clara.entry_evidence_links`, released on reversal), `coding` is the older document-coding
 *  lane (`journal_entries.document_id`, approved and not reversed). The picker does not need to
 *  say which lane out loud — see `mergeSpokenFor`'s own note — but the field is not dropped: a
 *  future surface (or a test) may want it. */
export type SpokenForDocumentRow = {
  document_id: string;
  entry_id: string;
  /** THE CLAIMANT — the client whose entry holds the document, which need NOT be the client whose
   *  picker asked. `uq_document_filing_active` is `(document_id, client_id) where retired_at is
   *  null` (0007:93), so one document may be actively filed to two clients of a firm at once,
   *  while `uq_entry_evidence_links_document` carries no client column at all: the claim is
   *  firm-wide and the door answers at that scope (cross-model review, 2026-09-11 — the first cut
   *  asked a client-scoped question against a firm-wide invariant, so a document already backing
   *  client A's entry was offered to client B as free). */
  client_id: string;
  /** The claimant's name, joined in by the door so a surface can say WHOSE entry holds it without
   *  a second read. Nullable on the wire only. */
  client_name: string | null;
  via: "evidence_link" | "coding";
};

/**
 * Every document OFFERED to `clientId` (its own active filings) that already backs a LIVE posted
 * entry of ANY client of the firm, with the claimant named.
 *
 * A SETOF/TABLE function is always an array on the wire (the same shape `lib/firm/timeline.ts`'s
 * own `listFirmTimeline` reads). Anything else THROWS rather than resolving to `[]`: an empty
 * array is a real answer meaning "nothing is spoken for", and every caller renders it by enabling
 * every option. Coercing a malformed envelope into that answer would silently turn "we could not
 * check" into "we checked and it is free" — the exact conflation `mergeSpokenFor`'s third state
 * exists to prevent (cross-model review, 2026-09-11). The callers already catch and show their
 * own "check unavailable" line, so a throw is the honest shape, not a crash.
 */
export async function listSpokenForDocuments(
  clientId: string,
  opts: Opts = {},
): Promise<SpokenForDocumentRow[]> {
  const out = await callDoor<unknown>("list_spoken_for_documents", { p_client: clientId }, opts);
  if (!Array.isArray(out)) {
    throw new Error("list_spoken_for_documents did not answer with an array of rows");
  }
  return out as SpokenForDocumentRow[];
}

/** An `EvidenceDocument` plus the ONE fact the picker renders it with: null when the document is
 *  free, or the entry it already backs when it is not. Kept as a SEPARATE type from
 *  `EvidenceDocument` (rather than widening that one) because not every reader of
 *  `EvidenceDocument` — `attach-evidence-dialog.tsx`'s own `optionLabel` predates this ticket —
 *  needs to carry it. */
export type EvidenceOption = EvidenceDocument & {
  spokenFor: {
    entryId: string;
    /** The CLAIMANT client — see `SpokenForDocumentRow.client_id`. The note's link must target
     *  THIS client's Journals route, not the asking client's: the entry lives where it was
     *  posted. */
    clientId: string;
    clientName: string | null;
    via: SpokenForDocumentRow["via"];
  } | null;
};

/**
 * Merge a spoken-for read onto a document list, three ways:
 *   * `spokenFor` is an array (the read succeeded, possibly empty) — each document is annotated
 *     with the row that names it, or `null` when nothing does.
 *   * `spokenFor` is `null` (the read FAILED — the caller catches and passes null, never an empty
 *     array on failure, exactly the `documentsUnavailable` discipline `attach-evidence-dialog.tsx`
 *     already applies to the document list itself) — every document comes back with `spokenFor:
 *     null` (nothing is disabled), because "we could not check" must never be silently read as
 *     "nothing is spoken for". The door's own conflict refusal on submit is what actually protects
 *     the entry either way.
 *
 * NEVER HIDES AN OPTION. A caller that filtered spoken-for documents OUT of the list would be
 * asserting a certainty this read cannot make with the door's own force — the door is the law, this
 * read is advisory — so every document stays in the returned array; only `spokenFor` changes.
 */
export function mergeSpokenFor(
  documents: readonly EvidenceDocument[],
  spokenFor: readonly SpokenForDocumentRow[] | null,
): EvidenceOption[] {
  const byDocument = new Map((spokenFor ?? []).map((row) => [row.document_id, row]));
  return documents.map((doc) => {
    const hit = byDocument.get(doc.documentId);
    return {
      ...doc,
      spokenFor: hit
        ? {
            entryId: hit.entry_id,
            clientId: hit.client_id,
            clientName: hit.client_name ?? null,
            via: hit.via,
          }
        : null,
    };
  });
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
  /** #630 — THREE FIELDS, THREE FACTS, because `clara.accounting_work.initiator` stopped being one
   *  fact the moment a colleague could take responsibility for a Work. `initiated_by` is who ASKED
   *  (immutable), `initiated_by_role` is the rank they asked at (the ADMISSION snapshot, which is
   *  why it describes `initiated_by` and not the live actor), and `responsible` is the human the
   *  Work is executed as now. Emitting `(initiator, initiator_role)` as a pair after a handover put
   *  one person's id beside another person's rank. */
  initiated_by: string | null;
  initiated_by_role: string | null;
  responsible: string | null;
  document_id: string | null;
  /** WHICH LANE bound the document: `work_commit` and `late_attachment` are this
   *  ticket's two entry points, `document_coding` is the estate's older
   *  document lane (`journal_entries.document_id`). Null when there is no
   *  source — which is an honest answer, not a missing one. */
  document_source: "work_commit" | "late_attachment" | "document_coding" | null;
  attached_at: string | null;
  /** WHEN THE BINDING STOPPED BEING THE LIVE ONE, or null. Migration 0182's
   *  `t_entry_evidence_release` stamps it when the entry is REVERSED, which is
   *  what frees the document for the corrected entry (LAW 6: reverse, then
   *  re-post — the invoice must not be stranded on history). The row keeps
   *  naming the document either way, so the chain stays inspectable; a surface
   *  that read `document_id` alone would present a released binding as the
   *  current fact. */
  released_at: string | null;
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
  // PAGED, NOT TRUNCATED. The journals read's own ceiling is 1000 entries
  // (lib/journals/api.ts's FETCH_CAP) and this door's batch cap is 500, so a
  // single call would either be REFUSED or — worse — quietly answer for the
  // first 500 and leave the rest rendering as "we did not read it" with nothing
  // saying so. Two round trips are cheaper than a surface that is silently
  // half-informed about which entries have evidence.
  const out: EntryLinkRow[] = [];
  for (let i = 0; i < unique.length; i += ENTRY_LINKS_BATCH_MAX) {
    const rows = await callDoor<EntryLinkRow[] | null>(
      "list_entry_links",
      { p_client: clientId, p_entries: unique.slice(i, i + ENTRY_LINKS_BATCH_MAX) },
      opts,
    );
    if (Array.isArray(rows)) out.push(...rows);
  }
  return out;
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
   *  resolves WHICH one — and WHOSE — from the rows; see its note for why not from here. */
  | { kind: "source_conflict" }
  | { kind: "entry_not_approved" }
  /** The entry has been REVERSED. LAW 6 leaves it `approved`, so this is its own
   *  arm rather than `entry_not_approved`: evidence belongs on the entry that
   *  REPLACED this one, and a link recorded here could never be released. */
  | { kind: "entry_reversed" }
  /** CLR06 — the caller's view of the entry is not the current row. */
  | { kind: "stale" }
  | { kind: "denied" }
  | { kind: "not_found" }
  /** Any other refusal, carried verbatim: never re-worded, never retried. */
  | { kind: "refused"; code: string | null; message: string }
  | { kind: "unavailable"; message: string };

/** WHOSE posted entry a document is already spoken for by. Two fields, because a refusal that
 *  sends a person into a SIBLING client's books needs both: the id to build the route with, and
 *  the name to say out loud before they follow it (delta review round 3, finding [5] — the
 *  refusal banners linked into another client's journals without naming the client, while the
 *  advisory note for the identical fact did name it). */
export type EntryClaimant = {
  /** The client whose entry holds the document — NOT necessarily the one that asked. */
  clientId: string;
  /** The claimant's own name. NULL is a real answer — the clients row may be unreadable, or the
   *  name genuinely absent — and a surface then says "another client" rather than "undefined".
   *  A failed NAME read never costs the claim itself: the link is the more useful half. */
  clientName: string | null;
};

export type DocumentClaim = EntryClaimant & {
  entryId: string;
};

/** The claimant's own name, read separately because neither relation that can hold a claim
 *  carries one. Firm-scoped by `clara.clients`' own RLS policy, exactly like every other read in
 *  this module. A failure here is not a failure of the claim — see `EntryClaimant.clientName`. */
async function readClientName(clientId: string, opts: Opts): Promise<string | null> {
  const rows = await getRows<{ name: string | null }>(
    `clients?id=eq.${encodeURIComponent(clientId)}&select=name`,
    opts,
  ).catch((e: unknown) => {
    // An ABORT is the caller's own decision and must reach it; anything else costs the name only.
    if (opts.signal?.aborted === true) throw e;
    return [] as { name: string | null }[];
  });
  return rows[0]?.name ?? null;
}

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
 *
 * FIRM-WIDE, AND IT NAMES THE CLAIMANT (delta review of the fix round,
 * 2026-09-11, finding [4]). Both arms used to filter `client_id=eq.<the asking
 * client>`, which asks a CLIENT-scoped question against a FIRM-wide invariant:
 * `uq_entry_evidence_links_document` carries no client column (0182:345) and
 * `_document_posting_entry`'s own body joins on `c.firm_id`, never on the
 * client — so a document actively filed to two clients of one firm
 * (`uq_document_filing_active` is per (document, client), 0007:93) could be
 * held by client A's entry while client B's dialog, refused for exactly that
 * reason, resolved NOTHING and showed a refusal with no way to reach the entry
 * it is about. The reads below are firm-scoped by RLS alone
 * (`p_journal_entries_human`: `firm_id = clara.jwt_firm()`), which is the
 * scope of the invariant. The CLAIMANT client comes back with the entry
 * because the caller needs it to build the route: `/clients/<claimant>/journals`
 * is where the entry actually is, and the asking client's journal never
 * contains it (see `spoken-for-note.tsx`'s own note on the same rule).
 *
 * BOTH ARMS IGNORE A REVERSAL, and the two spellings of that are the two lanes'
 * own: `released_at is null` here (0182's `t_entry_evidence_release` stamps it
 * when the entry is reversed) and `reversed_by is null` there. Without the first
 * one this function would send a human to an entry that is no longer in the
 * books, for a document the door has already freed — the exact opposite of the
 * conflict it is explaining.
 */
export async function findEntryForDocument(
  documentId: string,
  opts: Opts = {},
): Promise<DocumentClaim | null> {
  const doc = encodeURIComponent(documentId);
  const links = await getRows<{ entry_id: string; client_id: string }>(
    `entry_evidence_links?document_id=eq.${doc}&released_at=is.null&select=entry_id,client_id`,
    opts,
  );
  const link = links[0];
  if (link !== undefined) {
    return { entryId: link.entry_id, clientId: link.client_id, clientName: await readClientName(link.client_id, opts) };
  }
  const coded = await getRows<{ id: string; client_id: string }>(
    `journal_entries?document_id=eq.${doc}&status=eq.approved&reversed_by=is.null&select=id,client_id`,
    opts,
  );
  const entry = coded[0];
  if (entry === undefined) return null;
  return { entryId: entry.id, clientId: entry.client_id, clientName: await readClientName(entry.client_id, opts) };
}

/**
 * WHOSE ENTRY IS THIS — the claimant client of one posted entry id, read
 * firm-wide.
 *
 * The composer's `source_already_posted` refusal carries an `entry_id` and no
 * client (`admit_journal_work`'s CLR13 detail), and `_document_posting_entry`
 * resolves that entry across the WHOLE FIRM, so the id may name a sibling
 * client's entry. This is the narrowest read that turns it into a route: one
 * row of `clara.journal_entries`, firm-scoped by its own human policy, plus the
 * claimant's own name. Returns null when the id resolves to nothing the caller
 * may read — and the caller then renders no link rather than a link into a
 * journal the entry is not in.
 *
 * NOT ON THE REFUSAL'S CRITICAL PATH (delta review round 3, finding [3]). The
 * composer paints its `source_conflict` banner from the door's own answer and
 * calls this AFTERWARDS, under an `AbortSignal` and a timeout: a PostgREST read
 * that accepts the connection and then stalls used to leave the whole form
 * disabled with "Submitting…" in the live region for ever, because `fetch` with
 * no signal never gives up. Pass `opts.signal`.
 */
export async function findEntryClient(
  entryId: string,
  opts: Opts = {},
): Promise<EntryClaimant | null> {
  const id = encodeURIComponent(entryId);
  const rows = await getRows<{ client_id: string }>(
    `journal_entries?id=eq.${id}&select=client_id`,
    opts,
  );
  const clientId = rows[0]?.client_id ?? null;
  if (clientId === null) return null;
  return { clientId, clientName: await readClientName(clientId, opts) };
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
      if (reason === "entry_reversed") return { kind: "entry_reversed" };
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
