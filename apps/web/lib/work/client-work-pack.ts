// #650 (journey A-home) — the wire contract for `clara.get_client_work_pack`
// (packages/db/migrations/0199_client_work_pack.sql), and the ONE place this codebase turns a
// Work attention facet into the URL of the list that owns it.
//
// TWO FACETS COME BACK, THREE TILES GO ON THE PAGE, and the asymmetry is deliberate rather than
// an oversight. The third number — Works waiting on a person — already ships through
// `clara.list_review_queue`'s `counts.work_questions` at VIEWER floor
// (`lib/firm/needs-you.ts`, rendered by `components/firm/needs-you-counts.tsx`), while this door
// floors at bookkeeper. Folding it in here would take a shipped surface away from viewers and put
// two aggregations of one relation under one noun on one page (裁-190). The board composes the
// shipped number for that tile; this module never computes one, and the envelope's
// `needs_you_ref` says whose number it is.
//
// UNKNOWN IS NOT ZERO, and that is the whole hydration rule. A facet whose count this build could
// not read comes back `{status:'unknown', count:null}` — because "nothing is running for this
// client" and "I could not find out what is running" are different sentences and only one of them
// means a person can stop looking. `?? 0` anywhere in this file would be the bug.
//
// THE COUNT IS NEVER `rows.length`. `rows` is a PREVIEW (at most `preview_limit`), so a client
// with forty running Works shows five of them under the number forty. `lib/work/work-list.ts`'s
// own header states the sibling rule for the paged list; this is that rule's other half.
//
// ONE HREF BUILDER, so the home and the Work list cannot spell one filter two ways. Every facet
// link is composed through `applyWorkListUrlState` — the list's own writer — and the cells read it
// back through the list's own parser. A hand-written `?status=queued,running` would look right and
// could still normalise to something else.

import { callDoor } from "@/lib/doors";
import { businessDayEnd, businessDayStart, isDateOnly } from "@/lib/firm/activity";
import { WORK_NEEDS_YOU_VIEW, clientBase } from "@/lib/navigation/tree";
import type { SessionTokenAccessor } from "@/lib/session";
import { applyWorkListUrlState } from "./work-list-url-state";

export type ClientWorkPackOptions = {
  session?: SessionTokenAccessor;
  signal?: AbortSignal;
  /** The door clamps this 1..25; the board asks for its own tile length. */
  preview?: number;
};

/** The door's own default preview size (0199: `p_preview int default 5`). */
export const CLIENT_WORK_PACK_PREVIEW = 5;

/** The three attention facets this board shows. `needs_you` is NOT served by this door — it is
 *  the review queue's — but it is a facet of the BOARD, and the href builder owns its link too so
 *  all three drilldowns are spelled in one place. */
export type WorkAttentionFacetKind = "needs_you" | "active" | "recent_success";

/**
 * A facet's ANSWER STATE, as the reader sees it.
 *
 *   ok        the door answered and the population is fully covered.
 *   partial   the door answered and SAID which part of the answer it is not making.
 *   unknown   this build could not read the facet — a malformed body, or a read that never
 *             landed. Distinct from `ok` with a count of 0.
 *   denied    the caller may not read it. Distinct from `unknown`: one is a permission, the
 *             other is a failure.
 *
 * The first two come from the door; the last two are set by the browser (`unknown` here, `denied`
 * by `use-client-work-pack.ts`), because a door cannot report about itself that it was not
 * reachable.
 */
export type WorkAttentionStatus = "ok" | "partial" | "unknown" | "denied";

const DOOR_STATUSES: readonly WorkAttentionStatus[] = ["ok", "partial"];

/** The two canonical Work statuses "active" means — the door's own pair, restated once so the
 *  drilldown and the count cannot drift apart. `retrying` is NOT among them: 0189's status roster
 *  has no retry member, so the list cannot express it and the board discloses it on rows instead
 *  of faking a filter. */
export const WORK_ATTENTION_ACTIVE_STATUSES = ["queued", "running"] as const;

/** One preview row. Every field the door can leave null is typed nullable: an absent field is an
 *  honest absence, never coerced to "" or 0. */
export type WorkAttentionRow = {
  work_id: string;
  purpose: string | null;
  status: string | null;
  memo: string | null;
  /** How many runs this Work has had — the fact behind the Retrying label. Null when the door
   *  could not say (it asks 0189's helper only about the preview). */
  attempts: number | null;
  current_run_status: string | null;
  /** `attempts > 1`, decided in the database. A label, never a filter. */
  retrying: boolean;
  created_at: string | null;
  /** Recent-success rows only: the instant the committed receipt was written. */
  committed_at: string | null;
  receipt_id: string | null;
  entry_id: string | null;
};

export type WorkAttentionFacet = {
  status: WorkAttentionStatus;
  /** NULL means unknown. It is never 0 for a facet this build could not read. */
  count: number | null;
  coverage: "ok" | "partial" | null;
  /** The door's machine token for WHY coverage is partial, or null. */
  coverageReason: string | null;
  /** recent_success only: how many completed Works carry no committed receipt and therefore
   *  cannot be dated at all. */
  uncountedCompletions: number | null;
  rows: WorkAttentionRow[];
};

export type ClientWorkPackWindow = {
  from: string | null;
  to: string | null;
  fromDate: string | null;
  toDate: string | null;
  timezone: string | null;
  days: number | null;
};

export type ClientWorkPack = {
  /** The instant of THIS read. Deliberately not called a watermark: the Work lane emits no
   *  domain events, so there is no mutation position to report. */
  computedAt: string | null;
  previewLimit: number | null;
  window: ClientWorkPackWindow | null;
  active: WorkAttentionFacet;
  recentSuccess: WorkAttentionFacet;
  /** The read that owns the needs-you number, named by the door so the board composes one source
   *  rather than growing a second. */
  needsYouSource: string | null;
};

/** The one honest answer for a facet nothing could be read from. Frozen so a caller cannot
 *  mutate the shared shape into something that looks like data. */
export const UNKNOWN_FACET: WorkAttentionFacet = Object.freeze({
  status: "unknown" as const,
  count: null,
  coverage: null,
  coverageReason: null,
  uncountedCompletions: null,
  rows: Object.freeze([]) as unknown as WorkAttentionRow[],
});

/** A facet the caller may not read. Same shape, different sentence. */
export const DENIED_FACET: WorkAttentionFacet = Object.freeze({
  ...UNKNOWN_FACET, status: "denied" as const,
});

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** A count is a non-negative integer or it is not a count. A string "3", a float, a negative or
 *  an absent value all mean the same thing here: this build does not know. */
function count(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

function hydrateRow(raw: unknown): WorkAttentionRow | null {
  if (!isObject(raw)) return null;
  const id = str(raw.work_id);
  if (id === null) return null; // a row with no Work id cannot be linked to, so it is not a row
  return {
    work_id: id,
    purpose: str(raw.purpose),
    status: str(raw.status),
    memo: str(raw.memo),
    attempts: count(raw.attempts),
    current_run_status: str(raw.current_run_status),
    retrying: raw.retrying === true,
    created_at: str(raw.created_at),
    committed_at: str(raw.committed_at),
    receipt_id: str(raw.receipt_id),
    entry_id: str(raw.entry_id),
  };
}

function hydrateFacet(raw: unknown): WorkAttentionFacet {
  if (!isObject(raw)) return UNKNOWN_FACET;
  const n = count(raw.count);
  const status = raw.status;
  if (n === null || typeof status !== "string" || !DOOR_STATUSES.includes(status as WorkAttentionStatus)) {
    // A word this build has not enumerated makes the whole facet unusable: it may be naming a
    // narrowing this build would not render. Reported as unknown rather than passed through.
    return UNKNOWN_FACET;
  }
  const coverage = raw.coverage === "ok" || raw.coverage === "partial" ? raw.coverage : null;
  return {
    status: status as WorkAttentionStatus,
    count: n,
    coverage,
    coverageReason: str(raw.coverage_reason),
    uncountedCompletions: count(raw.uncounted_completions),
    rows: Array.isArray(raw.rows)
      ? raw.rows.map(hydrateRow).filter((r): r is WorkAttentionRow => r !== null)
      : [],
  };
}

function hydrateWindow(raw: unknown): ClientWorkPackWindow | null {
  if (!isObject(raw)) return null;
  return {
    from: str(raw.from),
    to: str(raw.to),
    fromDate: str(raw.from_date),
    toDate: str(raw.to_date),
    timezone: str(raw.timezone),
    days: count(raw.days),
  };
}

/** HYDRATE-NEVER-TRUST over the whole envelope. Every arm degrades to `unknown`; none of them
 *  degrades to a number. */
export function hydrateClientWorkPack(raw: unknown): ClientWorkPack {
  if (!isObject(raw)) {
    return {
      computedAt: null, previewLimit: null, window: null,
      active: UNKNOWN_FACET, recentSuccess: UNKNOWN_FACET, needsYouSource: null,
    };
  }
  const facets = isObject(raw.facets) ? raw.facets : {};
  return {
    computedAt: str(raw.computed_at),
    previewLimit: count(raw.preview_limit),
    window: hydrateWindow(raw.window),
    active: hydrateFacet(facets.active),
    recentSuccess: hydrateFacet(facets.recent_success),
    needsYouSource: isObject(raw.needs_you_ref) ? str(raw.needs_you_ref.source) : null,
  };
}

/** The pack for one client. A governed refusal travels as a `DoorRefusal` — it is not hydrated
 *  into an empty board, because "you may not see this" is not "there is nothing here". */
export async function getClientWorkPack(
  clientId: string,
  opts: ClientWorkPackOptions = {},
): Promise<ClientWorkPack> {
  const raw = await callDoor<unknown>(
    "get_client_work_pack",
    { p_client: clientId, p_preview: opts.preview ?? CLIENT_WORK_PACK_PREVIEW },
    { session: opts.session, signal: opts.signal },
  );
  return hydrateClientWorkPack(raw);
}

/**
 * THE ONE FACET → LIST URL BUILDER.
 *
 * Composed through `applyWorkListUrlState` from an EMPTY `URLSearchParams`, which is what makes
 * the third argument the whole input: nothing from the page's own address can reach a facet link,
 * so a fiscal-year (or any other) query parameter on the home URL cannot narrow a Work facet. The
 * route already scopes the client, so no `client` axis is emitted either.
 *
 *   needs_you       the list's BUILT-IN view (`?view=needs-you`), which contributes
 *                   `status=awaiting_input` itself. Restating that status here would be a second
 *                   spelling of one filter.
 *   active          `?status=queued,running` — the door's own pair. "Retrying" is NOT a member of
 *                   0189's status roster, so it cannot be a filter; the tile discloses the retry
 *                   subset on its preview rows instead.
 *   recent_success  `?status=completed` plus the pack's OWN window dates. `since`/`until` are
 *                   business-timezone calendar days, and the list turns them back into exactly
 *                   the half-open instant range the door used — so the drilldown is the same week
 *                   as the tile. A window this build could not read contributes no dates at all
 *                   rather than a guessed week.
 */
export function workAttentionHref(
  kind: WorkAttentionFacetKind,
  clientId: string,
  pack: ClientWorkPack,
): string {
  const base = `${clientBase(clientId)}/work`;
  const empty = new URLSearchParams();

  if (kind === "needs_you") {
    return `${base}?${applyWorkListUrlState(empty, { view: WORK_NEEDS_YOU_VIEW }).toString()}`;
  }
  if (kind === "active") {
    return `${base}?${applyWorkListUrlState(empty, {
      status: [...WORK_ATTENTION_ACTIVE_STATUSES],
    }).toString()}`;
  }
  const from = pack.window?.fromDate ?? null;
  const to = pack.window?.toDate ?? null;
  const dated = from !== null && to !== null && isDateOnly(from) && isDateOnly(to);
  return `${base}?${applyWorkListUrlState(empty, {
    status: ["completed"],
    since: dated ? from : null,
    until: dated ? to : null,
  }).toString()}`;
}

/** The instant range a facet's drilldown dates rebuild, for a caller that wants to show it.
 *  Exported so the board and its cells read the same conversion the list performs. */
export function workAttentionWindowInstants(
  pack: ClientWorkPack,
): { from: string; to: string } | null {
  const from = pack.window?.fromDate ?? null;
  const to = pack.window?.toDate ?? null;
  if (from === null || to === null || !isDateOnly(from) || !isDateOnly(to)) return null;
  return { from: businessDayStart(from), to: businessDayEnd(to) };
}
