// #638 — THE STAFF-EXPENSE-CLAIM READS.
//
// THEY ARE RPCs, unlike `lib/work/reads.ts`'s plain filtered GETs, and the reason is the one that
// module gives for NOT introducing one: the authority story has to be whole. The history joins
// `clara.staff_expense_claims` to its committed `clara.operation_receipts` row and then to the
// posted entry's live state and reversal, and caps its own answer — three things a PostgREST filter
// chain would either re-derive in the browser or get subtly wrong. `clara.list_staff_expense_claims`
// and `clara.get_staff_expense_claim` (migration 0206) are viewer-floored, firm+client-scoped and
// capped at 500 in ONE place, so the browser never has to be trusted with any of it.
//
// THE ENROLMENT REGISTER IS READ DIRECTLY UNDER RLS, not through a wrapper. `clara.staff_advance_accounts`
// grants SELECT to `clara_authenticated` behind `firm_id = clara.jwt_firm()` (migration 0043), and
// the form needs exactly two columns of it to tell "this person already has an account" from "this
// is a new claimant who has to be enrolled". Wrapping a two-column read in a new door would be a
// second answer to a question the RLS policy already answers — the same rule DECISIONS §1.7 states
// for `clara.entry_evidence_links`.
//
// HYDRATE-NEVER-TRUST, as everywhere: these return only what the database SAID. Nothing here
// re-derives a state from a row's shape, and a malformed envelope THROWS rather than resolving to
// `[]` — an empty array is a real answer ("this client has recorded none"), and coercing a wire
// fault into it would turn "we could not read it" into an accounting claim. The callers render
// their own read-error state.

import { callDoor } from "@/lib/doors";
import { getRows } from "@/lib/read";
import { isUuidShape } from "@/lib/client-id";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** One itemised line, exactly as the commit stored it. `supplied_tax` is opaque: the estate has no
 *  tax vocabulary and #638 carries these facts rather than interpreting them. */
export type ClaimItemRow = {
  description: string;
  expense_account_code?: string | null;
  amount_cents?: number | null;
  supplied_tax?: Record<string, unknown> | null;
  incurred_date?: string | null;
  /** Non-null ⇒ this item is WAITING on the named fact and posted nothing. */
  pending_fact?: string | null;
};

/** One row of `clara.list_staff_expense_claims` — copied field-for-field from the function's own
 *  `row_to_json` projection. Every value is the database's; nothing is derived here. */
export type StaffExpenseClaimRow = {
  id: string;
  work_id: string;
  logical_op_id: string;
  claimant_enrolment_id: string;
  claimant_label: string;
  claimant_identifier: string | null;
  source_kind: "document" | "instruction";
  source_document_id: string | null;
  instruction: string;
  incurred_date: string;
  posting_date: string;
  items: ClaimItemRow[];
  amount_cents: number;
  currency: string;
  settlement: "reimbursement" | "advance_application" | "already_settled";
  payable_account_code: string | null;
  advance_account_code: string | null;
  payment_account_code: string | null;
  advance_id: string | null;
  corrects_claim_id: string | null;
  corrected_by_claim_id: string | null;
  recorded_by: string;
  on_behalf_of: string;
  created_at: string;
  /** Derived BY JOIN, never stored on the claim: null until the run has committed. */
  receipt_id: string | null;
  entry_id: string | null;
  entry_status: string | null;
  /** Non-null once the posted entry has been reversed — which is what makes a correction lawful. */
  reversed_by: string | null;
  pending_item_count: number;
};

/** One row of the claim's append-only status ledger. */
export type ClaimStatusRow = {
  state: "admitted" | "items_pending" | "posted" | "reversed";
  entry_id: string | null;
  receipt_id: string | null;
  detail: Record<string, unknown>;
  recorded_at: string;
};

/** `clara.get_staff_expense_claim`'s envelope: the row, its ledger, and the allocations the
 *  staff-advance register actually minted (read from the register's own rows, never from the
 *  claim's statement of intent). */
export type StaffExpenseClaimDetail = StaffExpenseClaimRow & {
  status: ClaimStatusRow[];
  advance_applications: Array<{
    id: string;
    advance_id: string;
    kind: string;
    amount_cents: number;
    effective_date: string;
    entry_id: string;
  }>;
};

/** Every staff expense claim this client has recorded, newest posting date first. The window is the
 *  DATABASE's filter, not a client-side slice: a row outside it is never sent. */
export async function listStaffExpenseClaims(
  clientId: string,
  window: { from?: string | null; to?: string | null } = {},
  opts: Opts = {},
): Promise<StaffExpenseClaimRow[]> {
  // A malformed id never reaches PostgREST — on a `uuid` argument it is HTTP 400 `22P02`, which
  // THROWS, and a throw on a route reaches the error boundary instead of the scoped not-found state
  // the page owns (lib/work/reads.ts states the same guard for the same defect).
  if (!isUuidShape(clientId)) return [];
  const out = await callDoor<unknown>(
    "list_staff_expense_claims",
    { p_client: clientId, p_from: window.from ?? null, p_to: window.to ?? null },
    opts,
  );
  if (!Array.isArray(out)) {
    throw new Error("list_staff_expense_claims did not answer with an array of rows");
  }
  return out as StaffExpenseClaimRow[];
}

/** ONE claim, with its status ledger and its advance lineage. `null` for a claim outside the
 *  caller's firm — the door's own honest answer, never a refusal that would be an existence oracle. */
export async function getStaffExpenseClaim(
  claimId: string,
  opts: Opts = {},
): Promise<StaffExpenseClaimDetail | null> {
  if (!isUuidShape(claimId)) return null;
  const out = await callDoor<unknown>("get_staff_expense_claim", { p_claim: claimId }, opts);
  if (out === null || out === undefined) return null;
  if (typeof out !== "object" || Array.isArray(out)) {
    throw new Error("get_staff_expense_claim did not answer with an object");
  }
  return out as StaffExpenseClaimDetail;
}

/** `clara.get_work_claim_origin`'s answer: what a `journal_entry` Work is, when it is a claim. */
export type WorkClaimOrigin = {
  claim_id: string;
  settlement: "reimbursement" | "advance_application" | "already_settled";
  claimant_enrolment_id: string;
  claimant_label: string;
  amount_cents: number;
  currency: string;
  incurred_date: string;
  posting_date: string;
  item_count: number;
  pending_item_count: number;
  corrects_claim_id: string | null;
  corrected_by_claim_id: string | null;
};

/**
 * THE CLAIM A WORK CARRIES, or null.
 *
 * WHY IT EXISTS AT ALL. A staff expense claim is admitted with purpose `journal_entry` — the
 * purpose vocabulary is deliberately unwidened, because a fourth value cannot post through the
 * estate's closed posting core (migration 0206's header states the measurement). So a Work detail
 * that labelled by purpose alone would call a claim "Journal entry" and stop there. This read is
 * how the surface says WHAT it actually is, without inventing a purpose value: the door
 * (`clara.get_work_claim_origin`, the `get_work_plan_origin` precedent) is viewer-floored and
 * firm-scoped, and it answers NULL for a Work that is not a claim — the honest answer, never a
 * fabricated origin.
 */
export async function getWorkClaimOrigin(
  workId: string,
  opts: Opts = {},
): Promise<WorkClaimOrigin | null> {
  if (!isUuidShape(workId)) return null;
  const out = await callDoor<unknown>("get_work_claim_origin", { p_work: workId }, opts);
  if (out === null || out === undefined) return null;
  if (typeof out !== "object" || Array.isArray(out)) {
    throw new Error("get_work_claim_origin did not answer with an object");
  }
  return out as WorkClaimOrigin;
}

/** One live staff-advance enrolment of this client. */
export type StaffAdvanceEnrolmentRow = {
  id: string;
  account_code: string;
  person_label: string;
};

/**
 * The client's LIVE staff-advance enrolments, read straight off `clara.staff_advance_accounts`
 * under its own RLS policy (migration 0043 grants SELECT to `clara_authenticated` behind
 * `firm_id = clara.jwt_firm()`).
 *
 * WHY THE FORM NEEDS IT. The claim door RESOLVES-OR-ENROLS: a code that already carries a live
 * enrolment is reused, and only a new one is enrolled — and enrolling needs a name, a written
 * attestation and an explicit "this account is dedicated to one person". Knowing which case the
 * preparer is in is what lets the form ask for those three BEFORE admission (#721's rule) instead
 * of after a refusal. A read failure returns `null`, and the form then asks for them whenever the
 * code is not blank — the conservative direction: asking for an attestation that turns out to be
 * unnecessary costs a sentence, and the door ignores it when the enrolment already exists.
 */
export async function listStaffAdvanceEnrolments(
  clientId: string,
  opts: Opts = {},
): Promise<StaffAdvanceEnrolmentRow[] | null> {
  if (!isUuidShape(clientId)) return [];
  try {
    return await getRows<StaffAdvanceEnrolmentRow>(
      `staff_advance_accounts?client_id=eq.${encodeURIComponent(clientId)}&active=is.true`
      + "&select=id,account_code,person_label&order=account_code.asc",
      opts,
    );
  } catch {
    // A read this form only uses to decide WHICH QUESTIONS TO ASK must never block the form. The
    // caller treats null as "unknown" and asks for the enrolment fields; the door is the authority
    // either way.
    return null;
  }
}
