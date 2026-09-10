// The attributable Activity feed (#632, refresh spec #612 journey B5) — the wire contract for
// `clara.list_activity`/`clara.get_activity_event` (packages/db/migrations/0181_activity_feed.sql),
// the feed's URL-state model (`?client=&kinds=&since=&until=&cursor=&event=<source>:<id>`), its
// closed kind-group vocabulary, and the link builders into Work/Journals/Documents/Reports.
//
// GROUNDING (0181's own header + body, as measured against the migration this file is written
// against — never the other way round):
//   - ONE feed, newest first, over THREE sources: domain events (via
//     clara.firm_timeline_visible), agent act receipts (clara.agent_receipts_visible) and #623's
//     committed operation receipts (clara.operation_receipts). `source` discriminates the row.
//   - `id` is OPAQUE and SOURCE-SHAPED, never assume it is a bare uuid: an 'event' or
//     'operation_receipt' row's id is a real uuid rendered text, but an 'agent_receipt' row's id
//     is `receipt_kind:receipt_id` (0181's own header explains why — clara.freeform_read_log has a
//     BIGINT primary key, so the pair is the only reliable address). This module never parses an
//     id's internal shape; it only ever passes it back to get_activity_event verbatim.
//   - `kind` is the closed filter/display group the door computes:
//     documents | journal | close | report | agent | work.
//   - The page envelope is `{rows, next_cursor, truncated}`. `next_cursor` is an opaque string —
//     round-trip it, never decode it.
//
// WHY THIS DOES NOT USE getRows/lib/read.ts. Unlike a plain RLS-scoped table read, this feed's
// ORDER and CURSOR are part of the contract (the same reasoning lib/firm/timeline.ts's own header
// gives for `list_firm_timeline`): a caller that composed its own order/limit over the union could
// page incorrectly without ever being wrong about one row. `callDoor` is the transport, exactly as
// a read-flavoured RPC always rides it (apps/web/AGENTS.md).
//
// THE OBJECT LINK BUILDERS ARE HONEST ABOUT WHAT THEY CAN NAME. `workDetailHref` names ONE durable
// Work record — that route genuinely exists (lib/navigation/tree.ts). Journals, Documents and
// Reports have NO per-object or per-tab URL parameter today (measured: neither
// components/journals/journals-workbench.tsx nor the Documents/Reports pages read
// `useSearchParams`/`searchParams` at all) — so an entry/document/report link below lands on the
// STABLE OBJECT PAGE, not the specific row, and says so in its own name
// (`activityJournalsHref`, not `activityEntryHref`). Inventing a query parameter neither page
// consumes would be a link that silently does nothing; this module does not do that.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import { CLARA_BUSINESS_TIMEZONE } from "@/lib/business-date";
import {
  ACCOUNTING_ITEMS,
  CLIENT_NAV,
  accountingHref,
  clientNavHref,
  workDetailHref,
} from "@/lib/navigation/tree";

// ── the closed kind vocabulary ────────────────────────────────────────────────

export const ACTIVITY_KINDS = ["documents", "journal", "close", "report", "agent", "work"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function isActivityKind(value: string): value is ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(value);
}

export type ActivitySource = "event" | "agent_receipt" | "operation_receipt";

const ACTIVITY_SOURCES: readonly ActivitySource[] = ["event", "agent_receipt", "operation_receipt"];

export function isActivitySource(value: string): value is ActivitySource {
  return (ACTIVITY_SOURCES as readonly string[]).includes(value);
}

/** One row of `clara.list_activity`, copied field-for-field from the function's own
 *  `jsonb_build_object` shape (0181's header, "the common row shape"). Every field the door can
 *  leave null is typed nullable here rather than defaulted — a row with an absent field is an
 *  honest absence, never coerced into "" or 0. */
export type ActivityRow = {
  id: string;
  source: ActivitySource;
  event_type: string | null;
  description: string | null;
  client_id: string | null;
  actor: string | null;
  on_behalf_of: string | null;
  via_wake_kind: string | null;
  occurred_at: string;
  object_kind: "entry" | "document" | "resolution" | null;
  object_id: string | null;
  work_id: string | null;
  receipt_id: string | null;
  document_id: string | null;
  original_entry_id: string | null;
  replacement_entry_id: string | null;
  status: "approved" | "reversed" | "superseded" | "withdrawn" | string | null;
  kind: ActivityKind;
};

/** `clara.get_activity_event`'s return: the same shape, plus the detail-only fields the door adds
 *  (0181's header: "same shape plus client_name..."). `receipt_kind`/`purpose`/`basis_origin`/
 *  `initiator` are present only for the source that carries them (agent_receipt /
 *  operation_receipt respectively) — absent, not null, on every other row; read them with `in`
 *  or optional chaining rather than assuming presence. */
export type ActivityDetail = ActivityRow & {
  client_name: string | null;
  receipt_kind?: string;
  purpose?: string;
  basis_origin?: string;
  initiator?: string;
};

export type ActivityPage = {
  rows: ActivityRow[];
  next_cursor: string | null;
  truncated: boolean;
};

export type ActivityFilters = {
  client?: string | null;
  kinds?: readonly ActivityKind[] | null;
  /** `YYYY-MM-DD`, inclusive, in the business timezone — never a bare Date or a browser-local day. */
  since?: string | null;
  until?: string | null;
};

/** The door's own page ceiling (0181: "p_limit clamped 1..100" — TIGHTER than
 *  `list_firm_timeline`'s 200, because this door does three reads and a merge-sort per page). */
export const ACTIVITY_MAX_LIMIT = 100;
export const ACTIVITY_DEFAULT_LIMIT = 25;

/** A business-timezone calendar day's exact start, as an offset ISO instant. Malaysia carries no
 *  DST (CLARA_BUSINESS_TIMEZONE is a fixed UTC+8), so the offset is a literal rather than a
 *  computed one — see business-date.ts's own header for why the business day is not the browser's
 *  local day at all. */
function businessDayStart(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000+08:00`;
}
function businessDayEnd(dateOnly: string): string {
  return `${dateOnly}T23:59:59.999+08:00`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `true` for a `YYYY-MM-DD` string that is also a real calendar date (rejects `2026-02-30`). */
export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const parts = value.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

export type ListActivityOptions = {
  session?: SessionTokenAccessor;
  signal?: AbortSignal;
  limit?: number;
  cursor?: string | null;
};

/** A page of the activity feed, newest first. `filters.since`/`until` are calendar days in the
 *  business timezone (CLARA_BUSINESS_TIMEZONE) and are converted here to the inclusive instant
 *  range the door expects — the ONE place that conversion happens, so a caller never hand-rolls a
 *  timezone offset. `opts.cursor` is round-tripped verbatim from a previous page's `next_cursor`;
 *  passing anything else is a malformed-cursor CLR10 refusal, by the door's own contract. */
export async function listActivity(
  filters: ActivityFilters,
  opts: ListActivityOptions = {},
): Promise<ActivityPage> {
  const limit = Math.min(Math.max(opts.limit ?? ACTIVITY_DEFAULT_LIMIT, 1), ACTIVITY_MAX_LIMIT);
  const out = await callDoor<ActivityPage>(
    "list_activity",
    {
      p_cursor: opts.cursor ?? null,
      p_limit: limit,
      p_client: filters.client ?? null,
      p_kinds: filters.kinds && filters.kinds.length > 0 ? [...filters.kinds] : null,
      p_since: filters.since ? businessDayStart(filters.since) : null,
      p_until: filters.until ? businessDayEnd(filters.until) : null,
    },
    { session: opts.session, signal: opts.signal },
  );
  // Hydrate-never-trust's own honesty rule (this repo's AGENTS.md): a malformed envelope is
  // reported as empty-and-not-truncated rather than a caller crashing on `.rows.map`.
  return {
    rows: Array.isArray(out?.rows) ? out.rows : [],
    next_cursor: typeof out?.next_cursor === "string" ? out.next_cursor : null,
    truncated: out?.truncated === true,
  };
}

/** One event's detail record, addressed by the OPAQUE `(source, id)` pair a list row (or the
 *  `?event=` URL param, see below) already carries. Another firm's row, an unknown source or a
 *  genuinely absent id are indistinguishable CLR11 refusals at the door (no oracle) — this module
 *  does not attempt to tell them apart either. */
export async function getActivityEvent(
  source: ActivitySource,
  id: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<ActivityDetail> {
  return callDoor<ActivityDetail>(
    "get_activity_event",
    { p_source: source, p_id: id },
    { session: opts.session, signal: opts.signal },
  );
}

// ── the `?event=` param: <source>:<id>, split on the FIRST colon only ────────
//
// AN AGENT_RECEIPT id ALREADY CONTAINS A COLON (`receipt_kind:receipt_id`, see this file's
// header), so `event=agent_receipt:freeform_read:42` is a real, valid value with TWO colons.
// Splitting on the FIRST one only is what keeps that unambiguous: `source` is drawn from the
// closed three-member set above and can never itself contain a colon, so everything after the
// first colon — colons and all — is the id, verbatim, exactly as get_activity_event expects it.

export function formatEventParam(source: ActivitySource, id: string): string {
  return `${source}:${id}`;
}

/** `null` for an absent, empty or unrecognised-source param — never a thrown error: a stale or
 *  hand-edited URL is a "no event open" state, not a page crash. */
export function parseEventParam(raw: string | null | undefined): { source: ActivitySource; id: string } | null {
  if (!raw) return null;
  const i = raw.indexOf(":");
  if (i < 1 || i === raw.length - 1) return null;
  const source = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if (!isActivitySource(source)) return null;
  return { source, id };
}

// ── the rest of the URL-state model ──────────────────────────────────────────

export type ActivityUrlState = {
  client: string | null;
  kinds: ActivityKind[];
  since: string | null;
  until: string | null;
  cursor: string | null;
  event: { source: ActivitySource; id: string } | null;
};

const EMPTY_STATE: ActivityUrlState = { client: null, kinds: [], since: null, until: null, cursor: null, event: null };

/** Parse the feed's own five query params off a `URLSearchParams` (or any string-keyed reader
 *  with a compatible `.get`). Every field degrades to its empty default on a malformed value
 *  rather than throwing — the URL is user-editable input, not a trusted wire contract. `kinds` is
 *  comma-joined in the URL (`?kinds=journal,close`) and de-duplicated; an unrecognised kind token
 *  is DROPPED rather than sent to the door, so a stale bookmark from a retired kind degrades to
 *  "no filter on that axis" instead of a CLR10 the user never asked for. */
export function parseActivityUrlState(params: Pick<URLSearchParams, "get">): ActivityUrlState {
  const client = params.get("client");
  const kindsRaw = params.get("kinds");
  const kinds = kindsRaw
    ? [...new Set(kindsRaw.split(",").map((k) => k.trim()).filter((k) => k.length > 0))].filter(isActivityKind)
    : [];
  const since = params.get("since");
  const until = params.get("until");
  const cursor = params.get("cursor");
  const event = parseEventParam(params.get("event"));
  return {
    client: client && client.length > 0 ? client : null,
    kinds,
    since: since && isDateOnly(since) ? since : null,
    until: until && isDateOnly(until) ? until : null,
    cursor: cursor && cursor.length > 0 ? cursor : null,
    event,
  };
}

/** The inverse of `parseActivityUrlState`, folded onto an existing `URLSearchParams` (so a caller
 *  updating one field — say, opening the Sheet — keeps every other param untouched). An
 *  EMPTY/absent field DELETES its key rather than writing `""`, so the URL never accumulates dead
 *  `?since=&until=` noise across filter changes. Returns a NEW `URLSearchParams`; the input is not
 *  mutated. */
export function applyActivityUrlState(
  base: URLSearchParams,
  patch: Partial<ActivityUrlState>,
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  const setOrDelete = (key: string, value: string | null | undefined) => {
    if (value === undefined) return; // not part of this patch — leave whatever is there
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  };
  if ("client" in patch) setOrDelete("client", patch.client);
  if ("kinds" in patch) {
    const kinds = patch.kinds ?? [];
    setOrDelete("kinds", kinds.length > 0 ? kinds.join(",") : null);
  }
  if ("since" in patch) setOrDelete("since", patch.since);
  if ("until" in patch) setOrDelete("until", patch.until);
  if ("cursor" in patch) setOrDelete("cursor", patch.cursor);
  if ("event" in patch) setOrDelete("event", patch.event ? formatEventParam(patch.event.source, patch.event.id) : null);
  return next;
}

export function activityUrlStateEqual(a: ActivityUrlState, b: ActivityUrlState): boolean {
  return (
    a.client === b.client &&
    a.since === b.since &&
    a.until === b.until &&
    a.cursor === b.cursor &&
    a.kinds.length === b.kinds.length &&
    a.kinds.every((k, i) => b.kinds[i] === k) &&
    ((a.event === null && b.event === null) ||
      (a.event !== null && b.event !== null && a.event.source === b.event.source && a.event.id === b.event.id))
  );
}

export { EMPTY_STATE as EMPTY_ACTIVITY_URL_STATE };

// ── link builders ─────────────────────────────────────────────────────────────

/** `/clients/:clientId/work/:workId` — the one object link that names a specific row today. */
export function activityWorkHref(clientId: string, workId: string): string {
  return workDetailHref(clientId, workId);
}

/** `/clients/:clientId/journals` — the Journals tab. See this file's header: no per-entry or
 *  per-tab query parameter exists for the workbench to land on, so every journal-entry-kind
 *  activity row (a posting, a correction, a withdrawal) links to the SAME stable destination. */
export function activityJournalsHref(clientId: string): string {
  const item = ACCOUNTING_ITEMS.find((i) => i.id === "journals");
  if (!item) throw new Error("activityJournalsHref: the journals accounting item is missing from the registry");
  return accountingHref(clientId, item);
}

/** `/clients/:clientId/documents` — the Documents tab; see the Journals link's own note. */
export function activityDocumentsHref(clientId: string): string {
  const item = CLIENT_NAV.find((i) => i.id === "documents");
  if (!item) throw new Error("activityDocumentsHref: the documents client-nav item is missing from the registry");
  return clientNavHref(clientId, item);
}

/** `/clients/:clientId/reports` — the Reports tab; see the Journals link's own note. */
export function activityReportsHref(clientId: string): string {
  const item = CLIENT_NAV.find((i) => i.id === "reports");
  if (!item) throw new Error("activityReportsHref: the reports client-nav item is missing from the registry");
  return clientNavHref(clientId, item);
}

/** Resolve the ONE primary link a row should offer, honouring the priority the spec's own
 *  language implies (Work is the durable record; an object link is the fallback when there is no
 *  Work). `null` when a row genuinely has nothing to link to (e.g. an agent_receipt row with no
 *  client_id — a platform-scope receipt). */
export function primaryActivityHref(row: Pick<ActivityRow, "client_id" | "work_id" | "object_kind">): string | null {
  if (!row.client_id) return null;
  if (row.work_id) return activityWorkHref(row.client_id, row.work_id);
  if (row.object_kind === "entry") return activityJournalsHref(row.client_id);
  if (row.object_kind === "document") return activityDocumentsHref(row.client_id);
  return null;
}

/** Re-exported for the timezone-day-boundary tests and for a page-level "today" default —
 *  named here rather than re-imported everywhere `since`/`until` defaults are computed. */
export { CLARA_BUSINESS_TIMEZONE };
