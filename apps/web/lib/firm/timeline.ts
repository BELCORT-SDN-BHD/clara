// The FIRM TIMELINE read — `clara.list_firm_timeline(p_after_seq, p_limit)`.
//
// WHY THIS AND NOT `clara.domain_events` (the orchestrator's decision 2, 裁-190).
// The raw event spine IS granted to `clara_authenticated` (0005_event_spine.sql:408) under a
// firm-only RLS predicate with NO ROLE FLOOR (`p_domain_events_human`, 0005:380-381), and its
// `payload` jsonb is the unredacted call payload of every writer that ever emitted an event. A
// browser read of that relation would hand a rank-0 VIEWER every payload in the firm — a wall
// `clara.audit_log` (bookkeeper+, 0002:518-520) already holds them out of. So this surface reads
// a contract that drops the payload entirely and floors at bookkeeper, and it never reads the
// spine directly.
//
// THE CONTRACT, quoted from the migration that mints it (the DB lane's
// `UNNUMBERED_web_reads_and_small_doors.sql`, section 3):
//
//   create function clara.list_firm_timeline(p_after_seq bigint, p_limit int)
//   returns table(seq bigint, event_type text, event_description text, client_id uuid,
//                 actor uuid, on_behalf_of uuid, via_wake_kind text, created_at timestamptz)
//
//   * ORDER IS NEWEST FIRST, and `p_after_seq` means "the last seq I have already read" — the
//     next page is the rows STRICTLY OLDER than it. NULL starts at the newest.
//   * `p_limit` is CLAMPED by the DB to [1, 200]; a caller cannot raise the ceiling.
//   * The floor is enforced by `_human_ctx(role_rank('bookkeeper'))`, so a VIEWER meets an
//     honest CLR04 refusal rather than an empty firm. That refusal renders VERBATIM through
//     `ErrorMessage` — it is a real answer about the caller's rank, never a "not built" state.
//
// HYDRATE-NEVER-TRUST, AND THE ONE ARM THAT IS NOT AN ERROR. This module ships BEFORE the
// migration that mints the function. Until that lands, PostgREST answers `POST /rpc/
// list_firm_timeline` with a 404 (`PGRST202`, "could not find the function in the schema
// cache") — which `lib/doors.ts` classifies `kind: "not_found"`. That single, specific shape is
// "the read is not deployed yet", and the caller renders an honest `NotBuiltNote` for it. EVERY
// OTHER failure — a refusal, a 401, a 403, a 5xx, a transport failure — is a real failure and
// renders as one. `isTimelineNotDeployed` below is the ONE place that distinction is drawn, so
// no caller can widen it by accident: a `catch` that swallowed more would turn a genuine outage
// into a false "not built yet" claim, which is the same lie in the opposite direction.

import { callDoor, isDoorError, isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** One row of `clara.list_firm_timeline` — every field copied from the function's own
 *  `returns table(...)` declaration, in its ordinal order. There is no `payload` field and
 *  there never will be one: the contract drops it at the view (see this file's header). */
export type FirmTimelineRow = {
  /** `clara.domain_events.seq` — per-firm monotonic (0005:81), and therefore the cursor. */
  seq: number;
  event_type: string;
  /** `clara.event_types.description` — a human sentence the DB owns, joined by the view.
   *  Rendered verbatim; this build never re-words it. */
  event_description: string;
  client_id: string | null;
  actor: string | null;
  on_behalf_of: string | null;
  via_wake_kind: string | null;
  created_at: string;
};

/** The DB's own page ceiling, restated here only so a caller can see it without reading SQL.
 *  Asking for more is not an error — the function clamps — but asking for more would be a
 *  request this module knows cannot be honoured, so it does not make one. */
export const FIRM_TIMELINE_MAX_LIMIT = 200;

/**
 * A page of the firm timeline, newest first.
 *
 * `afterSeq` is the last `seq` already read (NOT a row index): pass `null` for the newest page.
 * Rides `callDoor` as TRANSPORT ONLY — this is a read RPC, so there is no confirmation UI, no
 * sticky-refusal semantics and no post-call re-read attached to it (apps/web/AGENTS.md).
 */
export async function listFirmTimeline(
  session: SessionTokenAccessor,
  afterSeq: number | null = null,
  limit = 20,
): Promise<FirmTimelineRow[]> {
  const out = await callDoor<unknown>(
    "list_firm_timeline",
    { p_after_seq: afterSeq, p_limit: Math.min(Math.max(limit, 1), FIRM_TIMELINE_MAX_LIMIT) },
    { session },
  );
  // A SETOF/TABLE function is always an array on the wire. Anything else is a shape this module
  // did not contract for, and it is reported as empty rather than coerced into fabricated rows.
  return Array.isArray(out) ? (out as FirmTimelineRow[]) : [];
}

/**
 * TRUE only for "PostgREST does not know this function" — the pre-deployment state.
 *
 * Two shapes count, and both are measured rather than guessed:
 *   * `kind === "not_found"` — `lib/wire-error-kind.ts` maps HTTP 404 to it, which is what
 *     PostgREST answers (`PGRST202`) for a function absent from its schema cache.
 *   * SQLSTATE `42883` (`undefined_function`) — Postgres' own code, carried through on
 *     `DoorError.pgCode`, for the case where the route resolves but the body does not.
 *
 * A GOVERNED REFUSAL IS NEVER "NOT DEPLOYED" — `isDoorRefusal` is checked FIRST and returns
 * false, so a viewer's CLR04 can never be painted as an absent feature. Neither can a 403, a
 * 5xx or a transport failure: each falls through to the caller's real error rendering.
 */
export function isTimelineNotDeployed(error: unknown): boolean {
  if (isDoorRefusal(error)) return false;
  if (!isDoorError(error)) return false;
  return error.kind === "not_found" || error.pgCode === "42883";
}
