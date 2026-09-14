// #643 — THE PERIODIC-ADJUSTMENT HISTORY READ.
//
// IT IS AN RPC, unlike `lib/work/reads.ts`'s plain filtered GETs, and the reason is the same one
// that module gives for NOT introducing one: the authority story has to be whole. This history
// joins `clara.periodic_adjustments` to `clara.journal_entries` (for the posted entry's live state
// and its reversal), applies a period window, and caps its own answer — three things a PostgREST
// filter chain would either re-derive in the browser or get subtly wrong. `clara.list_periodic_
// adjustments` (migration 0194) is viewer-floored, firm+client-scoped and capped at 500 in ONE
// place, so the browser never has to be trusted with any of it.
//
// HYDRATE-NEVER-TRUST, as everywhere: this returns only what the database SAID. Nothing here
// re-derives a state from a row's shape, and a malformed envelope THROWS rather than resolving to
// `[]` — an empty array is a real answer ("this client has recorded none"), and coercing a wire
// fault into it would turn "we could not read it" into an accounting claim. The callers render
// their own read-error state.

import { callDoor } from "@/lib/doors";
import { isUuidShape } from "@/lib/client-id";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** One row of `clara.list_periodic_adjustments` — copied field-for-field from the function's own
 *  `row_to_json` projection. Every value is the database's; nothing is derived here. */
export type PeriodicAdjustmentRow = {
  id: string;
  work_id: string;
  logical_op_id: string;
  purpose: "periodic_stock_adjustment" | "payroll_obligation";
  period_start: string;
  period_end: string;
  /** The canonical typed particulars, exactly as the commit stored them. */
  basis: Record<string, unknown>;
  /** SIGNED for a stock movement; positive for a payroll obligation. Exact minor units. */
  amount_cents: number;
  currency: string;
  entry_id: string;
  entry_status: string;
  posting_date: string;
  /** Non-null once the posted entry has been reversed — which is what makes a correction lawful. */
  reversed_by: string | null;
  receipt_id: string;
  source_document_id: string | null;
  corrects_adjustment_id: string | null;
  corrected_by_adjustment_id: string | null;
  recorded_by: string;
  on_behalf_of: string;
  created_at: string;
};

/** Every periodic adjustment this client has recorded, newest period first. The window is the
 *  DATABASE's filter, not a client-side slice: a row outside it is never sent. */
export async function listPeriodicAdjustments(
  clientId: string,
  window: { from?: string | null; to?: string | null } = {},
  opts: Opts = {},
): Promise<PeriodicAdjustmentRow[]> {
  // A malformed id never reaches PostgREST — on a `uuid` argument it is HTTP 400 `22P02`, which
  // THROWS, and a throw on a route reaches the error boundary instead of the scoped not-found
  // state the page owns (lib/work/reads.ts states the same guard for the same defect).
  if (!isUuidShape(clientId)) return [];
  const out = await callDoor<unknown>(
    "list_periodic_adjustments",
    { p_client: clientId, p_from: window.from ?? null, p_to: window.to ?? null },
    opts,
  );
  if (!Array.isArray(out)) {
    throw new Error("list_periodic_adjustments did not answer with an array of rows");
  }
  return out as PeriodicAdjustmentRow[];
}
