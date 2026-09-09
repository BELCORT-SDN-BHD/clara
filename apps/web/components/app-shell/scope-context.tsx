"use client";

import * as React from "react";
import { useParams } from "next/navigation";

/**
 * HOW THE CLIENT'S NAME REACHES THE SHELL — and why it is a store rather than a
 * React context.
 *
 * THE SHAPE OF THE PROBLEM. `app/(firm)/layout.tsx` renders the sidebar and the
 * breadcrumb. `app/(firm)/clients/[clientId]/layout.tsx` is the layout that
 * READS the client (`loadClientById`, RLS-scoped, the DB owning identity), and
 * it nests INSIDE the firm layout. React context flows down, never up, so the
 * client layout cannot hand its name to a component rendered above it. Neither
 * can the firm layout read it for itself: a layout receives only the params of
 * its OWN segment, and `clientId` belongs to a segment two levels deeper.
 *
 * WHAT THIS IS. A module-level value plus `useSyncExternalStore` — the same
 * mechanism `lib/clara/threadStore.ts` already uses in this app for state that
 * has to cross a subtree boundary. The client layout PUBLISHES `{id, name}` on
 * mount and CLEARS it on unmount; the sidebar and the breadcrumb subscribe.
 *
 * THE SAFETY RULE, AND IT IS THE WHOLE POINT: a consumer only uses the stored
 * name when the stored `id` matches the clientId in the URL RIGHT NOW. Otherwise
 * it falls back to the neutral placeholder (`t("scope.clientPlaceholder")`),
 * never a guessed name. That is what makes a stale store harmless rather than a
 * cross-client identity leak — during the frame between navigating from client A
 * to client B and B's layout publishing, the shell shows the placeholder, never
 * A's name. `components/client-scope-provider.tsx` says why that distinction
 * is a security property here and not a nicety.
 *
 * PUBLISHED FROM A LAYOUT EFFECT, not during render: the subscriber is an
 * ANCESTOR, and notifying it during a descendant's render is React's own
 * "cannot update a component while rendering a different component" error. A
 * layout effect commits before the browser paints, so an in-app navigation
 * shows the name in the first painted frame. A HARD load does not: the server
 * has no store, so the server-rendered HTML carries the neutral placeholder and
 * the name replaces it on hydration. Stated rather than hidden — a placeholder
 * is honest, and a guessed name would not be.
 */

export type ClientIdentity = { readonly id: string; readonly name: string };

let published: ClientIdentity | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function getSnapshot(): ClientIdentity | null {
  return published;
}

/** The server has no store — every render there starts from nothing. */
function getServerSnapshot(): ClientIdentity | null {
  return null;
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Mounted by `app/(firm)/clients/[clientId]/layout.tsx`, inside
 * `ClientScopeProvider`. Renders nothing.
 */
export function ClientIdentityPublisher({ id, name }: ClientIdentity) {
  useIsomorphicLayoutEffect(() => {
    published = { id, name };
    notify();
    return () => {
      // Only clear what THIS mount published. Two client layouts never overlap
      // in practice, but a cleanup that cleared unconditionally would wipe the
      // incoming client's identity during a switch.
      if (published?.id === id) {
        published = null;
        notify();
      }
    };
  }, [id, name]);
  return null;
}

/**
 * The client the URL is currently on, with its name IF the published identity is
 * for that same client. `name` is null until the client layout below has
 * published — never another client's name, and never a guess.
 */
export function useClientIdentity(): { id: string | null; name: string | null } {
  const params = useParams();
  const raw = params?.clientId;
  const id = typeof raw === "string" ? raw : null;
  const stored = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { id, name: stored !== null && stored.id === id ? stored.name : null };
}

/** TEST-ONLY. The store is module state by design (one shell per document), so a
 *  cell cannot get a fresh instance any other way. */
export function resetClientIdentityForTests(): void {
  published = null;
  notify();
}

/** TEST-ONLY. Publishes without mounting the layout that normally would. */
export function publishClientIdentityForTests(value: ClientIdentity | null): void {
  published = value;
  notify();
}
