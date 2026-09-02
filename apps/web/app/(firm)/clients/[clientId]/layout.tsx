import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ClientScopeProvider } from "@/components/client-scope-provider";
import { ClientWorkspaceNav } from "@/components/client-workspace-nav";
import { loadClientById } from "@/lib/firm/reads";
import { fixedTokenAccessor, resolveServerSession } from "@/lib/supabase/server-session";

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
  const caller = await resolveServerSession();
  if (caller === null) notFound();
  const client = await loadClientById(fixedTokenAccessor(caller.accessToken), clientId);
  if (client === null) notFound();
  const t = await getTranslations("ClientWorkspace");

  return (
    <div className="flex min-h-dvh flex-col">
      {/*
        The mirror half of the same token-role fix: this tab strip is NAV
        chrome, so it carries `--shell` — it was wearing `--surface`, the
        content-card role, while the content column below it wore `--shell`.
        The two roles were exactly inverted.
      */}
      <header className="flex flex-col gap-2 border-b border-border bg-shell px-8 py-3">
        <p className="text-sm font-semibold text-foreground">
          {t("clientHeader", { clientName: client.name })}
        </p>
        <ClientWorkspaceNav clientId={clientId} />
      </header>
      <ClientScopeProvider clientId={clientId}>
        <div className="flex-1">{children}</div>
      </ClientScopeProvider>
    </div>
  );
}
