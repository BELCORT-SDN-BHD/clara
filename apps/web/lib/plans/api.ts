// #640 — THE ACCOUNTING-PLAN READ AND WRITE SEAM (journey C9).
//
// EVERY REACH IS AN RPC, and that is the migration's own shape rather than a preference:
// `0193_accounting_plans.sql` grants NOTHING on `clara.accounting_plans`,
// `clara.accounting_plan_revisions` or `clara.accounting_plan_occurrences` — no SELECT, no DML,
// no ACL at all — so a plain PostgREST table read would 42501 and there is no second path to be
// tempted by. The four reads below are definer doors (`_human_ctx(role_rank('viewer'))` plus a
// firm predicate inside each body), and the six writes are definer doors at the bookkeeper floor
// with `_reserve_op` idempotency. Contrast lib/work/reads.ts, whose tables DO carry a
// `clara_authenticated` select policy and which therefore reads them directly: the difference is
// the grant, not a house style.
//
// HYDRATE-NEVER-TRUST BINDS EVERY WRITE (doors.ts's own header): the returned envelope is a
// REPORT of what the database did, never a value to paint as state. Every caller re-reads through
// `useAsyncRead().act()`, which reloads unconditionally after success AND after failure.
//
// EVERY WRITE TAKES A FRESH op_key PER DECISION, minted by the caller rather than here. A retry of
// the SAME decision must ride the SAME key so `clara._reserve_op` can replay it; a new decision is
// a new key. A helper that minted one per CALL would quietly turn a retry into a second question,
// which is the exact defect components/work/work-cancel-dialog.tsx's `useDecisionKey` exists to
// avoid, and the plan dialogs reuse that discipline.
//
// THE BASIS CROSSES IN THE DATABASE'S OWN SHAPE (`posting_date` / `account_code` / `debit_cents`),
// not the runtime route's camelCase wire. `clara.create_accounting_plan` hands the object straight
// to `clara._assert_journal_basis`, which is the SAME validator `clara.admit_journal_work` runs at
// every occurrence — so the shape this module sends is the shape the occurrence will post, and
// there is no second translator between the form and the ledger.

import { callDoor } from "../doors";
import { sessionTokenAccessor } from "../session-accessor";
import { isUuidShape } from "../client-id";
import { listAccountingWorkPage, WORK_LIST_MAX_LIMIT, type WorkListRow } from "../work/work-list";
import type { SessionTokenAccessor } from "@/lib/session";
import type { JournalDraftInput } from "../work/journal-basis";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const opts = (o: Opts) => ({ session: o.session ?? sessionTokenAccessor, signal: o.signal });

// ── the shapes the doors answer with ────────────────────────────────────────

export type PlanKind = "recurring_journal" | "reversing_journal";
export type PlanStatus = "active" | "paused" | "ended";
export type PlanFrequency = "monthly" | "quarterly" | "annual";
export type PlanDayRule = "day_of_month" | "last_day_of_month";
export type PlanLeg = "primary" | "reversal";

/** The DATABASE's basis shape — what `clara.accounting_plan_revisions.basis` holds and what an
 *  occurrence posts. Deliberately NOT `JournalBasisWire` (lib/work/api.ts), which is the runtime
 *  route's camelCase translation of the same contract. */
export type PlanBasis = {
  posting_date: string;
  memo: string;
  currency: string;
  lines: readonly {
    account_code: string;
    debit_cents: number;
    credit_cents: number;
    description?: string | null;
  }[];
};

export type PlanListRow = {
  plan_id: string;
  kind: PlanKind | string;
  status: PlanStatus | string;
  purpose: string;
  authority_kind: string;
  authorised_by: string;
  authorised_at: string;
  created_at: string;
  /** Null only when a plan somehow has no live revision — a state the doors refuse to create but
   *  the read still reports honestly rather than hiding. */
  revision: number | null;
  frequency: PlanFrequency | string | null;
  day_rule: PlanDayRule | string | null;
  day_of_month: number | null;
  timezone: string | null;
  effective_from: string | null;
  effective_to: string | null;
  auto_reverse: boolean | null;
  next_occurrence: string | null;
  occurrence_count: number;
};

export type PlanRevision = {
  revision: number;
  frequency: PlanFrequency | string;
  day_rule: PlanDayRule | string;
  day_of_month: number | null;
  timezone: string;
  effective_from: string;
  effective_to: string | null;
  basis: PlanBasis;
  basis_digest: string;
  auto_reverse: boolean;
  reversal_day_rule: string | null;
  created_by?: string;
  created_at?: string;
  superseded_at?: string | null;
};

export type PlanAuthorityRef = { kind?: string; id?: string; [k: string]: unknown };

export type PlanDetail = {
  plan_id: string;
  client_id: string;
  kind: PlanKind | string;
  status: PlanStatus | string;
  purpose: string;
  authority_kind: string;
  authority_ref: PlanAuthorityRef;
  authorised_by: string;
  authorised_at: string;
  /** THE PLAN'S OWN AUTHORITY FLOOR — the day a human authorised it, written once and frozen. No
   *  revision may start earlier, so no catch-up window can reach past it. Distinct from the live
   *  revision's `effective_from`, which a revision may move FORWARD. */
  authority_from: string;
  /** THE LAST DAY THIS PLAN HAS ALREADY RUN THROUGH — the end of the newest period whose Work
   *  still stands (0193's `clara._plan_covered_through`). Null when nothing has run. The revise
   *  form mirrors `period_already_covered` against it: a FREQUENCY change re-aligns every period
   *  key, so one starting inside an already-run period would post that period a second time. */
  covered_through: string | null;
  created_by: string;
  created_at: string;
  paused_at: string | null;
  paused_by: string | null;
  paused_reason: string | null;
  ended_at: string | null;
  ended_by: string | null;
  ended_reason: string | null;
  current_revision: number;
  live_revision: PlanRevision | null;
  revisions: readonly PlanRevision[];
};

export type PlanPreviewOccurrence = { due_date: string; leg: PlanLeg | string; basis: PlanBasis };

export type PlanPreview = {
  plan_id: string;
  status: PlanStatus | string;
  revision?: number;
  timezone?: string;
  today?: string;
  from_date?: string;
  /** False while the plan is paused or ended: the schedule is still SHOWN, and the surface says
   *  it is not being admitted. An empty preview would read as "nothing is scheduled". */
  admitting?: boolean;
  reason?: string;
  occurrences: readonly PlanPreviewOccurrence[];
};

export type PlanOccurrenceOutcome = {
  state?: "pending" | "admitted" | "refused" | string;
  code?: string;
  reason?: string;
  message?: string;
  logical_op_id?: string;
  replayed?: boolean;
  at?: string;
};

export type PlanOccurrenceRow = {
  occurrence_id: string;
  due_date: string;
  leg: PlanLeg | string;
  /** The step-aligned PERIOD this due event belongs to — a reversal carries its accrual's, not the
   *  month it falls in. One period takes one occurrence per leg, whatever a revision moved the due
   *  day to. */
  period_key: string;
  /** 1 for every ordinary occurrence; higher only where a catch-up re-admitted a period whose Work
   *  was cancelled or failed. */
  attempt: number;
  revision: number;
  intent_key: string;
  work_id: string | null;
  admitted_at: string | null;
  outcome: PlanOccurrenceOutcome;
  created_at: string;
  work_status: string | null;
  work_error: { reason?: string; message?: string } | null;
  receipt_id: string | null;
  entry_id: string | null;
  /** THE ENTRY A REVERSAL LEG UNDOES. An admitted reversal always names one — 0193 admits a
   *  reversal only against an accrual that has POSTED — and an accrual leg never does. */
  reverses_entry_id: string | null;
  /** EVERY ADMISSION THIS DUE EVENT TOOK, oldest first. `work_id` is the current one; a re-attempt
   *  over a cancelled or failed Work keeps its predecessor here rather than dropping it out of the
   *  plan's view. */
  attempts: readonly PlanOccurrenceAttempt[];
};

export type PlanOccurrenceAttempt = {
  attempt: number;
  work_id: string;
  intent_key: string;
  revision: number;
  admitted_at: string;
};

/** #929/0283 retired the 0045 template arm: `kind` can only ever read
 *  `"accounting_plan_overlap"` now, and every entry is keyed by `plan_id` — `template_id` was the
 *  retired arm's own field and never appears any more. Kept as `string`/no literal union so a
 *  stale client build reading an older server's `"adjustment_template_overlap"` payload still
 *  typechecks (the form never branches on `kind`, only on `overlap_warning !== null`). */
export type PlanOverlapWarning = {
  kind: string;
  templates: readonly { plan_id: string; name: string; cadence: string; accounts: readonly string[] }[];
};

export type PlanCreated = {
  plan_id: string;
  revision_id: string;
  revision: number;
  status: string;
  kind: string;
  next_occurrences: readonly { due_date: string; leg: string }[];
  /** ADVISORY, never a refusal: a live SIBLING accounting plan of this client already moves one
   *  of these accounts (`clara._plan_overlap_warning`, 0281/#909). The 0045 adjustment-template
   *  arm this warning also used to carry was retired by #929/0283 — it can never fire again. The
   *  form renders it as a persistent Alert (never a toast).
 *
 *  #929's fix round (0283) also settled what a `null` here MEANS. The advisory excludes the plan
 *  the door just wrote by its own ID, not by the basis value it carries, so a sibling plan with a
 *  byte-identical basis — total overlap — is now named rather than swallowed; and the three
 *  plan-creating doors serialise on the client advisory rung, so two people creating overlapping
 *  plans at the same moment no longer both read `null`. */
  overlap_warning: PlanOverlapWarning | null;
};

export type PlanLifecycleAnswer = { plan_id: string; status: string; changed: boolean };

export type PlanCatchUpAnswer = {
  plan_id: string;
  from: string;
  to: string;
  admitted: number;
  cap: number;
  events: readonly {
    admitted?: boolean;
    converged?: boolean;
    due_date?: string;
    leg?: string;
    reason?: string;
    code?: string;
    work_id?: string;
  }[];
};

export type WorkPlanOrigin = {
  plan_id: string;
  purpose: string;
  kind: string;
  status: string;
  occurrence_id: string;
  revision: number;
  leg: PlanLeg | string;
  due_date: string;
  authorised_by: string;
  authority_kind: string;
  /** The occurrence's CURRENT Work. Equal to the Work asked about unless that one was superseded
   *  by a re-attempt. */
  work_id: string | null;
  /** True when the Work asked about is a SUPERSEDED attempt: it was cancelled or failed and a
   *  catch-up re-admitted the period under a new Work. The origin is still this plan. */
  superseded: boolean;
  attempt: number | null;
};

// ── reads ───────────────────────────────────────────────────────────────────

/** Every plan of one client. A malformed client id never reaches PostgREST (the lib/client-id.ts
 *  guard lib/work/reads.ts states in full): on a `uuid` argument it is a 400 `22P02`, which throws
 *  and lands on the route's error boundary instead of this page's own not-found state. */
export async function loadPlans(clientId: string, o: Opts = {}): Promise<PlanListRow[]> {
  if (!isUuidShape(clientId)) return [];
  const answer = await callDoor<{ plans?: PlanListRow[] } | null>(
    "list_accounting_plans", { p_client: clientId }, opts(o));
  return answer?.plans ?? [];
}

export async function loadPlan(planId: string, o: Opts = {}): Promise<PlanDetail | null> {
  if (!isUuidShape(planId)) return null;
  return callDoor<PlanDetail | null>("get_accounting_plan", { p_plan: planId }, opts(o));
}

export async function loadPlanPreview(planId: string, count: number, o: Opts = {}): Promise<PlanPreview | null> {
  if (!isUuidShape(planId)) return null;
  return callDoor<PlanPreview | null>("preview_accounting_plan", { p_plan: planId, p_count: count }, opts(o));
}

export async function loadPlanOccurrences(planId: string, o: Opts = {}): Promise<PlanOccurrenceRow[]> {
  if (!isUuidShape(planId)) return [];
  const answer = await callDoor<{ occurrences?: PlanOccurrenceRow[] } | null>(
    "list_accounting_plan_occurrences", { p_plan: planId }, opts(o));
  return answer?.occurrences ?? [];
}

/** "From plan <purpose>" on the Work detail's identity block. NULL when the Work was not
 *  initiated by a plan — the database's honest answer, never a fabricated origin. */
export async function loadWorkPlanOrigin(workId: string, o: Opts = {}): Promise<WorkPlanOrigin | null> {
  if (!isUuidShape(workId)) return null;
  return callDoor<WorkPlanOrigin | null>("get_work_plan_origin", { p_work: workId }, opts(o));
}

// ── writes ──────────────────────────────────────────────────────────────────

export type PlanScheduleInput = {
  frequency: PlanFrequency;
  dayRule: PlanDayRule;
  /** Null when the day rule is `last_day_of_month`. 1..28 otherwise — the database's own ceiling,
   *  because a "31st of every month" schedule has no unambiguous February. */
  dayOfMonth: number | null;
  timezone: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type CreatePlanInput = PlanScheduleInput & {
  clientId: string;
  kind: PlanKind;
  purpose: string;
  /** The row in this database that carries the instruction — a Work or a chat task of the SAME
   *  client. The door RESOLVES it; a Knowledge preference cannot supply authority. */
  authorityRef: { kind: "accounting_work" | "chat_task"; id: string };
  basis: PlanBasis;
  opKey: string;
};

export async function createPlan(input: CreatePlanInput, o: Opts = {}): Promise<PlanCreated> {
  return callDoor<PlanCreated>("create_accounting_plan", {
    p_client: input.clientId,
    p_kind: input.kind,
    p_purpose: input.purpose,
    p_authority_kind: "explicit_instruction",
    p_authority_ref: input.authorityRef,
    p_frequency: input.frequency,
    p_day_rule: input.dayRule,
    p_day_of_month: input.dayOfMonth,
    p_timezone: input.timezone,
    p_effective_from: input.effectiveFrom,
    p_effective_to: input.effectiveTo,
    p_basis: input.basis,
    // The one reversal rule this slice admits; the door refuses any other spelling by name.
    p_reversal_day_rule: input.kind === "reversing_journal" ? "next_period_first_day" : null,
    p_op_key: input.opKey,
  }, opts(o));
}

export type RevisePlanInput = PlanScheduleInput & {
  planId: string;
  kind: PlanKind;
  basis: PlanBasis;
  opKey: string;
};

export async function revisePlan(input: RevisePlanInput, o: Opts = {}): Promise<{ plan_id: string; revision: number; superseded_revision: number }> {
  return callDoor("revise_accounting_plan", {
    p_plan: input.planId,
    p_frequency: input.frequency,
    p_day_rule: input.dayRule,
    p_day_of_month: input.dayOfMonth,
    p_timezone: input.timezone,
    p_effective_from: input.effectiveFrom,
    p_effective_to: input.effectiveTo,
    p_basis: input.basis,
    p_reversal_day_rule: input.kind === "reversing_journal" ? "next_period_first_day" : null,
    p_op_key: input.opKey,
  }, opts(o));
}

export async function pausePlan(planId: string, reason: string | null, opKey: string, o: Opts = {}): Promise<PlanLifecycleAnswer> {
  return callDoor<PlanLifecycleAnswer>("pause_accounting_plan",
    { p_plan: planId, p_reason: reason, p_op_key: opKey }, opts(o));
}

export async function resumePlan(planId: string, opKey: string, o: Opts = {}): Promise<PlanLifecycleAnswer> {
  return callDoor<PlanLifecycleAnswer>("resume_accounting_plan",
    { p_plan: planId, p_op_key: opKey }, opts(o));
}

export async function endPlan(planId: string, reason: string, opKey: string, o: Opts = {}): Promise<PlanLifecycleAnswer> {
  return callDoor<PlanLifecycleAnswer>("end_accounting_plan",
    { p_plan: planId, p_reason: reason, p_op_key: opKey }, opts(o));
}

export async function requestCatchUp(planId: string, from: string, to: string, opKey: string, o: Opts = {}): Promise<PlanCatchUpAnswer> {
  return callDoor<PlanCatchUpAnswer>("request_plan_catch_up",
    { p_plan: planId, p_from: from, p_to: to, p_op_key: opKey }, opts(o));
}

// ── the form's own basis translation ────────────────────────────────────────

/**
 * A validated composer draft, in the DATABASE's basis shape.
 *
 * `currency` IS THE LITERAL "MYR" for exactly the reason `toJournalBasisWire` gives: the draft has
 * no currency field, and inventing one would be a control the product does not offer.
 *
 * THE POSTING DATE ON A PLAN'S BASIS IS A PLACEHOLDER, and saying so here is the point: every
 * occurrence REPLACES it with its own due date (`clara._plan_occurrence_basis`). The form fills it
 * with `effective_from` so the stored basis is a valid one the database will accept, and the
 * detail surface never presents it as "the date this posts".
 */
export function toPlanBasis(draft: JournalDraftInput): PlanBasis {
  return {
    posting_date: draft.postingDate,
    memo: draft.memo.trim(),
    currency: "MYR",
    lines: draft.lines.map((line) => ({
      account_code: line.account_code.trim(),
      debit_cents: line.debit_cents,
      credit_cents: line.credit_cents,
      ...(line.description != null && line.description.trim() !== ""
        ? { description: line.description }
        : {}),
    })),
  };
}

// ── the plan authority picker's own read (#809) ─────────────────────────────
//
// ONE LIST READER OF clara.accounting_work, and this is it — through the door.
//
// WHAT IT REPLACED, AND WHY. #640 wrote the picker against `lib/work/reads.ts`'s
// `listAccountingWork`, a plain `limit=201` filtered GET. #641 deleted that reader in the same
// wave: both Work LISTS moved to the `clara.list_accounting_work` door. Wave-2 integration could
// not simply repoint the picker, because the door's projection carried no `intent_key` and the
// label falls back to it — so it moved the direct table read here instead, and recorded that "what
// accounting Work does this client have" now had two answers again. Migration 0203 (#809) widened
// the door's projection by that one field, and this function is the convergence: the direct table
// read, its row type and its envelope type are GONE, and the picker consumes the door's own row.
//
// THE CAP IS THE ORIGINAL'S, THE PAGING IS THE DOOR'S. 200 candidates, with truncation reported
// when more exist. The door clamps its page to at most 100, so reaching 200 means walking its
// cursor across more than one page — round-tripping the opaque `next_cursor` VERBATIM and never
// decoding it (the door's own contract, `lib/work/work-list.ts`).
//
// A REFUSAL IS NOT AN EMPTY LIST. Routing through the door raises this read's floor from any
// authenticated member to BOOKKEEPER — the floor `clara.create_accounting_plan` already enforces
// for the write this form exists to prepare. Nothing is caught here: a CLR04 propagates to the
// caller's error arm, because "you may not read this" rendered as "this client has no
// instructions" is the one mistake a picker of authorities must never make.
const AUTHORITY_FETCH_CAP = 200;

/** The candidates for a plan's `authority_ref: {kind: "accounting_work", id}`, newest first —
 *  the door's OWN row type, never a second shape. `truncated` means "more exist beyond the cap";
 *  it is produced and, as before #809, not rendered. */
export type PlanAuthorityWork = { rows: WorkListRow[]; truncated: boolean };

/**
 * This client's accounting Work, newest first, capped at 200.
 *
 * A malformed client id answers empty WITHOUT a request — the same short circuit the direct read
 * carried, kept because it is still true of the door: `p_client` is a `uuid` parameter, so a
 * non-uuid is a 400/22P02 at PostgREST, never a state a person should be shown.
 */
export async function listPlanAuthorityWork(
  clientId: string,
  o: Opts = {},
): Promise<PlanAuthorityWork> {
  if (!isUuidShape(clientId)) return { rows: [], truncated: false };
  const rows: WorkListRow[] = [];
  let cursor: string | null = null;
  // The door clamps to 100 a page, so the cap needs at most two full pages; the third iteration
  // is a BOUND, not an expectation — a door that answered `truncated` for ever would otherwise
  // spin here, and a read that cannot terminate is worse than one that stops short.
  const maxPages = Math.ceil(AUTHORITY_FETCH_CAP / WORK_LIST_MAX_LIMIT) + 1;
  for (let page = 0; page < maxPages; page += 1) {
    const got = await listAccountingWorkPage(
      { client: clientId },
      { ...o, cursor, limit: WORK_LIST_MAX_LIMIT },
    );
    rows.push(...got.rows);
    if (rows.length >= AUTHORITY_FETCH_CAP) {
      return {
        rows: rows.slice(0, AUTHORITY_FETCH_CAP),
        truncated: rows.length > AUTHORITY_FETCH_CAP || got.truncated,
      };
    }
    // An empty page, or one the door did not mark truncated, or one with no cursor to follow: the
    // walk is over and the list is complete. All three are the same answer and none is an error.
    if (got.rows.length === 0 || !got.truncated || got.next_cursor === null) {
      return { rows, truncated: false };
    }
    cursor = got.next_cursor;
  }
  return { rows: rows.slice(0, AUTHORITY_FETCH_CAP), truncated: true };
}
