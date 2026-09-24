// #941 — THE DEFERRED-REVENUE READ AND WRITE SEAM: the mirror of `lib/prepayments/api.ts` for the
// revenue side of the books.
//
// EVERY REACH IS AN RPC, and that is migration 0308's own shape rather than a preference:
// `clara.revenue_recognition_schedules` carries no ACL at all — no SELECT, no DML — so a plain
// PostgREST table read would 42501 and there is no second path to be tempted by. The three reads
// are definer doors at the viewer floor with a firm predicate inside each body; the one write is a
// definer door at the bookkeeper floor with `clara._reserve_op` idempotency.
//
// THE LIFECYCLE VERBS ARE THE PLAN'S, NOT A SECOND SET. A recognition schedule CONFIGURES a
// `revenue_recognition_schedule` accounting plan, so pause, resume, end, revise, preview and
// catch-up are `lib/plans/api.ts`'s already-granted doors called on this schedule's `plan_id`.
//
// THE TERM DOOR IS THE PREPAYMENT LANE'S, REUSED RATHER THAN RE-CUT.
// `clara.record_prepayment_stated_term` is anchored to the ENTRY, not to a side of the books, so a
// receipt taken in advance states its service period through exactly the same door a prepayment
// does. `recordPrepaymentStatedTerm` is re-exported here so this lane's form has one import.
//
// HYDRATE-NEVER-TRUST BINDS EVERY WRITE (doors.ts's own header): the returned envelope is a REPORT
// of what the database did, never a value to paint as state. Every caller re-reads through
// `useAsyncRead().act()`, which reloads unconditionally after success AND after failure.

import { callDoor } from "../doors";
import { sessionTokenAccessor } from "../session-accessor";
import { isUuidShape } from "../client-id";
import type { SessionTokenAccessor } from "@/lib/session";
import type { PeriodLine } from "../prepayments/schedule";
import { recordPrepaymentStatedTerm } from "../prepayments/api";

export { recordPrepaymentStatedTerm };
export type { RecordStatedTermInput, StatedTermRecorded } from "../prepayments/api";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const opts = (o: Opts) => ({ session: o.session ?? sessionTokenAccessor, signal: o.signal });

// ── the shapes the doors answer with ────────────────────────────────────────

/** WHERE a schedule's term came from. An advance recognised with NO document is recognised over a
 *  period a named person stated (`clara.prepayment_stated_terms`); one that binds an issued
 *  invoice or receipt rides that document's own service period. The two behave identically
 *  afterwards — the same straight line, the same remainder, the same monthly Work — so PROVENANCE
 *  is the whole difference, and a surface that could not tell them apart would let "a person said
 *  so" read as "the invoice says so". */
export type RecognitionTermSource = "document_service_period" | "human_stated";

/** The ONE recognition pattern this estate offers. Usage-based and milestone recognition need a
 *  measure of progress the estate does not record, so the door refuses them by name rather than
 *  guessing one — and this type is a closed set of one so a later member is a compile error rather
 *  than a string that silently widens. */
export type RecognitionPattern = "straight_line";

/** The provenance trio every read carries on the stated lane, and NULL on the document lane —
 *  never filled from the document's own recorder, because the two are different claims. */
export type StatedTermFacts = {
  term_source: RecognitionTermSource;
  stated_term_id: string | null;
  term_stated_by: string | null;
  term_stated_at: string | null;
  term_reason: string | null;
  /** #1036 fix round / ADV-02 — TRUE when a statement EXISTS and this reader is below the
   *  bookkeeper floor the three fields above are walled at (`clara.prepayment_stated_terms`'
   *  `p_pst_human` policy, which the SECURITY DEFINER reads previously bypassed). Never true when
   *  there is simply no statement, so a surface can tell "not yours to see" from "nobody said
   *  why". Optional on the wire: a web build ahead of its database sees it absent, which is why
   *  every read of it is `=== true`. */
  term_reason_withheld?: boolean;
};

export type RecognitionListRow = StatedTermFacts & {
  schedule_id: string;
  plan_id: string;
  purpose: string;
  status: string;
  source_entry_id: string;
  /** NULL on the memo-only lane: that receipt binds no document at all. */
  document_id: string | null;
  term_start: string;
  term_end: string;
  /** Whether the carrier row this schedule RODE is still the live statement. */
  term_live: boolean;
  term_superseded_by: string | null;
  /** TRUE only when the term row was superseded AND the term that stands today states DIFFERENT
   *  dates. Both term doors supersede unconditionally, so `term_live` alone goes false on a
   *  re-record that changed nothing — this is the fact a surface may act on. */
  term_moved: boolean;
  term_current_start: string | null;
  term_current_end: string | null;
  deferred_account_code: string;
  revenue_account_code: string;
  recognition_pattern: RecognitionPattern;
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

export type RecognitionOccurrence = {
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
export type RecognitionPeriod = PeriodLine & { occurrence: RecognitionOccurrence | null };

export type RecognitionDetail = StatedTermFacts & {
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
   *  `ck_rrs_term_source_carrier` (migration 0308) makes the pairing structural, so a row can
   *  never claim a provenance it cannot point at. */
  document_id: string | null;
  service_period_id: string | null;
  term_live: boolean;
  term_superseded_by: string | null;
  term_moved: boolean;
  term_current_start: string | null;
  term_current_end: string | null;
  term_start: string;
  term_end: string;
  basis_kind: string;
  deferred_account_code: string;
  revenue_account_code: string;
  revenue_account_basis: string;
  total_cents: number;
  period_count: number;
  remainder_placement: string;
  recognition_pattern: RecognitionPattern;
  schedule_version: string;
  created_by: string;
  created_at: string;
  authority_kind: string;
  authority_ref: { kind?: string; id?: string } | null;
  authorised_by: string;
  authorised_at: string | null;
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
  periods: readonly RecognitionPeriod[];
  occurrences: readonly RecognitionOccurrence[];
  configuration_only: boolean;
};

/** ARM A — "the last period did not post". */
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
  stage: "admission" | "posting";
  code: string | null;
  reason: string | null;
  message: string | null;
  work_status: string | null;
  catch_up_from: string;
  catch_up_to: string;
};

/** ARM B — "received in advance, not yet recognised". The ONLY durable trace of a create-time
 *  refusal, because such a refusal writes no plan and no schedule row. */
export type AttentionUnrecognised = {
  arm: "unrecognised";
  entry_id: string;
  posting_date: string;
  memo: string | null;
  /** NULL for a memo-only receipt: it binds no document at all. */
  document_id: string | null;
  deferred_account_code: string;
  amount_cents: number;
  /** WHICH carrier this receipt's term lives in. */
  term_carrier?: RecognitionTermSource;
  /** Whether THAT carrier already holds a live term. */
  has_live_term: boolean;
  /** The person's next act, as the database's own closed token — the copy is this surface's, the
   *  fact is the read's. Optional because a database at an earlier frontier answers without it. */
  next_step?: "configure_schedule" | "record_document_service_period" | "state_service_period";
};

export type RecognitionAttention = {
  client_id: string;
  refusing: readonly AttentionRefusing[];
  unrecognised: readonly AttentionUnrecognised[];
  /** Each arm is capped at fifty rows, NEWEST FIRST. These say whether the cap bit, so a band
   *  showing fifty of many can say so rather than reading as "this is all of it". */
  refusing_truncated?: boolean;
  unrecognised_truncated?: boolean;
};

export type RecognitionCreated = {
  term_source: RecognitionTermSource;
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
  deferred_account_code: string;
  revenue_account_code: string;
  revenue_account_basis: string;
  total_cents: number;
  period_count: number;
  remainder_placement: string;
  recognition_pattern: RecognitionPattern;
  schedule_version: string;
  period_lines: readonly PeriodLine[];
  frequency: string;
  day_rule: string;
  day_of_month: number | null;
  timezone: string;
  effective_from: string;
  effective_to: string;
  next_occurrences: readonly { due_date: string; leg: string }[];
  /** ADVISORY, never a refusal: a live SIBLING accounting plan of this client already moves one of
   *  these accounts (`clara._plan_overlap_warning`). Rendered as a persistent StateBanner. */
  overlap_warning: { kind: string; templates: readonly { plan_id: string; name: string }[] } | null;
  configuration_only: boolean;
};

// ── reads ───────────────────────────────────────────────────────────────────

/** Every recognition schedule of one client. A malformed client id never reaches PostgREST. */
export async function loadRecognitionSchedules(
  clientId: string, o: Opts = {},
): Promise<RecognitionListRow[]> {
  if (!isUuidShape(clientId)) return [];
  const answer = await callDoor<{ schedules?: RecognitionListRow[] } | null>(
    "list_revenue_recognition_schedules", { p_client: clientId }, opts(o));
  return answer?.schedules ?? [];
}

export async function loadRecognitionSchedule(
  scheduleId: string, o: Opts = {},
): Promise<RecognitionDetail | null> {
  if (!isUuidShape(scheduleId)) return null;
  return callDoor<RecognitionDetail | null>(
    "get_revenue_recognition_schedule", { p_schedule: scheduleId }, opts(o));
}

/** The refusal-visibility read. Both arms, in ONE call, because a surface that asked for them
 *  separately could show one and not the other. */
export async function loadRecognitionAttention(
  clientId: string, o: Opts = {},
): Promise<RecognitionAttention> {
  const empty: RecognitionAttention = {
    client_id: clientId, refusing: [], unrecognised: [],
    refusing_truncated: false, unrecognised_truncated: false,
  };
  if (!isUuidShape(clientId)) return empty;
  const answer = await callDoor<RecognitionAttention | null>(
    "list_revenue_recognition_attention", { p_client: clientId }, opts(o));
  return answer ?? empty;
}

// ── the one write ───────────────────────────────────────────────────────────

export type CreateRecognitionInput = {
  clientId: string;
  sourceEntryId: string;
  revenueAccountCode: string;
  revenueAccountBasis: string;
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
 *
 * THE PATTERN IS NOT SENT EITHER. `p_pattern` defaults to `straight_line` at the door, and this
 * lane offers no other, so a control here would be one whose only value is its default.
 */
export async function createRecognitionSchedule(
  input: CreateRecognitionInput, o: Opts = {},
): Promise<RecognitionCreated> {
  return callDoor<RecognitionCreated>("create_revenue_recognition_schedule", {
    p_client: input.clientId,
    p_source_entry: input.sourceEntryId,
    p_revenue_account: input.revenueAccountCode,
    p_revenue_basis: input.revenueAccountBasis,
    p_purpose: input.purpose,
    p_authority_ref: input.authorityRef,
    p_op_key: input.opKey,
  }, opts(o));
}
