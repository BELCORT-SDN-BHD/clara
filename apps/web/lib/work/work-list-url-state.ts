// #641 (journey B3) — the Work list's URL-state model: `?view=&client=&status=&purpose=
// &initiator=&since=&until=&receiptSince=&receiptUntil=&q=&cursor=&work=`.
//
// THE NINE FILTER AXES ARE ENUMERATED ONCE, IN `WORK_LIST_FILTER_AXES`, and every question this
// module and its two components ask about them is derived from that one list: is anything
// narrowing the list, how many axes are, what the canonical saved-view spelling is, which keys a
// patch must clear, and which keys drop the cursor. The first cut hand-wrote the tuple in five
// places (including two byte-similar "clear everything" object literals in two components), which
// is Fowler's Duplicated Code over a Data Clump and, more practically, a place to forget a new
// axis. Adding one is adding one line here.
//
// #905: `receiptSince`/`receiptUntil` ARE FILTER AXES — they narrow the page exactly as `since`/
// `until` do, just on `clara.list_accounting_work`'s OTHER date bound (a Work's own committed
// receipt, `p_receipt_since`/`p_receipt_until`, migration 0267) — but they have NO VISIBLE
// CONTROL in `WorkListFilterControls`: the only way a person reaches them today is the client
// home's recent-success tile (`lib/work/client-work-pack.ts`'s `workAttentionHref`), never a
// hand-picked date on the filter bar (#905's own "Out of scope" line: no second visible date
// control). Being real axes is still correct — "N filters narrowing" and "Clear filters" must
// count and clear a receipt-dated drilldown the same as any other, or a person arriving from the
// tile would see a narrowed list with no way to tell, or clear, why.
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

import { isClientIdShape, isUuidShape } from "@/lib/client-id";
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
  /** #905 — the OTHER date bound: `clara.list_accounting_work`'s `p_receipt_since`/
   *  `p_receipt_until` (migration 0267), which fence a Work's OWN committed receipt instead of
   *  its admission instant. Same calendar-date shape and validation as `since`/`until`; see this
   *  file's header for why it is a real filter axis with no visible control of its own. */
  receiptSince: string | null;
  receiptUntil: string | null;
  q: string | null;
  cursor: string | null;
  /**
   * THE ADDRESSED WORK — `?work=<id>`, #719's own lesson.
   *
   * It is neither a filter nor a page: it names ONE Work the caller arrived pointing at, which
   * may sit anywhere — three pages down, or excluded by the very filters this same URL carries.
   * `clara.get_accounting_work_row` exists to resolve it OUTSIDE the page window, so this field
   * survives a filter change (the addressed row is still the row they asked for) and is left out
   * of a saved view's canonical query (a view is a filter set, not a pointer at one record).
   */
  work: string | null;
};

/** THE NINE FILTER AXES, in the canonical order a saved view is spelled in. `view` is not one of
 *  them — it is a LABEL for a filter set, which is why it clears with them but does not count as
 *  one — and neither `cursor` nor `work` is: a page and an address are not narrowings.
 *  `receiptSince`/`receiptUntil` (#905) ARE axes despite having no visible control — see this
 *  file's header. */
export const WORK_LIST_FILTER_AXES = [
  "client", "status", "purpose", "initiator", "since", "until", "receiptSince", "receiptUntil", "q",
] as const;
export type WorkListFilterAxis = (typeof WORK_LIST_FILTER_AXES)[number];

/** The keys a patch may carry that mean "the filter set changed" — the nine axes plus the view
 *  label they light. `applyWorkListUrlState` drops the cursor for any of them. */
export const WORK_LIST_FILTER_KEYS = [...WORK_LIST_FILTER_AXES, "view"] as const;

/** THE ONE "clear everything" PATCH, so the Empty's Clear-filters button and the filter bar's own
 *  cannot drift apart. `cursor` is deliberately absent: `applyWorkListUrlState` already drops it
 *  for any patch that touches a filter key, so naming it here would be a second statement of the
 *  same rule — and the addressed `work` is not a filter, so clearing filters does not discard the
 *  row the caller came here pointing at. */
export const EMPTY_WORK_LIST_FILTERS: Pick<WorkListUrlState, WorkListFilterAxis | "view"> = {
  client: null, status: [], purpose: [], initiator: null,
  since: null, until: null, receiptSince: null, receiptUntil: null, q: null, view: null,
};

/** The empty state is the empty FILTER set plus the two fields that are not filters, so the two
 *  constants cannot describe different worlds. */
export const EMPTY_WORK_LIST_STATE: WorkListUrlState = {
  ...EMPTY_WORK_LIST_FILTERS, cursor: null, work: null,
};

/** An axis's value as the URL spells it, or null when the axis is not narrowing anything. List
 *  axes are SORTED here, which is what makes the same filter set chosen in two orders one string:
 *  this is the single definition every derived question below uses. */
function axisValue(state: WorkListUrlState, axis: WorkListFilterAxis): string | null {
  const raw = state[axis];
  if (Array.isArray(raw)) return raw.length > 0 ? [...raw].sort().join(",") : null;
  return raw;
}

/**
 * 0189's OWN CAPS ON A SAVED VIEW, mirrored here so the browser can refuse what the door would
 * refuse and say WHY — at the control that caused it, before a round trip.
 *
 * These are not this module's numbers: `clara.save_my_preferences`'s `interface.workViews` arm
 * accepts an array of AT MOST 20 views, each with a `query` of at most 512 characters. The
 * previous cut mirrored the door's SHAPES (a 64-character name, unique ids) but not its SIZES, so
 * a 21st save and an over-long query both came back as the generic "That view could not be saved"
 * banner — a refusal the person could not act on, for a rule nothing on screen had stated.
 */
export const WORK_LIST_MAX_SAVED_VIEWS = 20;
export const WORK_LIST_QUERY_MAX = 512;

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

/** Parse the list's eleven query params off a `URLSearchParams` (or any string-keyed reader with a
 *  compatible `.get`). See this file's header for what is dropped and why. */
export function parseWorkListUrlState(params: Pick<URLSearchParams, "get">): WorkListUrlState {
  const viewRaw = params.get("view");
  const view = viewRaw && viewRaw.trim() !== "" ? viewRaw.trim() : null;

  const client = params.get("client");
  const initiator = params.get("initiator");
  const since = params.get("since");
  const until = params.get("until");
  const receiptSince = params.get("receiptSince");
  const receiptUntil = params.get("receiptUntil");
  const qRaw = params.get("q");
  const cursorRaw = params.get("cursor");
  const workRaw = params.get("work");

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
    // #905 — same calendar-date shape and the same "malformed degrades to absent" rule as
    // since/until, never sent to the door as a caller-editable raw string.
    receiptSince: receiptSince && isDateOnly(receiptSince) ? receiptSince : null,
    receiptUntil: receiptUntil && isDateOnly(receiptUntil) ? receiptUntil : null,
    q: qRaw && qRaw.trim() !== "" ? qRaw : null,
    cursor: cursorRaw && cursorRaw.trim() !== "" ? cursorRaw : null,
    // A non-uuid `?work=` is DROPPED here rather than sent to `clara.get_accounting_work_row`,
    // where it would be a raw PostgREST 400 `22P02` on a uuid parameter instead of the honest
    // not-found the door raises for an id that is merely absent or not this caller's.
    work: workRaw && isUuidShape(workRaw) ? workRaw : null,
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

  const touchesFilter = WORK_LIST_FILTER_KEYS.some((k) => k in patch);

  if ("view" in patch) setOrDelete("view", patch.view);
  if ("client" in patch) setOrDelete("client", patch.client);
  if ("status" in patch) setList("status", patch.status);
  if ("purpose" in patch) setList("purpose", patch.purpose);
  if ("initiator" in patch) setOrDelete("initiator", patch.initiator);
  if ("since" in patch) setOrDelete("since", patch.since);
  if ("until" in patch) setOrDelete("until", patch.until);
  if ("receiptSince" in patch) setOrDelete("receiptSince", patch.receiptSince);
  if ("receiptUntil" in patch) setOrDelete("receiptUntil", patch.receiptUntil);
  if ("q" in patch) setOrDelete("q", patch.q);

  if ("work" in patch) setOrDelete("work", patch.work);

  if ("cursor" in patch) setOrDelete("cursor", patch.cursor);
  else if (touchesFilter) next.delete("cursor");

  return next;
}

/** TRUE when any filter axis is narrowing the list — the test the Empty state uses to tell
 *  "nothing matches these filters" from "this is your first Work". The CURSOR is not a filter, the
 *  addressed `work` is not a filter, and the VIEW counts only when it actually contributes one (a
 *  view whose filters the URL has since overridden is just a label). */
export function hasWorkListFilters(state: WorkListUrlState): boolean {
  return WORK_LIST_FILTER_AXES.some((axis) => axisValue(state, axis) !== null);
}

/** How many AXES are narrowing the list — not how many tokens. Three selected statuses are ONE
 *  filter on the status axis, and a badge that said "3" would overstate how narrow the view is. */
export function countWorkListFilters(state: WorkListUrlState): number {
  return WORK_LIST_FILTER_AXES.filter((axis) => axisValue(state, axis) !== null).length;
}

/**
 * The canonical query string for a state — what a SAVED VIEW stores, and the one spelling two
 * states are compared by. Keys in a fixed order and list values sorted, so the same filter set
 * chosen in two different orders saves and compares as one string rather than two.
 *
 * `cursor` is deliberately absent: a saved view is a set of FILTERS, and a view that remembered
 * page 4 of a result set that has since changed would open on a fence into nothing. The addressed
 * `work` is absent for the same kind of reason — a view that pointed at ONE record would open on
 * that record for ever, which is a bookmark, not a view.
 */
export function workListStateQuery(state: WorkListUrlState): string {
  const out = new URLSearchParams();
  for (const axis of WORK_LIST_FILTER_AXES) {
    const value = axisValue(state, axis);
    if (value !== null) out.set(axis, value);
  }
  return out.toString();
}
