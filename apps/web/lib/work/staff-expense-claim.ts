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
 * ONE LINE OF THE CONFIRMED ALLOCATION LIST (#931): WHICH open advance this claim discharges, and
 * how many sen of it.
 *
 * `amountCents` IS IGNORED WHILE THERE IS ONLY ONE LINE. A claim settled against a single advance
 * puts the WHOLE claim on it, so asking a preparer to retype a total the form already knows would
 * be a second statement of one figure — exactly the drift `claimTotalCents` exists to prevent. The
 * amount column appears the moment a second line does.
 */
export type ClaimAllocationDraft = {
  advanceId: string;
  amountCents: number;
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
  /** #931 — THE CONFIRMED ALLOCATION LIST, whole and in the order the preparer confirmed. Its FIRST
   *  line is #930's advance chooser (the control still called `advanceId`), so a claim that names
   *  one advance is a one-line list and nothing about that case moved. */
  advanceAllocations: ClaimAllocationDraft[];
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
    advanceAllocations: [emptyClaimAllocation()],
    paymentAccountCode: "",
  };
}

export function emptyClaimAllocation(): ClaimAllocationDraft {
  return { advanceId: "", amountCents: 0 };
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
  // #931 — the FIRST line of the allocation list keeps #930's own control id, so a refusal about
  // "which advance" lands where it always did; every later line addresses its own two controls.
  | "advanceId"
  | "advanceAllocations"
  | `advanceAllocations.${number}.advanceId`
  | `advanceAllocations.${number}.amountCents`
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
  | "advanceDuplicated"
  | "allocationsNotExact"
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

/**
 * HAS THIS LIST BEEN APPORTIONED? — true once the preparer has said how the claim is divided, and
 * that is a property of the ROWS, not of how many there are.
 *
 * A LIST OF TWO OR MORE always apportions: every line carries its own share. A LIST OF ONE
 * apportions only when its row already holds a figure — which happens when a split was suggested
 * or typed and then taken back to one line, never on the untouched chooser #930 renders (its row
 * is minted at zero).
 *
 * ONE READER for that question, because two surfaces act on it: `claimAllocations` decides whether
 * the figure is the row's own or the claim's, and the form decides whether the amount column is on
 * screen. They must never disagree, or a figure is submitted that was never shown.
 */
export function allocationsAreApportioned(rows: readonly ClaimAllocationDraft[]): boolean {
  if (rows.length > 1) return true;
  const only = rows[0];
  return only !== undefined && Number.isSafeInteger(only.amountCents) && only.amountCents > 0;
}

/**
 * THE EFFECTIVE ALLOCATION LIST — what the claim actually discharges, with the UNAPPORTIONED
 * one-line case's amount DERIVED from the claim rather than typed.
 *
 * ONE READER, so the wire, the validation and the rendered summary can never disagree about how
 * many sen a line carries.
 *
 * WHY AN APPORTIONED ONE-LINE LIST KEEPS ITS OWN FIGURE. Deleting the second line of a confirmed
 * split leaves ONE line carrying the share that line was confirmed with. Handing it the whole
 * claim instead would restate a figure the preparer agreed to, silently and with no amount on
 * screen — and #881's ruling is that the stored record is ALWAYS the confirmed list. What it
 * leaves is a list that does not add up, which `validateClaimDraft` says out loud, exactly as it
 * does for a suggestion the claimant's advances cannot cover.
 */
export function claimAllocations(draft: ClaimDraft): ClaimAllocationDraft[] {
  const rows = draft.advanceAllocations;
  if (rows.length <= 1) {
    const only = rows[0];
    if (only !== undefined && allocationsAreApportioned(rows)) {
      return [{ advanceId: only.advanceId.trim(), amountCents: only.amountCents }];
    }
    return [{ advanceId: only?.advanceId.trim() ?? "", amountCents: claimTotalCents(draft) }];
  }
  return rows.map((r) => ({
    advanceId: r.advanceId.trim(),
    amountCents: Number.isSafeInteger(r.amountCents) ? r.amountCents : 0,
  }));
}

/** The control that holds allocation line `index`: the first line IS #930's chooser. */
export function allocationFieldId(index: number, key: "advanceId" | "amountCents"): ClaimFieldId {
  if (index === 0 && key === "advanceId") return "advanceId";
  return `advanceAllocations.${index}.${key}` as ClaimFieldId;
}

/**
 * THE ONE-CLICK DATE-ORDERED SUGGESTION (#881's owner ruling): the claimant's open advances,
 * OLDEST FIRST, each taking as much of the claim as it still has outstanding, until the claim is
 * settled.
 *
 * IT IS A SUGGESTION, NOT A DECISION. The person may edit any line and must confirm; what is
 * stored is the confirmed list, which is what keeps WD-R10's "no silent FIFO" true — the ordering
 * is offered on screen, never applied behind the preparer.
 *
 * WHEN THE ADVANCES CANNOT COVER THE CLAIM it names everything outstanding and stops, so the
 * shortfall is visible as a list that does not add up. Inventing the difference, or silently
 * trimming the claim, would be the form deciding something only the preparer can.
 *
 * A TIE ON `issue_date` IS BROKEN BY `advance_id`, so the same claim suggests the same split on
 * every machine.
 */
export function suggestAllocationsByDate(
  candidates: ReadonlyArray<{ advance_id: string; issue_date: string; outstanding_cents: number }>,
  totalCents: number,
): ClaimAllocationDraft[] {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return [];
  const ordered = [...candidates]
    .filter((c) => Number.isSafeInteger(c.outstanding_cents) && c.outstanding_cents > 0)
    .sort((a, b) => (a.issue_date === b.issue_date
      ? a.advance_id.localeCompare(b.advance_id)
      : a.issue_date.localeCompare(b.issue_date)));
  const out: ClaimAllocationDraft[] = [];
  let remaining = totalCents;
  for (const c of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(c.outstanding_cents, remaining);
    out.push({ advanceId: c.advance_id, amountCents: take });
    remaining -= take;
  }
  return out;
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
  if (draft.settlement === "advance_application") {
    // #931 — THE CONFIRMED ALLOCATION LIST. Every rule here mirrors one migration 0301 enforces:
    // each line names an advance (NO SILENT FIFO, WD-R10), no advance is named twice, every line
    // of a split is real money, and a split adds up to the claim TO THE CENT.
    const rows = claimAllocations(draft);
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      if (!UUID_RE.test(row.advanceId)) {
        issues.push({ field: allocationFieldId(i, "advanceId"), code: "advanceRequired" });
      } else if (seen.has(row.advanceId)) {
        issues.push({ field: allocationFieldId(i, "advanceId"), code: "advanceDuplicated" });
      } else {
        seen.add(row.advanceId);
      }
      // The one-line case's amount is DERIVED, so there is no control to complain about.
      if (rows.length === 1) return;
      if (!Number.isSafeInteger(row.amountCents) || row.amountCents < 0) {
        issues.push({ field: allocationFieldId(i, "amountCents"), code: "amountNotExact" });
      } else if (row.amountCents === 0) {
        issues.push({ field: allocationFieldId(i, "amountCents"), code: "amountRequired" });
      }
    });
    // …AND IT ADDS UP TO THE CLAIM, whatever its length. An UNAPPORTIONED one-line list is the
    // whole claim by construction, so this can only bite a list the preparer apportioned — a
    // split that is short, or a split taken back to one line that no longer covers the claim.
    if (rows.reduce((n, r) => n + (Number.isSafeInteger(r.amountCents) ? r.amountCents : 0), 0)
        !== claimTotalCents(draft)) {
      issues.push({ field: "advanceAllocations", code: "allocationsNotExact" });
    }
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
 * (migration 0221) performs inside the door, and the same one
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
export function derivedLines(
  draft: ClaimDraft,
  /** #1066 — the SAME advance_id → real-account lookup `toClaimWire` takes, so the preview never
   *  shows a different posting than the door will actually make. `null`/omitted (every pre-#1066
   *  caller) resolves every allocation to the claim's own typed `advanceAccountCode`, collapsing
   *  to the single leg this function always produced. */
  advanceAccountCodes: ReadonlyMap<string, string> | null = null,
): JournalDraftLine[] {
  const lines: JournalDraftLine[] = draft.items
    .filter((i) => !isPendingItem(i))
    .map((item) => ({
      account_code: item.expenseAccountCode.trim(),
      debit_cents: Number.isSafeInteger(item.amountCents) ? item.amountCents : 0,
      credit_cents: 0,
      description: item.description.trim().slice(0, ITEM_DESCRIPTION_MAX_CHARS),
    }));
  if (draft.settlement === "advance_application") {
    // #1066 — ONE CREDIT LEG PER ADVANCE ACCOUNT, mirroring `clara._claim_journal_basis`'s own
    // widening (migration 0301) exactly: each confirmed allocation's REAL account (falling back to
    // the claim's own head account when unknown), summed per account, in ACCOUNT-CODE ORDER — the
    // same grouping `packages/db/tests/staff-expense-claim-allocations.test.mjs`'s own
    // `allocatedBasis` helper computes as the independent expected shape for `p931.accounts`. A
    // single-account claim (every allocation resolves to the same account) collapses to exactly
    // the one leg this function always produced.
    const rows = claimAllocations(draft);
    const headAccount = advanceAccountCodes?.get(rows[0]?.advanceId ?? "") ?? draft.advanceAccountCode.trim();
    const byAccount = new Map<string, number>();
    for (const r of rows) {
      const code = advanceAccountCodes?.get(r.advanceId) ?? headAccount;
      byAccount.set(code, (byAccount.get(code) ?? 0) + r.amountCents);
    }
    for (const code of [...byAccount.keys()].sort()) {
      lines.push({
        account_code: code, debit_cents: 0, credit_cents: byAccount.get(code)!,
        description: draft.settlement,
      });
    }
    return lines;
  }
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
  /** #1066 — advance_id → the account it REALLY sits on, the caller's own `staff_advance_summary`
   *  read (never guessed here). `null`/omitted is every pre-#1066 caller, and resolves every row
   *  to the claim's own typed `advanceAccountCode`, byte-identical to before this ticket. */
  advanceAccountCodes: ReadonlyMap<string, string> | null = null,
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
    const rows = claimAllocations(draft);
    // THE HEAD fills `clara.staff_expense_claims.advance_id`, which is NOT NULL for this settlement.
    out.advanceId = rows[0]?.advanceId ?? "";
    // #1066 — `claim.advance_account_code` FOLLOWS THE HEAD'S REAL ACCOUNT, never the raw typed
    // field. `clara._assert_claim_basis` (0340) refuses a claim whose `advance_account_code`
    // disagrees with the confirmed list's own first entry (`packages/db/tests/
    // staff-expense-claim-allocations.test.mjs`'s own `allocClaim` helper states the same rule:
    // `advanceAccountCode: allocations[0].account_code ?? SECHART.advance`). Every claim before
    // this ticket could only ever choose an advance on the typed account, so the head's real
    // account and the typed one were always the same value; this is that equality made explicit
    // rather than assumed. Unknown (`advanceAccountCodes` omitted, or the head's id not in it)
    // falls back to the typed field, byte-identical to before.
    const headAccount = advanceAccountCodes?.get(rows[0]?.advanceId ?? "") ?? draft.advanceAccountCode.trim();
    out.advanceAccountCode = headAccount;
    // A ONE-LINE LIST IS THE SINGLE-ADVANCE CLAIM, and it crosses exactly as it did before #931 —
    // the door normalises `advance_id` into the same one-element list either way, so sending the
    // key would be a second spelling of one claim. (A lone advance on a SECOND account needs no
    // list either: `advanceAccountCode` above already carries its real account.)
    if (rows.length > 1) {
      out.advanceAllocations = rows.map((r) => {
        const one: Record<string, unknown> = { advanceId: r.advanceId, amountCents: r.amountCents };
        // #1066 — STATED ONLY WHEN THIS ROW SITS ON A DIFFERENT ACCOUNT THAN THE HEAD.
        // `clara._claim_allocations` (0301) defaults a bare row's account to the claim's own
        // `advance_account_code`, so a row that already matches the head needs no restating —
        // the SAME "the caller decides, the door defaults" shape 0301 already documents.
        const code = advanceAccountCodes?.get(r.advanceId);
        if (code !== undefined && code !== headAccount) one.accountCode = code;
        return one;
      });
    }
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
 * cheaper half) or from migration 0221's `clara._assert_claim_basis` (the authority), the body is
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
  "payableAccountCode", "advanceAccountCode", "advanceId", "advanceAllocations",
  "paymentAccountCode",
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

  // #931 — `claim.advance_allocations[N].<key>`, 1-based on the wire like the items. The FIRST line
  // is #930's own chooser, so `[1].advance_id` lands on `advanceId` rather than on a control the
  // list editor does not render for its head.
  const allocation = /^advance_?[Aa]llocations\[(\d+)\](?:\.(.+))?$/.exec(rest);
  if (allocation) {
    const index = Number(allocation[1]) - 1;
    if (!Number.isInteger(index) || index < 0) return null;
    if (allocation[2] === undefined) return "advanceAllocations";
    const key = camel(allocation[2]);
    if (key !== "advanceId" && key !== "amountCents") return null;
    return allocationFieldId(index, key);
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
