// The /bank matching workspace — pure model, split out of model.ts (repo file-size
// discipline). PURE: zero network, zero React. Continues model.ts's numbering — the
// design citations below are the SAME design (docs/plan/completed/wave-c-b-bank-design.md +
// -part2.md); every function here is a CLIENT-SIDE PREVIEW of an identity the DB
// enforces under lock at write time (part1 §3/§4.5/§4.6) — never the authority.

import type { BankStatementLineRow, MatchCandidateEntryRow } from "./model";

// ---------------------------------------------------------------------------
// Selection model for the matching workspace (design part1 §4.6 / part2 §4.7):
// "open items by counterparty · candidate entries with per-side remaining capacity
// · charge/adjustment slots". A generic toggle set (the queue toggleSelect idiom)
// plus the group-tie PREVIEW the workspace uses to enable/disable the submit
// action and the period-exception checkbox before the DB is ever asked.
// ---------------------------------------------------------------------------

export function toggleInSet<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

export type EntryAllocation = { entry_id: string; matched_cents: number };
export type BankAdjustment = { account_code: string; amount_cents: number };

export function upsertEntryAllocation(
  list: readonly EntryAllocation[],
  entryId: string,
  matchedCents: number,
): EntryAllocation[] {
  const i = list.findIndex((a) => a.entry_id === entryId);
  if (matchedCents === 0) return list.filter((a) => a.entry_id !== entryId);
  const next = { entry_id: entryId, matched_cents: matchedCents };
  if (i < 0) return [...list, next];
  return list.map((a, idx) => (idx === i ? next : a));
}

export function removeEntryAllocation(list: readonly EntryAllocation[], entryId: string): EntryAllocation[] {
  return list.filter((a) => a.entry_id !== entryId);
}

/** design §4.6: the group-tie identity (§3) is Σ member lines = Σ member entries +
 *  Σ adjustments, exact to the sen. A client-side PREVIEW only — the group-tie belt
 *  is the authority. */
export type GroupTiePreview = {
  lineSum: number;
  entrySum: number;
  adjustmentSum: number;
  diffCents: number;
  ties: boolean;
};

/** Parse a human money string ("1,234.56") into integer cents WITHOUT floating point on
 *  the write path -- the DB owns every number, and a float dollar intermediate can corrupt
 *  the cents before the DB ever sees them (the as-built Codex-wave finding). Returns 0 for
 *  anything unparseable, mirroring the old `Number(...) || 0` tolerance. */
/** Money input accepts digits, one dot with AT MOST two decimals, an optional leading
 *  minus — deliberately NOT the full `<input type="number">` grammar (`1e3` reads as 0,
 *  like any other garbage) and never a silent truncation (`1.999` is REJECTED to 0, not
 *  read as 199 — the sen is the atom, a third decimal is user error, delta-review round 2).
 *  A zeroed amount cannot post: the tie preview shows a non-zero diff and the DB
 *  re-derives the same sum and refuses, so the narrowing is a UX bound, not a money hazard. */
export function parseCentsInput(text: string): number {
  const t = String(text ?? "").replace(/[,\s]/g, "");
  const m = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(t);
  if (!m || (m[2] === "" && !m[3])) return 0;
  const sign = m[1] === "-" ? -1n : 1n;
  const whole = BigInt(m[2] || "0");
  const frac = BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  const cents = sign * (whole * 100n + frac);
  const asNumber = Number(cents);
  return Number.isSafeInteger(asNumber) ? asNumber : 0;
}

export function matchGroupTiePreview(
  selectedLines: readonly BankStatementLineRow[],
  entryAllocations: readonly EntryAllocation[],
  adjustments: readonly BankAdjustment[],
): GroupTiePreview {
  const lineSum = selectedLines.reduce((sum, l) => sum + l.amount_cents, 0);
  const entrySum = entryAllocations.reduce((sum, a) => sum + a.matched_cents, 0);
  const adjustmentSum = adjustments.reduce((sum, a) => sum + a.amount_cents, 0);
  const diffCents = lineSum - (entrySum + adjustmentSum);
  return { lineSum, entrySum, adjustmentSum, diffCents, ties: diffCents === 0 };
}

/** design §4.6 `wrong_period`: a member ENTRY whose posting_date falls after the
 *  statement's period_end is not a structural refusal — it is a recorded,
 *  acknowledged exception (`p_ack_period_exceptions`). This is the client-side
 *  detector that decides whether the ack checkbox must be shown/required BEFORE the
 *  DB is asked; the DB re-derives the same fact and is the authority. */
export function entryIsPeriodException(
  entryPostingDate: string | null,
  statementPeriodEnd: string,
): boolean {
  if (!entryPostingDate) return false;
  return entryPostingDate > statementPeriodEnd;
}

export function anyPeriodException(
  entries: readonly MatchCandidateEntryRow[],
  selectedEntryIds: readonly string[],
  statementPeriodEnd: string,
): boolean {
  const chosen = new Set(selectedEntryIds);
  return entries.some((e) => chosen.has(e.entry_id) && entryIsPeriodException(e.posting_date, statementPeriodEnd));
}

// ---------------------------------------------------------------------------
// settle_from_bank_line's domain law (design §4.6): "Domain from the counterparty's
// KIND, never the cash sign — sign is validated as consistency after". A pure
// PREVIEW of that law so the workbench can show the sanctioned workaround BEFORE
// submitting a call the DB will refuse `refund_not_supported`.
// ---------------------------------------------------------------------------

export type SettlementDomain = "receipt" | "payment" | "refund_not_supported";

export function settlementDomainFor(counterpartyKind: "customer" | "vendor", lineAmountCents: number): SettlementDomain {
  const inflow = lineAmountCents > 0; // design §4.2: + = into the account
  if (counterpartyKind === "customer") return inflow ? "receipt" : "refund_not_supported";
  return inflow ? "refund_not_supported" : "payment";
}

export const REFUND_WORKAROUND_MESSAGE =
  "This counterparty/direction pair is a refund — settle_from_bank_line does not support it directly " +
  "(design §4.6). Workaround: post a generic entry with a counterparty-stamped control leg, let C-a mint " +
  "the adjustment open item, apply_open_items against the residue, then match_bank_line the line to that " +
  "entry.";

/** The same law as ONE line of blocking copy for a submit control.
 *
 *  [merge gate PR #184, finding 2] Stating the workaround is not enough on its
 *  own: the AF-2 settlement sub-form showed REFUND_WORKAROUND_MESSAGE and left
 *  its submit ENABLED, so the moment an allocation existed the surface offered a
 *  call it had ALREADY told the user the DB refuses by name. That is the
 *  walled-corridor shape in reverse — a control that promises an outcome its own
 *  copy denies — and this repo's answer is always the same: the control is
 *  blocked and says why, in the words of the refusal. */
export const REFUND_SUBMIT_BLOCKED_MESSAGE =
  "A refund cannot be settled here: settle_from_bank_line refuses this counterparty/direction pair by " +
  "name (`refund_not_supported`), so this control stays blocked rather than sending a call the DB is " +
  "certain to refuse. Use the workaround stated above, or switch the quadrant.";

/** Null when the quadrant is lawful; the blocking copy when it is a refund.
 *  `lineAmountCents` null = the DB gave this exception no amount to judge the
 *  quadrant against, so nothing is claimed and nothing is blocked — the DB
 *  remains the authority either way. */
export function refundSubmitBlock(
  counterpartyKind: "customer" | "vendor",
  lineAmountCents: number | null,
): string | null {
  if (lineAmountCents === null) return null;
  return settlementDomainFor(counterpartyKind, lineAmountCents) === "refund_not_supported"
    ? REFUND_SUBMIT_BLOCKED_MESSAGE
    : null;
}

// ---------------------------------------------------------------------------
// Refusal-reason copy (the KbRuleProposalCard idiom: the CLR badge rides ALONGSIDE
// the DB's verbatim message, never in place of it — this only adds a friendlier
// gloss for the taxonomy the design names verbatim, part1 §4.3/§4.6). An unnamed
// token still renders — via the caller's own `err.reason` — just without a gloss.
// ---------------------------------------------------------------------------

export const BANK_REFUSAL_COPY: Record<string, string> = {
  // ingest (part1 §4.3 fail_statement_facts taxonomy)
  header_unreadable: "The statement's printed header (institution, account, period, opening/closing) could not be read independently — re-scan or enter it by hand.",
  totals_unreadable: "The printed TOTAL DEBIT / TOTAL CREDIT could not be read — the mandatory cross-check failed.",
  readers_disagree: "The two readers did not corroborate the same header/lines — this statement was not persisted.",
  chain_broken: "opening + Σ(line amounts) ≠ closing for this statement.",
  continuity_mismatch: "This statement's opening does not match the adjacent statement's closing.",
  duplicate_period: "A live statement already covers this exact period for this account.",
  overlapping_period: "This period overlaps a live statement already on this account.",
  non_myr_statement: "This statement is not in MYR — multi-currency is a later wave.",
  account_unregistered: "No bank account is registered for this institution/account number yet.",
  account_inactive: "The matching bank account is deactivated — reactivate it to resume ingest.",
  statement_multi_client: "This document is filed to more than one client — a statement needs exactly one.",
  period_invalid: "period_start must not be after period_end.",
  line_date_out_of_period: "A line's entry_date falls outside the statement's period.",
  consent_inactive: "Statement-extraction consent is not active for this client yet.",
  // matching (part1 §4.6)
  wrong_account: "An entry with no movement on this account, or a line/account mismatch.",
  wrong_period: "A member line's statement is not live.",
  amount_beyond_tolerance: "The group does not tie and no adjustment covers the gap (tolerance is zero).",
  already_matched: "This line or entry side is already fully committed to another group.",
  reversed_entry: "A reversed entry cannot be a match member.",
  reversal_mirror: "A reversal mirror cannot be a match member.",
  adjustment_account_invalid: "The adjustment account must be active, non-control, expense- or income-typed, and not the bank account itself.",
  live_bank_match_present: "This entry is a live match member — unmatch first.",
  // settle_from_bank_line
  refund_not_supported: REFUND_WORKAROUND_MESSAGE,
  bank_account_invalid: "The settlement account must be an active, asset-typed, non-control account on this chart.",
  control_account_invalid: "That control account is not an active account of the right class for this client.",
  ar_control_not_unique: "This client has more than one active receivable control account — name one explicitly.",
  ap_control_not_unique: "This client has more than one active payable control account — name one explicitly.",
  allocations_malformed: "Each allocation must state an item_id and a positive whole amount_cents.",
  allocations_duplicated: "The same open item appears twice in one allocation set.",
  allocations_exceed_receipt: "The allocations exceed the settlement amount (plus any discount/charge).",
  amount_invalid: "The amount must be a positive whole number of cents.",
  // Wave C-c tie-out (design v2.1 §5) — complete/void_bank_reconciliation.
  recon_prior_missing: "No prior reconciliation is on record — a first-period exemption must be claimed explicitly.",
  recon_period_gap: "A prior statement's period is missing from the chain — a gap month must be filled before this one can complete.",
  recon_line_unsettled: "Not every line of this statement is a live match member or under an open exception yet.",
  recon_line_reserved: "A pending match reservation is still open on a line — complete or cancel it first.",
  recon_difference_nonzero: "The §3 identity does not close to zero on the stored terms.",
  recon_opening_mismatch: "The opening anchor does not tie to the prior receipt's closing (or the takeover carry-down).",
  recon_outstanding_stale: "An outstanding item is older than 60 days and has not been acknowledged by id.",
  recon_coa_shared: "More than one bank account shares this COA code with a live statement — remap before completing.",
  recon_uncleared_off_account: "A pre-cutover opening item's entry carries no leg on a registered bank-account COA.",
  statement_not_live: "This statement is not live (it was voided or superseded).",
  recon_already_complete: "This statement already has a complete reconciliation.",
  recon_chain_order: "Reconciliations must be voided newest-first — this is not the tail of the chain.",
  recon_already_void: "This reconciliation is already void.",
  recon_period_settled: "This line's period is already reconciled — void the recon chain back to correct it.",
  recon_frontier_backfill: "This statement's period is earlier than the account's earliest complete reconciliation.",
  reason_required: "A reason is required for this action.",
  // Wave C-c — except_bank_line / resolve_bank_line_exception.
  line_already_matched: "This line is already a live match member — it cannot be excepted.",
  line_already_excepted: "This line already has an open exception.",
  line_excepted: "This line has an open exception — resolve it before matching.",
  already_resolved: "This exception is already resolved.",
  resolution_note_required: "A resolution note is required.",
  disposition_unbooked: "The 'matched to a booking' disposition requires the line to be a live match member.",
  // Wave C-c — propose/sign/retire_bank_rule. F-A3 (Annex I): the bank-rules
  // learn loop RETIRED WHOLE — no live verb can raise these four anymore.
  // Kept here as dead history alongside clara.bank_rules itself (KEEP-AS-
  // HISTORY, Annex I), never re-wired to a new caller.
  rule_evidence_insufficient: "Fewer than 3 congruent sightings back this pattern yet — the DB re-derives the count.",
  rule_pattern_already_signed: "A signed rule already covers this exact pattern.",
  rule_not_proposed: "This rule is not in the proposed state.",
  rule_not_signed: "This rule is not signed (or already retired).",
  // Wave C-c — set_counterparty_terms.
  terms_out_of_range: "Payment terms must be between 1 and 365 days.",
  // Wave D-b (design §4/§5, ABI §F) — resolve_and_book_bank_line / the flip /
  // the reopen / (F-A3 retired) accept_bank_rule_suggestion.
  disposition_unsupported: "The AF-2 composite only books 'matched to a booking' or 'written off' — use the direct resolve action for a bank-corrective pair.",
  // [round-3 fix] `booking_request_invalid` was raised on SIX distinct axes and
  // glossed on NONE, so the dead "declare only" button showed a raw token. It is
  // one token with several remedies, so the AXIS carries the copy (below) and
  // this base gloss only ever shows when the DB omits an axis.
  booking_request_invalid: "The composite could not tell which booking was meant — name a hand-draft or an open-item settlement, not both and not neither.",
  pending_branch_ancillary_unsupported: "This exception is high-stakes — the composite can only DECLARE the resolution here; a distinct checker flips it via 'complete'.",
  pending_resolution_stale: "This declaration is no longer current — reload and re-declare.",
  exception_reopen_blocked: "A newer exception is already open on this line — the reopen cannot proceed.",
  // accept_bank_rule_suggestion RETIRED whole with the bank-rules learn loop
  // (F-A3, Annex I) — kept as dead history, same posture as the rule_* block above.
  suggestion_outstanding: "A rule suggestion is already drafted-or-approved-and-unmatched for this line.",
  suggestion_stale: "This suggestion no longer re-matches (the rule, the line, or the statement has changed) — reload and re-check.",
  approve_key_collision: "A derived approval key already resolved to a different outcome — reload before retrying.",
};

/** [round-3 fix] Some governed refusals carry a second discriminant — an AXIS —
 *  beside the reason, because one token covers several distinct mistakes with
 *  several distinct remedies (the 0041 `disposal_request_invalid` precedent the
 *  AF-2 composite follows). Keyed `"<reason>/<axis>"`; an axis with no entry
 *  falls back to the reason's own base gloss, never to nothing. */
export const BANK_REFUSAL_AXIS_COPY: Record<string, string> = {
  "booking_request_invalid/draft_and_allocations":
    "Name a hand-draft OR an open-item settlement, never both — that is two bookings for one statement line.",
  "booking_request_invalid/no_booking":
    "This act must book something: hand-code an entry, or allocate the line against at least one open item. A high-stakes park is not a separate act — it is what the DB does with the settlement leg when the amount is at or above the firm's threshold.",
  "booking_request_invalid/settle_argument_on_draft_leg":
    "Difference adjustments and the bank charge belong to the settlement leg — a hand-draft states its own lines.",
  "booking_request_invalid/draft_malformed":
    "The hand-draft needs a posting date, a memo and at least one line.",
  "booking_request_invalid/advance_payload_without_draft":
    "A staff-advance repayment is coded, not settled against open items — its allocations name line positions inside a hand-draft.",
  "booking_request_invalid/allocation_counterparty_underivable":
    "None of the open items named carries a counterparty this client owns, so the settlement has no counterparty to settle with.",
  "pending_branch_ancillary_unsupported/draft":
    "A high-stakes HAND-DRAFT cannot be parked — only a settlement can, and nothing was written: the draft rolled back with the refusal. No v1 door books a high-stakes hand-draft against an open bank-line exception in one act; the DB's own message names what is admitted in this state (it measures it first). Render it verbatim.",
  "booking_request_invalid/ack_without_draft":
    "The settlement leg posts at the statement line's own entry_date, which is inside the period by construction — there is no posting-date exception to acknowledge. Send the acknowledgement only with a hand-draft.",
  "pending_branch_ancillary_unsupported/ancillaries":
    "This settlement is high-stakes, so it parks the settlement leg ONLY — book the bank charge and any difference adjustments as their own acts after a checker flips the group.",
};

/** The reason's gloss, sharpened by the AXIS when the DB reported one. Callers
 *  that never learned about axes keep working unchanged (the parameter is
 *  optional and absent ⇒ the base gloss). */
export function describeBankRefusal(reason: string | null | undefined, axis?: string | null): string | null {
  if (!reason) return null;
  if (axis) {
    const sharp = BANK_REFUSAL_AXIS_COPY[`${reason}/${axis}`];
    if (sharp) return sharp;
  }
  return BANK_REFUSAL_COPY[reason] ?? null;
}

/** The AXIS discriminant rides in the SAME exception DETAIL object as the
 *  reason (`{"reason": …, "axis": …}`), which shared/wire.ts surfaces raw as
 *  `PgrestError.pgDetails`. Defensive parse — the reason parser's twin. */
export function parseRefusalAxis(details: string | null | undefined): string | null {
  if (!details) return null;
  try {
    const j = JSON.parse(details) as { axis?: unknown };
    return typeof j.axis === "string" ? j.axis : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Five-screen-state selector (DIRECTION §4.5 — the queue/model.ts precedent,
// generic here so both the accounts panel and the statements list share it).
// ---------------------------------------------------------------------------

export type ScreenState = "loading" | "error" | "empty" | "partial" | "ideal";

export function bankScreenState(env: { loading: boolean; error: boolean; totalRows: number }): ScreenState {
  if (env.error && env.totalRows === 0) return "error";
  if (env.loading && env.totalRows === 0) return "loading";
  if (env.totalRows === 0) return "empty";
  return "ideal";
}

// ---------------------------------------------------------------------------
// COA picker filters (design §4.6 adjustment account; §4.1 the bank account itself
// is asset-typed non-control). Pure predicates over accounts/accountsModel's
// AccountRow shape (structurally compatible — this module does not import it, to
// keep /bank's model free of a cross-lane dependency; the shapes are kept in sync
// by the shared coa_accounts columns).
// ---------------------------------------------------------------------------

export type CoaAccountLike = {
  account_code: string;
  name: string;
  account_type: string;
  account_class: string | null;
  is_active: boolean;
};

/** design §4.1: the bank leg must be active, asset-typed, non-control. */
export function isEligibleBankCoaAccount(a: CoaAccountLike): boolean {
  return a.is_active && a.account_type === "asset" && a.account_class === null;
}

/** design §4.6: an adjustment account must be active, non-control, expense- or
 *  income-typed, and (checked by the caller, who knows the bank account code) not
 *  the bank account itself. */
export function isEligibleAdjustmentCoaAccount(a: CoaAccountLike): boolean {
  return a.is_active && a.account_class === null && (a.account_type === "expense" || a.account_type === "income");
}
