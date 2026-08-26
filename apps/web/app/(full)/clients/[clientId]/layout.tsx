import type { ReactNode } from "react";

import { ClientScopeProvider } from "@/components/client-scope-provider";

/**
 * The (full) group's client-scope layout — carries over ONLY the security
 * mechanism from `app/(firm)/clients/[clientId]/layout.tsx`
 * (`<ClientScopeProvider>` — owner ruling Q3 / cross-model security review
 * finding 8: a client switch is a SECURITY EVENT, keyed unmount/remount +
 * the synchronous-during-render `activateScope` epoch guard; see that
 * component's own header for the full account), with NONE of the `(firm)`
 * variant's visual chrome (`ClientWorkspaceNav`, the header bar — this group
 * exists precisely so the escalated Clara thread can own the full viewport,
 * P2 fold round 3).
 *
 * The escalated thread still reads/writes THAT client's data the same as any
 * other client-scoped surface, so it must sit under this exact same
 * activation — moving the page out of `(firm)` must never mean moving it out
 * from under scope activation too. Every route under `/clients/[clientId]/`,
 * in EITHER group, sits under a layout that calls this.
 */
export default async function FullClientScopeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  return <ClientScopeProvider clientId={clientId}>{children}</ClientScopeProvider>;
}
