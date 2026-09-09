"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CallerContextRow } from "@/lib/firm/caller-context";
import type { NavigationScope } from "@/lib/firm/navigation";

/**
 * #614 WIDENED THIS VALUE, and only by two fields the layout ALREADY HAS.
 *
 * `requireFirmScope()` returns the whole `caller_context` row; the provider used
 * to narrow it to `{role_rank, is_operator}` on the way in, so the app shell —
 * which must show WHOSE books you are in and in what capacity — had no firm name
 * and no role word to render. The alternative was a second read of a row the
 * layout is already holding, on every page, which is precisely what P4-6's "one
 * request-scoped provider; no child re-reads the session or caller_context merely
 * to shape an affordance" rules out.
 *
 * The two additions are OPTIONAL in the type, and that is deliberate rather than
 * lazy: a rank/operator-shaped fixture is what a dozen existing cells hand this
 * provider to test an affordance's floor, and those cells are testing rank, not
 * identity. Production always passes the full row.
 *
 * STILL NOT A SECURITY BOUNDARY. It carries a row that was positively read
 * upstream; it does not re-read the session or the DB, and route layouts, RLS
 * and the governed doors keep that job.
 */
export type FirmScopeValue = NavigationScope &
  Partial<Pick<CallerContextRow, "firm_name" | "role">>;

const FirmScopeContext = createContext<FirmScopeValue | null>(null);

/**
 * Carries the ONE positively-read `FirmScope` from the firm layout to client
 * affordances. It does not re-read the session or the DB, and it is never a
 * security boundary: route layouts, RLS and governed doors keep that job.
 */
export function FirmScopeProvider({
  scope,
  children,
}: {
  scope: FirmScopeValue;
  children: ReactNode;
}) {
  return <FirmScopeContext.Provider value={scope}>{children}</FirmScopeContext.Provider>;
}

export function useFirmScope(): FirmScopeValue {
  const scope = useContext(FirmScopeContext);
  if (scope === null) {
    throw new Error("useFirmScope must be rendered under FirmScopeProvider");
  }
  return scope;
}
