// #941 — THE DEFERRED-REVENUE FORM'S PURE HALF: the draft it holds, the mirror of the door's own
// refusals, the DOM ids its fields carry, and the closed vocabulary its refusal rendering reads.
//
// IT COMPUTES NO MONEY AND NO DATE. The amount is the receipt's own credited liability leg, the
// term is the carrier's, the allocation and the cadence are the frozen evaluator's. A second
// implementation of any of them in TypeScript is the drift the database-owned arithmetic exists to
// prevent, so nothing here derives a figure.
//
// WHAT IT DOES ASK is exactly what a human judges: WHICH posted advance, WHICH instruction
// authorises it, WHICH revenue account the recognition credits, WHY that account, and what the
// schedule is FOR.

/** The typed `detail.reason` tokens migration 0308's door raises. Spelled once so the form's
 *  refusal rendering and the e2e mock cannot drift apart. */
export const RECOGNITION_REFUSAL = {
  sourceUnfit: "deferred_revenue_source_unfit",
  termUnderivable: "deferred_revenue_term_underivable",
  targetIneligible: "revenue_target_ineligible",
  targetUnderivable: "revenue_target_underivable",
  belowGranularity: "deferred_revenue_amount_below_period_granularity",
  scheduleExists: "deferred_revenue_schedule_exists",
  scheduleNotFound: "revenue_recognition_schedule_not_found",
  periodLineMissing: "revenue_recognition_period_line_missing",
  patternUnsupported: "recognition_pattern_unsupported",
  invalidPurpose: "invalid_purpose",
  clientNotFound: "client_not_found",
  clientInactive: "client_inactive",
  authorityRefUnresolved: "authority_ref_unresolved",
  operationInFlight: "operation_in_flight",
} as const;

export type RecognitionRefusalReason =
  (typeof RECOGNITION_REFUSAL)[keyof typeof RECOGNITION_REFUSAL];

/** The axis a `deferred_revenue_source_unfit` refusal carries when the account is simply not on
 *  the client's deferred-revenue roster. It is a GATE rather than a ban — the panel it names is
 *  where a bookkeeper clears it — so the surface renders it differently from every other axis. */
export const NOT_ENROLLED_AXIS = "deferred_account_not_enrolled";

/** THE DERIVED CADENCE, as constants rather than as controls. */
export const RECOGNITION_FREQUENCY = "monthly";
export const RECOGNITION_DAY_RULE = "last_day_of_month";
export const RECOGNITION_TIMEZONE = "Asia/Kuala_Lumpur";

export type RecognitionFieldId =
  "sourceEntry" | "authority" | "revenueAccount" | "revenueBasis" | "purpose";

export type RecognitionIssue = { field: RecognitionFieldId; code: string };

export type RecognitionDraft = {
  /** The POSTED advance receipt this schedule recognises. */
  sourceEntryId: string;
  /** The INSTRUCTION this schedule cites: a `clara.accounting_work` row of THIS client.
   *  `clara.create_accounting_plan` RESOLVES the reference and refuses `authority_ref_unresolved`
   *  when it names nothing, so this is a field a person answers — never a value the form derives
   *  from the receipt it is about. */
  authorityWorkId: string;
  /** The judged INCOME account each period's recognition credits. */
  revenueAccountCode: string;
  /** WHY that account. Required — a classification with no stated grounds is refused. */
  revenueAccountBasis: string;
  purpose: string;
};

export const EMPTY_RECOGNITION_DRAFT: RecognitionDraft = {
  sourceEntryId: "",
  authorityWorkId: "",
  revenueAccountCode: "",
  revenueAccountBasis: "",
  purpose: "",
};

/** The DOM id of one field's control, so a failed submit can focus the first invalid one and the
 *  error beside it can be wired by `aria-describedby`. */
export function recognitionFieldElementId(field: RecognitionFieldId): string {
  return `deferred-revenue-${field}`;
}

/** The order a failed submit walks, which is the order the form reads. */
const FIELD_ORDER: readonly RecognitionFieldId[] = [
  "sourceEntry", "authority", "revenueAccount", "revenueBasis", "purpose",
];

export function firstInvalidRecognitionField(
  issues: readonly RecognitionIssue[],
): RecognitionFieldId {
  for (const field of FIELD_ORDER) {
    if (issues.some((i) => i.field === field)) return field;
  }
  return "sourceEntry";
}

/**
 * The mirror. It refuses ONLY what the door refuses, and it refuses nothing the door would accept.
 *
 * `knownRevenueAccounts` is the client's OWN chart, when it could be read: an unknown code is
 * `revenue_target_ineligible` / `account_unknown` at the door, so naming it here saves a round
 * trip. When the chart could not be read the check is SKIPPED rather than guessed — a form that
 * refused every account because a read failed would be worse than one that let the door answer.
 */
export function validateRecognitionDraft(
  draft: RecognitionDraft,
  knownRevenueAccounts: ReadonlySet<string> | null,
): RecognitionIssue[] {
  const issues: RecognitionIssue[] = [];
  if (draft.sourceEntryId.trim() === "") {
    issues.push({ field: "sourceEntry", code: "sourceRequired" });
  }
  // THE AUTHORITY IS REQUIRED HERE BECAUSE IT IS REQUIRED THERE. A fabricated id (the receipt's
  // own, say) is worse than a blocked submit — it is an authority claim nobody made.
  if (draft.authorityWorkId.trim() === "") {
    issues.push({ field: "authority", code: "authorityRequired" });
  }
  const account = draft.revenueAccountCode.trim();
  if (account === "") {
    issues.push({ field: "revenueAccount", code: "accountRequired" });
  } else if (knownRevenueAccounts !== null && !knownRevenueAccounts.has(account)) {
    issues.push({ field: "revenueAccount", code: "accountUnknown" });
  }
  if (draft.revenueAccountBasis.trim() === "") {
    issues.push({ field: "revenueBasis", code: "basisRequired" });
  }
  if (draft.purpose.trim() === "") {
    issues.push({ field: "purpose", code: "purposeRequired" });
  }
  return issues;
}

/** The index of the period that carries the cent remainder — the LAST one, by the evaluator's own
 *  `remainder_placement: 'final_period'`. Returned as an index rather than recomputed from the
 *  amounts, so the surface marks the period the database placed it in and not one it guessed. */
export function residualIndex(lines: readonly unknown[]): number {
  return lines.length === 0 ? -1 : lines.length - 1;
}

/** The message key for one typed refusal, with a documented fallback for a token this build has
 *  not enumerated: an unknown refusal must still be legible, so the surface prints the database's
 *  own sentence beside a generic label rather than swallowing it. */
export function recognitionRefusalKey(reason: string | null | undefined): string {
  const known = Object.values(RECOGNITION_REFUSAL) as readonly string[];
  return reason !== null && reason !== undefined && known.includes(reason)
    ? `refusal_${reason}`
    : "refusal_unknown";
}
