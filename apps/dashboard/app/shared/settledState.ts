// Terminal-state hydration (Wave A2.1 contract §6.1). Today's get_draft_review
// filters status='draft' and returns SQL NULL for a settled entry — the card must
// NEVER fabricate a review from that (the "unknown"/RM 0.00 shell bug). There is NO
// client-side bridge to a terminal state: no writer records a terminal revision
// (approve/withdraw UPDATE journal_entries only — 0009:1672/1898), so a revision
// walk always ends 'draft' and can prove nothing. A TRUE terminal receipt therefore
// comes ONLY from a hydrated non-draft status — the 0016 CoR's slim settled payload
// ({entry:{status, approved_at|withdrawn_at, …}}); until it ships, a settled card
// resolves to the honest "can no longer be loaded" shell. All statuses, actors and
// timestamps here are DB-returned verbatim; nothing is computed client-side.

import type { DraftReview } from "../chat/review";

/** The terminal state of a settled entry, as the DB reported it (slim payload). */
export type SettledState = {
  status: string; // 'approved' | 'withdrawn' | … (DB vocabulary, verbatim)
  at: string | null; // entry.approved_at / entry.withdrawn_at, when present
  actor: string | null; // entry.checker_actor / entry.withdrawn_by, when present
  reason: string | null; // entry.withdrawal_reason, when present
};

/** How a je_review/doc_review hydration resolved (§6.1):
 *  - draft   — a live draft (or a defensively-degraded payload): render as today.
 *  - settled — a hydrated non-draft status (the 0016 slim settled payload): render
 *              the true terminal receipt.
 *  - gone    — hydration returned null (today's DB for ANY settled entry, or a
 *              scope/visibility miss): render the honest shell — no status claim,
 *              NEVER a fabricated one. */
export type ReviewResolution =
  | { kind: "draft"; review: DraftReview }
  | { kind: "settled"; review: DraftReview; settled: SettledState }
  | { kind: "gone" };

/** A hydrated non-draft status ⇒ settled, carrying the DB's terminal metadata
 *  (approved_at/checker_actor, withdrawn_at/withdrawn_by/withdrawal_reason) when
 *  the payload provides it. The defensive 'unknown' (a key-rename degradation in
 *  toDraftReview, NOT a DB status) is excluded — that payload still carries real
 *  data and must render as today (visible lines, actions disabled), never a false
 *  terminal receipt. */
export function settledFromReview(review: DraftReview): SettledState | null {
  if (review.status === "draft" || review.status === "unknown") return null;
  const withdrawn = review.withdrawn_at !== null || review.withdrawn_by !== null || review.withdrawal_reason !== null;
  return {
    status: review.status,
    at: review.approved_at ?? review.withdrawn_at,
    actor: withdrawn ? review.withdrawn_by : review.checker_actor,
    reason: review.withdrawal_reason,
  };
}

/** Resolve a hydration outcome (PURE — the async glue lives in the cards): a
 *  hydrated draft → draft; a hydrated non-draft status (the 0016 slim settled
 *  payload) → settled; null → gone DIRECTLY. No fallback fetch exists — a null
 *  hydration is unprovable client-side, so the card renders the honest shell. */
export function resolveReviewHydration(review: DraftReview | null): ReviewResolution {
  if (review === null) return { kind: "gone" };
  const settled = settledFromReview(review);
  return settled ? { kind: "settled", review, settled } : { kind: "draft", review };
}

/** Terminal-receipt wording, keyed on the DB status. 'approved'/'withdrawn' are the
 *  single source for the in-session outcome receipt too (JeReviewCard); an
 *  unforeseen settled status renders honestly by name. */
export function settledReceiptCopy(status: string): string {
  if (status === "approved") return "Approved — the entry is posted with filing-bound provenance.";
  if (status === "withdrawn") return "Draft discarded.";
  return `Settled — ${status}.`;
}

/** The honest shell for a null hydration: claims NOTHING it cannot prove — a null
 *  may be a settled entry (pre-0016) or a plain scope/visibility miss. */
export const REVIEW_GONE_COPY = "This review can no longer be loaded from chat — check the entry in the review queue.";
