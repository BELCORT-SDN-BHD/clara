// #659 (journey B1) — Firm Home's URL-state model: `?status=&attention=&q=&cursor=`.
//
// THIS IS WHAT MAKES "RETURN TO THE PRESERVED PORTFOLIO VIEW" TRUE. Before this file `/` read no
// `searchParams` at all, so a drilldown into a client and a browser Back landed on a board with no
// memory of how it had been narrowed. The state is in the URL, all of it, including the page.
//
// THE CURSOR IS IN THE URL, and that is `lib/work/work-list-url-state.ts`'s argument applied to the
// same shape rather than a new one: this is a PAGED list — one page at a time, Previous/Next, the
// shadcn Pagination composition — not an appending feed like `lib/firm/activity.ts`, whose own
// header explains why a bookmarked `?cursor=` would name a page with no page 1 beneath it. A
// cursor here means exactly what it looks like it means: THIS page.
//
// EVERY FIELD DEGRADES TO ITS EMPTY DEFAULT ON A MALFORMED VALUE, never a throw and never a
// request. The URL is user-editable input, not a trusted wire contract. An unrecognised client
// status or attention word is DROPPED here rather than sent anywhere — and the cursor is passed
// through as TYPED rather than shape-checked, because its grammar belongs to the door
// (`lower(name)|uuid`, base64) and a browser that re-derived it would be a second spelling of a
// contract this build does not own. A malformed one comes back CLR10 `invalid_cursor`, which the
// board renders as the typed refusal it is.
//
// A FILTER CHANGE DROPS THE CURSOR, ALWAYS. A cursor is a fence into ONE ordered result set;
// carrying it across a filter change would fence a DIFFERENT set at a position that never belonged
// to it. Previous/Next set the cursor explicitly in the same patch, which is the one case that
// keeps it.

const CLIENT_STATUSES = ["active", "onboarding", "archived"] as const;

/** The attention words the board can narrow by. These are BOARD-side narrowings of rows the door
 *  already returned — they are NOT sent to the door, which takes no filter argument at all. That
 *  is why an unknown word degrades to "no narrowing" rather than to a refusal. */
export const PORTFOLIO_ATTENTION_VALUES = ["needs_you", "active", "failed", "caught_up"] as const;
export type PortfolioAttention = (typeof PORTFOLIO_ATTENTION_VALUES)[number];

export type PortfolioUrlState = {
  /** Client statuses to show. Empty means every status the door returned. */
  status: string[];
  /** One attention narrowing, or null. */
  attention: PortfolioAttention | null;
  /** A client-name contains-match, applied in the browser over the page the door returned. */
  q: string | null;
  /** The door's own opaque keyset cursor for THIS page. */
  cursor: string | null;
};

/** THE THREE FILTER AXES, enumerated ONCE. Every question this module answers is derived from this
 *  list — is anything narrowing the board, how many axes are, which keys drop the cursor — so
 *  adding a fourth is adding one line here rather than editing five call sites. `cursor` is not one
 *  of them: a page is not a narrowing. */
export const PORTFOLIO_FILTER_AXES = ["status", "attention", "q"] as const;
export type PortfolioFilterAxis = (typeof PORTFOLIO_FILTER_AXES)[number];

/** The ONE "clear everything" patch, so an Empty state's Clear button and a filter bar's own
 *  cannot drift apart. `cursor` is deliberately absent: `applyPortfolioUrlState` already drops it
 *  for any patch that touches a filter key. */
export const EMPTY_PORTFOLIO_FILTERS: Pick<PortfolioUrlState, PortfolioFilterAxis> = {
  status: [], attention: null, q: null,
};

export const EMPTY_PORTFOLIO_STATE: PortfolioUrlState = { ...EMPTY_PORTFOLIO_FILTERS, cursor: null };

export function isPortfolioAttention(value: string): value is PortfolioAttention {
  return (PORTFOLIO_ATTENTION_VALUES as readonly string[]).includes(value);
}

function isClientStatus(value: string): boolean {
  return (CLIENT_STATUSES as readonly string[]).includes(value);
}

/** A comma-joined URL list, de-duplicated and blank-stripped. `null`/absent is an empty list. */
function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((v) => v.trim()).filter((v) => v.length > 0))];
}

/** Parse the board's four query params off a `URLSearchParams` (or any string-keyed reader with a
 *  compatible `.get`). See this file's header for what is dropped and why. */
export function parsePortfolioUrlState(params: Pick<URLSearchParams, "get">): PortfolioUrlState {
  const attentionRaw = (params.get("attention") ?? "").trim();
  const qRaw = params.get("q");
  const cursorRaw = params.get("cursor");
  return {
    status: parseList(params.get("status")).filter(isClientStatus),
    attention: isPortfolioAttention(attentionRaw) ? attentionRaw : null,
    q: qRaw && qRaw.trim() !== "" ? qRaw.trim() : null,
    cursor: cursorRaw && cursorRaw.trim() !== "" ? cursorRaw : null,
  };
}

/**
 * The inverse, folded onto an existing `URLSearchParams` so a caller updating ONE field keeps every
 * other param untouched. An empty/absent field DELETES its key rather than writing `""`, so the URL
 * never accumulates dead `?q=&attention=` noise. Returns a NEW `URLSearchParams`; the input is not
 * mutated.
 */
export function applyPortfolioUrlState(
  base: Pick<URLSearchParams, "toString">,
  patch: Partial<PortfolioUrlState>,
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  const setOrDelete = (key: string, value: string | null | undefined) => {
    if (value === undefined) return; // not part of this patch — leave whatever is there
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  };

  const touchesFilter = PORTFOLIO_FILTER_AXES.some((k) => k in patch);

  if ("status" in patch) {
    setOrDelete("status", patch.status && patch.status.length > 0 ? patch.status.join(",") : null);
  }
  if ("attention" in patch) setOrDelete("attention", patch.attention);
  if ("q" in patch) setOrDelete("q", patch.q);

  if ("cursor" in patch) setOrDelete("cursor", patch.cursor);
  else if (touchesFilter) next.delete("cursor");

  return next;
}

/** An axis's value as the URL spells it, or null when the axis is not narrowing anything. List
 *  axes are SORTED, so the same filter set chosen in two orders is one string. */
function axisValue(state: PortfolioUrlState, axis: PortfolioFilterAxis): string | null {
  const raw = state[axis];
  if (Array.isArray(raw)) return raw.length > 0 ? [...raw].sort().join(",") : null;
  return raw;
}

/** TRUE when any filter axis is narrowing the board — the test an Empty state uses to tell
 *  "nothing matches these filters" from "this firm has no clients yet". The CURSOR is not a
 *  filter. */
export function hasPortfolioFilters(state: PortfolioUrlState): boolean {
  return PORTFOLIO_FILTER_AXES.some((axis) => axisValue(state, axis) !== null);
}

/** How many AXES are narrowing the board — not how many tokens. Two selected statuses are ONE
 *  filter on the status axis, and a badge that said "2" would overstate how narrow the view is. */
export function countPortfolioFilters(state: PortfolioUrlState): number {
  return PORTFOLIO_FILTER_AXES.filter((axis) => axisValue(state, axis) !== null).length;
}

/** The canonical query string for a state — the one spelling two states are compared by, and what
 *  a Back-navigation lands on. `cursor` is included here, unlike the Work list's saved-view query,
 *  because this string names a PAGE a person was looking at rather than a filter set they saved. */
export function portfolioStateQuery(state: PortfolioUrlState): string {
  const out = new URLSearchParams();
  for (const axis of PORTFOLIO_FILTER_AXES) {
    const value = axisValue(state, axis);
    if (value !== null) out.set(axis, value);
  }
  if (state.cursor !== null) out.set("cursor", state.cursor);
  return out.toString();
}
