// #641 (refresh spec #612, journey B3) — the wire contract for `clara.list_accounting_work` and
// `clara.get_accounting_work_row` (packages/db/migrations/0189_work_list_reads.sql), plus the ONE
// place this codebase turns a canonical Work row into the WORD a person reads.
//
// WHY A DOOR AND NOT `getRows` ON THE TABLE. `lib/work/reads.ts`'s `listAccountingWork` is a plain
// filtered GET on `clara.accounting_work` and stays exactly as it is for the detail page's own
// single-row read. The LIST is different for the same reason `lib/firm/activity.ts` gives for
// `list_activity`: its ORDER and its CURSOR are part of the contract, and two of the fields the
// list must render — how many runs a Work has had, and the question it is parked on — live in
// relations a browser either cannot read at all (`clara.agent_tasks` carries no
// `clara_authenticated` grant) or could only page independently of the rows they belong to. A
// caller composing that itself could page incorrectly without ever being wrong about one row.
//
// THE PAGE ENVELOPE is `{rows, next_cursor, truncated}`. `next_cursor` is OPAQUE — round-trip it,
// never decode it — and `truncated` means "there is more to load", never "some matching Work is
// missing". NEITHER IS A TOTAL: AC1's own line is that a caller must never infer one from a page,
// and this module exposes no count beyond `rows.length`, which is what it says it is.
//
// THE STATE WORD IS DERIVED HERE, ONCE, FROM CANONICAL FIELDS ONLY. #641's roster asks for words
// `clara.accounting_work.status` does not hold — "Executing", "Needs you", "Retrying". Every one
// of them below is a function of the nine-member canonical status plus `attempts`, the door's own
// count of the Work's real runs. Words with no canonical signal behind them — "blocked",
// "partial", "runnable" — are deliberately NOT in this union: #636 owns batch children (so
// "partial" has nothing to derive from yet) and nothing in the estate records a Work as blocked.
// A status this build has not enumerated renders VERBATIM through `unknown` rather than crashing
// a `t()` lookup, the same posture `lib/work/types.ts` takes for `AccountingWorkStatus`.

import { callDoor } from "@/lib/doors";
import { businessDayEnd, businessDayStart } from "@/lib/firm/activity";
import type { SessionTokenAccessor } from "@/lib/session";
import type { AccountingWorkStatus, WorkBasisOrigin } from "./types";

export type WorkListOptions = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** The door's own page ceiling (0189: "p_limit clamps 1..100"). */
export const WORK_LIST_MAX_LIMIT = 100;
export const WORK_LIST_DEFAULT_LIMIT = 25;

/**
 * One row of `clara.list_accounting_work`, copied field-for-field from the function's own
 * projection (0189's header, "THE ROW SHAPE"). Every field the door can leave null is typed
 * nullable rather than defaulted — an absent field is an honest absence, never coerced to "" or 0.
 *
 * THERE IS NO MONEY ON THIS ROW, and that is the door's decision as much as this module's: a list
 * of operations is not a ledger. `memo`, `posting_date` and `currency` are the literal values the
 * admitted basis holds; the amounts are rendered once, on the detail page, with their own labels.
 */
export type WorkListRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  purpose: string;
  status: AccountingWorkStatus;
  initiator: string;
  initiated_by: string | null;
  initiator_role: string;
  basis_origin: WorkBasisOrigin;
  memo: string | null;
  posting_date: string | null;
  currency: string | null;
  source_ref_count: number;
  current_task_id: string | null;
  entry_id: string | null;
  receipt_id: string | null;
  error_code: string | null;
  error_reason: string | null;
  /** How many runs this Work has actually had. 1 for a Work admitted once; 2+ after a Retry. */
  attempts: number;
  /** `clara.agent_tasks.status` of the CURRENT run, or null when there is none. */
  current_run_status: string | null;
  pending_question_id: string | null;
  pending_question_version: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WorkListPage = {
  rows: WorkListRow[];
  next_cursor: string | null;
  truncated: boolean;
};

/** The filter axes the door takes. `since`/`until` are business-timezone CALENDAR DAYS here and
 *  are converted to the `[since, until)` instant range at the wire, exactly once. */
export type WorkListFilters = {
  client?: string | null;
  status?: readonly string[] | null;
  purpose?: readonly string[] | null;
  initiator?: string | null;
  since?: string | null;
  until?: string | null;
  q?: string | null;
};

/** A page of the Work list, newest first. `opts.cursor` is round-tripped verbatim from a previous
 *  page's `next_cursor`; anything else is a malformed-cursor CLR10 refusal by the door's own
 *  contract. An EMPTY filter array is sent as `null` rather than `[]` — the door treats both as
 *  "no filter on this axis", and null is the honest spelling of what the caller means. */
export async function listAccountingWorkPage(
  filters: WorkListFilters,
  opts: WorkListOptions & { limit?: number; cursor?: string | null } = {},
): Promise<WorkListPage> {
  const limit = Math.min(Math.max(opts.limit ?? WORK_LIST_DEFAULT_LIMIT, 1), WORK_LIST_MAX_LIMIT);
  const out = await callDoor<WorkListPage>(
    "list_accounting_work",
    {
      p_client: filters.client ?? null,
      p_status: filters.status && filters.status.length > 0 ? [...filters.status] : null,
      p_initiator: filters.initiator ?? null,
      p_purpose: filters.purpose && filters.purpose.length > 0 ? [...filters.purpose] : null,
      p_since: filters.since ? businessDayStart(filters.since) : null,
      p_until: filters.until ? businessDayEnd(filters.until) : null,
      p_q: filters.q && filters.q.trim() !== "" ? filters.q.trim() : null,
      p_cursor: opts.cursor ?? null,
      p_limit: limit,
    },
    { session: opts.session, signal: opts.signal },
  );
  // Hydrate-never-trust's own honesty rule (AGENTS.md): a malformed envelope is reported as
  // empty-and-not-truncated rather than a caller crashing on `.rows.map`.
  return {
    rows: Array.isArray(out?.rows) ? out.rows : [],
    next_cursor: typeof out?.next_cursor === "string" ? out.next_cursor : null,
    truncated: out?.truncated === true,
  };
}

/**
 * ONE Work, addressed by id alone — #719's own lesson.
 *
 * A `?work=<id>` deep link (or a shared detail link) names a row that may sit outside every page
 * the caller has loaded: three pages down, or excluded by the very filters the same URL carries.
 * A surface that could only see its current page would render a not-found for a row the caller is
 * perfectly entitled to read. Throws `DoorRefusal` CLR11 `accounting_work_not_found` for an
 * absent, foreign or unreadable id alike — the door gives no oracle and this module does not try
 * to tell those apart either.
 */
export async function getAccountingWorkRow(
  workId: string,
  opts: WorkListOptions = {},
): Promise<WorkListRow> {
  return callDoor<WorkListRow>("get_accounting_work_row", { p_work: workId }, opts);
}

// ── the state word ────────────────────────────────────────────────────────────

/** The words this build can render for a Work, each derived from canonical fields alone.
 *  `unknown` is the honest arm for a status the database grew and this build has not learned. */
export const WORK_STATE_LABELS = [
  "queued", "executing", "retrying", "needsYou", "stopping",
  "completed", "refused", "failed", "cancelled", "expired", "unknown",
] as const;
export type WorkStateLabel = (typeof WORK_STATE_LABELS)[number];

/**
 * THE ONE DERIVATION. `attempts > 1` on a Work that is still queued or running means the current
 * run is a RE-ATTEMPT — `clara.retry_accounting_work` opens a second `clara.agent_tasks` row under
 * the same Work — so "Retrying" is a count of real runs rather than a flag somebody set. Every
 * other arm is the canonical status under a different word.
 */
export function workStateLabel(
  row: Pick<WorkListRow, "status" | "attempts">,
): WorkStateLabel {
  const retrying = (row.attempts ?? 0) > 1;
  switch (row.status) {
    case "queued":
      return retrying ? "retrying" : "queued";
    case "running":
      return retrying ? "retrying" : "executing";
    case "awaiting_input":
      return "needsYou";
    case "stopping":
      return "stopping";
    // Spelled out rather than returned as `row.status`: `AccountingWorkStatus` is deliberately an
    // OPEN union (`(string & {})`, `lib/work/types.ts`), so narrowing by case does not narrow the
    // value's type — returning it would type as `string` and quietly widen this function's own
    // closed vocabulary.
    case "completed":
      return "completed";
    case "refused":
      return "refused";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "unknown";
  }
}

/** The Badge tone for a state word. NEVER the only cue — the Badge always carries the word
 *  itself (C08.6: an accessible state check that does not depend on colour alone). */
export function workStateTone(label: WorkStateLabel): "default" | "secondary" | "destructive" | "outline" {
  switch (label) {
    case "completed":
      return "default";
    case "refused":
    case "failed":
    case "expired":
      return "destructive";
    case "needsYou":
    case "retrying":
      return "secondary";
    default:
      return "outline";
  }
}

/** The nine canonical statuses, in the migration's own order — the filter facet roster. Kept
 *  here rather than re-derived per component so the filter bar and the door agree on exactly one
 *  list (a token outside it is refused CLR10 `invalid_status` by the door). */
export const WORK_STATUS_FACETS: readonly AccountingWorkStatus[] = [
  "queued", "running", "awaiting_input", "stopping",
  "completed", "refused", "failed", "cancelled", "expired",
];
