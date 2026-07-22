// Terminal-state hydration (Wave A2.1 contract §6.1). Today's get_draft_review
// filters status='draft' and returns SQL NULL for a settled entry — the card must
// NEVER fabricate a review from that (the "unknown"/RM 0.00 shell bug). Until the
// 0016 CoR ships a slim settled payload, the BRIDGE is get_entry_diff (the DiffCard
// precedent — it walks journal_entry_revisions regardless of status): the LAST
// revision's header.status is the DB's word on the terminal state. Once 0016 lands,
// the hydrated payload carries entry.status directly and the bridge never fires —
// resolveReviewHydration branches on the hydrated status first, so this module
// degrades forward automatically. All figures and statuses here are DB-returned;
// nothing is computed client-side.

import { getEntryDiff } from "./reviewApi";
import type { EntryDiff } from "./reviewTypes";
import type { DraftReview } from "../chat/review";

/** The terminal state of a settled entry, as the DB reported it. */
export type SettledState = {
  status: string; // 'approved' | 'withdrawn' | … (DB vocabulary, verbatim)
  at: string | null; // the settling revision's created_at (bridge only)
  actor_kind: string | null; // the settling revision's actor_kind (bridge only)
  reason: string | null; // the settling revision's reason (bridge only)
};

/** How a je_review/doc_review hydration resolved (§6.1):
 *  - draft   — a live draft (or a defensively-degraded payload): render as today.
 *  - settled — a true terminal state, from the hydrated status (future 0016 slim
 *              payload) or the get_entry_diff bridge: render the terminal receipt.
 *  - gone    — hydration returned null AND the bridge yielded nothing: render the
 *              honest "settled — no longer accessible" shell (NEVER a fabricated one). */
export type ReviewResolution =
  | { kind: "draft"; review: DraftReview }
  | { kind: "settled"; review: DraftReview | null; settled: SettledState }
  | { kind: "gone" };

/** A hydrated non-draft status ⇒ settled. The defensive 'unknown' (a key-rename
 *  degradation in toDraftReview, NOT a DB status) is excluded — that payload still
 *  carries real data and must render as today (visible lines, actions disabled),
 *  never a false terminal receipt. */
export function settledFromStatus(status: string): SettledState | null {
  if (status === "draft" || status === "unknown") return null;
  return { status, at: null, actor_kind: null, reason: null };
}

/** Read the terminal state from a revision walk: the LAST revision's header.status.
 *  Returns null when the walk is empty, headerless, or still shows 'draft' (then a
 *  null get_draft_review was a scope/visibility miss, not a settled entry — a
 *  terminal receipt would be a lie). */
export function settledFromDiff(diff: EntryDiff): SettledState | null {
  const last = diff.revisions.length > 0 ? diff.revisions[diff.revisions.length - 1] : undefined;
  const status = last?.header && typeof last.header.status === "string" ? last.header.status : null;
  if (!last || !status || status === "draft") return null;
  return { status, at: last.created_at, actor_kind: last.actor_kind, reason: last.reason };
}

/** The §6.1 bridge: learn a settled entry's terminal state via get_entry_diff (works
 *  on approved entries — the DiffCard precedent). Null on ANY failure — the caller
 *  falls back to the honest shell, never a fabricated one. get_entry_diff requires
 *  p_client (CLR10), so a missing client id short-circuits to null. */
export async function getSettledState(token: string, entryId: string, clientId: string | null | undefined): Promise<SettledState | null> {
  if (!clientId) return null;
  try {
    return settledFromDiff(await getEntryDiff(token, entryId, clientId));
  } catch {
    return null;
  }
}

/** Resolve a hydration outcome (PURE — the async glue lives in the cards):
 *  hydrated draft → draft; hydrated non-draft status (the future 0016 slim settled
 *  payload) → settled DIRECTLY, no bridge; null hydration → the bridge result, or
 *  gone. `bridge` is only consulted when `review` is null. */
export function resolveReviewHydration(review: DraftReview | null, bridge: SettledState | null): ReviewResolution {
  if (review !== null) {
    const settled = settledFromStatus(review.status);
    return settled ? { kind: "settled", review, settled } : { kind: "draft", review };
  }
  return bridge ? { kind: "settled", review: null, settled: bridge } : { kind: "gone" };
}

/** Terminal-receipt wording, keyed on the DB status. 'approved'/'withdrawn' reuse the
 *  in-session receipt copy verbatim; an unforeseen settled status renders honestly
 *  by name rather than being forced into either. */
export function settledReceiptCopy(status: string): string {
  if (status === "approved") return "Approved — the entry is posted with filing-bound provenance.";
  if (status === "withdrawn") return "Draft discarded.";
  return `Settled — ${status}.`;
}

/** The honest shell for a null hydration the bridge could not explain. */
export const SETTLED_GONE_COPY = "Settled — details no longer accessible from chat.";
