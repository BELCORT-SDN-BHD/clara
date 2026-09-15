// #638 — THE STAFF-EXPENSE-CLAIM FORM'S OWN VALIDATION AND DERIVATION: pure functions over a
// draft, no React, no DB, no fetch. Split out of the form for the reason
// `lib/work/periodic-adjustment.ts` gives for its own split: a rule about MONEY that lives inside a
// render body is a rule nobody can test without a DOM.
//
// WHAT THIS IS NOT. It is not the authority on whether a claim may be admitted.
// `clara.admit_staff_expense_claim_work` revalidates every rule below at admission (the payload
// half before anything durable, the world half after the replay branch) and
// `clara.wake_record_journal_entry` revalidates the accounting ones AGAIN at commit, against the
// client's live chart, the live staff-advance register and the live fiscal years — which is why
// this module deliberately does not attempt the four checks it could only guess at: is the item
// account still an ACTIVE EXPENSE account, is the payable a control account, is the claimant's
// enrolment live, can the named advance carry this allocation. It exists so a preparer sees a
// mistake beside the field that holds it instead of as a refusal thirty seconds later, and every
// rule here is a MIRROR of one the database enforces, never a rule of its own.
//
// NOTHING HERE INVENTS A FACT. #638's first acceptance line is explicit: "do not invent payroll
// documents or missing dates." The ONE arithmetic this module does is adding the itemised amounts
// up, and it is derived only so the form can show the accounting fact the claim produces and so
// the total and the settlement leg agree to the cent.
//
// TAX FACTS ARE CARRIED, NEVER VALIDATED. There is no tax vocabulary in this estate (migration
// 0150 calls the statutory tag a hint; `docs/PRD.md:124` defers tax preparation), and AC1 asks only
// that supplied facts be carried. The form offers a free-text note per item and sends it verbatim.
//
// THE ACCOUNT DEFAULTS ARE AN OFFER, NOT A CLAIM. `DEFAULT_PAYABLE_ACCOUNT_CODE` names the starter
// chart's own `2010 Other Payables` — a NON-CONTROL liability, because an employee may not be a
// counterparty and money owed to one may not sit on a control account. The form fills the field
// with it, SHOWS that it did, and lets the preparer change it; nothing is submitted that a human
// did not see.

import type { JournalDraftLine, JournalFieldId } from "./journal-basis";

export const CLAIM_SETTLEMENTS = ["reimbursement", "advance_application", "already_settled"] as const;
export type ClaimSettlement = (typeof CLAIM_SETTLEMENTS)[number];

export const CLAIM_SOURCE_KINDS = ["document", "instruction"] as const;
export type ClaimSourceKind = (typeof CLAIM_SOURCE_KINDS)[number];

/** The starter chart's NON-CONTROL "Other Payables" (migration 0150). Offered, shown, editable. */
export const DEFAULT_PAYABLE_ACCOUNT_CODE = "2010";

export const INSTRUCTION_MAX_CHARS = 4000;
export const ITEM_DESCRIPTION_MAX_CHARS = 2000;
export const PERSON_LABEL_MAX_CHARS = 200;
export const ATTESTATION_MAX_CHARS = 2000;
export const IDENTIFIER_MAX_CHARS = 120;
export const PENDING_FACT_MAX_CHARS = 120;

/**
 * ONE ITEMISED LINE of the draft.
 *
 * `pendingFact` is AC3's per-item continuation, designed inside one claim (#636 defers aggregate
 * progress ACROSS works, not this): an item that names the fact it is still waiting for carries no
 * amount, posts no line, and is recorded on the claim's status ledger so the surface can say WHICH
 * item is waiting and WHY. Guessing the missing fact is what the whole lane refuses to do.
 */
export type ClaimItemDraft = {
  description: string;
  expenseAccountCode: string;
  amountCents: number;
  /** Opaque supplied tax facts, in the claimant's own words. Carried; validated against nothing. */
  suppliedTaxNote: string;
  /** This item's own date when it differs from the claim's. Empty means "the claim's". */
  incurredDate: string;
  /** Non-empty ⇒ the item is WAITING and posts nothing. */
  pendingFact: string;
};

/**
 * ONE FLAT DRAFT HOLDING EVERY SETTLEMENT'S HALF, and that is the "preserved draft" rule rather
 * than a shortcut (appendix D #46: a Radio Group switch that discards what was typed is a control
 * that punishes a correction). The settlement switch changes which half is READ, validated and
 * submitted; it does not discard the others.
 */
export type ClaimDraft = {
  settlement: ClaimSettlement;
  // — the claimant —
  claimantEnrolmentId: string;
  claimantAccountCode: string;
  claimantPersonLabel: string;
  claimantAttestation: string;
  claimantConfirmDedicated: boolean;
  claimantIdentifier: string;
  // — the claim —
  sourceKind: ClaimSourceKind;
  instruction: string;
  incurredDate: string;
  postingDate: string;
  items: ClaimItemDraft[];
  // — the settlement legs, one per arm —
  payableAccountCode: string;
  advanceAccountCode: string;
  advanceId: string;
  paymentAccountCode: string;
};

export function emptyClaimItem(): ClaimItemDraft {
  return {
    description: "",
    expenseAccountCode: "",
    amountCents: 0,
    suppliedTaxNote: "",
    incurredDate: "",
    pendingFact: "",
  };
}

export function emptyClaimDraft(): ClaimDraft {
  return {
    settlement: "reimbursement",
    claimantEnrolmentId: "",
    claimantAccountCode: "",
    claimantPersonLabel: "",
    claimantAttestation: "",
    claimantConfirmDedicated: false,
    claimantIdentifier: "",
    sourceKind: "instruction",
    instruction: "",
    incurredDate: "",
    postingDate: "",
    items: [emptyClaimItem()],
    payableAccountCode: DEFAULT_PAYABLE_ACCOUNT_CODE,
    advanceAccountCode: "",
    advanceId: "",
    paymentAccountCode: "",
  };
}

/**
 * The address of the control an issue belongs beside — a STRING, not an index, for the reason
 * `JournalFieldId` states: the form uses it as the element `id` it focuses and as the
 * `aria-describedby` target, so a rule cannot name a field the form does not render.
 */
export type ClaimFieldId =
  | "settlement"
  | "claimantAccountCode"
  | "claimantPersonLabel"
  | "claimantAttestation"
  | "claimantConfirmDedicated"
  | "claimantIdentifier"
  | "sourceKind"
  | "instruction"
  | "incurredDate"
  | "postingDate"
  | "items"
  | `items.${number}.description`
  | `items.${number}.expenseAccountCode`
  | `items.${number}.amountCents`
  | `items.${number}.incurredDate`
  | `items.${number}.pendingFact`
  | "payableAccountCode"
  | "advanceAccountCode"
  | "advanceId"
  | "paymentAccountCode";

/** Either vocabulary — this form focuses controls from both. */
export type ClaimFormFieldId = ClaimFieldId | JournalFieldId;

export type ClaimIssueCode =
  | "required"
  | "invalidDate"
  | "incurredAfterPosting"
  | "accountRequired"
  | "accountUnknown"
  | "accountsMustDiffer"
  | "amountRequired"
  | "amountNotExact"
  | "pendingItemHasAmount"
  | "everyItemPending"
  | "attestationRequired"
  | "confirmDedicatedRequired"
  | "advanceRequired"
  | "tooLong";

export type ClaimIssue = { field: ClaimFieldId; code: ClaimIssueCode };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** An item that is waiting on a named fact posts nothing and counts nothing. */
export function isPendingItem(item: ClaimItemDraft): boolean {
  return item.pendingFact.trim() !== "";
}

/** The claim's exact total in minor units: the non-pending items, added up. ONE reader, so the
 *  submitted total, the derived credit leg and the preview can never disagree. */
export function claimTotalCents(draft: ClaimDraft): number {
  return draft.items
    .filter((i) => !isPendingItem(i))
    .reduce((n, i) => n + (Number.isSafeInteger(i.amountCents) ? i.amountCents : 0), 0);
}

/** The ONE account this settlement credits, and the control that holds it. */
export function settlementAccountCode(draft: ClaimDraft): string {
  if (draft.settlement === "reimbursement") return draft.payableAccountCode.trim();
  if (draft.settlement === "advance_application") return draft.advanceAccountCode.trim();
  return draft.paymentAccountCode.trim();
}

export function settlementFieldId(settlement: ClaimSettlement): ClaimFieldId {
  if (settlement === "reimbursement") return "payableAccountCode";
  if (settlement === "advance_application") return "advanceAccountCode";
  return "paymentAccountCode";
}

/**
 * Every issue in the draft, IN DOM ORDER — the settlement, the claimant, the dates, the items, the
 * settlement leg, then the instruction. The order is the contract: the form focuses
 * `issues[0].field`, and "the FIRST invalid field" only means anything if this list is in the order
 * a human reads the form.
 *
 * `knownAccountCodes` is the client's ACTIVE chart. `null` means the chart could not be read — and
 * then the unknown-account rule is SKIPPED rather than guessed, exactly as the journal composer
 * skips it: refusing every account because a read failed would block a preparer over the UI's own
 * problem, and the commit rechecks each code against the live chart anyway.
 *
 * `enrolledAccountCodes` is the set of codes that already carry a LIVE staff-advance enrolment.
 * `null` means that register could not be read, and then the enrol-fields rule is skipped for the
 * same reason. When it IS known and the chosen code is NOT in it, the form asks for the three
 * things 0043's register requires before it will enrol somebody — by name, before admission
 * (#721's rule), because the enrolment happens inside the admission transaction and no later
 * question could repair a Work admitted without them.
 */
export function validateClaimDraft(
  draft: ClaimDraft,
  knownAccountCodes: ReadonlySet<string> | null,
  enrolledAccountCodes: ReadonlySet<string> | null = null,
): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  const account = (field: ClaimFieldId, code: string, required: boolean) => {
    const trimmed = code.trim();
    if (trimmed === "") {
      if (required) issues.push({ field, code: "accountRequired" });
      return;
    }
    if (knownAccountCodes !== null && !knownAccountCodes.has(trimmed)) {
      issues.push({ field, code: "accountUnknown" });
    }
  };

  // ---- the claimant -------------------------------------------------------------------------
  const claimantCode = draft.claimantAccountCode.trim();
  if (draft.claimantEnrolmentId.trim() === "") {
    account("claimantAccountCode", draft.claimantAccountCode, true);
    const known = enrolledAccountCodes !== null && claimantCode !== "";
    const alreadyEnrolled = known && enrolledAccountCodes.has(claimantCode);
    if (claimantCode !== "" && !alreadyEnrolled) {
      if (draft.claimantPersonLabel.trim() === "") {
        issues.push({ field: "claimantPersonLabel", code: "required" });
      } else if (draft.claimantPersonLabel.trim().length > PERSON_LABEL_MAX_CHARS) {
        issues.push({ field: "claimantPersonLabel", code: "tooLong" });
      }
      if (draft.claimantAttestation.trim() === "") {
        issues.push({ field: "claimantAttestation", code: "attestationRequired" });
      } else if (draft.claimantAttestation.trim().length > ATTESTATION_MAX_CHARS) {
        issues.push({ field: "claimantAttestation", code: "tooLong" });
      }
      if (draft.claimantConfirmDedicated !== true) {
        issues.push({ field: "claimantConfirmDedicated", code: "confirmDedicatedRequired" });
      }
    }
  }
  if (draft.claimantIdentifier.trim().length > IDENTIFIER_MAX_CHARS) {
    issues.push({ field: "claimantIdentifier", code: "tooLong" });
  }

  // ---- the two dates ------------------------------------------------------------------------
  for (const field of ["incurredDate", "postingDate"] as const) {
    const value = draft[field];
    if (value.trim() === "") issues.push({ field, code: "required" });
    else if (!isCalendarDate(value)) issues.push({ field, code: "invalidDate" });
  }
  // AFTER both, and only when both are real dates: "the money was spent after it was booked" is not
  // something to say about a field a human has not finished typing.
  if (isCalendarDate(draft.incurredDate) && isCalendarDate(draft.postingDate)
      && draft.incurredDate > draft.postingDate) {
    issues.push({ field: "incurredDate", code: "incurredAfterPosting" });
  }

  // ---- the itemisation ----------------------------------------------------------------------
  if (draft.items.length < 1) issues.push({ field: "items", code: "required" });
  let live = 0;
  draft.items.forEach((item, i) => {
    const at = (key: string) => `items.${i}.${key}` as ClaimFieldId;
    if (item.description.trim() === "") issues.push({ field: at("description"), code: "required" });
    else if (item.description.trim().length > ITEM_DESCRIPTION_MAX_CHARS) {
      issues.push({ field: at("description"), code: "tooLong" });
    }
    if (item.incurredDate.trim() !== "" && !isCalendarDate(item.incurredDate)) {
      issues.push({ field: at("incurredDate"), code: "invalidDate" });
    }
    if (isPendingItem(item)) {
      if (item.pendingFact.trim().length > PENDING_FACT_MAX_CHARS) {
        issues.push({ field: at("pendingFact"), code: "tooLong" });
      }
      // A waiting item may not also claim an amount: the database refuses it, and the honest
      // reading is that its own facts are not established yet.
      if (Number.isSafeInteger(item.amountCents) && item.amountCents !== 0) {
        issues.push({ field: at("amountCents"), code: "pendingItemHasAmount" });
      }
      return;
    }
    live += 1;
    account(at("expenseAccountCode"), item.expenseAccountCode, true);
    if (!Number.isSafeInteger(item.amountCents) || item.amountCents < 0) {
      issues.push({ field: at("amountCents"), code: "amountNotExact" });
    } else if (item.amountCents === 0) {
      issues.push({ field: at("amountCents"), code: "amountRequired" });
    }
  });
  if (draft.items.length >= 1 && live === 0) {
    issues.push({ field: "items", code: "everyItemPending" });
  }

  // ---- the settlement's ONE credit leg -------------------------------------------------------
  const legField = settlementFieldId(draft.settlement);
  account(legField, settlementAccountCode(draft), true);
  if (draft.settlement === "advance_application" && !UUID_RE.test(draft.advanceId.trim())) {
    // NO SILENT FIFO (WD-R10): a claim says WHICH advance it discharges.
    issues.push({ field: "advanceId", code: "advanceRequired" });
  }
  const credit = settlementAccountCode(draft);
  if (credit !== "" && draft.items.some((i) => !isPendingItem(i) && i.expenseAccountCode.trim() === credit)) {
    issues.push({ field: legField, code: "accountsMustDiffer" });
  }

  if (draft.instruction.trim() === "") issues.push({ field: "instruction", code: "required" });
  else if (draft.instruction.trim().length > INSTRUCTION_MAX_CHARS) {
    issues.push({ field: "instruction", code: "tooLong" });
  }
  return issues;
}

export function firstInvalidClaimField(issues: readonly ClaimIssue[]): ClaimFieldId | null {
  return issues[0]?.field ?? null;
}

/**
 * THE JOURNAL LINES THE CLAIM IMPLIES — the same derivation `clara._claim_journal_basis`
 * (migration 0206) performs inside the door, and the same one
 * `packages/runtime/lib/staff-expense-claim-basis.ts`'s `basisFromClaim` performs for the chat lane.
 *
 * IT IS A PREVIEW, NOT A PROPOSAL. The browser never sends lines: the door takes the claim and
 * derives the journal itself, precisely so the lines can never be a second, drifting statement of
 * the same claim. This function exists so the preparer SEES the accounting fact their particulars
 * produce before they admit it.
 *
 * `already_settled` IS NOT "no journal": the expense debits land against the stated payment
 * account. A settlement producing one leg is a refusal, not a shortcut.
 */
export function derivedLines(draft: ClaimDraft): JournalDraftLine[] {
  const lines: JournalDraftLine[] = draft.items
    .filter((i) => !isPendingItem(i))
    .map((item) => ({
      account_code: item.expenseAccountCode.trim(),
      debit_cents: Number.isSafeInteger(item.amountCents) ? item.amountCents : 0,
      credit_cents: 0,
      description: item.description.trim().slice(0, ITEM_DESCRIPTION_MAX_CHARS),
    }));
  lines.push({
    account_code: settlementAccountCode(draft),
    debit_cents: 0,
    credit_cents: claimTotalCents(draft),
    description: draft.settlement,
  });
  return lines;
}

/** The memo the derived basis carries. It is the INSTRUCTION — the claim's basis in words. */
export function defaultMemo(draft: ClaimDraft): string {
  return draft.instruction.trim().slice(0, INSTRUCTION_MAX_CHARS);
}

/**
 * The wire `claim` object `POST /api/work/staff-expense-claim` takes — camelCase, only the keys of
 * the ACTIVE settlement, and only the optional ones the preparer actually filled in. Returns null
 * when the draft has not validated clean, for the reason `toJournalBasisWire` does: a wire body
 * assembled from an invalid draft is exactly how a UI ends up asking the database to refuse
 * something it could have caught.
 *
 * `amountCents` IS NOT SENT. The route derives the total from the non-pending items and the
 * database refuses any claim whose items do not sum to it, so there is exactly one honest value and
 * a browser-supplied one could only ever disagree with it.
 */
export function toClaimWire(
  draft: ClaimDraft,
  knownAccountCodes: ReadonlySet<string> | null,
  enrolledAccountCodes: ReadonlySet<string> | null = null,
): Record<string, unknown> | null {
  if (validateClaimDraft(draft, knownAccountCodes, enrolledAccountCodes).length > 0) return null;
  const claimant: Record<string, unknown> = {};
  if (draft.claimantEnrolmentId.trim() !== "") claimant.enrolmentId = draft.claimantEnrolmentId.trim();
  if (draft.claimantAccountCode.trim() !== "") claimant.accountCode = draft.claimantAccountCode.trim();
  if (draft.claimantPersonLabel.trim() !== "") claimant.personLabel = draft.claimantPersonLabel.trim();
  if (draft.claimantAttestation.trim() !== "") claimant.attestation = draft.claimantAttestation.trim();
  if (draft.claimantConfirmDedicated) claimant.confirmDedicated = true;
  if (draft.claimantIdentifier.trim() !== "") claimant.identifier = draft.claimantIdentifier.trim();

  const out: Record<string, unknown> = {
    claimant,
    sourceKind: draft.sourceKind,
    instruction: draft.instruction.trim(),
    incurredDate: draft.incurredDate,
    postingDate: draft.postingDate,
    items: draft.items.map((item) => {
      const one: Record<string, unknown> = { description: item.description.trim() };
      if (isPendingItem(item)) {
        one.pendingFact = item.pendingFact.trim();
      } else {
        one.expenseAccountCode = item.expenseAccountCode.trim();
        one.amountCents = item.amountCents;
      }
      if (item.suppliedTaxNote.trim() !== "") one.suppliedTax = { note: item.suppliedTaxNote.trim() };
      if (item.incurredDate.trim() !== "") one.incurredDate = item.incurredDate;
      return one;
    }),
    settlement: draft.settlement,
  };
  if (draft.settlement === "reimbursement") out.payableAccountCode = draft.payableAccountCode.trim();
  if (draft.settlement === "advance_application") {
    out.advanceAccountCode = draft.advanceAccountCode.trim();
    out.advanceId = draft.advanceId.trim();
  }
  if (draft.settlement === "already_settled") out.paymentAccountCode = draft.paymentAccountCode.trim();
  return out;
}

/**
 * THE WIRE'S OWN `field` STRING, mapped onto a control this form renders.
 *
 * ONE VOCABULARY CROSSES `POST /api/work/staff-expense-claim`'s 400, AND IT IS THE DATABASE'S —
 * the same law `lib/work/journal-basis.ts`'s `fieldForServerPath` states for the basis and
 * `lib/work/periodic-adjustment.ts`'s `fieldForAdjustmentPath` restates for the particulars.
 * Whether the refusal came from `packages/runtime/src/workRoutes.ts`'s `toDbClaim` (the earlier,
 * cheaper half) or from migration 0206's `clara._assert_claim_basis` (the authority), the body is
 * the same shape:
 *
 *     400 { "error": "invalid_basis", "field": "claim.<key>", "reason": <constraint|reason> }
 *
 * BOTH SPELLINGS OF ONE PATH ARE RECOGNISED, and that is not a second vocabulary: the database
 * raises `claim.incurred_date`, the route's `toWireField` re-spells it `claim.incurredDate`, and
 * its own earlier validation emits the camelCase form directly. A refusal that arrived in the raw
 * form must still land on the control rather than on nothing.
 *
 * THE ITEM PATHS ARE 1-BASED ON THE WIRE AND 0-BASED IN THE DOM, because SQL's `with ordinality`
 * counts from one and this form iterates a JavaScript array. The arithmetic happens HERE and
 * nowhere else.
 *
 * `null` FOR ANYTHING ELSE, deliberately: `claim` itself is a real wire path with no control of its
 * own, and an unrecognised key is a field a future build added. Both render as a form-level message
 * carrying the server's own reason, which is honest — instead of focusing whichever control
 * happened to share a prefix.
 */
const CLAIM_FIELDS = new Set<string>([
  "settlement", "sourceKind", "instruction", "incurredDate", "postingDate", "items",
  "payableAccountCode", "advanceAccountCode", "advanceId", "paymentAccountCode",
]);
const CLAIMANT_FIELDS = new Set<string>([
  "accountCode", "personLabel", "attestation", "confirmDedicated", "identifier",
]);
const CLAIM_ITEM_FIELDS = new Set<string>([
  "description", "expenseAccountCode", "amountCents", "incurredDate", "pendingFact",
]);

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

export function fieldForClaimPath(path: string | null): ClaimFieldId | null {
  if (path === null || !path.startsWith("claim.")) return null;
  const rest = path.slice("claim.".length);

  // `claim.claimant` (the whole handle) has no single control; `claim.claimant.<key>` does.
  if (rest === "claimant") return "claimantAccountCode";
  // `claim.amount_cents` HAS NO CONTROL OF ITS OWN, and that is the design rather than a gap: this
  // form never sends a total — the door derives it from the itemisation. Every refusal the database
  // raises against it (`claim_all_zero`, `items_do_not_sum`, and the advance arm's
  // `advance_allocation_mismatch` over-application) is about the ITEMS, so it lands on the item
  // block a preparer would have to change.
  if (rest === "amount_cents" || rest === "amountCents") return "items";
  if (rest.startsWith("claimant.")) {
    const key = camel(rest.slice("claimant.".length));
    if (!CLAIMANT_FIELDS.has(key)) return null;
    return `claimant${key.charAt(0).toUpperCase()}${key.slice(1)}` as ClaimFieldId;
  }

  const item = /^items\[(\d+)\](?:\.(.+))?$/.exec(rest);
  if (item) {
    const index = Number(item[1]) - 1;          // 1-based on the wire, 0-based in the DOM
    if (!Number.isInteger(index) || index < 0) return null;
    if (item[2] === undefined) return "items";
    const key = camel(item[2]);
    if (!CLAIM_ITEM_FIELDS.has(key)) return null;
    return `items.${index}.${key}` as ClaimFieldId;
  }

  const key = camel(rest);
  return CLAIM_FIELDS.has(key) ? (key as ClaimFieldId) : null;
}
