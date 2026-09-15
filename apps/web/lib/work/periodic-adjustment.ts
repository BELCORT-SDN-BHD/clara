// #643 — THE PERIODIC-ADJUSTMENT FORM'S OWN VALIDATION AND DERIVATION: pure functions over a
// draft, no React, no DB, no fetch. Split out of the form for the reason
// `lib/work/journal-basis.ts` gives for its own split: a rule about MONEY that lives inside a
// render body is a rule nobody can test without a DOM.
//
// WHAT THIS IS NOT. It is not the authority on whether an adjustment may be admitted.
// `clara.admit_periodic_adjustment_work` revalidates every rule below at admission and
// `clara.wake_record_journal_entry` revalidates the accounting ones AGAIN at commit, against the
// client's live chart, the live staff-advance register and the live fiscal years — which is why
// this module deliberately does not attempt the four checks it could only guess at (is the account
// still active, is it of the right class, is the advance account enrolled, is the period inside an
// open fiscal year). It exists so a preparer sees a mistake beside the field that holds it instead
// of as a refusal thirty seconds later, and every rule here is a MIRROR of one the database
// enforces, never a rule of its own.
//
// NOTHING HERE INVENTS A NUMBER. #643's boundary is explicit: "do not invent employee
// calculations, current contribution rates or missing settlement facts." The ONE arithmetic this
// module does is `closingCents − openingCents`, which is the accountant's own two figures
// subtracted, and it is derived only so the form can show the movement they implied and the
// database can check it against what was submitted.
//
// THE LIABILITY DEFAULTS ARE AN OFFER, NOT A CLAIM. `STATUTORY_LIABILITY_DEFAULTS` names the
// starter chart's own statutory accounts (migration 0150: 2100 EPF, 2110 SOCSO, 2120 EIS, 2130 PCB
// (MTD), 2140 HRDF) and `2020 Accruals` for the two non-statutory kinds. The form fills the field
// with one, SHOWS that it did, and lets the preparer change it; nothing is submitted that a human
// did not see. A chart-template change would have been a claim about every client's books — see
// migration 0194's own header.

import type { JournalDraftLine, JournalFieldId } from "./journal-basis";

export const ADJUSTMENT_PURPOSES = ["periodic_stock_adjustment", "payroll_obligation"] as const;
export type AdjustmentPurpose = (typeof ADJUSTMENT_PURPOSES)[number];

export const STOCK_METHODS = ["opening_closing_count", "explicit_adjustment"] as const;
export type StockMethod = (typeof STOCK_METHODS)[number];

export const OBLIGATION_KINDS = [
  "epf", "socso", "eis", "pcb_mtd", "hrdf", "salary", "other_supplied",
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

/** The starter chart's own statutory payables, and `2020 Accruals` for the two kinds that have no
 *  regulator behind them. Read by the form as a DEFAULT it renders and can be overridden — the
 *  database takes whatever account is submitted and checks its class, never this map. */
export const STATUTORY_LIABILITY_DEFAULTS: Readonly<Record<ObligationKind, string>> = Object.freeze({
  epf: "2100",
  socso: "2110",
  eis: "2120",
  pcb_mtd: "2130",
  hrdf: "2140",
  salary: "2020",
  other_supplied: "2020",
});

/** The starter chart's employer-contribution expense accounts (0150: 6010-6040) and `6000 Salaries
 *  and Wages` for the rest. Offered on the same footing as the liability default. */
export const OBLIGATION_EXPENSE_DEFAULTS: Readonly<Record<ObligationKind, string>> = Object.freeze({
  epf: "6010",
  socso: "6020",
  eis: "6030",
  pcb_mtd: "6000",
  hrdf: "6040",
  salary: "6000",
  other_supplied: "6000",
});

/**
 * ONE FLAT DRAFT HOLDING BOTH HALVES, and that is the "preserved draft" rule rather than a
 * shortcut. The type switch at the top of the form changes which half is READ, validated and
 * submitted; it does not discard what was typed in the other one. A preparer who starts a stock
 * adjustment, realises it is a payroll accrual and switches back finds their figures where they
 * left them — and a draft restored from storage carries both halves for the same reason.
 */
export type AdjustmentDraft = {
  purpose: AdjustmentPurpose;
  periodStart: string;
  periodEnd: string;
  instruction: string;
  // — the stock half —
  method: StockMethod;
  openingCents: number;
  closingCents: number;
  adjustmentCents: number;
  countedAt: string;
  countReference: string;
  inventoryAccountCode: string;
  costAccountCode: string;
  // — the payroll half —
  obligationKind: ObligationKind;
  expenseAccountCode: string;
  liabilityAccountCode: string;
  advanceAccountCode: string;
  // THE ADVANCE LEG'S OWN ALLOCATION. A DERIVATION INPUT ONLY, never a stored particular: it
  // shapes the derived advance leg (`derivedLines`) and nothing else, and it is deliberately
  // absent from `ADJUSTMENT_FIELDS` below. #797 made `settledCents` a real particular and left
  // this one alone ON PURPOSE — the staff-advance register (`clara.staff_advance_accounts`,
  // `book_staff_advance_application`) stays the authority on what a movement on its accounts
  // requires, so an allocation this form invented would be a settlement fact nobody stated.
  advanceCents: number;
  paymentAccountCode: string;
  amountCents: number;
  settledCents: number;
  particularsSource: string;
};

export function emptyAdjustmentDraft(): AdjustmentDraft {
  return {
    purpose: "periodic_stock_adjustment",
    periodStart: "",
    periodEnd: "",
    instruction: "",
    method: "opening_closing_count",
    openingCents: 0,
    closingCents: 0,
    adjustmentCents: 0,
    countedAt: "",
    countReference: "",
    inventoryAccountCode: "",
    costAccountCode: "",
    obligationKind: "epf",
    expenseAccountCode: OBLIGATION_EXPENSE_DEFAULTS.epf,
    liabilityAccountCode: STATUTORY_LIABILITY_DEFAULTS.epf,
    advanceAccountCode: "",
    advanceCents: 0,
    paymentAccountCode: "",
    amountCents: 0,
    settledCents: 0,
    particularsSource: "",
  };
}

/**
 * The address of the control an issue belongs beside — a STRING, not an index, for the reason
 * `JournalFieldId` states: the form uses it as the element `id` it focuses and as the
 * `aria-describedby` target, so a rule cannot name a field the form does not render.
 *
 * The BASIS fields (`postingDate`, `memo`, the line grid) keep their own `JournalFieldId`
 * vocabulary, because this form renders the very same `JournalBasisFields` component.
 */
export type AdjustmentFieldId =
  | "purpose"
  | "periodStart"
  | "periodEnd"
  | "instruction"
  | "method"
  | "openingCents"
  | "closingCents"
  | "adjustmentCents"
  | "countedAt"
  | "countReference"
  | "inventoryAccountCode"
  | "costAccountCode"
  | "obligationKind"
  | "expenseAccountCode"
  | "liabilityAccountCode"
  | "advanceAccountCode"
  | "advanceCents"
  | "paymentAccountCode"
  | "amountCents"
  | "settledCents"
  | "particularsSource";

/** Either vocabulary — this form focuses controls from both. */
export type AdjustmentFormFieldId = AdjustmentFieldId | JournalFieldId;

export type AdjustmentIssueCode =
  | "required"
  | "invalidDate"
  | "periodOrder"
  | "accountRequired"
  | "accountUnknown"
  | "accountsMustDiffer"
  | "amountRequired"
  | "amountNotExact"
  | "derivedAmountMismatch"
  | "countedOutsidePeriod"
  | "overSettled"
  | "settlementNeedsAccount"
  | "paymentLegUnused"
  // THE ADVANCE LEG'S OWN PAIR, mirroring 0194's `advance_leg` (a staff-advance account named
  // with nothing carried on it) and its own `≤ amount` bound — `overSettled`'s rule, restated for
  // the advance leg rather than the payment one.
  | "advanceLegUnused"
  | "overAdvanced"
  | "tooLong";

export type AdjustmentIssue = { field: AdjustmentFieldId; code: AdjustmentIssueCode };

export const INSTRUCTION_MAX_CHARS = 4000;
export const PARTICULARS_SOURCE_MAX_CHARS = 500;
export const COUNT_REFERENCE_MAX_CHARS = 200;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An ISO calendar date and nothing else — the same rule (and the same reason) as
 *  `lib/work/journal-basis.ts`'s `isCalendarDate`: `Date.parse` accepts a dozen shapes the DB's
 *  `date` column does not, and applies a timezone to a value that has none. */
export function isCalendarDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/** The SIGNED movement a stock draft records, in exact minor units, or null when the draft cannot
 *  yet say. Positive is a rise. */
export function movementCents(draft: AdjustmentDraft): number | null {
  if (draft.method === "opening_closing_count") {
    if (!Number.isSafeInteger(draft.openingCents) || !Number.isSafeInteger(draft.closingCents)) return null;
    return draft.closingCents - draft.openingCents;
  }
  return Number.isSafeInteger(draft.adjustmentCents) ? draft.adjustmentCents : null;
}

function exact(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Every issue in the draft, IN DOM ORDER — the type switch, then the period, then the active
 * half's own fields, then the instruction. The order is the contract: the form focuses
 * `issues[0].field`, and "the FIRST invalid field" only means anything if this list is in the
 * order a human reads the form.
 *
 * `knownAccountCodes` is the client's ACTIVE chart. `null` means the chart could not be read — and
 * then the unknown-account rule is SKIPPED rather than guessed, exactly as the journal composer
 * skips it: refusing every account because a read failed would block a preparer over the UI's own
 * problem, and the commit rechecks each code against the live chart anyway.
 */
export function validateAdjustmentDraft(
  draft: AdjustmentDraft,
  knownAccountCodes: ReadonlySet<string> | null,
): AdjustmentIssue[] {
  const issues: AdjustmentIssue[] = [];
  const account = (field: AdjustmentFieldId, code: string, required: boolean) => {
    const trimmed = code.trim();
    if (trimmed === "") {
      if (required) issues.push({ field, code: "accountRequired" });
      return;
    }
    if (knownAccountCodes !== null && !knownAccountCodes.has(trimmed)) {
      issues.push({ field, code: "accountUnknown" });
    }
  };

  for (const field of ["periodStart", "periodEnd"] as const) {
    const value = draft[field];
    if (value.trim() === "") issues.push({ field, code: "required" });
    else if (!isCalendarDate(value)) issues.push({ field, code: "invalidDate" });
  }
  // AFTER both, and only when both are real dates: "the period ends before it starts" is not
  // something to say about a field a human has not finished typing.
  if (isCalendarDate(draft.periodStart) && isCalendarDate(draft.periodEnd) && draft.periodEnd < draft.periodStart) {
    issues.push({ field: "periodEnd", code: "periodOrder" });
  }

  if (draft.purpose === "periodic_stock_adjustment") {
    account("inventoryAccountCode", draft.inventoryAccountCode, true);
    account("costAccountCode", draft.costAccountCode, true);
    if (draft.inventoryAccountCode.trim() !== ""
        && draft.inventoryAccountCode.trim() === draft.costAccountCode.trim()) {
      issues.push({ field: "costAccountCode", code: "accountsMustDiffer" });
    }
    if (draft.method === "opening_closing_count") {
      if (!exact(draft.openingCents)) issues.push({ field: "openingCents", code: "amountNotExact" });
      if (!exact(draft.closingCents)) issues.push({ field: "closingCents", code: "amountNotExact" });
    } else if (!Number.isSafeInteger(draft.adjustmentCents)) {
      issues.push({ field: "adjustmentCents", code: "amountNotExact" });
    }
    // THE ALL-ZERO RULE, MIRRORED. The database refuses it `adjustment_all_zero`; the form says so
    // beside the figure that produced it, which for a count is the CLOSING one — the number a
    // preparer would change.
    const movement = movementCents(draft);
    if (movement === 0) {
      issues.push({
        field: draft.method === "opening_closing_count" ? "closingCents" : "adjustmentCents",
        code: "amountRequired",
      });
    }
    if (draft.countedAt.trim() !== "") {
      if (!isCalendarDate(draft.countedAt)) issues.push({ field: "countedAt", code: "invalidDate" });
      else if (isCalendarDate(draft.periodStart) && isCalendarDate(draft.periodEnd)
               && (draft.countedAt < draft.periodStart || draft.countedAt > draft.periodEnd)) {
        // The database's `stale_basis`: a count taken outside the period it is offered for is not
        // evidence about that period.
        issues.push({ field: "countedAt", code: "countedOutsidePeriod" });
      }
    }
    if (draft.countReference.length > COUNT_REFERENCE_MAX_CHARS) {
      issues.push({ field: "countReference", code: "tooLong" });
    }
  } else {
    account("expenseAccountCode", draft.expenseAccountCode, true);
    account("liabilityAccountCode", draft.liabilityAccountCode, true);
    account("advanceAccountCode", draft.advanceAccountCode, false);
    account("paymentAccountCode", draft.paymentAccountCode, false);
    if (draft.expenseAccountCode.trim() !== ""
        && draft.expenseAccountCode.trim() === draft.liabilityAccountCode.trim()) {
      issues.push({ field: "liabilityAccountCode", code: "accountsMustDiffer" });
    }
    if (!exact(draft.amountCents)) issues.push({ field: "amountCents", code: "amountNotExact" });
    else if (draft.amountCents === 0) issues.push({ field: "amountCents", code: "amountRequired" });
    if (!exact(draft.settledCents)) issues.push({ field: "settledCents", code: "amountNotExact" });
    else if (draft.settledCents > 0 && draft.paymentAccountCode.trim() === "") {
      issues.push({ field: "paymentAccountCode", code: "settlementNeedsAccount" });
    } else if (draft.settledCents === 0 && draft.paymentAccountCode.trim() !== "") {
      // The database's `adjustment_lines_mismatch` / `payment_leg`: a named leg the entry never
      // touches is a particular that does not describe the entry.
      issues.push({ field: "settledCents", code: "paymentLegUnused" });
    } else if (exact(draft.amountCents) && draft.settledCents > draft.amountCents) {
      issues.push({ field: "settledCents", code: "overSettled" });
    }
    // THE ADVANCE LEG, MIRRORED. `advanceCents` is a DERIVATION INPUT ONLY (this module's own N3
    // rule, exactly `settledCents`'s) and the control that holds it is shown only once an advance
    // account is chosen, so these two rules are 0194's own `_assert_adjustment_relationships`
    // arm for the payroll case, restated for the figure that never reaches the wire:
    //   `distinct`     — the advance leg repeats the expense or liability account (0194:
    //                     `v_adv in (v_exp, v_liab)`).
    //   `advance_leg`  — a staff-advance account is named but the entry would carry nothing on
    //                     it (0194: `_adjustment_net_cents(p_lines, v_adv) = 0`).
    if (draft.advanceAccountCode.trim() !== ""
        && (draft.advanceAccountCode.trim() === draft.expenseAccountCode.trim()
          || draft.advanceAccountCode.trim() === draft.liabilityAccountCode.trim())) {
      issues.push({ field: "advanceAccountCode", code: "accountsMustDiffer" });
    }
    if (!exact(draft.advanceCents)) issues.push({ field: "advanceCents", code: "amountNotExact" });
    else if (draft.advanceCents === 0 && draft.advanceAccountCode.trim() !== "") {
      issues.push({ field: "advanceCents", code: "advanceLegUnused" });
    } else if (exact(draft.amountCents) && draft.advanceCents > draft.amountCents) {
      issues.push({ field: "advanceCents", code: "overAdvanced" });
    }
    if (draft.particularsSource.trim() === "") issues.push({ field: "particularsSource", code: "required" });
    else if (draft.particularsSource.trim().length > PARTICULARS_SOURCE_MAX_CHARS) {
      issues.push({ field: "particularsSource", code: "tooLong" });
    }
  }

  if (draft.instruction.trim() === "") issues.push({ field: "instruction", code: "required" });
  else if (draft.instruction.trim().length > INSTRUCTION_MAX_CHARS) {
    issues.push({ field: "instruction", code: "tooLong" });
  }
  return issues;
}

export function firstInvalidAdjustmentField(issues: readonly AdjustmentIssue[]): AdjustmentFieldId | null {
  return issues[0]?.field ?? null;
}

/**
 * THE JOURNAL LINES THE PARTICULARS IMPLY.
 *
 * IT IS A DERIVATION, NOT A PROPOSAL. `clara._assert_adjustment_relationships` re-derives the same
 * relationship at admission and at commit and refuses a basis that does not say what the
 * particulars say (`adjustment_lines_mismatch`, the rung C-29 asks for). So this function and that
 * assertion are two statements of ONE contract, and a change to either without the other is caught
 * by the database rather than by a reviewer.
 *
 * THE STOCK DIRECTION IS THE SIGN'S: a rise DEBITS inventory and CREDITS the cost account; a fall
 * is its mirror. Nothing is rounded — the movement is already exact cents.
 *
 * THE PAYROLL SPLIT IS THE ACCOUNTANT'S: the expense leg carries the whole obligation, and the
 * credit side is the liability less whatever was carried on the staff-advance account and less
 * whatever was settled through the payment account.
 *
 * THE ADVANCE LEG'S AMOUNT IS DERIVED; ITS ALLOCATION IS NOT, AND CANNOT BE — the same split the
 * chat lane's `basisFromAdjustment` (`packages/runtime/lib/periodic-adjustment-basis.ts`) makes,
 * for the SAME reason: `clara._adv_on_approve` refuses a credit on an enrolled staff-advance
 * account that does not say WHICH advance it discharges, and `clara.book_staff_advance_application`
 * is the door that does. That is an ALLOCATION — a missing settlement fact this form does not
 * invent. The AMOUNT carried on the account is not: it is the same accountant's split that already
 * governs the payment leg, and a form that offers the account control without deriving what it
 * carries is exactly the gap `clara._assert_adjustment_relationships`'s `advance_leg` refusal
 * catches at admission (#643, named in the refresh wave's v19 report and closed here).
 */
export function derivedLines(draft: AdjustmentDraft): JournalDraftLine[] {
  if (draft.purpose === "periodic_stock_adjustment") {
    const movement = movementCents(draft) ?? 0;
    const abs = Math.abs(movement);
    const rose = movement > 0;
    return [
      {
        account_code: draft.inventoryAccountCode.trim(),
        debit_cents: rose ? abs : 0,
        credit_cents: rose ? 0 : abs,
        description: "stock movement",
      },
      {
        account_code: draft.costAccountCode.trim(),
        debit_cents: rose ? 0 : abs,
        credit_cents: rose ? abs : 0,
        description: "cost of sales",
      },
    ];
  }
  const settled = Number.isSafeInteger(draft.settledCents) ? draft.settledCents : 0;
  const advance = Number.isSafeInteger(draft.advanceCents) ? draft.advanceCents : 0;
  const amount = Number.isSafeInteger(draft.amountCents) ? draft.amountCents : 0;
  const lines: JournalDraftLine[] = [
    {
      account_code: draft.expenseAccountCode.trim(),
      debit_cents: amount,
      credit_cents: 0,
      description: draft.obligationKind,
    },
    {
      account_code: draft.liabilityAccountCode.trim(),
      debit_cents: 0,
      credit_cents: amount - settled - advance,
      description: "obligation",
    },
  ];
  // THE ADVANCE LEG, BEFORE THE SETTLEMENT LEG — the order the chat lane's own
  // `basisFromAdjustment` derives them in, so the two lanes produce the SAME lines for the SAME
  // particulars. 0194 only requires each NAMED leg to carry something; the order is this pair's
  // own, read the way an accountant states it: what is owed, what is carried on the advance, what
  // was paid.
  if (advance > 0 && draft.advanceAccountCode.trim() !== "") {
    lines.push({
      account_code: draft.advanceAccountCode.trim(),
      debit_cents: 0,
      credit_cents: advance,
      description: "staff advance",
    });
  }
  if (settled > 0 && draft.paymentAccountCode.trim() !== "") {
    lines.push({
      account_code: draft.paymentAccountCode.trim(),
      debit_cents: 0,
      credit_cents: settled,
      description: "settled",
    });
  }
  return lines;
}

/** The default memo the derived basis carries, shown on the form and editable there. */
export function defaultMemo(draft: AdjustmentDraft): string {
  return draft.purpose === "periodic_stock_adjustment"
    ? `Periodic stock adjustment ${draft.periodStart} to ${draft.periodEnd}`
    : `${draft.obligationKind} obligation ${draft.periodStart} to ${draft.periodEnd}`;
}

/** The wire `adjustment` object `POST /api/work/periodic-adjustment` takes — camelCase, only the
 *  keys of the ACTIVE half, and only the optional ones the preparer actually filled in. Returns
 *  null when the draft has not validated clean, for the reason `toJournalBasisWire` does: a wire
 *  body assembled from an invalid draft is exactly how a UI ends up asking the database to refuse
 *  something it could have caught. */
export function toAdjustmentWire(
  draft: AdjustmentDraft,
  knownAccountCodes: ReadonlySet<string> | null,
): Record<string, unknown> | null {
  if (validateAdjustmentDraft(draft, knownAccountCodes).length > 0) return null;
  const shared = {
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    instruction: draft.instruction.trim(),
  };
  if (draft.purpose === "periodic_stock_adjustment") {
    const out: Record<string, unknown> = {
      ...shared,
      method: draft.method,
      inventoryAccountCode: draft.inventoryAccountCode.trim(),
      costAccountCode: draft.costAccountCode.trim(),
      adjustmentCents: movementCents(draft) ?? 0,
    };
    if (draft.method === "opening_closing_count") {
      out.openingCents = draft.openingCents;
      out.closingCents = draft.closingCents;
    }
    if (draft.countedAt.trim() !== "") out.countedAt = draft.countedAt;
    if (draft.countReference.trim() !== "") out.countReference = draft.countReference.trim();
    return out;
  }
  const out: Record<string, unknown> = {
    ...shared,
    obligationKind: draft.obligationKind,
    expenseAccountCode: draft.expenseAccountCode.trim(),
    liabilityAccountCode: draft.liabilityAccountCode.trim(),
    amountCents: draft.amountCents,
    particularsSource: draft.particularsSource.trim(),
  };
  if (draft.advanceAccountCode.trim() !== "") out.advanceAccountCode = draft.advanceAccountCode.trim();
  if (draft.paymentAccountCode.trim() !== "") out.paymentAccountCode = draft.paymentAccountCode.trim();
  // #797 · THE STATED SETTLEMENT SPLIT, omitted when nothing was settled — exactly as an unfilled
  // payment account is. Migration 0212 refuses an explicit `0` beside a named payment account by
  // name, and a draft with neither has nothing to state, so sending `0` would be asking the
  // database to refuse something this module already caught.
  if (draft.settledCents > 0) out.settledCents = draft.settledCents;
  return out;
}

/**
 * THE WIRE'S OWN `field` STRING, mapped onto a control this form renders.
 *
 * ONE VOCABULARY CROSSES `POST /api/work/periodic-adjustment`'s 400, AND IT IS THE DATABASE'S —
 * the same law `lib/work/journal-basis.ts`'s `fieldForServerPath` states for the basis. Whether
 * the refusal came from `packages/runtime/src/workRoutes.ts`'s `toDbAdjustment` (the earlier,
 * cheaper half) or from migration 0194's `clara._assert_adjustment_basis` /
 * `clara._assert_adjustment_relationships` (the authority), the body is the same shape:
 *
 *     400 { "error": "invalid_basis", "field": "adjustment.<key>", "reason": <constraint|reason> }
 *
 * BOTH SPELLINGS OF ONE PATH ARE RECOGNISED, and that is not a second vocabulary. The database
 * raises `adjustment.period_end`; the route's `toWireField` re-spells it `adjustment.periodEnd`
 * (its ONE translation for this prefix) and its own earlier validation emits the camelCase form
 * directly. A refusal that arrived in the raw form must still land on the control rather than on
 * nothing — the identical reading `fieldForServerPath` gives `source_refs[N]` / `sourceRefs[N]`.
 *
 * `null` FOR ANYTHING ELSE, deliberately. `adjustment` and `purpose` are real wire paths with no
 * control of their own once a type is chosen, and an unrecognised key is a field a future build
 * added; all of them render as a form-level message carrying the server's own reason, which is
 * honest — instead of focusing whichever control happened to share a prefix.
 */
/**
 * EVERY KEY HERE IS A KEY THE SERVER CAN ACTUALLY NAME, and that is the whole claim this Set makes.
 * It is the intersection of `packages/runtime/src/workRoutes.ts`'s `ADJUSTMENT_STRINGS` /
 * `ADJUSTMENT_CENTS` tables and migration 0194's `clara._assert_adjustment_basis` /
 * `_assert_adjustment_relationships` field paths — measured, both halves, rather than mirrored from
 * this form's own control list.
 *
 * `settledCents` IS IN THIS SET SINCE #797, and `advanceCents` is still out — an asymmetry that is
 * deliberate rather than an oversight. Migration 0212 made `settled_cents` an OPTIONAL typed
 * particular of `clara._assert_adjustment_basis` and the route's `ADJUSTMENT_CENTS` table carries
 * the key, so refusals really do arrive on this path (`over_settled` and `payment_leg_unused` on
 * the figure, `settlement_needs_account` on the account) and a mapper that dropped them would leave
 * a server refusal landing on nothing. `advanceCents` has no such particular in either half: the
 * staff-advance allocation stays a client-side derivation input, because
 * `clara.staff_advance_accounts` and `book_staff_advance_application` are the authority on what a
 * movement on those accounts requires and a split this form invented would be a settlement fact
 * nobody stated (#797, Out of scope). Its LOCAL validation still names it — `validateAdjustmentDraft`
 * raises `advanceLegUnused` / `overAdvanced` against `advanceCents` and `firstInvalidAdjustmentField`
 * focuses it — because that is this form's own rule about its own control, which is a different
 * thing from a wire path. `advanceAccountCode` stays IN this Set for the original reason: it IS a
 * 0194 particular (`_assert_adjustment_basis` reads it, `_assert_adjustment_relationships` checks
 * the staff-advance enrolment), so a server refusal naming it must still land on this control.
 */
const ADJUSTMENT_FIELDS = new Set<string>([
  "periodStart", "periodEnd", "instruction", "method", "openingCents", "closingCents",
  "adjustmentCents", "countedAt", "countReference", "inventoryAccountCode", "costAccountCode",
  "obligationKind", "expenseAccountCode", "liabilityAccountCode", "advanceAccountCode",
  "paymentAccountCode", "amountCents", "particularsSource",
  // #797
  "settledCents",
  // #797 ends
]);

export function fieldForAdjustmentPath(path: string | null): AdjustmentFieldId | null {
  if (path === null || !path.startsWith("adjustment.")) return null;
  const key = path.slice("adjustment.".length);
  const camel = key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  return ADJUSTMENT_FIELDS.has(camel) ? (camel as AdjustmentFieldId) : null;
}

/**
 * #799 — A COMMIT-TIME REFUSAL'S OWN 1-BASED LINE ORDINAL, mapped onto the adjustment field that
 * produced it. Sibling to `fieldForAdjustmentPath` above, not a replacement for it: that function
 * resolves an ADMISSION-TIME wire path (`adjustment.<key>`) straight to a control; this one
 * resolves a COMMIT-TIME refusal, which — because it is raised by the shared chart-of-accounts
 * check at `clara._record_journal_entry_core` step 6, against the Work's already-admitted
 * `basis.lines`, not against the form — names only the bare ordinal (`lines[N].account_code`).
 *
 * THE ORDINAL IS 1-BASED, migration 0178's own indexing (`with ordinality`, `lines[i + 1]` in the
 * runtime, pinned by `journal-basis.test.ts`'s `lines[1]` as the FIRST row) — `lines[0]` never
 * occurs, so ordinal `0` and anything below it resolve to `null` here exactly like an ordinal past
 * the basis.
 *
 * THE LEG ORDER IS THE ONE `derivedLines` ABOVE AND THE CHAT LANE'S `basisFromAdjustment`
 * (`packages/runtime/lib/periodic-adjustment-basis.ts`) BOTH PRODUCE: stock adjustment is
 * inventory (1) then cost (2) — always exactly two legs, so any other ordinal is `null`. Obligation
 * is expense (1), liability (2), then the advance leg, then the settlement leg — BOTH CONDITIONAL,
 * appended only when their amount is positive and their account is named, so an ordinal alone
 * cannot tell a third leg apart from a fourth. `basisLines` — the Work's OWN `basis.lines`, already
 * admitted — is the discriminator instead of re-deriving anything: `derivedLines`'s own
 * `description`s for those two legs ("staff advance", "settled") are read straight off the line at
 * that ordinal, so a basis carrying only the advance leg, only the settlement leg, or both all
 * resolve correctly with no guessing about which one is missing.
 *
 * `null` for a `journal_entry` Work (no adjustment fields to translate into), for an ordinal the
 * basis does not reach, for an absent/empty `basisLines`, or for any shape this function does not
 * recognise — the generic line reference is the correct, honest fallback in every one of those
 * cases, exactly as `fieldForAdjustmentPath`'s own `null` case documents.
 */
export function fieldForAdjustmentLineOrdinal(
  ordinal: number,
  purpose: string,
  basisLines: ReadonlyArray<{ description?: string | null }> | null | undefined,
): AdjustmentFieldId | null {
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;

  if (purpose === "periodic_stock_adjustment") {
    if (ordinal === 1) return "inventoryAccountCode";
    if (ordinal === 2) return "costAccountCode";
    return null;
  }

  if (purpose === "payroll_obligation") {
    if (ordinal === 1) return "expenseAccountCode";
    if (ordinal === 2) return "liabilityAccountCode";
    const line = basisLines?.[ordinal - 1];
    if (line?.description === "staff advance") return "advanceAccountCode";
    if (line?.description === "settled") return "paymentAccountCode";
    return null;
  }

  return null;
}
