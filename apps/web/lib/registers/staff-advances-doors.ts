// T5 rung-0 census (2026-08-28, instance-unique throwaway rig, migrated 0001..0140,
// LIVE catalog read directly via pg_proc/pg_get_functiondef — never migration text
// alone, per apps/web/AGENTS.md's "chase the LIVE body" rule). All seven doors below
// are `clara_authenticated`-EXECUTE (viewer+ for the three reads, bookkeeper+ for
// book/complete, admin+ for enrol/retire — WDB-G6: "enrol/retire sit one floor above
// the bookkeeper verbs; enrolment decides what an account MEANS for every future
// entry"), signatures pinned by the live census below. Every write returns its
// `_finish_op` payload VERBATIM (that wrapper is `return p_result;` with no
// re-shaping) — the types below transcribe exactly the `jsonb_build_object(...)` the
// live body constructs, not a guess.
//
// clara.staff_advances / clara.staff_advance_accounts / clara.staff_advance_applications
// (packages/db/migrations/0043_wave_d_b1_staff_advances.sql — the three tables' DDL
// sits ~0043:20-260) — all three forced-RLS, firm-scoped, `clara_authenticated` holds
// plain SELECT on all three (no masked view; census confirmed by direct relacl read).
//
// clara.enrol_staff_advance_account(p_client,p_account_code,p_person_label,
//   p_confirm_dedicated,p_attestation,p_op_key) — 0043:1946, unrecut at the census
//   frontier (0140). admin+.
// clara.retire_staff_advance_account(p_client,p_enrolment,p_reason,p_op_key) —
//   0043:2089, unrecut. admin+.
// clara.complete_staff_advance_particulars(p_client,p_advance,p_purpose,p_reference,
//   p_op_key) — 0043:2188, unrecut. bookkeeper+. Sets purpose+reference ONCE (the pair
//   is a pair, CLR10 axis "particulars_already_set" on a second attempt) — this is a
//   set-once field, never a subsequent edit door.
// clara.book_staff_advance_application(p_client,p_posting_date,p_memo,p_lines,
//   p_allocations,p_kind,p_reason,p_op_key) — CREATED 0043:2513 as a monolithic body,
//   RECUT 0129 (F-A3 PR-3, ~0129:535) into a thin delegator over the new UNGRANTED
//   `clara._book_staff_advance_application_core` — the signature the census pinned is
//   unaffected by the recut. bookkeeper+. `p_kind` is ONE of 'payroll_deduction' |
//   'bank_return' | 'claim' — 'correction' is refused BY NAME at the door (hook-born
//   only, via `reverse_entry`'s own staff-advance wall). `p_lines` rides the SAME
//   house line validator every manual entry uses (>=2 lines, each exactly one positive
//   debit XOR credit, an active account per line, balances to 5c with an auto-rounding
//   leg) — this module does not replicate that check client-side; a real CLR07/CLR10
//   renders verbatim. `p_allocations` is a SEPARATE, REGISTER-side annotation (WD-R10:
//   "an advance has no control account... the register sits beside the GL") naming,
//   per allocation, which 1-based LINE POSITION in `p_lines` (before any auto-rounding
//   leg the DB may append) represents this application's leg against which
//   `advance_id`, for how many cents — every element: a positive whole `amount_cents`,
//   a positive whole `line_no`, one allocation per (line_no, advance_id) pair (a repeat
//   pair refuses CLR10 "allocations_duplicated"). A high-stakes entry lands as a DRAFT
//   (`status: 'drafted'`, `application_ids: []`) for a distinct checker to approve
//   elsewhere (T6's `approve_routine_entry`) — this module does not build a second
//   approval surface for it. This function's own return value is a REPORT, not UI
//   state (hydrate-never-trust, doors.ts's header) — the caller must thread `status`
//   through its own `act()` onOk (never assume `useHydratedPart`/`useAsyncRead`
//   surface a write's return value on their own; they do not) to render the honest
//   drafted-vs-posted outcome. components/registers/staff-advances-register.tsx does
//   exactly this (F2, independent review 2026-08-28).
// clara.staff_advance_statement(p_client,p_account_code,p_from,p_to) — 0043:3269.
//   viewer+. Every movement (disbursement / application / void) for ONE account_code,
//   spanning every enrolment GENERATION that ever held it — `generations` names who
//   held the code when, so a re-issued code does not read as one person's impossible
//   history.
// clara.staff_advance_summary(p_client,p_as_of) — 0043:3200. viewer+. One row per
//   advance issued by `p_as_of`, DB-derived `outstanding_cents` per row (never summed
//   client-side) plus the firm's live EA1955 policy notes (`clara.ea1955_policy`).
// clara.staff_advance_tie(p_client,p_as_of) — 0043:3366. viewer+. Register-vs-GL
//   reconciliation, per account_code: `register_cents` (derived outstanding across
//   every generation) vs `gl_cents` (approved journal_lines net, filtered to entries
//   inside SOME enrolment window for that code) plus `out_of_window_cents` for the
//   remainder — `tie` is `true` only when every account_code's `explained` is true.

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

const opKey = (): string => crypto.randomUUID();
type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

// =====================================================================
// Reads — direct RLS table read (enrolments) + the three read RPCs.
// =====================================================================

export type StaffAdvanceAccountRow = {
  id: string;
  client_id: string;
  account_code: string;
  person_label: string;
  enrolment_attestation: string;
  active: boolean;
  enrolled_at: string;
  retired_by: string | null;
  retired_at: string | null;
  retired_reason: string | null;
};

const ACCOUNT_COLS =
  "id,client_id,account_code,person_label,enrolment_attestation,active,enrolled_at," +
  "retired_by,retired_at,retired_reason";

/** clara.staff_advance_accounts — every generation (active AND retired) for this
 *  client, oldest-enrolled first. `active` distinguishes the current holder(s) of a
 *  code from a past one; a code can carry more than one row over time (WDB design
 *  SS3.1: retirement does not block re-enrolment under the same code). */
export function loadStaffAdvanceAccounts(session: SessionTokenAccessor, clientId: string): Promise<StaffAdvanceAccountRow[]> {
  return getRows<StaffAdvanceAccountRow>("staff_advance_accounts", {
    select: ACCOUNT_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "enrolled_at.asc",
    session,
  });
}

export type StaffAdvanceStatementRow = {
  date: string;
  kind: "disbursement" | "application" | "void" | string;
  entry_id: string | null;
  advance_id: string;
  amount_cents: number;
  running_cents: number;
  application_kind: string | null;
  reason: string | null;
};

export type StaffAdvanceStatementGeneration = {
  enrolment_id: string;
  person_label: string;
  enrolled_at: string;
  retired_at: string | null;
  active: boolean;
  attestation: string;
};

export type StaffAdvanceStatement = {
  client_id: string;
  account_code: string;
  from: string | null;
  to: string;
  opening_cents: number;
  closing_cents: number;
  rows: StaffAdvanceStatementRow[];
  generations: StaffAdvanceStatementGeneration[];
};

/** clara.staff_advance_statement(p_client,p_account_code,p_from,p_to) — 0043:3269,
 *  viewer+. `from`/`to` are optional; the DB defaults `from` to the beginning of time
 *  and `to` to today (`clara._fa_today()`) when omitted. */
export function getStaffAdvanceStatement(
  clientId: string,
  accountCode: string,
  from: string | null,
  to: string | null,
  opts: Opts = {},
): Promise<StaffAdvanceStatement> {
  return callDoor<StaffAdvanceStatement>(
    "staff_advance_statement",
    { p_client: clientId, p_account_code: accountCode, p_from: from, p_to: to },
    opts,
  );
}

export type StaffAdvanceSummaryRow = {
  enrolment_id: string;
  account_code: string;
  person_label: string;
  advance_id: string;
  issue_date: string;
  amount_cents: number;
  /** DB-derived (`clara._adv_outstanding`) — never summed or netted client-side
   *  (hard constraint 2). */
  outstanding_cents: number;
  days_outstanding: number;
  purpose: string | null;
  reference: string | null;
  voided: boolean;
  particulars_complete: boolean;
  enrolment_active: boolean;
};

export type StaffAdvanceSummaryPolicyNote = { fact: string; note: string; source_note: string | null };

export type StaffAdvanceSummary = {
  client_id: string;
  as_of: string;
  advances: StaffAdvanceSummaryRow[];
  outstanding_cents: number;
  incomplete_count: number;
  policy_notes: StaffAdvanceSummaryPolicyNote[];
};

/** clara.staff_advance_summary(p_client,p_as_of) — 0043:3200, viewer+. `p_as_of`
 *  defaults to today (`clara._fa_today()`) when omitted. */
export function getStaffAdvanceSummary(clientId: string, asOf: string | null, opts: Opts = {}): Promise<StaffAdvanceSummary> {
  return callDoor<StaffAdvanceSummary>("staff_advance_summary", { p_client: clientId, p_as_of: asOf }, opts);
}

export type StaffAdvanceTieAccountRow = {
  account_code: string;
  register_cents: number;
  gl_cents: number;
  difference_cents: number;
  out_of_window_cents: number;
  explained: boolean;
  advance_count: number;
  incomplete_count: number;
  active_enrolment_id: string | null;
};

export type StaffAdvanceTie = {
  client_id: string;
  as_of: string;
  tie: boolean;
  accounts: StaffAdvanceTieAccountRow[];
};

/** clara.staff_advance_tie(p_client,p_as_of) — 0043:3366, viewer+. `p_as_of` is
 *  REQUIRED (CLR10 if null) — unlike statement/summary, this door has no default. */
export function getStaffAdvanceTie(clientId: string, asOf: string, opts: Opts = {}): Promise<StaffAdvanceTie> {
  return callDoor<StaffAdvanceTie>("staff_advance_tie", { p_client: clientId, p_as_of: asOf }, opts);
}

// =====================================================================
// Governed writes — callDoor, refusal verbatim, never retried.
// =====================================================================

/** The `p_lines` element shape `book_staff_advance_application` validates through
 *  the SAME house line validator every manual entry uses (`clara._validate_entry_lines`)
 *  — byte-identical to lib/journals/types.ts's `EntryLineInput`, redeclared here rather
 *  than imported so this domain's file set stays disjoint from journals' (the house
 *  door-dialog convention, apps/web/components/reports/DoorDialog.tsx:7). */
export type StaffAdvanceEntryLineInput = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  description?: string | null;
};

/** One element of `p_allocations` — `line_no` is the 1-based POSITION of a line
 *  inside the `lines` array this call sends (before any auto-rounding leg the DB may
 *  append), naming which leg of the entry represents this application's movement
 *  against `advance_id`. */
export type StaffAdvanceAllocationInput = {
  line_no: number;
  advance_id: string;
  amount_cents: number;
};

export type StaffAdvanceApplicationKind = "payroll_deduction" | "bank_return" | "claim";

export type BookStaffAdvanceApplicationInput = {
  postingDate: string;
  memo: string;
  lines: StaffAdvanceEntryLineInput[];
  allocations: StaffAdvanceAllocationInput[];
  kind: StaffAdvanceApplicationKind;
  reason: string;
};

export type BookStaffAdvanceApplicationResult = {
  status: "drafted" | "posted" | string;
  entry_id: string;
  application_ids: string[];
  allocated_cents: number;
};

/** clara.book_staff_advance_application — see this module's header for the full
 *  grounding. A fresh op_key per call (never reused across a retry — doors.ts's
 *  header). */
export function bookStaffAdvanceApplication(
  clientId: string,
  input: BookStaffAdvanceApplicationInput,
  opts: Opts = {},
): Promise<BookStaffAdvanceApplicationResult> {
  return callDoor<BookStaffAdvanceApplicationResult>(
    "book_staff_advance_application",
    {
      p_client: clientId,
      p_posting_date: input.postingDate,
      p_memo: input.memo,
      p_lines: input.lines,
      p_allocations: input.allocations,
      p_kind: input.kind,
      p_reason: input.reason,
      p_op_key: opKey(),
    },
    opts,
  );
}

export type CompleteStaffAdvanceParticularsResult = { advance_id: string; purpose: string; reference: string };

/** clara.complete_staff_advance_particulars — SET-ONCE: refuses CLR10
 *  "particulars_already_set" on a second call for the same advance (append-only
 *  register, this module's header). */
export function completeStaffAdvanceParticulars(
  clientId: string,
  advanceId: string,
  purpose: string,
  reference: string,
  opts: Opts = {},
): Promise<CompleteStaffAdvanceParticularsResult> {
  return callDoor<CompleteStaffAdvanceParticularsResult>(
    "complete_staff_advance_particulars",
    { p_client: clientId, p_advance: advanceId, p_purpose: purpose, p_reference: reference, p_op_key: opKey() },
    opts,
  );
}

export type EnrolStaffAdvanceAccountResult = {
  enrolment_id: string;
  status: "active" | string;
  client_id: string;
  account_code: string;
  person_label: string;
};

/** clara.enrol_staff_advance_account — admin+ (WDB-G6). `confirmDedicated` must be
 *  `true` (the DB refuses CLR10 otherwise, axis `confirm_dedicated`) — the caller
 *  attests the account is dedicated to ONE person, never a mixed director-current-
 *  account. `attestation` carries the G15 related-party judgement verbatim; the DB's
 *  own non-blank rule is Unicode-aware (CJK/Tamil admitted) — this module performs
 *  NO client-side re-validation of it, so a real CLR10 renders verbatim rather than
 *  being pre-empted by a narrower client guess. */
export function enrolStaffAdvanceAccount(
  clientId: string,
  accountCode: string,
  personLabel: string,
  confirmDedicated: boolean,
  attestation: string,
  opts: Opts = {},
): Promise<EnrolStaffAdvanceAccountResult> {
  return callDoor<EnrolStaffAdvanceAccountResult>(
    "enrol_staff_advance_account",
    {
      p_client: clientId,
      p_account_code: accountCode,
      p_person_label: personLabel,
      p_confirm_dedicated: confirmDedicated,
      p_attestation: attestation,
      p_op_key: opKey(),
    },
    opts,
  );
}

export type RetireStaffAdvanceAccountResult = {
  enrolment_id: string;
  status: "retired" | string;
  client_id: string;
  account_code: string;
};

/** clara.retire_staff_advance_account — admin+ (WDB-G6). Refuses CLR10
 *  "advance_outstanding_on_retire" while ANY advance on the account still carries an
 *  outstanding balance (as of 'infinity', i.e. every recorded fact — not "today") —
 *  rendered verbatim; this module does not pre-check outstanding balances itself. */
export function retireStaffAdvanceAccount(
  clientId: string,
  enrolmentId: string,
  reason: string,
  opts: Opts = {},
): Promise<RetireStaffAdvanceAccountResult> {
  return callDoor<RetireStaffAdvanceAccountResult>(
    "retire_staff_advance_account",
    { p_client: clientId, p_enrolment: enrolmentId, p_reason: reason, p_op_key: opKey() },
    opts,
  );
}
