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
/**
 * #623 WIDENED IT AGAIN, by the same two-field rule and for a measurable reason.
 *
 * The journal composer preserves an unsent draft under `sessionStorage`, and the
 * refresh contract (§3, "Draft across local view changes") requires that key to
 * be scoped to the USER, the FIRM and the CLIENT — "scope change never transfers
 * a draft into a different client", and a shared browser must not hand one
 * member's half-typed entry to the next. `user_id` and `firm_id` are the first
 * two thirds of that key, they are NOT NULL columns of the row this provider is
 * already holding (`clara.caller_context`, 0141:544), and the alternative was a
 * second `caller_context` read on the composer route — precisely what P4-6's "no
 * child re-reads the session or caller_context merely to shape an affordance"
 * rules out.
 *
 * STILL OPTIONAL IN THE TYPE, for the same reason the first two additions are: a
 * rank-shaped fixture is what a dozen cells hand this provider, and those cells
 * are testing rank, not identity. Production always passes the full row. A
 * consumer that cannot read both fields does NOT fall back to a partial key — it
 * declines to persist at all (lib/work/journal-draft.ts), because a draft filed
 * under a guessed scope is worse than a draft that was never saved.
 */
export type FirmScopeValue = NavigationScope &
  Partial<Pick<CallerContextRow, "firm_name" | "role" | "firm_id" | "user_id">>;

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

/**
 * #630 — THE SAME SCOPE, FOR A COMPONENT THAT MAY BE MOUNTED OUTSIDE THE PROVIDER.
 *
 * The Clara transcript's part cards render under the rail (which IS inside the firm layout) AND in
 * node cells that mount one card on its own. `useFirmScope` throwing is right for a page that
 * cannot work without a firm; a part card that needs the reader's RANK only to decide whether to
 * OFFER a destructive control must degrade to "do not offer" rather than take the transcript down
 * with it. Absent context is therefore null, and the caller's floor check fails closed.
 */
export function useFirmScopeOrNull(): FirmScopeValue | null {
  return useContext(FirmScopeContext);
}
