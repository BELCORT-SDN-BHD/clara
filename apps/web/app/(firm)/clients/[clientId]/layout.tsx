import type { ReactNode } from "react";

import { ClientScopeProvider } from "@/components/client-scope-provider";
import { ClientWorkspaceNav } from "@/components/client-workspace-nav";

/**
 * The client-workspace altitude — ONE workspace, accounting objects as tabs
 * (owner ruling Q3): journals · documents · bank · close · reports ·
 * registers · knowledge, plus this level's own "Home".
 *
 * Everything below `<ClientScopeProvider>` is keyed on `clientId` and gets
 * fully unmounted/remounted on a client switch — see
 * components/client-scope-provider.tsx and lib/client-scope.ts for why that
 * is a security mechanism here, not a performance nicety.
 */
export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface px-8 py-3">
        <ClientWorkspaceNav clientId={clientId} />
      </header>
      <ClientScopeProvider clientId={clientId}>
        <div className="flex-1">{children}</div>
      </ClientScopeProvider>
    </div>
  );
}
