// @frozen
//
// FROZEN — part of the chatTurn_v18 closure (#623: THE FIRST PERSISTENT CLARA SUCCESSOR, the
// chat half). A NEW frozen closure beside byte-untouched chatTurn_v1..v17 (ARCHITECTURE
// Appendix A: a behavioural change ships as a new _vN export, never an in-place edit —
// registry.ts repoints `chatTurn:` here).
//
// A DECLARER, in chatTurn.v16.parts.ts's own sense, and it exists for the reason that file
// states: `apps/web/lib/parts/types.ts` is the READER, this is the DECLARER, and
// `packages/runtime/scripts/check-parts-parity.mjs` refuses a commit where the reader trails an
// emittable declaration. v16 declared four kinds and stays the declarer OF THOSE FOUR; this
// file declares the ONE kind v18 adds. Neither file is "the" declarer any more — the gate now
// reads a SET of declarer modules, which is the honest shape once two closures both widen the
// wire (the alternative, re-declaring v16's four here, would be a duplicate discriminant the
// census refuses on sight).
//
// IT IS DECLARED HERE, NOT IN claraWork.v1.parts.ts, BECAUSE OF WHO MINTS IT. `work_accepted`
// is emitted by a CHAT TURN — the moment `start_journal_work` admits a Work — and never by the
// Work run itself. v13's and v14's shapes live beside the tools that mint them for exactly this
// reason; `work_status` and `work_result` live beside claraWork_v1 for the same reason.

/**
 * ONE accounting Work, admitted from a conversation.
 *
 * HYDRATES `clara.accounting_work` (migration 0178) through the bookkeeper+ RLS read the Work
 * detail page makes — `id=eq.<work_id>` scoped by the client. There is no act door on this
 * card: admission already happened, and everything a human can then do (Retry, edit as a new
 * draft) belongs to the Work detail, not to a chat card.
 *
 * FOUR FIELDS, EACH ONE FORCED.
 *   `work_id`        — the read's subject and the route's `:workId` segment.
 *   `client_id`      — the route's `:clientId` segment and the scope every hydrate filters by.
 *                      NOT NULL on the row: an accounting Work is client-scoped by construction.
 *   `purpose`        — `"journal_entry"`, the only member of the row's CHECK today. Carried as
 *                      a LITERAL rather than an open string because it is what decides which
 *                      card and which breadcrumb label render, and a card that cannot name its
 *                      own purpose would have to guess one. A later purpose ships as a widened
 *                      declaration in the closure that mints it, which is the same discipline
 *                      every other part shape here follows.
 *   `logical_op_id`  — the server-assigned operation identity, `work:<work_id>:journal_entry:1`.
 *                      It is the ONE field a human can quote to an auditor to tie a chat message,
 *                      a Work, a journal entry and an operation receipt together (C33.8: "one
 *                      current stable operation-key schema ... parser-free round trip"), and it
 *                      is carried so the card can show it without a second read.
 *
 * NOTHING THAT MOVES RIDES HERE — not `status`, not `result`, not `error`, not the basis. The
 * Work is queued when this card is minted and will not be queued for long; a card that rendered
 * a remembered status would be wrong within seconds of being right. It re-reads.
 */
export type WorkAcceptedPart = {
  type: "work_accepted";
  work_id: string;
  client_id: string;
  purpose: "journal_entry";
  logical_op_id: string;
};

/** The kind v18 adds, as a one-member union — the shape `ClaraPartV18` widens `ClaraPartV17` by. */
export type ClaraPartV18Additions = WorkAcceptedPart;

/** The discriminant, spelled ONCE. The union above is the authority on the SHAPE; this array
 *  exists so a census can assert the NAME without retyping it. */
export const CHATTURN_V18_PART_KINDS = ["work_accepted"] as const;
