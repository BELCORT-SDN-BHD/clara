"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { NavigationScope } from "@/lib/firm/navigation";

const FirmScopeContext = createContext<NavigationScope | null>(null);

/**
 * Carries the ONE positively-read `FirmScope` from the firm layout to client
 * affordances. It does not re-read the session or the DB, and it is never a
 * security boundary: route layouts, RLS and governed doors keep that job.
 */
export function FirmScopeProvider({
  scope,
  children,
}: {
  scope: NavigationScope;
  children: ReactNode;
}) {
  return <FirmScopeContext.Provider value={scope}>{children}</FirmScopeContext.Provider>;
}

export function useFirmScope(): NavigationScope {
  const scope = useContext(FirmScopeContext);
  if (scope === null) {
    throw new Error("useFirmScope must be rendered under FirmScopeProvider");
  }
  return scope;
}
