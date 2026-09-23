// #636 — the wire contract for `clara.get_intake_batch`
// (packages/db/migrations/0229_intake_batches.sql), and the ONE place this codebase turns a batch
// facet into a shape the card can render.
//
// FIVE FACETS COME BACK AND THEY OVERLAP. A member can be `admitted` and `waiting` at the same
// time, so the numbers legitimately exceed the member count and are NEVER summed
// (CONTEXT.md:136-138). The envelope carries no total and no percentage, by ruling and by the
// migration's own tail assertion; `?? 0` and `Math.round(a / b * 100)` are both the bug here.
//
// UNKNOWN IS NOT ZERO, and that is the whole hydration rule (the `client-work-pack.ts` idiom): a
// facet this build could not read comes back `{status:'unknown', count:null}`, because "nothing is
// waiting" and "I could not find out what is waiting" are different sentences and only one of them
// means a person can stop looking.
//
// THE COUNT IS NEVER `rows.length`. `rows` is a PREVIEW (at most `preview_limit`, clamped 1..25 by
// the door because `clara._work_run_attempts` refuses more than 101 ids), so a batch with 120
// members shows 25 of them under the number 120.
//
// THE CAPACITY BLOCK IS THE DATABASE'S, NOT A LOCAL CONSTANT. The daily window is an
// Asia/Kuala_Lumpur day (0252, #964 — moved off 0007:1644's UTC day, whose boundary was 08:00
// Asia/Kuala_Lumpur), so the reset is MYT MIDNIGHT. The card renders the door's own
// `resets_at_local`, so the copy cannot drift from the wall it describes, and it never says
// "midnight" or "tomorrow" as words.

import { callDoor } from "@/lib/doors";
import { getRows } from "@/lib/read";
import type { SessionTokenAccessor } from "@/lib/session";

export type IntakeBatchOptions = {
  session?: SessionTokenAccessor;
  signal?: AbortSignal;
  /** The door clamps this 1..25; the card asks for its own preview length. */
  preview?: number;
};

/** The door's own default preview size (0229: `p_preview int default 10`). */
export const INTAKE_BATCH_PREVIEW = 10;
/** The door's own ceiling (0229, restating 0214:283-286's reason). */
export const INTAKE_BATCH_MAX_PREVIEW = 25;

export const INTAKE_BATCH_FACET_KINDS = ["admitted", "settled", "waiting", "failed", "unassigned"] as const;
export type IntakeBatchFacetKind = (typeof INTAKE_BATCH_FACET_KINDS)[number];

/** A facet's ANSWER STATE, as the reader sees it.
 *
 *   ok        the door answered and the population is fully covered.
 *   partial   the door answered and SAID which part of the answer it is not making.
 *   unknown   this build could not read the facet — a malformed body, or a read that never landed.
 *   denied    the caller may not read it.
 *
 * The first two come from the door; the last two are set by the browser, because a door cannot
 * report about itself that it was not reachable. */
export type IntakeBatchStatus = "ok" | "partial" | "unknown" | "denied";
const DOOR_STATUSES: readonly IntakeBatchStatus[] = ["ok", "partial"];

export type IntakeBatchMemberRow = {
  memberId: string;
  intakeId: string | null;
  documentId: string | null;
  workId: string | null;
  clientId: string | null;
  filename: string | null;
  intakeStatus: string | null;
  intakeFailureCode: string | null;
  taskErrorCode: string | null;
  workStatus: string | null;
  dependency: string | null;
  dependencyReason: string | null;
  hasOpenQuestion: boolean;
  retrying: boolean;
  receiptId: string | null;
  entryId: string | null;
};

export type IntakeBatchFacet = {
  kind: IntakeBatchFacetKind;
  status: IntakeBatchStatus;
  /** NEVER `?? 0`. `null` means the read did not answer for this facet. */
  count: number | null;
  coverageReason: string | null;
  uncountedCompletions: number | null;
  rows: IntakeBatchMemberRow[];
};

export type IntakeBatchWaitingBasis = {
  byQuestion: number | null;
  byDependency: { awaiting_fact: number | null; awaiting_attribution: number | null; awaiting_capacity: number | null };
  byUnfiled: number | null;
  byCapacityFailure: number | null;
};

export type IntakeBatchPack = {
  computedAt: string | null;
  previewLimit: number | null;
  /** The door's NAMED reason a stopping batch cannot finish stopping, or null. Derived, never
   *  stored: today the one value is `canceller_not_active` (the person who pressed Stop is no
   *  longer an active member, so the resumed fan-out refuses CLR04 on every child forever). An
   *  unknown word from a newer database is carried through verbatim rather than swallowed. */
  cancelBlocked: string | null;
  /** Members that hold no Work YET and can still acquire one — still arriving, or still being
   *  extracted. NOT a facet and NOT a denominator: it is what lets the stop dialog say how many
   *  files are still in flight instead of "0 operations are still running" while a hundred are. */
  pendingMembers: number | null;
  batch: {
    id: string;
    label: string | null;
    origin: string | null;
    state: "open" | "cancelling" | "cancelled" | null;
    openedBy: string | null;
    openedAt: string | null;
    cancelRequestedAt: string | null;
  };
  facets: Record<IntakeBatchFacetKind, IntakeBatchFacet>;
  waitingBasis: IntakeBatchWaitingBasis;
  capacity: { window: string | null; resetsAtLocal: string | null; timezone: string | null };
};

const asRecord = (v: unknown): Record<string, unknown> =>
  (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asString = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const asCount = (v: unknown): number | null =>
  (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null);
const asBool = (v: unknown): boolean => v === true;

function facetOf(body: Record<string, unknown>, kind: IntakeBatchFacetKind): IntakeBatchFacet {
  const raw = asRecord(asRecord(body.facets)[kind]);
  const declared = asString(raw.status);
  // A facet whose body is missing or whose status word this build does not know is UNKNOWN, never
  // a zero: the honest answer to "what did the door say" is "I could not tell".
  const status: IntakeBatchStatus =
    declared !== null && (DOOR_STATUSES as readonly string[]).includes(declared)
      ? (declared as IntakeBatchStatus)
      : "unknown";
  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : [];
  return {
    kind,
    status,
    count: status === "unknown" ? null : asCount(raw.count),
    coverageReason: asString(raw.coverage_reason),
    uncountedCompletions: asCount(raw.uncounted_completions),
    rows: rowsRaw.map((r) => {
      const row = asRecord(r);
      return {
        memberId: asString(row.member_id) ?? "",
        intakeId: asString(row.intake_id),
        documentId: asString(row.document_id),
        workId: asString(row.work_id),
        clientId: asString(row.client_id),
        filename: asString(row.filename),
        intakeStatus: asString(row.intake_status),
        intakeFailureCode: asString(row.intake_failure_code),
        taskErrorCode: asString(row.task_error_code),
        workStatus: asString(row.work_status),
        dependency: asString(row.dependency),
        dependencyReason: asString(row.dependency_reason),
        hasOpenQuestion: asBool(row.has_open_question),
        retrying: asBool(row.retrying),
        receiptId: asString(row.receipt_id),
        entryId: asString(row.entry_id),
      };
    }).filter((row) => row.memberId.length > 0),
  };
}

/** Shapes the door's jsonb into the card's own vocabulary. Exported for the unit cells, which must
 *  be able to build a pack from a literal body rather than from a live door. */
export function toIntakeBatchPack(batchId: string, body: unknown): IntakeBatchPack {
  const root = asRecord(body);
  const batch = asRecord(root.batch);
  const basis = asRecord(root.waiting_basis);
  const dep = asRecord(basis.by_dependency);
  const capacity = asRecord(root.capacity);
  const state = asString(batch.state);
  return {
    computedAt: asString(root.computed_at),
    previewLimit: asCount(root.preview_limit),
    cancelBlocked: asString(root.cancel_blocked),
    pendingMembers: asCount(root.pending_members),
    batch: {
      id: asString(batch.id) ?? batchId,
      label: asString(batch.label),
      origin: asString(batch.origin),
      state: state === "open" || state === "cancelling" || state === "cancelled" ? state : null,
      openedBy: asString(batch.opened_by),
      openedAt: asString(batch.opened_at),
      cancelRequestedAt: asString(batch.cancel_requested_at),
    },
    facets: {
      admitted: facetOf(root, "admitted"),
      settled: facetOf(root, "settled"),
      waiting: facetOf(root, "waiting"),
      failed: facetOf(root, "failed"),
      unassigned: facetOf(root, "unassigned"),
    },
    waitingBasis: {
      byQuestion: asCount(basis.by_question),
      byDependency: {
        awaiting_fact: asCount(dep.awaiting_fact),
        awaiting_attribution: asCount(dep.awaiting_attribution),
        awaiting_capacity: asCount(dep.awaiting_capacity),
      },
      byUnfiled: asCount(basis.by_unfiled),
      byCapacityFailure: asCount(basis.by_capacity_failure),
    },
    capacity: {
      window: asString(capacity.window),
      resetsAtLocal: asString(capacity.resets_at_local),
      timezone: asString(capacity.timezone),
    },
  };
}

/** THE ONE READ. Floors at bookkeeper inside the door; a viewer's CLR04 propagates as a
 *  `DoorRefusal` and the card renders its DENIED face (rows cleared), never an Empty. */
export async function loadIntakeBatch(batchId: string, opts: IntakeBatchOptions = {}): Promise<IntakeBatchPack> {
  const body = await callDoor<unknown>(
    "get_intake_batch",
    { p_batch: batchId, p_preview: opts.preview ?? INTAKE_BATCH_PREVIEW },
    { session: opts.session, signal: opts.signal },
  );
  return toIntakeBatchPack(batchId, body);
}

/** Is anything in this batch still able to change? The settle-poll's own `enabled` predicate.
 *  A batch with nothing waiting and nothing admitted-but-unsettled is finished moving, and a
 *  finished batch polls ZERO times. */
export function isBatchSettled(pack: IntakeBatchPack | null): boolean {
  if (pack === null) return true;
  if (pack.batch.state === "cancelling") return false;
  const waiting = pack.facets.waiting.count;
  const admitted = pack.facets.admitted.count;
  const settled = pack.facets.settled.count;
  // An UNKNOWN count is not "nothing left": it is "I could not tell", and a poll that stopped on
  // it would be the `?? 0` bug wearing a different hat.
  if (waiting === null || admitted === null || settled === null) return false;
  return waiting === 0 && admitted === settled;
}

// ---------------------------------------------------------------------------------------------
// THE REVERSE ROW: "part of batch X", on a Work's own detail page.
//
// NO NEW DOOR AND NO `list_accounting_work` RECUT. `clara.list_accounting_work`'s body is #905's
// and the Work-list projection is frozen for this wave, so the Work LIST says nothing about
// batches. Work DETAIL gets ONE line, derived from two direct reads under the caller's own JWT:
// `clara.intake_batch_members` and `clara.intake_batches` both carry
// `grant select … to clara_authenticated` under FORCE RLS `firm_id = clara.jwt_firm()` (0229),
// which is the same shape `entry_evidence_links` is read with on this page — a SECURITY DEFINER
// wrapper would REMOVE that guarantee for zero new capability.
//
// A FAILED READ IS INDISTINGUISHABLE FROM "NOT IN A BATCH", on purpose (the `#638` claim-origin
// line's own rule): both leave the row absent. The page never says a Work is NOT in a batch, only
// that it IS in one.

export type WorkBatchOrigin = { batchId: string; label: string | null; state: string | null };

export async function getWorkBatchOrigin(
  workId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<WorkBatchOrigin | null> {
  const members = await getRows<{ batch_id: string }>("intake_batch_members", {
    session: opts.session,
    signal: opts.signal,
    select: "batch_id",
    filters: { work_id: `eq.${workId}` },
    limit: 1,
  });
  const batchId = members[0]?.batch_id;
  if (!batchId) return null;
  const batches = await getRows<{ id: string; label: string | null; state: string | null }>("intake_batches", {
    session: opts.session,
    signal: opts.signal,
    select: "id,label,state",
    filters: { id: `eq.${batchId}` },
    limit: 1,
  });
  const row = batches[0];
  if (!row) return null;
  return { batchId: row.id, label: row.label, state: row.state };
}
