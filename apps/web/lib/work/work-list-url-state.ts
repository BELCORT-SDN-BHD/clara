// #641 (journey B3) — the Work list's URL-state model: `?view=&client=&status=&purpose=
// &initiator=&since=&until=&q=&cursor=`.
//
// THE URL IS THE LIST'S STATE, ALL OF IT, AND THAT INCLUDES THE PAGE. This is the one place this
// codebase deliberately departs from `lib/firm/activity.ts`, whose own header explains why the
// Activity feed keeps its cursor in memory: that feed APPENDS pages into one growing scroll, so a
// bookmarked `?cursor=` would name a page with no page 1 beneath it. The Work list paginates
// properly — one page at a time, Previous/Next, the shadcn Pagination composition — so a cursor
// in the URL means exactly what it looks like it means: THIS page. That is what makes AC5's
// "browser Back restores the same Work and prior list position" true without a scroll-restoration
// heuristic, and it is what lets a person send a colleague the page they are actually looking at.
//
// EVERY FIELD DEGRADES TO ITS EMPTY DEFAULT ON A MALFORMED VALUE, never a throw: the URL is
// user-editable input, not a trusted wire contract. An unrecognised status or a non-uuid client is
// DROPPED here rather than sent to the door, where it would come back as a CLR10 the person never
// asked for (`status`) or a raw PostgREST 400 `22P02` this module has no chance to turn into an
// honest state (`client`, `initiator`). `purpose` is the deliberate exception and it mirrors the
// door's own asymmetry: `clara.accounting_work.purpose` carries ONE value today and concurrent
// lanes are widening its CHECK, so a purpose token is passed through as typed rather than checked
// against a roster this build would have to keep in step with a database it does not own.
//
// THE BUILT-IN "NEEDS YOU" VIEW SURVIVES THE REWRITE. `/work?view=needs-you` is the address #614
// minted and `lib/navigation/legacy-routes.ts` redirects the old `/needs-you` to; it is preserved
// here as a BUILT-IN saved view that contributes `status=['awaiting_input']` when the URL names no
// explicit status of its own. An explicit `?status=` always wins — a person who narrowed the view
// by hand has said something more specific than the pill they arrived through.

import { isClientIdShape } from "@/lib/client-id";
import { isDateOnly } from "@/lib/firm/activity";
import { WORK_NEEDS_YOU_VIEW } from "@/lib/navigation/tree";
import { WORK_STATUS_FACETS } from "./work-list";

export type WorkListUrlState = {
  /** A saved view id — the built-in `needs-you`, or one of the caller's own saved views. */
  view: string | null;
  client: string | null;
  status: string[];
  purpose: string[];
  initiator: string | null;
  since: string | null;
  until: string | null;
  q: string | null;
  cursor: string | null;
};

export const EMPTY_WORK_LIST_STATE: WorkListUrlState = {
  view: null, client: null, status: [], purpose: [], initiator: null,
  since: null, until: null, q: null, cursor: null,
};

/** The built-in views this build ships, and the filters each one stands for. A saved view a
 *  PERSON created lives in `interface.workViews` (0189) and carries its own query string; these
 *  two are the product's own and need no storage. */
export const BUILT_IN_WORK_VIEWS: ReadonlyMap<string, { status: string[] }> = new Map([
  [WORK_NEEDS_YOU_VIEW, { status: ["awaiting_input"] }],
]);

function isKnownStatus(value: string): boolean {
  return (WORK_STATUS_FACETS as readonly string[]).includes(value);
}

/** A comma-joined URL list, de-duplicated and blank-stripped. `null`/absent is an empty list. */
function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((v) => v.trim()).filter((v) => v.length > 0))];
}

/** Parse the list's nine query params off a `URLSearchParams` (or any string-keyed reader with a
 *  compatible `.get`). See this file's header for what is dropped and why. */
export function parseWorkListUrlState(params: Pick<URLSearchParams, "get">): WorkListUrlState {
  const viewRaw = params.get("view");
  const view = viewRaw && viewRaw.trim() !== "" ? viewRaw.trim() : null;

  const client = params.get("client");
  const initiator = params.get("initiator");
  const since = params.get("since");
  const until = params.get("until");
  const qRaw = params.get("q");
  const cursorRaw = params.get("cursor");

  const explicitStatus = parseList(params.get("status")).filter(isKnownStatus);
  // The built-in view contributes its filters ONLY where the URL names no explicit status of its
  // own — see this file's header.
  const builtIn = view === null ? undefined : BUILT_IN_WORK_VIEWS.get(view);
  const status = explicitStatus.length > 0 ? explicitStatus : (builtIn?.status ?? []);

  return {
    view,
    client: client && isClientIdShape(client) ? client : null,
    status,
    purpose: parseList(params.get("purpose")),
    initiator: initiator && isClientIdShape(initiator) ? initiator : null,
    since: since && isDateOnly(since) ? since : null,
    until: until && isDateOnly(until) ? until : null,
    q: qRaw && qRaw.trim() !== "" ? qRaw : null,
    cursor: cursorRaw && cursorRaw.trim() !== "" ? cursorRaw : null,
  };
}

/**
 * The inverse, folded onto an existing `URLSearchParams` so a caller updating ONE field keeps
 * every other param untouched. An empty/absent field DELETES its key rather than writing `""`, so
 * the URL never accumulates dead `?since=&until=` noise across filter changes. Returns a NEW
 * `URLSearchParams`; the input is not mutated.
 *
 * A FILTER CHANGE DROPS THE CURSOR, ALWAYS, AND NOT AS A CONVENIENCE. A cursor is a fence into ONE
 * ordered result set (`clara.list_accounting_work` mints it from the last row of the page it just
 * answered); carrying it across a filter change would fence a DIFFERENT result set at a position
 * that never belonged to it — a page of rows nobody asked for, with no way to tell it was wrong.
 * So any patch that touches a filter axis clears `cursor` unless the SAME patch sets one
 * explicitly (which is what Previous/Next do).
 */
export function applyWorkListUrlState(
  base: Pick<URLSearchParams, "toString">,
  patch: Partial<WorkListUrlState>,
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  const setOrDelete = (key: string, value: string | null | undefined) => {
    if (value === undefined) return; // not part of this patch — leave whatever is there
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  };
  const setList = (key: string, value: readonly string[] | undefined) => {
    if (value === undefined) return;
    setOrDelete(key, value.length > 0 ? value.join(",") : null);
  };

  const FILTER_KEYS = ["client", "status", "purpose", "initiator", "since", "until", "q", "view"] as const;
  const touchesFilter = FILTER_KEYS.some((k) => k in patch);

  if ("view" in patch) setOrDelete("view", patch.view);
  if ("client" in patch) setOrDelete("client", patch.client);
  if ("status" in patch) setList("status", patch.status);
  if ("purpose" in patch) setList("purpose", patch.purpose);
  if ("initiator" in patch) setOrDelete("initiator", patch.initiator);
  if ("since" in patch) setOrDelete("since", patch.since);
  if ("until" in patch) setOrDelete("until", patch.until);
  if ("q" in patch) setOrDelete("q", patch.q);

  if ("cursor" in patch) setOrDelete("cursor", patch.cursor);
  else if (touchesFilter) next.delete("cursor");

  return next;
}

/** TRUE when any filter axis is narrowing the list — the test the Empty state uses to tell
 *  "nothing matches these filters" from "this is your first Work". The CURSOR is not a filter and
 *  the VIEW counts only when it actually contributes one (a view whose filters the URL has since
 *  overridden is just a label). */
export function hasWorkListFilters(state: WorkListUrlState): boolean {
  return (
    state.client !== null
    || state.status.length > 0
    || state.purpose.length > 0
    || state.initiator !== null
    || state.since !== null
    || state.until !== null
    || state.q !== null
  );
}

/**
 * The canonical query string for a state — what a SAVED VIEW stores, and the one spelling two
 * states are compared by. Keys in a fixed order and list values sorted, so the same filter set
 * chosen in two different orders saves and compares as one string rather than two.
 *
 * `cursor` is deliberately absent: a saved view is a set of FILTERS, and a view that remembered
 * page 4 of a result set that has since changed would open on a fence into nothing.
 */
export function workListStateQuery(state: WorkListUrlState): string {
  const out = new URLSearchParams();
  if (state.client !== null) out.set("client", state.client);
  if (state.status.length > 0) out.set("status", [...state.status].sort().join(","));
  if (state.purpose.length > 0) out.set("purpose", [...state.purpose].sort().join(","));
  if (state.initiator !== null) out.set("initiator", state.initiator);
  if (state.since !== null) out.set("since", state.since);
  if (state.until !== null) out.set("until", state.until);
  if (state.q !== null) out.set("q", state.q);
  return out.toString();
}
