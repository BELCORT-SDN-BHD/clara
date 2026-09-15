// #633 AC8 — "this FILE was adopted" is not "this WORK was accepted".
//
// The gap map's own correction: there was never a missing READ here.
// `clara.entry_evidence_links` has carried `grant select … to clara_authenticated`
// since 0182:360, under a FORCE RLS policy `firm_id = clara.jwt_firm()` (:358-359),
// with `ix_entry_evidence_links_work` (:348). Wrapping it in a SECURITY DEFINER
// function would REMOVE that free tenant guarantee and force a hand-reimplementation
// of it — a net security regression for zero new capability. So this reads the
// relation directly, exactly as `lib/work/evidence.ts` already does.
//
// TWO READS, DELIBERATELY, BECAUSE THEY ANSWER DIFFERENT QUESTIONS:
//   * `entry_evidence_links` is the only place `work_id` exists. It is firm-scoped and
//     document-keyed, which is precisely this surface's question.
//   * `clara.list_spoken_for_documents(p_client)` (0183:1051) adds `via` and the
//     CLAIMANT CLIENT's name — the union of live evidence links and coding-lane
//     bindings. It takes a CLIENT, returns no `work_id`, and therefore COMPLEMENTS the
//     direct read rather than replacing it (the gap map's own qualification, verified).
//
// NOT A WRITE PROBE. 0197's two serialisation walls depend on `_document_posting_entry`'s
// exact ordering (`0197:219-223`), so nothing here may become a write-path probe: both
// calls are plain reads and neither is issued inside any act's transaction.

import { getRows } from "@/lib/read";
import { listSpokenForDocuments } from "@/lib/work/evidence";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

export const ENTRY_EVIDENCE_LINK_COLS = "entry_id,client_id,work_id,logical_op_id,attached_at";

export type DocumentWorkLink = {
  entryId: string;
  /** The CLAIMANT client — need not be the client whose tab is open. One document may be
   *  actively filed to two clients of one firm while the evidence claim is firm-wide. */
  clientId: string;
  clientName: string | null;
  workId: string | null;
  logicalOpId: string | null;
  via: "evidence_link" | "coding" | null;
};

export type DocumentWorkLinks = {
  links: DocumentWorkLink[];
  /** True when the complementary `list_spoken_for_documents` read could not be made.
   *  The direct links still stand; only `via`/`clientName` are missing, and the surface
   *  says so rather than implying the file is unclaimed. */
  claimantReadFailed: boolean;
};

type RawLink = {
  entry_id: string;
  client_id: string;
  work_id: string | null;
  logical_op_id: string | null;
  attached_at: string | null;
};

/** Every LIVE evidence link for one document, plus the claimant half where readable.
 *  `released_at is null` is 0182's own reversal spelling (`t_entry_evidence_release`
 *  stamps it when the entry is reversed) — a reversed entry is not Work this file is
 *  still producing, and showing it would send a person to an entry off the books. */
export async function loadDocumentWorkLinks(
  documentId: string,
  clientId: string,
  opts: Opts = {},
): Promise<DocumentWorkLinks> {
  const doc = encodeURIComponent(documentId);
  const raw = await getRows<RawLink>(
    `entry_evidence_links?document_id=eq.${doc}&released_at=is.null&select=${ENTRY_EVIDENCE_LINK_COLS}&order=attached_at.desc`,
    opts,
  );

  let spoken: Awaited<ReturnType<typeof listSpokenForDocuments>> = [];
  let claimantReadFailed = false;
  try {
    spoken = await listSpokenForDocuments(clientId, opts);
  } catch (e) {
    if (opts.signal?.aborted === true) throw e;
    claimantReadFailed = true;
  }

  const byEntry = new Map(spoken.filter((s) => s.document_id === documentId).map((s) => [s.entry_id, s]));

  return {
    links: raw.map((row) => {
      const claim = byEntry.get(row.entry_id);
      return {
        entryId: row.entry_id,
        clientId: row.client_id,
        clientName: claim?.client_name ?? null,
        workId: row.work_id,
        logicalOpId: row.logical_op_id,
        via: claim?.via ?? null,
      };
    }),
    claimantReadFailed,
  };
}

/** The route a Work's own surface lives at — including its cancel control, which is a
 *  governed act on the WORK and is deliberately reached by a LINK rather than mounted
 *  inline here. Cancelling an accepted Work is not the same act as cancelling an
 *  upload, and a control that sat on the document would invite exactly that confusion. */
export function workHref(clientId: string, workId: string): string {
  return `/clients/${encodeURIComponent(clientId)}/work/${encodeURIComponent(workId)}`;
}
