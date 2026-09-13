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
};

export type PlanOverlapWarning = {
  kind: string;
  templates: readonly { template_id: string; name: string; cadence: string; accounts: readonly string[] }[];
};

export type PlanCreated = {
  plan_id: string;
  revision_id: string;
  revision: number;
  status: string;
  kind: string;
  next_occurrences: readonly { due_date: string; leg: string }[];
  /** ADVISORY, never a refusal: a live 0045 adjustment template of this client already moves one
   *  of these accounts. The form renders it as a persistent Alert (never a toast). */
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
