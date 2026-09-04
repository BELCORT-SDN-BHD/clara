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

        (1) THE CLIENT NAME IS A REAL HEADING, not a `<p>`. The audit's complaint
        was precise: "the client's identity is a non-heading paragraph", so it did
        not appear in a screen reader's heading list at all. That is survivable at
        1280px where the sidebar and the tab strip are both visible landmarks; at
        640 CSS px, where the sidebar is a drawer and the tab strip is a scrolling
        row, this line is the only remaining "which client am I in" anchor.

        A CORRECTION, AND THE TRADE-OFF IT RESTS ON. This comment first claimed
        "the client-workspace altitude had no level-1 heading at all". That was
        FALSE, and the review caught it: `components/common/page-shell.tsx:54`'s
        `PageHeader` renders an `<h1>` on every route-level surface, this
        altitude's pages included. So a client route carries TWO h1s — the
        workspace identity here, and the surface's own title below it.

        That is deliberate, and the two alternatives were measured before it was
        settled. Making THIS heading an `<h2>` reds the repo's own heading-order
        rule (`test/a11yRules.ts:547` starts `runningMax` at 0, so a leading h2
        "jumps from h0 to h2") — it is first in the DOM, so it cannot be a level
        below something that has not appeared yet. Making the SURFACE title an h2
        instead needs a `level` prop threaded through `PageHeader`, which is either
        26 files across four other lanes' surfaces or a React context — and a
        context needs a hook, which would break the contract page-shell.tsx:19-20
        states in its own words ("Nothing here holds a hook, so a Server Component
        page and a Client Component workbench can both render it").

        Two h1s is valid HTML5, violates no rule this repo or axe enforces at
        WCAG A/AA, and reads as what it is: you are in this client, looking at this
        surface. `components/shell-responsive.test.tsx` PINS the count and the
        clean heading order, so the disposition is mechanical rather than a comment
        — and a third h1, or a reordering that breaks the outline, reds.

        It keeps `text-sm font-semibold`: a heading LEVEL is a structural claim,
        not a type-scale one, and this line is deliberately quieter than the
        workbench title beneath it.

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
