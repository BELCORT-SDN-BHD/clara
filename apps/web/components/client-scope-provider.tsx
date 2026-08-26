"use client";

/**
 * ClientScopeProvider — the unmount-and-remount half of "client switch is a
 * SECURITY EVENT" (owner ruling Q3,
 * docs/plan/active/mohe-grill-rulings-2026-08-27.md; see also
 * lib/client-scope.ts for the in-flight-request half of the same law).
 *
 * Everything under `app/(firm)/clients/[clientId]/` belongs to exactly ONE
 * client. Component state, closures held by a hook, an open Clara-rail
 * thread — none of it may survive a `clientId` change, because a stale
 * closure painting client A's figures into client B's screen is a
 * cross-client data leak, not a bug of the ordinary kind. Rather than
 * auditing every present and future component in that subtree for a
 * `clientId` dependency it might forget, this component keys the ENTIRE
 * subtree on `clientId`. Changing a React `key` is React's own instruction
 * to discard the old element tree — running every unmount effect — and
 * mount a fresh one: no descendant can retain state across the switch even
 * if it tries to.
 *
 * This clears MOUNTED state only. It does not — cannot — cancel a network
 * request that was already in flight when the switch happened; that race is
 * closed by lib/client-scope.ts's epoch guard. A data-fetching hook
 * inside this subtree needs both: this component to guarantee it starts
 * from nothing, and the scope guard to make sure a late response from the
 * PREVIOUS client never gets committed to the fresh mount either.
 *
 * THIS COMPONENT IS THE NAVIGATION BOUNDARY (cross-model security review
 * 2026-08-27, finding 8). `activateScope(clientId)` is called SYNCHRONOUSLY
 * DURING RENDER — not in an effect — because effects run after commit, and a
 * descendant that starts a request during its own render would otherwise do
 * so under the PREVIOUS client's epoch. That ordering is the whole point: the
 * epoch must already have advanced before anything in the new subtree can
 * start a request.
 *
 * A side effect during render is normally discouraged; here it is safe in
 * both directions React can surprise us:
 *   - `activateScope` is idempotent for the client already active, so
 *     StrictMode's double render and any re-render are no-ops.
 *   - a concurrent render that React later THROWS AWAY would still have
 *     advanced the epoch, which only aborts and stales in-flight requests.
 *     A false "stale" drops a response; a false "fresh" paints another
 *     client's numbers on screen. Only the first of those is survivable, and
 *     it is the one this can produce.
 * It is a no-op during SSR (lib/client-scope.ts) — module state on the
 * server is shared across requests and must never be mutated per render.
 *
 * `display: contents` (the `contents` class) keeps this wrapper out of the
 * box model — it must not introduce a layout box between the client
 * workspace layout's flex/grid chrome and the tab content it wraps.
 */
import type { ReactNode } from "react";

import { activateScope } from "@/lib/client-scope";

export function ClientScopeProvider({
  clientId,
  children,
}: {
  clientId: string;
  children: ReactNode;
}) {
  activateScope(clientId);

  return (
    <div key={clientId} data-client-scope={clientId} className="contents">
      {children}
    </div>
  );
}
