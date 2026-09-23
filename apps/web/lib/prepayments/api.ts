// #653 — THE PREPAYMENT-SCHEDULE READ AND WRITE SEAM (journeys C8, C9).
//
// EVERY REACH IS AN RPC, and that is migration 0223's own shape rather than a preference:
// `clara.prepayment_schedules` carries no ACL at all — no SELECT, no DML — so a plain PostgREST
// table read would 42501 and there is no second path to be tempted by. The three reads are definer
// doors at the viewer floor with a firm predicate inside each body; the one write is a definer door
// at the bookkeeper floor with `clara._reserve_op` idempotency.
//
// THE LIFECYCLE VERBS ARE THE PLAN'S, NOT A SECOND SET. An amortisation schedule CONFIGURES an
// `amortisation_schedule` accounting plan, so pause, resume, end, revise, preview and catch-up are
// `lib/plans/api.ts`'s already-granted doors called on this schedule's `plan_id`. Minting a
// prepayment-shaped twin of each would be two lanes disagreeing about what "paused" means.
//
// HYDRATE-NEVER-TRUST BINDS EVERY WRITE (doors.ts's own header): the returned envelope is a REPORT
// of what the database did, never a value to paint as state. Every caller re-reads through
// `useAsyncRead().act()`, which reloads unconditionally after success AND after failure.
//
// EVERY WRITE TAKES A FRESH op_key PER DECISION, minted by the caller rather than here. A retry of
// the SAME decision must ride the SAME key so `clara._reserve_op` can replay it — and 0223 asks
// the reservation BEFORE its duplicate check for exactly that reason, so a lost response replays
// the schedule it already created instead of answering `prepayment_schedule_exists`.

import { callDoor } from "../doors";
import { sessionTokenAccessor } from "../session-accessor";
import { isUuidShape } from "../client-id";
import type { SessionTokenAccessor } from "@/lib/session";
import type { PeriodLine } from "./schedule";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const opts = (o: Opts) => ({ session: o.session ?? sessionTokenAccessor, signal: o.signal });

// ── the shapes the doors answer with ────────────────────────────────────────

/** #939 — WHERE a schedule's term came from. A prepayment recognised with NO document is
 *  amortised over a period a named person stated (`clara.prepayment_stated_terms`); one that binds
 *  a document rides the document's own service period. The two behave identically afterwards — the
 *  same straight line, the same remainder, the same monthly Work — so PROVENANCE is the whole
 *  difference, and a surface that could not tell them apart would let "a person said so" read as
 *  "the invoice says so". */
export type PrepaymentTermSource = "document_service_period" | "human_stated";

/** The provenance trio every read carries on the stated lane, and NULL on the document lane —
 *  never filled from the document's own recorder, because the two are different claims. */
export type StatedTermFacts = {
  term_source: PrepaymentTermSource;
  stated_term_id: string | null;
  term_stated_by: string | null;
  term_stated_at: string | null;
  term_reason: string | null;
};

export type PrepaymentListRow = StatedTermFacts & {
  schedule_id: string;
  plan_id: string;
  purpose: string;
  status: string;
  source_entry_id: string;
  /** NULL on the memo-only lane: that recognition binds no document at all. */
  document_id: string | null;
  term_start: string;
  term_end: string;
  /** #919 — the SAME term-liveness fields `PrepaymentDetail` carries, on the list row. */
  term_live: boolean;
  term_superseded_by: string | null;
  /** TRUE only when the term row was superseded AND the term that stands today states DIFFERENT
   *  dates. The term door supersedes unconditionally, so `term_live` alone goes false on a
   *  re-record that changed nothing — this is the fact a surface may act on (ADV-02). */
  term_moved: boolean;
  /** The term in force on the document today; null only if the document carries none. */
  term_current_start: string | null;
  term_current_end: string | null;
  prepaid_account_code: string;
  expense_account_code: string;
  total_cents: number;
  period_count: number;
  basis_kind: string;
  created_at: string;
  effective_from: string | null;
  effective_to: string | null;
  /** Periods that actually put money on the books — a COMMITTED receipt, never an admitted Work.
   *  "Admitted" and "posted" are two facts and this list says the second one. */
  posted_periods: number;
  occurrence_count: number;
  next_due: string | null;
};

export type PrepaymentOccurrence = {
  occurrence_id: string;
  due_date: string;
  leg: string;
  period_key: string;
  attempt: number;
  revision: number;
  intent_key: string;
  work_id: string | null;
  admitted_at: string | null;
  outcome: {
    state?: string; code?: string; reason?: string; message?: string;
    logical_op_id?: string; replayed?: boolean; at?: string;
  };
  created_at: string;
  attempts: readonly { attempt: number; work_id: string; intent_key: string; revision: number }[];
  work_status: string | null;
  work_error: { reason?: string; code?: string; message?: string } | null;
  receipt_id: string | null;
  entry_id: string | null;
};

/** One derived period line WITH the occurrence whose due date equals its own `period_end` — the
 *  exact key the derived `last_day_of_month` cadence guarantees. Null until the due event is
 *  reached. This is the per-occurrence link, made explicit by the read rather than re-derived. */
export type PrepaymentPeriod = PeriodLine & { occurrence: PrepaymentOccurrence | null };

export type PrepaymentDetail = StatedTermFacts & {
  schedule_id: string;
  client_id: string;
  plan_id: string;
  revision: number;
  kind: string;
  status: string;
  purpose: string;
  source_entry_id: string;
  source_posting_date: string | null;
  source_memo: string | null;
  source_status: string | null;
  /** Both NULL on the memo-only lane. `term_source` says which carrier to read, and
   *  `ck_ps_term_source_carrier` (migration 0305) makes the pairing structural, so a row can never
   *  claim a provenance it cannot point at. */
  document_id: string | null;
  service_period_id: string | null;
  /** #919 — whether `service_period_id` still names the LIVE `document_service_periods` row.
   *  false once a bookkeeper has recorded a corrected term on the same document: the stored
   *  allocation does not move, so this is what tells a reader the schedule is riding a
   *  since-superseded term. */
  term_live: boolean;
  /** The row that superseded it, when `term_live` is false; null while it is still live. */
  term_superseded_by: string | null;
  /** TRUE only when the term row was superseded AND the term that stands today states DIFFERENT
   *  dates — the fact the corrected-term banner is keyed on (ADV-02). */
  term_moved: boolean;
  term_current_start: string | null;
  term_current_end: string | null;
  term_start: string;
  term_end: string;
  basis_kind: string;
  prepaid_account_code: string;
  expense_account_code: string;
  expense_account_basis: string;
  total_cents: number;
  period_count: number;
  remainder_placement: string;
  schedule_version: string;
  created_by: string;
  created_at: string;
  authority_kind: string;
  authority_ref: { kind?: string; id?: string };
  authorised_by: string;
  authorised_at: string;
  authority_from: string;
  covered_through: string | null;
  paused_at: string | null;
  paused_by: string | null;
  paused_reason: string | null;
  ended_at: string | null;
  ended_by: string | null;
  ended_reason: string | null;
  live_revision: {
    revision: number; frequency: string; day_rule: string; day_of_month: number | null;
    timezone: string; effective_from: string; effective_to: string | null;
    basis: unknown; basis_digest: string;
  } | null;
  periods: readonly PrepaymentPeriod[];
  occurrences: readonly PrepaymentOccurrence[];
  /** Always true, and the surface says so in words: accepted configuration is not a posted
   *  occurrence, and this schedule had posted nothing at the moment it was created. */
  configuration_only: boolean;
};

/** ARM A — a live schedule whose most recent occurrence put NO money on the books. */
export type AttentionRefusing = {
  arm: "refusing";
  schedule_id: string;
  plan_id: string;
  purpose: string;
  status: string;
  occurrence_id: string;
  due_date: string;
  period_key: string;
  attempt: number;
  work_id: string | null;
  /** WHERE it stopped. An admission refusal is a plan-lane fact; a posting refusal is a books
   *  fact recorded on the Work. The next act differs, so the read says which. */
  stage: "admission" | "posting";
  code: string | null;
  reason: string | null;
  message: string | null;
  work_status: string | null;
  catch_up_from: string;
  catch_up_to: string;
};

/** ARM B — "recognised, not yet amortised". The ONLY durable trace of a create-time refusal,
 *  because such a refusal writes no plan and no schedule row. */
export type AttentionUnscheduled = {
  arm: "unscheduled";
  entry_id: string;
  posting_date: string;
  memo: string | null;
  /** NULL for a memo-only recognition. #939 removed arm B's `document_id is not null` filter:
   *  with no second carrier such a recognition could never be configured, so listing it would have
   *  offered an action that could only refuse — and with one, the filter hid exactly the
   *  prepayments that needed rescuing. */
  document_id: string | null;
  prepaid_account_code: string;
  amount_cents: number;
  /** WHICH carrier this recognition's term lives in. A document-bound recognition's term belongs
   *  to its document; a memo-only one's belongs to the person who states it. */
  term_carrier?: PrepaymentTermSource;
  /** Whether THAT carrier already holds a live term. */
  has_live_term: boolean;
  /** The person's next act, as the database's own closed token — the copy is this surface's, the
   *  fact is the read's. Optional because a database at an earlier frontier answers without it. */
  next_step?: "configure_schedule" | "record_document_service_period" | "state_service_period";
};

export type PrepaymentAttention = {
  client_id: string;
  refusing: readonly AttentionRefusing[];
  unscheduled: readonly AttentionUnscheduled[];
  /** Each arm is capped at fifty rows, NEWEST FIRST. These say whether the cap bit, so a band
   *  showing fifty of many can say so rather than reading as "this is all of it". Optional because
   *  a database at an earlier frontier answers the envelope without them. */
  refusing_truncated?: boolean;
  unscheduled_truncated?: boolean;
};

export type PrepaymentCreated = {
  term_source: PrepaymentTermSource;
  stated_term_id: string | null;
  schedule_id: string;
  plan_id: string;
  revision_id: string;
  revision: number;
  status: string;
  kind: string;
  client_id: string;
  source_entry_id: string;
  document_id: string | null;
  service_period_id: string | null;
  basis_kind: string;
  term_start: string;
  term_end: string;
  prepaid_account_code: string;
  expense_account_code: string;
  expense_account_basis: string;
  total_cents: number;
  period_count: number;
  remainder_placement: string;
  schedule_version: string;
  period_lines: readonly PeriodLine[];
  frequency: string;
  day_rule: string;
  day_of_month: number | null;
  timezone: string;
  effective_from: string;
  effective_to: string;
  next_occurrences: readonly { due_date: string; leg: string }[];
  /** ADVISORY, never a refusal: a live SIBLING accounting plan of this client already moves one
   *  of these accounts (`clara._plan_overlap_warning`, 0281/#909). The 0045 adjustment-template
   *  arm this warning also used to carry was retired by #929/0283: `kind` can only ever read
   *  `"accounting_plan_overlap"` now, and every entry is keyed by `plan_id`, never `template_id`.
   *  Rendered as a persistent StateBanner, never a toast.
 *
 *  #929's fix round (0283) also settled what a `null` here MEANS. The advisory excludes the plan
 *  the door just wrote by its own ID, not by the basis value it carries, so a sibling plan with a
 *  byte-identical basis — total overlap — is now named rather than swallowed; and the three
 *  plan-creating doors serialise on the client advisory rung, so two people creating overlapping
 *  plans at the same moment no longer both read `null`. */
  overlap_warning: { kind: string; templates: readonly { plan_id: string; name: string }[] } | null;
  configuration_only: boolean;
};

// ── reads ───────────────────────────────────────────────────────────────────

/** Every prepayment schedule of one client. A malformed client id never reaches PostgREST (the
 *  lib/client-id.ts guard lib/plans/api.ts states in full). */
export async function loadPrepayments(clientId: string, o: Opts = {}): Promise<PrepaymentListRow[]> {
  if (!isUuidShape(clientId)) return [];
  const answer = await callDoor<{ schedules?: PrepaymentListRow[] } | null>(
    "list_prepayment_schedules", { p_client: clientId }, opts(o));
  return answer?.schedules ?? [];
}

export async function loadPrepayment(scheduleId: string, o: Opts = {}): Promise<PrepaymentDetail | null> {
  if (!isUuidShape(scheduleId)) return null;
  return callDoor<PrepaymentDetail | null>("get_prepayment_schedule", { p_schedule: scheduleId }, opts(o));
}

/** The refusal-visibility read. Both arms, in ONE call, because a surface that asked for them
 *  separately could show one and not the other. */
export async function loadPrepaymentAttention(
  clientId: string, o: Opts = {},
): Promise<PrepaymentAttention> {
  const empty: PrepaymentAttention = {
    client_id: clientId, refusing: [], unscheduled: [],
    refusing_truncated: false, unscheduled_truncated: false,
  };
  if (!isUuidShape(clientId)) return empty;
  const answer = await callDoor<PrepaymentAttention | null>(
    "list_prepayment_attention", { p_client: clientId }, opts(o));
  return answer ?? empty;
}

// ── the one write ───────────────────────────────────────────────────────────

export type CreatePrepaymentInput = {
  clientId: string;
  sourceEntryId: string;
  expenseAccountCode: string;
  expenseAccountBasis: string;
  purpose: string;
  /** The row in this database that carries the instruction — a Work or a chat task of the SAME
   *  client. The door RESOLVES it; a saved preference cannot supply authority. */
  authorityRef: { kind: "accounting_work" | "chat_task"; id: string };
  opKey: string;
};

/**
 * Configure the schedule. NOTHING about the allocation, the cadence or the window crosses in this
 * call: the door derives all of them from the frozen evaluator's own output, and sending any of
 * them would be a control whose only possible outcome is a refusal.
 */
export async function createPrepaymentSchedule(
  input: CreatePrepaymentInput, o: Opts = {},
): Promise<PrepaymentCreated> {
  return callDoor<PrepaymentCreated>("create_prepayment_schedule", {
    p_client: input.clientId,
    p_source_entry: input.sourceEntryId,
    p_expense_account: input.expenseAccountCode,
    p_expense_basis: input.expenseAccountBasis,
    p_purpose: input.purpose,
    p_authority_ref: input.authorityRef,
    p_op_key: input.opKey,
  }, opts(o));
}

// ── #939 · the one write that makes a memo-only prepayment schedulable ──────

export type RecordStatedTermInput = {
  clientId: string;
  /** The POSTED recognition entry. The term is anchored to the ENTRY, not to a document, because
   *  the entry is the only durable thing a memo-only term is about. */
  sourceEntryId: string;
  periodStart: string;
  periodEnd: string;
  /** REQUIRED, and the door refuses a blank one by name. A term stated with no grounds is the
   *  unexplained judgement the whole fact-with-a-basis discipline exists to prevent. */
  reason: string;
  opKey: string;
};

export type StatedTermRecorded = {
  stated_term_id: string;
  client_id: string;
  source_entry_id: string;
  period_start: string;
  period_end: string;
  reason: string;
  stated_by: string;
  /** The statement this one superseded, or null when it is the first. A correction is a NEW row;
   *  it never moves a running schedule, which keeps naming the statement it was derived from. */
  superseded_id: string | null;
};

/**
 * State the service period of a prepayment recognised with no document.
 *
 * BOOKKEEPER FLOOR, human lane only: `clara.record_prepayment_stated_term` holds no agent grant
 * and has no wake wrapper, because a period a model supplied would be a model-generated value
 * entering a durable artifact. Clara may ask the two-date question; she never answers it.
 *
 * HYDRATE-NEVER-TRUST binds this like every other write: the returned envelope is a REPORT of what
 * the database did, and the caller re-reads rather than painting it as state.
 */
export async function recordPrepaymentStatedTerm(
  input: RecordStatedTermInput, o: Opts = {},
): Promise<StatedTermRecorded> {
  return callDoor<StatedTermRecorded>("record_prepayment_stated_term", {
    p_client: input.clientId,
    p_source_entry: input.sourceEntryId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_reason: input.reason,
    p_op_key: input.opKey,
  }, opts(o));
}
