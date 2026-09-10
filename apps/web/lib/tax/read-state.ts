// The five/six-state read model ticket #627 asks every tax/compliance surface to expose
// honestly, reduced to one pure classifier so a unit cell can pin the mapping without
// mounting a component. This module adds NO new read and NO new SQL function — it only
// names the outcome an EXISTING read (`loadClientSstWatch`, `loadComplianceRegister`)
// already produces, using the SAME typed error kinds `components/firm/data-state.tsx`'s
// `ErrorMessage` already classifies by (`isDoorRefusal` / `isReadError` / `isDoorError`,
// never message text — AGENTS.md's "spelling is not identity").
//
// "not_enabled" is DELIBERATELY not a member of this union. No fetch is ever attempted
// for a capability this ticket's own inventory found the database does not expose to a
// human session (the SST rate/threshold schedule, the income-tax computation, any
// statutory-filing object) — a caller names that state directly, at the call site that
// never reads at all (see components/tax/tax-status.tsx's `TaxNotEnabledNote`). Folding
// it into this function would invent a read outcome for a read that never runs.

import { isDoorError, isDoorRefusal } from "../doors";
import { isReadError } from "../read";

export type TaxReadOutcome = "loading" | "denied" | "error" | "empty" | "ok";

/**
 * Precedence matches `components/firm/data-state.tsx`'s `DataState` exactly (error, then
 * loading, then empty, then the real content) — REUSED, not re-derived, because
 * `lib/firm/use-async-read.ts`'s sticky-refusal reload can hold both a standing `error`
 * and a transient `loading=true` at once (a failed `act()` immediately re-reads), and the
 * error must keep winning so a refusal never flashes back to a bare loading sentence.
 */
export function classifyTaxReadOutcome(args: { loading: boolean; error: unknown; isEmpty: boolean }): TaxReadOutcome {
  const { error } = args;
  if (error) {
    // A governed refusal is a real business/system answer, never a quiet denial — it
    // renders with its own code and message like any other operational failure, so it
    // is folded into "error" here exactly as ErrorMessage folds it (a raw StateBanner
    // tone="error"), never mistaken for the softer "denied" (forbidden/no_session) case.
    if (isDoorRefusal(error)) return "error";
    if (isReadError(error) || isDoorError(error)) {
      return error.kind === "forbidden" || error.kind === "no_session" ? "denied" : "error";
    }
    return "error";
  }
  if (args.loading) return "loading";
  return args.isEmpty ? "empty" : "ok";
}
