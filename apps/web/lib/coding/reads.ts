// T7 reads — the coding-lane surface's own read set. Every read-flavoured RPC
// (coding_lane/list_coding_lanes/list_uncoded_filings/get_lint_finding/
// get_open_question) rides `callDoor` as TRANSPORT ONLY per apps/web/AGENTS.md
// ("a read-flavoured RPC still rides callDoor... but is NOT a governed act") —
// no confirmation UI, no sticky-refusal semantics; every table/view read rides
// `getRows` per the house convention. See lib/coding/types.ts for the full
// grounding citations (2026-08-28 census).

import { callDoor } from "@/lib/doors";
import { getRows } from "@/lib/read";
import type { SessionTokenAccessor } from "@/lib/session";
import { AGENT_TASK_LIVE_STATUSES } from "./types";
import type {
  AgentTaskRow, CodingLaneResult, CodingLaneRow, CodingTaskRow,
  LintFindingDetail, LintFindingRow, OpenQuestionDetail, UncodedFilingRow,
} from "./types";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** `clara.list_uncoded_filings(p_client)` -> SETOF jsonb — a read RPC (not a
 *  table/view), so it rides `callDoor` as transport. `p_client: null` is a
 *  legal argument on the live body (firm-wide), but this surface is always
 *  client-scoped — the caller always supplies one. */
export function listUncodedFilings(clientId: string, opts: Opts = {}): Promise<UncodedFilingRow[]> {
  return callDoor<UncodedFilingRow[]>("list_uncoded_filings", { p_client: clientId }, opts);
}

/** `clara.list_coding_lanes(p_client)` -> TABLE(filing_id, lane, reasons) —
 *  every ACTIVE filing for the client (coded or not), each with its own live
 *  `_coding_lane_core` classification. The caller filters to the filing_ids
 *  it actually wants to show (this surface: the uncoded population) — a
 *  client-side FILTER over two honest reads, never a re-derivation of either
 *  read's own predicate (documents/loaders.ts's own precedent). */
export function listCodingLanes(clientId: string, opts: Opts = {}): Promise<CodingLaneRow[]> {
  return callDoor<CodingLaneRow[]>("list_coding_lanes", { p_client: clientId }, opts);
}

/** `clara.coding_lane(p_client, p_filing)` -> TABLE(lane, reasons) — the
 *  single-filing form. A SETOF RPC is always an array on the wire (0 or 1
 *  elements here for a human caller — types.ts's own header). Not wired to a
 *  UI trigger on this surface: `list_coding_lanes` already returns every
 *  filing's classification in one read, so a per-filing re-derivation has no
 *  distinct need here (a genuine rung-0 scope note, not an omission) — kept
 *  as a library function with its own wire-shape test so the door is still
 *  built against, per Q9's rung 1. */
export function getCodingLane(clientId: string, filingId: string, opts: Opts = {}): Promise<CodingLaneResult[]> {
  return callDoor<CodingLaneResult[]>("coding_lane", { p_client: clientId, p_filing: filingId }, opts);
}

/** `clara.coding_tasks_visible` — the masked view (id/.../status/...,
 *  firm_id stripped), open tasks for one client. */
export function listOpenCodingTasks(clientId: string, opts: Opts = {}): Promise<CodingTaskRow[]> {
  return getRows<CodingTaskRow>("coding_tasks_visible", {
    select: "id,client_id,document_id,filing_id,origin,correction_id,status,opened_by,closed_by,closed_reason,result_entry_id,created_at,updated_at,closed_at",
    filters: { client_id: `eq.${clientId}`, status: "eq.open" },
    order: "created_at.asc",
    ...opts,
  });
}

/** `clara.lint_findings` — a direct table read (forced RLS, a bookkeeper-
 *  reachable human SELECT policy scoped to `firm_id = jwt_firm()` only; this
 *  read adds its own `client_id` filter, same pattern as journals/reads.ts's
 *  direct `journal_entries` reads). Open findings for one client. */
export function listOpenLintFindings(clientId: string, opts: Opts = {}): Promise<LintFindingRow[]> {
  return getRows<LintFindingRow>("lint_findings", {
    select: "id,firm_id,client_id,finding_kind,dedupe_key,severity,page_id,detail,state,opened_at,resolved_conclusion,resolved_note,resolved_by,resolved_at,created_at",
    filters: { client_id: `eq.${clientId}`, state: "eq.open" },
    order: "opened_at.asc",
    ...opts,
  });
}

/** `clara.get_lint_finding(p_finding)` -> jsonb — a read RPC. */
export function getLintFindingDetail(findingId: string, opts: Opts = {}): Promise<LintFindingDetail> {
  return callDoor<LintFindingDetail>("get_lint_finding", { p_finding: findingId }, opts);
}

/** `clara.get_open_question(p_question)` -> jsonb — a read RPC, distinct from
 *  `clara.firm_open_questions_visible` (a DIFFERENT table another lane
 *  already reads — types.ts's own "spelling is not identity" note). */
export function getOpenQuestionDetail(questionId: string, opts: Opts = {}): Promise<OpenQuestionDetail> {
  return callDoor<OpenQuestionDetail>("get_open_question", { p_question: questionId }, opts);
}

/** Candidate entries `complete_coding_task` will accept as `p_result_entry`
 *  for ONE task — the door's own precondition
 *  (`e.filing_id=t.filing_id and e.status='approved' and e.reversed_by is
 *  null`), read as a QUERY so the picker never offers an entry the door would
 *  refuse. This HELPS the human choose; it does not replace the door's own
 *  authoritative re-check (hydrate-never-trust: a stale/raced entry still
 *  refuses CLR24, rendered verbatim). `journal_entries` is a direct
 *  `clara_authenticated` table grant, RLS-scoped by firm_id only (documents/
 *  types.ts's own JournalEntryRow header) — this read adds its own
 *  filing_id/status/reversed_by filter. */
export function listApprovedEntriesForFiling(
  filingId: string,
  opts: Opts = {},
): Promise<{ id: string; posting_date: string | null; memo: string | null }[]> {
  return getRows("journal_entries", {
    select: "id,posting_date,memo",
    filters: { filing_id: `eq.${filingId}`, status: "eq.approved", reversed_by: "is.null" },
    order: "posting_date.desc",
    ...opts,
  });
}

/** `clara.agent_tasks_visible` — every non-terminal task for the firm (the
 *  agent-tasks panel's own population). Filters to
 *  `AGENT_TASK_LIVE_STATUSES` (F6, independent review) — the FIVE non-
 *  terminal statuses, not the narrower four-value
 *  `AGENT_TASK_CANCELLABLE_STATUSES`: a task the panel just requested a
 *  cancel on moves to `cancel_requested` (still non-terminal — the engine is
 *  still active), and filtering the READ to the cancellable set alone made
 *  that row vanish on the very re-read the cancel's own `act()` triggers.
 *  Unused anywhere in apps/web before this train (measured: zero references
 *  at rung 0) — the firm activity feed reads a DIFFERENT relation
 *  (`agent_receipts_visible`, an audit trail of what already happened; this
 *  is the live task queue). */
export function listCancellableAgentTasks(opts: Opts = {}): Promise<AgentTaskRow[]> {
  return getRows<AgentTaskRow>("agent_tasks_visible", {
    select: "id,kind,status,client_id,error_code,created_at,updated_at,cancelled_by,cancelled_at,session_id,created_by",
    filters: { status: `in.(${AGENT_TASK_LIVE_STATUSES.join(",")})` },
    order: "created_at.asc",
    ...opts,
  });
}

/** The task→client_id lookup `promote_clarify_to_question`'s dialog needs:
 *  `agent_interruptions` carries no client_id of its own (interruptions-
 *  panel.tsx's own header), but its `task_id` resolves through
 *  `agent_tasks_visible`. Reads by id list rather than one-at-a-time — the
 *  interruptions panel is small (a firm-wide pending queue) so one batched
 *  read covers every row on screen. */
export function listAgentTaskClientIds(
  taskIds: string[],
  opts: Opts = {},
): Promise<{ id: string; client_id: string | null }[]> {
  if (taskIds.length === 0) return Promise.resolve([]);
  return getRows("agent_tasks_visible", {
    select: "id,client_id",
    filters: { id: `in.(${taskIds.map((id) => encodeURIComponent(id)).join(",")})` },
    ...opts,
  });
}
