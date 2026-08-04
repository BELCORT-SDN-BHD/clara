// resolve_and_book_bank_line's result shape AND its ONE admission predicate
// (Wave D-b, design `wave-d-b-design.md` §4; the builder ABI
// `wave-d-b-design-abi.md` §A) — the AF-2 composite. Split out of reconModel.ts
// (repo file-size discipline — the matchModel.ts/reconSnapshotModel.ts split
// precedent). PURE: zero network, zero React. The DB returns the SETTLE CORE's
// own envelope (THE CALLEE'S LIVE LAW per ABI §E — not duplicated here) PLUS
// the two named keys this UI actually branches on: `resolution_exception_id` +
// `branch` ('live' completes resolve+book in one transaction; 'pending' parks
// the declaration — the settlement leg only, G9). The callee's own fields ride
// through opaque (`raw`) for any caller that wants to render the settle receipt
// verbatim without this file guessing its shape.
//
// ═══ WHY `af2Admission` EXISTS — THE WALLED-CORRIDOR CLASS, THIRD RECURRENCE ═══
// The as-built ladder has now caught the same defect shape three rounds running:
// something PROMISED an outcome by re-deriving, by hand, the admission logic of
// the act that would actually deliver it — and the hand-derivation drifted. The
// dashboard's own instance was a button labelled "Declare only (high-stakes
// park)" that sent NEITHER `p_draft` NOR `p_allocations` and therefore refused
// EVERY click with CLR10 `booking_request_invalid` / axis `no_booking` (probed
// against 0042 sha a779171a on 2026-08-03; the verbatim DB reply is pinned in
// resolveBookModel.test.ts).
//
// A point-fix would repeat the mistake. The structural answer — the one this
// build already uses successfully twice DB-side (`_acct_role_reserved`: one
// reservation union, four readers; `_wdb_suggestion_lines`: one derivation,
// producer + approve-time validator) — is ONE BODY that answers "may this act be
// admitted, and if not why", read BY EVERYTHING THAT WANTS TO PROMISE THE
// OUTCOME. In this surface that is:
//   1. every control's enabled/disabled state and its promise copy
//      (ExceptionBookingFields), and
//   2. the wire caller itself (shared/reconApi.ts's resolveAndBookBankLine),
//      which refuses locally with the SAME token+axis rather than sending a
//      request its own UI has already declared inadmissible.
// One body, so the promise and the gate can never disagree with each other.
//
// ═══ WHAT IT DOES **NOT** PROMISE (read this before extending it) ═══
// `admitted: true` means EXACTLY: "this request carries no ARGUMENT-SHAPE defect
// that clara.resolve_and_book_bank_line refuses before it reads a single row".
// It is deliberately a STRICT SUBSET of the DB's law and it must stay one. It
// says nothing about, and must never be extended to guess at:
//   · the owner role floor · the exception existing / being open / being this
//   client's · the statement being live · whether the settlement is high-stakes
//   (`branch` is the DB's answer — this UI never predicts a park) · open-item
//   ownership, counterparty derivability, allocation capacity, group tie.
// The DB is the authority on every one of those and its refusal is rendered
// verbatim beside the local gloss. A predicate that tried to promise a park
// would be the same walled corridor wearing a new hat.

import type { SettleAllocationInput, BankAdjustmentInput } from "../shared/bankApi";

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

export type ResolveAndBookBankLineBranch = "live" | "pending" | string;

export type ResolveAndBookBankLineResult = {
  resolution_exception_id: string | null;
  branch: ResolveAndBookBankLineBranch;
  entry_id: string | null;
  raw: Record<string, unknown>;
};

export function toResolveAndBookBankLineResult(raw: unknown): ResolveAndBookBankLineResult {
  const o = rec(raw);
  return {
    resolution_exception_id: s(o.resolution_exception_id),
    branch: s(o.branch) ?? "live",
    entry_id: s(o.entry_id),
    raw: o,
  };
}

/** True once the DB has parked the declaration only (G9 high-stakes) — the
 *  UI must render the pending state, never a false "booked" confirmation. */
export function isParkedBranch(result: Pick<ResolveAndBookBankLineResult, "branch">): boolean {
  return result.branch === "pending";
}

// ---------------------------------------------------------------------------
// THE ADMISSION PREDICATE.
// ---------------------------------------------------------------------------

/** The two BOOKING dispositions the composite accepts. `bank_corrective_line`
 *  is a real disposition of the DIRECT verb and always refuses here. */
export const AF2_BOOKING_DISPOSITIONS = ["matched_booking", "written_off_adjustment"] as const;
export type Af2Disposition = (typeof AF2_BOOKING_DISPOSITIONS)[number];

/** Which of the composite's two legs a request is asking for. Derived from what
 *  the caller supplied — the verb takes no leg selector (`p_draft` ⇒ the
 *  hand-draft leg, `p_allocations` ⇒ the settlement leg). */
export type Af2Leg = "draft" | "settle";

export type Af2DraftInput = {
  posting_date: string;
  memo: string;
  lines: { account_code: string; debit_cents: number; credit_cents: number; description?: string | null }[];
  counterparty?: unknown;
  resolution?: string | null;
};

/** Exactly the caller-supplied surface of the composite. `p_client`/
 *  `p_exception`/`p_op_key` are omitted deliberately: they are identity, not
 *  shape, and the DB owns every statement about them. */
export type Af2Request = {
  disposition: string;
  note: string;
  draft?: Af2DraftInput | null;
  allocations?: readonly SettleAllocationInput[] | null;
  adjustments?: readonly BankAdjustmentInput[] | null;
  advanceApplications?: unknown | null;
  ackPeriodExceptions?: boolean;
  chargeCents?: number | null;
  chargeAccount?: string | null;
};

export type Af2Admission =
  | { admitted: true; leg: Af2Leg }
  | { admitted: false; leg: Af2Leg | null; reason: string; axis: string | null; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function no(reason: string, axis: string | null, message: string, leg: Af2Leg | null = null): Af2Admission {
  return { admitted: false, leg, reason, axis, message };
}

/** THE ONE BODY. Transcribed from clara.resolve_and_book_bank_line's ARGUMENT
 *  TIME block, IN ITS ORDER — the order is part of the law (a request naming
 *  BOTH a draft and allocations is `draft_and_allocations`, never `no_booking`),
 *  and every arm below is pinned by a red/green cell in resolveBookModel.test.ts.
 *
 *  Its messages are the DASHBOARD's, not the DB's: when the DB does answer, its
 *  own text is rendered verbatim (the KbRuleProposalCard law). These exist for
 *  the case where no call is made at all — a disabled control has to say why. */
export function af2Admission(req: Af2Request): Af2Admission {
  // (1) The disposition enum — validated at argument time on BOTH branches.
  if (!(AF2_BOOKING_DISPOSITIONS as readonly string[]).includes(req.disposition)) {
    return no("disposition_unsupported", null,
      "The composite books only 'matched to a booking' or 'written off'. A bank-corrective pair books nothing — close it with the direct resolve action.");
  }
  // (2) The note.
  if ((req.note ?? "").trim() === "") {
    return no("resolution_note_required", null, "A resolution note is required.");
  }

  const hasDraft = req.draft !== null && req.draft !== undefined;
  const allocations = req.allocations ?? null;
  const hasAllocations = Array.isArray(allocations) && allocations.length > 0;
  const allocationsNamed = allocations !== null && allocations !== undefined;

  // (3) Two bookings for one line.
  if (hasDraft && allocationsNamed) {
    return no("booking_request_invalid", "draft_and_allocations",
      "Name a hand-draft OR an open-item settlement, never both — they are two bookings for one statement line.");
  }
  // (4) No booking at all. THIS is the arm the dead "Declare only" button hit on
  //     every click: a park is not an act you can ask for, it is what the DB
  //     ANSWERS when the settlement leg it booked turns out to be high-stakes.
  if (!hasDraft && !hasAllocations) {
    return no("booking_request_invalid", "no_booking",
      "This act must book something: either hand-code an entry, or allocate the line against at least one open item. A high-stakes park is not a separate act — it is what the DB does with the SETTLEMENT leg when the amount is at or above the firm's threshold.");
  }

  if (hasDraft) {
    const draft = req.draft as Af2DraftInput;
    // (5) Settlement arguments on the hand-draft leg.
    const adj = req.adjustments ?? null;
    const chargeCents = req.chargeCents ?? 0;
    if ((Array.isArray(adj) && adj.length > 0) || chargeCents !== 0
        || (req.chargeAccount !== null && req.chargeAccount !== undefined && req.chargeAccount !== "")) {
      return no("booking_request_invalid", "settle_argument_on_draft_leg",
        "Difference adjustments and the bank charge belong to the settlement leg — a hand-draft states its own lines.", "draft");
    }
    // (6) The draft's own shape.
    if (!Array.isArray(draft.lines) || draft.lines.length === 0
        || (draft.posting_date ?? "").trim() === "") {
      return no("booking_request_invalid", "draft_malformed",
        "A hand-draft needs a posting date, a memo and at least one line.", "draft");
    }
    return { admitted: true, leg: "draft" };
  }

  // (7) The advance proposal names line_no positions INSIDE p_draft.lines, so it
  //     requires the hand-draft leg.
  if (req.advanceApplications !== null && req.advanceApplications !== undefined) {
    return no("booking_request_invalid", "advance_payload_without_draft",
      "A staff-advance repayment is coded, not settled against open items — its allocations name line positions inside a hand-draft.", "settle");
  }
  // (7b) [round 8] The period-exception acknowledgement is a draft-leg argument too — the
  //      settlement leg posts at the statement line's own entry_date, which is inside the
  //      period by construction, so there is nothing to acknowledge. Only TRUE is refused:
  //      an explicit `false` asserts nothing and binds exactly as omitting it does
  //      (byte-mirror of the composite's own arm).
  if (req.ackPeriodExceptions === true) {
    return no("booking_request_invalid", "ack_without_draft",
      "A posting-date acknowledgement belongs to a hand-draft, whose date you choose — the settlement leg posts at the statement line's own date, which is inside the period by construction.", "settle");
  }
  // (8) Allocation shape. Two honesty notes, because this is the ONE arm that is
  //     not a byte-for-byte mirror:
  //     · The DB raises `allocations_malformed` AFTER it has read the exception
  //       and its line, so on a bad exception id ITS refusal comes first. This
  //       predicate has no view of that and never claims to.
  //     · The DB's own test at that site is the item_id UUID regex ALONE, while
  //       its message states the full rule ("an item_id and a positive whole
  //       amount_cents") which the allocate core then enforces further in. The
  //       bound below is the verb's STATED rule, i.e. very slightly tighter than
  //       its regex — deliberately, and safely: the only producer of these
  //       arrays already drops non-positive rows, so no lawful act is walled
  //       out, and the copy names exactly what to change. Anything tighter than
  //       this would be rebuilding the corridor in reverse.
  const bad = (allocations ?? []).some(
    (a) => !UUID_RE.test(String(a?.item_id ?? "")) || !Number.isInteger(a?.amount_cents) || (a?.amount_cents ?? 0) <= 0,
  );
  if (bad) {
    return no("allocations_malformed", null,
      "Each allocation must name an open item and a positive whole number of cents.", "settle");
  }
  return { admitted: true, leg: "settle" };
}

/** The admission answer as ONE line of copy for a disabled control — so a
 *  control that cannot act always says why, in the same words the refusal would
 *  have used. Null when the request IS admissible. */
export function af2AdmissionBlockReason(req: Af2Request): string | null {
  const a = af2Admission(req);
  return a.admitted ? null : a.message;
}
