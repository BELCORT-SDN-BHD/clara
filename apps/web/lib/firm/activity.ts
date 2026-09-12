// The attributable Activity feed (#632, refresh spec #612 journey B5) — the wire contract for
// `clara.list_activity`/`clara.get_activity_event` (packages/db/migrations/0181_activity_feed.sql),
// the feed's URL-state model (`?client=&kinds=&since=&until=&event=<source>:<id>`), its
// closed kind-group vocabulary, and the link builders into Work/Journals/Documents.
//
// NO `?cursor=` PARAM. Pagination position is IN-MEMORY state (`use-activity-feed.ts`'s own
// `nextCursor`), never a URL param — the Sheet is the only "return to where you were" surface this
// feed needs (spec appendix C §4, "the Sheet is supporting context, not the durable URL"), and it
// is in-page, so closing it never re-navigates and never loses the loaded pages. A `?cursor=`
// param existed in an earlier cut of this file and was parsed but never wired to a read — the URL
// advertised a page the feed never actually loaded. Removed rather than wired up: a caller
// following a bookmarked or shared `?cursor=...` link has no page-1 rows loaded yet to append that
// cursor's page onto, so the parameter could never have meant what it looked like it meant.
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
// a read-flavoured RPC always rides it (AGENTS.md).
//
// THE OBJECT LINK BUILDERS ARE HONEST ABOUT WHAT THEY CAN NAME. `workDetailHref` names ONE durable
// Work record — that route genuinely exists (lib/navigation/tree.ts). Journals and Documents have
// NO per-object or per-tab URL parameter today (measured: neither
// components/journals/journals-workbench.tsx nor the Documents page reads
// `useSearchParams`/`searchParams` at all) — so an entry/document link below lands on the STABLE
// OBJECT PAGE, not the specific row, and says so in its own name (`activityJournalsHref`, not
// `activityEntryHref`). Inventing a query parameter neither page consumes would be a link that
// silently does nothing; this module does not do that. There is no `activityReportsHref`:
// `object_kind` (the only field `primaryActivityHref` branches on below `work_id`) is one of
// `'entry' | 'document' | 'resolution' | null` — never `'report'` — so a report-object link
// builder would have no caller that could ever reach it; `report` is a FILTER kind on the union
// (`report_agent` receipts), not an object kind this feed can address a specific row of.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import { isClientIdShape } from "@/lib/client-id";
import { isKnownAgentReceiptKind } from "@/lib/firm/receipt-kinds";
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
  /** One of `ACTIVITY_STATUSES` (0181's own four-state derivation, its header's "THE ENTRY STATUS
   *  DERIVATION"), a raw `je.status` pass-through for a still-`draft` entry, or `null` for a row
   *  that addresses no journal entry at all. Typed plainly as `string | null` rather than a
   *  literal union WITH a `string` fallback bolted on — TypeScript collapses
   *  `"approved" | ... | string` to `string` outright, so the literals bought no actual checking;
   *  `isKnownActivityStatus` below is the one place that checks membership, and every caller that
   *  cares uses it rather than re-deriving its own guess at the closed set. */
  status: string | null;
  kind: ActivityKind;
};

/** The four states 0181's own status derivation can produce (that migration's header, "THE ENTRY
 *  STATUS DERIVATION"). The one checked narrowing over `ActivityRow`/`ActivityDetail`'s `status`
 *  field — exported so a row's own status badge (activity-row.tsx) and its detail Sheet
 *  (activity-event-sheet.tsx) share ONE membership check rather than two copies that could drift
 *  (a status this build has not registered a label for, e.g. the raw `je.status` 'draft'
 *  pass-through, renders itself rather than a fabricated translation). */
export const ACTIVITY_STATUSES = ["approved", "reversed", "superseded", "withdrawn"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export function isKnownActivityStatus(value: string): value is ActivityStatus {
  return (ACTIVITY_STATUSES as readonly string[]).includes(value);
}

/** #728 finding 1 — a KEPT sweep-heartbeat row (migration 0183 excludes the zero-effect ones
 *  entirely; a row that survives the door DID draft something). The door deliberately adds no new
 *  output column for this (0183's own header: "a NEW nullable output column is NOT allowed to
 *  break the contract ordinal... actor stays null, the truth"), so the web recognises it off two
 *  columns the door already carries: `event_type` (the one literal 0011:3886 registers) and
 *  `kind` (0183's own recut relabels a kept sweep row 'agent', never 'documents'). Checking BOTH
 *  rather than `event_type` alone is deliberate — `kind` is the closed, versioned classification
 *  this feed commits to, and a future door recut could retire the 'agent' relabelling while
 *  leaving the literal event_type unchanged; checking both means this predicate breaks loudly
 *  (returns false, the row falls back to the ordinary null-actor rendering) rather than silently
 *  keeps labelling a row a future migration stopped calling an agent act. */
export function isSweepReceiptRow(row: Pick<ActivityRow, "source" | "event_type" | "kind">): boolean {
  return row.source === "event" && row.event_type === "sweep.run_completed" && row.kind === "agent";
}

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
  /** #630 — THE HUMAN THE WORK IS EXECUTED AS, which 0184 §A made MUTABLE: a handover
   *  (`clara.take_over_accounting_work`) moves it. Kept, with its key and its value, because
   *  0184's projection is additive and every existing reader of it is unbroken — but it is no
   *  longer the person who asked, so nothing may label it "Initiator". */
  initiator?: string | null;
  /** #630 — WHO ASKED, immutable forever (0184:2350, `w.initiated_by`). NULLABLE on the wire in
   *  two honest ways: the operation_receipt arm LEFT JOINs `clara.accounting_work`, so a receipt
   *  with no Work carries null, and a database below the 0184 frontier does not project the key
   *  at all (there, `initiator` was itself immutable and IS who asked — which is what
   *  `activityProvenance` below falls back to). */
  initiated_by?: string | null;
  /** #630 — the same fact as `initiator`, under a name that says what it is (0184 §H2 gives
   *  `clara.list_entry_links` the identical triple). */
  responsible?: string | null;
};

/** #630 — THE TWO PROVENANCE HUMANS OF ONE OPERATION RECEIPT, or null when the receipt has no
 *  Work behind it.
 *
 *  WHY A FALLBACK TO `initiator` RATHER THAN A BLANK. A database below the 0184 frontier answers
 *  with `initiator` alone — and there that column was frozen at admission, so it genuinely is
 *  both facts at once. Reading it as both is the honest rendering of that row, not a guess; on
 *  or above the frontier the door sends all three and the fallback never fires.
 *
 *  BOTH HALVES OR NEITHER. A receipt whose `work_id` is null left-joins to nulls across the
 *  board, and a labelled row over a blank would be the surface claiming a provenance the door
 *  never gave it. */
export function activityProvenance(
  detail: Pick<ActivityDetail, "initiator" | "initiated_by" | "responsible">,
): { initiatedBy: string; responsible: string } | null {
  const responsible = detail.responsible ?? detail.initiator ?? null;
  const initiatedBy = detail.initiated_by ?? detail.initiator ?? null;
  if (!responsible || !initiatedBy) return null;
  return { initiatedBy, responsible };
}

export type ActivityPage = {
  rows: ActivityRow[];
  next_cursor: string | null;
  truncated: boolean;
};

export type ActivityFilters = {
  client?: string | null;
  kinds?: readonly ActivityKind[] | null;
  /** `YYYY-MM-DD`, in the business timezone — never a bare Date or a browser-local day.
   *  `since` is INCLUSIVE (that calendar day's own start); `until` is its own EXCLUSIVE upper
   *  fence (the NEXT calendar day's start) — see `businessDayEnd`'s own comment for why the two
   *  bounds are not symmetric. */
  since?: string | null;
  until?: string | null;
};

/** The door's own page ceiling (0181: "p_limit clamped 1..100" — TIGHTER than
 *  `list_firm_timeline`'s 200, because this door does three reads and a merge-sort per page). */
export const ACTIVITY_MAX_LIMIT = 100;
export const ACTIVITY_DEFAULT_LIMIT = 25;

/** A business-timezone calendar day's exact start, as an offset ISO instant. The business
 *  timezone (Malaysia, `lib/business-date.ts`'s own `CLARA_BUSINESS_TIMEZONE`) carries no DST, so
 *  the `+08:00` offset is a literal rather than a computed one — see that module's own header for
 *  why the business day is not the browser's local day at all. */
function businessDayStart(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000+08:00`;
}

/** The EXCLUSIVE upper fence for a business-timezone calendar day: the NEXT day's own start, not
 *  this day's last representable instant. 0181 compares `occurred_at < p_until` (not `<=`)
 *  precisely so this function can hand it a clean boundary instead of a manufactured
 *  near-midnight literal — `occurred_at` carries MICROSECOND precision, and a same-day `<=` bound
 *  built from `23:59:59.999` (millisecond resolution) would silently drop any row timestamped in
 *  that day's last sub-millisecond, a real boundary loss the exclusive next-day form has no room
 *  for: every instant strictly before the next calendar day begins is included, to the
 *  microsecond, with one comparison operator. Deliberately NOT named `businessDayEnd` returning an
 *  inclusive `23:59:59.999` literal — see 0181's own header, "P_SINCE IS INCLUSIVE... P_UNTIL IS
 *  EXCLUSIVE", for the fuller rationale this mirrors on the wire side. */
function businessDayEnd(dateOnly: string): string {
  const parts = dateOnly.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  // `Date.UTC` normalises an out-of-range day (e.g. day 32 of a 31-day month) into the correct
  // next month/year on its own — the same overflow behaviour every native Date arithmetic relies
  // on — so this rolls over a month/year boundary correctly with no special-cased calendar math.
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDateOnly = nextDay.toISOString().slice(0, 10);
  return `${nextDateOnly}T00:00:00.000+08:00`;
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
 *  business timezone and are converted here to the `[since, until)` instant range the door
 *  expects (inclusive start, exclusive end — see `businessDayEnd`'s own comment) — the ONE place
 *  that conversion happens, so a caller never hand-rolls a timezone offset. `opts.cursor` is
 *  round-tripped verbatim from a previous page's `next_cursor`; passing anything else is a
 *  malformed-cursor CLR10 refusal, by the door's own contract. */
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
  event: { source: ActivitySource; id: string } | null;
};

/** Parse the feed's own FOUR query params off a `URLSearchParams` (or any string-keyed reader with
 *  a compatible `.get`) — `client`, `kinds`, `since`/`until` and `event`; there is deliberately no
 *  `cursor` (this file's own header explains why pagination is not a URL concern). Every field
 *  degrades to its empty default on a malformed value rather than throwing — the URL is
 *  user-editable input, not a trusted wire contract. `kinds` is comma-joined in the URL
 *  (`?kinds=journal,close`) and de-duplicated; an unrecognised kind token is DROPPED rather than
 *  sent to the door, so a stale bookmark from a retired kind degrades to "no filter on that axis"
 *  instead of a CLR10 the user never asked for. `client` is SHAPE-CHECKED the same way
 *  (`isClientIdShape`, `lib/client-id.ts`): a hand-edited or stale non-uuid value is dropped here
 *  rather than posted to the door's `p_client uuid` parameter, where PostgREST would answer a raw
 *  400 `22P02` this module has no chance to turn into an honest state. */
export function parseActivityUrlState(params: Pick<URLSearchParams, "get">): ActivityUrlState {
  const client = params.get("client");
  const kindsRaw = params.get("kinds");
  const kinds = kindsRaw
    ? [...new Set(kindsRaw.split(",").map((k) => k.trim()).filter((k) => k.length > 0))].filter(isActivityKind)
    : [];
  const since = params.get("since");
  const until = params.get("until");
  const event = parseEventParam(params.get("event"));
  return {
    client: client && isClientIdShape(client) ? client : null,
    kinds,
    since: since && isDateOnly(since) ? since : null,
    until: until && isDateOnly(until) ? until : null,
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
  if ("event" in patch) setOrDelete("event", patch.event ? formatEventParam(patch.event.source, patch.event.id) : null);
  return next;
}

/** For an `agent_receipt` row, the `receipt_kind` half of its `id` (see this file's header —
 *  the id IS `receipt_kind:receipt_id`, so this is a client-side re-derivation of the SAME
 *  encoding the door already documents, not a second contract). `null` for any other source, or
 *  for a malformed id with no colon at all. Used to render the SAME receipt-kind label
 *  `lib/firm/receipt-kinds.ts` already pins, without the door repeating the kind as a second
 *  field on every list row. */
export function agentReceiptKindOf(row: Pick<ActivityRow, "source" | "id">): string | null {
  if (row.source !== "agent_receipt") return null;
  const i = row.id.indexOf(":");
  return i > 0 ? row.id.slice(0, i) : null;
}

// ── link builders ─────────────────────────────────────────────────────────────

/** `/clients/:clientId/work/:workId` — the one object link that names a specific row today. */
export function activityWorkHref(clientId: string, workId: string): string {
  return workDetailHref(clientId, workId);
}

/** `/clients/:clientId/journals`, or `/clients/:clientId/journals?entry=<entryId>` when an entry
 *  is named — the Journals tab. See this file's header: no per-entry or per-tab query parameter
 *  is READ by the workbench yet (#634's lane is adding that `?entry=` read and merges after this
 *  branch), so every link built here lands on the STABLE TAB either way today — the query
 *  parameter is honest about the destination it names without depending on the reader existing
 *  yet, and starts working the moment #634 lands with no change on this side. ONE builder for
 *  every journal-entry destination this feed offers (the plain object-kind='entry' fallback link,
 *  and the correction chain's original/replacement links below) — a second, differently-shaped
 *  builder for the "same tab, different entry" case would be the thing this file's own header
 *  warns against inventing a query parameter for. */
export function activityJournalsHref(clientId: string, entryId?: string | null): string {
  const item = ACCOUNTING_ITEMS.find((i) => i.id === "journals");
  if (!item) throw new Error("activityJournalsHref: the journals accounting item is missing from the registry");
  const base = accountingHref(clientId, item);
  return entryId ? `${base}?entry=${entryId}` : base;
}

/** `/clients/:clientId/documents` — the Documents tab; see the Journals link's own note. */
export function activityDocumentsHref(clientId: string): string {
  const item = CLIENT_NAV.find((i) => i.id === "documents");
  if (!item) throw new Error("activityDocumentsHref: the documents client-nav item is missing from the registry");
  return clientNavHref(clientId, item);
}

/** Resolve the ONE primary link a row should offer, honouring the priority the spec's own
 *  language implies (Work is the durable record; an object link is the fallback when there is no
 *  Work). `null` when a row genuinely has nothing to link to (e.g. an agent_receipt row with no
 *  client_id — a platform-scope receipt). An entry-kind row's link names the entry itself
 *  (`object_id`), the same `?entry=` shape the correction-chain links use, so a plain posting and
 *  a corrected one deep-link the same way. */
export function primaryActivityHref(
  row: Pick<ActivityRow, "client_id" | "work_id" | "object_kind" | "object_id">,
): string | null {
  if (!row.client_id) return null;
  if (row.work_id) return activityWorkHref(row.client_id, row.work_id);
  if (row.object_kind === "entry") return activityJournalsHref(row.client_id, row.object_id);
  if (row.object_kind === "document") return activityDocumentsHref(row.client_id);
  return null;
}

// ── the one sentence a row/detail shows ──────────────────────────────────────

type Translate = (key: string, values?: Record<string, string>) => string;

/** The one sentence a row or its detail shows — always a DB-provided fact, never a composed
 *  guess. Shared by activity-row.tsx and activity-event-sheet.tsx (a second, near-identical copy
 *  per component is exactly the drift this module's other shared helpers already guard against):
 *  a plain `ActivityRow` carries no `receipt_kind`/`purpose` fields of its own, so the
 *  agent_receipt/operation_receipt branches fall back to `agentReceiptKindOf`/`event_type` in that
 *  shape, while an `ActivityDetail` carries the door's own `receipt_kind`/`purpose` and those take
 *  precedence when present — the SAME function handles both without the caller telling it which
 *  shape it has.
 *    event: `description` (event_types' own sentence).
 *    agent_receipt: the pinned receipt-kind label (`lib/firm/receipt-kinds.ts`).
 *    operation_receipt: the Work purpose label (`purpose`/`event_type` carries
 *    `clara.accounting_work.purpose`, per 0181's own header — the door's ONE allowed substitute
 *    for a fabricated sentence). */
export function describeActivity(
  row: Pick<ActivityRow, "source" | "description" | "event_type" | "id"> & {
    receipt_kind?: string;
    purpose?: string;
  },
  t: Translate,
  tReceipt: (key: string) => string,
): string {
  if (row.source === "event") return row.description ?? row.event_type ?? t("unlabeledEvent");
  if (row.source === "agent_receipt") {
    const kind = row.receipt_kind ?? agentReceiptKindOf(row);
    return kind && isKnownAgentReceiptKind(kind) ? tReceipt(`receiptKinds.${kind}`) : (kind ?? t("unlabeledEvent"));
  }
  // operation_receipt: `purpose` (the detail door's own field) if present, else the list row's
  // `event_type` — both carry clara.accounting_work.purpose, a closed CHECK ('journal_entry'
  // today, 0178:305) — a purpose this build has not registered a label for renders itself rather
  // than a guessed translation.
  const purpose = row.purpose ?? row.event_type;
  if (!purpose) return t("unlabeledEvent");
  return purpose === "journal_entry" ? t("workPurposes.journal_entry") : purpose;
}
