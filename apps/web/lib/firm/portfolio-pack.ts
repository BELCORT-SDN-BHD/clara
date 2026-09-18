// #659 (journey B1 Firm Home) — the wire contract for `clara.get_firm_portfolio_pack`
// (packages/db/migrations/0231_firm_portfolio_pack.sql), and the ONE place this codebase turns a
// per-client Work count into the URL of the list that owns it.
//
// THE COUNT IS NEVER `rows.length`, AND `preview` IS NEVER THE POPULATION. Each row carries a
// short preview of at most `preview_limit` Works so a person can see what is actually running;
// the numbers beside it are the door's own counts over DISTINCT Work ids. A client with forty
// running Works shows three of them under the number forty. This is `lib/work/client-work-pack.ts`'s
// rule one altitude up, and the same `?? 0` anywhere in this file would be the same bug.
//
// UNKNOWN IS NOT ZERO. A count this build could not read comes back `null`, and the surface prints
// "could not be read". "Nothing is running for this client" and "I could not find out what is
// running" are different sentences, and only one of them means a person can stop looking.
//
// THERE IS NO MONEY HERE AND THERE NEVER WILL BE. Wayfinder's ruling for Firm Home is 不汇总客户
// 金额: the firm's home consolidates no client figures. The migration asserts the absence out of
// `prosrc`; this module asserts it by having no field to put one in, and
// `components/firm/firm-home/firm-portfolio.test.tsx` asserts that the rendered board contains
// none. A portfolio table is the easiest place in the product to `reduce` rows into a false
// cross-client figure — `ReviewQueueRow.amount_cents` is one import away — so the prohibition is
// three assertions rather than a comment.
//
// AND THE COLUMNS ARE NOT A PARTITION. `active` and `recent_success` OVERLAP by construction (a
// Work can be running now and have posted yesterday), and the needs-you number beside them comes
// from `clara.list_review_queue` at a LOWER floor over a SMALLER population. Nothing here adds
// them, and the envelope publishes nothing that could be added.
//
// ONE HREF BUILDER, so the board and the Work list cannot spell one filter two ways. Every count
// link is composed through `applyWorkListUrlState` — the list's own writer — from an EMPTY
// `URLSearchParams`, so nothing on the home's address can narrow a drilldown.

import { callDoor } from "@/lib/doors";
import { applyWorkListUrlState } from "@/lib/work/work-list-url-state";
import { WORK_ATTENTION_ACTIVE_STATUSES } from "@/lib/work/client-work-pack";
import type { SessionTokenAccessor } from "@/lib/session";

/** The door's own defaults (0231: `p_limit int default 50`, `p_preview int default 3`). */
export const FIRM_PORTFOLIO_PAGE_SIZE = 50;
export const FIRM_PORTFOLIO_PREVIEW = 3;

/** The two statuses the ATTENTION column counts, restated once so the count and the link it opens
 *  are the same population. The door publishes the split (`failed` / `refused`) precisely so this
 *  list is a measurement rather than a guess. */
export const PORTFOLIO_ATTENTION_STATUSES = ["failed", "refused"] as const;

/** The three count columns a portfolio row carries. `needs_you` is deliberately NOT one of them:
 *  that number belongs to `clara.list_review_queue`, ships at VIEWER floor, and excludes
 *  onboarding and archived clients — see `needsYouRef` below. */
export type PortfolioCountKind = "active" | "attention_failed" | "recent_success";

/** The four coverage tokens the door can put on a row, plus the one it can put on the page.
 *  Enumerated here so an unrecognised token renders as an honest "part of this row could not be
 *  made" rather than as a raw machine string or, worse, as nothing at all. */
export const PORTFOLIO_ROW_COVERAGE_REASONS = [
  "onboarding_client_excluded_from_queue",
  "completions_without_receipt",
  "retry_label_preview_only",
] as const;
export type PortfolioRowCoverageReason = (typeof PORTFOLIO_ROW_COVERAGE_REASONS)[number];

export const PORTFOLIO_PAGE_COVERAGE_REASON = "register_page_truncated";

export function isPortfolioRowCoverageReason(v: string): v is PortfolioRowCoverageReason {
  return (PORTFOLIO_ROW_COVERAGE_REASONS as readonly string[]).includes(v);
}

/** One preview Work. Every field the door can leave null is typed nullable: `attempts` is null for
 *  a Work whose id fell past the door's 101-id cut, which means "this door did not ask", never
 *  "no runs". */
export type PortfolioPreviewRow = {
  work_id: string;
  purpose: string | null;
  status: string | null;
  memo: string | null;
  attempts: number | null;
  current_run_status: string | null;
  /** `attempts > 1`, decided in the database. Null when the label was not asked for. */
  retrying: boolean | null;
  created_at: string | null;
};

export type PortfolioRow = {
  client_id: string;
  name: string | null;
  status: string | null;
  /** NULL means unknown. It is never 0 for a column this build could not read. */
  active: number | null;
  attentionFailed: number | null;
  failed: number | null;
  refused: number | null;
  recentSuccess: number | null;
  uncountedCompletions: number | null;
  coverage: "ok" | "partial" | null;
  coverageReason: string | null;
  preview: PortfolioPreviewRow[];
};

export type PortfolioWindow = {
  from: string | null;
  to: string | null;
  fromDate: string | null;
  toDate: string | null;
  timezone: string | null;
  days: number | null;
};

/** What the pack DECLARES about the other reads on the page. It does not re-read the queue: it
 *  states which signal each neighbour's freshness rides on, so the board can date every number it
 *  shows with the right word instead of one page-level "last updated" standing for reads of
 *  different ages. */
export type PortfolioSources = {
  reviewQueueSignal: string | null;
  reviewQueueExcludes: string[];
  complianceSignal: string | null;
  complianceWindowHours: number | null;
  lintSignal: string | null;
  sweepSignal: string | null;
};

export type PortfolioPack = {
  /** The instant of THIS read. Deliberately not called a watermark: the Work lane emits no domain
   *  events, so there is no mutation position to report. */
  computedAt: string | null;
  previewLimit: number | null;
  pageLimit: number | null;
  window: PortfolioWindow | null;
  rows: PortfolioRow[];
  nextCursor: string | null;
  truncated: boolean;
  coverage: "ok" | "partial" | null;
  coverageReason: string | null;
  sources: PortfolioSources;
  /** Whose number the needs-you chips are, at which floor, and what it structurally excludes. */
  needsYouRef: { source: string | null; floor: string | null; excludes: string[] };
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** A count is a non-negative integer or it is not a count. A string "3", a float, a negative or an
 *  absent value all mean the same thing here: this build does not know. */
function count(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function hydratePreviewRow(raw: unknown): PortfolioPreviewRow | null {
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
    retrying: typeof raw.retrying === "boolean" ? raw.retrying : null,
    created_at: str(raw.created_at),
  };
}

function hydrateRow(raw: unknown): PortfolioRow | null {
  if (!isObject(raw)) return null;
  const id = str(raw.client_id);
  if (id === null) return null;
  const coverage = raw.coverage === "ok" || raw.coverage === "partial" ? raw.coverage : null;
  return {
    client_id: id,
    name: str(raw.name),
    status: str(raw.status),
    active: count(raw.active),
    attentionFailed: count(raw.attention_failed),
    failed: count(raw.failed),
    refused: count(raw.refused),
    recentSuccess: count(raw.recent_success),
    uncountedCompletions: count(raw.uncounted_completions),
    coverage,
    coverageReason: str(raw.coverage_reason),
    preview: Array.isArray(raw.preview)
      ? raw.preview.map(hydratePreviewRow).filter((r): r is PortfolioPreviewRow => r !== null)
      : [],
  };
}

function hydrateWindow(raw: unknown): PortfolioWindow | null {
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

function hydrateSources(raw: unknown): PortfolioSources {
  const s = isObject(raw) ? raw : {};
  const queue = isObject(s.review_queue) ? s.review_queue : {};
  const compliance = isObject(s.compliance) ? s.compliance : {};
  const lint = isObject(s.lint) ? s.lint : {};
  const sweep = isObject(s.sweep) ? s.sweep : {};
  return {
    reviewQueueSignal: str(queue.signal),
    reviewQueueExcludes: strList(queue.excludes),
    complianceSignal: str(compliance.signal),
    complianceWindowHours: count(compliance.window_hours),
    lintSignal: str(lint.signal),
    sweepSignal: str(sweep.signal),
  };
}

/** The pack nothing could be read from. Frozen so a caller cannot mutate the shared shape into
 *  something that looks like data. */
export const EMPTY_PORTFOLIO_PACK: PortfolioPack = Object.freeze({
  computedAt: null,
  previewLimit: null,
  pageLimit: null,
  window: null,
  rows: Object.freeze([]) as unknown as PortfolioRow[],
  nextCursor: null,
  truncated: false,
  coverage: null,
  coverageReason: null,
  sources: Object.freeze({
    reviewQueueSignal: null, reviewQueueExcludes: [], complianceSignal: null,
    complianceWindowHours: null, lintSignal: null, sweepSignal: null,
  }) as PortfolioSources,
  needsYouRef: Object.freeze({ source: null, floor: null, excludes: [] }) as PortfolioPack["needsYouRef"],
});

/** HYDRATE-NEVER-TRUST over the whole envelope. Every arm degrades to an honest absence; none of
 *  them degrades to a number. */
export function hydratePortfolioPack(raw: unknown): PortfolioPack {
  if (!isObject(raw)) return EMPTY_PORTFOLIO_PACK;
  const ref = isObject(raw.needs_you_ref) ? raw.needs_you_ref : {};
  return {
    computedAt: str(raw.computed_at),
    previewLimit: count(raw.preview_limit),
    pageLimit: count(raw.page_limit),
    window: hydrateWindow(raw.window),
    rows: Array.isArray(raw.rows)
      ? raw.rows.map(hydrateRow).filter((r): r is PortfolioRow => r !== null)
      : [],
    nextCursor: str(raw.next_cursor),
    truncated: raw.truncated === true,
    coverage: raw.coverage === "ok" || raw.coverage === "partial" ? raw.coverage : null,
    coverageReason: str(raw.coverage_reason),
    sources: hydrateSources(raw.sources),
    needsYouRef: {
      source: str(ref.source), floor: str(ref.floor), excludes: strList(ref.excludes),
    },
  };
}

export type FirmPortfolioOptions = {
  session?: SessionTokenAccessor;
  signal?: AbortSignal;
  limit?: number;
  cursor?: string | null;
  preview?: number;
};

/** One page of the firm's portfolio. A governed refusal travels as a `DoorRefusal` — it is not
 *  hydrated into an empty board, because "you may not see this" is not "there is nothing here". */
export async function getFirmPortfolioPack(opts: FirmPortfolioOptions = {}): Promise<PortfolioPack> {
  const raw = await callDoor<unknown>(
    "get_firm_portfolio_pack",
    {
      p_limit: opts.limit ?? FIRM_PORTFOLIO_PAGE_SIZE,
      p_cursor: opts.cursor ?? null,
      p_preview: opts.preview ?? FIRM_PORTFOLIO_PREVIEW,
    },
    { session: opts.session, signal: opts.signal },
  );
  return hydratePortfolioPack(raw);
}

/**
 * THE ONE COUNT → LIST URL BUILDER.
 *
 * `/work` is firm-wide and URL-stable, and its `client` axis already exists, so a portfolio count
 * opens EXACTLY the population it counted:
 *
 *   active            `?client=<id>&status=queued,running` — the door's own pair, shared with the
 *                     client-altitude tile through `WORK_ATTENTION_ACTIVE_STATUSES` so the two
 *                     altitudes cannot drift.
 *   attention_failed  `?client=<id>&status=failed,refused` — both tokens, because the column
 *                     counts both and the door publishes the split so the link and the count are
 *                     the same population.
 *   recent_success    `?client=<id>&status=completed` plus the pack's OWN window dates, so a
 *                     drilldown cannot mean a different week. A window this build could not read
 *                     contributes no dates at all rather than a guessed one.
 *
 * Composed from an EMPTY `URLSearchParams`, so nothing on the home's own address (its portfolio
 * filter, its cursor) can reach a drilldown.
 */
export function portfolioCountHref(
  kind: PortfolioCountKind,
  clientId: string,
  pack: PortfolioPack,
): string {
  const empty = new URLSearchParams();
  if (kind === "active") {
    return `/work?${applyWorkListUrlState(empty, {
      client: clientId, status: [...WORK_ATTENTION_ACTIVE_STATUSES],
    }).toString()}`;
  }
  if (kind === "attention_failed") {
    return `/work?${applyWorkListUrlState(empty, {
      client: clientId, status: [...PORTFOLIO_ATTENTION_STATUSES],
    }).toString()}`;
  }
  const dates = portfolioWindowDates(pack);
  return `/work?${applyWorkListUrlState(empty, {
    client: clientId,
    status: ["completed"],
    since: dates?.from ?? null,
    until: dates?.to ?? null,
  }).toString()}`;
}

/** IS THE RECENT-SUCCESS DRILLDOWN DATED AT ALL, AND WITH WHICH TWO DAYS. ONE predicate with two
 *  readers — the href builder above and the board's own disclosure sentence — because the sentence
 *  promises a seven-day narrowing and the link drops the dates on exactly the arm where the window
 *  is unreadable. Two spellings of this question is how a count and its link drift apart. */
export function portfolioWindowDates(pack: PortfolioPack): { from: string; to: string } | null {
  const from = pack.window?.fromDate ?? null;
  const to = pack.window?.toDate ?? null;
  if (from === null || to === null) return null;
  return { from, to };
}

/** The count a column carries, or null when this build could not read it. One accessor, so a
 *  renderer cannot reach for `row.active ?? 0` on one column and the honest branch on another. */
export function portfolioCount(row: PortfolioRow, kind: PortfolioCountKind): number | null {
  if (kind === "active") return row.active;
  if (kind === "attention_failed") return row.attentionFailed;
  return row.recentSuccess;
}
