// #655 — THE TRADE-INVOICE READ.
//
// IT IS AN RPC, not a filtered GET, and the reason is the whole point of AC5. The answer joins
// `clara.trade_invoices` to its resolved counterparty identity, to its `posted` status row, to the
// entry that row names, to the `clara.open_items` row the birth trigger minted for it and to that
// item's LIVE outstanding — five relations and one derivation. A PostgREST filter chain would
// either re-derive the outstanding in the browser (a second answer to what a settlement discharges)
// or get the joins subtly wrong. `clara.get_trade_invoice` (migration 0225) is viewer-floored and
// firm-scoped in ONE place, so the browser is never trusted with any of it.
//
// HYDRATE-NEVER-TRUST, as everywhere: this returns only what the database SAID. Nothing here
// re-derives a state from a row's shape, and a malformed envelope THROWS rather than resolving to
// null — null is a real answer ("this Work is not a trade invoice"), and coercing a wire fault into
// it would turn "we could not read it" into an accounting claim. Callers render their own
// read-error state.

import { callDoor } from "@/lib/doors";
import { isUuidShape } from "@/lib/client-id";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/**
 * One trade invoice, as `clara.get_trade_invoice` answers it.
 *
 * `entry_id`, `receipt_id`, `open_item_id`, `open_item_amount_cents` and `outstanding_cents` are
 * DERIVED and are null until the run posts — the row is durable at ADMISSION, which is why `state`
 * can read `admitted` with everything below it absent, and why the surface must render that as a
 * real state rather than as missing data.
 */
export type TradeInvoiceRead = {
  invoice_id: string;
  work_id: string;
  kind: "sales_invoice" | "supplier_bill" | string;
  domain: "ar" | "ap" | string;
  counterparty_id: string;
  counterparty_name: string | null;
  counterparty_kind: string | null;
  counterparty_registration_no: string | null;
  document_date: string | null;
  due_date: string | null;
  due_date_source: "stated" | "counterparty_terms" | "absent" | string;
  reference: string | null;
  currency: string;
  total_cents: number;
  tax_facts: Record<string, unknown> | null;
  source_document_id: string | null;
  recorded_by: string | null;
  created_at: string | null;
  state: "admitted" | "posted" | "refused" | string;
  entry_id: string | null;
  receipt_id: string | null;
  open_item_id: string | null;
  open_item_amount_cents: number | null;
  open_item_due_date: string | null;
  outstanding_cents: number | null;
};

/** The trade invoice this Work carries, or null when it carries none. */
export async function getTradeInvoice(
  workId: string,
  opts: Opts = {},
): Promise<TradeInvoiceRead | null> {
  if (!isUuidShape(workId)) return null;
  const out = await callDoor<unknown>("get_trade_invoice", { p_work: workId }, opts);
  if (out === null || out === undefined) return null;
  if (typeof out !== "object" || Array.isArray(out)) {
    throw new Error("get_trade_invoice did not answer with an object");
  }
  return out as TradeInvoiceRead;
}
