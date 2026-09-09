import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { ClientIdentityPublisher } from "@/components/app-shell/scope-context";
import { ClientScopeProvider } from "@/components/client-scope-provider";
import { loadClientById } from "@/lib/firm/reads";
import { fixedTokenAccessor, resolveServerSession } from "@/lib/supabase/server-session";

/**
 * The client-workspace altitude.
 *
 * #614 — THIS LAYOUT RENDERS NO CHROME. It used to own two things: an `<h1>`
 * reading "Client: <name>" and a horizontal nine-tab strip
 * (`components/client-workspace-nav.tsx`). Both are gone, and where they went is
 * the point rather than a deletion:
 *
 *   · IDENTITY moved UP, into the shell. The client's name is the label on the
 *     sidebar's first group, the current scope on the switcher, and a crumb in
 *     the breadcrumb — three places a human is already looking, at every width,
 *     instead of one line that scrolled away with the page.
 *   · The TAB STRIP became the sidebar's client group, over the one registry
 *     (`lib/navigation/tree.ts`). Nine controls in a row that wrapped to four
 *     lines at 640 CSS px are now a column that has room for them, with the
 *     eight accounting surfaces behind a collapsible rather than flattened
 *     alongside Documents and Reports.
 *
 * WHAT THAT BUYS, measured against the pin it replaces: `components/
 * shell-responsive.test.tsx` used to pin TWO `<h1>`s on every client route — this
 * layout's identity heading and `PageShell`'s own — and the old header carried a
 * long note on why neither alternative was cheaper than living with it. There is
 * now exactly ONE: the page's. The a11y question that note could not resolve is
 * resolved by removing the second heading rather than by ranking it.
 *
 * WHAT IS UNCHANGED, and must stay so: everything below `<ClientScopeProvider>`
 * is keyed on `clientId` and gets fully unmounted/remounted on a client switch —
 * see components/client-scope-provider.tsx and lib/client-scope.ts for why that
 * is a security mechanism here, not a performance nicety.
 *
 * HOW THE NAME REACHES THE SHELL. `ClientIdentityPublisher` publishes `{id,
 * name}` into a module-level store the sidebar and breadcrumb subscribe to.
 * React context flows down, never up, and the components that need this name are
 * rendered by the layout ABOVE this one — see
 * components/app-shell/scope-context.tsx for the mechanism and, more
 * importantly, for the rule that keeps a stale store from ever showing one
 * client's name over another client's page.
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

  return (
    <ClientScopeProvider clientId={clientId}>
      <ClientIdentityPublisher id={clientId} name={client.name} />
      {children}
    </ClientScopeProvider>
  );
}
