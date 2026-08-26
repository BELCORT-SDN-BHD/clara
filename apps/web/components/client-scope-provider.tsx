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
 * closed by lib/client-scope.ts's generation guard. A data-fetching hook
 * inside this subtree needs both: this component to guarantee it starts
 * from nothing, and the scope guard to make sure a late response from the
 * PREVIOUS client never gets committed to the fresh mount either.
 *
 * `display: contents` (the `contents` class) keeps this wrapper out of the
 * box model — it must not introduce a layout box between the client
 * workspace layout's flex/grid chrome and the tab content it wraps.
 */
import type { ReactNode } from "react";

export function ClientScopeProvider({
  clientId,
  children,
}: {
  clientId: string;
  children: ReactNode;
}) {
  return (
    <div key={clientId} data-client-scope={clientId} className="contents">
      {children}
    </div>
  );
}
