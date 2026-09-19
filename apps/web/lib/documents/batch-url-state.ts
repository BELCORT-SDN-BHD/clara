// `?batch=<uuid>` and `?batchFacet=<facet>` — the intake batch's own URL state (#636).
//
// NO NEW ROUTE AND NO NEW NAVIGATION LEAF. The batch is a view OF the Documents surface, on both
// leaves that already exist (`lib/navigation/tree.ts:346` client `documents`, `:227` firm
// `documents`), exactly as `?document=` is. A new file under `app/**` would red the firm-scope
// censuses for no product gain, and a batch is not a fourth entrance — it is a way of looking at
// the sources this tab already shows.
//
// THE IDIOM IS `url-state.ts`'s, DELIBERATELY: opening is a `router.push` so Back closes it, a
// page LOADED directly at `?batch=` has no such history entry to pop and closes with
// `router.replace` instead, and every other query parameter survives both. The value is SHAPE-
// CHECKED before use, for `lib/client-id.ts`'s reason — a malformed id reaching a uuid door is a
// `22P02` that THROWS, so the page renders its error boundary instead of an honest not-found.
//
// THE FACET IS THE SECOND PARAMETER, and it follows `?tab=`'s rule rather than `?document=`'s: a
// hand-edited `?batchFacet=lunch` is not an error state, there is nothing to "not find", and the
// honest answer is to show everything. It is DELETED from the URL for the default rather than
// written as `?batchFacet=all`, so the link for "the batch, as it opens" has one spelling.

import { isUuidShape } from "@/lib/client-id";

/** What `?batch=` currently says, as three distinct answers rather than two.
 *
 *  `"malformed"` is not folded into `null`: a URL carrying `?batch=not-a-uuid` is a person
 *  following a stale or hand-edited link and they are owed the not-found state plus a URL that
 *  stops repeating the lie, whereas no parameter at all is simply "no batch is open". */
export type BatchUrlSelection =
  | { kind: "none" }
  | { kind: "batch"; id: string }
  | { kind: "malformed"; raw: string };

export const BATCH_PARAM = "batch";
export const BATCH_FACET_PARAM = "batchFacet";

export function parseBatchParam(params: Pick<URLSearchParams, "get">): BatchUrlSelection {
  const raw = params.get(BATCH_PARAM);
  if (raw === null || raw.trim().length === 0) return { kind: "none" };
  if (!isUuidShape(raw)) return { kind: "malformed", raw };
  return { kind: "batch", id: raw };
}

/** Folds a batch selection onto existing parameters, leaving every other one untouched and
 *  DELETING the key rather than writing `""` when nothing is selected — so the URL never
 *  accumulates a dead `?batch=` across closes. Returns a NEW instance; the input is not mutated. */
export function applyBatchParam(
  base: Pick<URLSearchParams, "toString">,
  batchId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  if (batchId) next.set(BATCH_PARAM, batchId);
  else {
    next.delete(BATCH_PARAM);
    // A facet without a batch is a filter over nothing. Closing the batch closes its filter too,
    // or a later open would silently inherit the previous batch's view.
    next.delete(BATCH_FACET_PARAM);
  }
  return next;
}

// ---------------------------------------------------------------------------------------------
// The facet filter. FIVE values: "all" plus the FOUR facets a person filters a batch BY. The door
// answers five facets and the card shows all five as labelled counts; `admitted` is deliberately
// not a filter, because "admitted" is every child that reached a Work and filtering to it is the
// same view as "all" minus the members that never got one. The card never invents a grouping the
// door does not answer, and a facet that is empty while others have rows is a NO-RESULTS state
// (the filter is preserved and "Show all" is offered), never an Empty.
// FIX ROUND 1, ADV-636-06: this comment used to say "the door's own five facets plus all", which
// the constant below contradicts.

export const BATCH_FACETS = ["all", "waiting", "failed", "unassigned", "settled"] as const;
export type BatchFacet = (typeof BATCH_FACETS)[number];
export const DEFAULT_BATCH_FACET: BatchFacet = "all";

export function isBatchFacet(value: string | null): value is BatchFacet {
  return (BATCH_FACETS as readonly string[]).includes(value ?? "");
}

export function parseBatchFacetParam(params: Pick<URLSearchParams, "get">): BatchFacet {
  const raw = params.get(BATCH_FACET_PARAM);
  return isBatchFacet(raw) ? raw : DEFAULT_BATCH_FACET;
}

export function applyBatchFacetParam(
  base: Pick<URLSearchParams, "toString">,
  facet: BatchFacet | null,
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  if (facet && facet !== DEFAULT_BATCH_FACET) next.set(BATCH_FACET_PARAM, facet);
  else next.delete(BATCH_FACET_PARAM);
  return next;
}

/** `pathname` + the parameters, with the `?` only when there is something to put after it — a
 *  trailing bare `?` is a different string for the same address and makes a `router.replace` that
 *  should be a no-op into a real history write. */
export function batchUrl(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
