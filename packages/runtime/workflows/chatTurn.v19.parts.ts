// @frozen
//
// FROZEN — part of the chatTurn_v19 closure (the SHARED successor #643 and #644 both deferred
// their runtime half into). A NEW frozen closure beside byte-untouched chatTurn_v1..v18
// (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback: a behavioural change ships as a
// new _vN export, never an in-place edit — registry.ts repoints `chatTurn:` here).
//
// A DECLARER, in chatTurn.v16.parts.ts's and chatTurn.v18.parts.ts's own sense:
// `apps/web/lib/parts/types.ts` is the READER, this is the DECLARER, and
// `packages/runtime/scripts/check-parts-parity.mjs` refuses a commit where the reader trails an
// emittable declaration. v16 declares four kinds, v18 declares one, claraWork v1/v2 declare
// three; this file declares the ONE kind v19 adds. A discriminant declared twice ANYWHERE in the
// set is a hard throw, which is why `work_accepted` is NOT re-declared here (see below).
//
// WHY `knowledge_receipt` IS DECLARED HERE AND NOT BESIDE THE KNOWLEDGE RECORDS THEMSELVES. It
// is emitted by a CHAT TURN — the moment `remember_client_information` lands a revision — and by
// nothing else. `clara.knowledge_records` has a durable surface of its own (the C13 register and
// `/clients/:clientId/knowledge/:recordId`), and this card's whole job is to say "that is now on
// the record, and here is where it lives". Every part shape in this estate lives beside the thing
// that MINTS it, for exactly that reason.
//
// AND WHY `work_accepted` IS NOT RE-DECLARED. `start_periodic_adjustment_work` mints one, with a
// purpose v18's literal type does not name. Re-declaring the kind here to widen that literal
// would be a DUPLICATE DISCRIMINANT the parity census refuses on sight — and it would put two
// copies of one shape in the tree, which is the drift that census exists to prevent. So the SHAPE
// stays v18's single declaration and this file widens only the PURPOSE, through a type reference
// the census does not read as a declaration (`declaredPartShapes` records exported object-type
// literals; an `Omit<…> & { … }` over an imported type is neither). The web reader already
// declares `purpose: string`, so the wire carries the new values without a reader change.

import type { WorkAcceptedPart } from "./chatTurn.v18.parts.js";
import type { PeriodicAdjustmentPurpose } from "../lib/periodic-adjustment-basis.js";

/**
 * ONE governed knowledge record, captured from a conversation.
 *
 * HYDRATES `clara.knowledge_records` (migration 0192) through the viewer+ read the knowledge
 * detail page makes — `clara.get_knowledge_record`, addressed by `record_id` inside the client.
 * There is no act door on this card: the capture already happened, and everything a human can
 * then do (correct it, withdraw it, read its history) belongs to that detail page.
 *
 * FIVE FIELDS, EACH ONE FORCED.
 *   `record_id`         — the STABLE identity across every revision (0192 §B: revision 1 sets
 *                         `record_id = id` and every correction carries it forward), and the
 *                         route's `:recordId` segment. A revision id would address a row that a
 *                         later correction supersedes; this addresses the thing.
 *   `client_id`         — the route's `:clientId` segment and the scope the read filters by. The
 *                         runtime knowledge lane is client-scoped by construction (0192's
 *                         `knowledge_scope_invalid`), so this is never null in practice; the card
 *                         still drops its link rather than building `/clients//knowledge/…`.
 *   `knowledge_key`     — WHAT was recorded, in the server-owned registry's own spelling. Carried
 *                         so the card can name the fact without a second read; the registry row
 *                         (its description, its floor, its value shape) is the register's.
 *   `knowledge_version` — the firm's watermark AFTER this capture, as TEXT. A bigint round-tripped
 *                         through a JS number can come back wrong, and #631's execution trace
 *                         compares it for equality rather than doing arithmetic on it.
 *   `revision_kind`     — `capture` or `correction`. The two read differently to a human ("noted"
 *                         vs "corrected") and the difference is the database's own answer, not
 *                         something a card may infer from whether a reason was supplied.
 *
 * NOTHING THAT MOVES RIDES HERE — not the value, not the trust, not the state. A later correction
 * or withdrawal changes all three while this message stays on screen forever; a card that
 * remembered them would be wrong the moment somebody exercised the doors this estate exists to
 * offer. It re-reads.
 */
export type KnowledgeReceiptPart = {
  type: "knowledge_receipt";
  record_id: string;
  client_id: string;
  knowledge_key: string;
  knowledge_version: string;
  revision_kind: string;
};

/** The kind v19 adds, as a one-member union — the shape `ClaraPartV19` widens `ClaraPartV18` by. */
export type ClaraPartV19Additions = KnowledgeReceiptPart;

/** The discriminant, spelled ONCE. The union above is the authority on the SHAPE; this array
 *  exists so a census can assert the NAME without retyping it. */
export const CHATTURN_V19_PART_KINDS = ["knowledge_receipt"] as const;

/** The three purposes a `work_accepted` card can now announce. `journal_entry` is v18's literal,
 *  carried by reference; the two periodic-adjustment purposes are 0194's own enum, carried from
 *  the non-frozen module that already spells them for the schema and the builders. */
export type WorkAcceptedPurposeV19 = WorkAcceptedPart["purpose"] | PeriodicAdjustmentPurpose;

/** v18's shape, with only its PURPOSE widened — not a second declaration of the kind. */
export type WorkAcceptedPartV19 = Omit<WorkAcceptedPart, "purpose"> & { purpose: WorkAcceptedPurposeV19 };

/** The purposes, as data, so a census can assert the set without retyping the union. */
export const WORK_ACCEPTED_PURPOSES_V19 = ["journal_entry", "periodic_stock_adjustment", "payroll_obligation"] as const;
