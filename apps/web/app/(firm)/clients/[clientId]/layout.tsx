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
      {/*
        CB-AE2E-019 — two edits here, both from the audit's own reading.

        (1) THE CLIENT NAME IS NOW AN `<h1>`, not a `<p>`. It always WAS the
        heading of everything below it; it was marked up as a paragraph, so the
        client-workspace altitude had no level-1 heading at all and a screen
        reader's heading list skipped straight from the page's own `PageShell`
        title to the section headings. That is survivable at 1280px where the
        sidebar and the tab strip are both visible landmarks; at 640 CSS px,
        where the sidebar is a drawer and the tab strip is a scrolling row, the
        heading is the only remaining "which client am I in" anchor. It keeps
        `text-sm font-semibold` — a heading LEVEL is a structural claim, not a
        type-scale one, and this line is deliberately quieter than the workbench
        title beneath it.

        (2) `px-8` -> `px-4 lg:px-8`. 64px of horizontal padding is a fifth of a
        320px viewport, and this header sits above every client surface.
      */}
      <header className="flex flex-col gap-2 border-b border-border bg-shell px-4 py-3 lg:px-8">
        <h1 className="text-sm font-semibold text-foreground">
          {t("clientHeader", { clientName: client.name })}
        </h1>
        <ClientWorkspaceNav clientId={clientId} />
      </header>
      <ClientScopeProvider clientId={clientId}>
        <div className="flex-1">{children}</div>
      </ClientScopeProvider>
    </div>
  );
}
