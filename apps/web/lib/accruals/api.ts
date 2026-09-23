// #652 — THE ACCRUAL READ AND WRITE SEAM (journeys C3, C8).
//
// EVERY REACH IS AN RPC, and that is migration 0222's own shape rather than a preference:
// `clara.accrual_adjustments` grants NOTHING to any application role — no SELECT, no DML, no ACL at
// all — so a plain PostgREST table read would 42501 and there is no second path to be tempted by.
// The two reads below are definer doors (`_human_ctx(role_rank('viewer'))` plus a firm predicate
// inside each body) and the one write is a definer door at the bookkeeper floor with `_reserve_op`
// idempotency. It is `lib/plans/api.ts`'s posture, for `lib/plans/api.ts`'s reason: the difference
// from `lib/work/reads.ts` is the GRANT, not a house style.
//
// HYDRATE-NEVER-TRUST BINDS THE WRITE (`lib/doors.ts`'s own header): the returned envelope is a
// REPORT of what the database did, never a value to paint as state. The form navigates to the
// accrual's own address on success and that destination re-reads.
//
// THE WRITE TAKES A FRESH op_key PER DECISION, minted by the caller rather than here — and for
// this lane it is minted by `lib/work/accrual-draft.ts` and STORED WITH THE DRAFT, because a
// resubmit after a lost acknowledgement must carry the identity the database already knows. A
// helper that minted one per CALL would quietly turn a lost response into a second accrual.
//
// THE PARTICULARS CROSS IN THE DATABASE'S OWN SHAPE (`service_period_start`, `amount_cents`,
// `method: {rule}`), not a camelCase wire: `clara.create_accrual_adjustment` hands the object
// straight to `clara._assert_accrual_particulars`, so the shape this module sends is the shape the
// door validates and there is no second translator between the form and the ledger.

import { callDoor } from "../doors";
import { sessionTokenAccessor } from "../session-accessor";
import { isUuidShape } from "../client-id";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const opts = (o: Opts) => ({ session: o.session ?? sessionTokenAccessor, signal: o.signal });

// ── the shapes the doors answer with ────────────────────────────────────────

/** The CLOSED selection-rule set migration 0222's `method` CHECK admits. It names WHICH amount a
 *  human already stated the schedule uses; it computes nothing, which is why this is an enum and
 *  not a registered evaluator closure (the migration header argues it in full).
 *
 *  ONE MEMBER, BECAUSE ONE MEMBER IS WHAT THE SCHEDULE DOES: the configuration freezes the stated
 *  amount into the plan revision's basis and every occurrence posts it. Three further rules were
 *  drafted and would each have posted the same cents — a control that records a selection nobody
 *  performs is a promise the ledger does not keep, so they wait for the lane that honours them. */
export const ACCRUAL_METHODS = ["stated_amount"] as const;
export type AccrualMethod = (typeof ACCRUAL_METHODS)[number];

export const ACCRUAL_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;
export const ACCRUAL_DAY_RULES = ["day_of_month", "last_day_of_month"] as const;
export const ACCRUAL_TIMEZONE = "Asia/Kuala_Lumpur";
/** The database's own ceiling (0193's `ck_plan_revisions_day_of_month`). A "31st of every month"
 *  schedule has no unambiguous February, and silently clamping it would make the recorded schedule
 *  and the dates it produces two different facts. */
export const ACCRUAL_DAY_OF_MONTH_MAX = 28;

export type AccrualListRow = {
  accrual_id: string;
  plan_id: string;
  revision: number;
  purpose: string;
  expense_account_code: string;
  liability_account_code: string;
  amount_cents: number;
  currency: string;
  effective_from: string;
  /** NOT NULL on the relation (0222 §A): an accrual states a term that ENDS, so the authority
   *  that accrues for it ends too, on or before the last day of that term. */
  effective_to: string;
  service_period_start: string;
  service_period_end: string;
  term_source: string;
  method: { rule: string };
  document_service_period_id: string | null;
  source_document_id: string | null;
  plan_status: string;
  plan_kind: string;
  recorded_by: string;
  created_at: string;
  occurrence_count: number;
  /** DERIVED by the door from a COMMITTED `clara.operation_receipts` row, never cached on the
   *  accrual: a cached flag can disagree with the ledger it claims to describe. */
  posted: boolean;
};

export type AccrualOccurrenceRow = {
  occurrence_id: string;
  leg: "primary" | "reversal" | string;
  due_date: string;
  period_key: string;
  attempt: number;
  revision: number;
  work_id: string | null;
  work_status: string | null;
  work_error: { reason?: string; message?: string } | null;
  admitted_at: string | null;
  outcome: { state?: string; reason?: string; message?: string; primary_state?: string } | null;
  /** THE ENTRY A REVERSAL LEG UNDOES. An admitted reversal always names one — 0193 admits a
   *  reversal only against an accrual that has POSTED — and an accrual leg never does. */
  reverses_entry_id: string | null;
  receipt_id: string | null;
  entry_id: string | null;
};

export type AccrualPlan = {
  plan_id: string;
  kind: string;
  status: string;
  purpose: string;
  authorised_by: string;
  authorised_at: string;
  authority_from: string;
  current_revision: number;
  frequency: string | null;
  day_rule: string | null;
  day_of_month: number | null;
  timezone: string | null;
  basis: {
    posting_date: string;
    memo: string;
    currency: string;
    lines: readonly {
      account_code: string;
      debit_cents: number;
      credit_cents: number;
      description?: string | null;
    }[];
  } | null;
  basis_digest: string | null;
  auto_reverse: boolean | null;
  reversal_day_rule: string | null;
};

export type AccrualDetail = AccrualListRow & {
  client_id: string;
  authority_kind: string;
  authority_ref: { kind?: string; id?: string } | null;
  instruction: string;
  corrects_accrual_id: string | null;
  corrected_by_accrual_id: string | null;
  plan: AccrualPlan;
  occurrences: readonly AccrualOccurrenceRow[];
  /** The latest reversal leg, or null while none is due. Lifted to the top level by the door so a
   *  surface can render "reverses entry X" without walking the occurrence list itself. */
  reversal: AccrualOccurrenceRow | null;
};

/** The typed particulars, in the DATABASE's own field spelling — `p_accrual`. */
export type AccrualParticulars = {
  expense_account_code: string;
  liability_account_code: string;
  amount_cents: number;
  currency: string;
  service_period_start: string;
  service_period_end: string;
  /** ONE MEMBER. A period a model read off a document may not enter the durable record (0140's
   *  table comment, CONFIRMED AS LAW), and the type is the shape of that law. */
  term_source: "human_stated";
  method: { rule: AccrualMethod };
  instruction: string;
  memo?: string;
  source_document_id?: string | null;
  document_service_period_id?: string | null;
};

export type AccrualCreated = {
  accrual_id: string;
  plan_id: string;
  revision_id: string;
  revision: number;
  kind: string;
  status: string;
  /** ALWAYS FALSE from this door, and the field exists to say so out loud: accepting a
   *  configuration writes plan + revision + accrual + occurrence + Work in one commit and posts
   *  NOTHING. The entry and its committed receipt are the run's own later commit. */
  posted: boolean;
  configuration_receipt: { fn: string; op_key: string } | null;
  occurrence: {
    admitted?: boolean;
    occurrence_id?: string;
    work_id?: string;
    due_date?: string;
    leg?: string;
    reason?: string;
    code?: string;
  } | null;
  next_occurrences: readonly { due_date: string; leg: string }[];
  /** ADVISORY, never a refusal: a live SIBLING accounting plan of this client already moves one of
   *  these accounts (`clara._plan_overlap_warning`, 0281/#909). This lane does not add a refusal
   *  on top of it — three scheduled-adjustment carriers can legitimately overlap. The 0045
   *  adjustment-template arm this warning also used to carry was retired by #929/0283: `kind` can
   *  only ever read `"accounting_plan_overlap"` now, and every entry is keyed by `plan_id`, never
   *  `template_id`.
 *
 *  #929's fix round (0283) also settled what a `null` here MEANS. The advisory excludes the plan
 *  the door just wrote by its own ID, not by the basis value it carries, so a sibling plan with a
 *  byte-identical basis — total overlap — is now named rather than swallowed; and the three
 *  plan-creating doors serialise on the client advisory rung, so two people creating overlapping
 *  plans at the same moment no longer both read `null`. */
  overlap_warning: {
    kind: string;
    templates: readonly { plan_id: string; name: string; cadence: string; accounts: readonly string[] }[];
  } | null;
};

// ── reads ───────────────────────────────────────────────────────────────────

/** Every accrual of one client, optionally windowed on `effective_from`. A malformed client id
 *  never reaches PostgREST (the `lib/client-id.ts` guard `lib/work/reads.ts` states in full): on a
 *  `uuid` argument it is a 400 `22P02`, which throws and lands on the route's error boundary
 *  instead of this page's own not-found state. */
export async function loadAccruals(
  clientId: string,
  window: { from?: string | null; to?: string | null } = {},
  o: Opts = {},
): Promise<AccrualListRow[]> {
  if (!isUuidShape(clientId)) return [];
  const answer = await callDoor<{ accruals?: AccrualListRow[] } | null>(
    "list_accrual_adjustments",
    { p_client: clientId, p_from: window.from ?? null, p_to: window.to ?? null },
    opts(o),
  );
  return answer?.accruals ?? [];
}

/**
 * #936 — THE ACCRUAL AN ACCOUNTING PLAN'S FIGURES ARE STATED ON, or null when the plan is not
 * accrual-backed. Pure; it selects over rows `loadAccruals` already read.
 *
 * WHY A SELECTOR AND NOT A FIELD ON THE PLAN READ. `clara.get_accounting_plan` does not say
 * whether a plan carries an accrual detail row, and `kind` cannot stand in for it: an accrual's
 * plan is a `reversing_journal`, and so is an ordinary reversing journal nobody configured from an
 * accrual (MEASURED on the lane rig: 115 reversing plans with an accrual and 3 without). The
 * honest discriminator is `clara.accrual_adjustments.plan_id`, which `list_accrual_adjustments`
 * already returns to this client's own surfaces.
 *
 * THE LIVE ROW IS THE HIGHEST REVISION. A corrected accrual leaves BOTH rows on the relation —
 * that is the whole of #936's lineage — and `uq_accrual_adjustments_plan_revision (plan_id,
 * revision)` makes the newest revision the one the plan is running under.
 */
export function liveAccrualForPlan(
  rows: readonly AccrualListRow[],
  planId: string,
): AccrualListRow | null {
  let live: AccrualListRow | null = null;
  for (const row of rows) {
    if (row.plan_id !== planId) continue;
    if (live === null || row.revision > live.revision) live = row;
  }
  return live;
}

export async function loadAccrual(accrualId: string, o: Opts = {}): Promise<AccrualDetail | null> {
  if (!isUuidShape(accrualId)) return null;
  return callDoor<AccrualDetail | null>("get_accrual_adjustment", { p_accrual: accrualId }, opts(o));
}

// ── write ───────────────────────────────────────────────────────────────────

export type CreateAccrualInput = {
  clientId: string;
  purpose: string;
  /** The row in this database that carries the instruction — a Work of the SAME client. The door
   *  RESOLVES it; a Knowledge preference cannot supply authority (0193:1510-1512). */
  authorityRef: { kind: "accounting_work" | "chat_task"; id: string };
  accrual: AccrualParticulars;
  frequency: (typeof ACCRUAL_FREQUENCIES)[number];
  dayRule: (typeof ACCRUAL_DAY_RULES)[number];
  /** Null when the day rule is `last_day_of_month`; 1..28 otherwise. */
  dayOfMonth: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  opKey: string;
};

export async function createAccrual(input: CreateAccrualInput, o: Opts = {}): Promise<AccrualCreated> {
  return callDoor<AccrualCreated>(
    "create_accrual_adjustment",
    {
      p_client: input.clientId,
      p_purpose: input.purpose,
      p_authority_ref: input.authorityRef,
      p_accrual: input.accrual,
      p_frequency: input.frequency,
      p_day_rule: input.dayRule,
      p_day_of_month: input.dayOfMonth,
      p_timezone: ACCRUAL_TIMEZONE,
      p_effective_from: input.effectiveFrom,
      p_effective_to: input.effectiveTo,
      p_op_key: input.opKey,
    },
    opts(o),
  );
}

/**
 * THE PLAN LANE'S OWN DUE-DATE ARITHMETIC (`clara._plan_due_nth`, 0193:791), mirrored here so the
 * form can name the mistake beside the control. `k` periods after the MONTH of `from`, on that
 * month's last day or on the named day, never past the month's own last day.
 */
function accrualDueNth(
  from: string,
  frequency: (typeof ACCRUAL_FREQUENCIES)[number],
  dayRule: (typeof ACCRUAL_DAY_RULES)[number],
  dayOfMonth: number | null,
  k: number,
): string {
  const step = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const total = Number(from.slice(0, 4)) * 12 + (Number(from.slice(5, 7)) - 1) + k * step;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = dayRule === "last_day_of_month" ? last : Math.min(dayOfMonth ?? 1, last);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Whether this schedule reaches at least one ACCRUAL date inside `[from, to]` — 0222's SEVENTH
 * MEASUREMENT (`clara._accrual_schedule_yields`), which the door re-asks and is the authority for.
 *
 * WHY THE FORM ASKS IT AT ALL: a term shorter than one period of its own schedule was ACCEPTED
 * before that wall existed and could never post — the accrual was recorded, the plan went live and
 * the list read said "No due dates reached yet" for ever (review round 2, NB1).
 */
export function accrualScheduleYields(
  frequency: (typeof ACCRUAL_FREQUENCIES)[number],
  dayRule: (typeof ACCRUAL_DAY_RULES)[number],
  dayOfMonth: number | null,
  from: string,
  to: string,
): boolean {
  if (to < from) return false;
  for (let k = 0; k < 4096; k += 1) {
    const due = accrualDueNth(from, frequency, dayRule, dayOfMonth, k);
    if (due > to) return false;
    if (due >= from) return true;
  }
  return false;
}

// ── correct (#936) ─────────────────────────────────────────────────────────

/** The answer `clara.correct_accrual_adjustment` hands back. It NAMES the row it supersedes
 *  (`corrects_accrual_id`) — the pointer the detail surface renders as lineage — and the plan
 *  revision the corrected basis now lives on. Like `AccrualCreated`, this is a REPORT of what the
 *  database did, never a value the form paints as state: the form navigates to the NEW accrual's
 *  own address and that destination re-reads. */
export type AccrualCorrected = {
  accrual_id: string;
  corrects_accrual_id: string;
  plan_id: string;
  revision_id: string;
  revision: number;
  superseded_revision: number;
  status: string;
  overlap_warning: AccrualCreated["overlap_warning"];
};

export type CorrectAccrualInput = {
  /** The accrual being corrected — the row this call supersedes. */
  accrualId: string;
  /** The CORRECTED particulars, in the database's own field spelling — the same shape
   *  `CreateAccrualInput.accrual` carries. The door reads no schedule, purpose or authority
   *  argument: those are the live plan revision's own, carried through unchanged. */
  accrual: AccrualParticulars;
  opKey: string;
};

export async function correctAccrual(input: CorrectAccrualInput, o: Opts = {}): Promise<AccrualCorrected> {
  return callDoor<AccrualCorrected>(
    "correct_accrual_adjustment",
    { p_accrual_id: input.accrualId, p_accrual: input.accrual, p_op_key: input.opKey },
    opts(o),
  );
}

// ── #938 — the two remedies for "a bill posted inside an accrued period" ───────────────────

/**
 * `clara._plan_reversal_date(p_due)` (0193:837), MIRRORED here the same way `accrualDueNth`
 * above mirrors `clara._plan_due_nth`: the first day of the month AFTER `due`'s. This is the
 * schedule's own fixed rule for a `reversing_journal` plan — one calendar month, regardless of
 * the plan's frequency — and "reverse now" needs it to build the catch-up window; the database
 * is still the sole authority over whether that date has actually arrived.
 */
export function accrualReversalDate(dueIso: string): string {
  const year = Number(dueIso.slice(0, 4));
  const month = Number(dueIso.slice(5, 7)); // 1-based; Date.UTC's 0-based month IS "next month"
  const d = new Date(Date.UTC(year, month, 1));
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * "Reverse now" — the EXISTING `clara.request_plan_catch_up` door (0193), never a new one: the
 * window runs from the flagged occurrence's own due date through its scheduled reversal date.
 * When the reversal is already due, this admits it and the accrual_bill_conflict row clears on
 * the next read; while it genuinely is not yet due, the door's own `catch_up_in_future` refusal
 * (DoorRefusal) surfaces verbatim — never pretended away.
 */
export async function reverseAccrualNow(
  planId: string,
  dueDate: string,
  o: Opts = {},
): Promise<unknown> {
  return callDoor(
    "request_plan_catch_up",
    {
      p_plan: planId,
      p_from: dueDate,
      p_to: accrualReversalDate(dueDate),
      p_op_key: crypto.randomUUID(),
    },
    opts(o),
  );
}

/**
 * "Skip this period's next occurrence" — `clara.skip_plan_occurrence` (#938, 0302): removes
 * exactly ONE future due date from the plan's schedule, named as the occurrence AFTER the
 * flagged one's own due date. bookkeeper+; never touches the already-posted flagged occurrence
 * itself.
 */
export async function skipNextAccrualOccurrence(
  planId: string,
  afterDue: string,
  reason: string,
  o: Opts = {},
): Promise<unknown> {
  return callDoor(
    "skip_plan_occurrence",
    { p_plan: planId, p_after_due: afterDue, p_reason: reason, p_op_key: crypto.randomUUID() },
    opts(o),
  );
}

/** The two derived journal lines an accrual posts, for the DISABLED preview the form renders. It
 *  mirrors `clara._accrual_journal_basis` (0222) exactly; the database derives its own and is the
 *  authority, so nothing computed here is ever sent. */
export function derivedAccrualLines(input: {
  expenseAccountCode: string;
  liabilityAccountCode: string;
  amountCents: number;
  servicePeriodStart: string;
  servicePeriodEnd: string;
}): { account_code: string; debit_cents: number; credit_cents: number; description: string }[] {
  return [
    {
      account_code: input.expenseAccountCode.trim(),
      debit_cents: input.amountCents,
      credit_cents: 0,
      // THE DATABASE'S OWN WORDING (`clara._accrual_journal_basis`): the revision's basis is
      // FROZEN, so every occurrence posts this same line — and one occurrence accrues ONE PERIOD
      // of the stated term, not the whole of it.
      description: `one period of the accrual term ${input.servicePeriodStart} to ${input.servicePeriodEnd}`,
    },
    {
      account_code: input.liabilityAccountCode.trim(),
      debit_cents: 0,
      credit_cents: input.amountCents,
      description: "accrual",
    },
  ];
}
