// #653 — THE PREPAYMENT FORM'S PURE MIRROR (journeys C8, C9).
//
// EVERY RULE HERE IS THE DATABASE'S, RE-STATED WHERE THE CONTROL IS. `clara.create_prepayment_
// schedule` (migration 0208) re-checks all of them, and it is the authority: this module exists so
// a preparer sees a mistake beside the field that holds it instead of as a refusal a round trip
// later. Nothing below is a rule of its own, and nothing below derives an accounting fact.
//
// WHAT THE FORM DELIBERATELY DOES NOT ASK, because each absence is a rule rather than an omission:
//
//   · THE AMOUNT, THE PERIOD COUNT AND THE PER-PERIOD ALLOCATION. All three are derived by the
//     FROZEN `clara.prepayment_schedule_v1` from the recognition entry's own prepaid leg and the
//     document's own service period. The form renders them as a DISABLED preview after the door
//     answers — a preview, never an editor.
//   · THE CADENCE. Monthly, each period's own month end, derived from the same output. 0208's
//     `clara._assert_plan_schedule` refuses a typed one for this kind, so offering the control
//     would be offering one whose only possible outcome is a refusal.
//   · THE TERM. A service period is HUMAN-STATED and lives on the DOCUMENT
//     (`clara.record_document_service_period`, bookkeeper floor). The form never collects it here;
//     when it is missing the door refuses by name and the surface sends the person to the document.
//
// WHAT IT DOES ASK is exactly what a human judges: WHICH posted prepayment, WHICH expense account
// the amortisation charges, WHY that account, and what the schedule is FOR.

/** The typed `detail.reason` tokens migration 0208's door raises. Spelled once so the form's
 *  refusal rendering and the e2e mock cannot drift apart. */
export const PREPAYMENT_REFUSAL = {
  sourceUnfit: "prepayment_source_unfit",
  termUnderivable: "prepayment_term_underivable",
  targetIneligible: "prepayment_target_ineligible",
  targetUnderivable: "prepayment_target_underivable",
  belowGranularity: "prepayment_amount_below_period_granularity",
  scheduleExists: "prepayment_schedule_exists",
  scheduleNotFound: "prepayment_schedule_not_found",
  periodLineMissing: "amortisation_period_line_missing",
  invalidPurpose: "invalid_purpose",
  clientNotFound: "client_not_found",
  clientInactive: "client_inactive",
  authorityRefUnresolved: "authority_ref_unresolved",
  operationInFlight: "operation_in_flight",
} as const;

export type PrepaymentRefusalReason =
  (typeof PREPAYMENT_REFUSAL)[keyof typeof PREPAYMENT_REFUSAL];

/** THE DERIVED CADENCE, as constants rather than as controls. */
export const PREPAYMENT_FREQUENCY = "monthly";
export const PREPAYMENT_DAY_RULE = "last_day_of_month";
export const PREPAYMENT_TIMEZONE = "Asia/Kuala_Lumpur";

export type PrepaymentFieldId = "sourceEntry" | "expenseAccount" | "expenseBasis" | "purpose";

export type PrepaymentIssue = { field: PrepaymentFieldId; code: string };

export type PrepaymentDraft = {
  /** The POSTED recognition entry this schedule amortises. */
  sourceEntryId: string;
  /** The judged expense account each period's charge is booked to. */
  expenseAccountCode: string;
  /** WHY that account. Required — a classification with no stated grounds is refused. */
  expenseAccountBasis: string;
  purpose: string;
};

export const EMPTY_PREPAYMENT_DRAFT: PrepaymentDraft = {
  sourceEntryId: "",
  expenseAccountCode: "",
  expenseAccountBasis: "",
  purpose: "",
};

/** The DOM id of one field's control, so a failed submit can focus the first invalid one and the
 *  error beside it can be wired by `aria-describedby`. */
export function prepaymentFieldElementId(field: PrepaymentFieldId): string {
  return `prepayment-${field}`;
}

/** The order a failed submit walks, which is the order the form reads. */
const FIELD_ORDER: readonly PrepaymentFieldId[] = [
  "sourceEntry", "expenseAccount", "expenseBasis", "purpose",
];

export function firstInvalidPrepaymentField(issues: readonly PrepaymentIssue[]): PrepaymentFieldId {
  for (const field of FIELD_ORDER) {
    if (issues.some((i) => i.field === field)) return field;
  }
  return "sourceEntry";
}

/**
 * The mirror. It refuses ONLY what the door refuses, and it refuses nothing the door would accept.
 *
 * `knownExpenseAccounts` is the client's OWN chart, when it could be read: an unknown code is
 * `prepayment_target_ineligible` / `account_unknown` at the door, so naming it here saves a round
 * trip. When the chart could not be read the check is SKIPPED rather than guessed — a form that
 * refused every account because a read failed would be worse than one that let the door answer.
 */
export function validatePrepaymentDraft(
  draft: PrepaymentDraft,
  knownExpenseAccounts: ReadonlySet<string> | null,
): PrepaymentIssue[] {
  const issues: PrepaymentIssue[] = [];
  if (draft.sourceEntryId.trim() === "") {
    issues.push({ field: "sourceEntry", code: "sourceRequired" });
  }
  const account = draft.expenseAccountCode.trim();
  if (account === "") {
    issues.push({ field: "expenseAccount", code: "accountRequired" });
  } else if (knownExpenseAccounts !== null && !knownExpenseAccounts.has(account)) {
    issues.push({ field: "expenseAccount", code: "accountUnknown" });
  }
  if (draft.expenseAccountBasis.trim() === "") {
    issues.push({ field: "expenseBasis", code: "basisRequired" });
  }
  if (draft.purpose.trim() === "") {
    issues.push({ field: "purpose", code: "purposeRequired" });
  }
  return issues;
}

/** One derived period line, as `clara.prepayment_schedules.period_lines` holds it: the frozen
 *  evaluator's own emitted keys plus this lane's expense/prepaid pairing. */
export type PeriodLine = {
  period_start: string;
  period_end: string;
  amount_cents: number;
  credit_cents?: number;
  account_code?: string;
  prepaid_account_code: string;
  expense_account_code: string;
};

/**
 * THE ALLOCATION'S OWN ARITHMETIC, CHECKED RATHER THAN RECOMPUTED. The database owns the
 * allocation; this answers "do the lines the database sent add up to the total it sent", which is
 * the one thing a surface can honestly assert about a number it did not derive. A mismatch is
 * rendered as a warning rather than silently reconciled — the surface never edits an amount.
 */
export function allocationIsExact(lines: readonly PeriodLine[], totalCents: number): boolean {
  if (lines.length === 0) return false;
  return lines.reduce((sum, l) => sum + Number(l.amount_cents), 0) === totalCents;
}

/** Which line carries the residual: the LAST one, by the evaluator's own
 *  `remainder_placement: 'final_period'`. Returns -1 when every period is equal. */
export function residualIndex(lines: readonly PeriodLine[]): number {
  if (lines.length < 2) return -1;
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (first === undefined || last === undefined) return -1;
  return Number(last.amount_cents) === Number(first.amount_cents) ? -1 : lines.length - 1;
}

/** The message key for one typed refusal. An unknown token answers `unknown`, so a refusal this
 *  build has not enumerated prints the database's own words rather than a key path. */
export function prepaymentRefusalKey(reason: string | null | undefined): string {
  switch (reason) {
    case PREPAYMENT_REFUSAL.sourceUnfit: return "refusalSourceUnfit";
    case PREPAYMENT_REFUSAL.termUnderivable: return "refusalTermUnderivable";
    case PREPAYMENT_REFUSAL.targetIneligible: return "refusalTargetIneligible";
    case PREPAYMENT_REFUSAL.targetUnderivable: return "refusalTargetUnderivable";
    case PREPAYMENT_REFUSAL.belowGranularity: return "refusalBelowGranularity";
    case PREPAYMENT_REFUSAL.scheduleExists: return "refusalScheduleExists";
    case PREPAYMENT_REFUSAL.periodLineMissing: return "refusalPeriodLineMissing";
    case PREPAYMENT_REFUSAL.operationInFlight: return "refusalOperationInFlight";
    default: return "unknown";
  }
}

/** The occurrence outcome vocabulary a schedule's history renders. It is the plan lane's, because
 *  an amortisation occurrence IS a plan occurrence. */
export type OccurrenceStage = "admission" | "posting";

/**
 * WHERE an occurrence stopped, from the row itself rather than from a flag the database does not
 * carry. A refused occurrence never named a Work; an admitted one whose Work died at the posting
 * core did. The distinction matters because the next act differs: an admission refusal is a
 * plan-lane fact (authority, window, period line), a posting refusal is a books fact (a closed
 * period, a withdrawn model-egress authority).
 */
export function occurrenceStage(outcomeState: string | null | undefined): OccurrenceStage {
  return outcomeState === "refused" ? "admission" : "posting";
}
